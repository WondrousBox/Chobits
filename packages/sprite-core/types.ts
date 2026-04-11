/**
 * Sprite-Core Shared Types
 *
 * 共享类型定义，供主进程和渲染进程共同使用。
 * 从 src/components/AIAssistant/types.ts 和 message/types.ts 迁移而来。
 */

import type { PersonaState as PersonaSnapshot } from './persona-state';

// ============================================================================
// 消息分类
// ============================================================================

export type MessageCategory =
  | 'idle'
  | 'hover'
  | 'click'
  | 'focus'
  | 'input'
  | 'scroll'
  | 'press'
  | 'release'
  | 'hold'
  | 'error'
  | 'loading'
  | 'success'
  | 'failure'
  | 'info'
  | 'warning'
  | 'celebrate'
  | 'question'
  | 'answer'
  | 'search'
  | 'navigation'
  | 'selection'
  | 'confirmation'
  | 'cancellation'
  | 'upload'
  | 'download'
  | 'processing'
  | 'waiting'
  | 'timeout'
  | 'retry'
  | 'connect'
  | 'disconnect'
  | 'sync'
  | 'update'
  | 'install'
  | 'remove'
  | 'configure'
  | 'settings'
  | 'profile'
  | 'message'
  | 'alert'
  | 'reminder'
  | 'event'
  | 'task'
  | 'drag'
  | 'drop'
  | 'fileDragOver'
  | 'fileDrop'
  | 'recommend'
  | 'tip'
  | 'system'
  | 'welcome'
  | 'custom';

// ============================================================================
// 精灵事件分组
// ============================================================================

export const SpriteEventGroups = {
  interaction: ['idle', 'hover', 'click', 'focus', 'input', 'scroll', 'drag', 'drop', 'fileDragOver', 'fileDrop', 'selection'],
  feedback: ['success', 'failure', 'error', 'warning', 'info', 'celebrate', 'tip', 'recommend'],
  status: ['loading', 'processing', 'waiting', 'timeout', 'retry'],
  workflow: ['confirmation', 'cancellation', 'task', 'update', 'install', 'remove', 'configure', 'settings'],
  network: ['connect', 'disconnect', 'sync', 'upload', 'download'],
  assist: ['question', 'answer', 'search', 'navigation', 'message', 'alert', 'reminder'],
  system: ['system', 'welcome', 'event', 'profile'],
  emotion: [
    'happy',
    'joy',
    'excited',
    'proud',
    'shy',
    'embarrassed',
    'sad',
    'bored',
    'angry',
    'annoyed',
    'confused',
    'curious',
    'surprised',
    'panic',
    'scared',
    'tired',
    'sleep',
    'wake',
    'thinking',
    'focusMode'
  ],
  action: [
    'walk',
    'run',
    'jump',
    'sit',
    'stand',
    'wave',
    'nod',
    'shakeHead',
    'dance',
    'spin',
    'fall',
    'climb',
    'slide',
    'attack',
    'defend',
    'point',
    'type',
    'read',
    'write',
    'lookLeft',
    'lookRight',
    'lookUp',
    'lookDown'
  ],
  transition: ['appear', 'disappear', 'enter', 'exit', 'fadeIn', 'fadeOut', 'spawn', 'despawn', 'teleport', 'transform', 'powerUp', 'powerDown'],
  connector: [
    'turnLeft',
    'turnRight',
    'turnBack',
    'turnFront',
    'turnAround',
    'standToSit',
    'sitToStand',
    'idleToWalk',
    'walkToIdle',
    'walkToRun',
    'runToWalk',
    'faceLeft',
    'faceRight',
    'faceUp',
    'faceDown',
    'faceCamera',
    'readyStance',
    'windUp',
    'coolDown',
    'recover'
  ],
  ambient: ['breath', 'blink', 'float', 'idle2', 'idle3', 'loadingLoop', 'successLoop', 'errorLoop', 'charging', 'saving'],
  seasonal: ['holiday', 'newYear', 'spring', 'summer', 'autumn', 'winter', 'halloween', 'christmas', 'birthday'],
  special: ['glow', 'pulse', 'sparkle', 'burst', 'flare', 'aura', 'shield', 'trail', 'impact', 'hit']
} as const;

export const SPRITE_EVENT_TYPES = Array.from(new Set(Object.values(SpriteEventGroups).flat())) as ReadonlyArray<string>;

export type SpriteEventType = (typeof SPRITE_EVENT_TYPES)[number] | 'custom';

