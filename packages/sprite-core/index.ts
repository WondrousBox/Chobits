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
 * - AnimationRegistry: 动画注册表 —— 统一索引与按事件查询
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
  SpriteAnimation,
  SpriteConfig,
  SpriteEventType,
  SpriteInitialState,
  SpriteMessageData,
  SpritePlayCommand,
  SpriteStateSnapshot,
  SpriteWalkState,
  ToastInput,
  ToastMessage
} from './types';
export { DEFAULT_DURATION, MESSAGE_IPC_CHANNELS, MESSAGE_PRIORITY, SPRITE_EVENT_TYPES, SpriteEventGroups } from './types';

// ----- Modules -----
export { AnimationRegistry } from './animation-registry';
export type { BehaviorCondition, BehaviorContext, BehaviorDefinition, BehaviorPriority } from './behavior-engine';
export { BehaviorEngine, createAutoWalkBehavior, createBoredBehavior, createFavorDecayBehavior, createRandomMessageBehavior, createSleepyBehavior } from './behavior-engine';
export type { SpritePersonaEvent, SpritePersonaEventType } from './event-bus';
export { SpriteEventBus } from './event-bus';
export type { InteractionEvent, InteractionStats, InteractionType } from './interaction-tracker';
export { InteractionTracker } from './interaction-tracker';
export type { FavorLevel, LevelConfig, MoodType, PersonaState } from './persona-state';
export { PersonaStateManager } from './persona-state';
export type { SpriteState, SpriteSubState, StateConfig, StateTransition } from './state-machine';
export { SpriteStateMachine } from './state-machine';

// ----- Manager (主进程门面) -----
export type { SpriteManagerOptions, SpriteWindow } from './sprite-manager';
export { SpriteManager } from './sprite-manager';

// ----- WindowController -----
export type { WindowControllerOptions } from './window-controller';
export { WindowController } from './window-controller';
