import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SchedulerAuditLogEntry, SchedulerAuditLogQuery, SchedulerAuditLogStore, SchedulerOwnerPauseState, SchedulerRuntimeState, SchedulerStateStore } from '../../electron/main/scheduler';

const scheduleJobMock = vi.hoisted(() => vi.fn());

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/chobits-test'
  }
}));

vi.mock('node-schedule', () => ({
  default: {
    scheduleJob: scheduleJobMock
  }
}));

class MemorySchedulerStateStore implements SchedulerStateStore {
  state: Record<string, SchedulerRuntimeState> = {};
  ownerPauseState: Record<string, SchedulerOwnerPauseState> = {};

  load(): Record<string, SchedulerRuntimeState> {
    return { ...this.state };
  }

  loadOwnerPauseState(): Record<string, SchedulerOwnerPauseState> {
    return Object.fromEntries(Object.entries(this.ownerPauseState).map(([key, value]) => [key, { ...value }]));
  }

  save(state: Record<string, SchedulerRuntimeState>): void {
    this.state = Object.fromEntries(Object.entries(state).map(([key, value]) => [key, { ...value }]));
  }

  saveOwnerPauseState(state: Record<string, SchedulerOwnerPauseState>): void {
    this.ownerPauseState = Object.fromEntries(Object.entries(state).map(([key, value]) => [key, { ...value }]));
  }
}

