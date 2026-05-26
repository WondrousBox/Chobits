import type { SpriteAnimationTrigger } from '../types';

export type SpritePurposeSource = 'behavior' | 'user-event' | 'system-event' | 'app-event' | 'ai' | 'manual';

export type SpritePurposeStatus = 'queued' | 'active' | 'paused' | 'completed' | 'cancelled' | 'superseded' | 'failed' | 'rejected';

export type SpritePurposeInterruptPolicy = 'never' | 'cooperative' | 'interruptible' | 'urgent';

export type SpriteRoutineSource = 'preset' | 'ai' | 'system' | 'user';

export type SpriteRoutineStatus = 'queued' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';

export type SpritePurposeRuntimeEventSource = 'sprite-event-bus' | 'app-event' | 'purpose-event';

export interface SpritePurposeRuntimeEvent {
  source: SpritePurposeRuntimeEventSource;
  event: string;
  payload?: Record<string, unknown>;
  timestamp: number;
  purposeId?: string;
  routineId?: string;
  correlationId?: string;
}

export type SpritePurposeRuntimeEventInput = Omit<SpritePurposeRuntimeEvent, 'timestamp' | 'source'> & {
  source?: SpritePurposeRuntimeEventSource;
  timestamp?: number;
};

export interface StartSpritePurposeRequest {
  kind: string;
  reason: string;
  source: SpritePurposeSource;
  title?: string;
  priority?: number;
  interruptPolicy?: SpritePurposeInterruptPolicy;
  presetId?: string;
  context?: Record<string, unknown>;
  correlationId?: string;
  coalesceKey?: string;
  /** Fixed routines such as onboarding quests can force preset execution and bypass the AI routine planner. */
  plannerMode?: 'auto' | 'preset-only';
}

export interface SpritePurpose {
  id: string;
  kind: string;
  title: string;
  reason: string;
  source: SpritePurposeSource;
  status: SpritePurposeStatus;
  priority: number;
  interruptPolicy: SpritePurposeInterruptPolicy;
  presetId?: string;
  correlationId?: string;
  coalesceKey?: string;
  startedAt?: number;
  endedAt?: number;
  parentPurposeId?: string;
  supersededBy?: string;
  context?: Record<string, unknown>;
  expectedOutcome?: string;
  plannerMode?: 'auto' | 'preset-only';
}

export type SpriteRoutineStepType =
  | /** 播放已注册动画，可按 trigger 或 animationId 选择。 */ 'playAnimation'
  | /** 移动桌面精灵窗口到语义位置、坐标，或业务窗口旁边。 */ 'walkTo'
  | /** 纯等待一段时间，用于控制节奏或给用户阅读/操作留时间。 */ 'wait'
  | /** 等待 runtime event，例如用户选择、窗口结果、导入进度或业务完成事件。 */ 'waitForEvent'
  | /** 让角色说一句话：展示气泡，并由 SpriteManager.speak 走 TTS。 */ 'speak'
  | /** 展示轻量 toast 气泡，适合短提示、成功/失败提示。 */ 'showToast'
  | /** 展示 notice 气泡，支持常驻、按钮和显式清理。 */ 'showNotice'
  | /** 清理消息队列里的 toast、notice、busy 或全部消息。 */ 'clearMessage'
  | /** 展示 busy/progress 状态，适合后台任务、导入、工作流等待。 */ 'showBusy'
  | /** 更新当前 busy/progress 状态，可从 runner variables 读取进度和文案。 */ 'updateBusy'
  | /** 清理 busy/progress 状态。 */ 'clearBusy'
  | /** 打开或聚焦一个由 purposeWindowAdapter 支持的窗口。 */ 'openWindow'
  | /** 循环执行 body，直到等到目标事件或达到 maxDurationMs。 */ 'loopUntil'
  | /** 根据 runner variables 中的值选择一组子步骤执行。 */ 'branch';

