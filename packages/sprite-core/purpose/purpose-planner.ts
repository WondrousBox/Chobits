import type { SpriteAnimationTrigger } from '../types';
import type { SpriteRoutinePresetDefinition } from './routine-presets';
import type { SpritePurpose, SpritePurposeHistoryEntry, SpritePurposeRuntimeEventSource, SpriteRoutine, SpriteRoutineStep, SpriteRoutineStepType, StartSpritePurposeRequest } from './types';

export interface SpritePurposePlannerPresetSummary {
  id: string;
  title: string;
  purposeKind: string;
  defaultPriority: number;
  goal?: SpriteRoutinePresetDefinition['goal'];
}

export interface SpritePurposePlannerStepSchemaEntry {
  type: SpriteRoutineStepType;
  requiresTimeout: boolean;
  description: string;
}

export interface SpritePurposePlannerScreenContext {
  screenSize?: { width: number; height: number };
  spritePosition?: { x: number; y: number };
}

export interface SpritePurposePlannerInput {
  purpose: SpritePurpose | StartSpritePurposeRequest;
  currentPurpose?: SpritePurpose | null;
  availablePresets: SpritePurposePlannerPresetSummary[];
  availableStepSchema: SpritePurposePlannerStepSchemaEntry[];
  availableAnimationTriggers: string[];
  allowedWindows: string[];
  allowedEvents: string[];
  recentHistory: SpritePurposeHistoryEntry[];
  screen?: SpritePurposePlannerScreenContext;
  context?: Record<string, unknown>;
}

export interface SpriteRoutineDraft {
  steps: SpriteRoutineStep[];
  title?: string;
  expectedDurationMs?: number;
}

export interface SpritePurposePlannerOutput {
  routineDraft?: SpriteRoutineDraft;
  whyThisPlan?: string;
  fallbackPresetId?: string;
  metadata?: Record<string, unknown>;
}

export interface SpritePurposePlannerExecutor {
  plan(input: SpritePurposePlannerInput): Promise<SpritePurposePlannerOutput | null>;
}

export interface SpritePurposePlannerPreferences {
  enabled: boolean;
  historyLimit: number;
}

export type SpritePurposePlannerLastResult = {
  status: 'disabled' | 'planned' | 'fallback';
  timestamp: number;
  fallbackPresetId?: string;
  whyThisPlan?: string;
  reason?: string;
  promptDigest?: string;
  outputDigest?: string;
  elapsedMs?: number;
  stepCount?: number;
  estimatedDurationMs?: number;
  validationOk?: boolean;
  error?: string;
};

export interface SpritePurposePlannerStatus extends SpritePurposePlannerPreferences {
  hasExecutor: boolean;
  lastResult?: SpritePurposePlannerLastResult;
}

export interface SpritePurposePlannerValidationOptions {
  presetIds?: readonly string[];
  stepTypes?: readonly SpriteRoutineStepType[];
  animationTriggers?: readonly string[];
  windows?: readonly string[];
  events?: readonly string[];
  maxSteps?: number;
  maxDurationMs?: number;
  maxStepTimeoutMs?: number;
}

export interface SpritePurposePlannerValidationSummary {
  stepCount: number;
  estimatedDurationMs: number;
}

export type SpritePurposePlannerValidationResult =
  | {
    ok: true;
    routineDraft: SpriteRoutineDraft;
    whyThisPlan?: string;
    fallbackPresetId?: string;
    warnings: string[];
    summary: SpritePurposePlannerValidationSummary;
  }
  | {
    ok: false;
    reason: string;
    errors: string[];
    whyThisPlan?: string;
    fallbackPresetId?: string;
    summary: SpritePurposePlannerValidationSummary;
  };

const DEFAULT_MAX_STEPS = 24;
const DEFAULT_MAX_DURATION_MS = 5 * 60 * 1000;
const DEFAULT_MAX_STEP_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_PLANNER_HISTORY_LIMIT = 20;
const MIN_PLANNER_HISTORY_LIMIT = 1;
const MAX_PLANNER_HISTORY_LIMIT = 100;

export const DEFAULT_SPRITE_PURPOSE_PLANNER_PREFERENCES: SpritePurposePlannerPreferences = {
  enabled: false,
  historyLimit: DEFAULT_PLANNER_HISTORY_LIMIT
};

