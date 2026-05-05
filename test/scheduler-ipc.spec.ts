import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SchedulerAuditLogCleanupOptions, SchedulerAuditLogEntry, SchedulerAuditLogQuery, SchedulerAuditLogStore, SchedulerRuntimeState, SchedulerStateStore } from '../electron/main/scheduler';

const ipcHandlers = vi.hoisted(() => new Map<string, (...args: any[]) => any>());
const scheduleJobMock = vi.hoisted(() => vi.fn());
const schedulerWindowEvents = vi.hoisted((): Array<{ channel: string; payload: any }> => []);

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/chobits-scheduler-ipc-test'
  },
  BrowserWindow: {
    getAllWindows: () => [
      {
        isDestroyed: () => false,
        webContents: {
          send: (channel: string, payload: any) => {
            schedulerWindowEvents.push({ channel, payload });
          }
        }
      }
    ]
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      ipcHandlers.set(channel, handler);
    }
  }
}));

vi.mock('node-schedule', () => ({
  default: {
    scheduleJob: scheduleJobMock
  }
}));

class MemorySchedulerStateStore implements SchedulerStateStore {
  state: Record<string, SchedulerRuntimeState> = {};

  load(): Record<string, SchedulerRuntimeState> {
    return { ...this.state };
  }

  save(state: Record<string, SchedulerRuntimeState>): void {
    this.state = Object.fromEntries(Object.entries(state).map(([key, value]) => [key, { ...value }]));
  }
}

class MemorySchedulerAuditLogStore implements SchedulerAuditLogStore {
  entries: SchedulerAuditLogEntry[] = [];
  cleanup = vi.fn((options?: SchedulerAuditLogCleanupOptions) => ({ deletedFiles: options?.retentionDays === 7 ? ['scheduler-audit-old.jsonl'] : [] }));

  append(entry: SchedulerAuditLogEntry): void {
    this.entries.push({ ...entry });
  }

  list(query: SchedulerAuditLogQuery = {}): SchedulerAuditLogEntry[] {
    const limit = query.limit ?? 100;
    return this.entries
      .filter((entry) => {
        if (query.jobId && entry.jobId !== query.jobId) return false;
        if (query.owner && entry.owner !== query.owner) return false;
        if (query.eventType && entry.eventType !== query.eventType) return false;
        if (query.status && entry.status !== query.status) return false;
        return true;
      })
      .slice(-limit)
      .reverse();
  }
}

