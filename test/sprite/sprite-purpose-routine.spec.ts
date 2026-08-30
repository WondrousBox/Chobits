import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  CHAT_API_CONFIGURED_GUIDE_GOAL,
  FIRST_CHAT_GUIDE_GOAL,
  FIRST_FILE_DROP_GUIDE_GOAL,
  OPEN_RESOURCE_LIBRARY_GUIDE_GOAL,
  type SpritePurposeHistoryEntry,
  type SpriteRoutinePresetDefinition,
  WORKSPACE_EXISTS_GUIDE_GOAL
} from '../../packages/sprite-core/purpose';
import {
  createSpriteRoutineFromPlannerDraft,
  SpritePresentationLock,
  SpritePurposeEventTimeoutError,
  SpritePurposeEventWaiter,
  SpritePurposeHistoryStore,
  SpritePurposeManager,
  SpriteRoutinePresetRegistry,
  SpriteRoutineRunner
} from '../../packages/sprite-core/purpose';

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

  it('waits after a step when waitAfter is configured', async () => {
    const calls: string[] = [];
    const timeouts: number[] = [];
    const runner = new SpriteRoutineRunner({
      playAnimation: vi.fn(),
      walkTo: vi.fn(),
      speak: (step) => {
        calls.push(`speak:${step.text}`);
      },
      showToast: (step) => {
        calls.push(`toast:${step.content}`);
      },
      setTimeout: ((handler: () => void, timeout: number) => {
        timeouts.push(timeout);
        setTimeout(handler, 0);
        return timeouts.length as any;
      }) as any,
      clearTimeout: vi.fn() as any
    });

    const result = await runner.run({
      id: 'routine-wait-after',
      purposeId: 'purpose-wait-after',
      source: 'preset',
      status: 'queued',
      steps: [
        { id: 'speak', type: 'speak', text: '等我说完。', bubbleDuration: 1200, waitAfter: true },
        { id: 'toast', type: 'showToast', content: '下一步' }
      ],
      cursor: 0,
      createdAt: Date.now()
    });

    expect(result.ok, result.error).toBe(true);
    expect(calls).toEqual(['speak:等我说完。', 'toast:下一步']);
    expect(timeouts).toContain(1200);
  });

  it('runs parallel child steps concurrently before continuing', async () => {
    const calls: string[] = [];
    let releaseWalk: (() => void) | null = null;
    const runner = new SpriteRoutineRunner({
      playAnimation: vi.fn(),
      walkTo: () => {
        calls.push('walk:start');
        return new Promise<void>((resolve) => {
          releaseWalk = () => {
            calls.push('walk:done');
            resolve();
          };
        });
      },
      speak: (step) => {
        calls.push(`speak:${step.text}`);
      },
      showToast: (step) => {
        calls.push(`toast:${step.content}`);
      }
    });

    const runPromise = runner.run({
      id: 'routine-parallel',
      purposeId: 'purpose-parallel',
      source: 'preset',
      status: 'queued',
      steps: [
        {
          id: 'walk-and-speak',
          type: 'parallel',
          body: [
            { id: 'walk', type: 'walkTo', target: 'center' },
            { id: 'speak', type: 'speak', text: '边走边说。' }
          ]
        },
        { id: 'toast', type: 'showToast', content: '完成' }
      ],
      cursor: 0,
      createdAt: Date.now()
    });

    await waitFor(() => calls.includes('speak:边走边说。'));
    expect(calls).toEqual(['walk:start', 'speak:边走边说。']);

    releaseWalk?.();
    const result = await runPromise;

    expect(result.ok, result.error).toBe(true);
    expect(calls).toEqual(['walk:start', 'speak:边走边说。', 'walk:done', 'toast:完成']);
    expect(result.steps.map((step) => step.stepId)).toEqual(expect.arrayContaining(['walk', 'speak', 'walk-and-speak', 'toast']));
    expect(result.steps.at(-2)?.stepId).toBe('walk-and-speak');
    expect(result.steps.at(-1)?.stepId).toBe('toast');
  });

  it('keeps sequence child steps ordered inside a parallel routine step', async () => {
    const calls: string[] = [];
    let releaseWalk: (() => void) | null = null;
    const runner = new SpriteRoutineRunner({
      playAnimation: (step) => {
        calls.push(`play:${step.trigger ?? step.animationId}`);
      },
      walkTo: () => {
        calls.push('walk:start');
        return new Promise<void>((resolve) => {
          releaseWalk = () => {
            calls.push('walk:done');
            resolve();
          };
        });
      },
      speak: (step) => {
        calls.push(`speak:${step.text}`);
      },
      showToast: (step) => {
        calls.push(`toast:${step.content}`);
      }
    });

    const runPromise = runner.run({
      id: 'routine-parallel-sequence',
      purposeId: 'purpose-parallel-sequence',
      source: 'preset',
      status: 'queued',
      steps: [
        {
          id: 'guide-near-window',
          type: 'parallel',
          body: [
            {
              id: 'walk-and-look',
              type: 'sequence',
              body: [
                { id: 'walk', type: 'walkTo', target: 'center' },
                { id: 'look', type: 'playAnimation', trigger: 'lookLeft', silent: true }
              ]
            },
            { id: 'speak', type: 'speak', text: '等待窗口结果。' }
          ]
        },
        { id: 'toast', type: 'showToast', content: '完成' }
      ],
      cursor: 0,
      createdAt: Date.now()
    });

    await waitFor(() => calls.includes('speak:等待窗口结果。'));
    expect(calls).toEqual(expect.arrayContaining(['walk:start', 'speak:等待窗口结果。']));
    expect(calls).not.toContain('play:lookLeft');

    releaseWalk?.();
    const result = await runPromise;

    expect(result.ok, result.error).toBe(true);
    expect(calls.indexOf('play:lookLeft')).toBeGreaterThan(calls.indexOf('walk:done'));
    expect(calls.at(-1)).toBe('toast:完成');
    expect(result.steps.map((step) => step.stepId)).toEqual(expect.arrayContaining(['walk', 'look', 'walk-and-look', 'speak', 'guide-near-window', 'toast']));
    expect(result.steps.at(-2)?.stepId).toBe('guide-near-window');
    expect(result.steps.at(-1)?.stepId).toBe('toast');
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

  it('matches purpose event payload fields against any expected array value', async () => {
    const waiter = new SpritePurposeEventWaiter();
    const routine = {
      id: 'routine-chat-window',
      purposeId: 'purpose-chat-window',
      source: 'preset' as const,
      status: 'queued' as const,
      steps: [],
      cursor: 0,
      createdAt: Date.now()
    };

    const promise = waiter.wait(
      {
        id: 'wait-chat-entry-window',
        type: 'waitForEvent',
        source: 'app-event',
        event: 'APP_WINDOW_OPENED',
        match: { windowKey: ['assistant', 'assistantMini', 'chat', 'chatOverlay'] },
        timeoutMs: 100
      },
      routine
    );

    waiter.emit({
      source: 'app-event',
      event: 'APP_WINDOW_OPENED',
      payload: { windowKey: 'settings' }
    });
    waiter.emit({
      source: 'app-event',
      event: 'APP_WINDOW_OPENED',
      payload: { windowKey: 'assistantMini' }
    });

    await expect(promise).resolves.toMatchObject({
      event: 'APP_WINDOW_OPENED',
      payload: { windowKey: 'assistantMini' }
    });
  });

  it('matches explicit payload paths when a field also exists on the event', async () => {
    const waiter = new SpritePurposeEventWaiter();
    const routine = {
      id: 'routine-inventory-menu',
      purposeId: 'purpose-inventory-menu',
      source: 'preset' as const,
      status: 'queued' as const,
      steps: [],
      cursor: 0,
      createdAt: Date.now()
    };

    const promise = waiter.wait(
      {
        id: 'wait-inventory-open',
        type: 'waitForEvent',
        source: 'app-event',
        event: 'ASSISTANT_MENU_ITEM_SELECTED',
        match: {
          itemId: 'inventory',
          windowKey: 'inventory',
          'payload.source': 'assistant-context-menu'
        },
        timeoutMs: 100
      },
      routine
    );

    waiter.emit({
      source: 'app-event',
      event: 'ASSISTANT_MENU_ITEM_SELECTED',
      payload: {
        itemId: 'inventory',
        windowKey: 'inventory',
        source: 'assistant-context-menu'
      }
    });

    await expect(promise).resolves.toMatchObject({
      source: 'app-event',
      payload: { source: 'assistant-context-menu' }
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

  it('passes per-event matches from loopUntil to terminal event waits', async () => {
    const seen: Array<{ event: string; match?: Record<string, unknown> }> = [];
    const runner = new SpriteRoutineRunner({
      playAnimation: vi.fn(),
      walkTo: vi.fn(),
      waitForEvent: (step) => {
        seen.push({ event: step.event, match: step.match });
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
      id: 'routine-loop-event-matches',
      purposeId: 'purpose-loop-event-matches',
      source: 'preset',
      status: 'queued',
      steps: [
        {
          id: 'loop',
          type: 'loopUntil',
          source: 'app-event',
          untilEvent: ['AI_PROVIDER_CONFIG_UPDATED', 'APP_WINDOW_CLOSED'],
          eventMatches: {
            AI_PROVIDER_CONFIG_UPDATED: { providerId: 'openai' },
            APP_WINDOW_CLOSED: { windowKey: 'aiProviderConfig', presetId: 'preset-openai' }
          },
          body: []
        }
      ],
      cursor: 0,
      createdAt: Date.now()
    });

    expect(result.ok).toBe(true);
    expect(seen).toEqual([
      { event: 'AI_PROVIDER_CONFIG_UPDATED', match: { providerId: 'openai' } },
      { event: 'APP_WINDOW_CLOSED', match: { windowKey: 'aiProviderConfig', presetId: 'preset-openai' } }
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
  it('normalizes preset shorthand steps into strict routine steps', () => {
    const registry = new SpriteRoutinePresetRegistry([
      {
        id: 'test.shorthand',
        title: 'shorthand',
        purposeKind: 'test.shorthand',
        defaultPriority: 50,
        steps: [
          3600,
          { type: 'speak', text: '自动补 id。' },
          {
            type: 'parallel',
            body: [250, { type: 'showToast', content: '嵌套也补 id。' }]
          },
          {
            type: 'sequence',
            body: [100, 'playAnimation thinking silent']
          },
          [{ type: 'showToast', content: '数组也表示 sequence。' }, 'playAnimation wave silent'],
          {
            type: 'branch',
            by: 'result',
            cases: {
              ok: [100]
            },
            default: [{ type: 'showToast', content: '默认分支。' }]
          }
        ]
      }
    ]);
    const preset = registry.get('test.shorthand');
    expect(preset).toBeDefined();

    const routine = registry.createRoutine(
      {
        id: 'purpose-shorthand',
        kind: 'test.shorthand',
        title: 'shorthand',
        reason: 'test shorthand',
        source: 'manual',
        status: 'active',
        priority: 50,
        interruptPolicy: 'interruptible'
      },
      preset!,
      1000
    );

    expect(routine.steps[0]).toMatchObject({ id: 'wait-1', type: 'wait', durationMs: 3600 });
    expect(routine.steps[1]).toMatchObject({ id: 'speak-2', type: 'speak', text: '自动补 id。' });
    expect(routine.steps[2]).toMatchObject({
      id: 'parallel-3',
      type: 'parallel',
      body: [
        expect.objectContaining({ id: 'parallel-3.wait-1', type: 'wait', durationMs: 250 }),
        expect.objectContaining({ id: 'parallel-3.showToast-2', type: 'showToast', content: '嵌套也补 id。' })
      ]
    });
    expect(routine.steps[3]).toMatchObject({
      id: 'sequence-4',
      type: 'sequence',
      body: [
        expect.objectContaining({ id: 'sequence-4.wait-1', type: 'wait', durationMs: 100 }),
        expect.objectContaining({ id: 'sequence-4.playAnimation-2', type: 'playAnimation', trigger: 'thinking', silent: true })
      ]
    });
    expect(routine.steps[4]).toMatchObject({
      id: 'sequence-5',
      type: 'sequence',
      body: [
        expect.objectContaining({ id: 'sequence-5.showToast-1', type: 'showToast', content: '数组也表示 sequence。' }),
        expect.objectContaining({ id: 'sequence-5.playAnimation-2', type: 'playAnimation', trigger: 'wave', silent: true })
      ]
    });
    expect(routine.steps[5]).toMatchObject({
      id: 'branch-6',
      type: 'branch',
      cases: {
        ok: [expect.objectContaining({ id: 'branch-6.ok.wait-1', type: 'wait', durationMs: 100 })]
      },
      default: [expect.objectContaining({ id: 'branch-6.default.showToast-1', type: 'showToast', content: '默认分支。' })]
    });
  });

  it('normalizes playAnimation string shorthand into strict routine steps', () => {
    const registry = new SpriteRoutinePresetRegistry([
      {
        id: 'test.animation-shorthand',
        title: 'animation shorthand',
        purposeKind: 'test.animation-shorthand',
        defaultPriority: 50,
        steps: [
          'playAnimation wave 1000 duration silent',
          'playAnimation wave 1000 3000 complete silent',
          'playAnimation wave silent',
          'playAnimation wave 1000',
          {
            type: 'parallel',
            body: ['playAnimation thinking 800 duration']
          }
        ]
      }
    ]);
    const preset = registry.get('test.animation-shorthand');
    expect(preset).toBeDefined();

    const routine = registry.createRoutine(
      {
        id: 'purpose-animation-shorthand',
        kind: 'test.animation-shorthand',
        title: 'animation shorthand',
        reason: 'test animation shorthand',
        source: 'manual',
        status: 'active',
        priority: 50,
        interruptPolicy: 'interruptible'
      },
      preset!,
      1000
    );

    expect(routine.steps[0]).toMatchObject({ id: 'playAnimation-1', type: 'playAnimation', trigger: 'wave', durationMs: 1000, waitFor: 'duration', silent: true });
    expect(routine.steps[1]).toMatchObject({ id: 'playAnimation-2', type: 'playAnimation', trigger: 'wave', durationMs: 1000, timeoutMs: 3000, waitFor: 'complete', silent: true });
    expect(routine.steps[2]).toMatchObject({ id: 'playAnimation-3', type: 'playAnimation', trigger: 'wave', silent: true });
    expect(routine.steps[3]).toMatchObject({ id: 'playAnimation-4', type: 'playAnimation', trigger: 'wave', durationMs: 1000 });
    expect(routine.steps[4]).toMatchObject({
      id: 'parallel-5',
      type: 'parallel',
      body: [expect.objectContaining({ id: 'parallel-5.playAnimation-1', type: 'playAnimation', trigger: 'thinking', durationMs: 800, waitFor: 'duration' })]
    });
  });

  it('rejects ambiguous playAnimation string shorthand timeout values', () => {
    const registry = new SpriteRoutinePresetRegistry([
      {
        id: 'test.invalid-animation-shorthand',
        title: 'invalid animation shorthand',
        purposeKind: 'test.invalid-animation-shorthand',
        defaultPriority: 50,
        steps: ['playAnimation wave 1000 3000 duration']
      }
    ]);
    const preset = registry.get('test.invalid-animation-shorthand');
    expect(preset).toBeDefined();

    expect(() =>
      registry.createRoutine(
        {
          id: 'purpose-invalid-animation-shorthand',
          kind: 'test.invalid-animation-shorthand',
          title: 'invalid animation shorthand',
          reason: 'test invalid animation shorthand',
          source: 'manual',
          status: 'active',
          priority: 50,
          interruptPolicy: 'interruptible'
        },
        preset!,
        1000
      )
    ).toThrow('the second numeric value maps to timeoutMs and requires waitFor complete');
  });

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

  it('creates unified file drop routines that wait for resources and resolve the menu after drop', () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('file.drop');
    expect(preset).toBeDefined();

    const routine = registry.createRoutine(
      {
        id: 'purpose-file-drop',
        kind: 'file.drop',
        title: '文件投递',
        reason: '用户拖入文件',
        source: 'user-event',
        status: 'active',
        priority: 100,
        interruptPolicy: 'interruptible',
        correlationId: 'drop-1'
      },
      preset!,
      1000
    );

    expect(preset!.defaultPriority).toBe(100);
    expect(routine.steps.map((step) => step.id)).toEqual([
      'ack-drop',
      'thinking',
      'wait-file-drop-resources-ready',
      'prompt-action',
      'open-file-actions-menu',
      'wait-menu-result',
      'result-branch',
      'return-corner'
    ]);
    expect(routine.steps[0]).toMatchObject({ type: 'playAnimation', trigger: 'fileDrop' });
    expect(routine.steps.find((step) => step.id === 'wait-file-drop-resources-ready')).toMatchObject({
      type: 'waitForEvent',
      source: 'purpose-event',
      event: 'fileDrop:resources-ready',
      match: { correlationId: 'drop-1' },
      assignTo: 'fileDropReady'
    });
    expect(routine.steps.find((step) => step.id === 'open-file-actions-menu')).toMatchObject({
      type: 'openWindow',
      window: 'fileActionsMenu',
      payloadFrom: 'fileDropReady.payload.fileActionsMenuPayload'
    });
    expect(routine.steps.find((step) => step.id === 'wait-menu-result')).toMatchObject({
      type: 'waitForEvent',
      source: 'purpose-event',
      event: 'fileAction:resolved',
      match: { correlationId: 'drop-1' },
      assignTo: 'menuResult'
    });
    expect(routine.steps.find((step) => step.id === 'result-branch')).toMatchObject({
      type: 'branch',
      by: 'menuResult.payload.outcome',
      cases: {
        selected: expect.arrayContaining([expect.objectContaining({ id: 'selected-success', type: 'playAnimation', trigger: 'success' })]),
        cancelled: expect.arrayContaining([expect.objectContaining({ id: 'cancelled-confused', type: 'playAnimation', trigger: 'confused' })]),
        failed: expect.arrayContaining([expect.objectContaining({ id: 'failed-reaction', type: 'playAnimation', trigger: 'failure' })])
      }
    });
    expect(routine.steps.at(-1)).toMatchObject({ id: 'return-corner', type: 'walkTo', target: 'corner' });
  });

  it('runs the cancelled file drop branch to confused animation and return', async () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('file.drop');
    expect(preset).toBeDefined();
    const calls: string[] = [];
    const routine = registry.createRoutine(
      {
        id: 'purpose-file',
        kind: 'file.drop',
        title: 'file drop',
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
      waitForEvent: (step) => {
        if (step.event === 'fileDrop:resources-ready') {
          return {
            source: 'purpose-event',
            event: 'fileDrop:resources-ready',
            correlationId: 'drop-1',
            timestamp: Date.now(),
            payload: {
              fileActionsMenuPayload: {
                files: [{ name: 'notes.docx', path: 'F:/tmp/notes.docx' }],
                resources: [{ id: 'resource-1', title: 'notes.docx', filePath: 'F:/tmp/notes.docx' }],
                source: 'drop',
                correlationId: 'drop-1'
              }
            }
          };
        }
        return {
          source: 'purpose-event',
          event: 'fileAction:resolved',
          correlationId: 'drop-1',
          timestamp: Date.now(),
          payload: { outcome: 'cancelled', reason: 'menu-closed' }
        };
      },
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
      'wait-file-drop-resources-ready',
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
    const preset = registry.get('file.drop');
    expect(preset).toBeDefined();
    const calls: string[] = [];
    const routine = registry.createRoutine(
      {
        id: 'purpose-file',
        kind: 'file.drop',
        title: 'file drop',
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
      waitForEvent: (step) => {
        if (step.event === 'fileDrop:resources-ready') {
          return {
            source: 'purpose-event',
            event: 'fileDrop:resources-ready',
            correlationId: 'drop-1',
            timestamp: Date.now(),
            payload: {
              fileActionsMenuPayload: {
                files: [{ name: 'voice.mp3', path: 'F:/tmp/voice.mp3' }],
                resources: [{ id: 'resource-1', title: 'voice.mp3', filePath: 'F:/tmp/voice.mp3' }],
                source: 'drop',
                correlationId: 'drop-1'
              }
            }
          };
        }
        return {
          source: 'purpose-event',
          event: 'fileAction:resolved',
          correlationId: 'drop-1',
          timestamp: Date.now(),
          payload: { outcome: 'failed', error: 'workflow exploded' }
        };
      },
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
      'wait-file-drop-resources-ready',
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
    expect(preset?.goal).toEqual(WORKSPACE_EXISTS_GUIDE_GOAL);

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
    expect(routine.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'speak-workspace-assistant-intro',
          type: 'speak',
          text: '你好，我是你的专属桌面助手。',
          bubbleDuration: 3600,
          waitAfter: true
        }),
        expect.objectContaining({
          id: 'speak-workspace-growth-promise',
          type: 'speak',
          text: '我会陪伴你学习和工作，一起共同成长。',
          bubbleDuration: 4200,
          waitAfter: true
        })
      ])
    );
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
        expect.objectContaining({
          id: 'guide-near-wizard',
          type: 'parallel',
          body: expect.arrayContaining([
            expect.objectContaining({
              id: 'guide-near-wizard.sequence-1',
              type: 'sequence',
              body: [
                expect.objectContaining({ id: 'walk-near-wizard', type: 'walkTo', target: { window: 'workspaceWizard', placement: 'right', offset: 16 } }),
                expect.objectContaining({ id: 'guide-near-wizard.sequence-1.playAnimation-2', type: 'playAnimation', trigger: 'lookLeft', silent: true })
              ]
            }),
            expect.objectContaining({
              id: 'await-wizard-result',
              type: 'loopUntil',
              untilEvent: ['WORKSPACE_CREATED', 'WORKSPACE_WIZARD_CLOSED'],
              ignoreHistory: true,
              body: expect.arrayContaining([
                expect.objectContaining({
                  id: 'speak-workspace-intro',
                  type: 'speak',
                  text: '工作空间会存放所有重要的数据。',
                  bubbleDuration: 4000,
                  waitAfter: 5000,
                  cooldownKey: 'onboarding.workspace.create.workspace-intro'
                }),
                expect.objectContaining({
                  id: 'speak-workspace-quickstart-tip',
                  type: 'speak',
                  text: '快速开始会默认创建到文档中',
                  cooldownKey: 'onboarding.workspace.create.quickstart-tip'
                })
              ])
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

  it('declares achievement goals for event-driven onboarding routine presets', () => {
    const registry = new SpriteRoutinePresetRegistry();

    expect(registry.get('onboarding.chat.start')?.goal).toEqual(FIRST_CHAT_GUIDE_GOAL);
    expect(registry.get('onboarding.file.drop')?.goal).toEqual(FIRST_FILE_DROP_GUIDE_GOAL);
    expect(registry.get('onboarding.resource.open-library')?.goal).toEqual(OPEN_RESOURCE_LIBRARY_GUIDE_GOAL);
  });

  it('declares a blocking chat API config goal on the chat guide preset', () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('chat.api-config-guide');

    expect(preset).toMatchObject({
      id: 'chat.api-config-guide',
      purposeKind: 'chat.api-config-guide',
      goal: CHAT_API_CONFIGURED_GUIDE_GOAL
    });

    const routine = registry.createRoutine(
      {
        id: 'purpose-chat-api-config-guide',
        kind: 'chat.api-config-guide',
        title: 'chat api config guide',
        reason: 'missing api key',
        source: 'user-event',
        status: 'active',
        priority: 66,
        interruptPolicy: 'interruptible',
        context: {
          providerId: 'openai',
          presetId: 'preset-openai',
          fields: ['apiKey']
        }
      },
      preset!,
      1000
    );

    expect(routine.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'chat-api-config-invite',
          type: 'showNotice',
          messageId: 'chat.api-config-guide.invite',
          buttons: [expect.objectContaining({ label: '去配置', purposeAction: 'open-ai-provider-settings' })]
        }),
        expect.objectContaining({
          id: 'chat-api-config-wait-invite-action',
          type: 'loopUntil',
          source: 'purpose-event',
          untilEvent: ['bubble:action', 'bubble:dismissed'],
          match: { messageId: 'chat.api-config-guide.invite' }
        }),
        expect.objectContaining({ id: 'chat-api-config-handle-invite-action', type: 'branch', by: 'chatApiConfigBubbleEvent.event.event' })
      ])
    );

    const handleActionStep = routine.steps.find((step) => step.id === 'chat-api-config-handle-invite-action');
    expect(handleActionStep).toMatchObject({
      type: 'branch',
      cases: {
        'bubble:action': [
          expect.objectContaining({
            id: 'chat-api-config-open-after-click',
            type: 'branch',
            by: 'chatApiConfigBubbleEvent.event.payload.purposeAction'
          })
        ]
      }
    });
    const openAfterClick = handleActionStep && handleActionStep.type === 'branch' ? handleActionStep.cases['bubble:action']?.[0] : undefined;
    expect(openAfterClick).toMatchObject({
      type: 'branch',
      cases: {
        'open-ai-provider-settings': expect.arrayContaining([
          expect.objectContaining({
            id: 'chat-api-config-open-settings',
            type: 'openWindow',
            window: 'aiProviderConfig',
            payload: { providerId: 'openai', presetId: 'preset-openai', fields: ['apiKey'] }
          }),
          expect.objectContaining({ id: 'chat-api-config-walk-to-settings', type: 'walkTo', target: { window: 'aiProviderConfig', placement: 'right', offset: 16 } }),
          expect.objectContaining({
            id: 'chat-api-config-wait-result',
            type: 'loopUntil',
            source: 'app-event',
            untilEvent: ['AI_PROVIDER_CONFIG_UPDATED', 'APP_WINDOW_CLOSED'],
            eventMatches: {
              AI_PROVIDER_CONFIG_UPDATED: {
                action: ['provider-secrets-updated', 'provider-api-keys-updated', 'provider-api-key-added', 'provider-api-key-updated', 'provider-api-key-default-updated', 'preset-secrets-updated']
              },
              APP_WINDOW_CLOSED: { windowKey: 'aiProviderConfig' }
            }
          }),
          expect.objectContaining({ id: 'chat-api-config-done-branch', type: 'branch', by: 'chatApiConfigResult.event.event' })
        ])
      }
    });
  });

  it('opens chat API settings directly when started from a confirmed recommendation', () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('chat.api-config-guide');
    expect(preset).toBeDefined();

    const routine = registry.createRoutine(
      {
        id: 'purpose-chat-api-config-guide',
        kind: 'chat.api-config-guide',
        title: 'chat api config guide',
        reason: 'missing api key',
        source: 'system-event',
        status: 'active',
        priority: 69,
        interruptPolicy: 'interruptible',
        context: {
          providerId: 'openai',
          presetId: 'preset-openai',
          fields: ['apiKey'],
          questStartSource: 'recommendation',
          openSettingsDirectly: true
        }
      },
      preset!,
      1000
    );

    expect(routine.steps.map((step) => step.id)).toEqual([
      'chat-api-config-open-settings',
      'chat-api-config-walk-to-settings',
      'chat-api-config-tip',
      'chat-api-config-wait-result',
      'chat-api-config-done-branch',
      'chat-api-config-return-corner'
    ]);
    expect(routine.steps.some((step) => step.type === 'showNotice')).toBe(false);
    expect(routine.steps[0]).toMatchObject({
      type: 'openWindow',
      window: 'aiProviderConfig',
      payload: { providerId: 'openai', presetId: 'preset-openai', fields: ['apiKey'] }
    });
  });

  it('ends the chat API config guide quietly when the config window is closed without saving', async () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('chat.api-config-guide');
    expect(preset).toBeDefined();

    const routine = registry.createRoutine(
      {
        id: 'purpose-chat-api-config-guide',
        kind: 'chat.api-config-guide',
        title: 'chat api config guide',
        reason: 'missing api key',
        source: 'user-event',
        status: 'active',
        priority: 72,
        interruptPolicy: 'interruptible',
        context: {
          providerId: 'openai',
          presetId: 'preset-openai',
          fields: ['apiKey']
        }
      },
      preset!,
      1000
    );
    const calls: string[] = [];
    const seenWaits: Array<{ event: string; match?: Record<string, unknown> }> = [];
    const pending = (signal?: AbortSignal): Promise<any> =>
      new Promise((_, reject) => {
        if (signal?.aborted) {
          reject(new DOMException('Routine cancelled', 'AbortError'));
          return;
        }
        signal?.addEventListener('abort', () => reject(new DOMException('Routine cancelled', 'AbortError')), { once: true });
      });
    const runner = new SpriteRoutineRunner({
      playAnimation: vi.fn(),
      walkTo: (step) => {
        calls.push(`walk:${typeof step.target === 'string' ? step.target : 'window' in step.target ? step.target.window : 'point'}`);
      },
      speak: (step) => {
        calls.push(`speak:${step.id}:${step.text}`);
      },
      showToast: vi.fn(),
      showNotice: (step) => {
        calls.push(`notice:${step.messageId}:${step.content}`);
      },
      clearMessage: (step) => {
        calls.push(`clear:${step.messageId}`);
      },
      openWindow: (step) => {
        calls.push(`open:${step.window}`);
      },
      waitForEvent: (step, signal) => {
        seenWaits.push({ event: step.event, match: step.match });
        if (step.event === 'bubble:action') {
          return {
            source: 'purpose-event',
            event: 'bubble:action',
            timestamp: Date.now(),
            payload: {
              messageId: 'chat.api-config-guide.invite',
              purposeAction: 'open-ai-provider-settings'
            }
          };
        }
        if (step.event === 'APP_WINDOW_CLOSED') {
          return {
            source: 'app-event',
            event: 'APP_WINDOW_CLOSED',
            timestamp: Date.now(),
            payload: {
              windowKey: 'aiProviderConfig',
              providerId: 'openai',
              presetId: 'preset-openai'
            }
          };
        }
        return pending(signal);
      }
    });

    const result = await runner.run(routine);

    expect(result.ok, result.error).toBe(true);
    expect(calls).toEqual(
      expect.arrayContaining([
        'notice:chat.api-config-guide.invite:需要先配置 API Key',
        'clear:chat.api-config-guide.invite',
        'open:aiProviderConfig',
        'walk:aiProviderConfig',
        'speak:chat-api-config-tip:填好 API Key 就可以和我对话了',
        'walk:corner'
      ])
    );
    expect(calls.some((call) => call.includes('chat-api-config-done'))).toBe(false);
    expect(seenWaits).toEqual(
      expect.arrayContaining([
        {
          event: 'AI_PROVIDER_CONFIG_UPDATED',
          match: {
            action: ['provider-secrets-updated', 'provider-api-keys-updated', 'provider-api-key-added', 'provider-api-key-updated', 'provider-api-key-default-updated', 'preset-secrets-updated']
          }
        },
        { event: 'APP_WINDOW_CLOSED', match: { windowKey: 'aiProviderConfig' } }
      ])
    );
  });

  it('speaks completion when the chat API config guide observes a provider config update', async () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('chat.api-config-guide');
    expect(preset).toBeDefined();

    const routine = registry.createRoutine(
      {
        id: 'purpose-chat-api-config-guide',
        kind: 'chat.api-config-guide',
        title: 'chat api config guide',
        reason: 'missing api key',
        source: 'user-event',
        status: 'active',
        priority: 72,
        interruptPolicy: 'interruptible',
        context: {
          providerId: 'openai',
          presetId: 'preset-openai',
          fields: ['apiKey']
        }
      },
      preset!,
      1000
    );
    const calls: string[] = [];
    const pending = (signal?: AbortSignal): Promise<any> =>
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
      speak: (step) => {
        calls.push(`speak:${step.id}:${step.text}`);
      },
      showToast: vi.fn(),
      showNotice: vi.fn(),
      clearMessage: vi.fn(),
      openWindow: vi.fn(),
      waitForEvent: (step, signal) => {
        if (step.event === 'bubble:action') {
          return {
            source: 'purpose-event',
            event: 'bubble:action',
            timestamp: Date.now(),
            payload: {
              messageId: 'chat.api-config-guide.invite',
              purposeAction: 'open-ai-provider-settings'
            }
          };
        }
        if (step.event === 'AI_PROVIDER_CONFIG_UPDATED') {
          return {
            source: 'app-event',
            event: 'AI_PROVIDER_CONFIG_UPDATED',
            timestamp: Date.now(),
            payload: {
              providerId: 'openai',
              presetId: 'preset-openai',
              action: 'preset-secrets-updated'
            }
          };
        }
        return pending(signal);
      }
    });

    const result = await runner.run(routine);

    expect(result.ok, result.error).toBe(true);
    expect(calls).toContain('speak:chat-api-config-done:配置保存好了，现在可以开始聊天。');
  });

  it('uses the saved provider when an open-time chat API guide observes another provider secret save', async () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('chat.api-config-guide');
    expect(preset).toBeDefined();

    const routine = registry.createRoutine(
      {
        id: 'purpose-chat-api-config-guide',
        kind: 'chat.api-config-guide',
        title: 'chat api config guide',
        reason: 'missing api key',
        source: 'user-event',
        status: 'active',
        priority: 72,
        interruptPolicy: 'interruptible',
        context: {
          providerId: 'openai',
          trigger: 'chat-window-open'
        }
      },
      preset!,
      1000
    );
    const waiter = new SpritePurposeEventWaiter();
    const calls: string[] = [];
    const runner = new SpriteRoutineRunner({
      playAnimation: vi.fn(),
      walkTo: vi.fn(),
      speak: (step) => {
        calls.push(`speak:${step.id}:${step.text}`);
      },
      showToast: vi.fn(),
      showNotice: vi.fn(),
      clearMessage: vi.fn(),
      openWindow: vi.fn(),
      waitForEvent: (step, signal) => {
        if (step.event === 'bubble:action') {
          return {
            source: 'purpose-event',
            event: 'bubble:action',
            timestamp: Date.now(),
            payload: {
              messageId: 'chat.api-config-guide.invite',
              purposeAction: 'open-ai-provider-settings'
            }
          };
        }
        return waiter.wait(step, routine, signal);
      }
    });

    const pending = runner.run(routine);
    await waitFor(() => calls.includes('speak:chat-api-config-tip:先新增一个模型预设并填入 API Key，就可以开始聊天。'));

    expect(
      waiter.emit({
        source: 'app-event',
        event: 'AI_PROVIDER_CONFIG_UPDATED',
        payload: {
          providerId: 'minimax',
          presetId: 'preset-minimax',
          action: 'preset-created'
        }
      })
    ).toBe(0);

    expect(
      waiter.emit({
        source: 'app-event',
        event: 'AI_PROVIDER_CONFIG_UPDATED',
        payload: {
          providerId: 'minimax',
          presetId: 'preset-minimax',
          action: 'preset-secrets-updated'
        }
      })
    ).toBe(1);

    const result = await pending;

    expect(result.ok, result.error).toBe(true);
    expect(calls).toContain('speak:chat-api-config-done:MiniMax 还可以制作音乐，以后可以和我说哦');
  });

  it('speaks a MiniMax music easter egg after the MiniMax chat API config is saved', async () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('chat.api-config-guide');
    expect(preset).toBeDefined();

    const routine = registry.createRoutine(
      {
        id: 'purpose-chat-api-config-guide',
        kind: 'chat.api-config-guide',
        title: 'chat api config guide',
        reason: 'missing api key',
        source: 'user-event',
        status: 'active',
        priority: 72,
        interruptPolicy: 'interruptible',
        context: {
          providerId: 'minimax',
          presetId: 'preset-minimax',
          fields: ['apiKey']
        }
      },
      preset!,
      1000
    );
    const calls: string[] = [];
    const pending = (signal?: AbortSignal): Promise<any> =>
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
      speak: (step) => {
        calls.push(`speak:${step.id}:${step.text}`);
      },
      showToast: vi.fn(),
      showNotice: vi.fn(),
      clearMessage: vi.fn(),
      openWindow: vi.fn(),
      waitForEvent: (step, signal) => {
        if (step.event === 'bubble:action') {
          return {
            source: 'purpose-event',
            event: 'bubble:action',
            timestamp: Date.now(),
            payload: {
              messageId: 'chat.api-config-guide.invite',
              purposeAction: 'open-ai-provider-settings'
            }
          };
        }
        if (step.event === 'AI_PROVIDER_CONFIG_UPDATED') {
          return {
            source: 'app-event',
            event: 'AI_PROVIDER_CONFIG_UPDATED',
            timestamp: Date.now(),
            payload: {
              providerId: 'minimax',
              presetId: 'preset-minimax',
              action: 'preset-secrets-updated'
            }
          };
        }
        return pending(signal);
      }
    });

    const result = await runner.run(routine);

    expect(result.ok, result.error).toBe(true);
    expect(calls).toContain('speak:chat-api-config-done:MiniMax 还可以制作音乐，以后可以和我说哦');
  });

  it('creates first chat onboarding routines that wait for double click and chat entry open', () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('onboarding.chat.start');
    expect(preset).toBeDefined();

    const routine = registry.createRoutine(
      {
        id: 'purpose-first-chat-onboarding',
        kind: 'onboarding.chat.start',
        title: 'first chat onboarding',
        reason: 'first chat',
        source: 'system-event',
        status: 'active',
        priority: 68,
        interruptPolicy: 'interruptible'
      },
      preset!,
      1000
    );

    expect(preset!.defaultPriority).toBe(68);
    expect(routine.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'first-chat-wait-double-click',
          type: 'loopUntil',
          source: 'sprite-event-bus',
          untilEvent: 'interact:double-click',
          assignTo: 'firstChatDoubleClick'
        }),
        expect.objectContaining({
          id: 'first-chat-wait-window-open',
          type: 'loopUntil',
          source: 'app-event',
          untilEvent: ['APP_WINDOW_OPENED'],
          match: { windowKey: ['assistant', 'assistantMini', 'chat', 'chatOverlay'] },
          assignTo: 'firstChatWindowOpened'
        })
      ])
    );
    expect(routine.steps.some((step) => step.type === 'showNotice')).toBe(false);
  });

  it('runs first chat onboarding completion feedback when double click opens the chat entry', async () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('onboarding.chat.start');
    expect(preset).toBeDefined();
    const routine = registry.createRoutine(
      {
        id: 'purpose-first-chat-onboarding',
        kind: 'onboarding.chat.start',
        title: 'first chat onboarding',
        reason: 'first chat',
        source: 'system-event',
        status: 'active',
        priority: 68,
        interruptPolicy: 'interruptible'
      },
      preset!,
      1000
    );
    const calls: string[] = [];
    const pending = (signal?: AbortSignal): Promise<any> =>
      new Promise((_, reject) => {
        if (signal?.aborted) {
          reject(new DOMException('Routine cancelled', 'AbortError'));
          return;
        }
        signal?.addEventListener('abort', () => reject(new DOMException('Routine cancelled', 'AbortError')), { once: true });
      });
    const runner = new SpriteRoutineRunner({
      playAnimation: (step) => {
        calls.push(`play:${step.trigger ?? step.animationId}`);
      },
      walkTo: (step) => {
        calls.push(`walk:${typeof step.target === 'string' ? step.target : 'window' in step.target ? step.target.window : 'point'}`);
      },
      speak: (step) => {
        calls.push(`speak:${step.id}:${step.text}`);
      },
      showToast: vi.fn(),
      showNotice: (step) => {
        calls.push(`notice:${step.messageId}:${step.content}`);
      },
      clearMessage: (step) => {
        calls.push(`clear:${step.messageId}`);
      },
      openWindow: (step) => {
        calls.push(`open:${step.window}`);
      },
      waitForEvent: (step, signal) => {
        if (step.event === 'interact:double-click') {
          return {
            source: 'sprite-event-bus',
            event: 'interact:double-click',
            timestamp: Date.now(),
            payload: {}
          };
        }
        if (step.event === 'APP_WINDOW_OPENED') {
          return {
            source: 'app-event',
            event: 'APP_WINDOW_OPENED',
            timestamp: Date.now(),
            payload: {
              windowKey: 'assistant',
              source: 'renderer-window-open'
            }
          };
        }
        return pending(signal);
      }
    });

    const result = await runner.run(routine);

    expect(result.ok, result.error).toBe(true);
    expect(calls).toEqual(expect.arrayContaining(['play:wave', 'play:celebrate', 'speak:first-chat-done:打开啦！以后双击我就可以开始聊天。', 'walk:corner']));
    expect(calls.some((call) => call.startsWith('notice:'))).toBe(false);
    expect(calls.some((call) => call.startsWith('clear:'))).toBe(false);
  });

  it('keeps first chat onboarding waiting until the user double-clicks the sprite', async () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('onboarding.chat.start');
    expect(preset).toBeDefined();
    const routine = registry.createRoutine(
      {
        id: 'purpose-first-chat-onboarding',
        kind: 'onboarding.chat.start',
        title: 'first chat onboarding',
        reason: 'first chat',
        source: 'system-event',
        status: 'active',
        priority: 68,
        interruptPolicy: 'interruptible'
      },
      preset!,
      1000
    );
    const calls: string[] = [];
    const pending = (signal?: AbortSignal): Promise<any> =>
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
      speak: (step) => {
        calls.push(`speak:${step.id}:${step.text}`);
      },
      showToast: vi.fn(),
      showNotice: vi.fn(),
      clearMessage: vi.fn(),
      openWindow: vi.fn(),
      waitForEvent: (step, signal) => {
        if (step.event === 'APP_WINDOW_OPENED') {
          return {
            source: 'app-event',
            event: 'APP_WINDOW_OPENED',
            timestamp: Date.now(),
            payload: { windowKey: 'assistant' }
          };
        }
        return pending(signal);
      }
    });
    const controller = new AbortController();

    const result = await runner.run(routine, {
      signal: controller.signal,
      onStepComplete: (_routine, step) => {
        if (step.id === 'first-chat-help') {
          controller.abort();
        }
      }
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('cancelled');
    expect(calls.some((call) => call.includes('first-chat-done'))).toBe(false);
  });

  it('creates first file drop onboarding routines that invite drag-to-sprite and wait for resource events', () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('onboarding.file.drop');
    expect(preset).toBeDefined();

    const routine = registry.createRoutine(
      {
        id: 'purpose-file-drop-onboarding',
        kind: 'onboarding.file.drop',
        title: 'file drop onboarding',
        reason: 'first file drop',
        source: 'system-event',
        status: 'active',
        priority: 68,
        interruptPolicy: 'interruptible'
      },
      preset!,
      1000
    );

    expect(preset!.defaultPriority).toBe(68);
    expect(routine.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'playAnimation-1', type: 'playAnimation', trigger: 'welcome' }),
        expect.objectContaining({
          id: 'invite-file-drop-notice',
          type: 'showNotice',
          messageId: 'onboarding.file.drop.invite',
          content: '可以把文件拖拽给我'
        }),
        expect.objectContaining({
          id: 'wait-first-file-drop',
          type: 'loopUntil',
          source: 'app-event',
          untilEvent: ['RESOURCE_CREATED', 'SPRITE_RESOURCE_IMPORT_COMPLETE'],
          match: { purposeSource: 'sprite-drop' },
          assignTo: 'firstFileDropResult'
        }),
        expect.objectContaining({
          id: 'first-file-drop-result',
          type: 'branch',
          by: 'firstFileDropResult.event.event'
        })
      ])
    );
    const waitStep = routine.steps.find((step) => step.id === 'wait-first-file-drop');
    expect(waitStep).toMatchObject({
      type: 'loopUntil',
      body: expect.arrayContaining([
        expect.objectContaining({
          id: 'drop-wait-cycle',
          type: 'parallel',
          body: expect.arrayContaining([
            expect.objectContaining({
              id: 'drop-ready-loop',
              type: 'playAnimation',
              trigger: 'fileDragOver',
              durationMs: 6500,
              waitFor: 'duration',
              silent: true
            }),
            expect.objectContaining({
              id: 'drop-intro-speak',
              type: 'speak',
              text: '拖给我的文件会放到背包。',
              cooldownKey: 'onboarding.file.drop.intro'
            }),
            expect.objectContaining({
              id: 'drop-wait-pause',
              type: 'wait',
              durationMs: 6500
            })
          ])
        })
      ])
    });
  });

  it('creates inventory onboarding routines that wait for right-click menu selection', () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('onboarding.resource.open-library');
    expect(preset).toBeDefined();

    const routine = registry.createRoutine(
      {
        id: 'purpose-open-library-onboarding',
        kind: 'onboarding.resource.open-library',
        title: 'open library onboarding',
        reason: 'open resource library',
        source: 'system-event',
        status: 'active',
        priority: 66,
        interruptPolicy: 'interruptible'
      },
      preset!,
      1000
    );

    expect(preset!.defaultPriority).toBe(66);
    expect(routine.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'resource-menu-invite',
          type: 'showNotice',
          messageId: 'onboarding.resource.open-library.invite',
          content: '右键点我，打开菜单里的背包。'
        }),
        expect.objectContaining({
          id: 'wait-context-menu-open',
          type: 'waitForEvent',
          source: 'sprite-event-bus',
          event: 'interact:context-menu',
          match: { open: true }
        }),
        expect.objectContaining({
          id: 'resource-menu-tip',
          type: 'speak',
          text: '现在点菜单里的「背包」。'
        }),
        expect.objectContaining({
          id: 'wait-inventory-open',
          type: 'waitForEvent',
          source: 'app-event',
          event: 'ASSISTANT_MENU_ITEM_SELECTED',
          match: {
            itemId: 'inventory',
            windowKey: 'inventory',
            'payload.source': 'assistant-context-menu'
          }
        }),
        expect.objectContaining({ id: 'clear-resource-menu-notice', type: 'clearMessage', messageId: 'onboarding.resource.open-library.invite', messageType: 'notice' }),
        expect.objectContaining({ id: 'resource-menu-celebrate', type: 'playAnimation', trigger: 'celebrate' })
      ])
    );
  });

  it('runs first file drop onboarding completion feedback when a resource is created', async () => {
    const registry = new SpriteRoutinePresetRegistry();
    const preset = registry.get('onboarding.file.drop');
    expect(preset).toBeDefined();
    const routine = registry.createRoutine(
      {
        id: 'purpose-file-drop-onboarding',
        kind: 'onboarding.file.drop',
        title: 'file drop onboarding',
        reason: 'first file drop',
        source: 'system-event',
        status: 'active',
        priority: 68,
        interruptPolicy: 'interruptible'
      },
      preset!,
      1000
    );
    const calls: string[] = [];
    const runner = new SpriteRoutineRunner({
      playAnimation: (step) => {
        calls.push(`play:${step.trigger ?? step.animationId}`);
      },
      walkTo: (step) => {
        calls.push(`walk:${typeof step.target === 'string' ? step.target : 'point'}`);
      },
      speak: (step) => {
        calls.push(`speak:${step.id}:${step.text}`);
      },
      showToast: vi.fn(),
      showNotice: (step) => {
        calls.push(`notice:${step.messageId}:${step.content}`);
      },
      clearMessage: (step) => {
        calls.push(`clear:${step.messageId}`);
      },
      waitForEvent: (step, signal) => {
        if (step.event === 'RESOURCE_CREATED') {
          return {
            source: 'app-event',
            event: 'RESOURCE_CREATED',
            timestamp: Date.now(),
            payload: { id: 'resource-1', purposeSource: 'sprite-drop', metadata: JSON.stringify({ source: 'sprite-drop' }) }
          };
        }
        return new Promise((_, reject) => {
          if (signal?.aborted) {
            reject(new DOMException('Routine cancelled', 'AbortError'));
            return;
          }
          signal?.addEventListener('abort', () => reject(new DOMException('Routine cancelled', 'AbortError')), { once: true });
        });
      }
    });

    const result = await runner.run(routine);

    expect(result.ok, result.error).toBe(true);
    expect(calls).toEqual(
      expect.arrayContaining([
        'play:welcome',
        'notice:onboarding.file.drop.invite:可以把文件拖拽给我',
        'clear:onboarding.file.drop.invite',
        'play:celebrate',
        'speak:first-file-drop-done:收到啦！已经放到背包。'
      ])
    );
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
        'speak:你好，我是你的专属桌面助手。',
        'speak:我会陪伴你学习和工作，一起共同成长。',
        'notice:onboarding.workspace.create.invite:先创建工作空间吧',
        'open:workspaceWizard',
        'walk:workspaceWizard',
        'notice:onboarding.workspace.create.invite:还没有创建工作空间哦。',
        'clear:onboarding.workspace.create.invite',
        'play:celebrate',
        'speak:好啦！我可以做更多事情啦。'
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
    let clickedOpenWizard = false;
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
        if (step.event === 'bubble:action' && step.match?.purposeAction) {
          return {
            source: 'purpose-event',
            event: 'bubble:action',
            timestamp: Date.now(),
            payload: { purposeAction: step.match.purposeAction, actionId: step.match.purposeAction }
          };
        }
        if (step.event === 'bubble:action' && !clickedOpenWizard) {
          clickedOpenWizard = true;
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
        'speak:speak-workspace-assistant-intro:你好，我是你的专属桌面助手。',
        'speak:speak-workspace-growth-promise:我会陪伴你学习和工作，一起共同成长。',
        'notice:onboarding.workspace.create.invite:先创建工作空间吧',
        'open:workspaceWizard',
        'walk:workspaceWizard',
        'speak:speak-workspace-intro:工作空间会存放所有重要的数据。',
        'speak:speak-workspace-quickstart-tip:快速开始会默认创建到文档中',
        'clear:onboarding.workspace.create.invite',
        'speak:speak-done:好啦！我可以做更多事情啦。'
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
        if (step.event === 'bubble:action' && step.match?.purposeAction) {
          return {
            source: 'purpose-event',
            event: 'bubble:action',
            timestamp: Date.now(),
            payload: { purposeAction: step.match.purposeAction, actionId: step.match.purposeAction }
          };
        }
        if (step.event === 'WORKSPACE_CREATED') {
          return pendingWorkspaceCreated(signal);
        }
        return pendingEvent(signal);
      },
      setTimeout: ((handler: () => void, timeout: number) => {
        timers.push({ timeout, handler });
        if (timeout === 3600 || timeout === 4200) {
          setTimeout(handler, 0);
        }
        return timers.length as any;
      }) as any,
      clearTimeout: vi.fn() as any
    });

    const runPromise = runner.run(routine);
    await waitFor(() => calls.includes('notice:onboarding.workspace.create.invite'));

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
        if (step.event === 'bubble:action' && step.match?.purposeAction) {
          return {
            source: 'purpose-event',
            event: 'bubble:action',
            timestamp: Date.now(),
            payload: { purposeAction: step.match.purposeAction, actionId: step.match.purposeAction }
          };
        }
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
      setTimeout: (handler, timeout) => setTimeout(handler, timeout === 3600 || timeout === 4200 || timeout === 5000 ? 0 : timeout),
      clearTimeout
    });

    const runPromise = runner.run(routine);
    await waitFor(() => calls.filter((call) => call === 'notice:onboarding.workspace.create.invite').length === 2);

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
        if (step.event === 'bubble:action' && step.match?.purposeAction) {
          return {
            source: 'purpose-event',
            event: 'bubble:action',
            timestamp: Date.now(),
            payload: { purposeAction: step.match.purposeAction, actionId: step.match.purposeAction }
          };
        }
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
      setTimeout: (handler, timeout) => setTimeout(handler, timeout === 3600 || timeout === 4200 || timeout === 5000 ? 0 : timeout),
      clearTimeout
    });

    const runPromise = runner.run(routine);
    await waitFor(() => calls.filter((call) => call === 'notice:onboarding.workspace.create.invite').length === 3);

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