type BaseRoutineStep<TType extends SpriteRoutineStepType> = {
  /** Step 内唯一标识，用于日志、cursor、错误定位和派生等待 step id。 */
  id: string;
  /** Step 类型，用于 runner 分发执行逻辑；可用值见 `SpriteRoutineStepType`。 */
  type: TType;
  /** 设为 false 时，该 step 会被 PurposeManager 视作关键区，协作式打断会延后。 */
  interruptible?: boolean;
};

/** 播放一个已注册动画，可按 trigger 或 animationId 选择。 */
type PlayAnimationStep = BaseRoutineStep<'playAnimation'> & {
  /** 动画触发名，交给 AnimationRegistry 匹配具体资源。 */
  trigger?: SpriteAnimationTrigger;
  /** 精确指定动画资源 id；存在时优先于 trigger。 */
  animationId?: string;
  /** 播放或等待的时长。`waitFor: 'duration'` 时作为等待时长，也会传给 timed playback。 */
  durationMs?: number;
  /** 等待策略：等播放器完成、等固定时长，或 fire-and-forget。默认会按 duration/timeout 等一小段时间。 */
  waitFor?: 'complete' | 'duration' | 'none';
  /** 是否禁止动画触发时自动带出角色文案；routine 动画通常默认静默。 */
  silent?: boolean;
  /** 等待动画完成的最大时间，避免播放器事件丢失时卡住 routine。 */
  timeoutMs?: number;
};

/** 移动桌面精灵窗口到某个语义位置、坐标，或某个业务窗口旁边。 */
type WalkToStep = BaseRoutineStep<'walkTo'> & {
  /**
   * 移动目标：
   * - `center` / `corner`：屏幕语义位置；
   * - `previous`：保持当前位置；
   * - `{ x, y }`：绝对窗口坐标；
   * - `{ window, placement, offset }`：贴近某个 purpose window，比如 workspaceWizard 右侧。
   */
  target:
  | 'center'
  | 'corner'
  | 'previous'
  | { x: number; y: number }
  | {
    window: string;
    placement?: 'left' | 'right' | 'top' | 'bottom' | 'center';
    offset?: number;
  };
  /** 移动速度，传给 MovementCoordinator。 */
  speed?: number;
  /** 移动最大耗时；超时会 stopWalk 并让 step 失败。 */
  timeoutMs?: number;
};

/** 纯等待，不产生 UI 或动画效果，常用于给用户阅读/操作留节奏。 */
type WaitStep = BaseRoutineStep<'wait'> & {
  /** 等待时长。 */
  durationMs: number;
  /** 可选：等待时也监听一个事件，收到后立即结束等待。 */
  interruptEvent?: string;
  /** 事件来源；不填时按 `purpose-event` 等待。 */
  interruptSource?: SpritePurposeRuntimeEventSource;
  /** 事件匹配条件。 */
  interruptMatch?: Record<string, unknown>;
  /** true 时不消费 waiter 的历史事件，只等待本 step 开始之后的新事件。 */
  interruptIgnoreHistory?: boolean;
};

/** 等待 runtime event，常用于等待用户选择、窗口结果、导入进度或业务完成事件。 */
type WaitForEventStep = BaseRoutineStep<'waitForEvent'> & {
  /** 要等待的事件名，例如 `fileAction:resolved`、`WORKSPACE_CREATED`。 */
  event: string;
  /** 事件来源；默认由 waiter 使用 `purpose-event`。 */
  source?: SpritePurposeRuntimeEventSource;
  /** 最大等待时间；超时默认让 step 失败，`optional: true` 时会转为 skipped。 */
  timeoutMs?: number;
  /** 事件匹配条件。key 可匹配事件顶层字段，也可用点路径读取 payload。 */
  match?: Record<string, unknown>;
  /** 将事件结果写入 runner 变量，后续可通过 `branch.by` 或 `*From` 读取。 */
  assignTo?: string;
  /** true 时，超时不会中断 routine，而是写入/返回一个 timeout skip 结果。 */
  optional?: boolean;
  /** true 时不消费 waiter 的历史事件，只等待本 step 开始之后的新事件。 */
  ignoreHistory?: boolean;
};

