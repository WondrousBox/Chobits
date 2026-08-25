import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { SpritePurposePlannerPreferencesStore } from '../../electron/main/handlers/sprite/purpose-planner-preferences';
import { buildSpritePurposePlannerPrompt, createSpritePurposePiPlannerExecutor, parseSpritePurposePlannerOutput } from '../../electron/main/handlers/sprite/purpose-planner-runtime';
import { createSpritePurposeRoutinePlanner, SpritePurposePlannerService } from '../../electron/main/handlers/sprite/purpose-planner-service';
import {
  createSpriteRoutineFromPlannerDraft,
  DEFAULT_SPRITE_PURPOSE_PLANNER_PREFERENCES,
  DEFAULT_SPRITE_ROUTINE_PRESETS,
  normalizeSpritePurposePlannerPreferences,
  summarizeSpriteRoutinePresets,
  validateSpritePurposePlannerOutput,
  type SpritePurpose,
  type SpritePurposeHistoryEntry,
  type SpritePurposePlannerExecutor
} from '../../packages/sprite-core/purpose';

const validationOptions = {
  presetIds: DEFAULT_SPRITE_ROUTINE_PRESETS.map((preset) => preset.id),
  animationTriggers: ['wave', 'thinking', 'success'],
  windows: ['fileActionsMenu'],
  events: ['fileAction:resolved', 'SPRITE_WORKFLOW_COMPLETE'],
  maxSteps: 8,
  maxDurationMs: 20_000,
  maxStepTimeoutMs: 10_000
};