export const DEFAULT_SPRITE_PURPOSE_PLANNER_STEP_TYPES = [
  'playAnimation',
  'walkTo',
  'wait',
  'waitForEvent',
  'speak',
  'showToast',
  'showNotice',
  'clearMessage',
  'showBusy',
  'updateBusy',
  'clearBusy',
  'openWindow',
  'loopUntil',
  'sequence',
  'parallel',
  'branch'
] as const satisfies readonly SpriteRoutineStepType[];

export const DEFAULT_SPRITE_PURPOSE_PLANNER_WINDOWS = ['fileActionsMenu'] as const;

export const DEFAULT_SPRITE_PURPOSE_PLANNER_EVENTS = [
  'fileAction:resolved',
  'SPRITE_WORKFLOW_PROGRESS',
  'SPRITE_WORKFLOW_COMPLETE',
  'SPRITE_WORKFLOW_FAIL',
  'SPRITE_WORKFLOW_CANCEL',
  'SPRITE_RESOURCE_IMPORT_PROGRESS',
  'SPRITE_RESOURCE_IMPORT_COMPLETE',
  'SPRITE_RESOURCE_IMPORT_ERROR'
] as const;

const STEP_SCHEMA_DESCRIPTIONS: Record<SpriteRoutineStepType, string> = {
  playAnimation: 'Play an allowlisted animation trigger or animation id. Omitted waitFor is fire-and-forget; waitFor:duration or waitFor:complete requires durationMs or timeoutMs. Set allowMovementDuringPlayback:false for presentation-first animations such as dancing.',
  walkTo: 'Move the sprite to center, corner, previous, or a bounded point; timeoutMs is required.',
  wait: 'Pause for a bounded durationMs.',
  waitForEvent: 'Wait for an allowlisted runtime event; timeoutMs is required.',
  speak: 'Show a short speech bubble, optionally with cooldown metadata.',
  showToast: 'Show a short notice/toast.',
  showNotice: 'Show a persistent notice with optional action buttons.',
  clearMessage: 'Clear a toast, notice, busy message, or all sprite messages.',
  showBusy: 'Show busy/progress state.',
  updateBusy: 'Update busy/progress state from fixed values or assigned event paths.',
  clearBusy: 'Clear busy/progress state.',
  openWindow: 'Open an allowlisted window; timeoutMs is required.',
  loopUntil: 'Repeat bounded body steps until allowlisted event; maxDurationMs is required.',
  sequence: 'Run bounded child steps in order; duration is estimated as the sum of child steps.',
  parallel: 'Run bounded child steps concurrently; duration is estimated as the longest child branch.',
  branch: 'Choose nested steps from assigned state; nested steps are validated recursively.'
};

export function createSpritePurposePlannerStepSchema(stepTypes: readonly SpriteRoutineStepType[] = DEFAULT_SPRITE_PURPOSE_PLANNER_STEP_TYPES): SpritePurposePlannerStepSchemaEntry[] {
  return stepTypes.map((type) => ({
    type,
    requiresTimeout: type === 'walkTo' || type === 'waitForEvent' || type === 'openWindow' || type === 'loopUntil',
    description: STEP_SCHEMA_DESCRIPTIONS[type]
  }));
}

export function normalizeSpritePurposePlannerPreferences(value: unknown): SpritePurposePlannerPreferences {
  const record = asRecord(value) ?? {};
  return {
    enabled: typeof record.enabled === 'boolean' ? record.enabled : DEFAULT_SPRITE_PURPOSE_PLANNER_PREFERENCES.enabled,
    historyLimit: normalizeBoundedInteger(record.historyLimit, DEFAULT_SPRITE_PURPOSE_PLANNER_PREFERENCES.historyLimit, MIN_PLANNER_HISTORY_LIMIT, MAX_PLANNER_HISTORY_LIMIT)
  };
}

export function summarizeSpriteRoutinePreset(preset: SpriteRoutinePresetDefinition): SpritePurposePlannerPresetSummary {
  return {
    id: preset.id,
    title: preset.title,
    purposeKind: preset.purposeKind,
    defaultPriority: preset.defaultPriority,
    ...(preset.goal ? { goal: preset.goal } : {})
  };
}