/** 让角色说一句话：展示气泡，并由 SpriteManager.speak 走 TTS。 */
type SpeakStep = BaseRoutineStep<'speak'> & {
  /** 要说的文本，通常来自 character routine text catalog。 */
  text: string;
  /** 气泡展示时长。 */
  bubbleDuration?: number;
  /** 预留的执行超时字段；当前 speak deps 主要依赖 signal 取消。 */
  timeoutMs?: number;
  /** 冷却时间；同一个 runner context 中，冷却未到会跳过该 step。 */
  cooldownMs?: number;
  /** 冷却键；不填时默认用 `speak:<step.id>`。 */
  cooldownKey?: string;
  /** 可选：在普通对话气泡上显示一个下一句按钮。 */
  nextAction?: {
    /** 按钮 id，会作为 payload.actionId 回到 purpose event。 */
    id: string;
    /** 无障碍/tooltip 文本。 */
    label?: string;
    /** 点击后触发 purpose-event 的 action 标识。 */
    purposeAction: string;
  };
};

/** 展示轻量 toast 气泡，适合短提示、成功/失败提示。 */
type ShowToastStep = BaseRoutineStep<'showToast'> & {
  /** 直接展示的内容；也可配合 category 走角色文案分类。 */
  content?: string;
  /** 消息分类，用于 UI 样式、默认文案或静默类别判断。 */
  category?: string;
  /** 展示时长。 */
  duration?: number;
};

/** 展示 notice 气泡，支持常驻、按钮和显式清理，适合 onboarding / daily care。 */
type ShowNoticeStep = BaseRoutineStep<'showNotice'> & {
  /** 消息 id；后续 `clearMessage.messageId` 可按它精确清理。 */
  messageId?: string;
  /** notice 内容。 */
  content: string;
  /** notice 级别，影响视觉样式。 */
  level?: 'info' | 'success' | 'warning' | 'error';
  /** 按钮：runner 会把 `purposeAction` 转成 `purpose:<action>`，点击后派发 `bubble:action`。 */
  buttons?: Array<{
    /** 按钮 id，会作为 payload.actionId 回到 purpose event。 */
    id: string;
    /** 按钮展示文本。 */
    label: string;
    /** shadcn Button variant。 */
    variant?: 'default' | 'secondary' | 'destructive';
    /** 点击后触发 purpose-event 的 action 标识；不填则只关闭气泡。 */
    purposeAction?: string;
  }>;
  /** 非 persistent notice 的展示时长。 */
  duration?: number;
  /** true 时常驻，直到用户关闭或 routine 用 clearMessage 清理。 */
  persistent?: boolean;
  /** 用于按钮回填 routineId 的关联键，会作为 routineId 透传给消息层。 */
  routineId?: string;
  /** 冷却时间；同一个 runner context 中，冷却未到会跳过该 step。 */
  cooldownMs?: number;
  /** 冷却键；不填时默认用 `showNotice:<step.id>`。 */
  cooldownKey?: string;
  /** 是否朗读 notice 内容；可设为 false 避免和 speak step 重复。 */
  speak?: boolean;
};

/** 清理消息队列里的 toast / notice / busy / all。 */
type ClearMessageStep = BaseRoutineStep<'clearMessage'> & {
  /** 要清理的消息类型；不填时主进程会按 all 发送。 */
  messageType?: 'toast' | 'notice' | 'busy' | 'all';
  /** 指定消息 id 时，只清理这条消息。 */
  messageId?: string;
};

/** 展示 busy/progress 状态，适合后台任务、导入、工作流等待。 */
type ShowBusyStep = BaseRoutineStep<'showBusy'> & {
  /** 忙碌文案。 */
  content?: string;
  /** 初始进度，通常为 0-100。 */
  progress?: number;
};

/** 更新当前 busy/progress 状态。 */
type UpdateBusyStep = BaseRoutineStep<'updateBusy'> & {
  /** 固定文案；优先级低于 contentFrom 成功解析的值。 */
  content?: string;
  /** 固定进度；优先级低于 progressFrom 成功解析的值。 */
  progress?: number;
  /** 从 runner variables 中读取文案的点路径，例如 `workflowProgress.payload.message`。 */
  contentFrom?: string;
  /** 从 runner variables 中读取进度的点路径，例如 `workflowProgress.payload.progress`。 */
  progressFrom?: string;
};

