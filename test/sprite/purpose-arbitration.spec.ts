import { describe, expect, it, vi } from 'vitest';

import type {
  SpritePurposeHistoryEntry,
  SpritePurposeQueuePolicyOptions,
  SpritePurposeRuntimeEvent,
  SpriteRoutine,
  SpriteRoutinePresetDefinition,
  SpriteRoutineRunResult
} from '../../packages/sprite-core/purpose';
import { SpritePurposeManager, SpriteRoutinePresetRegistry, SpriteRoutineRunner } from '../../packages/sprite-core/purpose';

async function waitFor(predicate: () => boolean, timeoutMs = 200): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

function createHoldingRunner(): SpriteRoutineRunner {
  return {
    run: vi.fn((routine: SpriteRoutine, options?: { signal?: AbortSignal }) => {
      if (options?.signal?.aborted) {
        return Promise.resolve(createCancelledResult(routine));
      }

      return new Promise<SpriteRoutineRunResult>((resolve) => {
        options?.signal?.addEventListener('abort', () => resolve(createCancelledResult(routine)), { once: true });
      });
    })
  } as unknown as SpriteRoutineRunner;
}

function createCancelledResult(routine: SpriteRoutine): SpriteRoutineRunResult {
  return {
    ok: false,
    status: 'cancelled',
    purposeId: routine.purposeId,
    routineId: routine.id,
    error: 'aborted',
    elapsedMs: 0,
    steps: []
  };
}

function holdPreset(id: string, purposeKind: string, defaultPriority: number): SpriteRoutinePresetDefinition {
  return {
    id,
    title: id,
    purposeKind,
    defaultPriority,
    steps: [{ id: 'hold', type: 'wait', durationMs: 60_000 }]
  };
}

function createManager(presets: SpriteRoutinePresetDefinition[], options?: { queuePolicy?: SpritePurposeQueuePolicyOptions }) {
  const history: SpritePurposeHistoryEntry[] = [];
  let id = 0;
  const manager = new SpritePurposeManager({
    runner: createHoldingRunner(),
    presets: new SpriteRoutinePresetRegistry(presets),
    queuePolicy: options?.queuePolicy,
    history: {
      append(entry) {
        history.push(entry);
      }
    },
    idFactory: () => `purpose-${++id}`,
    now: () => 1000 + id
  });

  return { manager, history };
}

function createAbortError(): Error {
  const error = new Error('aborted');
  error.name = 'AbortError';
  return error;
}

function createEventRunner(): {
  runner: SpriteRoutineRunner;
  hasWaiter(event: string): boolean;
  resolveEvent(event: string): void;
} {
  const pending = new Map<string, { resolve: (event: SpritePurposeRuntimeEvent) => void; reject: (error: Error) => void }>();
  const runner = new SpriteRoutineRunner({
    playAnimation: vi.fn(),
    walkTo: vi.fn(),
    speak: vi.fn(),
    showToast: vi.fn(),
    waitForEvent: (step, signal) =>
      new Promise<SpritePurposeRuntimeEvent>((resolve, reject) => {
        if (signal.aborted) {
          reject(createAbortError());
          return;
        }

        const cleanup = (): void => {
          pending.delete(step.event);
          signal.removeEventListener('abort', onAbort);
        };
        const onAbort = (): void => {
          cleanup();
          reject(createAbortError());
        };

        pending.set(step.event, {
          resolve: (event) => {
            cleanup();
            resolve(event);
          },
          reject
        });
        signal.addEventListener('abort', onAbort, { once: true });
      })
  });

  return {
    runner,
    hasWaiter(event: string) {
      return pending.has(event);
    },
    resolveEvent(event: string) {
      pending.get(event)?.resolve({
        source: 'purpose-event',
        event,
        timestamp: Date.now()
      });
    }
  };
}

