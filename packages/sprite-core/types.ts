/**
 * Sprite-Core Shared Types
 *
 * 共享类型定义，供主进程和渲染进程共同使用。
 * 早期从旧 assistant 组件目录与 message/types.ts 迁移而来。
 */

import type { BusyInput, MessageButton, MessageCategory, NoticeInput, SpriteMessageData, ToastInput } from '@packages/event/messages';

import { normalizeSpriteAnimationCondition, type SpriteAnimationCondition } from './animation-condition';
import type { CharacterState as CharacterSnapshot } from './character-state';

// 消息系统基元已物理迁移到 @packages/event/messages，这里保持同名 re-export 以兼容既有消费方
export type {
  SpriteAnimationCompareCondition,
  SpriteAnimationCondition,
  SpriteAnimationConditionGroup,
  SpriteAnimationConditionOperator,
  SpriteAnimationConditionScalar,
  SpriteAnimationConditionValue,
  SpriteAnimationNotCondition
} from './animation-condition';
export { compileSpriteAnimationCondition, matchesSpriteAnimationCondition, normalizeSpriteAnimationCondition } from './animation-condition';
export type {
  BusyInput,
  BusyMessage,
  MessageBridgeClearPayload,
  MessageBridgePayload,
  MessageBridgeSource,
  MessageBridgeTarget,
  MessageButton,
  MessageCategory,
  MessageIPCPayload,
  MessageLevel,
  MessageType,
  NoticeInput,
  NoticeMessage,
  SpriteConfirmNoticeRequest,
  SpriteConfirmNoticeResult,
  SpriteMessageData,
  ToastInput,
  ToastMessage
} from '@packages/event/messages';
export { DEFAULT_DURATION, MESSAGE_IPC_CHANNELS, MESSAGE_PRIORITY } from '@packages/event/messages';

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
    'talk',
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
const SPRITE_EVENT_TYPE_SET = new Set<string>(SPRITE_EVENT_TYPES);

export type SpriteEventType = (typeof SPRITE_EVENT_TYPES)[number] | 'custom';
export type SpriteBuiltinAnimationTrigger = SpriteEventType;
export type SpriteAnimationTrigger = SpriteBuiltinAnimationTrigger | (string & {});
export const SPRITE_ANIMATION_PLAYLIST_MODES = ['list-loop', 'list-once'] as const;
export type SpriteAnimationPlaylistMode = (typeof SPRITE_ANIMATION_PLAYLIST_MODES)[number];
export type SpriteAnimationPlaylistModeMap = Record<string, SpriteAnimationPlaylistMode>;
export const DEFAULT_SPRITE_ANIMATION_PLAYLIST_MODE: SpriteAnimationPlaylistMode = 'list-loop';
const SPRITE_ANIMATION_PLAYLIST_MODE_SET = new Set<string>(SPRITE_ANIMATION_PLAYLIST_MODES);

export function isBuiltinSpriteAnimationTrigger(value: string): value is SpriteBuiltinAnimationTrigger {
  return SPRITE_EVENT_TYPE_SET.has(value);
}

export function isCustomSpriteAnimationTrigger(value: string): value is SpriteAnimationTrigger {
  return value.length > 0 && !isBuiltinSpriteAnimationTrigger(value);
}

export function normalizeSpriteAnimationPlaylistMode(value?: string | null): SpriteAnimationPlaylistMode {
  return value && SPRITE_ANIMATION_PLAYLIST_MODE_SET.has(value) ? (value as SpriteAnimationPlaylistMode) : DEFAULT_SPRITE_ANIMATION_PLAYLIST_MODE;
}

export function normalizeSpriteAnimationPlaylistModeMap(value?: Record<string, unknown> | null): SpriteAnimationPlaylistModeMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce<SpriteAnimationPlaylistModeMap>((acc, [trigger, mode]) => {
    const normalizedTrigger = trigger.trim();
    if (!normalizedTrigger) return acc;
    acc[normalizedTrigger] = normalizeSpriteAnimationPlaylistMode(typeof mode === 'string' ? mode : undefined);
    return acc;
  }, {});
}

function normalizeSpriteAnimationTriggerValue(value?: string | null): SpriteAnimationTrigger | undefined {
  const normalized = value?.trim() ?? '';
  return normalized ? (normalized as SpriteAnimationTrigger) : undefined;
}

function dedupeSpriteAnimationTriggers(values: Array<string | null | undefined>): SpriteAnimationTrigger[] {
  const normalized = values.map((value) => normalizeSpriteAnimationTriggerValue(value)).filter((value): value is SpriteAnimationTrigger => !!value);
  return Array.from(new Set(normalized));
}