export function summarizeSpriteRoutinePresets(presets: readonly SpriteRoutinePresetDefinition[]): SpritePurposePlannerPresetSummary[] {
  return presets.map((preset) => summarizeSpriteRoutinePreset(preset));
}

export function createSpriteRoutineFromPlannerDraft(purpose: SpritePurpose, draft: SpriteRoutineDraft, now = Date.now()): SpriteRoutine {
  return {
    id: `routine-${purpose.id}-ai`,
    purposeId: purpose.id,
    presetId: purpose.presetId,
    priority: purpose.priority,
    source: 'ai',
    status: 'queued',
    steps: draft.steps.map((step) => cloneRoutineStep(step)),
    cursor: 0,
    createdAt: now
  };
}

export function validateSpritePurposePlannerOutput(output: unknown, options: SpritePurposePlannerValidationOptions = {}): SpritePurposePlannerValidationResult {
  const normalized = normalizeValidationOptions(options);
  const errors: string[] = [];
  const warnings: string[] = [];
  const state: ValidationState = {
    ...normalized,
    errors,
    stepCount: 0
  };

  const root = asRecord(output);
  if (!root) {
    return invalid(['planner output must be an object'], undefined, undefined, { stepCount: 0, estimatedDurationMs: 0 });
  }

  const whyThisPlan = getOptionalString(root.whyThisPlan);
  const rawFallbackPresetId = getOptionalString(root.fallbackPresetId);
  const fallbackPresetId = rawFallbackPresetId && (normalized.presetIds.size === 0 || normalized.presetIds.has(rawFallbackPresetId)) ? rawFallbackPresetId : undefined;
  if (rawFallbackPresetId && !fallbackPresetId) {
    errors.push(`fallbackPresetId "${rawFallbackPresetId}" is not in the preset allowlist`);
  }

  const draft = asRecord(root.routineDraft);
  if (!draft) {
    return invalid(errors.concat('routineDraft is required'), fallbackPresetId, whyThisPlan, { stepCount: 0, estimatedDurationMs: 0 });
  }

  if (draft.title !== undefined && !getOptionalString(draft.title)) {
    errors.push('routineDraft.title must be a non-empty string when present');
  }

  const expectedDurationMs = getOptionalNonNegativeNumber(draft.expectedDurationMs);
  if (draft.expectedDurationMs !== undefined && expectedDurationMs === undefined) {
    errors.push('routineDraft.expectedDurationMs must be a non-negative finite number when present');
  }

  const steps = Array.isArray(draft.steps) ? draft.steps : undefined;
  if (!steps) {
    return invalid(errors.concat('routineDraft.steps must be an array'), fallbackPresetId, whyThisPlan, { stepCount: state.stepCount, estimatedDurationMs: 0 });
  }

  const estimatedDurationMs = validateStepList(steps, 'routineDraft.steps', state, 'sum');
  if (state.stepCount > normalized.maxSteps) {
    errors.push(`routineDraft has ${state.stepCount} steps, exceeding maxSteps ${normalized.maxSteps}`);
  }
  if (estimatedDurationMs > normalized.maxDurationMs) {
    errors.push(`routineDraft estimated duration ${estimatedDurationMs}ms exceeds maxDurationMs ${normalized.maxDurationMs}`);
  }
  if (expectedDurationMs !== undefined && Math.abs(expectedDurationMs - estimatedDurationMs) > normalized.maxDurationMs) {
    warnings.push('routineDraft.expectedDurationMs is far from the bounded estimate');
  }

  const summary = { stepCount: state.stepCount, estimatedDurationMs };
  if (errors.length > 0) {
    return invalid(errors, fallbackPresetId, whyThisPlan, summary);
  }

  return {
    ok: true,
    routineDraft: {
      steps: steps.map((step) => cloneRoutineStep(step as SpriteRoutineStep)),
      ...(getOptionalString(draft.title) ? { title: getOptionalString(draft.title) } : {}),
      ...(expectedDurationMs !== undefined ? { expectedDurationMs } : {})
    },
    ...(whyThisPlan ? { whyThisPlan } : {}),
    ...(fallbackPresetId ? { fallbackPresetId } : {}),
    warnings,
    summary
  };
}

