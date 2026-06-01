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
  SpriteAnimationPlaylistMode,
  SpriteAnimationPlaylistModeMap,
  SpriteAnimationTrigger,
  SpriteAnimationTriggerMetadata,
  SpriteBuiltinAnimationTrigger,
  SpriteConfig,
  SpriteEffectBridgePayload,
  SpriteEffectBridgeSource,
  SpriteEffectClearPayload,
  SpriteEffectPayload,
  SpriteEffectSurface,
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
  DEFAULT_SPRITE_ANIMATION_PLAYLIST_MODE,
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
  normalizeSpriteAnimationPlaylistMode,
  normalizeSpriteAnimationPlaylistModeMap,
  SPRITE_ANIMATION_PLAYLIST_MODES,
  SPRITE_EFFECT_IPC_CHANNELS,
  SPRITE_EVENT_TYPES,
  SpriteEventGroups
} from './types';

// ----- Modules -----
export { AnimationRegistry } from './animation-registry';
export type { BehaviorCondition, BehaviorContext, BehaviorDefinition, BehaviorPriority, BehaviorRunAttemptResult, BehaviorRunOptions, BehaviorRunSkipReason } from './behavior-engine';
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
export type {
  CharacterGalleryAIEditContext,
  CharacterGalleryAIEditDraft,
  CharacterGalleryAIEditReferenceImage,
  CharacterGalleryAIHints,
  CharacterGalleryAIReferenceGroup,
  CharacterGalleryAIReferenceSetSummary,
  CharacterGalleryImageRef,
  CharacterGalleryIndex,
  CharacterGalleryItem,
  CharacterGalleryItemDraft,
  CharacterGalleryItemKind,
  CharacterGalleryItemOrigin,
  CharacterGalleryItemPatch,
  CharacterGalleryOriginType,
  CharacterGalleryReferenceRole,
  CharacterGallerySemantic,
  CharacterGalleryViewAngle
} from './character-gallery';
export {
  CHARACTER_GALLERY_INDEX_VERSION,
  CHARACTER_GALLERY_ITEM_KINDS,
  CHARACTER_GALLERY_REFERENCE_ROLES,
  CHARACTER_GALLERY_VIEW_ANGLES,
  DEFAULT_CHARACTER_GALLERY_INDEX_PATH,
  getCharacterGalleryImageMimeFromPath,
  isSupportedCharacterGalleryImagePath,
  MAX_CHARACTER_GALLERY_AI_EDIT_REFERENCES,
  normalizeCharacterGalleryAIHints,
  normalizeCharacterGalleryIndex,
  normalizeCharacterGalleryItem,
  normalizeCharacterGalleryItemDraft,
  normalizeCharacterGalleryItemId,
  normalizeCharacterGalleryItemPatch,
  normalizeCharacterGalleryKind,
  normalizeCharacterGallerySemantic
} from './character-gallery';
export { CHARACTER_PACK_ARCHIVE_EXTENSION, CHARACTER_PACK_ARCHIVE_EXTENSION_NAME } from './character-pack-archive';
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
  AchievementUnlockedGuideGoalDefinition,
  ChatApiConfiguredGuideGoalDefinition,
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
  SpriteRoutineGuideGoalDefinition,
  SpriteRoutineGuideGoalKind,
  SpriteRoutineRunResult,
  SpriteRoutineSource,
  SpriteRoutineStatus,
  SpriteRoutineStep,
  SpriteRoutineStepResult,
  StartSpritePurposeRequest,
  WorkspaceExistsGuideGoalDefinition
} from './purpose';
export {
  buildSpritePurposeDailyRetrospective,
  CHAT_API_CONFIGURED_GUIDE_GOAL,
  createAchievementUnlockedGuideGoal,
  createSpritePurposePlannerStepSchema,
  createSpriteRoutineFromPlannerDraft,
  DEFAULT_SPRITE_PURPOSE_PLANNER_EVENTS,
  DEFAULT_SPRITE_PURPOSE_PLANNER_PREFERENCES,
  DEFAULT_SPRITE_PURPOSE_PLANNER_STEP_TYPES,
  DEFAULT_SPRITE_PURPOSE_PLANNER_WINDOWS,
  DEFAULT_SPRITE_ROUTINE_PRESETS,
  FIRST_FILE_DROP_GUIDE_GOAL,
  normalizeSpritePurposePlannerPreferences,
  OPEN_RESOURCE_LIBRARY_GUIDE_GOAL,
  SpritePurposeEventWaiter,
  SpritePurposeHistoryStore,
  SpritePurposeManager,
  SpriteRoutinePresetRegistry,
  SpriteRoutineRunner,
  summarizeSpriteRoutinePreset,
  summarizeSpriteRoutinePresets,
  validateSpritePurposePlannerOutput,
  WORKSPACE_EXISTS_GUIDE_GOAL
} from './purpose';
export type {
  OnboardingPresetDeps,
  OnboardingQuestDefinition,
  OnboardingQuestReward,
  OnboardingQuestRuntimeState,
  OnboardingState,
  QuestCategory,
  QuestEngineDeps,
  QuestPredicate,
  QuestPredicateContext
} from './quest';
export { createEmptyOnboardingState, createWorkspaceCreateQuest, QuestEngine, QuestRegistry } from './quest';
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
