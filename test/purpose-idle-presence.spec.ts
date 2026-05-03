import { describe, expect, it, vi } from 'vitest';

import type { SpritePurposeHistoryEntry, SpriteRoutine, SpriteRoutinePresetDefinition, SpriteRoutineRunResult, SpriteRoutineRunner } from '../packages/sprite-core/purpose';
import { SpritePurposeManager, SpriteRoutinePresetRegistry } from '../packages/sprite-core/purpose';

async function waitFor(predicate: () => boolean, timeoutMs = 200): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

function completedResult(routine: SpriteRoutine): SpriteRoutineRunResult {
  return {
    ok: true,
    status: 'completed',
    purposeId: routine.purposeId,
    routineId: routine.id,
    elapsedMs: 1,
    steps: []
  };
}

function cancelledResult(routine: SpriteRoutine): SpriteRoutineRunResult {
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

function createControlledRunner(): {
  runner: SpriteRoutineRunner;
  hasActiveRun(): boolean;
  completeCurrent(): void;
} {
  let complete: (() => void) | null = null;

  const runner = {
    run: vi.fn((routine: SpriteRoutine, options?: { signal?: AbortSignal }) => {
      if (options?.signal?.aborted) {
        return Promise.resolve(cancelledResult(routine));
      }

      return new Promise<SpriteRoutineRunResult>((resolve) => {
        complete = () => resolve(completedResult(routine));
        options?.signal?.addEventListener('abort', () => resolve(cancelledResult(routine)), { once: true });
      });
    })
  } as unknown as SpriteRoutineRunner;

  return {
    runner,
    hasActiveRun() {
      return complete !== null;
    },
    completeCurrent() {
      complete?.();
      complete = null;
    }
  };
}

function createManager() {
  const history: SpritePurposeHistoryEntry[] = [];
  let id = 0;
  const controlled = createControlledRunner();
  const manager = new SpritePurposeManager({
    runner: controlled.runner,
    presets: new SpriteRoutinePresetRegistry([
      holdPreset('idle.presence', 'idle.presence', 10),
      holdPreset('file.drop.intake', 'file.drop.intake', 100)
    ]),
    history: {
      append(entry) {
        history.push(entry);
      }
    },
    idlePresence: { enabled: true },
    idFactory: () => `purpose-${++id}`,
    now: () => 1000 + id
  });

  return { manager, history, hasActiveRun: controlled.hasActiveRun, completeCurrent: controlled.completeCurrent };
}

describe('idle presence purpose', () => {
  it('creates an active semantic idle purpose by default', async () => {
    const { manager, history } = createManager();

    await waitFor(() => history.length === 2);
    expect(manager.getSnapshot()).toMatchObject({
      current: {
        kind: 'idle.presence',
        status: 'active',
        priority: 10
      },
      routine: null,
      queue: []
    });
    expect(history.map((entry) => entry.eventType)).toEqual(['purpose:created', 'purpose:started']);
  });

  it('restores idle presence after a higher priority purpose completes', async () => {
    const { manager, history, hasActiveRun, completeCurrent } = createManager();
    const originalIdleId = manager.getSnapshot().current?.id;

    const filePurpose = await manager.start({
      kind: 'file.drop.intake',
      reason: '用户拖入文件',
      source: 'user-event',
      correlationId: 'drop-1'
    });

    expect(filePurpose.status).toBe('started');
    expect(manager.getSnapshot().current).toMatchObject({
      id: filePurpose.purpose.id,
      kind: 'file.drop.intake'
    });

    await waitFor(hasActiveRun);
    completeCurrent();
    await waitFor(() => manager.getSnapshot().current?.kind === 'idle.presence');

    const restoredIdle = manager.getSnapshot().current;
    expect(restoredIdle?.id).not.toBe(originalIdleId);
    expect(restoredIdle).toMatchObject({
      kind: 'idle.presence',
      status: 'active'
    });
    expect(history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: 'purpose:superseded', purposeId: originalIdleId, result: { supersededBy: filePurpose.purpose.id } }),
        expect.objectContaining({ eventType: 'purpose:completed', purposeId: filePurpose.purpose.id, status: 'completed' })
      ])
    );
  });

  it('queues idle presence requests while a file purpose is active', async () => {
    const { manager, hasActiveRun, completeCurrent } = createManager();

    const filePurpose = await manager.start({
      kind: 'file.drop.intake',
      reason: '用户拖入文件',
      source: 'user-event',
      correlationId: 'drop-2'
    });
    const idleRequest = await manager.start({
      kind: 'idle.presence',
      reason: '低优先级氛围行为归档',
      source: 'behavior'
    });

    expect(filePurpose.status).toBe('started');
    expect(idleRequest.status).toBe('queued');
    expect(manager.getSnapshot().current?.kind).toBe('file.drop.intake');
    expect(manager.getSnapshot().queue.map((purpose) => purpose.kind)).toEqual(['idle.presence']);

    await waitFor(hasActiveRun);
    completeCurrent();
    await waitFor(() => manager.getSnapshot().current?.id === idleRequest.purpose.id);
    expect(manager.getSnapshot().current).toMatchObject({
      id: idleRequest.purpose.id,
      kind: 'idle.presence',
      status: 'active'
    });
  });
});
