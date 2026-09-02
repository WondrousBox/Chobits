/**
 * SpriteManager 模块
 *
 * 将 SpriteManager 门面类及其内部依赖拆分为独立文件：
 * - types.ts          — 平台抽象接口、初始化选项、持久化行类型
 * - persistence.ts    — CharacterStatePersistence
 * - state-mapping.ts  — 状态→事件类型映射函数
 * - default-behaviors.ts — 默认行为注册
 * - sprite-manager.ts — SpriteManager 主类
 */

export type {
  SpritePurpose,
  SpritePurposeDailyRetrospective,
  SpritePurposeHistoryEntry,
  SpritePurposeHistoryQuery,
  SpritePurposeHistoryReader,
  SpritePurposeHistoryWriter,
  SpritePurposeRetrospectiveItem,
  SpritePurposeRetrospectiveQuery,
  SpritePurposeRoutinePlanner,
  SpritePurposeRoutinePlannerContext,
  SpritePurposeRuntimeEvent,
  SpritePurposeRuntimeEventInput,
  SpritePurposeRuntimeEventSource,
  SpritePurposeSnapshot,
  SpritePurposeStartResult,
  SpriteRoutine,
  SpriteRoutineStep,
  SpriteRoutineStepResult,
  StartSpritePurposeRequest
} from '../purpose';
export { registerDefaultBehaviors } from './default-behaviors';
export { MovementCoordinator } from './movement-coordinator';
export { CharacterStatePersistence } from './persistence';
export { SpriteManager } from './sprite-manager';
export { mapStateToEventType } from './state-mapping';
export type {
  CharacterStatePersistenceRow,
  SpriteBehaviorScheduler,
  SpriteManagerOptions,
  SpriteProactiveSpeechGate,
  SpritePurposeWindowAdapter,
  SpriteSchedulerGateContext,
  SpriteSchedulerGateResult,
  SpriteSchedulerJobDefinition,
  SpriteSchedulerJobHandlerResult,
  SpriteSchedulerRunContext,
  SpriteSchedulerRuntimeJob,
  SpriteSchedulerRunTrigger,
  SpriteSchedulerScheduleSpec,
  SpriteSpontaneousUtteranceActionSource,
  SpriteSpontaneousUtteranceExecutionReport,
  SpriteSpontaneousUtteranceExecutor,
  SpriteSpontaneousUtteranceHistoryItem,
  SpriteSpontaneousUtteranceHistoryQuery,
  SpriteSpontaneousUtteranceHistoryStatus,
  SpriteSpontaneousUtteranceIntentCategory,
  SpriteSpontaneousUtterancePreferences,
  SpriteSpontaneousUtteranceRequest,
  SpriteSpontaneousUtteranceResult,
  SpriteSpontaneousUtteranceTonePreference,
  SpriteWindow,
  SpriteWindowAnimationAdapter
} from './types';