describe('SpritePurposePlanner validation', () => {
  it('accepts a bounded routine draft that stays inside allowlists', () => {
    const result = validateSpritePurposePlannerOutput(
      {
        whyThisPlan: 'acknowledge the drop and wait for the user choice',
        fallbackPresetId: 'file.drop',
        routineDraft: {
          title: 'Drop intake',
          steps: [
            { id: 'wave', type: 'playAnimation', trigger: 'wave', durationMs: 800, waitFor: 'duration' },
            { id: 'open-menu', type: 'openWindow', window: 'fileActionsMenu', timeoutMs: 4000 },
            { id: 'wait-choice', type: 'waitForEvent', source: 'purpose-event', event: 'fileAction:resolved', timeoutMs: 8000, assignTo: 'choice' },
            {
              id: 'choice-branch',
              type: 'branch',
              by: 'choice.payload.outcome',
              cases: {
                selected: [{ id: 'success', type: 'playAnimation', trigger: 'success', durationMs: 900, waitFor: 'duration' }]
              },
              default: [{ id: 'thinking', type: 'playAnimation', trigger: 'thinking', durationMs: 600, waitFor: 'duration' }]
            }
          ]
        }
      },
      validationOptions
    );

    expect(result.ok).toBe(true);
    expect(result.summary).toEqual({ stepCount: 6, estimatedDurationMs: 13_700 });
    if (result.ok) {
      expect(result.routineDraft.steps.map((step) => step.id)).toEqual(['wave', 'open-menu', 'wait-choice', 'choice-branch']);
    }
  });

  it('rejects unknown step types before they can be executed', () => {
    const result = validateSpritePurposePlannerOutput(
      {
        fallbackPresetId: 'daily.rest-reminder',
        routineDraft: {
          steps: [{ id: 'run-code', type: 'runTask', task: 'shell', timeoutMs: 1000 }]
        }
      },
      validationOptions
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('step allowlist');
    expect(result.fallbackPresetId).toBe('daily.rest-reminder');
  });

  it('rejects windows, events, and missing timeouts outside the safe planner boundary', () => {
    const result = validateSpritePurposePlannerOutput(
      {
        routineDraft: {
          steps: [
            { id: 'admin-window', type: 'openWindow', window: 'settings' },
            { id: 'wait-secret', type: 'waitForEvent', source: 'app-event', event: 'SECRET_EVENT', timeoutMs: 1000 },
            { id: 'walk', type: 'walkTo', target: 'center' }
          ]
        }
      },
      validationOptions
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('window "settings" is not in the window allowlist');
    expect(result.errors.join('\n')).toContain('event "SECRET_EVENT" is not in the event allowlist');
    expect(result.errors.join('\n')).toContain('routineDraft.steps[2].timeoutMs is required');
  });

  it('rejects drafts that exceed step or duration limits', () => {
    const result = validateSpritePurposePlannerOutput(
      {
        routineDraft: {
          steps: [
            { id: 'wait-1', type: 'wait', durationMs: 9000 },
            { id: 'wait-2', type: 'wait', durationMs: 9000 },
            { id: 'wait-3', type: 'wait', durationMs: 9000 }
          ]
        }
      },
      { ...validationOptions, maxSteps: 2, maxDurationMs: 10_000 }
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('exceeding maxSteps 2');
    expect(result.errors.join('\n')).toContain('exceeds maxDurationMs 10000');
  });

  it('treats omitted playAnimation waitFor as fire-and-forget in planner validation', () => {
    const result = validateSpritePurposePlannerOutput(
      {
        routineDraft: {
          steps: [{ id: 'wave', type: 'playAnimation', trigger: 'wave', durationMs: 800 }]
        }
      },
      validationOptions
    );

    expect(result.ok).toBe(true);
    expect(result.summary).toEqual({ stepCount: 1, estimatedDurationMs: 0 });
  });

  it('accepts boolean playAnimation movement gating and rejects non-boolean values', () => {
    const accepted = validateSpritePurposePlannerOutput(
      {
        routineDraft: {
          steps: [{ id: 'dance', type: 'playAnimation', trigger: 'wave', durationMs: 800, allowMovementDuringPlayback: false }]
        }
      },
      validationOptions
    );

    expect(accepted.ok).toBe(true);

    const rejected = validateSpritePurposePlannerOutput(
      {
        routineDraft: {
          steps: [{ id: 'dance', type: 'playAnimation', trigger: 'wave', durationMs: 800, allowMovementDuringPlayback: 'no' }]
        }
      },
      validationOptions
    );

    expect(rejected.ok).toBe(false);
    expect(rejected.errors.join('\n')).toContain('allowMovementDuringPlayback must be a boolean');
  });

  it('requires a bounded wait budget when playAnimation waits for duration or completion', () => {
    const result = validateSpritePurposePlannerOutput(
      {
        routineDraft: {
          steps: [
            { id: 'duration-wave', type: 'playAnimation', trigger: 'wave', waitFor: 'duration' },
            { id: 'complete-wave', type: 'playAnimation', trigger: 'wave', waitFor: 'complete' }
          ]
        }
      },
      validationOptions
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('must include durationMs or timeoutMs when waitFor is "duration" or "complete"');
  });

  it('validates sequence steps and estimates them as ordered child duration', () => {
    const result = validateSpritePurposePlannerOutput(
      {
        routineDraft: {
          steps: [
            {
              id: 'ordered-motion',
              type: 'sequence',
              body: [
                { id: 'walk', type: 'walkTo', target: 'center', timeoutMs: 1200 },
                { id: 'look', type: 'playAnimation', trigger: 'wave', durationMs: 800, waitFor: 'duration' }
              ]
            }
          ]
        }
      },
      validationOptions
    );

    expect(result.ok).toBe(true);
    expect(result.summary).toEqual({ stepCount: 3, estimatedDurationMs: 2000 });
  });

  it('rejects sequence steps without child steps', () => {
    const result = validateSpritePurposePlannerOutput(
      {
        routineDraft: {
          steps: [{ id: 'empty-sequence', type: 'sequence', body: [] }]
        }
      },
      validationOptions
    );

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('routineDraft.steps[0].body must include at least one child step');
  });

  it('counts waitAfter in planner duration estimates', () => {
    const result = validateSpritePurposePlannerOutput(
      {
        routineDraft: {
          steps: [
            { id: 'line', type: 'speak', text: '我说完再继续。', bubbleDuration: 1200, waitAfter: true },
            { id: 'toast', type: 'showToast', content: '下一步', duration: 500, waitAfter: 300 }
          ]
        }
      },
      validationOptions
    );

    expect(result.ok).toBe(true);
    expect(result.summary).toEqual({ stepCount: 2, estimatedDurationMs: 3200 });
  });

  it('builds planner input from presets and stays disabled by default', async () => {
    const executor: SpritePurposePlannerExecutor = {
      plan: vi.fn()
    };
    const service = new SpritePurposePlannerService({
      presets: DEFAULT_SPRITE_ROUTINE_PRESETS,
      executor,
      animationTriggers: ['wave']
    });

    const input = service.buildInput({
      purpose: {
        kind: 'daily.rest-reminder',
        reason: 'rest',
        source: 'system-event',
        presetId: 'daily.rest-reminder'
      }
    });
    expect(input.availablePresets).toEqual(summarizeSpriteRoutinePresets(DEFAULT_SPRITE_ROUTINE_PRESETS));
    expect(input.availableStepSchema.some((entry) => entry.type === 'waitForEvent' && entry.requiresTimeout)).toBe(true);

    const result = await service.plan({
      purpose: {
        kind: 'daily.rest-reminder',
        reason: 'rest',
        source: 'system-event',
        presetId: 'daily.rest-reminder'
      }
    });
    expect(result).toEqual({ status: 'disabled', fallbackPresetId: 'daily.rest-reminder' });
    expect(executor.plan).not.toHaveBeenCalled();
  });

  it('normalizes, updates, and reports purpose planner preferences safely', async () => {
    expect(normalizeSpritePurposePlannerPreferences({ enabled: true, historyLimit: 999 })).toEqual({
      enabled: true,
      historyLimit: 100
    });
    expect(normalizeSpritePurposePlannerPreferences({ enabled: 'yes', historyLimit: 0 })).toEqual(DEFAULT_SPRITE_PURPOSE_PLANNER_PREFERENCES);

    const service = new SpritePurposePlannerService({
      preferences: { enabled: true, historyLimit: 4 },
      presets: DEFAULT_SPRITE_ROUTINE_PRESETS,
      animationTriggers: ['wave']
    });

    expect(service.getPreferences()).toEqual({ enabled: true, historyLimit: 4 });
    expect(service.updatePreferences({ enabled: false, historyLimit: 200 })).toEqual({ enabled: false, historyLimit: 100 });

    const result = await service.plan({
      purpose: {
        kind: 'daily.rest-reminder',
        reason: 'rest',
        source: 'system-event',
        presetId: 'daily.rest-reminder'
      }
    });

    expect(result.status).toBe('disabled');
    expect(service.getStatus()).toMatchObject({
      enabled: false,
      historyLimit: 100,
      hasExecutor: false,
      lastResult: {
        status: 'disabled',
        fallbackPresetId: 'daily.rest-reminder'
      }
    });
  });

  it('persists purpose planner preferences under the app data directory', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'purpose-planner-preferences-'));
    try {
      const store = new SpritePurposePlannerPreferencesStore(tempDir);
      expect(store.read()).toEqual(DEFAULT_SPRITE_PURPOSE_PLANNER_PREFERENCES);

      const updated = await store.update({ enabled: true, historyLimit: 12 });
      expect(updated).toEqual({ enabled: true, historyLimit: 12 });
      expect(existsSync(store.getFilePath())).toBe(true);
      expect(store.read()).toEqual(updated);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('builds and parses the JSON-only runtime prompt for the real executor boundary', () => {
    const service = new SpritePurposePlannerService({
      presets: DEFAULT_SPRITE_ROUTINE_PRESETS,
      animationTriggers: ['wave', 'thinking']
    });
    const input = service.buildInput({
      purpose: {
        kind: 'daily.rest-reminder',
        reason: 'rest',
        source: 'system-event',
        presetId: 'daily.rest-reminder'
      },
      recentHistory: [
        {
          timestamp: 1,
          eventType: 'purpose:completed',
          purposeId: 'old-purpose',
          purposeKind: 'daily.rest-reminder',
          status: 'completed',
          summary: 'completed rest reminder'
        }
      ]
    });

    const prompt = buildSpritePurposePlannerPrompt(input);
    expect(prompt).toContain('Return only JSON');
    expect(prompt).toContain('"availableStepSchema"');
    expect(prompt).toContain('"allowedWindows"');
    expect(prompt.length).toBeLessThanOrEqual(16_000);

    const parsed = parseSpritePurposePlannerOutput(`\`\`\`json
{
  "whyThisPlan": "small acknowledgement",
  "routineDraft": {
    "steps": [
      { "id": "wave", "type": "playAnimation", "trigger": "wave", "durationMs": 500, "waitFor": "duration" }
    ]
  }
}
\`\`\``);
    expect(parsed).toMatchObject({
      whyThisPlan: 'small acknowledgement',
      routineDraft: {
        steps: [{ id: 'wave', type: 'playAnimation', trigger: 'wave', durationMs: 500, waitFor: 'duration' }]
      }
    });
  });

  it('falls back when an enabled planner returns invalid output', async () => {
    const history: SpritePurposeHistoryEntry[] = [];
    const service = new SpritePurposePlannerService({
      enabled: true,
      presets: DEFAULT_SPRITE_ROUTINE_PRESETS,
      animationTriggers: ['wave'],
      validation: validationOptions,
      history: {
        append: (entry) => {
          history.push(entry);
        }
      },
      executor: {
        plan: vi.fn(async () => ({
          whyThisPlan: 'try an unsafe action',
          fallbackPresetId: 'admin.panel',
          routineDraft: {
            steps: [{ id: 'bad', type: 'openWindow', window: 'settings' }]
          }
        }))
      }
    });

    const result = await service.plan({
      purpose: {
        id: 'purpose-1',
        kind: 'daily.rest-reminder',
        title: 'Rest',
        reason: 'rest',
        source: 'ai',
        status: 'queued',
        priority: 60,
        interruptPolicy: 'interruptible',
        presetId: 'daily.rest-reminder'
      }
    });

    expect(result.status).toBe('fallback');
    if (result.status === 'fallback') {
      expect(result.reason).toBe('planner-output-invalid');
      expect(result.fallbackPresetId).toBe('daily.rest-reminder');
      expect(result.validation?.ok).toBe(false);
      expect(result.promptDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(result.outputDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(result.validation?.ok === false ? result.validation.errors.join('\n') : '').toContain('fallbackPresetId "admin.panel" is not in the preset allowlist');
    }
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      eventType: 'planner:fallback',
      purposeId: 'purpose-1',
      purposeKind: 'daily.rest-reminder',
      status: 'fallback',
      result: {
        reason: 'planner-output-invalid',
        fallbackPresetId: 'daily.rest-reminder',
        validationOk: false
      }
    });
    expect(history[0].contextDigest?.promptDigest).toMatch(/^[a-f0-9]{64}$/);
  });

  it('records planned output and can materialize an AI routine draft', async () => {
    const history: SpritePurposeHistoryEntry[] = [];
    const purpose: SpritePurpose = {
      id: 'purpose-ai-1',
      kind: 'daily.care.reminder',
      title: 'Care',
      reason: 'check in',
      source: 'ai',
      status: 'queued',
      priority: 55,
      interruptPolicy: 'interruptible',
      presetId: 'daily.care.reminder'
    };
    const service = new SpritePurposePlannerService({
      enabled: true,
      presets: DEFAULT_SPRITE_ROUTINE_PRESETS,
      animationTriggers: ['wave'],
      validation: validationOptions,
      history: {
        append: (entry) => {
          history.push(entry);
        }
      },
      executor: {
        plan: vi.fn(async () => ({
          whyThisPlan: 'gentle check in',
          fallbackPresetId: 'daily.care.reminder',
          routineDraft: {
            steps: [{ id: 'wave', type: 'playAnimation', trigger: 'wave', durationMs: 800, waitFor: 'duration' }]
          }
        }))
      }
    });

    const result = await service.plan({ purpose });

    expect(result.status).toBe('planned');
    if (result.status === 'planned') {
      const routine = createSpriteRoutineFromPlannerDraft(purpose, result.routineDraft, 1234);
      expect(routine).toMatchObject({
        id: 'routine-purpose-ai-1-ai',
        purposeId: 'purpose-ai-1',
        source: 'ai',
        status: 'queued',
        createdAt: 1234,
        steps: [{ id: 'wave', type: 'playAnimation', trigger: 'wave', durationMs: 800, waitFor: 'duration' }]
      });
    }
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      eventType: 'planner:planned',
      purposeId: 'purpose-ai-1',
      status: 'planned',
      result: {
        fallbackPresetId: 'daily.care.reminder',
        stepCount: 1,
        estimatedDurationMs: 800
      }
    });
  });

  it('adapts the planner service into a live routine planner with history and screen context', async () => {
    const capturedInputs: Array<any> = [];
    const service = new SpritePurposePlannerService({
      enabled: true,
      presets: DEFAULT_SPRITE_ROUTINE_PRESETS,
      animationTriggers: ['wave'],
      validation: validationOptions,
      executor: {
        plan: vi.fn(async (input) => {
          capturedInputs.push(input);
          return {
            whyThisPlan: 'small wave',
            routineDraft: {
              steps: [{ id: 'wave', type: 'playAnimation', trigger: 'wave', durationMs: 500, waitFor: 'duration' }]
            }
          };
        })
      }
    });
    const planner = createSpritePurposeRoutinePlanner(service, {
      history: {
        list: vi.fn(async () => [
          {
            timestamp: 1,
            eventType: 'purpose:completed',
            purposeId: 'old-purpose',
            purposeKind: 'daily.care.reminder',
            status: 'completed'
          }
        ])
      },
      getScreen: () => ({
        screenSize: { width: 1280, height: 720 },
        spritePosition: { x: 20, y: 30 }
      })
    });

    const routine = await planner(
      {
        id: 'purpose-live',
        kind: 'daily.care.reminder',
        title: 'Care',
        reason: 'live plan',
        source: 'ai',
        status: 'queued',
        priority: 55,
        interruptPolicy: 'interruptible'
      },
      {
        now: 4321,
        createPresetRoutine: () => undefined
      }
    );

    expect(routine).toMatchObject({
      id: 'routine-purpose-live-ai',
      purposeId: 'purpose-live',
      source: 'ai',
      createdAt: 4321
    });
    expect(capturedInputs[0].recentHistory).toHaveLength(1);
    expect(capturedInputs[0].screen).toEqual({
      screenSize: { width: 1280, height: 720 },
      spritePosition: { x: 20, y: 30 }
    });
  });

  it('runs the pi runtime executor and returns a parsed planner draft with model metadata', async () => {
    const service = new SpritePurposePlannerService({
      presets: DEFAULT_SPRITE_ROUTINE_PRESETS,
      animationTriggers: ['wave']
    });
    const input = service.buildInput({
      purpose: {
        kind: 'daily.care.reminder',
        reason: 'care',
        source: 'ai',
        presetId: 'daily.care.reminder'
      }
    });
    const raw = JSON.stringify({
      whyThisPlan: 'gentle care routine',
      fallbackPresetId: 'daily.care.reminder',
      routineDraft: {
        steps: [{ id: 'wave', type: 'playAnimation', trigger: 'wave', durationMs: 600, waitFor: 'duration' }]
      }
    });
    const createRuntime = vi.fn(async () => ({
      modelId: 'mock-model',
      chatFn: vi.fn(async (_prompt, onEvent) => {
        onEvent({ type: 'delta', data: { text: raw } });
        onEvent({ type: 'message_completed', data: { text: raw } });
      })
    }));

    const executor = createSpritePurposePiPlannerExecutor({
      context: { providerId: 'zai', providerPresetId: 'preset-1', workspaceId: 'workspace-1' },
      createRuntime,
      timeouts: { maxTimeoutMs: 1000 }
    });

    const output = await executor.plan(input);

    expect(createRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'zai',
        providerPresetId: 'preset-1',
        maxTokens: 1800,
        temperature: 0.2
      })
    );
    expect(output).toMatchObject({
      whyThisPlan: 'gentle care routine',
      fallbackPresetId: 'daily.care.reminder',
      metadata: { modelId: 'mock-model' },
      routineDraft: {
        steps: [{ id: 'wave', type: 'playAnimation', trigger: 'wave', durationMs: 600, waitFor: 'duration' }]
      }
    });
  });

  it('falls back when the pi runtime executor returns unsafe planner JSON', async () => {
    const raw = JSON.stringify({
      whyThisPlan: 'try to open an unsafe window',
      fallbackPresetId: 'daily.rest-reminder',
      routineDraft: {
        steps: [{ id: 'open-settings', type: 'openWindow', window: 'settings', timeoutMs: 1000 }]
      }
    });
    const executor = createSpritePurposePiPlannerExecutor({
      context: { providerId: 'zai', providerPresetId: 'preset-1' },
      createRuntime: vi.fn(async () => ({
        modelId: 'mock-model',
        chatFn: vi.fn(async (_prompt, onEvent) => {
          onEvent({ type: 'message_completed', data: { text: raw } });
        })
      })),
      timeouts: { maxTimeoutMs: 1000 }
    });
    const service = new SpritePurposePlannerService({
      enabled: true,
      executor,
      presets: DEFAULT_SPRITE_ROUTINE_PRESETS,
      animationTriggers: ['wave'],
      validation: validationOptions
    });

    const result = await service.plan({
      purpose: {
        id: 'purpose-runtime-unsafe',
        kind: 'daily.rest-reminder',
        title: 'Rest',
        reason: 'rest',
        source: 'ai',
        status: 'queued',
        priority: 60,
        interruptPolicy: 'interruptible',
        presetId: 'daily.rest-reminder'
      }
    });

    expect(result.status).toBe('fallback');
    if (result.status === 'fallback') {
      expect(result.reason).toBe('planner-output-invalid');
      expect(result.fallbackPresetId).toBe('daily.rest-reminder');
      expect(result.validation?.ok === false ? result.validation.errors.join('\n') : '').toContain('window "settings" is not in the window allowlist');
    }
  });
});