export type { PersonaSnapshot };

// ============================================================================
// 消息生产
// ============================================================================

export type MessageProducer = (ctx?: any) => string;

export type MessageCatalog = {
  [K in MessageCategory]?: Array<MessageProducer | string> | MessageProducer | string;
};

export interface MessagesProvider {
  t: (category: MessageCategory, ctx?: any) => string;
}

// ============================================================================
// 窗口移动配置
// ============================================================================

/** 动画播放时的窗口移动方向 */
export type SpriteMovementDirection = 'left' | 'right' | 'up' | 'down' | 'up-left' | 'up-right' | 'down-left' | 'down-right' | 'random';

/**
 * 移动模式:
 * - 'direction': 沿固定方向恒速移动，到达屏幕边界停止
 * - 'walkTo': 随机选取屏幕位置，沿贝塞尔曲线路径移动（三段式动画：intro→loop→outro）
 */
export type SpriteMovementMode = 'direction' | 'walkTo';

/**
 * 移动触发方式:
 * - 'animation': 动画播放时自动触发移动
 * - 'behavior': 通过 BehaviorEngine 行为调度触发（支持定时/随机间隔）
 */
export type SpriteMovementTrigger = 'animation' | 'behavior';

/** 精灵动画窗口移动配置 */
export interface SpriteMovementConfig {
  /** 是否启用动画播放时的窗口移动 */
  enabled: boolean;

  /**
   * 移动模式，默认 'direction'
   * - 'direction': 沿固定方向恒速移动（需配置 direction）
   * - 'walkTo': 随机选取屏幕位置行走（方向由目标推导，需动画具备 loopStartMs/loopEndMs 循环片段）
   */
  mode?: SpriteMovementMode;

  /** 移动方向（mode='direction' 时使用） */
  direction?: SpriteMovementDirection;

  /** 移动速度（像素/秒），默认 60 */
  speed?: number;

  /**
   * 移动触发方式，默认 'animation'
   * - 'animation': 动画播放时自动启动移动
   * - 'behavior': 由 BehaviorEngine 调度触发（配合 behaviorSchedule 使用）
   */
  trigger?: SpriteMovementTrigger;

  /**
   * 行为调度配置（trigger='behavior' 时生效）
   * 控制自动行走的定时触发参数
   */
  behaviorSchedule?: {
    /** 调度类型: 'random' 随机间隔 | 'interval' 固定间隔 */
    type: 'random' | 'interval';
    /** 固定间隔（ms），type='interval' 时使用，默认 15000 */
    intervalMs?: number;
    /** 随机间隔最小值（ms），type='random' 时使用，默认 10000 */
    minMs?: number;
    /** 随机间隔最大值（ms），type='random' 时使用，默认 25000 */
    maxMs?: number;
    /** 触发概率 (0-1)，默认 0.8 */
    probability?: number;
    /** 最小空闲时间（ms），需要空闲超过此时间才允许触发，默认 5000 */
    minIdleMs?: number;
  };

  /**
   * walkTo 模式的竖直范围限制（占屏幕高度比例 0-1），默认 0.1
   * 限制目标位置与当前位置的 Y 轴偏差，避免角度过大
   */
  verticalRange?: number;
}

// ============================================================================
// 精灵动画定义
// ============================================================================

export interface SpriteAnimation {
  width?: number;
  height?: number;
  padding?: number;
  autoplay?: boolean;
  muted?: boolean;
  playsInline?: boolean;
  loop?: boolean;
  autoIdle?: boolean;
  durationMs?: number;
  loopStartMs?: number;
  loopEndMs?: number;
  /** 动画播放时的窗口移动配置 */
  movement?: SpriteMovementConfig;
  meta: {
    id: string;
    title: string;
    description?: string;
    tags?: string[];
    coverSrc?: string;
    eventType?: SpriteEventType;
    deletable?: boolean;
  };
  source: {
    src?: string;
    localPath?: string;
    type?: string;
  };
}

// ============================================================================
// 消息系统类型（从 message/types.ts 迁移）
// ============================================================================

export type MessageType = 'busy' | 'notice' | 'toast';
export type MessageLevel = 'info' | 'success' | 'warning' | 'error';

export const MESSAGE_PRIORITY: Record<MessageType, number> = {
  busy: 3,
  notice: 2,
  toast: 1
};

export interface MessageButton {
  id: string;
  label: string;
  action?: string;
  variant?: 'default' | 'secondary' | 'outline' | 'ghost';
}