/** 清理 busy/progress 状态。 */
type ClearBusyStep = BaseRoutineStep<'clearBusy'> & {
};

/** 打开或聚焦一个由 purposeWindowAdapter 支持的窗口。 */
type OpenWindowStep = BaseRoutineStep<'openWindow'> & {
  /** 窗口 key；AI planner 会受 allowlist 限制，preset routine 不受 planner allowlist 限制。 */
  window: string;
  /** 传给窗口的初始化 payload。 */
  payload?: Record<string, unknown>;
  /** 打开窗口后继续等待某个事件；内部会派生一个 waitForEvent step。 */
  waitForEvent?: string;
  /** `waitForEvent` 的事件来源；不填时按 `purpose-event` 等待。 */
  eventSource?: SpritePurposeRuntimeEventSource;
  /** `waitForEvent` 的匹配条件。 */
  match?: Record<string, unknown>;
  /** 打开窗口或等待后续事件的最大耗时。 */
  timeoutMs?: number;
  /** 若配置 `waitForEvent`，将等待到的事件写入 runner 变量。 */
  assignTo?: string;
};

/** 循环执行 body，直到等待到目标事件或达到 maxDurationMs。 */
type LoopUntilStep = BaseRoutineStep<'loopUntil'> & {
  /** 一个或多个结束事件；任一事件命中就停止循环。 */
  untilEvent: string | string[];
  /** 结束事件来源；不填时由 waiter 默认按 `purpose-event`。 */
  source?: SpritePurposeRuntimeEventSource;
  /** 结束事件匹配条件。 */
  match?: Record<string, unknown>;
  /** 针对不同结束事件的匹配条件；优先级高于通用 `match`。 */
  eventMatches?: Record<string, Record<string, unknown>>;
  /** true 时只等新事件，避免历史事件立即结束循环。 */
  ignoreHistory?: boolean;
  /** 循环体；每轮按顺序执行。空 body 时 runner 会短暂 sleep，避免忙等。 */
  body: SpriteRoutineStep[];
  /** 循环最大持续时间，同时作为内部 waitForEvent 的 timeout。 */
  maxDurationMs?: number;
  /** 将 `{ event, iterations }` 写入 runner 变量。 */
  assignTo?: string;
};

/** 根据 runner variables 中的值选择一组子步骤执行。 */
type BranchStep = BaseRoutineStep<'branch'> & {
  /** 读取变量的点路径，例如 `menuResult.payload.status` 或 `workspaceCreatedEvent.event.event`。 */
  by: string;
  /** caseKey 到子步骤列表的映射；读取值会被 String() 后匹配。 */
  cases: Record<string, SpriteRoutineStep[]>;
  /** 没有匹配 case 时执行的子步骤。 */
  default?: SpriteRoutineStep[];
};

/**
 * Routine 的最小执行单元。
 *
 * `SpriteRoutineStep` 是 purpose 系统里的声明式动作 DSL：preset routine 和 AI planner
 * 都只产出这些纯数据步骤，`SpriteRoutineRunner` 再按顺序解释执行。Runner 负责：
 *
 * - 顺序推进、取消、超时和 step 结果记录；
 * - `assignTo` 变量写入，以及 `branch.by` / `updateBusy.*From` 的路径读取；
 * - `loopUntil` / `branch` 这类控制流；
 * - 调用 SpriteManager 注入的 deps 去真正播放动画、移动窗口、展示消息或打开窗口。
 *
 * 也就是说，这个类型描述“角色为了达成一个 purpose 接下来要做什么”，而不是直接包含
 * Electron / React / 动画播放器的实现细节。
 */
export type SpriteRoutineStep =
  | PlayAnimationStep
  | WalkToStep
  | WaitStep
  | WaitForEventStep
  | SpeakStep
  | ShowToastStep
  | ShowNoticeStep
  | ClearMessageStep
  | ShowBusyStep
  | UpdateBusyStep
  | ClearBusyStep
  | OpenWindowStep
  | LoopUntilStep
  | BranchStep;

