import { createHash } from 'node:crypto';

import type {
  SpritePurpose,
  SpritePurposeHistoryEntry,
  SpritePurposeHistoryReader,
  SpritePurposeHistoryWriter,
  SpritePurposePlannerExecutor,
  SpritePurposePlannerInput,
  SpritePurposePlannerLastResult,
  SpritePurposePlannerOutput,
  SpritePurposePlannerPreferences,
  SpritePurposePlannerStatus,
  SpritePurposePlannerValidationOptions,
  SpritePurposePlannerValidationResult,
  SpritePurposeRoutinePlanner,
  SpriteRoutineDraft,
  SpriteRoutinePresetDefinition,
  StartSpritePurposeRequest
} from '../../../../packages/sprite-core/purpose';
import {
  createSpriteRoutineFromPlannerDraft,
  createSpritePurposePlannerStepSchema,
  DEFAULT_SPRITE_PURPOSE_PLANNER_EVENTS,
  DEFAULT_SPRITE_PURPOSE_PLANNER_PREFERENCES,
  DEFAULT_SPRITE_PURPOSE_PLANNER_WINDOWS,
  normalizeSpritePurposePlannerPreferences,
  summarizeSpriteRoutinePresets,
  validateSpritePurposePlannerOutput
} from '../../../../packages/sprite-core/purpose';

export interface SpritePurposePlannerServiceOptions {
  enabled?: boolean;
  executor?: SpritePurposePlannerExecutor;
  preferences?: Partial<SpritePurposePlannerPreferences>;
  presets: readonly SpriteRoutinePresetDefinition[];
  validation?: SpritePurposePlannerValidationOptions;
  animationTriggers?: readonly string[];
  windows?: readonly string[];
  events?: readonly string[];
  history?: SpritePurposeHistoryWriter;
  now?: () => number;
}

export interface SpritePurposePlannerServicePlanParams {
  purpose: SpritePurpose | StartSpritePurposeRequest;
  currentPurpose?: SpritePurpose | null;
  recentHistory?: SpritePurposeHistoryEntry[];
  screen?: SpritePurposePlannerInput['screen'];
  context?: Record<string, unknown>;
}

export interface SpritePurposeRoutinePlannerAdapterOptions {
  history?: SpritePurposeHistoryReader;
  historyLimit?: number;
  getScreen?: () => SpritePurposePlannerInput['screen'] | undefined;
}

export type SpritePurposePlannerServiceResult =
  | {
      status: 'disabled';
      fallbackPresetId?: string;
    }
  | {
      status: 'planned';
      routineDraft: SpriteRoutineDraft;
      whyThisPlan?: string;
      fallbackPresetId?: string;
      promptDigest: string;
      outputDigest: string;
      validation: Extract<SpritePurposePlannerValidationResult, { ok: true }>;
      elapsedMs: number;
    }
  | {
      status: 'fallback';
      reason: 'planner-unavailable' | 'planner-returned-empty' | 'planner-output-invalid' | 'planner-error';
      fallbackPresetId?: string;
      whyThisPlan?: string;
      promptDigest?: string;
      outputDigest?: string;
      validation?: SpritePurposePlannerValidationResult;
      error?: string;
      elapsedMs: number;
    };

export class SpritePurposePlannerService {
  private preferences: SpritePurposePlannerPreferences;
  private executor?: SpritePurposePlannerExecutor;
  private readonly presets: readonly SpriteRoutinePresetDefinition[];
  private readonly validation: SpritePurposePlannerValidationOptions;
  private readonly animationTriggers: readonly string[];
  private readonly windows: readonly string[];
  private readonly events: readonly string[];
  private readonly history?: SpritePurposeHistoryWriter;
  private readonly now: () => number;
  private lastResult?: SpritePurposePlannerLastResult;

  constructor(options: SpritePurposePlannerServiceOptions) {
    this.preferences = normalizeSpritePurposePlannerPreferences({
      ...DEFAULT_SPRITE_PURPOSE_PLANNER_PREFERENCES,
      ...(options.preferences ?? {}),
      ...(options.enabled !== undefined ? { enabled: options.enabled } : {})
    });
    this.executor = options.executor;
    this.presets = options.presets;
    this.animationTriggers = options.animationTriggers ?? [];
    this.windows = options.windows ?? DEFAULT_SPRITE_PURPOSE_PLANNER_WINDOWS;
    this.events = options.events ?? DEFAULT_SPRITE_PURPOSE_PLANNER_EVENTS;
    this.validation = options.validation ?? {};
    this.history = options.history;
    this.now = options.now ?? (() => Date.now());
  }

  setEnabled(enabled: boolean): void {
    this.updatePreferences({ enabled });
  }