interface NormalizedValidationOptions {
  presetIds: Set<string>;
  stepTypes: Set<string>;
  animationTriggers: Set<string>;
  windows: Set<string>;
  events: Set<string>;
  maxSteps: number;
  maxDurationMs: number;
  maxStepTimeoutMs: number;
}

interface ValidationState extends NormalizedValidationOptions {
  errors: string[];
  stepCount: number;
}

type DurationMode = 'sum' | 'max';

function normalizeValidationOptions(options: SpritePurposePlannerValidationOptions): NormalizedValidationOptions {
  return {
    presetIds: toStringSet(options.presetIds),
    stepTypes: toStringSet(options.stepTypes ?? DEFAULT_SPRITE_PURPOSE_PLANNER_STEP_TYPES),
    animationTriggers: toStringSet(options.animationTriggers),
    windows: toStringSet(options.windows ?? DEFAULT_SPRITE_PURPOSE_PLANNER_WINDOWS),
    events: toStringSet(options.events ?? DEFAULT_SPRITE_PURPOSE_PLANNER_EVENTS),
    maxSteps: normalizePositiveInteger(options.maxSteps, DEFAULT_MAX_STEPS),
    maxDurationMs: normalizePositiveInteger(options.maxDurationMs, DEFAULT_MAX_DURATION_MS),
    maxStepTimeoutMs: normalizePositiveInteger(options.maxStepTimeoutMs, DEFAULT_MAX_STEP_TIMEOUT_MS)
  };
}

function validateStepList(steps: unknown[], path: string, state: ValidationState, mode: DurationMode): number {
  let aggregate = 0;
  for (let index = 0; index < steps.length; index += 1) {
    const duration = validateStep(steps[index], `${path}[${index}]`, state);
    aggregate = mode === 'max' ? Math.max(aggregate, duration) : aggregate + duration;
  }
  return aggregate;
}

function validateStep(step: unknown, path: string, state: ValidationState): number {
  const record = asRecord(step);
  if (!record) {
    state.errors.push(`${path} must be an object`);
    return 0;
  }

  state.stepCount += 1;

  const id = getOptionalString(record.id);
  if (!id) {
    state.errors.push(`${path}.id must be a non-empty string`);
  }

  const type = getOptionalString(record.type);
  if (!type) {
    state.errors.push(`${path}.type must be a non-empty string`);
    return 0;
  }
  if (!state.stepTypes.has(type)) {
    state.errors.push(`${path}.type "${type}" is not in the step allowlist`);
    return 0;
  }

  let duration = 0;
  switch (type as SpriteRoutineStepType) {
    case 'playAnimation':
      duration = validatePlayAnimationStep(record, path, state);
      break;
    case 'walkTo':
      duration = validateWalkToStep(record, path, state);
      break;
    case 'wait':
      validateRuntimeEventSource(record.interruptSource, `${path}.interruptSource`, state);
      if (record.interruptEvent !== undefined) {
        validateEventName(record.interruptEvent, `${path}.interruptEvent`, state);
      }
      duration = requireDuration(record.durationMs, `${path}.durationMs`, state);
      break;
    case 'waitForEvent':
      duration = validateWaitForEventStep(record, path, state);
      break;
    case 'speak':
      duration = validateSpeakStep(record, path, state);
      break;
    case 'showToast':
      duration = validateBoundedOptionalDuration(record.duration, `${path}.duration`, state);
      break;
    case 'showNotice':
      duration = validateBoundedOptionalDuration(record.duration, `${path}.duration`, state);
      break;
    case 'clearMessage':
      duration = 0;
      break;
    case 'showBusy':
    case 'updateBusy':
    case 'clearBusy':
      duration = 0;
      break;
    case 'openWindow':
      duration = validateOpenWindowStep(record, path, state);
      break;
    case 'loopUntil':
      if (record.ignoreHistory !== undefined && typeof record.ignoreHistory !== 'boolean') {
        state.errors.push(`${path}.ignoreHistory must be a boolean when provided`);
      }
      duration = validateLoopUntilStep(record, path, state);
      break;
    case 'sequence':
      duration = validateSequenceStep(record, path, state);
      break;
    case 'parallel':
      duration = validateParallelStep(record, path, state);
      break;
    case 'branch':
      duration = validateBranchStep(record, path, state);
      break;
    default:
      state.errors.push(`${path}.type "${type}" is not supported`);
      return 0;
  }
  return duration + validateWaitAfter(record.waitAfter, duration, `${path}.waitAfter`, state);
}