describe('scheduler IPC', () => {
  beforeEach(() => {
    vi.resetModules();
    ipcHandlers.clear();
    schedulerWindowEvents.length = 0;
    scheduleJobMock.mockReset();
  });

  afterEach(async () => {
    vi.useRealTimers();
    const { resetMainSchedulerServiceForTest } = await import('../electron/main/scheduler');
    resetMainSchedulerServiceForTest(null);
  });

  it('lists jobs across owners, hides payloads, and triggers jobs through the shared scheduler', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-05T09:00:00Z'));

    const { MainSchedulerService, SCHEDULER_UPDATED_CHANNEL, resetMainSchedulerServiceForTest } = await import('../electron/main/scheduler');
    const auditLogStore = new MemorySchedulerAuditLogStore();
    const service = new MainSchedulerService({
      stateStore: new MemorySchedulerStateStore(),
      auditLogStore
    });
    const automationHandler = vi.fn(() => ({ status: 'success' as const }));
    service.registerHandler('automation', automationHandler);
    service.registerHandler('dailyCare', () => ({ status: 'skipped', reason: 'not-due' }));
    service.registerHandler('sprite.behavior', () => ({ status: 'skipped', reason: 'movement-suspended' }));
    resetMainSchedulerServiceForTest(service);

    service.upsert({
      id: 'automation:rule-1',
      owner: 'automation',
      name: 'Automation Rule',
      enabled: true,
      schedule: { kind: 'interval', everyMs: 60_000 },
      payload: { secret: 'hidden' }
    });
    service.upsert({
      id: 'dailyCare:care:hydration-hourly:interval',
      owner: 'dailyCare',
      name: 'Hydration',
      enabled: true,
      schedule: { kind: 'interval', everyMs: 60_000 }
    });
    service.upsert({
      id: 'sprite.behavior:auto-walk',
      owner: 'sprite.behavior',
      name: 'Auto Walk',
      enabled: true,
      schedule: { kind: 'randomInterval', minMs: 20_000, maxMs: 60_000 }
    });
    service.start();

    const { initSchedulerIPC } = await import('../electron/main/scheduler/ipc-main');
    initSchedulerIPC();

    const listJobs = ipcHandlers.get('scheduler:listJobs');
    const getJob = ipcHandlers.get('scheduler:getJob');
    const triggerNow = ipcHandlers.get('scheduler:triggerNow');
    const getRuntimeState = ipcHandlers.get('scheduler:getRuntimeState');
    const pauseOwner = ipcHandlers.get('scheduler:pauseOwner');
    const resumeOwner = ipcHandlers.get('scheduler:resumeOwner');
    const getOwnerPauseState = ipcHandlers.get('scheduler:getOwnerPauseState');
    const listAuditLog = ipcHandlers.get('scheduler:listAuditLog');
    const cleanupAuditLog = ipcHandlers.get('scheduler:cleanupAuditLog');

    const jobs = await listJobs?.({});
    expect(jobs.map((job: any) => job.definition.owner)).toEqual(['automation', 'dailyCare', 'sprite.behavior']);
    expect(jobs[0].definition.payload).toBeUndefined();

    await expect(triggerNow?.({}, 'sprite.behavior:auto-walk')).resolves.toMatchObject({
      jobId: 'sprite.behavior:auto-walk',
      lastStatus: 'skipped',
      lastSkipReason: 'movement-suspended'
    });

    await expect(triggerNow?.({}, 'automation:rule-1', { force: true })).resolves.toMatchObject({
      jobId: 'automation:rule-1',
      lastStatus: 'success'
    });
    expect(automationHandler).toHaveBeenCalledWith(expect.objectContaining({ force: true }));
    expect(schedulerWindowEvents).toContainEqual({
      channel: SCHEDULER_UPDATED_CHANNEL,
      payload: expect.objectContaining({
        reason: 'runtime',
        jobId: 'automation:rule-1',
        owner: 'automation'
      })
    });

    await expect(Promise.resolve(getJob?.({}, 'sprite.behavior:auto-walk'))).resolves.toMatchObject({
      definition: {
        id: 'sprite.behavior:auto-walk',
        owner: 'sprite.behavior'
      },
      runtime: {
        lastStatus: 'skipped',
        lastSkipReason: 'movement-suspended'
      }
    });

    const runtimeState = await getRuntimeState?.({});
    expect(runtimeState['sprite.behavior:auto-walk']).toMatchObject({
      lastStatus: 'skipped',
      lastSkipReason: 'movement-suspended'
    });

    const pausedOwnerJobs = await pauseOwner?.({}, 'sprite.behavior', 'debug-panel');
    expect(pausedOwnerJobs).toEqual([
      expect.objectContaining({
        definition: expect.objectContaining({
          id: 'sprite.behavior:auto-walk'
        }),
        paused: true,
        pausedByOwner: true,
        pauseReason: 'debug-panel'
      })
    ]);
    expect(pausedOwnerJobs[0].definition).not.toHaveProperty('payload');
    await expect(Promise.resolve(getOwnerPauseState?.({}))).resolves.toMatchObject({
      'sprite.behavior': {
        owner: 'sprite.behavior',
        paused: true,
        pauseReason: 'debug-panel'
      }
    });

    await expect(triggerNow?.({}, 'sprite.behavior:auto-walk')).resolves.toMatchObject({
      lastStatus: 'skipped',
      lastSkipReason: 'owner-paused:debug-panel'
    });

    const resumedOwnerJobs = await resumeOwner?.({}, 'sprite.behavior');
    expect(resumedOwnerJobs).toEqual([
      expect.objectContaining({
        definition: expect.objectContaining({
          id: 'sprite.behavior:auto-walk'
        }),
        paused: false,
        pausedByOwner: false
      })
    ]);
    expect(resumedOwnerJobs[0].definition).not.toHaveProperty('payload');

    await expect(Promise.resolve(listAuditLog?.({}, { owner: 'sprite.behavior', limit: 5 }))).resolves.toEqual([
      expect.objectContaining({ eventType: 'control', action: 'resume-owner', status: 'resumed' }),
      expect.objectContaining({ eventType: 'run', status: 'skipped', reason: 'owner-paused:debug-panel' }),
      expect.objectContaining({ eventType: 'control', action: 'pause-owner', status: 'paused' }),
      expect.objectContaining({ eventType: 'run', status: 'skipped', reason: 'movement-suspended' })
    ]);

    await expect(Promise.resolve(cleanupAuditLog?.({}, { retentionDays: 7 }))).resolves.toEqual({ deletedFiles: ['scheduler-audit-old.jsonl'] });
    expect(auditLogStore.cleanup).toHaveBeenCalledWith(expect.objectContaining({ retentionDays: 7, now: expect.any(Number) }));
    expect(schedulerWindowEvents).toContainEqual({
      channel: SCHEDULER_UPDATED_CHANNEL,
      payload: expect.objectContaining({
        reason: 'audit'
      })
    });
  });
});
