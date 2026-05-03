/**
 * @package sprite-core
 *
 * 桌面精灵游戏化核心引擎
 * ========================
 *
 * 架构概览：
 * - StateMachine: 有限状态机引擎 —— 管理精灵视觉状态转换
 * - PersonaStateManager: 人格状态管理器 —— 经验值/等级/好感度/心情
 * - InteractionTracker: 交互追踪器 —— 记录并量化用户交互
 * - BehaviorEngine: 行为引擎 —— 可扩展、条件驱动的自主行为调度
 * - AnimationRegistry: 动画注册表 —— 统一索引与按 trigger 查询
 *
 * 设计原则：
 * 1. 纯逻辑层，不依赖 React / Electron —— 便于测试和跨环境复用
 * 2. 事件驱动，通过 EventEmitter pattern 解耦
 * 3. 插件化扩展：所有系统通过 Registry 模式注册，可热插拔
 * 4. 类型安全：完整 TypeScript 类型，所有状态转换编译期校验
 */

// ----- Shared Types -----
export type {
  BusyInput,
  BusyMessage,
  MessageBridgeClearPayload,
  MessageBridgePayload,
  MessageBridgeSource,
  MessageButton,
  MessageCatalog,
  MessageCategory,
  MessageContextValue,
  MessageIPCPayload,
  MessageLevel,
  MessageProducer,
  MessageQueueState,
  MessagesProvider,
  MessageType,
  NoticeInput,
  NoticeMessage,
  PersonaSnapshot,
  SpriteAnimation,
  SpriteAnimationCondition,
  SpriteAnimationConditionGroup,
  SpriteAnimationConditionOperator,
  SpriteAnimationConditionScalar,
  SpriteAnimationConditionValue,
  SpriteAnimationMeta,
  SpriteAnimationTrigger,
  SpriteAnimationTriggerMetadata,
  SpriteBuiltinAnimationTrigger,
  SpriteConfig,
  SpriteEventType,
  SpriteInitialState,
  SpriteMessageData,
  SpriteMovementConfig,
  SpriteMovementDirection,
  SpriteMovementMode,
  SpriteMovementTrigger,
  SpritePersonaStateResult,
  SpritePlayCommand,
  SpriteStateSnapshot,
  SpriteTriggerOptions,
  SpriteTriggerRequest,
  SpriteWalkState,
  ToastInput,
  ToastMessage
} from './types';
export {
  compileSpriteAnimationCondition,
  DEFAULT_DURATION,
  getPrimarySpriteAnimationTrigger,
  getSpriteAnimationTriggerAliases,
  getSpriteAnimationTriggers,
  hasSpriteAnimationTrigger,
  isBuiltinSpriteAnimationTrigger,
  isCustomSpriteAnimationTrigger,
  matchesSpriteAnimationCondition,
  MESSAGE_IPC_CHANNELS,
  MESSAGE_PRIORITY,
  normalizeSpriteAnimationCondition,
  normalizeSpriteAnimationMeta,
  normalizeSpriteAnimationMetaPatch,
  SPRITE_EVENT_TYPES,
  SpriteEventGroups
} from './types';