function validatePlayAnimationStep(record: Record<string, unknown>, path: string, state: ValidationState): number {
  const trigger = getOptionalString(record.trigger);
  if (trigger && state.animationTriggers.size > 0 && !state.animationTriggers.has(trigger)) {
    state.errors.push(`${path}.trigger "${trigger}" is not in the animation allowlist`);
  }

  if (record.waitFor !== undefined && record.waitFor !== 'complete' && record.waitFor !== 'duration' && record.waitFor !== 'none') {
    state.errors.push(`${path}.waitFor must be "complete", "duration", or "none"`);
  }
  if (record.allowMovementDuringPlayback !== undefined && typeof record.allowMovementDuringPlayback !== 'boolean') {
    state.errors.push(`${path}.allowMovementDuringPlayback must be a boolean when provided`);
  }

  const durationMs = getOptionalNonNegativeNumber(record.durationMs);
  const timeoutMs = getOptionalNonNegativeNumber(record.timeoutMs);
  if ((record.waitFor === 'duration' || record.waitFor === 'complete') && durationMs === undefined && timeoutMs === undefined) {
    state.errors.push(`${path} must include durationMs or timeoutMs when waitFor is "duration" or "complete"`);
  }
  validateOptionalTimeout(record.timeoutMs, `${path}.timeoutMs`, state);
  if (record.waitFor === 'duration') {
    return durationMs ?? timeoutMs ?? 0;
  }
  if (record.waitFor === 'complete') {
    return timeoutMs ?? durationMs ?? 0;
  }
  return 0;
}

function validateWalkToStep(record: Record<string, unknown>, path: string, state: ValidationState): number {
  const target = record.target;
  const stringTarget = typeof target === 'string' ? target : undefined;
  const pointTarget = asRecord(target);
  if (stringTarget && stringTarget !== 'center' && stringTarget !== 'corner' && stringTarget !== 'previous') {
    state.errors.push(`${path}.target string must be center, corner, or previous`);
  } else if (!stringTarget && pointTarget) {
    if (typeof pointTarget.window === 'string') {
      state.errors.push(`${path}.target cannot reference app windows in AI planned routines`);
      return requireTimeout(record.timeoutMs, `${path}.timeoutMs`, state);
    }
    if (getOptionalNonNegativeNumber(pointTarget.x) === undefined || getOptionalNonNegativeNumber(pointTarget.y) === undefined) {
      state.errors.push(`${path}.target point must include non-negative finite x and y`);
    }
  } else if (!stringTarget) {
    state.errors.push(`${path}.target is required`);
  }
  return requireTimeout(record.timeoutMs, `${path}.timeoutMs`, state);
}

function validateWaitForEventStep(record: Record<string, unknown>, path: string, state: ValidationState): number {
  validateEventName(record.event, `${path}.event`, state);
  validateRuntimeEventSource(record.source, `${path}.source`, state);
  return requireTimeout(record.timeoutMs, `${path}.timeoutMs`, state);
}

function validateSpeakStep(record: Record<string, unknown>, path: string, state: ValidationState): number {
  if (!getOptionalString(record.text)) {
    state.errors.push(`${path}.text must be a non-empty string`);
  }
  validateOptionalTimeout(record.timeoutMs, `${path}.timeoutMs`, state);
  validateBoundedOptionalDuration(record.bubbleDuration, `${path}.bubbleDuration`, state);
  validateBoundedOptionalDuration(record.cooldownMs, `${path}.cooldownMs`, state);
  return getOptionalNonNegativeNumber(record.timeoutMs) ?? getOptionalNonNegativeNumber(record.bubbleDuration) ?? 0;
}

