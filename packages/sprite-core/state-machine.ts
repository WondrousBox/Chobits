/**
 * SpriteStateMachine — 有限状态机引擎
 *
 * 核心设计：
 * 1. 声明式状态转换表 —— 所有合法转换编译期可见
 * 2. 进入/退出守卫 —— 支持条件阻断转换
 * 3. 临时状态（ephemeral）—— 播放一次后自动回退
 * 4. 状态栈 —— 支持 push/pop 恢复上一状态
 * 5. 事件驱动 —— 状态变化自动通过 EventBus 广播
 *
 * 替代原有 useSpriteConductor 中的手动 switch/case。
 */

import { SpriteEventBus, type SpriteBusEventType } from './event-bus';

// ============ 类型定义 ============

/** 精灵主状态 */
export type SpriteState =
  | 'idle'
  | 'walking'
  | 'running'
  | 'dragging'
  | 'sleeping'
  | 'reacting' // 临时反应状态的容器
  | 'bored';

/** 精灵反应子状态（reacting 的细分，仅保留真实 runtime reaction） */
export type SpriteReactionState = 'click' | 'hold' | 'drop' | 'file-drag-over' | 'file-drop' | 'sleepy' | 'custom';

/** @deprecated 向后兼容别名，新代码请优先使用 SpriteReactionState。 */
export type SpriteSubState = SpriteReactionState;

/** 状态转换配置 */
export interface StateTransition {
  from: SpriteState | SpriteState[] | '*';
  to: SpriteState;
  /** 可选守卫条件 */
  guard?: (context: StateContext) => boolean;
  /** 转换时触发的事件 */
  event?: SpriteBusEventType;
}

/** 状态配置 */
export interface StateConfig {
  /** 进入时的动画事件类型 */
  animationEvent?: string;
  /** 进入时的回调 */
  onEnter?: (context: StateContext) => void;
  /** 退出时的回调 */
  onExit?: (context: StateContext) => void;
  /** 临时状态：播完后自动回退到之前的稳定状态 */
  ephemeral?: boolean;
  /** 临时状态持续时间（ms），仅 ephemeral=true 时有效 */
  duration?: number;
}

/** 状态机上下文 */
export interface StateContext {
  currentState: SpriteState;
  previousState: SpriteState;
  subState: SpriteReactionState | null;
  stateStartTime: number;
  metadata: Record<string, any>;
}

/** 状态变化监听器 */
export type StateChangeListener = (newState: SpriteState, oldState: SpriteState, context: StateContext) => void;

// ============ 默认状态转换表 ============

const DEFAULT_TRANSITIONS: StateTransition[] = [
  // idle 可以转到任何状态
  { from: 'idle', to: 'walking' },
  { from: 'idle', to: 'running' },
  { from: 'idle', to: 'dragging' },
  { from: 'idle', to: 'sleeping' },
  { from: 'idle', to: 'reacting' },
  { from: 'idle', to: 'bored' },

  // walking 可以被打断
  { from: 'walking', to: 'idle' },
  { from: 'walking', to: 'dragging' },
  { from: 'walking', to: 'running' },
  { from: 'walking', to: 'reacting' },

  // running 可以被打断
  { from: 'running', to: 'idle' },
  { from: 'running', to: 'walking' },
  { from: 'running', to: 'dragging' },

  // dragging → idle（拖拽结束）
  { from: 'dragging', to: 'idle' },
  { from: 'dragging', to: 'reacting' }, // drop reaction

  // sleeping → idle（唤醒）
  { from: 'sleeping', to: 'idle' },
  { from: 'sleeping', to: 'reacting' }, // wake reaction

  // reacting → idle（反应结束）
  { from: 'reacting', to: 'idle' },
  { from: 'reacting', to: 'walking' },

  // bored → idle 或 walking
  { from: 'bored', to: 'idle' },
  { from: 'bored', to: 'walking' },
  { from: 'bored', to: 'reacting' }
];