interface BaseMessage {
  id: string;
  type: MessageType;
  level?: MessageLevel;
  createdAt: number;
}

export interface ToastMessage extends BaseMessage {
  type: 'toast';
  content?: string;
  category?: MessageCategory;
  ctx?: any;
  duration?: number;
}

export interface NoticeMessage extends BaseMessage {
  type: 'notice';
  content: string;
  buttons?: MessageButton[];
  duration?: number;
  persistent?: boolean;
  routineId?: string;
}

export interface BusyMessage extends BaseMessage {
  type: 'busy';
  content?: string;
  progress?: number;
}

/** 统一消息联合类型（避免与 SpriteMessage 组件同名） */
export type SpriteMessageData = ToastMessage | NoticeMessage | BusyMessage;

export type ToastInput = Omit<ToastMessage, 'id' | 'type' | 'createdAt'> & { id?: string };
export type NoticeInput = Omit<NoticeMessage, 'id' | 'type' | 'createdAt'> & { id?: string };
export type BusyInput = Omit<BusyMessage, 'id' | 'type' | 'createdAt'> & { id?: string };

export interface MessageIPCPayload {
  type: MessageType;
  id?: string;
  content?: string;
  level?: MessageLevel;
  progress?: number;
  buttons?: MessageButton[];
  duration?: number;
  persistent?: boolean;
  routineId?: string;
  category?: MessageCategory;
  ctx?: any;
}

export type MessageBridgeSource = 'app' | 'sprite';

export interface MessageBridgeClearPayload {
  id?: string;
  type?: MessageType | 'all';
}

export type MessageBridgePayload =
  | {
    kind: 'show';
    payload: MessageIPCPayload;
    source: MessageBridgeSource;
  }
  | {
    kind: 'clear';
    payload: MessageBridgeClearPayload;
    source: MessageBridgeSource;
  };

export const MESSAGE_IPC_CHANNELS = {
  BRIDGE: 'app:message:bridge',
  MESSAGE: 'app:message',
  MESSAGE_CLEAR: 'app:message:clear',
  LEGACY_NOTICE: 'app:notice',
  LEGACY_BUSY_START: 'app:busy:start',
  LEGACY_BUSY_END: 'app:busy:end',
  LEGACY_BUSY_PROGRESS: 'app:busy:progress'
} as const;

export interface MessageQueueState {
  current: SpriteMessageData | null;
  queue: SpriteMessageData[];
}

export interface MessageContextValue {
  current: SpriteMessageData | null;
  showToast: (input: ToastInput) => string;
  showNotice: (input: NoticeInput) => string;
  showBusy: (input: BusyInput) => string;
  updateBusy: (progress: number, content?: string) => void;
  clearBusy: () => void;
  dismiss: (id?: string) => void;
  clearAll: () => void;
  handleButtonClick: (button: MessageButton) => void;
}

export const DEFAULT_DURATION: Record<MessageType, number> = {
  toast: 5000,
  notice: 4000,
  busy: 0
};

// ============================================================================
// SpriteManager 相关类型（供 IPC 通信使用）
// ============================================================================

/** 精灵状态下行快照 */
export interface SpriteStateSnapshot {
  state: string;
  subState: string | null;
  personaSnapshot?: PersonaSnapshot;
}

/** 精灵播放指令 */
export interface SpritePlayCommand {
  animationId: string;
  source?: { src?: string; localPath?: string; type?: string };
  playback?: {
    width?: number;
    height?: number;
    padding?: number;
    loop?: boolean;
    loopStartMs?: number;
    loopEndMs?: number;
    durationMs?: number;
    autoIdle?: boolean;
    /** 动画播放时的窗口移动配置 */
    movement?: SpriteMovementConfig;
  };
}

/** 精灵初始全量状态 */
export interface SpriteInitialState {
  state: string;
  subState: string | null;
  personaState: PersonaSnapshot | null;
  animations: SpriteAnimation[];
  currentAnimation: SpritePlayCommand | null;
  config: SpriteConfig;
}

/** 获取人格状态响应 */
export interface SpritePersonaStateResult {
  ok: true;
  state: PersonaSnapshot;
}

/** 精灵行走状态 */
export interface SpriteWalkState {
  active: boolean;
  direction?: 'left' | 'right';
}

/** 精灵配置 */
export interface SpriteConfig {
  width: number;
  height: number;
  padding: number;
  /** 是否显示调试辅助线 */
  showDebugOverlay?: boolean;
}