function validateOpenWindowStep(record: Record<string, unknown>, path: string, state: ValidationState): number {
  const windowKey = getOptionalString(record.window);
  if (!windowKey) {
    state.errors.push(`${path}.window must be a non-empty string`);
  } else if (state.windows.size > 0 && !state.windows.has(windowKey)) {
    state.errors.push(`${path}.window "${windowKey}" is not in the window allowlist`);
  }
  if (record.waitForEvent !== undefined) {
    validateEventName(record.waitForEvent, `${path}.waitForEvent`, state);
  }
  validateRuntimeEventSource(record.eventSource, `${path}.eventSource`, state);
  return requireTimeout(record.timeoutMs, `${path}.timeoutMs`, state);
}

function validateLoopUntilStep(record: Record<string, unknown>, path: string, state: ValidationState): number {
  const untilEvent = record.untilEvent;
  const events = Array.isArray(untilEvent) ? untilEvent : [untilEvent];
  if (Array.isArray(untilEvent)) {
    if (untilEvent.length === 0) {
      state.errors.push(`${path}.untilEvent must include at least one event`);
    }
    untilEvent.forEach((event, index) => validateEventName(event, `${path}.untilEvent[${index}]`, state));
  } else {
    validateEventName(untilEvent, `${path}.untilEvent`, state);
  }
  validateLoopUntilEventMatches(record.eventMatches, events, `${path}.eventMatches`, state);
  validateRuntimeEventSource(record.source, `${path}.source`, state);

  if (!Array.isArray(record.body)) {
    state.errors.push(`${path}.body must be an array`);
  } else {
    validateStepList(record.body, `${path}.body`, state, 'sum');
  }
  return requireTimeout(record.maxDurationMs, `${path}.maxDurationMs`, state);
}

function validateLoopUntilEventMatches(value: unknown, events: unknown[], path: string, state: ValidationState): void {
  if (value === undefined) return;
  const eventMatches = asRecord(value);
  if (!eventMatches) {
    state.errors.push(`${path} must be an object when provided`);
    return;
  }
  const eventNames = new Set(events.filter((event): event is string => typeof event === 'string' && event.trim().length > 0));
  for (const [event, match] of Object.entries(eventMatches)) {
    if (!eventNames.has(event)) {
      state.errors.push(`${path}.${event} must reference an untilEvent`);
    }
    if (!asRecord(match)) {
      state.errors.push(`${path}.${event} must be an object`);
    }
  }
}

function validateParallelStep(record: Record<string, unknown>, path: string, state: ValidationState): number {
  if (!Array.isArray(record.body)) {
    state.errors.push(`${path}.body must be an array`);
    return 0;
  }
  if (record.body.length === 0) {
    state.errors.push(`${path}.body must include at least one child step`);
    return 0;
  }
  return validateStepList(record.body, `${path}.body`, state, 'max');
}

function validateSequenceStep(record: Record<string, unknown>, path: string, state: ValidationState): number {
  if (!Array.isArray(record.body)) {
    state.errors.push(`${path}.body must be an array`);
    return 0;
  }
  if (record.body.length === 0) {
    state.errors.push(`${path}.body must include at least one child step`);
    return 0;
  }
  return validateStepList(record.body, `${path}.body`, state, 'sum');
}

function validateBranchStep(record: Record<string, unknown>, path: string, state: ValidationState): number {
  if (!getOptionalString(record.by)) {
    state.errors.push(`${path}.by must be a non-empty string`);
  }

  const cases = asRecord(record.cases);
  if (!cases) {
    state.errors.push(`${path}.cases must be an object of step arrays`);
    return 0;
  }

  const branchDurations: number[] = [];
  for (const [caseKey, caseSteps] of Object.entries(cases)) {
    if (!Array.isArray(caseSteps)) {
      state.errors.push(`${path}.cases.${caseKey} must be an array`);
      continue;
    }
    branchDurations.push(validateStepList(caseSteps, `${path}.cases.${caseKey}`, state, 'sum'));
  }

  if (record.default !== undefined) {
    if (!Array.isArray(record.default)) {
      state.errors.push(`${path}.default must be an array when present`);
    } else {
      branchDurations.push(validateStepList(record.default, `${path}.default`, state, 'sum'));
    }
  }

  return branchDurations.length > 0 ? Math.max(...branchDurations) : 0;
}