// ============ 默认状态配置 ============

const DEFAULT_STATE_CONFIGS: Record<SpriteState, StateConfig> = {
  idle: {},
  walking: {
    animationEvent: 'walk'
  },
  running: {
    animationEvent: 'run'
  },
  dragging: {
    animationEvent: 'drag'
  },
  sleeping: {
    animationEvent: 'sleep'
  },
  reacting: {
    // 不设置 ephemeral — playOnce() 自行管理超时
    // transitionTo('reacting') 用于持久性反应（如 fileDragOver）
  },
  bored: {
    animationEvent: 'bored',
    ephemeral: true,
    duration: 3000
  }
};

// ============ 状态机实现 ============

export class SpriteStateMachine {
  private state: SpriteState = 'idle';
  private subState: SpriteReactionState | null = null;
  private previousStableState: SpriteState = 'idle';
  private stateStartTime: number = Date.now();
  private metadata: Record<string, any> = {};

  private transitions: StateTransition[];
  private configs: Map<SpriteState, StateConfig>;
  private listeners: Set<StateChangeListener> = new Set();
  private ephemeralTimer: ReturnType<typeof setTimeout> | null = null;
  private stateStack: SpriteState[] = [];

  private eventBus?: SpriteEventBus;

  constructor(options?: { transitions?: StateTransition[]; configs?: Partial<Record<SpriteState, StateConfig>>; eventBus?: SpriteEventBus; initialState?: SpriteState }) {
    this.transitions = options?.transitions ?? DEFAULT_TRANSITIONS;
    this.configs = new Map(Object.entries({ ...DEFAULT_STATE_CONFIGS, ...options?.configs }) as [SpriteState, StateConfig][]);
    this.eventBus = options?.eventBus;

    if (options?.initialState) {
      this.state = options.initialState;
    }
  }

  // ============ 公共 API ============

  /** 获取当前状态 */
  getState(): SpriteState {
    return this.state;
  }

  /** 获取当前子状态 */
  getSubState(): SpriteReactionState | null {
    return this.subState;
  }

  /** 获取上下文快照 */
  getContext(): StateContext {
    return {
      currentState: this.state,
      previousState: this.previousStableState,
      subState: this.subState,
      stateStartTime: this.stateStartTime,
      metadata: { ...this.metadata }
    };
  }

  /** 获取当前状态的持续时间(ms) */
  getStateDuration(): number {
    return Date.now() - this.stateStartTime;
  }

  /**
   * 切换到指定状态
   * @returns 是否成功转换
   */
  transitionTo(
    target: SpriteState,
    options?: {
      subState?: SpriteReactionState;
      metadata?: Record<string, any>;
      force?: boolean;
    }
  ): boolean {
    const { subState, metadata, force } = options ?? {};

    // 相同状态跳过（除非子状态不同）
    if (this.state === target && this.subState === subState && !force) {
      return false;
    }

    // 检查转换合法性
    if (!force && !this.canTransition(target)) {
      console.warn(`[StateMachine] Invalid transition: ${this.state} → ${target}`);
      return false;
    }

    // 清除临时状态计时器
    this.clearEphemeralTimer();

    const oldState = this.state;
    const oldConfig = this.configs.get(oldState);
    const newConfig = this.configs.get(target);
    const ctx = this.getContext();

    // 退出守卫
    oldConfig?.onExit?.(ctx);

    // 更新状态
    this.state = target;
    this.subState = subState ?? null;
    this.stateStartTime = Date.now();
    if (metadata) {
      this.metadata = { ...this.metadata, ...metadata };
    }

    // 记录稳定状态（非临时状态；reacting 只是临时容器，不作为稳定状态记录，
    // 否则 playOnce 在 reacting 中再次触发时 fallback 会取到 reacting 自身导致卡死）
    if (!newConfig?.ephemeral && target !== 'reacting') {
      this.previousStableState = target;
    }

    // 进入回调
    newConfig?.onEnter?.(this.getContext());

    // 通知监听器
    for (const listener of this.listeners) {
      try {
        listener(target, oldState, this.getContext());
      } catch (err) {
        console.error('[StateMachine] Listener error:', err);
      }
    }

    // 广播事件
    this.eventBus?.emit(
      `state:${target}` as any,
      {
        from: oldState,
        to: target,
        subState
      },
      'state-machine'
    );

    // 设置临时状态自动回退
    if (newConfig?.ephemeral) {
      const duration = newConfig.duration ?? 800;
      this.ephemeralTimer = setTimeout(() => {
        this.transitionTo(this.previousStableState);
      }, duration);
    }

    return true;
  }

