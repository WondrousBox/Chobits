import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electronState = {
  userDataDir: '',
  windows: [] as Array<any>
};

const notifySpriteCapabilityChangedMock = vi.fn();
const scheduleJobMock = vi.hoisted(() => vi.fn());
const sendAppNoticeMock = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  app: {
    getPath: () => electronState.userDataDir
  },
  BrowserWindow: {
    getAllWindows: () => electronState.windows
  },
  powerMonitor: {
    on: vi.fn(),
    off: vi.fn(),
    getSystemIdleTime: vi.fn(() => 0)
  }
}));

vi.mock('node-schedule', () => ({
  default: {
    scheduleJob: scheduleJobMock
  }
}));

vi.mock('../../packages/event', () => ({
  sendAppNotice: sendAppNoticeMock
}));

vi.mock('../../packages/sprite-core/handler/capability-events', () => ({
  notifySpriteCapabilityChanged: notifySpriteCapabilityChangedMock
}));

describe('daily care service broadcasts', () => {
  let dataDir = '';
  let sent: Array<{ channel: string; payload: unknown }> = [];

  beforeEach(async () => {
    vi.resetModules();
    notifySpriteCapabilityChangedMock.mockReset();
    scheduleJobMock.mockReset();
    sendAppNoticeMock.mockReset();
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'daily-care-service-'));
    electronState.userDataDir = dataDir;
    sent = [];
    electronState.windows = [
      {
        isDestroyed: () => false,
        webContents: {
          send: (channel: string, payload: unknown) => {
            sent.push({ channel, payload });
          }
        }
      }
    ];
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('broadcasts snapshot and capability changes when the global enabled flag changes', async () => {
    const { DailyCareService } = await import('../../electron/main/daily/service');
    const { DAILY_CARE_SNAPSHOT_UPDATED_CHANNEL } = await import('../../electron/main/daily/types');
    const service = new DailyCareService(() => null);

    const snapshot = service.updateSettings({ enabled: false });

    expect(snapshot.enabled).toBe(false);
    expect(sent).toContainEqual({
      channel: DAILY_CARE_SNAPSHOT_UPDATED_CHANNEL,
      payload: expect.objectContaining({
        enabled: false
      })
    });
    expect(notifySpriteCapabilityChangedMock).toHaveBeenCalledWith({ source: 'dailyCare.settings' });
  });

  it('broadcasts snapshot updates for reminder edits without emitting capability changes', async () => {
    const { DailyCareService } = await import('../../electron/main/daily/service');
    const { DAILY_CARE_SNAPSHOT_UPDATED_CHANNEL } = await import('../../electron/main/daily/types');
    const service = new DailyCareService(() => null);

    const result = service.upsertCustomReminder({
      title: 'Team Sync',
      kind: 'meeting',
      date: '2026-04-22',
      time: '09:00',
      repeat: 'none',
      leadMinutes: 15,
      enabled: true
    });

    expect(result.snapshot.customReminders).toHaveLength(1);
    expect(sent).toContainEqual({
      channel: DAILY_CARE_SNAPSHOT_UPDATED_CHANNEL,
      payload: expect.objectContaining({
        customReminders: expect.arrayContaining([
          expect.objectContaining({
            title: 'Team Sync'
          })
        ])
      })
    });
    expect(notifySpriteCapabilityChangedMock).not.toHaveBeenCalled();
  });

  it('emits routine dispatch events for sprite purpose bridging', async () => {
    const { DailyCareService } = await import('../../electron/main/daily/service');
    const service = new DailyCareService(() => null);
    const dispatched: Array<any> = [];
    const cleanup = service.onRoutineDispatched((event) => {
      dispatched.push(event);
    });

    expect(service.triggerRoutineById('care:hydration-hourly')).toEqual({ ok: true });

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({
      routine: expect.objectContaining({
        id: 'care:hydration-hourly',
        kind: 'hydration',
        severity: 'gentle'
      }),
      manual: true,
      message: expect.any(String),
      triggeredAt: expect.any(Number)
    });

    cleanup();
    service.triggerRoutineById('care:hydration-hourly');
    expect(dispatched).toHaveLength(1);
  });

  it('dispatches routine notices through the sprite message channel when available', async () => {
    const { DailyCareService } = await import('../../electron/main/daily/service');
    const showNotice = vi.fn();
    const service = new DailyCareService(() => null, () => ({ showNotice }));

    expect(service.triggerRoutineById('care:night-guardian')).toEqual({ ok: true });

    expect(showNotice).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        level: 'warning',
        persistent: true,
        routineId: 'care:night-guardian',
        duration: 0,
        speak: false,
        buttons: expect.arrayContaining([
          expect.objectContaining({ id: 'know', action: 'dismiss' }),
          expect.objectContaining({ id: 'snooze', action: 'snooze' })
        ])
      })
    );
    expect(sendAppNoticeMock).not.toHaveBeenCalled();
  });

  it('gates automatic routine dispatches without blocking manual triggers', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 5, 9, 15, 0));
    const dayjs = (await import('dayjs')).default;
    const { DailyCareService } = await import('../../electron/main/daily/service');
    const service = new DailyCareService(() => null, {
      scheduler: null,
      autoDispatchGate: () => ({ accepted: false, reason: 'onboarding-workspace-required' })
    });
    const runtime = (service as any).routines.find((candidate: any) => candidate.definition.id === 'care:morning-brief');
    const dispatched: Array<any> = [];
    service.onRoutineDispatched((event) => dispatched.push(event));

    expect((service as any).createDispatchPlan(runtime, dayjs('2026-05-05T09:15:00+08:00'), 0)).toEqual({
      skipReason: 'onboarding-workspace-required'
    });
    expect(service.triggerRoutineById('care:morning-brief')).toEqual({ ok: true });

    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toMatchObject({
      routine: expect.objectContaining({ id: 'care:morning-brief' }),
      manual: true
    });
  });

  it('uses real minutes for interval routine scheduling', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-05T09:00:00+08:00'));

    const dayjs = (await import('dayjs')).default;
    const { DailyCareService } = await import('../../electron/main/daily/service');
    const service = new DailyCareService(() => null);
    const runtime = (service as any).routines.find((candidate: any) => candidate.definition.id === 'care:stretch-standing');

    expect(runtime).toBeTruthy();
    expect((service as any).shouldTrigger(runtime, dayjs('2026-05-05T09:44:59+08:00'))).toEqual({ skipReason: 'interval-not-elapsed' });
    expect((service as any).shouldTrigger(runtime, dayjs('2026-05-05T10:29:59+08:00'))).toEqual({ skipReason: 'interval-not-elapsed' });
    expect((service as any).shouldTrigger(runtime, dayjs('2026-05-05T10:30:00+08:00'))).toEqual({ meta: {} });
  });

  it('registers routines with the main scheduler instead of owning a global interval', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 5, 9, 1, 0));
    scheduleJobMock.mockReturnValue({
      cancel: vi.fn(),
      nextInvocation: () => new Date(2026, 4, 5, 9, 15, 0)
    });
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
    const { DailyCareService } = await import('../../electron/main/daily/service');
    const { MainSchedulerService } = await import('../../electron/main/scheduler');
    const scheduler = new MainSchedulerService({
      stateStore: {
        load: () => ({}),
        save: vi.fn()
      }
    });
    const service = new DailyCareService(() => null, { scheduler });

    service.start();

    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(scheduler.listJobs()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          definition: expect.objectContaining({
            id: 'dailyCare:care:hydration-hourly:interval',
            owner: 'dailyCare',
            schedule: { kind: 'interval', everyMs: 60_000 }
          })
        }),
        expect.objectContaining({
          definition: expect.objectContaining({
            id: 'dailyCare:care:morning-brief:fixed:09-15',
            owner: 'dailyCare',
            schedule: { kind: 'cron', expression: '15 9 * * *' }
          })
        })
      ])
    );

    service.stop();
    setIntervalSpy.mockRestore();
  });

  it('dispatches fixed routines through the scheduler callback', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 5, 9, 14, 0));
    const callbacks = new Map<string, (fireDate: Date) => Promise<void>>();
    scheduleJobMock.mockImplementation((spec, callback) => {
      callbacks.set(String(spec), callback);
      return {
        cancel: vi.fn(),
        nextInvocation: () => new Date(2026, 4, 5, 9, 15, 0)
      };
    });
    const { DailyCareService } = await import('../../electron/main/daily/service');
    const { MainSchedulerService } = await import('../../electron/main/scheduler');
    const scheduler = new MainSchedulerService({
      stateStore: {
        load: () => ({}),
        save: vi.fn()
      }
    });
    const service = new DailyCareService(() => null, { scheduler });

    service.start();
    sendAppNoticeMock.mockClear();
    vi.setSystemTime(new Date(2026, 4, 5, 9, 15, 0));
    await callbacks.get('15 9 * * *')?.(new Date(2026, 4, 5, 9, 15, 0));

    expect(sendAppNoticeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        routineId: 'care:morning-brief',
        level: 'info'
      }),
      null
    );
    expect(scheduler.getJob('dailyCare:care:morning-brief:fixed:09-15')?.runtime.lastStatus).toBe('success');

    service.stop();
  });

  it('separates rule-based and force trigger semantics for daily-care scheduler jobs', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 5, 9, 1, 0));
    scheduleJobMock.mockReturnValue({
      cancel: vi.fn(),
      nextInvocation: () => new Date(2026, 4, 5, 9, 15, 0)
    });
    const { DailyCareService } = await import('../../electron/main/daily/service');
    const { MainSchedulerService } = await import('../../electron/main/scheduler');
    const scheduler = new MainSchedulerService({
      stateStore: {
        load: () => ({}),
        save: vi.fn()
      }
    });
    const service = new DailyCareService(() => null, { scheduler });
    const jobId = 'dailyCare:care:morning-brief:fixed:09-15';

    service.start();
    sendAppNoticeMock.mockClear();

    await scheduler.triggerNow(jobId);

    expect(sendAppNoticeMock).not.toHaveBeenCalled();
    expect(scheduler.getJob(jobId)?.runtime).toMatchObject({
      lastStatus: 'skipped',
      lastSkipReason: 'fixed-time-not-matched'
    });

    await scheduler.triggerNow(jobId, { force: true });

    expect(sendAppNoticeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        routineId: 'care:morning-brief',
        level: 'info'
      }),
      null
    );
    expect(scheduler.getJob(jobId)?.runtime).toMatchObject({
      lastStatus: 'success',
      lastSkipReason: undefined
    });

    service.stop();
  });
});