function validateWaitAfter(value: unknown, fallbackDurationMs: number, path: string, state: ValidationState): number {
  if (value === undefined || value === false) {
    return 0;
  }
  if (value === true) {
    return fallbackDurationMs;
  }
  return validateBoundedOptionalDuration(value, path, state);
}

function validateEventName(value: unknown, path: string, state: ValidationState): void {
  const event = getOptionalString(value);
  if (!event) {
    state.errors.push(`${path} must be a non-empty string`);
    return;
  }
  if (state.events.size > 0 && !state.events.has(event)) {
    state.errors.push(`${path} "${event}" is not in the event allowlist`);
  }
}

function validateRuntimeEventSource(value: unknown, path: string, state: ValidationState): void {
  if (value === undefined) {
    return;
  }
  const allowed = ['sprite-event-bus', 'app-event', 'purpose-event'] as const satisfies readonly SpritePurposeRuntimeEventSource[];
  if (typeof value !== 'string' || !allowed.includes(value as SpritePurposeRuntimeEventSource)) {
    state.errors.push(`${path} must be sprite-event-bus, app-event, or purpose-event when present`);
  }
}

function requireDuration(value: unknown, path: string, state: ValidationState): number {
  const duration = getOptionalNonNegativeNumber(value);
  if (duration === undefined) {
    state.errors.push(`${path} must be a non-negative finite number`);
    return 0;
  }
  if (duration > state.maxStepTimeoutMs) {
    state.errors.push(`${path} ${duration}ms exceeds maxStepTimeoutMs ${state.maxStepTimeoutMs}`);
  }
  return duration;
}

function requireTimeout(value: unknown, path: string, state: ValidationState): number {
  const timeout = getOptionalNonNegativeNumber(value);
  if (timeout === undefined) {
    state.errors.push(`${path} is required and must be a non-negative finite number`);
    return 0;
  }
  if (timeout > state.maxStepTimeoutMs) {
    state.errors.push(`${path} ${timeout}ms exceeds maxStepTimeoutMs ${state.maxStepTimeoutMs}`);
  }
  return timeout;
}

function validateOptionalTimeout(value: unknown, path: string, state: ValidationState): void {
  if (value !== undefined) {
    requireTimeout(value, path, state);
  }
}

function validateBoundedOptionalDuration(value: unknown, path: string, state: ValidationState): number {
  if (value === undefined) {
    return 0;
  }
  return requireDuration(value, path, state);
}

function invalid(errors: string[], fallbackPresetId: string | undefined, whyThisPlan: string | undefined, summary: SpritePurposePlannerValidationSummary): SpritePurposePlannerValidationResult {
  return {
    ok: false,
    reason: 'planner-output-invalid',
    errors,
    ...(whyThisPlan ? { whyThisPlan } : {}),
    ...(fallbackPresetId ? { fallbackPresetId } : {}),
    summary
  };
}

function cloneRoutineStep(step: SpriteRoutineStep): SpriteRoutineStep {
  if (step.type === 'loopUntil') {
    return {
      ...step,
      body: step.body.map((child) => cloneRoutineStep(child))
    };
  }
  if (step.type === 'parallel') {
    return {
      ...step,
      body: step.body.map((child) => cloneRoutineStep(child))
    };
  }
  if (step.type === 'sequence') {
    return {
      ...step,
      body: step.body.map((child) => cloneRoutineStep(child))
    };
  }
  if (step.type === 'branch') {
    const cases = Object.fromEntries(Object.entries(step.cases).map(([key, steps]) => [key, steps.map((child) => cloneRoutineStep(child))]));
    return {
      ...step,
      cases,
      ...(step.default ? { default: step.default.map((child) => cloneRoutineStep(child)) } : {})
    };
  }
  return { ...step };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getOptionalNonNegativeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function toStringSet(values?: readonly unknown[]): Set<string> {
  return new Set((values ?? []).filter((value): value is string => typeof value === 'string' && value.trim().length > 0).map((value) => value.trim()));
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function normalizeBoundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const normalized = normalizePositiveInteger(value, fallback);
  return Math.min(max, Math.max(min, normalized));
}

export type SpritePurposePlannerAnimationTrigger = SpriteAnimationTrigger;