export interface SpriteTriggerOptions {
  message?: string;
  duration?: number;
  durationMs?: number;
  ctx?: any;
  silent?: boolean;
  playId?: string;
  allowPlaylistWithPlayId?: boolean;
  /** When false, auto/animation movement is suspended until this playback session ends. */
  allowMovementDuringPlayback?: boolean;
  ownerPurposeId?: string;
  priority?: number;
  ignorePresentationLock?: boolean;
}

export interface SpriteListByTriggerRequest {
  trigger?: SpriteAnimationTrigger;
}

export interface SpriteTriggerRequest extends SpriteTriggerOptions {
  trigger?: SpriteAnimationTrigger;
}

export type SpriteFeedbackKind = 'quest-record' | 'purpose-link' | 'memory-record' | (string & {});

export interface SpriteFeedbackRequest {
  trigger?: SpriteAnimationTrigger;
  kind?: SpriteFeedbackKind;
  silent?: boolean;
  durationMs?: number;
  message?: string;
  ctx?: Record<string, unknown>;
}

export type SpriteFeedbackResult =
  | { ok: true; played: true; ownerPurposeId?: string }
  | { ok: true; played: false; reason: 'missing-animation' | 'blocked-by-lock' | 'no-renderer' }
  | { ok: false; played: false; reason: 'invalid-request'; error: string };

export type { CharacterSnapshot };
export type {
  SpriteCapabilityBranch,
  SpriteCapabilityDefinition,
  SpriteCapabilityResolutionContext,
  SpriteCapabilityShortcut,
  SpriteCapabilitySignalMode,
  SpriteCapabilitySnapshot,
  SpriteCapabilityState,
  SpriteCapabilityStatus,
  SpriteCapabilityTier,
  SpriteCapabilityTotals
} from './capability-registry';

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
 * - 'windowAnimation': 播放主窗口动画预设，不改变精灵窗口行走状态
 */
export type SpriteMovementMode = 'direction' | 'walkTo' | 'windowAnimation';

export type SpriteWindowAnimationPresetId = 'fly-in' | 'fade-in' | 'zoom-in' | 'fly-out' | 'fade-out' | 'zoom-out' | 'pulse' | 'shake';

export type SpriteWindowAnimationDirection = 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type SpriteWindowAnimationAnchor = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right';

export type SpriteWindowAnimationDisplay = 'primary' | 'current' | 'main';

export type SpriteWindowAnimationCoordinateSpaceType = 'absolute' | 'design-area';

export type SpriteWindowAnimationCoordinateFitMode = 'contain' | 'cover' | 'stretch';

export type SpriteWindowAnimationSizeMode = 'absolute' | 'scale-with-area';

export type SpriteWindowAnimationMargin =
  | number
  | {
      x?: number;
      y?: number;
      top?: number;
      right?: number;
      bottom?: number;
      left?: number;
    };

export interface SpriteWindowAnimationPoint {
  x: number;
  y: number;
}

export interface SpriteWindowAnimationCoordinateSpace {
  type?: SpriteWindowAnimationCoordinateSpaceType;
  designArea?: {
    width: number;
    height: number;
  };
  display?: SpriteWindowAnimationDisplay;
  useWorkArea?: boolean;
  fitMode?: SpriteWindowAnimationCoordinateFitMode;
  sizeMode?: SpriteWindowAnimationSizeMode;
}

export interface SpriteWindowAnimationPlacement {
  anchor: SpriteWindowAnimationAnchor;
  display?: SpriteWindowAnimationDisplay;
  useWorkArea?: boolean;
  margin?: SpriteWindowAnimationMargin;
  offset?: Partial<SpriteWindowAnimationPoint>;
}

export interface SpriteWindowAnimationPlayPosition {
  /** placement 使用语义位置，point 使用设计区/绝对坐标锚点 */
  mode: 'placement' | 'point';
  placement?: SpriteWindowAnimationPlacement;
  point?: SpriteWindowAnimationPoint;
  positionAnchor?: SpriteWindowAnimationAnchor;
  coordinateSpace?: SpriteWindowAnimationCoordinateSpace;
}

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
   * - 'walkTo': 随机选取屏幕位置行走（方向由目标推导，可配合单段循环或三段式动画）
   * - 'windowAnimation': 播放窗口动画预设（由主进程适配器执行）
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

  /** windowAnimation 模式的窗口动画预设 ID，默认 fly-in */
  windowAnimationPresetId?: SpriteWindowAnimationPresetId;

  /** windowAnimation 模式的方向参数，仅对飞入、飞出、抖动等方向型预设生效 */
  windowAnimationDirection?: SpriteWindowAnimationDirection;

  /** windowAnimation 模式的动画时长（ms），默认由预设工厂决定 */
  windowAnimationDuration?: number;

  /** windowAnimation 模式的目标窗口，当前 UI 默认 main */
  windowAnimationTarget?: string;

  /** windowAnimation 模式下播放前先放置到的位置；未设置时保持当前位置 */
  windowAnimationPlayPosition?: SpriteWindowAnimationPlayPosition;
}