export interface SpriteRoutine {
  id: string;
  purposeId: string;
  presetId?: string;
  priority?: number;
  source: SpriteRoutineSource;
  status: SpriteRoutineStatus;
  steps: SpriteRoutineStep[];
  cursor: number;
  createdAt: number;
  startedAt?: number;
  endedAt?: number;
}

export interface SpriteRoutineStepResult {
  ok: boolean;
  status: 'completed' | 'timeout' | 'cancelled' | 'failed' | 'skipped';
  stepId: string;
  value?: unknown;
  error?: string;
  elapsedMs: number;
}

export interface SpriteRoutineRunResult {
  ok: boolean;
  status: 'completed' | 'cancelled' | 'failed';
  purposeId: string;
  routineId: string;
  currentStepId?: string;
  error?: string;
  elapsedMs: number;
  steps: SpriteRoutineStepResult[];
}

export interface SpritePurposeStartResult {
  accepted: boolean;
  purpose: SpritePurpose;
  routine?: SpriteRoutine;
  status: 'started' | 'queued' | 'coalesced' | 'rejected' | 'superseded';
  reason?: string;
}

export interface SpritePurposeSnapshot {
  current: SpritePurpose | null;
  routine: SpriteRoutine | null;
  queue: SpritePurpose[];
}

export type SpritePurposeEventType =
  | 'purpose:created'
  | 'purpose:started'
  | 'purpose:completed'
  | 'purpose:cancelled'
  | 'purpose:coalesced'
  | 'purpose:rejected'
  | 'purpose:superseded'
  | 'purpose:failed'
  | 'planner:planned'
  | 'planner:fallback'
  | 'routine:started'
  | 'routine:completed'
  | 'routine:cancelled'
  | 'routine:failed'
  | 'step:started'
  | 'step:completed'
  | 'step:timeout'
  | 'step:cancelled'
  | 'step:skipped'
  | 'step:failed';

export interface SpritePurposeHistoryEntry {
  timestamp: number;
  eventType: SpritePurposeEventType;
  purposeId: string;
  routineId?: string;
  stepId?: string;
  purposeKind?: string;
  priority?: number;
  source?: SpritePurposeSource | SpriteRoutineSource;
  status?: string;
  summary?: string;
  contextDigest?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
}

export interface SpritePurposeHistoryWriter {
  append(entry: SpritePurposeHistoryEntry): void | Promise<void>;
}

export interface SpritePurposeHistoryReader {
  list(query?: SpritePurposeHistoryQuery): Promise<SpritePurposeHistoryEntry[]>;
}

export interface SpritePurposeHistoryQuery {
  limit?: number;
  kind?: string;
  status?: SpritePurposeStatus | 'all';
  eventType?: SpritePurposeEventType | SpritePurposeEventType[];
  date?: string;
  since?: number;
  until?: number;
}

export interface SpritePurposeRetrospectiveItem {
  purposeId: string;
  purposeKind: string;
  status: string;
  source?: SpritePurposeSource | SpriteRoutineSource;
  priority?: number;
  startedAt?: number;
  endedAt: number;
  durationMs?: number;
  summary?: string;
  outcome: string;
  stepCount: number;
  completedStepIds: string[];
  failedStepIds: string[];
  plannerFallbackReason?: string;
  memoryWorthiness: number;
  memoryCandidate: boolean;
  recallCue?: string;
}

export interface SpritePurposeDailyRetrospective {
  date: string;
  generatedAt: number;
  totalPurposeCount: number;
  terminalPurposeCount: number;
  completedCount: number;
  cancelledCount: number;
  failedCount: number;
  kindCounts: Record<string, number>;
  memoryCandidateCount: number;
  recallCues: string[];
  items: SpritePurposeRetrospectiveItem[];
}

export interface SpritePurposeRetrospectiveQuery {
  date?: string;
  limit?: number;
  includeIdle?: boolean;
  minMemoryWorthiness?: number;
}
