import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { SpritePurposeHistoryEntry, SpriteRoutinePresetDefinition } from '../packages/sprite-core/purpose';
import {
  createSpriteRoutineFromPlannerDraft,
  SpritePresentationLock,
  SpritePurposeEventTimeoutError,
  SpritePurposeEventWaiter,
  SpritePurposeHistoryStore,
  SpritePurposeManager,
  SpriteRoutinePresetRegistry,
  SpriteRoutineRunner
} from '../packages/sprite-core/purpose';

async function waitFor(predicate: () => boolean, timeoutMs = 200): Promise<void> {
  const startedAt = Date.now();
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
}

describe('SpriteRoutineRunner', () => {
  it('runs routine steps in order', async () => {
    const calls: string[] = [];
    const runner = new SpriteRoutineRunner({
      playAnimation: (step) => {
        calls.push(`play:${step.trigger ?? step.animationId}`);
      },
      walkTo: (step) => {
        calls.push(`walk:${typeof step.target === 'string' ? step.target : 'point'}`);
      },
      speak: (step) => {
        calls.push(`speak:${step.text}`);
      },
      showToast: (step) => {
        calls.push(`toast:${step.content}`);
      }
    });

    const result = await runner.run({
      id: 'routine-1',
      purposeId: 'purpose-1',
      source: 'preset',
      status: 'queued',
      steps: [
        { id: 'walk', type: 'walkTo', target: 'center' },
        { id: 'play', type: 'playAnimation', trigger: 'wave', durationMs: 1, waitFor: 'duration' },
        { id: 'speak', type: 'speak', text: '休息一下吧。' },
        { id: 'toast', type: 'showToast', content: '完成' }
      ],
      cursor: 0,
      createdAt: Date.now()
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('completed');
    expect(calls).toEqual(['walk:center', 'play:wave', 'speak:休息一下吧。', 'toast:完成']);
  });

  it('cancels a running wait step', async () => {
    const controller = new AbortController();
    const runner = new SpriteRoutineRunner({
      playAnimation: vi.fn(),
      walkTo: vi.fn(),
      speak: vi.fn(),
      showToast: vi.fn()
    });

    const promise = runner.run(
      {
        id: 'routine-1',
        purposeId: 'purpose-1',
        source: 'preset',
        status: 'queued',
        steps: [{ id: 'wait', type: 'wait', durationMs: 1000 }],
        cursor: 0,
        createdAt: Date.now()
      },
      { signal: controller.signal }
    );

    controller.abort();
    const result = await promise;
    expect(result.ok).toBe(false);
    expect(result.status).toBe('cancelled');
    expect(result.steps[0]).toMatchObject({ stepId: 'wait', status: 'cancelled' });
  });

  it('waits for matching purpose events before continuing', async () => {
    const waiter = new SpritePurposeEventWaiter();
    const calls: string[] = [];
    const runner = new SpriteRoutineRunner({
      playAnimation: vi.fn(),
      walkTo: vi.fn(),
      waitForEvent: (step, signal, routine) => waiter.wait(step, routine, signal),
      speak: (step) => {
        calls.push(`speak:${step.text}`);
      },
      showToast: vi.fn()
    });

    const promise = runner.run({
      id: 'routine-1',
      purposeId: 'purpose-1',
      source: 'preset',
      status: 'queued',
      steps: [
        {
          id: 'wait-choice',
          type: 'waitForEvent',
          source: 'purpose-event',
          event: 'fileAction:selected',
          match: { correlationId: 'drop-1', resourceId: 'resource-1' },
          timeoutMs: 200
        },
        { id: 'speak', type: 'speak', text: '收到。' }
      ],
      cursor: 0,
      createdAt: Date.now()
    });

    await Promise.resolve();
    waiter.emit({
      source: 'purpose-event',
      event: 'fileAction:selected',
      correlationId: 'drop-1',
      payload: { resourceId: 'other-resource' }
    });
    waiter.emit({
      source: 'purpose-event',
      event: 'fileAction:selected',
      correlationId: 'drop-1',
      payload: { resourceId: 'resource-1', actionId: 'summarize' }
    });

    const result = await promise;
    expect(result.ok).toBe(true);
    expect(result.steps[0].value).toMatchObject({
      event: 'fileAction:selected',
      correlationId: 'drop-1',
      payload: { resourceId: 'resource-1', actionId: 'summarize' }
    });
    expect(calls).toEqual(['speak:收到。']);
  });

  it('can ignore waiter history when waiting for fresh progress events', async () => {
    const waiter = new SpritePurposeEventWaiter();
    const routine = {
      id: 'routine-progress-history',
      purposeId: 'purpose-progress-history',
      source: 'preset' as const,
      status: 'queued' as const,
      steps: [],
      cursor: 0,
      createdAt: Date.now()
    };

    waiter.emit({
      source: 'app-event',
      event: 'SPRITE_WORKFLOW_PROGRESS',
      payload: { runId: 'run-1', progress: 10 }
    });

    const promise = waiter.wait(
      {
        id: 'wait-progress',
        type: 'waitForEvent',
        source: 'app-event',
        event: 'SPRITE_WORKFLOW_PROGRESS',
        match: { runId: 'run-1' },
        ignoreHistory: true,
        timeoutMs: 200
      },
      routine
    );

    await Promise.resolve();
    waiter.emit({
      source: 'app-event',
      event: 'SPRITE_WORKFLOW_PROGRESS',
      payload: { runId: 'run-1', progress: 35, message: '转录中' }
    });

    await expect(promise).resolves.toMatchObject({
      event: 'SPRITE_WORKFLOW_PROGRESS',
      payload: { runId: 'run-1', progress: 35, message: '转录中' }
    });
  });

  it('assigns event results and runs matching branch steps', async () => {
    const calls: string[] = [];
    const runner = new SpriteRoutineRunner({
      playAnimation: (step) => {
        calls.push(`play:${step.trigger ?? step.animationId}`);
      },
      walkTo: vi.fn(),
      waitForEvent: () => ({
        source: 'purpose-event',
        event: 'fileAction:resolved',
        timestamp: Date.now(),
        payload: { outcome: 'selected' }
      }),
      speak: vi.fn(),
      showToast: (step) => {
        calls.push(`toast:${step.content}`);
      }
    });

    const result = await runner.run({
      id: 'routine-branch',
      purposeId: 'purpose-branch',
      source: 'preset',
      status: 'queued',
      steps: [
        { id: 'wait-menu', type: 'waitForEvent', event: 'fileAction:resolved', assignTo: 'menuResult' },
        {
          id: 'branch',
          type: 'branch',
          by: 'menuResult.payload.outcome',
          cases: {
            selected: [
              { id: 'success', type: 'playAnimation', trigger: 'success', durationMs: 1, waitFor: 'duration' },
              { id: 'toast', type: 'showToast', content: '交给我吧。' }
            ],
            cancelled: [{ id: 'confused', type: 'playAnimation', trigger: 'confused', durationMs: 1, waitFor: 'duration' }]
          }
        }
      ],
      cursor: 0,
      createdAt: Date.now()
    });

    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => step.stepId)).toEqual(['wait-menu', 'success', 'toast', 'branch']);
    expect(calls).toEqual(['play:success', 'toast:交给我吧。']);
  });

  it('updates busy from assigned workflow progress events and skips optional timeouts', async () => {
    let waits = 0;
    const calls: string[] = [];
    const runner = new SpriteRoutineRunner({
      playAnimation: vi.fn(),
      walkTo: vi.fn(),
      waitForEvent: (step) => {
        waits += 1;
        if (waits === 1) {
          return {
            source: 'app-event',
            event: step.event,
            timestamp: Date.now(),
            payload: { runId: 'run-1', progress: 37, message: '转录中' }
          };
        }
        throw new SpritePurposeEventTimeoutError(step.event);
      },
      speak: vi.fn(),
      showToast: vi.fn(),
      updateBusy: (step) => {
        calls.push(`busy:${step.progress}:${step.content}`);
      }
    });

    const result = await runner.run({
      id: 'routine-progress',
      purposeId: 'purpose-progress',
      source: 'preset',
      status: 'queued',
      steps: [
        {
          id: 'wait-progress',
          type: 'waitForEvent',
          source: 'app-event',
          event: 'SPRITE_WORKFLOW_PROGRESS',
          match: { runId: 'run-1' },
          timeoutMs: 100,
          assignTo: 'workflowProgress',
          optional: true,
          ignoreHistory: true
        },
        {
          id: 'busy-progress',
          type: 'updateBusy',
          progressFrom: 'workflowProgress.payload.progress',
          contentFrom: 'workflowProgress.payload.message'
        },
        {
          id: 'wait-progress-timeout',
          type: 'waitForEvent',
          source: 'app-event',
          event: 'SPRITE_WORKFLOW_PROGRESS',
          match: { runId: 'run-1' },
          timeoutMs: 100,
          assignTo: 'workflowProgress',
          optional: true,
          ignoreHistory: true
        },
        {
          id: 'busy-progress-timeout',
          type: 'updateBusy',
          progressFrom: 'workflowProgress.payload.progress',
          contentFrom: 'workflowProgress.payload.message'
        }
      ],
      cursor: 0,
      createdAt: Date.now()
    });

    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => [step.stepId, step.status])).toEqual([
      ['wait-progress', 'completed'],
      ['busy-progress', 'completed'],
      ['wait-progress-timeout', 'skipped'],
      ['busy-progress-timeout', 'completed']
    ]);
    expect(result.steps.find((step) => step.stepId === 'wait-progress-timeout')?.value).toMatchObject({
      reason: 'timeout',
      event: 'SPRITE_WORKFLOW_PROGRESS',
      source: 'app-event'
    });
    expect(calls).toEqual(['busy:37:转录中']);
  });

  it('opens windows through an injected routine adapter', async () => {
    const calls: Array<{ window: string; payload?: Record<string, unknown> }> = [];
    const runner = new SpriteRoutineRunner({
      playAnimation: vi.fn(),
      walkTo: vi.fn(),
      speak: vi.fn(),
      showToast: vi.fn(),
      openWindow: (step) => {
        calls.push({ window: step.window, payload: step.payload });
      }
    });

    const result = await runner.run({
      id: 'routine-window',
      purposeId: 'purpose-window',
      source: 'preset',
      status: 'queued',
      steps: [{ id: 'open-menu', type: 'openWindow', window: 'fileActionsMenu', payload: { correlationId: 'drop-1' } }],
      cursor: 0,
      createdAt: Date.now()
    });

    expect(result.ok).toBe(true);
    expect(calls).toEqual([{ window: 'fileActionsMenu', payload: { correlationId: 'drop-1' } }]);
  });

  it('loops body steps until one terminal event resolves', async () => {
    const resolveTerminals: Array<(event: any) => void> = [];
    const calls: string[] = [];
    const runner = new SpriteRoutineRunner({
      playAnimation: vi.fn(),
      walkTo: vi.fn(),
      waitForEvent: (step, signal) =>
        new Promise((resolve) => {
          resolveTerminals.push(resolve);
          signal.addEventListener('abort', () => resolve(null as any), { once: true });
          calls.push(`wait:${step.event}`);
        }),
      speak: vi.fn(),
      showToast: (step) => {
        calls.push(`toast:${step.content}`);
        resolveTerminals[0]?.({
          source: 'app-event',
          event: 'SPRITE_WORKFLOW_COMPLETE',
          timestamp: Date.now(),
          payload: { runId: 'run-1' }
        });
      }
    });

    const result = await runner.run({
      id: 'routine-loop',
      purposeId: 'purpose-loop',
      source: 'preset',
      status: 'queued',
      steps: [
        {
          id: 'loop',
          type: 'loopUntil',
          source: 'app-event',
          untilEvent: ['SPRITE_WORKFLOW_COMPLETE', 'SPRITE_WORKFLOW_FAIL'],
          match: { runId: 'run-1' },
          assignTo: 'workflowResult',
          body: [{ id: 'waiting-toast', type: 'showToast', content: '等待中' }]
        },
        {
          id: 'branch',
          type: 'branch',
          by: 'workflowResult.event.event',
          cases: {
            SPRITE_WORKFLOW_COMPLETE: [{ id: 'done-toast', type: 'showToast', content: '完成' }]
          }
        }
      ],
      cursor: 0,
      createdAt: Date.now()
    });

    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => step.stepId)).toEqual(['waiting-toast', 'loop', 'done-toast', 'branch']);
    expect(calls).toEqual(['wait:SPRITE_WORKFLOW_COMPLETE', 'wait:SPRITE_WORKFLOW_FAIL', 'toast:等待中', 'toast:完成']);
  });

  it('skips repeated loop speak steps until their cooldown expires', async () => {
    let now = 0;
    let iterations = 0;
    const resolveTerminals: Array<(event: any) => void> = [];
    const calls: string[] = [];
    const runner = new SpriteRoutineRunner({
      now: () => now,
      playAnimation: vi.fn(),
      walkTo: vi.fn(),
      waitForEvent: (step, signal) =>
        new Promise((resolve) => {
          resolveTerminals.push(resolve);
          signal.addEventListener('abort', () => resolve(null as any), { once: true });
          calls.push(`wait:${step.event}`);
        }),
      speak: (step) => {
        calls.push(`speak:${step.text}`);
      },
      showToast: () => {
        iterations += 1;
        now += 600;
        calls.push(`tick:${iterations}`);
        if (iterations >= 3) {
          resolveTerminals[0]?.({
            source: 'app-event',
            event: 'SPRITE_WORKFLOW_COMPLETE',
            timestamp: now,
            payload: { runId: 'run-1' }
          });
        }
      }
    });

    const result = await runner.run({
      id: 'routine-loop-speak',
      purposeId: 'purpose-loop-speak',
      source: 'preset',
      status: 'queued',
      steps: [
        {
          id: 'loop',
          type: 'loopUntil',
          source: 'app-event',
          untilEvent: 'SPRITE_WORKFLOW_COMPLETE',
          match: { runId: 'run-1' },
          body: [
            { id: 'progress-speak', type: 'speak', text: '还在等。', cooldownKey: 'workflow-progress', cooldownMs: 1000 },
            { id: 'tick', type: 'showToast', content: 'tick' }
          ]
        }
      ],
      cursor: 0,
      createdAt: Date.now()
    });

    expect(result.ok).toBe(true);
    expect(result.steps.filter((step) => step.stepId === 'progress-speak').map((step) => step.status)).toEqual(['completed', 'skipped', 'completed']);
    expect(calls).toEqual(['wait:SPRITE_WORKFLOW_COMPLETE', 'speak:还在等。', 'tick:1', 'tick:2', 'speak:还在等。', 'tick:3']);
  });

  it('passes ignoreHistory from loopUntil to terminal event waits', async () => {
    const seen: Array<{ event: string; ignoreHistory?: boolean }> = [];
    const runner = new SpriteRoutineRunner({
      playAnimation: vi.fn(),
      walkTo: vi.fn(),
      waitForEvent: (step) => {
        seen.push({ event: step.event, ignoreHistory: step.ignoreHistory });
        return {
          source: 'app-event',
          event: step.event,
          timestamp: Date.now()
        };
      },
      speak: vi.fn(),
      showToast: vi.fn()
    });

    const result = await runner.run({
      id: 'routine-loop-ignore-history',
      purposeId: 'purpose-loop-ignore-history',
      source: 'preset',
      status: 'queued',
      steps: [
        {
          id: 'loop',
          type: 'loopUntil',
          source: 'app-event',
          untilEvent: ['WORKSPACE_CREATED', 'WORKSPACE_WIZARD_CLOSED'],
          ignoreHistory: true,
          body: []
        }
      ],
      cursor: 0,
      createdAt: Date.now()
    });

    expect(result.ok).toBe(true);
    expect(seen).toEqual([
      { event: 'WORKSPACE_CREATED', ignoreHistory: true },
      { event: 'WORKSPACE_WIZARD_CLOSED', ignoreHistory: true }
    ]);
  });
});