/** movement preview 请求体 */
export interface SpriteMovementPreviewConfig {
  width: number;
  height: number;
  padding: number;
  movement: SpriteMovementConfig;
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
  loopCount?: number;
  autoIdle?: boolean;
  durationMs?: number;
  loopStartMs?: number;
  loopEndMs?: number;
  /** 动画播放时的窗口移动配置 */
  movement?: SpriteMovementConfig;
  meta: SpriteAnimationMeta;
  source: {
    src?: string;
    localPath?: string;
    type?: string;
  };
}

export interface SpriteAnimationMeta {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  coverSrc?: string;
  /** 新结构的主触发器，作为单一真源 */
  primaryTrigger?: SpriteAnimationTrigger;
  /** 额外触发别名，同一动画可被多个业务 trigger 命中 */
  triggerAliases?: SpriteAnimationTrigger[];
  /** 同 trigger 多动画命中时的排序权重 */
  priority?: number;
  /** 持久化的角色状态条件规则，运行时会编译成 registry condition */
  condition?: SpriteAnimationCondition;
  deletable?: boolean;
}

export type SpriteAnimationMetaInput = Partial<SpriteAnimationMeta> & {
  /** @deprecated 兼容旧资源结构输入，normalize 后会折叠到 primaryTrigger / triggerAliases */
  eventType?: SpriteAnimationTrigger;
};

export type SpriteAnimationTriggerMetadata = Pick<SpriteAnimationMetaInput, 'eventType' | 'primaryTrigger' | 'triggerAliases'>;

export function getPrimarySpriteAnimationTrigger(meta?: SpriteAnimationTriggerMetadata | null): SpriteAnimationTrigger | undefined {
  return normalizeSpriteAnimationTriggerValue(meta?.primaryTrigger) ?? normalizeSpriteAnimationTriggerValue(meta?.eventType);
}

export function getSpriteAnimationTriggerAliases(meta?: SpriteAnimationTriggerMetadata | null): SpriteAnimationTrigger[] {
  const primaryTrigger = getPrimarySpriteAnimationTrigger(meta);
  const legacyTrigger = normalizeSpriteAnimationTriggerValue(meta?.eventType);
  return dedupeSpriteAnimationTriggers([...(meta?.triggerAliases ?? []), legacyTrigger && primaryTrigger && legacyTrigger !== primaryTrigger ? legacyTrigger : undefined]).filter(
    (trigger) => trigger !== primaryTrigger
  );
}

export function getSpriteAnimationTriggers(meta?: SpriteAnimationTriggerMetadata | null): SpriteAnimationTrigger[] {
  return dedupeSpriteAnimationTriggers([getPrimarySpriteAnimationTrigger(meta), ...getSpriteAnimationTriggerAliases(meta)]);
}

export function hasSpriteAnimationTrigger(meta: SpriteAnimationTriggerMetadata | null | undefined, trigger: string): boolean {
  const normalizedTrigger = normalizeSpriteAnimationTriggerValue(trigger);
  return !!normalizedTrigger && getSpriteAnimationTriggers(meta).includes(normalizedTrigger);
}

export function normalizeSpriteAnimationMeta<T extends Pick<SpriteAnimationMeta, 'id' | 'title'> & SpriteAnimationMetaInput>(meta: T): Omit<T, 'eventType'> & SpriteAnimationMeta {
  const primaryTrigger = getPrimarySpriteAnimationTrigger(meta);
  const triggerAliases = getSpriteAnimationTriggerAliases(meta);
  const priority = typeof meta.priority === 'number' && Number.isFinite(meta.priority) ? meta.priority : undefined;
  const condition = normalizeSpriteAnimationCondition(meta.condition);
  const rest = { ...meta };
  delete (rest as Partial<SpriteAnimationMetaInput>).eventType;

  return {
    ...rest,
    primaryTrigger,
    triggerAliases: triggerAliases.length > 0 ? triggerAliases : undefined,
    priority,
    condition
  } as Omit<T, 'eventType'> & SpriteAnimationMeta;
}