  setExecutor(executor: SpritePurposePlannerExecutor | undefined): void {
    this.executor = executor;
  }

  getPreferences(): SpritePurposePlannerPreferences {
    return { ...this.preferences };
  }

  updatePreferences(patch: Partial<SpritePurposePlannerPreferences>): SpritePurposePlannerPreferences {
    this.preferences = normalizeSpritePurposePlannerPreferences({
      ...this.preferences,
      ...patch
    });
    return this.getPreferences();
  }

  getStatus(): SpritePurposePlannerStatus {
    return {
      ...this.getPreferences(),
      hasExecutor: !!this.executor,
      ...(this.lastResult ? { lastResult: { ...this.lastResult } } : {})
    };
  }

  buildInput(params: SpritePurposePlannerServicePlanParams): SpritePurposePlannerInput {
    return {
      purpose: params.purpose,
      currentPurpose: params.currentPurpose ?? null,
      availablePresets: summarizeSpriteRoutinePresets(this.presets),
      availableStepSchema: createSpritePurposePlannerStepSchema(this.validation.stepTypes),
      availableAnimationTriggers: [...this.animationTriggers],
      allowedWindows: [...this.windows],
      allowedEvents: [...this.events],
      recentHistory: [...(params.recentHistory ?? [])],
      ...(params.screen ? { screen: params.screen } : {}),
      ...(params.context ? { context: { ...params.context } } : {})
    };
  }

  async plan(params: SpritePurposePlannerServicePlanParams): Promise<SpritePurposePlannerServiceResult> {
    if (!this.preferences.enabled) {
      const result: SpritePurposePlannerServiceResult = { status: 'disabled', fallbackPresetId: this.getFallbackPresetId(params.purpose) };
      this.rememberLastResult(result);
      return result;
    }

    const startedAt = this.now();
    const input = this.buildInput(params);
    const promptDigest = digestPlannerPayload(input);
    if (!this.executor) {
      const result: SpritePurposePlannerServiceResult = {
        status: 'fallback',
        reason: 'planner-unavailable',
        fallbackPresetId: this.getFallbackPresetId(params.purpose),
        promptDigest,
        elapsedMs: this.now() - startedAt
      };
      await this.recordPlannerHistory(params, input, result);
      this.rememberLastResult(result);
      return result;
    }

    try {
      const output = await this.executor.plan(input);
      const outputDigest = digestPlannerPayload(output);
      if (!output) {
        const result: SpritePurposePlannerServiceResult = {
          status: 'fallback',
          reason: 'planner-returned-empty',
          fallbackPresetId: this.getFallbackPresetId(params.purpose),
          promptDigest,
          outputDigest,
          elapsedMs: this.now() - startedAt
        };
        await this.recordPlannerHistory(params, input, result);
        this.rememberLastResult(result);
        return result;
      }

      const validation = this.validate(output);
      if (!validation.ok) {
        const result: SpritePurposePlannerServiceResult = {
          status: 'fallback',
          reason: 'planner-output-invalid',
          fallbackPresetId: validation.fallbackPresetId ?? this.getFallbackPresetId(params.purpose),
          ...(validation.whyThisPlan ? { whyThisPlan: validation.whyThisPlan } : {}),
          promptDigest,
          outputDigest,
          validation,
          elapsedMs: this.now() - startedAt
        };
        await this.recordPlannerHistory(params, input, result);
        this.rememberLastResult(result);
        return result;
      }

      const result: SpritePurposePlannerServiceResult = {
        status: 'planned',
        routineDraft: validation.routineDraft,
        ...(validation.whyThisPlan ? { whyThisPlan: validation.whyThisPlan } : {}),
        ...(validation.fallbackPresetId ? { fallbackPresetId: validation.fallbackPresetId } : {}),
        promptDigest,
        outputDigest,
        validation,
        elapsedMs: this.now() - startedAt
      };
      await this.recordPlannerHistory(params, input, result);
      this.rememberLastResult(result);
      return result;
    } catch (error) {
      const result: SpritePurposePlannerServiceResult = {
        status: 'fallback',
        reason: 'planner-error',
        fallbackPresetId: this.getFallbackPresetId(params.purpose),
        promptDigest,
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: this.now() - startedAt
      };
      await this.recordPlannerHistory(params, input, result);
      this.rememberLastResult(result);
      return result;
    }
  }

  validate(output: SpritePurposePlannerOutput | unknown): SpritePurposePlannerValidationResult {
    return validateSpritePurposePlannerOutput(output, {
      ...this.validation,
      presetIds: this.validation.presetIds ?? this.presets.map((preset) => preset.id),
      animationTriggers: this.validation.animationTriggers ?? this.animationTriggers,
      windows: this.validation.windows ?? this.windows,
      events: this.validation.events ?? this.events
    });
  }