describe('SpritePurposeManager', () => {
  it('starts a preset routine and returns to an empty current snapshot after completion', async () => {
    const history: SpritePurposeHistoryEntry[] = [];
    const preset: SpriteRoutinePresetDefinition = {
      id: 'test.rest',
      title: '测试休息',
      purposeKind: 'daily.rest-reminder',
      defaultPriority: 60,
      steps: [
        { id: 'walk', type: 'walkTo', target: 'center' },
        { id: 'speak', type: 'speak', text: '休息一下吧。' }
      ]
    };
    const runner = new SpriteRoutineRunner({
      playAnimation: vi.fn(),
      walkTo: vi.fn(),
      speak: vi.fn(),
      showToast: vi.fn()
    });
    const manager = new SpritePurposeManager({
      runner,
      presets: new SpriteRoutinePresetRegistry([preset]),
      history: {
        append(entry) {
          history.push(entry);
        }
      },
      idFactory: () => `purpose-${history.length}`
    });

    const started = await manager.start({
      kind: 'daily.rest-reminder',
      reason: '测试成套休息提醒',
      source: 'manual',
      presetId: 'test.rest'
    });

    expect(started.accepted).toBe(true);
    expect(started.status).toBe('started');
    expect(started.routine?.steps.map((step) => step.id)).toEqual(['walk', 'speak']);

    await waitFor(() => manager.getSnapshot().current === null);
    expect(history.map((entry) => entry.eventType)).toEqual(['purpose:created', 'purpose:started', 'routine:started', 'routine:completed', 'purpose:completed']);
  });

  it('runs an injected AI planned routine without requiring a preset', async () => {
    const history: SpritePurposeHistoryEntry[] = [];
    const calls: string[] = [];
    const runner = new SpriteRoutineRunner({
      playAnimation: vi.fn(),
      walkTo: vi.fn(),
      speak: vi.fn(),
      showToast: (step) => {
        calls.push(`toast:${step.content}`);
      }
    });
    const manager = new SpritePurposeManager({
      runner,
      history: {
        append(entry) {
          history.push(entry);
        }
      },
      idFactory: () => 'purpose-ai',
      routinePlanner: (purpose) =>
        createSpriteRoutineFromPlannerDraft(
          purpose,
          {
            steps: [{ id: 'ai-toast', type: 'showToast', content: 'planned hello', duration: 1 }]
          },
          1234
        )
    });

    const started = await manager.start({
      kind: 'ai.experimental',
      reason: 'AI planned live routine',
      source: 'ai'
    });

    expect(started.status).toBe('started');
    expect(started.routine).toMatchObject({
      id: 'routine-purpose-ai-ai',
      source: 'ai',
      purposeId: 'purpose-ai',
      createdAt: 1234
    });
    await waitFor(() => manager.getSnapshot().current === null);
    expect(calls).toEqual(['toast:planned hello']);
    expect(history.find((entry) => entry.eventType === 'routine:started')).toMatchObject({
      source: 'ai',
      routineId: 'routine-purpose-ai-ai'
    });
  });

  it('falls back to the preset routine when an injected planner fails', async () => {
    const history: SpritePurposeHistoryEntry[] = [];
    const calls: string[] = [];
    const preset: SpriteRoutinePresetDefinition = {
      id: 'test.fallback',
      title: 'Fallback',
      purposeKind: 'daily.rest-reminder',
      defaultPriority: 60,
      steps: [{ id: 'fallback-toast', type: 'showToast', content: 'preset fallback', duration: 1 }]
    };
    const runner = new SpriteRoutineRunner({
      playAnimation: vi.fn(),
      walkTo: vi.fn(),
      speak: vi.fn(),
      showToast: (step) => {
        calls.push(`toast:${step.content}`);
      }
    });
    const manager = new SpritePurposeManager({
      runner,
      presets: new SpriteRoutinePresetRegistry([preset]),
      history: {
        append(entry) {
          history.push(entry);
        }
      },
      idFactory: () => 'purpose-fallback',
      routinePlanner: () => {
        throw new Error('planner down');
      }
    });

    const started = await manager.start({
      kind: 'daily.rest-reminder',
      reason: 'planner should fall back',
      source: 'ai',
      presetId: 'test.fallback'
    });

    expect(started.status).toBe('started');
    expect(started.routine?.source).toBe('preset');
    await waitFor(() => manager.getSnapshot().current === null);
    expect(calls).toEqual(['toast:preset fallback']);
    expect(history.find((entry) => entry.eventType === 'planner:fallback')).toMatchObject({
      purposeId: 'purpose-fallback',
      purposeKind: 'daily.rest-reminder',
      status: 'fallback',
      result: {
        reason: 'routine-planner-error',
        fallbackPresetId: 'test.fallback'
      },
      error: 'planner down'
    });
  });

  it('falls back to the preset routine when an AI planned routine fails during execution', async () => {
    const history: SpritePurposeHistoryEntry[] = [];
    const calls: string[] = [];
    const preset: SpriteRoutinePresetDefinition = {
      id: 'test.execution-fallback',
      title: 'Execution fallback',
      purposeKind: 'daily.rest-reminder',
      defaultPriority: 60,
      steps: [{ id: 'fallback-toast', type: 'showToast', content: 'preset execution fallback', duration: 1 }]
    };
    const runner = new SpriteRoutineRunner({
      playAnimation: vi.fn(),
      walkTo: (step) => {
        calls.push(`walk:${typeof step.target === 'string' ? step.target : 'point'}`);
        throw new Error('Walk step timed out');
      },
      speak: vi.fn(),
      showToast: (step) => {
        calls.push(`toast:${step.content}`);
      }
    });
    const manager = new SpritePurposeManager({
      runner,
      presets: new SpriteRoutinePresetRegistry([preset]),
      history: {
        append(entry) {
          history.push(entry);
        }
      },
      idFactory: () => 'purpose-execution-fallback',
      routinePlanner: (purpose) =>
        createSpriteRoutineFromPlannerDraft(
          purpose,
          {
            steps: [{ id: 'ai-walk', type: 'walkTo', target: 'center', timeoutMs: 1 }]
          },
          1234
        )
    });

    const started = await manager.start({
      kind: 'daily.rest-reminder',
      reason: 'AI execution should fall back',
      source: 'ai',
      presetId: 'test.execution-fallback'
    });

    expect(started.status).toBe('started');
    expect(started.routine?.source).toBe('ai');
    await waitFor(() => manager.getSnapshot().current === null);
    expect(calls).toEqual(['walk:center', 'toast:preset execution fallback']);
    expect(history.filter((entry) => entry.eventType === 'routine:started').map((entry) => entry.source)).toEqual(['ai', 'preset']);
    expect(history.find((entry) => entry.eventType === 'routine:failed')).toMatchObject({
      purposeId: 'purpose-execution-fallback',
      routineId: 'routine-purpose-execution-fallback-ai',
      source: 'ai',
      error: 'Walk step timed out'
    });
    expect(history.find((entry) => entry.eventType === 'planner:fallback')).toMatchObject({
      purposeId: 'purpose-execution-fallback',
      routineId: 'routine-purpose-execution-fallback-ai',
      status: 'fallback',
      summary: 'ai-routine-execution-failed',
      result: {
        reason: 'ai-routine-execution-failed',
        fallbackPresetId: 'test.execution-fallback',
        failedRoutineId: 'routine-purpose-execution-fallback-ai',
        failedStepId: 'ai-walk',
        failedStatus: 'failed',
        stepCount: 1
      },
      error: 'Walk step timed out'
    });
    expect(history.at(-1)).toMatchObject({
      eventType: 'purpose:completed',
      purposeId: 'purpose-execution-fallback',
      status: 'completed'
    });
  });
});

