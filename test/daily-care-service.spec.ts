import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electronState = {
  userDataDir: '',
  windows: [] as Array<any>
};

const notifySpriteCapabilityChangedMock = vi.fn();

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

vi.mock('../packages/event', () => ({
  sendAppNotice: vi.fn()
}));

vi.mock('../packages/sprite-core/handler/capability-events', () => ({
  notifySpriteCapabilityChanged: notifySpriteCapabilityChangedMock
}));

describe('daily care service broadcasts', () => {
  let dataDir = '';
  let sent: Array<{ channel: string; payload: unknown }> = [];

  beforeEach(async () => {
    vi.resetModules();
    notifySpriteCapabilityChangedMock.mockReset();
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
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('broadcasts snapshot and capability changes when the global enabled flag changes', async () => {
    const { DailyCareService } = await import('../electron/main/daily/service');
    const { DAILY_CARE_SNAPSHOT_UPDATED_CHANNEL } = await import('../electron/main/daily/types');
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
    const { DailyCareService } = await import('../electron/main/daily/service');
    const { DAILY_CARE_SNAPSHOT_UPDATED_CHANNEL } = await import('../electron/main/daily/types');
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
    const { DailyCareService } = await import('../electron/main/daily/service');
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
});
