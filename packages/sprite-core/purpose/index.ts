export type {
  AchievementUnlockedGuideGoalDefinition,
  ChatApiConfiguredGuideGoalDefinition,
  SpriteRoutineGuideGoalDefinition,
  SpriteRoutineGuideGoalKind,
  WorkspaceExistsGuideGoalDefinition
} from './guide-goals';
export {
  CHAT_API_CONFIGURED_GUIDE_GOAL,
  createAchievementUnlockedGuideGoal,
  FIRST_CHAT_GUIDE_GOAL,
  FIRST_FILE_DROP_GUIDE_GOAL,
  OPEN_RESOURCE_LIBRARY_GUIDE_GOAL,
  WORKSPACE_EXISTS_GUIDE_GOAL
} from './guide-goals';
export type { SpritePresentationLockSnapshot, SpritePresentationRequest } from './presentation-lock';
export { SpritePresentationLock } from './presentation-lock';
export { SpritePurposeEventTimeoutError, SpritePurposeEventWaiter } from './purpose-event-waiter';
export { SpritePurposeHistoryStore } from './purpose-history';
export type { SpritePurposeIdlePresenceOptions, SpritePurposeManagerDeps, SpritePurposeQueuePolicyOptions, SpritePurposeRoutinePlanner, SpritePurposeRoutinePlannerContext } from './purpose-manager';
export { SpritePurposeManager } from './purpose-manager';
export type {
  SpritePurposePlannerExecutor,
  SpritePurposePlannerInput,
  SpritePurposePlannerLastResult,
  SpritePurposePlannerOutput,
  SpritePurposePlannerPreferences,
  SpritePurposePlannerPresetSummary,
  SpritePurposePlannerScreenContext,
  SpritePurposePlannerStatus,
  SpritePurposePlannerStepSchemaEntry,
  SpritePurposePlannerValidationOptions,
  SpritePurposePlannerValidationResult,
  SpritePurposePlannerValidationSummary,
  SpriteRoutineDraft
} from './purpose-planner';
export {
  createSpritePurposePlannerStepSchema,
  createSpriteRoutineFromPlannerDraft,
  DEFAULT_SPRITE_PURPOSE_PLANNER_EVENTS,
  DEFAULT_SPRITE_PURPOSE_PLANNER_PREFERENCES,
  DEFAULT_SPRITE_PURPOSE_PLANNER_STEP_TYPES,
  DEFAULT_SPRITE_PURPOSE_PLANNER_WINDOWS,
  normalizeSpritePurposePlannerPreferences,
  summarizeSpriteRoutinePreset,
  summarizeSpriteRoutinePresets,
  validateSpritePurposePlannerOutput
} from './purpose-planner';
export { buildSpritePurposeDailyRetrospective } from './purpose-retrospective';
export type { SpriteRoutinePresetDefinition } from './routine-presets';
export { DEFAULT_SPRITE_ROUTINE_PRESETS, SpriteRoutinePresetRegistry } from './routine-presets';
export type { SpriteRoutineRunnerDeps, SpriteRoutineRunOptions } from './routine-runner';
export { SpriteRoutineCancelledError, SpriteRoutineRunner } from './routine-runner';
export type {
  SpritePurpose,
  SpritePurposeDailyRetrospective,
  SpritePurposeEventType,
  SpritePurposeHistoryEntry,
  SpritePurposeHistoryQuery,
  SpritePurposeHistoryReader,
  SpritePurposeHistoryWriter,
  SpritePurposeInterruptPolicy,
  SpritePurposePresentationMode,
  SpritePurposeRetrospectiveItem,
  SpritePurposeRetrospectiveQuery,
  SpritePurposeRuntimeEvent,
  SpritePurposeRuntimeEventInput,
  SpritePurposeRuntimeEventSource,
  SpritePurposeSnapshot,
  SpritePurposeSource,
  SpritePurposeStartResult,
  SpritePurposeStatus,
  SpriteRoutine,
  SpriteRoutineMovementTarget,
  SpriteRoutineRunResult,
  SpriteRoutineSource,
  SpriteRoutineStatus,
  SpriteRoutineStep,
  SpriteRoutineStepInput,
  SpriteRoutineStepResult,
  SpriteRoutineStepType,
  StartSpritePurposeRequest
} from './types';