// ----- Modules -----
export { AnimationRegistry } from './animation-registry';
export type { BehaviorCondition, BehaviorContext, BehaviorDefinition, BehaviorPriority } from './behavior-engine';
export { BehaviorEngine, createAutoWalkBehavior, createBoredBehavior, createFavorDecayBehavior, createRandomMessageBehavior, createSleepyBehavior } from './behavior-engine';
export type {
  CapabilityLevelUnlockDefinition,
  SpriteCapabilityBranch,
  SpriteCapabilityDefinition,
  SpriteCapabilityLevelUnlockType,
  SpriteCapabilityResolutionContext,
  SpriteCapabilityShortcut,
  SpriteCapabilitySignalMode,
  SpriteCapabilitySnapshot,
  SpriteCapabilityState,
  SpriteCapabilityStatus,
  SpriteCapabilityTier,
  SpriteCapabilityTotals
} from './capability-registry';
export { CapabilityRegistry, DEFAULT_SPRITE_CAPABILITY_DEFINITIONS, DEFAULT_SPRITE_CAPABILITY_REGISTRY, getSpriteCapabilityLevelUnlocks, SPRITE_CAPABILITY_SIGNALS } from './capability-registry';
export type { SpriteCapabilityRuntimeResolver } from './capability-runtime';
export {
  assertSpriteCapabilityActive,
  assertSpriteCapabilityUnlocked,
  getSpriteCapabilityRuntimeState,
  getSpriteCapabilitySnapshot,
  hasSpriteCapabilityRuntime,
  initSpriteCapabilityRuntime,
  resetSpriteCapabilityRuntime
} from './capability-runtime';
export type { CharacterCapabilityContextFlags } from './character-capability-flags';
export type { CharacterPackDigestVerification, CharacterPackDigestVerificationStatus } from './character-pack-integrity';
export { assessCharacterPackDigest, calculateCharacterPackPayloadDigest, verifyCharacterPackDigest } from './character-pack-integrity';
export type {
  CharacterPackActivationResult,
  CharacterPackEditorCharacterFields,
  CharacterPackEditorDraft,
  CharacterPackEditorPackFields,
  CharacterPackEditorSaveOptions,
  CharacterPackEditorSaveResult,
  CharacterPackExportResult,
  CharacterPackImportBlockingError,
  CharacterPackImportCompatibility,
  CharacterPackImportInspection,
  CharacterPackImportPreview,
  CharacterPackImportSourceType,
  CharacterPackImportWarning,
  CharacterPackInstallOptions,
  CharacterPackInstallResult,
  CharacterPackManagerOptions,
  CharacterPackRemovalResult,
  CharacterPackSource,
  CharacterPackSummary,
  CharacterPackTrustAssessment,
  CharacterPackTrustLevel,
  CharacterPackTrustLink,
  CharacterPackTrustLinkLabel,
  CharacterPackTrustVerificationStatus,
  ResolvedCharacterPackAssets
} from './character-pack-manager';
export {
  activateCharacterPack,
  exportCharacterPack,
  getActiveCharacterPack,
  getActiveCharacterPackRootDir,
  getCharacterPackEditorDraft,
  getCharacterPackImportPreviewCacheRootDir,
  initCharacterPackManager,
  inspectCharacterPackFromArchive,
  installCharacterPackFromArchive,
  listCharacterPacks,
  removeCharacterPack,
  resetCharacterPackManager,
  saveCharacterPackEditorDraft
} from './character-pack-manager';
export type {
  CharacterPackSignatureVerification,
  CharacterPackSignatureVerificationStatus,
  CharacterPackTrustedKey,
  CharacterPackTrustedKeyAlgorithm,
  CharacterPackTrustRoot
} from './character-pack-signature';
export { createCharacterPackSignaturePayload, loadCharacterPackTrustRoot, verifyCharacterPackSignature } from './character-pack-signature';
export type { CharacterPersonaRuntimeSyncResult } from './character-runtime';
export { reloadCharacterPersonaRuntime, syncCharacterPersonaRuntime } from './character-runtime';
export type {
  ActivityReward,
  ActivityRewardId,
  BuiltinActivityRewardId,
  CharacterCapabilityFlagsConfig,
  CharacterCapabilityPersonaFlagDefinition,
  CharacterConversationBonusMatcherDefinition,
  CharacterDefinition,
  CharacterFavorModifierDefinition,
  CharacterMoodRuleDefinition,
  CharacterPackAssets,
  CharacterPackCapabilities,
  CharacterPackDefinition,
  CharacterPackProvenance,
  CharacterPackSignature,
  CharacterPersonaRulesConfig,
  CharacterXPSourceDefinition,
  ConditionalToolLabel,
  ConversationRewards,
  DimensionDef,
  FavorPersonaEntry,
  MoodExpression,
  PersonaPromptContext,
  ToolLabelDefinition,
  ToolLabelTemplate
} from './character-service';
export {
  buildCharacterPersonaPrompt,
  getActivityRewards,
  getCharacterCapabilityContextFlags,
  getCharacterDefinition,
  getCharacterInfo,
  getCharacterPackAssetPath,
  getCharacterPackDefinition,
  getCharacterPackFilePath,
  getCharacterPackRootDir,
  getCharacterToolLabels,
  getConversationRewards,
  getDimensionSchema,
  getFavorPersonaOverlay,
  initCharacterService,
  reloadCharacter,
  reloadCharacterPack,
  setCharacterFilePath,
  setCharacterPackFilePath
} from './character-service';
export type { SpritePersonaEvent, SpritePersonaEventType } from './event-bus';
export { SpriteEventBus } from './event-bus';
export type { SpriteInteractionEvent, SpriteInteractionIntent, SpriteInteractionPayload } from './interaction-contract';
export { isSpriteInteractionEvent, isSpriteInteractionIntent, SPRITE_INTERACTION_EVENT_BY_INTENT, SPRITE_INTERACTION_EVENTS, SPRITE_INTERACTION_INTENTS } from './interaction-contract';
export type { InteractionEvent, InteractionStats, InteractionType } from './interaction-tracker';
export { InteractionTracker } from './interaction-tracker';
export type { ConversationBonusMatcher, ConversationRewardContext, PersonaDimensionReward, PersonaRewardGrant, PersonaRulesLayer, PersonaRulesProvider, PersonaRulesSnapshot } from './persona-rules';
export {
  clearPersonaRulesLayers,
  getConversationRewardCooldownMs,
  getConversationRewardEventRules,
  getPersonaRuleDimensionSchema,
  getPersonaRulesProvider,
  getPersonaRulesSnapshot,
  getResolvedActivityPersonaReward,
  getResolvedConversationPersonaReward,
  getResolvedConversationPersonaRewardBonus,
  registerConversationBonusMatcher,
  removePersonaRulesLayer,
  resetPersonaRulesProvider,
  resetPersonaRulesRuntime,
  setPersonaRulesProvider,
  subscribePersonaRulesChanges,
  unregisterConversationBonusMatcher,
  upsertPersonaRulesLayer
} from './persona-rules';
export type { FavorLevel, LevelConfig, MoodType, PersonaState } from './persona-state';
export { PersonaStateManager } from './persona-state';
export type {
  SpritePurpose,
  SpritePurposeDailyRetrospective,
  SpritePurposeHistoryEntry,
  SpritePurposeHistoryQuery,
  SpritePurposeHistoryReader,
  SpritePurposeHistoryWriter,
  SpritePurposeInterruptPolicy,
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
  SpritePurposeRetrospectiveItem,
  SpritePurposeRetrospectiveQuery,
  SpritePurposeRoutinePlanner,
  SpritePurposeRoutinePlannerContext,
  SpritePurposeRuntimeEvent,
  SpritePurposeRuntimeEventInput,
  SpritePurposeRuntimeEventSource,
  SpritePurposeSnapshot,
  SpritePurposeSource,
  SpritePurposeStartResult,
  SpritePurposeStatus,
  SpriteRoutine,
  SpriteRoutineDraft,
  SpriteRoutineRunResult,
  SpriteRoutineSource,
  SpriteRoutineStatus,
  SpriteRoutineStep,
  SpriteRoutineStepResult,
  StartSpritePurposeRequest
} from './purpose';
export {
  buildSpritePurposeDailyRetrospective,
  createSpritePurposePlannerStepSchema,
  createSpriteRoutineFromPlannerDraft,
  DEFAULT_SPRITE_PURPOSE_PLANNER_EVENTS,
  DEFAULT_SPRITE_PURPOSE_PLANNER_PREFERENCES,
  DEFAULT_SPRITE_PURPOSE_PLANNER_STEP_TYPES,
  DEFAULT_SPRITE_PURPOSE_PLANNER_WINDOWS,
  DEFAULT_SPRITE_ROUTINE_PRESETS,
  normalizeSpritePurposePlannerPreferences,
  SpritePurposeEventWaiter,
  SpritePurposeHistoryStore,
  SpritePurposeManager,
  SpriteRoutinePresetRegistry,
  SpriteRoutineRunner,
  summarizeSpriteRoutinePreset,
  summarizeSpriteRoutinePresets,
  validateSpritePurposePlannerOutput
} from './purpose';
export type { SpriteReactionState, SpriteState, SpriteSubState, StateConfig, StateTransition } from './state-machine';
export { SpriteStateMachine } from './state-machine';

// ----- Manager (主进程门面) -----
export type { SpriteManagerOptions, SpritePurposeWindowAdapter, SpriteWindow } from './manager';
export { SpriteManager } from './manager';

// ----- WindowController -----
export type { WindowControllerOptions } from './window-controller';
export { WindowController } from './window-controller';

// ----- Config -----
export {
  DEFAULT_ACTIVITY_REWARDS,
  DEFAULT_CONVERSATION_REWARDS,
  DEFAULT_FAVOR_MODIFIERS,
  DEFAULT_MOOD_RULES,
  DEFAULT_XP_SOURCES,
  mergeActivityRewards,
  resolveActivityReward,
  resolveConversationReward,
  resolveDimensionRewards
} from './config/persona-rules';