export function normalizeSpriteAnimationMetaPatch<T extends SpriteAnimationMetaInput>(meta: T): Omit<T, 'eventType'> & Partial<SpriteAnimationMeta> {
  if (!Object.prototype.hasOwnProperty.call(meta, 'eventType')) {
    return meta as Omit<T, 'eventType'> & Partial<SpriteAnimationMeta>;
  }

  const rest = { ...meta };
  delete (rest as Partial<SpriteAnimationMetaInput>).eventType;
  const primaryTrigger = getPrimarySpriteAnimationTrigger(meta);
  const triggerAliases = getSpriteAnimationTriggerAliases(meta);

  return {
    ...rest,
    primaryTrigger,
    ...(Object.prototype.hasOwnProperty.call(rest, 'triggerAliases') || triggerAliases.length > 0
      ? {
          triggerAliases: triggerAliases.length > 0 ? triggerAliases : undefined
        }
      : {})
  } as Omit<T, 'eventType'> & Partial<SpriteAnimationMeta>;
}

// ============================================================================
// 特效桥接类型
// ============================================================================

export interface SpriteEffectSurface {
  width?: number;
  height?: number;
}

export interface SpriteEffectPayload {
  id?: string;
  type: string;
  variant?: string;
  amount?: number;
  title?: string;
  content?: string;
  duration?: number;
  surface?: SpriteEffectSurface;
  data?: Record<string, unknown>;
}

export interface SpriteEffectClearPayload {
  id?: string;
  type?: string | 'all';
}

export type SpriteEffectBridgeSource = 'app' | 'sprite';

export type SpriteEffectBridgePayload =
  | {
      kind: 'show';
      payload: SpriteEffectPayload;
      source: SpriteEffectBridgeSource;
    }
  | {
      kind: 'clear';
      payload: SpriteEffectClearPayload;
      source: SpriteEffectBridgeSource;
    };

export const SPRITE_EFFECT_IPC_CHANNELS = {
  BRIDGE: 'sprite:effect:bridge',
  SHOW: 'sprite:effect:show',
  CLEAR: 'sprite:effect:clear'
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

// ============================================================================
// SpriteManager 相关类型（供 IPC 通信使用）
// ============================================================================

/** 精灵状态下行快照 */
export interface SpriteStateSnapshot {
  state: string;
  subState: string | null;
  characterState?: CharacterSnapshot;
}

/** 精灵播放指令 */
export interface SpritePlayCommand {
  playId?: string;
  animationId: string;
  trigger?: SpriteAnimationTrigger;
  sessionMode?: 'state-bound' | 'trigger';
  source?: { src?: string; localPath?: string; type?: string };
  playbackSession?: {
    mode: 'timed';
    startedAtMs: number;
    activeDurationMs: number;
  };
  playback?: {
    width?: number;
    height?: number;
    padding?: number;
    loop?: boolean;
    loopCount?: number;
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
  characterState: CharacterSnapshot | null;
  animations: SpriteAnimation[];
  currentAnimation: SpritePlayCommand | null;
  config: SpriteConfig;
}

/** 获取角色状态响应 */
export interface SpriteCharacterStateResult {
  ok: true;
  characterState: CharacterSnapshot;
}

/** 精灵行走状态 */
export interface SpriteWalkState {
  active: boolean;
  direction?: 'left' | 'right';
}

/**
 * 气泡展示模式
 * - 'inline': 传统模式，气泡渲染在主精灵窗口内（沿用 padding 撑出的空白区域）
 * - 'fixed-top': 顶部悬浮模式，使用独立窗口固定在主窗口上方并跟随主窗口移动，主窗口 padding 在运行期视为 0
 */
export type SpriteBubbleMode = 'inline' | 'fixed-top';

/** 默认气泡展示模式 */
export const DEFAULT_SPRITE_BUBBLE_MODE: SpriteBubbleMode = 'fixed-top';

export function normalizeSpriteBubbleMode(value: unknown): SpriteBubbleMode {
  return value === 'fixed-top' || value === 'inline' ? value : DEFAULT_SPRITE_BUBBLE_MODE;
}

export function isBubbleWindowMode(mode?: SpriteBubbleMode | null): boolean {
  return mode === 'fixed-top';
}

/** 精灵配置 */
export interface SpriteConfig {
  width: number;
  height: number;
  padding: number;
  /** 同 trigger 多动画时的默认播放列表模式 */
  animationPlaylistMode?: SpriteAnimationPlaylistMode;
  /** 按 trigger/动画类型分别设置的播放列表模式 */
  animationPlaylistModes?: SpriteAnimationPlaylistModeMap;
  /** 是否显示调试辅助线 */
  showDebugOverlay?: boolean;
  /** 气泡展示模式（默认 'fixed-top'） */
  bubbleMode?: SpriteBubbleMode;
}