  private getFallbackPresetId(purpose: SpritePurpose | StartSpritePurposeRequest): string | undefined {
    if ('presetId' in purpose && purpose.presetId) {
      return purpose.presetId;
    }
    return this.presets.find((preset) => preset.purposeKind === purpose.kind)?.id;
  }

  private async recordPlannerHistory(
    params: SpritePurposePlannerServicePlanParams,
    input: SpritePurposePlannerInput,
    result: Exclude<SpritePurposePlannerServiceResult, { status: 'disabled' }>
  ): Promise<void> {
    if (!this.history) {
      return;
    }

    const purposeId = this.getPurposeId(params.purpose);
    if (!purposeId) {
      return;
    }

    await this.history.append({
      timestamp: this.now(),
      eventType: result.status === 'planned' ? 'planner:planned' : 'planner:fallback',
      purposeId,
      purposeKind: params.purpose.kind,
      priority: 'priority' in params.purpose ? params.purpose.priority : undefined,
      source: 'source' in params.purpose ? params.purpose.source : undefined,
      status: result.status,
      summary: result.status === 'planned' ? result.whyThisPlan : result.reason,
      contextDigest: {
        promptDigest: result.promptDigest,
        presetIds: input.availablePresets.map((preset) => preset.id),
        stepTypes: input.availableStepSchema.map((entry) => entry.type),
        animationTriggerCount: input.availableAnimationTriggers.length,
        recentHistoryCount: input.recentHistory.length
      },
      result: this.buildHistoryResult(result),
      error: result.status === 'fallback' ? result.error : undefined
    });
  }

  private buildHistoryResult(result: Exclude<SpritePurposePlannerServiceResult, { status: 'disabled' }>): Record<string, unknown> {
    if (result.status === 'planned') {
      return {
        outputDigest: result.outputDigest,
        fallbackPresetId: result.fallbackPresetId,
        stepCount: result.validation.summary.stepCount,
        estimatedDurationMs: result.validation.summary.estimatedDurationMs,
        warnings: result.validation.warnings
      };
    }

    const validation = result.validation;
    return {
      reason: result.reason,
      fallbackPresetId: result.fallbackPresetId,
      outputDigest: result.outputDigest,
      validationOk: validation?.ok,
      errors: validation && !validation.ok ? validation.errors : undefined,
      stepCount: validation?.summary.stepCount,
      estimatedDurationMs: validation?.summary.estimatedDurationMs
    };
  }

  private getPurposeId(purpose: SpritePurpose | StartSpritePurposeRequest): string | undefined {
    if ('id' in purpose && purpose.id) {
      return purpose.id;
    }
    const contextPurposeId = purpose.context?.purposeId;
    return typeof contextPurposeId === 'string' && contextPurposeId.trim() ? contextPurposeId : undefined;
  }

  private rememberLastResult(result: SpritePurposePlannerServiceResult): void {
    this.lastResult = {
      status: result.status,
      timestamp: this.now(),
      ...(result.fallbackPresetId ? { fallbackPresetId: result.fallbackPresetId } : {}),
      ...('whyThisPlan' in result && result.whyThisPlan ? { whyThisPlan: result.whyThisPlan } : {}),
      ...('reason' in result ? { reason: result.reason } : {}),
      ...('promptDigest' in result && result.promptDigest ? { promptDigest: result.promptDigest } : {}),
      ...('outputDigest' in result && result.outputDigest ? { outputDigest: result.outputDigest } : {}),
      ...('elapsedMs' in result ? { elapsedMs: result.elapsedMs } : {}),
      ...('validation' in result && result.validation
        ? {
            validationOk: result.validation.ok,
            stepCount: result.validation.summary.stepCount,
            estimatedDurationMs: result.validation.summary.estimatedDurationMs
          }
        : {}),
      ...('error' in result && result.error ? { error: result.error } : {})
    };
  }
}

export function createSpritePurposeRoutinePlanner(
  service: SpritePurposePlannerService,
  options: SpritePurposeRoutinePlannerAdapterOptions = {}
): SpritePurposeRoutinePlanner {
  return async (purpose, context) => {
    const recentHistory = options.history ? await options.history.list({ limit: options.historyLimit ?? service.getPreferences().historyLimit, status: 'all' }) : undefined;
    const result = await service.plan({
      purpose,
      currentPurpose: purpose,
      recentHistory,
      screen: options.getScreen?.(),
      context: {
        fallbackPresetId: context.preset?.id,
        fallbackPurposeKind: context.preset?.purposeKind
      }
    });

    if (result.status !== 'planned') {
      return undefined;
    }

    return createSpriteRoutineFromPlannerDraft(purpose, result.routineDraft, context.now);
  };
}

function digestPlannerPayload(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}