  /**
   * 播放一次临时 reaction，完成后回退
   * 相当于 transitionTo('reacting', { subState, ... }) 但更语义化
   */
  playOnce(subState: SpriteReactionState, options?: { durationMs?: number; fallback?: SpriteState; metadata?: Record<string, any> }): boolean {
    const { durationMs, fallback, metadata } = options ?? {};
    const currentConfig = this.configs.get(this.state);
    const defaultFallback = this.state === 'reacting' || currentConfig?.ephemeral ? this.previousStableState : this.state;
    const fallbackState = fallback ?? defaultFallback;

    const success = this.transitionTo('reacting', { subState, metadata, force: true });

    if (success) {
      const duration = durationMs ?? 800; // 默认 800ms
      this.clearEphemeralTimer();
      this.ephemeralTimer = setTimeout(
        () => {
          this.transitionTo(fallbackState, { force: true });
        },
        Math.max(200, duration)
      );
    }

    return success;
  }

  /**
   * 推入状态栈并转换
   * 用于需要恢复的场景（如对话中途被打断）
   */
  pushState(target: SpriteState): boolean {
    this.stateStack.push(this.state);
    return this.transitionTo(target, { force: true });
  }

  /**
   * 弹出状态栈，恢复之前的状态
   */
  popState(): boolean {
    const prev = this.stateStack.pop();
    if (prev) {
      return this.transitionTo(prev, { force: true });
    }
    return false;
  }

  /**
   * 检查是否可以转换到目标状态
   */
  canTransition(target: SpriteState): boolean {
    const ctx = this.getContext();
    return this.transitions.some((t) => {
      const fromMatch = t.from === '*' || t.from === this.state || (Array.isArray(t.from) && t.from.includes(this.state));
      const toMatch = t.to === target;
      const guardPass = !t.guard || t.guard(ctx);
      return fromMatch && toMatch && guardPass;
    });
  }

  /**
   * 获取当前状态可达的目标状态列表
   */
  getAvailableTransitions(): SpriteState[] {
    const ctx = this.getContext();
    const targets = new Set<SpriteState>();
    for (const t of this.transitions) {
      const fromMatch = t.from === '*' || t.from === this.state || (Array.isArray(t.from) && t.from.includes(this.state));
      if (fromMatch && (!t.guard || t.guard(ctx))) {
        targets.add(t.to);
      }
    }
    return Array.from(targets);
  }

  /** 添加状态变化监听器 */
  onChange(listener: StateChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * 动态注册新的转换规则
   * 用于插件扩展新状态行为
   */
  addTransition(transition: StateTransition): void {
    this.transitions.push(transition);
  }

  /**
   * 动态注册/更新状态配置
   */
  setStateConfig(state: SpriteState, config: Partial<StateConfig>): void {
    const existing = this.configs.get(state) ?? {};
    this.configs.set(state, { ...existing, ...config });
  }

  /** 销毁，清理定时器和监听器 */
  destroy(): void {
    this.clearEphemeralTimer();
    this.listeners.clear();
    this.stateStack = [];
  }

  // ============ 内部方法 ============

  private clearEphemeralTimer(): void {
    if (this.ephemeralTimer) {
      clearTimeout(this.ephemeralTimer);
      this.ephemeralTimer = null;
    }
  }
}