describe('SpriteRoutinePresetRegistry', () => {
  it('keeps rest reminders in-place unless a planner explicitly chooses movement', () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('daily.rest-reminder');
    expect(preset).toBeDefined();

    const routine = registry.createRoutine(
      {
        id: 'purpose-rest',
        kind: 'daily.rest-reminder',
        title: 'rest reminder',
        reason: 'time to rest',
        source: 'behavior',
        status: 'active',
        priority: 60,
        interruptPolicy: 'interruptible'
      },
      preset!,
      1000
    );

    expect(routine.steps.map((step) => step.id)).toEqual(['attention', 'speak', 'pause', 'tired']);
    expect(routine.steps.some((step) => step.type === 'walkTo')).toBe(false);
  });

  it('creates file drop invite routines that walk to center and wait for drop or leave', () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('file.drop.invite');
    expect(preset).toBeDefined();

    const routine = registry.createRoutine(
      {
        id: 'purpose-file-invite',
        kind: 'file.drop.invite',
        title: '文件投递等待',
        reason: '用户正在拖文件',
        source: 'user-event',
        status: 'active',
        priority: 85,
        interruptPolicy: 'interruptible',
        correlationId: 'drag-1'
      },
      preset!,
      1000
    );

    expect(preset!.defaultPriority).toBe(85);
    expect(routine.steps.map((step) => step.id)).toEqual(['invite-go-center', 'invite-ready', 'wait-file-drop-or-leave', 'drag-result-branch']);
    expect(routine.steps[0]).toMatchObject({ type: 'walkTo', target: 'center' });
    expect(routine.steps.find((step) => step.id === 'wait-file-drop-or-leave')).toMatchObject({
      type: 'loopUntil',
      source: 'sprite-event-bus',
      untilEvent: ['interact:file-drop', 'interact:file-drag-leave'],
      assignTo: 'dragResult'
    });
    expect(routine.steps.find((step) => step.id === 'drag-result-branch')).toMatchObject({
      type: 'branch',
      by: 'dragResult.event.event'
    });
  });

  it('creates file drop intake routines with correlation-aware event waits', () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('file.drop.intake');
    expect(preset).toBeDefined();

    const routine = registry.createRoutine(
      {
        id: 'purpose-file',
        kind: 'file.drop.intake',
        title: '文件投递接收',
        reason: '用户拖入文件',
        source: 'user-event',
        status: 'active',
        priority: 70,
        interruptPolicy: 'interruptible',
        correlationId: 'drop-1'
      },
      preset!,
      1000
    );

    expect(preset!.defaultPriority).toBe(100);
    expect(routine.steps.map((step) => step.id)).toContain('wait-menu-result');
    expect(routine.steps.find((step) => step.id === 'open-file-actions-menu')).toMatchObject({
      type: 'openWindow',
      window: 'fileActionsMenu',
      payload: { files: [], resources: [], source: 'drop', correlationId: 'drop-1' }
    });
    expect(routine.steps.find((step) => step.id === 'wait-menu-result')).toMatchObject({
      type: 'waitForEvent',
      event: 'fileAction:resolved',
      assignTo: 'menuResult',
      match: { correlationId: 'drop-1' }
    });
    expect(routine.steps.find((step) => step.id === 'result-branch')).toMatchObject({
      type: 'branch',
      by: 'menuResult.payload.outcome'
    });
  });

  it('runs the cancelled file drop branch to confused animation and return', async () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('file.drop.intake');
    expect(preset).toBeDefined();
    const calls: string[] = [];
    const routine = registry.createRoutine(
      {
        id: 'purpose-file',
        kind: 'file.drop.intake',
        title: 'file drop intake',
        reason: 'user dropped files',
        source: 'user-event',
        status: 'active',
        priority: 100,
        interruptPolicy: 'interruptible',
        correlationId: 'drop-1',
        context: {
          files: [{ name: 'notes.docx', path: 'F:/tmp/notes.docx' }],
          resources: [{ id: 'resource-1', title: 'notes.docx', filePath: 'F:/tmp/notes.docx' }]
        }
      },
      preset!,
      1000
    );
    const runner = new SpriteRoutineRunner({
      playAnimation: (step) => {
        calls.push(`play:${step.trigger ?? step.animationId}`);
      },
      walkTo: (step) => {
        calls.push(`walk:${typeof step.target === 'string' ? step.target : 'point'}`);
      },
      waitForEvent: () => ({
        source: 'purpose-event',
        event: 'fileAction:resolved',
        correlationId: 'drop-1',
        timestamp: Date.now(),
        payload: { outcome: 'cancelled', reason: 'menu-closed' }
      }),
      speak: vi.fn(),
      showToast: (step) => {
        calls.push(`toast:${step.category ?? 'none'}`);
      },
      openWindow: (step) => {
        calls.push(`open:${step.window}:${String(step.payload?.correlationId)}`);
      }
    });

    const result = await runner.run(routine);

    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => step.stepId)).toEqual([
      'ack-drop',
      'thinking',
      'prompt-action',
      'open-file-actions-menu',
      'wait-menu-result',
      'cancelled-confused',
      'cancelled-toast',
      'result-branch',
      'return-corner'
    ]);
    expect(calls).toContain('open:fileActionsMenu:drop-1');
    expect(calls).toContain('play:confused');
    expect(calls).toContain('toast:cancellation');
    expect(calls).toContain('walk:corner');
  });

  it('runs the failed file drop branch to failure animation and return', async () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('file.drop.intake');
    expect(preset).toBeDefined();
    const calls: string[] = [];
    const routine = registry.createRoutine(
      {
        id: 'purpose-file',
        kind: 'file.drop.intake',
        title: 'file drop intake',
        reason: 'user dropped files',
        source: 'user-event',
        status: 'active',
        priority: 100,
        interruptPolicy: 'interruptible',
        correlationId: 'drop-1',
        context: {
          files: [{ name: 'voice.mp3', path: 'F:/tmp/voice.mp3' }],
          resources: [{ id: 'resource-1', title: 'voice.mp3', filePath: 'F:/tmp/voice.mp3' }]
        }
      },
      preset!,
      1000
    );
    const runner = new SpriteRoutineRunner({
      playAnimation: (step) => {
        calls.push(`play:${step.trigger ?? step.animationId}`);
      },
      walkTo: (step) => {
        calls.push(`walk:${typeof step.target === 'string' ? step.target : 'point'}`);
      },
      waitForEvent: () => ({
        source: 'purpose-event',
        event: 'fileAction:resolved',
        correlationId: 'drop-1',
        timestamp: Date.now(),
        payload: { outcome: 'failed', error: 'workflow exploded' }
      }),
      speak: vi.fn(),
      showToast: (step) => {
        calls.push(`toast:${step.category ?? 'none'}`);
      },
      openWindow: (step) => {
        calls.push(`open:${step.window}:${String(step.payload?.correlationId)}`);
      }
    });

    const result = await runner.run(routine);

    expect(result.ok).toBe(true);
    expect(result.steps.map((step) => step.stepId)).toEqual([
      'ack-drop',
      'thinking',
      'prompt-action',
      'open-file-actions-menu',
      'wait-menu-result',
      'failed-reaction',
      'failed-toast',
      'result-branch',
      'return-corner'
    ]);
    expect(calls).toContain('open:fileActionsMenu:drop-1');
    expect(calls).toContain('play:failure');
    expect(calls).toContain('toast:failure');
    expect(calls).toContain('walk:corner');
  });

  it('creates workflow waiting routines that loop until terminal workflow events', () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('workflow.waiting');
    expect(preset).toBeDefined();

    const routine = registry.createRoutine(
      {
        id: 'purpose-workflow',
        kind: 'workflow.waiting',
        title: '工作流等待',
        reason: '等待工作流完成',
        source: 'app-event',
        status: 'active',
        priority: 65,
        interruptPolicy: 'interruptible',
        context: {
          workflowRunId: 'run-1',
          workflowName: '整理文档'
        }
      },
      preset!,
      1000
    );

    expect(routine.steps.find((step) => step.id === 'wait-workflow-terminal')).toMatchObject({
      type: 'loopUntil',
      source: 'app-event',
      untilEvent: ['SPRITE_WORKFLOW_COMPLETE', 'SPRITE_WORKFLOW_FAIL', 'SPRITE_WORKFLOW_CANCEL'],
      match: { runId: 'run-1' },
      assignTo: 'workflowResult'
    });
    expect(routine.steps.find((step) => step.id === 'workflow-result-branch')).toMatchObject({
      type: 'branch',
      by: 'workflowResult.event.event'
    });
    const loopStep = routine.steps.find((step) => step.id === 'wait-workflow-terminal');
    expect(loopStep).toMatchObject({
      type: 'loopUntil',
      body: expect.arrayContaining([
        expect.objectContaining({
          id: 'wait-workflow-progress',
          type: 'waitForEvent',
          event: 'SPRITE_WORKFLOW_PROGRESS',
          optional: true,
          ignoreHistory: true,
          assignTo: 'workflowProgress'
        }),
        expect.objectContaining({
          id: 'busy-progress',
          type: 'updateBusy',
          progressFrom: 'workflowProgress.payload.progress',
          contentFrom: 'workflowProgress.payload.message'
        }),
        expect.objectContaining({
          id: 'waiting-speak',
          type: 'speak',
          cooldownKey: 'workflow.waiting.progress',
          cooldownMs: 60_000
        })
      ])
    });
  });

  it('creates resource import waiting routines that consume progress and terminal app events', () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('resource.import.waiting');
    expect(preset).toBeDefined();

    const routine = registry.createRoutine(
      {
        id: 'purpose-resource',
        kind: 'resource.import.waiting',
        title: 'resource import waiting',
        reason: 'wait for resource import',
        source: 'app-event',
        status: 'active',
        priority: 65,
        interruptPolicy: 'interruptible',
        context: {
          resourceId: 'resource-1',
          workspaceId: 'workspace-1'
        }
      },
      preset!,
      1000
    );

    expect(routine.steps.find((step) => step.id === 'wait-resource-terminal')).toMatchObject({
      type: 'loopUntil',
      source: 'app-event',
      untilEvent: ['SPRITE_RESOURCE_IMPORT_COMPLETE', 'SPRITE_RESOURCE_IMPORT_ERROR'],
      match: { resourceId: 'resource-1', workspaceId: 'workspace-1' },
      assignTo: 'resourceResult'
    });
    expect(routine.steps.find((step) => step.id === 'resource-result-branch')).toMatchObject({
      type: 'branch',
      by: 'resourceResult.event.event'
    });
    const loopStep = routine.steps.find((step) => step.id === 'wait-resource-terminal');
    expect(loopStep).toMatchObject({
      type: 'loopUntil',
      body: expect.arrayContaining([
        expect.objectContaining({
          id: 'wait-resource-progress',
          type: 'waitForEvent',
          event: 'SPRITE_RESOURCE_IMPORT_PROGRESS',
          optional: true,
          ignoreHistory: true,
          assignTo: 'resourceProgress'
        }),
        expect.objectContaining({
          id: 'busy-progress',
          type: 'updateBusy',
          progressFrom: 'resourceProgress.payload.progress',
          contentFrom: 'resourceProgress.payload.message'
        })
      ])
    });
  });

  it('creates daily care reminder routines from routine dispatch context', () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('daily.care.reminder');
    expect(preset).toBeDefined();

    const routine = registry.createRoutine(
      {
        id: 'purpose-daily-care',
        kind: 'daily.care.reminder',
        title: 'daily care reminder',
        reason: 'Drink water',
        source: 'system-event',
        status: 'active',
        priority: 55,
        interruptPolicy: 'interruptible',
        context: {
          routineId: 'care:hydration-hourly',
          routineKind: 'hydration',
          severity: 'gentle',
          message: 'Drink water'
        }
      },
      preset!,
      1000
    );

    expect(routine.steps).toEqual([
      expect.objectContaining({
        id: 'care-attention',
        type: 'playAnimation',
        trigger: 'wave'
      }),
      expect.objectContaining({
        id: 'care-speak',
        type: 'speak',
        text: 'Drink water',
        cooldownKey: 'daily.care.care:hydration-hourly'
      }),
      expect.objectContaining({
        id: 'care-settle',
        type: 'wait'
      })
    ]);
  });

  it('creates workspace onboarding routines that repeatedly prompt and move near the wizard', () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('onboarding.workspace.create');
    expect(preset).toBeDefined();

    const routine = registry.createRoutine(
      {
        id: 'purpose-workspace-onboarding',
        kind: 'onboarding.workspace.create',
        title: 'workspace onboarding',
        reason: 'no workspace',
        source: 'system-event',
        status: 'active',
        priority: 70,
        interruptPolicy: 'urgent'
      },
      preset!,
      1000
    );

    expect(routine.steps.find((step) => step.id === 'workspace-onboarding-loop')).toMatchObject({
      type: 'loopUntil',
      source: 'app-event',
      untilEvent: 'WORKSPACE_CREATED',
      assignTo: 'workspaceCreatedEvent'
    });
    expect(routine.steps).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'invite-notice', type: 'showNotice', messageId: 'onboarding.workspace.create.invite' })]));
    const loop = routine.steps.find((step) => step.id === 'workspace-onboarding-loop');
    expect(loop).toMatchObject({
      type: 'loopUntil',
      body: expect.arrayContaining([
        expect.objectContaining({
          id: 'wait-create-bubble-event',
          type: 'loopUntil',
          source: 'purpose-event',
          untilEvent: ['bubble:action', 'bubble:dismissed'],
          match: { messageId: 'onboarding.workspace.create.invite' }
        })
      ])
    });
    const handleBranch = loop && loop.type === 'loopUntil' ? loop.body.find((step) => step.id === 'handle-bubble-event') : undefined;
    expect(handleBranch).toMatchObject({ type: 'branch', by: 'workspaceBubbleEvent.event.event' });
    const actionBranch = handleBranch?.type === 'branch' ? handleBranch.cases['bubble:action']?.find((step) => step.id === 'open-wizard-after-click') : undefined;
    expect(actionBranch).toMatchObject({ type: 'branch', by: 'workspaceBubbleEvent.event.payload.purposeAction' });
    const openBranchSteps = actionBranch?.type === 'branch' ? actionBranch.cases['open-wizard'] : undefined;
    expect(openBranchSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'clear-invite-after-click', type: 'clearMessage', messageId: 'onboarding.workspace.create.invite', messageType: 'notice' }),
        expect.objectContaining({ id: 'open-wizard', type: 'openWindow', window: 'workspaceWizard' }),
        expect.objectContaining({ id: 'walk-near-wizard', type: 'walkTo', target: { window: 'workspaceWizard', placement: 'right', offset: 16 } }),
        expect.objectContaining({
          id: 'await-wizard-result',
          type: 'loopUntil',
          untilEvent: ['WORKSPACE_CREATED', 'WORKSPACE_WIZARD_CLOSED'],
          body: expect.arrayContaining([
            expect.objectContaining({
              id: 'speak-workspace-intro',
              type: 'speak',
              text: '工作空间会存放所有重要的数据。',
              cooldownKey: 'onboarding.workspace.create.workspace-intro'
            }),
            expect.objectContaining({
              id: 'speak-workspace-quickstart-tip',
              type: 'speak',
              text: '这里可以先用快速创建，默认目录就能开始；以后也可以再调整。',
              cooldownKey: 'onboarding.workspace.create.quickstart-tip'
            })
          ])
        })
      ])
    );
    expect(routine.steps.find((step) => step.id === 'branch-result')).toMatchObject({
      type: 'branch',
      by: 'workspaceCreatedEvent.event.event'
    });
  });

  it('keeps the workspace onboarding loop alive after the wizard is closed without creation', async () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('onboarding.workspace.create');
    expect(preset).toBeDefined();

    const routine = registry.createRoutine(
      {
        id: 'purpose-workspace-onboarding',
        kind: 'onboarding.workspace.create',
        title: 'workspace onboarding',
        reason: 'no workspace',
        source: 'system-event',
        status: 'active',
        priority: 70,
        interruptPolicy: 'urgent'
      },
      preset!,
      1000
    );
    const calls: string[] = [];
    let closeWaits = 0;
    let clickCount = 0;
    let workspaceCreatedResolvers: Array<(event: any) => void> = [];
    const workspaceCreatedEvent = {
      source: 'app-event' as const,
      event: 'WORKSPACE_CREATED',
      timestamp: Date.now(),
      payload: { id: 'workspace-1' }
    };
    const pending = (signal?: AbortSignal): Promise<any> =>
      new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException('Routine cancelled', 'AbortError'));
          return;
        }
        signal?.addEventListener('abort', () => reject(new DOMException('Routine cancelled', 'AbortError')), { once: true });
      });
    const emitWorkspaceCreated = (): void => {
      const resolvers = workspaceCreatedResolvers;
      workspaceCreatedResolvers = [];
      for (const resolve of resolvers) {
        resolve(workspaceCreatedEvent);
      }
    };
    const runner = new SpriteRoutineRunner({
      playAnimation: (step) => {
        calls.push(`play:${step.trigger ?? step.animationId}`);
      },
      walkTo: (step) => {
        calls.push(`walk:${typeof step.target === 'string' ? step.target : 'window' in step.target ? step.target.window : 'point'}`);
      },
      speak: (step) => {
        calls.push(`speak:${step.text}`);
      },
      showToast: vi.fn(),
      showNotice: (step) => {
        calls.push(`notice:${step.messageId}:${step.content}`);
      },
      clearMessage: (step) => {
        calls.push(`clear:${step.messageId ?? step.messageType}`);
      },
      openWindow: (step) => {
        calls.push(`open:${step.window}`);
      },
      waitForEvent: (step, signal) => {
        if (step.event === 'bubble:action') {
          clickCount += 1;
          if (clickCount === 2) {
            setTimeout(emitWorkspaceCreated, 0);
          }
          return {
            source: 'purpose-event',
            event: 'bubble:action',
            timestamp: Date.now(),
            payload: { messageId: 'onboarding.workspace.create.invite', purposeAction: 'open-wizard', actionId: 'focus-wizard' }
          };
        }
        if (step.event === 'bubble:dismissed') {
          return pending(signal);
        }
        if (step.event === 'WORKSPACE_WIZARD_CLOSED') {
          closeWaits += 1;
          if (closeWaits === 1) {
            return {
              source: 'app-event',
              event: 'WORKSPACE_WIZARD_CLOSED',
              timestamp: Date.now(),
              payload: { reason: 'window-unmounted' }
            };
          }
          return pending(signal);
        }
        if (step.event === 'WORKSPACE_CREATED') {
          return new Promise((resolve, reject) => {
            if (signal?.aborted) {
              reject(new DOMException('Routine cancelled', 'AbortError'));
              return;
            }
            signal?.addEventListener('abort', () => reject(new DOMException('Routine cancelled', 'AbortError')), { once: true });
            workspaceCreatedResolvers.push(resolve);
          });
        }
        return pending(signal);
      },
      setTimeout,
      clearTimeout
    });

    const result = await runner.run(routine);

    expect(result.ok).toBe(true);
    expect(calls).toEqual(
      expect.arrayContaining([
        'notice:onboarding.workspace.create.invite:没有找到工作空间，点这里立即创建吧。',
        'open:workspaceWizard',
        'walk:workspaceWizard',
        'notice:onboarding.workspace.create.invite:还没有创建工作空间哦。先点这里创建一个吧。',
        'clear:onboarding.workspace.create.invite',
        'play:celebrate',
        'speak:工作空间建好啦！我可以做更多事情啦。'
      ])
    );
  });

  it('speaks workspace purpose guidance while the creation wizard stays open', async () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('onboarding.workspace.create');
    expect(preset).toBeDefined();

    const routine = registry.createRoutine(
      {
        id: 'purpose-workspace-onboarding',
        kind: 'onboarding.workspace.create',
        title: 'workspace onboarding',
        reason: 'no workspace',
        source: 'system-event',
        status: 'active',
        priority: 70,
        interruptPolicy: 'urgent'
      },
      preset!,
      1000
    );
    const calls: string[] = [];
    let clicked = false;
    let workspaceCreatedResolvers: Array<(event: any) => void> = [];
    const workspaceCreatedEvent = {
      source: 'app-event' as const,
      event: 'WORKSPACE_CREATED',
      timestamp: Date.now(),
      payload: { id: 'workspace-1' }
    };
    const pending = (signal?: AbortSignal): Promise<any> =>
      new Promise((_, reject) => {
        if (signal?.aborted) {
          reject(new DOMException('Routine cancelled', 'AbortError'));
          return;
        }
        signal?.addEventListener('abort', () => reject(new DOMException('Routine cancelled', 'AbortError')), { once: true });
      });
    const emitWorkspaceCreated = (): void => {
      const resolvers = workspaceCreatedResolvers;
      workspaceCreatedResolvers = [];
      for (const resolve of resolvers) {
        resolve(workspaceCreatedEvent);
      }
    };
    const runner = new SpriteRoutineRunner({
      playAnimation: vi.fn(),
      walkTo: (step) => {
        calls.push(`walk:${typeof step.target === 'string' ? step.target : 'window' in step.target ? step.target.window : 'point'}`);
      },
      speak: (step) => {
        calls.push(`speak:${step.id}:${step.text}`);
        if (step.id === 'speak-workspace-quickstart-tip') {
          setTimeout(emitWorkspaceCreated, 0);
        }
      },
      showToast: vi.fn(),
      showNotice: (step) => {
        calls.push(`notice:${step.messageId}:${step.content}`);
      },
      clearMessage: (step) => {
        calls.push(`clear:${step.messageId ?? step.messageType}`);
      },
      openWindow: (step) => {
        calls.push(`open:${step.window}`);
      },
      waitForEvent: (step, signal) => {
        if (step.event === 'bubble:action' && !clicked) {
          clicked = true;
          return {
            source: 'purpose-event',
            event: 'bubble:action',
            timestamp: Date.now(),
            payload: { messageId: 'onboarding.workspace.create.invite', purposeAction: 'open-wizard', actionId: 'focus-wizard' }
          };
        }
        if (step.event === 'WORKSPACE_CREATED') {
          return new Promise((resolve, reject) => {
            if (signal?.aborted) {
              reject(new DOMException('Routine cancelled', 'AbortError'));
              return;
            }
            signal?.addEventListener('abort', () => reject(new DOMException('Routine cancelled', 'AbortError')), { once: true });
            workspaceCreatedResolvers.push(resolve);
          });
        }
        return pending(signal);
      },
      setTimeout: (handler, timeout) => setTimeout(handler, timeout === 800 || timeout === 1000 ? 0 : timeout),
      clearTimeout
    });

    const result = await runner.run(routine);

    expect(result.ok, result.error).toBe(true);
    expect(calls).toEqual(
      expect.arrayContaining([
        'notice:onboarding.workspace.create.invite:没有找到工作空间，点这里立即创建吧。',
        'open:workspaceWizard',
        'walk:workspaceWizard',
        'speak:speak-workspace-intro:工作空间会存放所有重要的数据。',
        'speak:speak-workspace-quickstart-tip:这里可以先用快速创建，默认目录就能开始；以后也可以再调整。',
        'clear:onboarding.workspace.create.invite',
        'speak:speak-done:工作空间建好啦！我可以做更多事情啦。'
      ])
    );
  });

  it('does not re-prompt workspace onboarding while the invite bubble stays open', async () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('onboarding.workspace.create');
    const routine = registry.createRoutine(
      {
        id: 'purpose-workspace-onboarding',
        kind: 'onboarding.workspace.create',
        title: 'workspace onboarding',
        reason: 'no workspace',
        source: 'system-event',
        status: 'active',
        priority: 70,
        interruptPolicy: 'urgent'
      },
      preset!,
      1000
    );
    const calls: string[] = [];
    let workspaceCreatedResolver: ((event: any) => void) | undefined;
    const timers: Array<{ timeout: number; handler: () => void }> = [];
    const pendingWorkspaceCreated = (signal?: AbortSignal): Promise<any> =>
      new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException('Routine cancelled', 'AbortError'));
          return;
        }
        signal?.addEventListener('abort', () => reject(new DOMException('Routine cancelled', 'AbortError')), { once: true });
        workspaceCreatedResolver ??= resolve;
      });
    const pendingEvent = (signal?: AbortSignal): Promise<any> =>
      new Promise((_, reject) => {
        if (signal?.aborted) {
          reject(new DOMException('Routine cancelled', 'AbortError'));
          return;
        }
        signal?.addEventListener('abort', () => reject(new DOMException('Routine cancelled', 'AbortError')), { once: true });
      });
    const runner = new SpriteRoutineRunner({
      playAnimation: vi.fn(),
      walkTo: vi.fn(),
      speak: vi.fn(),
      showToast: vi.fn(),
      showNotice: (step) => {
        calls.push(`notice:${step.messageId}`);
      },
      clearMessage: vi.fn(),
      waitForEvent: (step, signal) => {
        if (step.event === 'WORKSPACE_CREATED') {
          return pendingWorkspaceCreated(signal);
        }
        return pendingEvent(signal);
      },
      setTimeout: ((handler: () => void, timeout: number) => {
        timers.push({ timeout, handler });
        return timers.length as any;
      }) as any,
      clearTimeout: vi.fn() as any
    });

    const runPromise = runner.run(routine);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls).toEqual(['notice:onboarding.workspace.create.invite']);
    expect(timers.some((timer) => timer.timeout === 1000)).toBe(true);

    workspaceCreatedResolver?.({
      source: 'app-event',
      event: 'WORKSPACE_CREATED',
      timestamp: Date.now(),
      payload: { id: 'workspace-1' }
    });
    const result = await runPromise;
    expect(result.ok, result.error).toBe(true);
  });

  it('re-prompts mandatory workspace onboarding shortly after the bubble is dismissed', async () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('onboarding.workspace.create');
    const routine = registry.createRoutine(
      {
        id: 'purpose-workspace-onboarding',
        kind: 'onboarding.workspace.create',
        title: 'workspace onboarding',
        reason: 'no workspace',
        source: 'system-event',
        status: 'active',
        priority: 70,
        interruptPolicy: 'urgent'
      },
      preset!,
      1000
    );
    const calls: string[] = [];
    let dismissedResolved = false;
    let workspaceCreatedResolver: ((event: any) => void) | undefined;
    const pendingEvent = (signal?: AbortSignal): Promise<any> =>
      new Promise((_, reject) => {
        if (signal?.aborted) {
          reject(new DOMException('Routine cancelled', 'AbortError'));
          return;
        }
        signal?.addEventListener('abort', () => reject(new DOMException('Routine cancelled', 'AbortError')), { once: true });
      });
    const runner = new SpriteRoutineRunner({
      playAnimation: vi.fn(),
      walkTo: vi.fn(),
      speak: vi.fn(),
      showToast: vi.fn(),
      showNotice: (step) => {
        calls.push(`notice:${step.messageId}`);
      },
      clearMessage: vi.fn(),
      waitForEvent: (step, signal) => {
        if (step.event === 'bubble:action') {
          return pendingEvent(signal);
        }
        if (step.event === 'bubble:dismissed' && !dismissedResolved) {
          dismissedResolved = true;
          return {
            source: 'purpose-event',
            event: 'bubble:dismissed',
            timestamp: Date.now(),
            payload: { messageId: 'onboarding.workspace.create.invite', reason: 'close' }
          };
        }
        if (step.event === 'WORKSPACE_CREATED') {
          return new Promise((resolve, reject) => {
            if (signal?.aborted) {
              reject(new DOMException('Routine cancelled', 'AbortError'));
              return;
            }
            signal?.addEventListener('abort', () => reject(new DOMException('Routine cancelled', 'AbortError')), { once: true });
            workspaceCreatedResolver = resolve;
          });
        }
        return pendingEvent(signal);
      },
      setTimeout: (handler, timeout) => setTimeout(handler, timeout === 5000 ? 0 : timeout),
      clearTimeout
    });

    const runPromise = runner.run(routine);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls).toEqual(['notice:onboarding.workspace.create.invite', 'notice:onboarding.workspace.create.invite']);
    workspaceCreatedResolver?.({
      source: 'app-event',
      event: 'WORKSPACE_CREATED',
      timestamp: Date.now(),
      payload: { id: 'workspace-1' }
    });
    const result = await runPromise;
    expect(result.ok, result.error).toBe(true);
  });

  it('keeps re-prompting mandatory workspace onboarding across repeated bubble dismissals until creation', async () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('onboarding.workspace.create');
    const routine = registry.createRoutine(
      {
        id: 'purpose-workspace-onboarding',
        kind: 'onboarding.workspace.create',
        title: 'workspace onboarding',
        reason: 'no workspace',
        source: 'system-event',
        status: 'active',
        priority: 70,
        interruptPolicy: 'urgent'
      },
      preset!,
      1000
    );
    const calls: string[] = [];
    let dismissedCount = 0;
    let workspaceCreatedResolver: ((event: any) => void) | undefined;
    const pendingEvent = (signal?: AbortSignal): Promise<any> =>
      new Promise((_, reject) => {
        if (signal?.aborted) {
          reject(new DOMException('Routine cancelled', 'AbortError'));
          return;
        }
        signal?.addEventListener('abort', () => reject(new DOMException('Routine cancelled', 'AbortError')), { once: true });
      });
    const runner = new SpriteRoutineRunner({
      playAnimation: vi.fn(),
      walkTo: vi.fn(),
      speak: vi.fn(),
      showToast: vi.fn(),
      showNotice: (step) => {
        calls.push(`notice:${step.messageId}`);
      },
      clearMessage: (step) => {
        calls.push(`clear:${step.messageId}`);
      },
      waitForEvent: (step, signal) => {
        if (step.event === 'bubble:action') {
          return pendingEvent(signal);
        }
        if (step.event === 'bubble:dismissed' && dismissedCount < 2) {
          dismissedCount += 1;
          return {
            source: 'purpose-event',
            event: 'bubble:dismissed',
            timestamp: Date.now(),
            payload: { messageId: 'onboarding.workspace.create.invite', reason: 'close' }
          };
        }
        if (step.event === 'WORKSPACE_CREATED') {
          return new Promise((resolve, reject) => {
            if (signal?.aborted) {
              reject(new DOMException('Routine cancelled', 'AbortError'));
              return;
            }
            signal?.addEventListener('abort', () => reject(new DOMException('Routine cancelled', 'AbortError')), { once: true });
            workspaceCreatedResolver = resolve;
          });
        }
        return pendingEvent(signal);
      },
      setTimeout: (handler, timeout) => setTimeout(handler, timeout === 5000 ? 0 : timeout),
      clearTimeout
    });

    const runPromise = runner.run(routine);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(calls.filter((call) => call === 'notice:onboarding.workspace.create.invite')).toHaveLength(3);
    workspaceCreatedResolver?.({
      source: 'app-event',
      event: 'WORKSPACE_CREATED',
      timestamp: Date.now(),
      payload: { id: 'workspace-1' }
    });
    const result = await runPromise;
    expect(result.ok, result.error).toBe(true);
    expect(calls).toContain('clear:onboarding.workspace.create.invite');
  });
});