describe('Purpose arbitration', () => {
  it('coalesces duplicate singleton purposes that are already active', async () => {
    const { manager, history } = createManager([holdPreset('daily.rest-reminder', 'daily.rest-reminder', 60)]);

    const first = await manager.start({
      kind: 'daily.rest-reminder',
      reason: '到了休息时间',
      source: 'behavior'
    });
    const duplicate = await manager.start({
      kind: 'daily.rest-reminder',
      reason: '休息提醒重复触发',
      source: 'behavior'
    });

    expect(first.status).toBe('started');
    expect(duplicate.status).toBe('coalesced');
    expect(duplicate.purpose.id).toBe(first.purpose.id);
    expect(manager.getSnapshot().queue).toHaveLength(0);
    expect(manager.getSnapshot().current?.id).toBe(first.purpose.id);
    expect(history.map((entry) => entry.eventType)).toContain('purpose:coalesced');

    await manager.cancel();
  });

  it('coalesces custom purposes by explicit coalesce keys', async () => {
    const { manager } = createManager([holdPreset('custom.sync', 'custom.sync', 70)]);

    const first = await manager.start({
      kind: 'custom.sync',
      reason: '同步资源',
      source: 'system-event',
      coalesceKey: 'resource-sync:42'
    });
    const duplicate = await manager.start({
      kind: 'custom.sync',
      reason: '同步资源重复触发',
      source: 'system-event',
      coalesceKey: 'resource-sync:42'
    });

    expect(first.status).toBe('started');
    expect(duplicate.status).toBe('coalesced');
    expect(duplicate.purpose.id).toBe(first.purpose.id);
    expect(manager.getSnapshot().queue).toHaveLength(0);

    await manager.cancel();
  });

  it('coalesces duplicate queued purposes instead of adding another queue item', async () => {
    const { manager } = createManager([holdPreset('custom.demo', 'custom.demo', 100), holdPreset('daily.rest-reminder', 'daily.rest-reminder', 60)]);

    const active = await manager.start({
      kind: 'custom.demo',
      reason: '演示目的触发',
      source: 'user-event',
      correlationId: 'demo-1'
    });
    const queued = await manager.start({
      kind: 'daily.rest-reminder',
      reason: '到了休息时间',
      source: 'behavior'
    });
    const duplicate = await manager.start({
      kind: 'daily.rest-reminder',
      reason: '休息提醒重复触发',
      source: 'behavior'
    });

    expect(active.status).toBe('started');
    expect(queued.status).toBe('queued');
    expect(duplicate.status).toBe('coalesced');
    expect(duplicate.purpose.id).toBe(queued.purpose.id);
    expect(manager.getSnapshot().queue.map((purpose) => purpose.id)).toEqual([queued.purpose.id]);

    await manager.cancel(active.purpose.id);
    await manager.cancel();
  });

  it('rejects low-priority purposes instead of queueing ambient work indefinitely', async () => {
    const { manager, history } = createManager([holdPreset('custom.demo', 'custom.demo', 100)]);

    const active = await manager.start({
      kind: 'custom.demo',
      reason: 'active demo purpose',
      source: 'user-event',
      correlationId: 'demo-low-priority'
    });
    const lowPriority = await manager.start({
      kind: 'ambient.observation',
      reason: 'ambient low-priority trigger',
      source: 'behavior',
      priority: 10
    });

    expect(active.status).toBe('started');
    expect(lowPriority.status).toBe('rejected');
    expect(lowPriority.accepted).toBe(false);
    expect(lowPriority.reason).toBe('queued-purpose-priority-too-low');
    expect(lowPriority.purpose.status).toBe('rejected');
    expect(manager.getSnapshot().queue).toHaveLength(0);
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'purpose:rejected',
          purposeId: lowPriority.purpose.id,
          result: { reason: 'queued-purpose-priority-too-low' }
        })
      ])
    );

    await manager.cancel(active.purpose.id);
  });

  it('caps the queue and lets higher-priority queued work replace the lowest queued purpose', async () => {
    const { manager, history } = createManager([holdPreset('custom.demo', 'custom.demo', 100)], {
      queuePolicy: {
        maxQueueSize: 2,
        minQueuedPriority: 0
      }
    });

    const active = await manager.start({
      kind: 'custom.demo',
      reason: 'active demo purpose',
      source: 'user-event',
      correlationId: 'demo-queue-limit'
    });
    const medium = await manager.start({
      kind: 'queued.medium',
      reason: 'queued medium priority',
      source: 'system-event',
      priority: 60
    });
    const low = await manager.start({
      kind: 'queued.low',
      reason: 'queued low priority',
      source: 'system-event',
      priority: 40
    });
    const high = await manager.start({
      kind: 'queued.high',
      reason: 'queued high priority',
      source: 'system-event',
      priority: 70
    });
    const late = await manager.start({
      kind: 'queued.late',
      reason: 'late queued purpose',
      source: 'system-event',
      priority: 50
    });

    expect(active.status).toBe('started');
    expect(medium.status).toBe('queued');
    expect(low.status).toBe('queued');
    expect(high.status).toBe('queued');
    expect(late.status).toBe('rejected');
    expect(late.reason).toBe('purpose-queue-limit-reached');
    expect(manager.getSnapshot().queue.map((purpose) => purpose.id)).toEqual([high.purpose.id, medium.purpose.id]);
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'purpose:rejected',
          purposeId: low.purpose.id,
          result: { reason: 'queue-limit-evicted-by-higher-priority', replacedBy: high.purpose.id }
        }),
        expect.objectContaining({
          eventType: 'purpose:rejected',
          purposeId: late.purpose.id,
          result: { reason: 'purpose-queue-limit-reached' }
        })
      ])
    );

    await manager.cancel(active.purpose.id);
    await manager.cancel();
  });

  it('lets a high-priority custom purpose interrupt an active rest reminder', async () => {
    const { manager, history } = createManager([holdPreset('daily.rest-reminder', 'daily.rest-reminder', 60), holdPreset('custom.demo', 'custom.demo', 100)]);

    const rest = await manager.start({
      kind: 'daily.rest-reminder',
      reason: '到了休息时间',
      source: 'behavior'
    });
    const demoPurpose = await manager.start({
      kind: 'custom.demo',
      reason: '演示目的触发',
      source: 'user-event',
      correlationId: 'demo-2'
    });

    expect(rest.status).toBe('started');
    expect(demoPurpose.status).toBe('started');
    expect(manager.getSnapshot().current).toMatchObject({
      id: demoPurpose.purpose.id,
      kind: 'custom.demo'
    });
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'purpose:superseded',
          purposeId: rest.purpose.id,
          result: { supersededBy: demoPurpose.purpose.id }
        })
      ])
    );

    await manager.cancel();
  });

  it('defers higher priority interrupts until the current critical step completes', async () => {
    const history: SpritePurposeHistoryEntry[] = [];
    const eventRunner = createEventRunner();
    let id = 0;
    const manager = new SpritePurposeManager({
      runner: eventRunner.runner,
      presets: new SpriteRoutinePresetRegistry([
        {
          id: 'daily.rest-reminder',
          title: '休息提醒',
          purposeKind: 'daily.rest-reminder',
          defaultPriority: 60,
          steps: [
            { id: 'critical', type: 'waitForEvent', event: 'critical-done', interruptible: false },
            { id: 'after-critical', type: 'waitForEvent', event: 'rest-after-critical' }
          ]
        },
        {
          id: 'custom.demo',
          title: '演示目的',
          purposeKind: 'custom.demo',
          defaultPriority: 100,
          steps: [{ id: 'hold-demo', type: 'waitForEvent', event: 'demo-done' }]
        }
      ]),
      history: {
        append(entry) {
          history.push(entry);
        }
      },
      idFactory: () => `purpose-${++id}`,
      now: () => 1000 + id
    });

    const rest = await manager.start({
      kind: 'daily.rest-reminder',
      reason: '到了休息时间',
      source: 'behavior'
    });
    await waitFor(() => eventRunner.hasWaiter('critical-done'));

    const demoPurpose = await manager.start({
      kind: 'custom.demo',
      reason: '演示目的触发',
      source: 'user-event',
      correlationId: 'demo-critical'
    });

    expect(demoPurpose.status).toBe('queued');
    expect(demoPurpose.reason).toBe('current-purpose-step-is-critical');
    expect(manager.getSnapshot().current).toMatchObject({
      id: rest.purpose.id,
      kind: 'daily.rest-reminder'
    });
    expect(manager.getSnapshot().queue.map((purpose) => purpose.id)).toEqual([demoPurpose.purpose.id]);

    eventRunner.resolveEvent('critical-done');
    await waitFor(() => manager.getSnapshot().current?.id === demoPurpose.purpose.id);

    expect(manager.getSnapshot().queue).toHaveLength(0);
    expect(manager.getSnapshot().current).toMatchObject({
      id: demoPurpose.purpose.id,
      kind: 'custom.demo'
    });
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'purpose:superseded',
          purposeId: rest.purpose.id,
          result: { supersededBy: demoPurpose.purpose.id }
        })
      ])
    );

    await manager.cancel();
  });
});