class MemorySchedulerAuditLogStore implements SchedulerAuditLogStore {
  entries: SchedulerAuditLogEntry[] = [];

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

describe('MainSchedulerService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-05T09:00:00Z'));
    scheduleJobMock.mockReset();
  });

  it('runs interval jobs and records runtime state', async () => {
    const { MainSchedulerService } = await import('../../electron/main/scheduler');
    const stateStore = new MemorySchedulerStateStore();
    const service = new MainSchedulerService({ stateStore });
    const handler = vi.fn();

    service.registerHandler('test.owner', handler);
    service.upsert({
      id: 'job:interval',
      owner: 'test.owner',
      name: 'Interval Job',
      enabled: true,
      schedule: { kind: 'interval', everyMs: 1_000 },
      payload: { value: 42 }
    });
    service.start();

    await vi.advanceTimersByTimeAsync(999);
    expect(handler).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { value: 42 },
        scheduledFor: new Date('2026-05-05T09:00:01Z').getTime(),
        trigger: 'scheduled'
      })
    );

    const snapshot = service.getJob('job:interval');
    expect(snapshot?.runtime.lastStatus).toBe('success');
    expect(snapshot?.runtime.dailyRunCount).toBe(1);
    expect(snapshot?.runtime.nextRunAt).toBe(new Date('2026-05-05T09:00:02Z').getTime());
  });

  it('removes jobs and prevents pending timers from firing', async () => {
    const { MainSchedulerService } = await import('../../electron/main/scheduler');
    const stateStore = new MemorySchedulerStateStore();
    const service = new MainSchedulerService({ stateStore });
    const handler = vi.fn();

    service.registerHandler('test.owner', handler);
    service.upsert({
      id: 'job:remove',
      owner: 'test.owner',
      name: 'Removed Job',
      enabled: true,
      schedule: { kind: 'interval', everyMs: 1_000 }
    });
    service.start();

    expect(service.remove('job:remove')).toBe(true);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(handler).not.toHaveBeenCalled();
    expect(service.getJob('job:remove')).toBeNull();
    expect(stateStore.state['job:remove']).toBeUndefined();
  });

  it('schedules cron jobs through node-schedule and cancels them on update', async () => {
    const { MainSchedulerService } = await import('../../electron/main/scheduler');
    const cancel = vi.fn();
    scheduleJobMock.mockReturnValue({
      cancel,
      nextInvocation: () => new Date('2026-05-05T09:05:00Z')
    });

    const service = new MainSchedulerService({ stateStore: new MemorySchedulerStateStore() });
    service.upsert({
      id: 'job:cron',
      owner: 'test.owner',
      name: 'Cron Job',
      enabled: true,
      schedule: { kind: 'cron', expression: '*/5 * * * *' }
    });
    service.start();

    expect(scheduleJobMock).toHaveBeenCalledWith('*/5 * * * *', expect.any(Function));
    expect(service.getJob('job:cron')?.runtime.nextRunAt).toBe(new Date('2026-05-05T09:05:00Z').getTime());

    service.upsert({
      id: 'job:cron',
      owner: 'test.owner',
      name: 'Cron Job Disabled',
      enabled: false,
      schedule: { kind: 'cron', expression: '*/5 * * * *' }
    });

    expect(cancel).toHaveBeenCalledOnce();
    expect(service.getJob('job:cron')?.active).toBe(false);
  });

  it('applies gate and daily limit skip policies', async () => {
    const { MainSchedulerService } = await import('../../electron/main/scheduler');
    const service = new MainSchedulerService({ stateStore: new MemorySchedulerStateStore() });
    const handler = vi.fn();
    const gate = vi.fn(() => ({ accepted: false, reason: 'blocked-for-test' }));

    service.registerHandler('test.owner', handler);
    service.registerGate('test.gate', gate);
    service.upsert({
      id: 'job:gated',
      owner: 'test.owner',
      name: 'Gated Job',
      enabled: true,
      schedule: { kind: 'interval', everyMs: 1_000 },
      runPolicy: { dailyLimit: 1 },
      admission: { customGate: 'test.gate' }
    });
    service.start();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(handler).not.toHaveBeenCalled();
    expect(service.getJob('job:gated')?.runtime.lastStatus).toBe('skipped');
    expect(service.getJob('job:gated')?.runtime.lastSkipReason).toBe('blocked-for-test');

    gate.mockReturnValue(true);
    await service.triggerNow('job:gated');
    await service.triggerNow('job:gated');

    expect(handler).toHaveBeenCalledOnce();
    expect(service.getJob('job:gated')?.runtime.lastSkipReason).toBe('daily-limit');
  });

  it('supports force trigger for bypassing custom admission gates while preserving audit metadata', async () => {
    const { MainSchedulerService } = await import('../../electron/main/scheduler');
    const auditLogStore = new MemorySchedulerAuditLogStore();
    const service = new MainSchedulerService({
      stateStore: new MemorySchedulerStateStore(),
      auditLogStore
    });
    const handler = vi.fn(() => ({ status: 'success' as const }));
    const gate = vi.fn(() => ({ accepted: false, reason: 'blocked-for-test' }));

    service.registerHandler('test.owner', handler);
    service.registerGate('test.gate', gate);
    service.upsert({
      id: 'job:force-gated',
      owner: 'test.owner',
      name: 'Force Gated Job',
      enabled: true,
      schedule: { kind: 'manual' },
      admission: { customGate: 'test.gate' }
    });
    service.start();

    await service.triggerNow('job:force-gated');
    expect(handler).not.toHaveBeenCalled();
    expect(service.getJob('job:force-gated')?.runtime).toMatchObject({
      lastStatus: 'skipped',
      lastSkipReason: 'blocked-for-test'
    });

    await service.triggerNow('job:force-gated', { force: true });

    expect(gate).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ force: true }));
    expect(service.getJob('job:force-gated')?.runtime).toMatchObject({
      lastStatus: 'success',
      lastSkipReason: undefined
    });
    expect(auditLogStore.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ jobId: 'job:force-gated', status: 'skipped', reason: 'blocked-for-test', force: undefined }),
        expect.objectContaining({ jobId: 'job:force-gated', status: 'success', force: true })
      ])
    );
  });

  it('records skipped and failed handler results without treating them as successful runs', async () => {
    const { MainSchedulerService } = await import('../../electron/main/scheduler');
    const service = new MainSchedulerService({ stateStore: new MemorySchedulerStateStore() });
    const handler = vi.fn(() => ({ status: 'skipped' as const, reason: 'business-not-due' }));

    service.registerHandler('test.owner', handler);
    service.upsert({
      id: 'job:handler-result',
      owner: 'test.owner',
      name: 'Handler Result Job',
      enabled: true,
      schedule: { kind: 'interval', everyMs: 1_000 }
    });
    service.start();

    await vi.advanceTimersByTimeAsync(1_000);

    expect(service.getJob('job:handler-result')?.runtime).toMatchObject({
      lastStatus: 'skipped',
      lastSkipReason: 'business-not-due',
      dailyRunCount: 0
    });

    handler.mockReturnValue({ status: 'failed', reason: 'business-failed' });
    await service.triggerNow('job:handler-result');

    expect(service.getJob('job:handler-result')?.runtime).toMatchObject({
      lastStatus: 'failed',
      lastError: 'business-failed',
      consecutiveFailures: 1,
      dailyRunCount: 0
    });
  });

  it('pauses jobs, records pause history, and resumes scheduling from the main scheduler', async () => {
    const { MainSchedulerService } = await import('../../electron/main/scheduler');
    const auditLogStore = new MemorySchedulerAuditLogStore();
    const service = new MainSchedulerService({
      stateStore: new MemorySchedulerStateStore(),
      auditLogStore
    });
    const handler = vi.fn(() => ({ status: 'success' as const }));

    service.registerHandler('test.owner', handler);
    service.upsert({
      id: 'job:pausable',
      owner: 'test.owner',
      name: 'Pausable Job',
      enabled: true,
      schedule: { kind: 'interval', everyMs: 1_000 }
    });
    service.start();

    expect(service.pauseJob('job:pausable', 'debug-window')).toMatchObject({
      active: false,
      paused: true,
      pauseReason: 'debug-window',
      runtime: {
        paused: true,
        pauseReason: 'debug-window',
        nextRunAt: undefined
      }
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(handler).not.toHaveBeenCalled();

    await expect(service.triggerNow('job:pausable')).resolves.toMatchObject({
      lastStatus: 'skipped',
      lastSkipReason: 'paused:debug-window',
      dailyRunCount: 0
    });

    expect(service.resumeJob('job:pausable')).toMatchObject({
      active: true,
      paused: false,
      runtime: {
        paused: false,
        pauseReason: undefined
      }
    });

    await vi.advanceTimersByTimeAsync(1_000);
    expect(handler).toHaveBeenCalledOnce();
    expect(service.listAuditLog({ jobId: 'job:pausable' }).map((entry) => entry.status)).toEqual(['success', 'resumed', 'skipped', 'paused']);
    expect(auditLogStore.entries.some((entry) => entry.eventType === 'control' && entry.action === 'pause-job')).toBe(true);
  });

  it('persists owner pause state across scheduler service restarts', async () => {
    const { MainSchedulerService } = await import('../../electron/main/scheduler');
    const stateStore = new MemorySchedulerStateStore();
    const handler = vi.fn(() => ({ status: 'success' as const }));

    const service = new MainSchedulerService({ stateStore });
    service.upsert({
      id: 'job:persist-owner-pause',
      owner: 'sprite.behavior',
      name: 'Persist Owner Pause',
      enabled: true,
      schedule: { kind: 'interval', everyMs: 1_000 }
    });
    service.start();
    service.pauseOwner('sprite.behavior', 'maintenance');

    expect(stateStore.ownerPauseState['sprite.behavior']).toMatchObject({
      owner: 'sprite.behavior',
      paused: true,
      pauseReason: 'maintenance'
    });
    service.stop();

    const restored = new MainSchedulerService({ stateStore });
    restored.registerHandler('sprite.behavior', handler);
    restored.upsert({
      id: 'job:persist-owner-pause',
      owner: 'sprite.behavior',
      name: 'Persist Owner Pause',
      enabled: true,
      schedule: { kind: 'interval', everyMs: 1_000 }
    });
    restored.start();

    expect(restored.getJob('job:persist-owner-pause')).toMatchObject({
      active: false,
      paused: true,
      pausedByOwner: true,
      pauseReason: 'maintenance'
    });

    await expect(restored.triggerNow('job:persist-owner-pause')).resolves.toMatchObject({
      lastStatus: 'skipped',
      lastSkipReason: 'owner-paused:maintenance'
    });
    expect(handler).not.toHaveBeenCalled();

    restored.resumeOwner('sprite.behavior');
    expect(stateStore.ownerPauseState['sprite.behavior']).toBeUndefined();
  });
});