describe('SpritePresentationLock', () => {
  it('blocks lower-priority presentation and allows owner, higher priority, and expiry', () => {
    let now = 1000;
    const lock = new SpritePresentationLock(() => now);

    expect(lock.acquire('purpose-high', 80, 500, 'test')).toBe(true);
    expect(lock.shouldAllow({ ownerId: 'purpose-low', priority: 20 })).toBe(false);
    expect(lock.shouldAllow({ ownerId: 'purpose-high', priority: 10 })).toBe(true);
    expect(lock.shouldAllow({ ownerId: 'purpose-urgent', priority: 90 })).toBe(true);

    now = 1600;
    expect(lock.shouldAllow({ ownerId: 'purpose-low', priority: 20 })).toBe(true);
    expect(lock.getSnapshot()).toBeNull();
  });
});

describe('SpritePurposeHistoryStore', () => {
  it('persists JSONL history and filters recent entries', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'sprite-purpose-history-'));
    try {
      const store = new SpritePurposeHistoryStore(dataDir);
      await store.append({
        timestamp: 1000,
        eventType: 'purpose:started',
        purposeId: 'purpose-1',
        purposeKind: 'daily.rest-reminder',
        status: 'active'
      });
      await store.append({
        timestamp: 2000,
        eventType: 'purpose:completed',
        purposeId: 'purpose-1',
        purposeKind: 'daily.rest-reminder',
        status: 'completed'
      });
      await store.append({
        timestamp: 3000,
        eventType: 'planner:fallback',
        purposeId: 'purpose-2',
        purposeKind: 'ai.experimental',
        status: 'fallback',
        result: { reason: 'planner-output-invalid' }
      });

      const entries = await store.list({ kind: 'daily.rest-reminder', limit: 1 });
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        eventType: 'purpose:completed',
        purposeId: 'purpose-1',
        status: 'completed'
      });

      const plannerEntries = await store.list({ eventType: ['planner:planned', 'planner:fallback'], limit: 10 });
      expect(plannerEntries).toHaveLength(1);
      expect(plannerEntries[0]).toMatchObject({
        eventType: 'planner:fallback',
        purposeId: 'purpose-2',
        status: 'fallback',
        result: { reason: 'planner-output-invalid' }
      });
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('builds daily retrospectives with high-value memory recall cues', async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'sprite-purpose-retrospective-'));
    const base = Date.UTC(2026, 4, 3, 12, 0, 0);
    try {
      const store = new SpritePurposeHistoryStore(dataDir);
      await store.append({
        timestamp: base,
        eventType: 'purpose:created',
        purposeId: 'purpose-file',
        purposeKind: 'file.drop.intake',
        priority: 100,
        source: 'user-event',
        status: 'queued',
        summary: '用户把文件拖给角色处理'
      });
      await store.append({
        timestamp: base + 10,
        eventType: 'purpose:started',
        purposeId: 'purpose-file',
        purposeKind: 'file.drop.intake',
        priority: 100,
        source: 'user-event',
        status: 'active',
        summary: '用户把文件拖给角色处理'
      });
      await store.append({
        timestamp: base + 20,
        eventType: 'routine:started',
        purposeId: 'purpose-file',
        routineId: 'routine-file',
        purposeKind: 'file.drop.intake',
        source: 'preset',
        status: 'running'
      });
      await store.append({
        timestamp: base + 30,
        eventType: 'step:completed',
        purposeId: 'purpose-file',
        routineId: 'routine-file',
        stepId: 'wait-menu-result',
        purposeKind: 'file.drop.intake',
        status: 'completed'
      });
      await store.append({
        timestamp: base + 40,
        eventType: 'routine:completed',
        purposeId: 'purpose-file',
        routineId: 'routine-file',
        purposeKind: 'file.drop.intake',
        source: 'preset',
        status: 'completed',
        result: { elapsedMs: 40, stepCount: 6 }
      });
      await store.append({
        timestamp: base + 50,
        eventType: 'purpose:completed',
        purposeId: 'purpose-file',
        purposeKind: 'file.drop.intake',
        priority: 100,
        source: 'user-event',
        status: 'completed',
        summary: '用户把文件拖给角色处理',
        contextDigest: { fileCount: 1, fileNames: ['notes.docx'] },
        result: { durationMs: 50 }
      });
      await store.append({
        timestamp: base + 60,
        eventType: 'purpose:completed',
        purposeId: 'purpose-idle',
        purposeKind: 'idle.presence',
        priority: 10,
        source: 'behavior',
        status: 'completed',
        summary: 'idle'
      });

      const retrospective = await store.getDailyRetrospective({ date: '2026-05-03' });

      expect(retrospective).toMatchObject({
        date: '2026-05-03',
        totalPurposeCount: 2,
        terminalPurposeCount: 2,
        completedCount: 2,
        kindCounts: {
          'file.drop.intake': 1,
          'idle.presence': 1
        },
        memoryCandidateCount: 1
      });
      expect(retrospective.items).toHaveLength(1);
      expect(retrospective.items[0]).toMatchObject({
        purposeId: 'purpose-file',
        purposeKind: 'file.drop.intake',
        status: 'completed',
        stepCount: 6,
        memoryCandidate: true,
        completedStepIds: ['wait-menu-result']
      });
      expect(retrospective.recallCues[0]).toContain('Sprite purpose file.drop.intake completed');

      const empty = await store.getDailyRetrospective({ date: '2026-05-04' });
      expect(empty.totalPurposeCount).toBe(0);
      expect(empty.items).toEqual([]);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
