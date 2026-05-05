/**
 * SpriteManager — 主进程门面 (Façade)
 *
 * 作为 sprite-core 引擎在主进程的统一入口，整合所有子系统：
 * - SpriteEventBus: 事件总线
 * - SpriteStateMachine: 状态机
 * - PersonaStateManager: 人格状态
 * - InteractionTracker: 交互追踪
 * - BehaviorEngine: 行为引擎
 * - AnimationRegistry: 动画注册表
 * - WindowController: 窗口控制 (Step 2 注入)
 * - PersonaStatePersistence: 内建持久化
 *
 * 设计原则：
 * 1. 单例模式 —— 全局唯一实例
 * 2. Electron 依赖通过 init() 注入，不直接 import
 * 3. 状态变更自动广播到渲染进程
 * 4. BehaviorEngine 上下文从自身实例读取
 */

import type { AnimationEntry } from '../animation-registry';
import { AnimationRegistry } from '../animation-registry';
import type { BehaviorContext, BehaviorDefinition } from '../behavior-engine';
import { BehaviorEngine } from '../behavior-engine';
import { getSpriteCapabilityRuntimeState } from '../capability-runtime';
import { SpriteEventBus } from '../event-bus';
import { SPRITE_INTERACTION_EVENT_BY_INTENT, type SpriteInteractionIntent, type SpriteInteractionPayload } from '../interaction-contract';
import { InteractionTracker } from '../interaction-tracker';
import Messages from '../messages/zh-CN';
import { getSpriteEventText } from '../messages/zh-CN';
import {
  type ConversationRewardContext,
  getConversationRewardEventRules,
  getPersonaRulesSnapshot,
  getResolvedConversationPersonaRewardBonus,
  type PersonaRewardGrant,
  subscribePersonaRulesChanges
} from '../persona-rules';
import type { MoodType, PersonaState } from '../persona-state';
import { PersonaStateManager } from '../persona-state';
import {
  SpritePresentationLock,
  type SpritePurpose,
  type SpritePurposeDailyRetrospective,
  type SpritePurposeEventType,
  SpritePurposeEventWaiter,
  type SpritePurposeHistoryEntry,
  type SpritePurposeHistoryQuery,
  SpritePurposeHistoryStore,
  SpritePurposeManager,
  type SpritePurposeRetrospectiveQuery,
  type SpritePurposeRuntimeEventInput,
  type SpritePurposeSnapshot,
  type SpritePurposeStartResult,
  type SpriteRoutine,
  SpriteRoutineRunner,
  type SpriteRoutineStep,
  type StartSpritePurposeRequest
} from '../purpose';
import { SpeakService } from '../speak/speak-service';
import type { SpeakResult, SpriteSpeakConfig, SpriteSpeakPayload } from '../speak/types';
import type { SpriteReactionState, SpriteState } from '../state-machine';
import { SpriteStateMachine } from '../state-machine';
import {
  compileSpriteAnimationCondition,
  getSpriteAnimationTriggers,
  MESSAGE_IPC_CHANNELS,
  type MessageBridgeClearPayload,
  type MessageBridgePayload,
  type MessageCategory,
  type MessageIPCPayload,
  type SpriteAnimation,
  type SpriteAnimationTrigger,
  type SpriteConfig,
  type SpriteInitialState,
  type SpriteMovementConfig,
  type SpriteMovementPreviewConfig,
  type SpritePlayCommand,
  type SpriteStateSnapshot,
  type SpriteTriggerOptions
} from '../types';
import type { WindowControllerAvoidRegion } from '../window-controller-model';
import { registerDefaultBehaviors } from './default-behaviors';
import { MovementCoordinator } from './movement-coordinator';
import { AutoWalkConfig, PersonaStatePersistence } from './persistence';
import { mapStateToEventType } from './state-mapping';
import type {
  PersonaStatePersistenceRow,
  SpriteBehaviorScheduler,
  SpriteManagerOptions,
  SpritePurposeWindowAdapter,
  SpriteSchedulerScheduleSpec,
  SpriteSpontaneousUtteranceExecutor,
  SpriteWindow
} from './types';

// ============================================================================
// SpriteManager 实现
// ============================================================================

type SpriteAnimationCompletionPhase = 'intro' | 'loop' | 'outro' | 'full';

interface SpriteAnimationCompletionWaiter {
  resolve: () => void;
  timer: ReturnType<typeof setTimeout>;
}

interface SpritePresentationOwnerContext {
  ownerId: string;
  priority: number;
}

interface SpriteBehaviorSchedulerPayload {
  behaviorId: string;
}

const SPRITE_BEHAVIOR_SCHEDULER_OWNER = 'sprite.behavior';
const SPRITE_AUTO_MOVE_SCHEDULER_GATE = 'sprite.canAutoMove';

export class SpriteManager {
  // 内部引擎实例
  private eventBus: SpriteEventBus;
  private stateMachine: SpriteStateMachine;
  private personaState: PersonaStateManager;
  private interactionTracker: InteractionTracker;
  private behaviorEngine: BehaviorEngine;
  private behaviorScheduler?: SpriteBehaviorScheduler;
  private behaviorSchedulerStarted = false;
  private behaviorSchedulerJobIds = new Set<string>();
  private unbindBehaviorSchedulerHandler: (() => void) | null = null;
  private unbindBehaviorSchedulerGate: (() => void) | null = null;
  private animationRegistry: AnimationRegistry;
  private purposeManager: SpritePurposeManager;
  private purposeEventWaiter: SpritePurposeEventWaiter;
  private purposeHistory: SpritePurposeHistoryStore;
  private purposeWindowAdapter?: SpritePurposeWindowAdapter;

  // 内建持久化
  private persistence: PersonaStatePersistence;
  private autoWalkConfig: AutoWalkConfig;
  private movementSuspensionReasons = new Set<string>();

  // 语音合成服务
  private speakService: SpeakService;
  /** 防止 speak() → showToast() → speakService.speak() 递归 */
  private _speakGuard = false;

  // Electron 依赖
  private win: SpriteWindow;
  private getScreenSize: () => { width: number; height: number };
  private spontaneousUtteranceExecutor?: SpriteSpontaneousUtteranceExecutor;
  private activePersonaStateId = 'default';
  private activePersonaIdentity: { name: string; description?: string };

  // 当前动画和配置
  private currentAnimation: SpritePlayCommand | null = null;
  private animationPlayCounter = 0;
  private animationCompletionWaiters = new Map<string, SpriteAnimationCompletionWaiter>();
  private presentationLock = new SpritePresentationLock();
  private activeRoutinePresentationOwner: SpritePresentationOwnerContext | null = null;
  private stateDrivenPresentationOwner: SpritePresentationOwnerContext | null = null;
  private spriteConfig: SpriteConfig = { width: 200, height: 200, padding: 100, showDebugOverlay: false };
  private movementCoordinator: MovementCoordinator;

  // 状态广播节流
  private lastStateBroadcast = 0;
  private stateBroadcastTimer: ReturnType<typeof setTimeout> | null = null;

  // 行走状态
  private _isWalking = false;
  private _walkDirection: 'left' | 'right' | null = null;

  // WindowController 占位 (Step 2 注入)
  private windowController: any = null;

  // 三段式动画 outro 播放中标志：
  // 当从 reacting 状态（三段式动画）切回 idle 时，
  // 不立即切换动画，等 outro 播完再发送 idle 动画
  private _pendingIdleAfterOutro = false;

  // 欢迎消息只在首次 rendererReady 时发送
  private _welcomeSent = false;
  private lastConversationRewardTime = 0;
  private unsubscribePersonaRulesChanges: (() => void) | null = null;

  // 单例
  private static instance: SpriteManager | null = null;

  private constructor(options: SpriteManagerOptions) {
    this.win = options.win;
    this.getScreenSize = options.getScreenSize;
    this.spontaneousUtteranceExecutor = options.spontaneousUtteranceExecutor;
    this.purposeWindowAdapter = options.purposeWindowAdapter;
    this.activePersonaIdentity = {
      name: options.appName ?? 'Chobits'
    };

    // 创建引擎实例
    this.eventBus = new SpriteEventBus();
    this.stateMachine = new SpriteStateMachine({ eventBus: this.eventBus });
    this.personaState = new PersonaStateManager({
      eventBus: this.eventBus,
      initialState: { name: options.appName ?? 'Chobits' },
      onStateChange: () => this.onPersonaStateChange()
    });
    this.syncPersonaRules(getPersonaRulesSnapshot());
    this.unsubscribePersonaRulesChanges = subscribePersonaRulesChanges((snapshot) => {
      this.syncPersonaRules(snapshot);
    });
    this.interactionTracker = new InteractionTracker({ eventBus: this.eventBus });
    this.behaviorEngine = new BehaviorEngine({
      eventBus: this.eventBus,
      stateMachine: this.stateMachine,
      tickIntervalMs: 1000
    });
    this.behaviorScheduler = options.behaviorScheduler;
    this.animationRegistry = new AnimationRegistry();
    this.purposeEventWaiter = new SpritePurposeEventWaiter();
    this.purposeHistory = new SpritePurposeHistoryStore(options.dataDir);
    this.eventBus.on('*', (event) => {
      this.purposeEventWaiter.emit({
        source: 'sprite-event-bus',
        event: event.type,
        payload: event.payload,
        timestamp: event.timestamp
      });
    });
    this.movementCoordinator = new MovementCoordinator({
      canMove: () => !!this.windowController,
      canUseMovement: () => {
        return this.canUseMovement();
      },
      getScreenSize: () => this.getScreenSize(),
      getPosition: () => this.getPosition(),
      getSpriteConfig: () => this.getSpriteConfig(),
      getAvoidRegions: () => this.windowController?.getAvoidRegions?.() ?? [],
      setSpriteMetrics: (metrics) => this.setSpriteMetrics(metrics),
      setWindowSize: (width, height, padding) => {
        this.windowController?.setSize?.(width, height, padding);
      },
      walkTo: (x, y, speed) => this.walkTo(x, y, speed),
      stopWalk: () => this.stopWalk(),
      startAutoMove: (movement) => {
        this.windowController?.startAutoMove?.(movement);
      },
      stopAutoMove: () => {
        this.windowController?.stopAutoMove?.();
      },
      isAutoMoving: () => this.windowController?.isAutoMoving?.() ?? false,
      getAutoMoveDirection: () => this.windowController?.getAutoMoveDirection?.() ?? null,
      emitWalkState: (payload) => this.sendToRenderer('sprite:walk', payload),
      emitConfigChanged: () => this.emitConfigChanged()
    });
    this.purposeManager = new SpritePurposeManager({
      runner: new SpriteRoutineRunner({
        playAnimation: (step, signal, routine) => this.runPurposeAnimationStep(step, signal, routine),
        walkTo: (step, signal, routine) => this.runPurposeWalkStep(step, signal, routine),
        waitForEvent: (step, signal, routine) => this.purposeEventWaiter.wait(step, routine, signal),
        speak: (step) => this.speak(step.text, { showBubble: true, bubbleDuration: step.bubbleDuration }),
        showToast: (step) => this.showToast(step.content, { category: step.category as MessageCategory | undefined, duration: step.duration }),
        showBusy: (step) => this.showBusy(step.content, step.progress),
        updateBusy: (step) => this.updateBusy(step.progress ?? 0, step.content),
        clearBusy: () => this.clearBusy(),
        openWindow: (step, signal) => this.runPurposeOpenWindowStep(step, signal),
        onStepStart: (routine, step) => this.recordPurposeStepEvent('step:started', routine, step),
        onStepComplete: (routine, step, result) => {
          const eventType =
            result.status === 'completed'
              ? 'step:completed'
              : result.status === 'cancelled'
                ? 'step:cancelled'
                : result.status === 'timeout'
                  ? 'step:timeout'
                  : result.status === 'skipped'
                    ? 'step:skipped'
                    : 'step:failed';
          return this.recordPurposeStepEvent(eventType, routine, step, {
            status: result.status,
            elapsedMs: result.elapsedMs,
            value: result.value as Record<string, unknown> | undefined,
            error: result.error
          });
        }
      }),
      history: this.purposeHistory,
      idlePresence: { enabled: true },
      routinePlanner: options.purposeRoutinePlanner,
      onRoutineStart: (purpose, routine) => this.acquireRoutinePresentationLock(purpose, routine),
      onRoutineFinish: (purpose) => this.releaseRoutinePresentationLock(purpose.id),
      onSnapshot: (snapshot) => this.sendToRenderer('sprite:purpose:state', snapshot)
    });

    // 持久化
    this.persistence = new PersonaStatePersistence(options.dataDir);
    this.autoWalkConfig = new AutoWalkConfig(options.dataDir);

    // 语音合成服务
    this.speakService = new SpeakService(options.dataDir);
    this.speakService.setPlayAudioCallback((payload: SpriteSpeakPayload) => {
      this.sendToRenderer('sprite:speak', payload);
    });

    // 设置状态机变化监听
    this.stateMachine.onChange((newState, oldState, ctx) => {
      this.onStateChange(newState, oldState, ctx.subState);
    });

    // 设置 BehaviorEngine 上下文提供器
    this.behaviorEngine.setContextProvider(() => this.buildBehaviorContext());
    this.bindBehaviorScheduler();
  }

  // ============================================================================
  // 单例管理
  // ============================================================================

  /** 首次初始化 */
  static init(options: SpriteManagerOptions): SpriteManager {
    if (SpriteManager.instance) {
      console.warn('[SpriteManager] Already initialized, returning existing instance');
      return SpriteManager.instance;
    }
    SpriteManager.instance = new SpriteManager(options);
    return SpriteManager.instance;
  }

  /** 获取已初始化的实例 */
  static getInstance(): SpriteManager {
    if (!SpriteManager.instance) {
      throw new Error('[SpriteManager] Not initialized. Call SpriteManager.init() first.');
    }
    return SpriteManager.instance;
  }

  /** 实例是否已初始化 */
  static hasInstance(): boolean {
    return SpriteManager.instance !== null;
  }

  // ============================================================================
  // 生命周期
  // ============================================================================

  /** 启动引擎 */
  async start(): Promise<void> {
    this.syncPersonaRules();

    // 1. 加载自动行走配置
    this.autoWalkConfig.load();

    // 2. 加载持久化的人格状态
    const saved = await this.persistence.load(this.activePersonaStateId);
    if (saved) {
      this.personaState.loadState({
        name: this.activePersonaIdentity.name,
        ...(this.activePersonaIdentity.description !== undefined ? { description: this.activePersonaIdentity.description } : { description: saved.description }),
        xp: saved.xp,
        level: saved.level,
        favor: saved.favor,
        mood: saved.mood,
        moodIntensity: saved.moodIntensity,
        totalInteractions: saved.totalInteractions,
        totalSessionTime: saved.totalSessionTime,
        loginStreak: saved.loginStreak,
        lastLoginDate: saved.lastLoginDate,
        achievements: saved.achievements,
        dimensions: saved.dimensions,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt
      });
    } else {
      this.personaState.loadState(this.buildDefaultPersonaState());
    }

    // 3. 启动自动保存
    this.persistence.startAutoSave(() => this.getPersonaStateForPersistence());

    // 4. 注册默认行为
    registerDefaultBehaviors(this);

    // 5. 初始化语音合成服务
    await this.speakService.init();

    // 6. 启动行为调度。主进程统一 scheduler 可用时使用共享调度器，否则保留 legacy polling。
    if (this.behaviorScheduler) {
      this.startBehaviorScheduler();
    } else {
      this.behaviorEngine.start();
    }

    // 7. 启动心情衰减
    this.personaState.startMoodDecay();

    // 8. 记录日常登录
    const loginResult = this.personaState.recordDailyLogin();
    if (loginResult.isNewDay) {
      this.sendToRenderer('sprite:state', {
        state: this.getState(),
        subState: this.getSubState(),
        personaSnapshot: this.personaState.getState()
      });
    }
  }

  /** 停止引擎 */
  stop(): void {
    this.stopBehaviorScheduler();
    this.behaviorEngine.stop();
    this.personaState.stopMoodDecay();
    this.persistence.stopAutoSave();
    if (this.stateBroadcastTimer) {
      clearTimeout(this.stateBroadcastTimer);
      this.stateBroadcastTimer = null;
    }
  }

  /** 销毁并清理 */
  async destroy(): Promise<void> {
    this.stop();
    this.unsubscribePersonaRulesChanges?.();
    this.unsubscribePersonaRulesChanges = null;
    await this.purposeManager.waitForIdlePresence();

    // 保存最终状态
    await this.persistence.save(this.getPersonaStateForPersistence());

    // 清理所有子系统
    this.behaviorEngine.destroy();
    this.unbindBehaviorSchedulerHandler?.();
    this.unbindBehaviorSchedulerHandler = null;
    this.unbindBehaviorSchedulerGate?.();
    this.unbindBehaviorSchedulerGate = null;
    this.interactionTracker.destroy();
    this.personaState.destroy();
    this.stateMachine.destroy();
    this.eventBus.clear();
    this.animationRegistry.clear();

    if (this.windowController) {
      this.windowController.destroy?.();
    }

    SpriteManager.instance = null;
  }

  // ============================================================================
  // 状态控制
  // ============================================================================

  /** 切换精灵状态 */
  transitionTo(state: SpriteState, options?: { subState?: SpriteReactionState; metadata?: Record<string, any>; force?: boolean }): boolean {
    return this.stateMachine.transitionTo(state, options);
  }

  /** 播放一次临时状态 */
  playOnce(subState: SpriteReactionState, options?: { durationMs?: number; fallback?: SpriteState; metadata?: Record<string, any> }): boolean {
    return this.stateMachine.playOnce(subState, options);
  }

  private buildPlaybackSession(playback: AnimationEntry['playback'] | undefined, durationMs: number | undefined, mode: 'state-bound' | 'trigger'): SpritePlayCommand['playbackSession'] | undefined {
    if (mode !== 'trigger') return undefined;
    if (playback?.loopStartMs == null && playback?.loopEndMs == null) return undefined;

    return {
      mode: 'timed',
      startedAtMs: Date.now(),
      activeDurationMs: Math.max(200, durationMs ?? playback?.durationMs ?? 2000)
    };
  }

  private canPresentAnimation(options?: SpriteTriggerOptions): boolean {
    return this.presentationLock.shouldAllow({
      ownerId: options?.ownerPurposeId,
      priority: options?.priority,
      ignoreLock: options?.ignorePresentationLock
    });
  }

  private getStateDrivenPresentationOptions(): SpriteTriggerOptions | undefined {
    if (!this.stateDrivenPresentationOwner) {
      return undefined;
    }

    return {
      ownerPurposeId: this.stateDrivenPresentationOwner.ownerId,
      priority: this.stateDrivenPresentationOwner.priority
    };
  }

  private withStateDrivenPresentationOwner<T>(owner: SpritePresentationOwnerContext, fn: () => T): T {
    const previous = this.stateDrivenPresentationOwner;
    this.stateDrivenPresentationOwner = owner;
    try {
      return fn();
    } finally {
      this.stateDrivenPresentationOwner = previous;
    }
  }

  // ============================================================================
  // 统一事件触发
  // ============================================================================

  /**
   * 统一触发精灵事件
   *
   * 根据 trigger 尝试播放对应动画 + 显示气泡文案。
   * 如果 AnimationRegistry 中没有匹配动画，则仅显示气泡文字。
   * 这是为所有 SpriteEventType 提供统一触发入口的核心方法。
   */
  trigger(trigger: SpriteAnimationTrigger, options?: SpriteTriggerOptions): void {
    // 1. 尝试查找并播放动画
    const anim = this.animationRegistry.findByTrigger({
      trigger,
      personaState: this.personaState.getState()
    });
    if (anim && this.canPresentAnimation(options)) {
      const resolvedDurationMs = options?.durationMs ?? anim.playback?.durationMs;
      this.currentAnimation = {
        playId: options?.playId,
        animationId: anim.id,
        source: anim.source,
        playbackSession: this.buildPlaybackSession(anim.playback, resolvedDurationMs, 'trigger'),
        playback: anim.playback
          ? {
            width: anim.playback.width,
            height: anim.playback.height,
            padding: anim.playback.padding,
            loop: anim.playback.loop,
            loopStartMs: anim.playback.loopStartMs,
            loopEndMs: anim.playback.loopEndMs,
            durationMs: resolvedDurationMs,
            autoIdle: anim.playback.autoIdle ?? true,
            movement: anim.playback.movement
          }
          : { durationMs: options?.durationMs ?? 2000, autoIdle: true }
      };

      // 同步更新精灵尺寸配置
      if (anim.playback) {
        const pb = anim.playback;
        if (pb.width != null) this.spriteConfig.width = pb.width;
        if (pb.height != null) this.spriteConfig.height = pb.height;
        if (pb.padding != null) this.spriteConfig.padding = pb.padding;
      }

      this.sendToRenderer('sprite:play', this.currentAnimation);

      // 启动自动移动
      this.handleAnimationMovement(anim.playback?.movement);
    }

    // 2. 显示气泡文案（除非 silent）
    if (!options?.silent) {
      const text = options?.message || getSpriteEventText(trigger, options?.ctx);
      if (text) {
        this.showToast(text, { duration: options?.duration });
      }
    }
  }

  /**
   * 按动画 ID 直接播放指定动画（用于开发测试）。
   * 不经过 trigger 查找，直接从 AnimationRegistry 取出并播放。
   */
  triggerById(animationId: string, options?: SpriteTriggerOptions): boolean {
    const anim = this.animationRegistry.get(animationId);
    if (!anim) return false;
    if (!this.canPresentAnimation(options)) return false;

    const resolvedDurationMs = options?.durationMs ?? anim.playback?.durationMs;
    this.currentAnimation = {
      playId: options?.playId,
      animationId: anim.id,
      source: anim.source,
      playbackSession: this.buildPlaybackSession(anim.playback, resolvedDurationMs, 'trigger'),
      playback: anim.playback
        ? {
          width: anim.playback.width,
          height: anim.playback.height,
          padding: anim.playback.padding,
          loop: anim.playback.loop,
          loopStartMs: anim.playback.loopStartMs,
          loopEndMs: anim.playback.loopEndMs,
          durationMs: resolvedDurationMs,
          autoIdle: anim.playback.autoIdle ?? true,
          movement: anim.playback.movement
        }
        : { durationMs: options?.durationMs ?? 2000, autoIdle: true }
    };

    if (anim.playback) {
      const pb = anim.playback;
      if (pb.width != null) this.spriteConfig.width = pb.width;
      if (pb.height != null) this.spriteConfig.height = pb.height;
      if (pb.padding != null) this.spriteConfig.padding = pb.padding;
    }

    this.sendToRenderer('sprite:play', this.currentAnimation);

    // 启动自动移动
    this.handleAnimationMovement(anim.playback?.movement);

    if (!options?.silent) {
      const eventType = anim.eventTypes?.[0];
      const text = options?.message || (eventType ? getSpriteEventText(eventType) : undefined);
      if (text) {
        this.showToast(text, { duration: options?.duration });
      }
    }

    return true;
  }

  /** 获取当前主状态 */
  getState(): SpriteState {
    return this.stateMachine.getState();
  }

  /** 获取当前子状态 */
  getSubState(): SpriteReactionState | null {
    return this.stateMachine.getSubState();
  }

  // ============================================================================
  // 消息系统
  // ============================================================================

  /**
   * 不自动朗读的 toast 类别
   * loading / processing / waiting 属于瞬态状态指示，不需要语音
   */
  private static MUTE_CATEGORIES: ReadonlySet<string> = new Set(['loading', 'processing', 'waiting']);

  private sendMessageBridge(payload: MessageBridgePayload): void {
    this.sendToRenderer(MESSAGE_IPC_CHANNELS.BRIDGE, payload);
  }

  private sendRendererMessage(payload: MessageIPCPayload): void {
    this.sendMessageBridge({ kind: 'show', payload, source: 'sprite' });
  }

  private clearRendererMessage(payload: MessageBridgeClearPayload): void {
    this.sendMessageBridge({ kind: 'clear', payload, source: 'sprite' });
  }

  /** 轻量提示 */
  showToast(content?: string, options?: { category?: MessageCategory; duration?: number; level?: string; ctx?: any }): void {
    // 如果只传了 category 没有 content，先获取文本以确保显示和朗读一致
    const resolvedContent = content ?? (options?.category ? Messages.t(options.category, options?.ctx) : undefined);

    const payload: MessageIPCPayload = {
      type: 'toast',
      content: resolvedContent,
      category: options?.category,
      duration: options?.duration,
      level: options?.level as any,
      ctx: options?.ctx
    };
    this.sendRendererMessage(payload);

    // 自动朗读：非静默类别 且 非来自 speak() 的调用
    if (!this._speakGuard && !SpriteManager.MUTE_CATEGORIES.has(options?.category ?? '')) {
      if (resolvedContent) {
        this.speakService.speak(resolvedContent).catch(() => { });
      }
    }
  }

  /** 通知消息 */
  showNotice(content: string, options?: { buttons?: any[]; duration?: number; persistent?: boolean; routineId?: string; level?: string }): void {
    const payload: MessageIPCPayload = {
      type: 'notice',
      content,
      buttons: options?.buttons,
      duration: options?.duration,
      persistent: options?.persistent,
      routineId: options?.routineId,
      level: options?.level as any
    };
    this.sendRendererMessage(payload);

    // 自动朗读通知内容
    if (content && !this._speakGuard) {
      this.speakService.speak(content).catch(() => { });
    }
  }

  /** 显示忙碌状态 */
  showBusy(content?: string, progress?: number): void {
    const payload: MessageIPCPayload = {
      type: 'busy',
      content,
      progress
    };
    this.sendRendererMessage(payload);
  }

  /** 更新忙碌进度 */
  updateBusy(progress: number, content?: string): void {
    this.sendRendererMessage({
      type: 'busy',
      progress,
      content
    });
  }

  /** 清除忙碌状态 */
  clearBusy(): void {
    this.clearRendererMessage({ type: 'busy' });
  }

  // ============================================================================
  // 语音合成 API (Speak)
  // ============================================================================

  /**
   * 让精灵说话
   * 同时显示文字气泡 + 合成并播放语音
   */
  async speak(text: string, options?: { showBubble?: boolean; bubbleDuration?: number }): Promise<SpeakResult> {
    const showBubble = options?.showBubble ?? true;

    this._speakGuard = true;
    try {
      if (showBubble) {
        const bubbleDuration = options?.bubbleDuration ?? Math.max(3000, text.length * 200);
        this.showToast(text, { duration: bubbleDuration, category: 'message' });
      }
      return await this.speakService.speak(text);
    } finally {
      this._speakGuard = false;
    }
  }

  /** 仅合成语音（不播放） */
  async synthesizeSpeech(text: string): Promise<SpeakResult> {
    return this.speakService.synthesize(text);
  }

  /** 获取语音合成配置 */
  getSpeakConfig(): SpriteSpeakConfig {
    return this.speakService.getConfig();
  }

  /** 更新语音合成配置 */
  setSpeakConfig(partial: Partial<SpriteSpeakConfig>): SpriteSpeakConfig {
    return this.speakService.setConfig(partial);
  }

  /** 重置语音合成配置 */
  resetSpeakConfig(): SpriteSpeakConfig {
    return this.speakService.resetConfig();
  }

  /** 获取语音缓存统计 */
  getSpeakCacheStats(): { totalEntries: number; totalSizeBytes: number } {
    return this.speakService.getCacheStats();
  }

  /** 清空语音缓存 */
  async clearSpeakCache(): Promise<void> {
    await this.speakService.clearCache();
  }

  // ============================================================================
  // 人格化 API
  // ============================================================================

  /** 增加经验值 */
  addXP(amount: number, source?: string): { xpGained: number; leveledUp: boolean; newLevel?: number } {
    const result = this.personaState.addXP(amount, source);
    this.persistence.markDirty();

    if (result.leveledUp) {
      this.sendToRenderer('sprite:state', {
        state: this.getState(),
        subState: this.getSubState(),
        personaSnapshot: this.personaState.getState()
      });
      this.trigger('powerUp', { message: `升级了！当前等级 ${result.newLevel} ⭐` });
    }
    return result;
  }

  /** 修改好感度 */
  changeFavor(delta: number, reason?: string): { oldFavor: number; newFavor: number; levelChanged: boolean } {
    const result = this.personaState.changeFavor(delta, reason);
    this.persistence.markDirty();
    return result;
  }

  /** 统一应用 persona reward，收口 XP / favor / dimension 的业务结算入口 */
  applyPersonaReward(reward: PersonaRewardGrant, source?: string): void {
    if (reward.xp > 0) {
      this.addXP(reward.xp, source);
    }
    if (reward.favor !== 0) {
      this.changeFavor(reward.favor, source);
    }
    for (const dimension of reward.dimensions) {
      if (dimension.delta !== 0) {
        this.updateDimension(dimension.id, dimension.delta, dimension.maxValue);
      }
    }
  }

  /** 记录一次 AI 对话完成，让对话奖励重新回到 runtime event rule 主链路。 */
  recordConversationEvent(context?: ConversationRewardContext): boolean {
    const rulesSnapshot = getPersonaRulesSnapshot();
    this.syncPersonaRules(rulesSnapshot);

    const { cooldownMs } = getConversationRewardEventRules(rulesSnapshot);
    const now = Date.now();
    if (now - this.lastConversationRewardTime < cooldownMs) {
      return false;
    }

    this.lastConversationRewardTime = now;
    this.eventBus.emit('ai:message-sent', context, 'sprite-manager');

    const bonusReward = getResolvedConversationPersonaRewardBonus(context, rulesSnapshot);
    if (bonusReward.xp > 0 || bonusReward.favor !== 0 || bonusReward.dimensions.length > 0) {
      this.applyPersonaReward(bonusReward, 'conversation');
    }

    return true;
  }

  /** 设置心情 */
  setMood(mood: MoodType, intensity?: number): void {
    this.personaState.setMood(mood, intensity);
    this.persistence.markDirty();
  }

  /** 获取完整人格状态 */
  getPersonaState(): PersonaState {
    return this.personaState.getState();
  }

  /** 获取当前人格持久化 slot id */
  getActivePersonaStateId(): string {
    return this.activePersonaStateId;
  }

  /** 配置下一次加载/保存要使用的人格 slot 与角色身份信息 */
  configurePersonaStateSlot(slotId: string, identity?: { name?: string; description?: string }): void {
    this.activePersonaStateId = slotId.trim() || 'default';
    this.activePersonaIdentity = {
      name: identity?.name?.trim() || this.activePersonaIdentity.name,
      ...(identity?.description !== undefined ? { description: identity.description } : {})
    };
  }

  /** 切换到新的角色人格存档：先保存当前 slot，再恢复目标 slot。 */
  async switchPersonaStateSlot(slotId: string, identity?: { name?: string; description?: string }): Promise<{ restored: boolean; state: PersonaState }> {
    await this.persistence.save(this.getPersonaStateForPersistence());

    this.configurePersonaStateSlot(slotId, identity);

    const saved = await this.persistence.load(this.activePersonaStateId);
    this.personaState.resetRuntimeCaches();
    this.lastConversationRewardTime = 0;

    if (saved) {
      this.personaState.loadState({
        ...saved,
        name: identity?.name?.trim() || saved.name,
        ...(identity?.description !== undefined ? { description: identity.description } : {})
      });
    } else {
      this.personaState.loadState(this.buildDefaultPersonaState());
    }

    this.persistence.markDirty();
    this.broadcastState();

    return {
      restored: !!saved,
      state: this.personaState.getState()
    };
  }

  /** 记录每日登录 */
  recordDailyLogin(): { isNewDay: boolean; streak: number; xpBonus: number } {
    const result = this.personaState.recordDailyLogin();
    if (result.isNewDay) {
      this.persistence.markDirty();
    }
    return result;
  }

  /** 解锁成就 */
  unlockAchievement(id: string): boolean {
    const result = this.personaState.unlockAchievement(id);
    if (result) {
      this.persistence.markDirty();
      this.trigger('sparkle', { message: '成就解锁！✨' });
    }
    return result;
  }

  /** 更新维度值 */
  updateDimension(id: string, delta: number, maxValue?: number): { oldValue: number; newValue: number } {
    const result = this.personaState.updateDimension(id, delta, maxValue);
    this.persistence.markDirty();
    return result;
  }

  /** 批量初始化维度（仅对尚未初始化的维度设置初始值） */
  initDimensions(defs: Array<{ id: string; initialValue: number }>): void {
    this.personaState.initDimensions(defs);
    this.persistence.markDirty();
  }

  /** 重置人格状态（等级、经验、好感度等） */
  resetPersonaState(): PersonaState {
    const now = Date.now();
    this.personaState.loadState({
      name: this.personaState.getState().name,
      xp: 0,
      level: 1,
      xpToNextLevel: 100,
      favor: 50,
      favorLevel: 'friend',
      mood: 'neutral',
      moodIntensity: 50,
      totalInteractions: 0,
      totalSessionTime: 0,
      loginStreak: 0,
      lastLoginDate: '',
      achievements: [],
      dimensions: {},
      createdAt: now,
      updatedAt: now
    });
    this.persistence.markDirty();
    this.broadcastState();
    return this.personaState.getState();
  }

  // ============================================================================
  // 交互上报
  // ============================================================================

  /** 记录交互 */
  reportInteraction(type: SpriteInteractionIntent, data?: SpriteInteractionPayload): void {
    const eventType = SPRITE_INTERACTION_EVENT_BY_INTENT[type];
    this.eventBus.emit(eventType, data, 'sprite-manager');

    if (type === 'context-menu') {
      this.setMovementSuspended('context-menu', data?.open !== false);
    }

    // file-drag-over → 切换到 reacting/file-drag-over（持续到 drag-leave 或 file-drop）
    if (type === 'file-drag-over' && this.getState() !== 'dragging') {
      this.transitionTo('reacting', { subState: 'file-drag-over', force: true });
      return;
    }

    // file-drag-leave → 从 file-drag-over 回到 idle
    if (type === 'file-drag-leave' && this.getState() === 'reacting' && this.getSubState() === 'file-drag-over') {
      this.transitionTo('idle', { force: true });
      return;
    }

    // 自动触发临时反应状态
    const reactionMap: Partial<Record<SpriteInteractionIntent, SpriteReactionState>> = {
      click: 'click',
      'file-drop': 'file-drop'
    };
    const subState = reactionMap[type];
    if (subState && this.getState() !== 'dragging') {
      this.playOnce(subState, { durationMs: 800 });
    }

    // 根据交互类型显示对应文案
    const toastCategoryMap: Partial<Record<SpriteInteractionIntent, MessageCategory>> = {
      click: 'click',
      'file-drag-over': 'drag'
    };
    const toastCategory = toastCategoryMap[type];
    if (toastCategory) {
      this.showToast(undefined, { category: toastCategory });
    }
  }

  // ============================================================================
  // 窗口控制
  // ============================================================================

  /** 行走到目标位置 */
  async walkTo(x: number, y: number, speed?: number): Promise<void> {
    if (this.windowController) {
      await this.windowController.walkTo(x, y, speed);
    }
  }

  /** 停止行走 */
  stopWalk(): void {
    if (this.windowController) {
      this.windowController.stopWalk();
    }
  }

  /** 获取窗口位置 */
  getPosition(): [number, number] {
    if (this.windowController) {
      return this.windowController.getPosition();
    }
    const bounds = this.win.getBounds();
    return [bounds.x, bounds.y];
  }

  /** 设置窗口位置 */
  setPosition(x: number, y: number): void {
    if (this.windowController) {
      this.windowController.setPosition(x, y);
    } else {
      this.win.setPosition(Math.round(x), Math.round(y));
    }
  }

  /** 开始拖拽 */
  startDrag(offsetX: number, offsetY: number): void {
    this.stopWalk();
    this.transitionTo('dragging');
    if (this.windowController) {
      this.windowController.startDrag(offsetX, offsetY);
    }
    this.eventBus.emit('interact:drag:start', { offsetX, offsetY }, 'sprite-manager');
    this.showToast(undefined, { category: 'hold' });
  }

  /** 结束拖拽 */
  endDrag(): void {
    if (this.windowController) {
      this.windowController.endDrag();
    }
    this.transitionTo('idle');
    this.eventBus.emit('interact:drag:end', undefined, 'sprite-manager');
  }

  // ============================================================================
  // 动画管理
  // ============================================================================

  /** 获取当前动画 */
  getCurrentAnimation(): SpritePlayCommand | null {
    return this.currentAnimation;
  }

  /** 获取动画列表 (AnimationRegistry) */
  getAnimationList(): AnimationEntry[] {
    return this.animationRegistry.getAll();
  }

  /** 按 trigger 查找最佳动画 */
  findAnimationByTrigger(trigger: SpriteAnimationTrigger): AnimationEntry | undefined {
    return this.animationRegistry.findByTrigger({
      trigger,
      personaState: this.personaState.getState()
    });
  }

  /** 注册动画到 Registry */
  registerAnimation(anim: SpriteAnimation): void {
    const eventTypes = getSpriteAnimationTriggers(anim.meta);
    this.animationRegistry.register({
      id: anim.meta.id,
      title: anim.meta.title,
      description: anim.meta.description,
      eventTypes: eventTypes.length > 0 ? eventTypes : ['idle'],
      priority: anim.meta.priority,
      condition: compileSpriteAnimationCondition(anim.meta.condition),
      source: anim.source,
      playback: {
        width: anim.width,
        height: anim.height,
        padding: anim.padding,
        loop: anim.loop,
        loopStartMs: anim.loopStartMs,
        loopEndMs: anim.loopEndMs,
        durationMs: anim.durationMs,
        autoIdle: anim.autoIdle,
        movement: anim.movement
      },
      tags: anim.meta.tags,
      deletable: anim.meta.deletable,
      coverSrc: anim.meta.coverSrc
    });
  }

  /** 批量注册动画 */
  registerAnimations(anims: SpriteAnimation[]): void {
    for (const anim of anims) {
      this.registerAnimation(anim);
    }
  }

  /** 用一整组动画替换当前注册表，并按当前状态刷新播放态 */
  replaceAnimations(anims: SpriteAnimation[], options?: { refreshCurrentState?: boolean }): void {
    this.animationRegistry.clear();
    this.currentAnimation = null;
    this.registerAnimations(anims);

    if (options?.refreshCurrentState !== false) {
      this.transitionTo(this.getState(), {
        subState: this.getSubState() ?? undefined,
        force: true
      });
    }
  }

  /** 注销动画 */
  unregisterAnimation(id: string): void {
    this.animationRegistry.unregister(id);
  }

  // ============================================================================
  // 配置
  // ============================================================================

  /** 获取精灵配置 */
  getSpriteConfig(): SpriteConfig {
    return {
      ...this.spriteConfig,
      autoWalkEnabled: this.autoWalkConfig.enabled
    };
  }

  /** 设置精灵配置 */
  setSpriteConfig(config: Partial<SpriteConfig>): void {
    const { autoWalkEnabled, ...restConfig } = config;
    Object.assign(this.spriteConfig, restConfig);
    if (typeof autoWalkEnabled === 'boolean') {
      this.autoWalkConfig.enabled = autoWalkEnabled;
      if (!autoWalkEnabled) {
        this.stopWalk();
      }
    }
    this.emitConfigChanged();
  }

  /** 自动行走是否启用 */
  isAutoWalkEnabled(): boolean {
    return this.autoWalkConfig.enabled;
  }

  private canUseMovement(): boolean {
    const movementCapability = getSpriteCapabilityRuntimeState('movement');
    return movementCapability !== null && movementCapability.status !== 'locked' && !this.isMovementSuspended();
  }

  private getAutoWalkBlockReason(): string | null {
    if (!this.autoWalkConfig.enabled) return 'auto-walk-disabled';
    if (!this.windowController) return 'window-controller-unavailable';
    const movementCapability = getSpriteCapabilityRuntimeState('movement');
    if (!movementCapability || movementCapability.status === 'locked') return 'movement-locked';
    if (this.isMovementSuspended()) return 'movement-suspended';
    return null;
  }

  private isMovementSuspended(): boolean {
    return this.movementSuspensionReasons.size > 0;
  }

  private setMovementSuspended(reason: string, suspended: boolean): void {
    const hadReason = this.movementSuspensionReasons.has(reason);
    if (suspended) {
      this.movementSuspensionReasons.add(reason);
    } else {
      this.movementSuspensionReasons.delete(reason);
    }

    if (suspended && !hadReason) {
      this.stopWalk();
      this.stopAutoMove();
    }
  }

  /** 设置自动行走开关 */
  setAutoWalkEnabled(enabled: boolean): void {
    const changed = this.autoWalkConfig.enabled !== enabled;
    this.autoWalkConfig.enabled = enabled;
    if (!enabled) {
      this.stopWalk();
    }
    if (changed) {
      this.emitConfigChanged();
    }
  }

  /** 获取是否显示调试辅助线 */
  isDebugOverlayEnabled(): boolean {
    return this.spriteConfig.showDebugOverlay ?? false;
  }

  /** 设置调试辅助线开关 */
  setDebugOverlayEnabled(enabled: boolean): void {
    this.spriteConfig.showDebugOverlay = enabled;
    this.emitConfigChanged();
  }

  /** 预览窗口移动效果（临时应用尺寸和移动配置） */
  previewMovement(config: SpriteMovementPreviewConfig): void {
    this.movementCoordinator.previewMovement(config);
  }

  /** 停止移动预览 */
  stopMovementPreview(): void {
    this.movementCoordinator.stopMovementPreview();
  }

  /** 获取初始全量状态 */
  getInitialState(): SpriteInitialState {
    return {
      state: this.getState(),
      subState: this.getSubState(),
      personaState: this.personaState.getState(),
      animations: this.animationRegistry.getAll() as any,
      currentAnimation: this.currentAnimation,
      config: this.getSpriteConfig()
    };
  }

  // ============================================================================
  // 动画完成处理
  // ============================================================================

  /** 处理渲染进程上报的动画播放完成 */
  handleAnimationComplete(animId: string, phase: SpriteAnimationCompletionPhase, playId?: string): void {
    this.eventBus.emit('anim:complete', { animId, phase, playId }, 'renderer');

    if (playId && (phase === 'full' || phase === 'outro')) {
      this.resolveAnimationCompletionWaiter(playId);
    }

    // 动画播放完成时停止自动移动
    const isCurrentAnimation = this.isCurrentAnimationCompletion(animId, playId);
    if ((phase === 'full' || phase === 'outro') && isCurrentAnimation) {
      this.stopAutoMove();
    }

    if (phase !== 'outro' && phase !== 'full') {
      return;
    }

    const autoIdle = this.shouldAutoIdleAfterComplete(animId, playId);

    if (!autoIdle) {
      if (isCurrentAnimation) {
        this._pendingIdleAfterOutro = false;
      }
      return;
    }

    if (!isCurrentAnimation && !this._pendingIdleAfterOutro) {
      return;
    }

    if (!isCurrentAnimation && playId && this.currentAnimation?.playId && playId !== this.currentAnimation.playId) {
      return;
    }

    if (this._pendingIdleAfterOutro) {
      this._pendingIdleAfterOutro = false;
    }

    this.transitionToIdleAnimation();
  }

  /** 处理文件拖放 */
  handleFileDrop(files: any[]): void {
    this.reportInteraction('file-drop', { fileCount: files.length });
    const names = files.map((f: any) => f.name).filter(Boolean);
    this.showToast(undefined, {
      category: 'fileDrop',
      ctx: {
        count: files.length,
        names,
        singleName: files.length === 1 ? names[0] : undefined
      }
    });
  }

  /** 渲染进程就绪 */
  handleRendererReady(): void {
    const initial = this.getInitialState();
    this.sendToRenderer('sprite:state', {
      state: initial.state,
      subState: initial.subState,
      personaSnapshot: initial.personaState
    });

    if (initial.currentAnimation) {
      this.sendToRenderer('sprite:play', initial.currentAnimation);
    }

    if (!this._welcomeSent) {
      this._welcomeSent = true;
      setTimeout(() => {
        this.trigger('welcome');
      }, 500);
    }
  }

  // ============================================================================
  // 行为注册
  // ============================================================================

  /** 注册自定义行为 */
  registerBehavior(behavior: BehaviorDefinition): void {
    this.behaviorEngine.register(behavior);
    if (this.behaviorSchedulerStarted) {
      this.scheduleBehavior(behavior);
    }
  }

  /** 注销自定义行为 */
  unregisterBehavior(id: string): void {
    this.behaviorEngine.unregister(id);
    this.unscheduleBehavior(id);
  }

  private bindBehaviorScheduler(): void {
    if (!this.behaviorScheduler) return;

    this.unbindBehaviorSchedulerHandler = this.behaviorScheduler.registerHandler<SpriteBehaviorSchedulerPayload>(SPRITE_BEHAVIOR_SCHEDULER_OWNER, async (context) => {
      const behaviorId = context.payload?.behaviorId;
      if (!behaviorId) return;

      const result = await this.behaviorEngine.tryRunBehavior(behaviorId, {
        now: context.triggeredAt,
        ignoreSchedule: true,
        force: context.force === true
      });
      if (result.error) {
        return { status: 'failed' as const, error: result.error };
      }
      if (!result.triggered) {
        return { status: 'skipped' as const, reason: result.skippedReason ?? 'behavior-skipped' };
      }
      return { status: 'success' as const };
    });

    this.unbindBehaviorSchedulerGate = this.behaviorScheduler.registerGate<SpriteBehaviorSchedulerPayload>(SPRITE_AUTO_MOVE_SCHEDULER_GATE, () => {
      const reason = this.getAutoWalkBlockReason();
      return reason ? { accepted: false, reason } : true;
    });
  }

  private startBehaviorScheduler(): void {
    if (!this.behaviorScheduler) return;

    this.behaviorSchedulerStarted = true;
    this.behaviorScheduler.start();
    for (const definition of this.behaviorEngine.getDefinitions()) {
      this.scheduleBehavior(definition);
    }
  }

  private stopBehaviorScheduler(): void {
    if (!this.behaviorSchedulerStarted) return;
    this.behaviorSchedulerStarted = false;

    for (const jobId of this.behaviorSchedulerJobIds) {
      this.behaviorScheduler?.remove(jobId);
    }
    this.behaviorSchedulerJobIds.clear();
  }

  private scheduleBehavior(definition: BehaviorDefinition): void {
    if (!this.behaviorScheduler) return;

    const schedule = this.toSchedulerSpec(definition);
    if (!schedule) return;

    const jobId = this.buildBehaviorSchedulerJobId(definition.id);
    this.behaviorSchedulerJobIds.add(jobId);
    this.behaviorScheduler.upsert<SpriteBehaviorSchedulerPayload>({
      id: jobId,
      owner: SPRITE_BEHAVIOR_SCHEDULER_OWNER,
      name: definition.name,
      enabled: definition.enabled,
      schedule,
      payload: {
        behaviorId: definition.id
      },
      runPolicy: {
        singletonKey: jobId,
        maxConcurrent: 1,
        misfire: 'skip'
      },
      ...(definition.id === 'auto-walk'
        ? {
            admission: {
              customGate: SPRITE_AUTO_MOVE_SCHEDULER_GATE
            }
          }
        : {})
    });
  }

  private unscheduleBehavior(id: string): void {
    if (!this.behaviorScheduler) return;
    const jobId = this.buildBehaviorSchedulerJobId(id);
    this.behaviorScheduler.remove(jobId);
    this.behaviorSchedulerJobIds.delete(jobId);
  }

  private toSchedulerSpec(definition: BehaviorDefinition): SpriteSchedulerScheduleSpec | null {
    const schedule = definition.schedule;
    if (schedule.type === 'random') {
      return {
        kind: 'randomInterval',
        minMs: Math.max(1, schedule.minMs ?? 1000),
        maxMs: Math.max(schedule.minMs ?? 1000, schedule.maxMs ?? schedule.minMs ?? 1000)
      };
    }

    return {
      kind: 'interval',
      everyMs: Math.max(1, schedule.intervalMs ?? 60_000)
    };
  }

  private buildBehaviorSchedulerJobId(behaviorId: string): string {
    return `sprite.behavior:${behaviorId}`;
  }

  getSpontaneousUtteranceExecutor(): SpriteSpontaneousUtteranceExecutor | undefined {
    return this.spontaneousUtteranceExecutor;
  }

  // ============================================================================
  // Purpose / Routine 编排
  // ============================================================================

  /** 启动一个目的。第一阶段用于预设 Routine，不接管 BehaviorEngine 调度。 */
  startPurpose(request: StartSpritePurposeRequest): Promise<SpritePurposeStartResult> {
    return this.purposeManager.start(request);
  }

  /** 取消当前或指定目的。 */
  cancelPurpose(purposeId?: string, reason?: string): Promise<boolean> {
    return this.purposeManager.cancel(purposeId, reason);
  }

  /** 获取当前目的与 routine 快照。 */
  getPurposeSnapshot(): SpritePurposeSnapshot {
    return this.purposeManager.getSnapshot();
  }

  /** 上报供 Routine 等待的 purpose event。 */
  emitPurposeEvent(input: SpritePurposeRuntimeEventInput): { matched: number } {
    const matched = this.purposeEventWaiter.emit(input);
    return { matched };
  }

  /** 查询 Purpose/Routine 历史记录。 */
  listPurposeHistory(query?: SpritePurposeHistoryQuery): Promise<SpritePurposeHistoryEntry[]> {
    return this.purposeHistory.list(query);
  }

  /** 生成指定日期的 Purpose/Routine 复盘摘要。 */
  getPurposeDailyRetrospective(query?: SpritePurposeRetrospectiveQuery): Promise<SpritePurposeDailyRetrospective> {
    return this.purposeHistory.getDailyRetrospective(query);
  }

  // ============================================================================
  // 事件系统
  // ============================================================================

  /** 订阅事件 */
  on(event: string, handler: (event: any) => void): () => void {
    return this.eventBus.on(event as any, handler);
  }

  /** 发射事件 */
  emit(event: string, payload?: any): void {
    this.eventBus.emit(event as any, payload, 'external');
  }

  // ============================================================================
  // WindowController 注入 (Step 2 调用)
  // ============================================================================

  /** 注入 WindowController 实例 */
  setWindowController(controller: any): void {
    this.windowController = controller;
  }

  setMovementAvoidRegions(regions: WindowControllerAvoidRegion[]): void {
    this.windowController?.setAvoidRegions?.(regions);
  }

  /** 统一 behavior movement 入口 */
  runBehaviorMovement(movement?: SpriteMovementConfig, options?: { hasSegmentLoop?: boolean }): Promise<boolean> {
    return this.movementCoordinator.runBehaviorMovement(movement, options);
  }

  // ============================================================================
  // 内部方法
  // ============================================================================

  /** 状态机变化回调 */
  private onStateChange(newState: SpriteState, _oldState: SpriteState, subState: SpriteReactionState | null): void {
    if (newState === 'idle' && _oldState !== 'idle' && this.currentAnimation?.playback?.loopStartMs != null && this.currentAnimation?.playback?.loopEndMs != null) {
      const autoIdle = this.currentAnimation?.playback?.autoIdle ?? true;
      this._pendingIdleAfterOutro = autoIdle;
      this.broadcastState();
      if (autoIdle) {
        setTimeout(() => {
          if (this._pendingIdleAfterOutro) {
            this._pendingIdleAfterOutro = false;
            this.transitionToIdleAnimation();
          }
        }, 3000);
      }
      return;
    }

    this._pendingIdleAfterOutro = false;
    this.resolveAndSendAnimation(newState, subState, this.getStateDrivenPresentationOptions());

    this.broadcastState();
  }

  private isCurrentAnimationCompletion(animId: string, playId?: string): boolean {
    if (this.currentAnimation?.animationId !== animId) {
      return false;
    }

    if (!playId || !this.currentAnimation.playId) {
      return true;
    }

    return this.currentAnimation.playId === playId;
  }

  private shouldAutoIdleAfterComplete(animId: string, playId?: string): boolean {
    if (this.isCurrentAnimationCompletion(animId, playId)) {
      return this.currentAnimation?.playback?.autoIdle ?? true;
    }

    return this.animationRegistry.get(animId)?.playback?.autoIdle ?? true;
  }

  private transitionToIdleAnimation(): void {
    const isAlreadyIdle = this.getState() === 'idle' && this.getSubState() == null;
    this.transitionTo('idle', { force: isAlreadyIdle });
  }

  /** 根据当前状态解析并发送动画指令到渲染进程 */
  private resolveAndSendAnimation(state: SpriteState, subState: SpriteReactionState | null, options?: SpriteTriggerOptions): void {
    const trigger = mapStateToEventType(state, subState);
    const animEntry = this.animationRegistry.findByTrigger({
      trigger,
      personaState: this.personaState.getState(),
      allowFallback: true
    });

    if (animEntry && this.canPresentAnimation(options)) {
      this.currentAnimation = {
        animationId: animEntry.id,
        source: animEntry.source,
        playback: animEntry.playback
          ? {
            width: animEntry.playback.width,
            height: animEntry.playback.height,
            padding: animEntry.playback.padding,
            loop: animEntry.playback.loop,
            loopStartMs: animEntry.playback.loopStartMs,
            loopEndMs: animEntry.playback.loopEndMs,
            durationMs: animEntry.playback.durationMs,
            autoIdle: animEntry.playback.autoIdle,
            movement: animEntry.playback.movement
          }
          : undefined
      };

      if (animEntry.playback) {
        const pb = animEntry.playback;
        if (pb.width != null) this.spriteConfig.width = pb.width;
        if (pb.height != null) this.spriteConfig.height = pb.height;
        if (pb.padding != null) this.spriteConfig.padding = pb.padding;
      }

      this.sendToRenderer('sprite:play', this.currentAnimation);

      // 启动自动移动
      this.handleAnimationMovement(animEntry.playback?.movement);
    }
  }

  /** 人格状态变化回调 (节流: 每秒最多 1 次) */
  private onPersonaStateChange(): void {
    this.persistence.markDirty();

    const now = Date.now();
    if (now - this.lastStateBroadcast >= 1000) {
      this.lastStateBroadcast = now;
      this.broadcastState();
    } else if (!this.stateBroadcastTimer) {
      this.stateBroadcastTimer = setTimeout(
        () => {
          this.stateBroadcastTimer = null;
          this.lastStateBroadcast = Date.now();
          this.broadcastState();
        },
        1000 - (now - this.lastStateBroadcast)
      );
    }
  }

  /** 广播状态快照到渲染进程 */
  private broadcastState(): void {
    const snapshot: SpriteStateSnapshot = {
      state: this.getState(),
      subState: this.getSubState(),
      personaSnapshot: this.personaState.getState()
    };
    this.sendToRenderer('sprite:state', snapshot);
  }

  /** 处理动画播放时的窗口自动移动 */
  private handleAnimationMovement(movement?: SpriteMovementConfig): void {
    this.movementCoordinator.applyAnimationMovement(movement);
  }

  /** 停止自动移动 */
  private stopAutoMove(): void {
    this.movementCoordinator.stopAutoMove();
  }

  private createAnimationPlayId(ownerId: string): string {
    this.animationPlayCounter += 1;
    return `${ownerId}:play-${Date.now()}-${this.animationPlayCounter}`;
  }

  private resolveRoutinePriority(routine: SpriteRoutine): number {
    const currentPurpose = this.purposeManager.getSnapshot().current;
    if (currentPurpose?.id === routine.purposeId) {
      return currentPurpose.priority;
    }
    return routine.priority ?? 50;
  }

  private acquireRoutinePresentationLock(purpose: SpritePurpose, routine: SpriteRoutine): void {
    const ttlMs = this.estimateRoutinePresentationLockTtlMs(routine);
    const acquired = this.presentationLock.acquire(purpose.id, purpose.priority, ttlMs, `routine:${routine.id}:lifecycle`);
    if (!acquired) {
      return;
    }

    this.activeRoutinePresentationOwner = {
      ownerId: purpose.id,
      priority: purpose.priority
    };
  }

  private releaseRoutinePresentationLock(purposeId: string): void {
    const released = this.presentationLock.release(purposeId);
    if (this.activeRoutinePresentationOwner?.ownerId === purposeId) {
      this.activeRoutinePresentationOwner = null;
    }

    if (released) {
      const snapshot = this.purposeManager.getSnapshot();
      if (snapshot.current && snapshot.routine && snapshot.current.id !== purposeId) {
        this.acquireRoutinePresentationLock(snapshot.current, snapshot.routine);
        return;
      }

      this.resolveAndSendAnimation(this.getState(), this.getSubState(), { ignorePresentationLock: true });
    }
  }

  private estimateRoutinePresentationLockTtlMs(routine: SpriteRoutine): number {
    const totalMs = routine.steps.reduce((sum, step) => sum + this.estimateRoutineStepPresentationMs(step), 0);
    return Math.min(Math.max(totalMs + 2000, 1000), 10 * 60 * 1000);
  }

  private estimateRoutineStepPresentationMs(step: SpriteRoutineStep): number {
    switch (step.type) {
      case 'wait':
        return step.durationMs;
      case 'waitForEvent':
        return step.timeoutMs ?? 30000;
      case 'playAnimation':
        return step.timeoutMs ?? step.durationMs ?? 3000;
      case 'walkTo':
        return step.timeoutMs ?? 10000;
      case 'speak':
        return step.timeoutMs ?? step.bubbleDuration ?? 4000;
      case 'showToast':
        return step.duration ?? 3000;
      case 'showBusy':
        return 10000;
      case 'updateBusy':
        return 500;
      case 'clearBusy':
        return 500;
      case 'openWindow':
        return step.timeoutMs ?? 30000;
      case 'loopUntil':
        return (
          step.maxDurationMs ??
          Math.max(
            1000,
            step.body.reduce((sum, child) => sum + this.estimateRoutineStepPresentationMs(child), 0)
          )
        );
      case 'branch': {
        const branches = [...Object.values(step.cases), step.default ?? []];
        return Math.max(500, ...branches.map((steps) => steps.reduce((sum, child) => sum + this.estimateRoutineStepPresentationMs(child), 0)));
      }
      default:
        return 1000;
    }
  }

  private shouldAcquirePurposeStepLock(routine: SpriteRoutine): boolean {
    return this.activeRoutinePresentationOwner?.ownerId !== routine.purposeId;
  }

  private async recordPurposeStepEvent(
    eventType: Extract<SpritePurposeEventType, 'step:started' | 'step:completed' | 'step:timeout' | 'step:cancelled' | 'step:skipped' | 'step:failed'>,
    routine: SpriteRoutine,
    step: SpriteRoutineStep,
    result?: {
      status?: string;
      elapsedMs?: number;
      value?: unknown;
      error?: string;
    }
  ): Promise<void> {
    const currentPurpose = this.purposeManager.getSnapshot().current;
    const resultPayload: Record<string, unknown> | undefined = result
      ? {
        elapsedMs: result.elapsedMs,
        value: result.value,
        stepType: step.type
      }
      : { stepType: step.type };

    await this.purposeHistory.append({
      timestamp: Date.now(),
      eventType,
      purposeId: routine.purposeId,
      routineId: routine.id,
      stepId: step.id,
      purposeKind: currentPurpose?.id === routine.purposeId ? currentPurpose.kind : undefined,
      priority: routine.priority,
      source: routine.source,
      status: result?.status ?? 'running',
      result: resultPayload,
      error: result?.error
    });
  }

  private waitForAnimationCompletion(playId: string, timeoutMs: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Routine cancelled'));
        return;
      }

      let cleanup = (): void => undefined;
      const onAbort = (): void => {
        cleanup();
        reject(new Error('Routine cancelled'));
      };
      const timer = setTimeout(
        () => {
          cleanup();
          resolve();
        },
        Math.max(0, timeoutMs)
      );

      cleanup = (): void => {
        clearTimeout(timer);
        this.animationCompletionWaiters.delete(playId);
        signal?.removeEventListener('abort', onAbort);
      };

      this.animationCompletionWaiters.set(playId, {
        timer,
        resolve: () => {
          cleanup();
          resolve();
        }
      });
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private resolveAnimationCompletionWaiter(playId: string): void {
    this.animationCompletionWaiters.get(playId)?.resolve();
  }

  private async runPurposeAnimationStep(step: Extract<SpriteRoutineStep, { type: 'playAnimation' }>, signal: AbortSignal, routine: SpriteRoutine): Promise<void> {
    const playId = this.createAnimationPlayId(routine.purposeId);
    const priority = this.resolveRoutinePriority(routine);
    const waitBudgetMs = Math.max(0, step.timeoutMs ?? step.durationMs ?? 1200);
    const lockAcquired = this.shouldAcquirePurposeStepLock(routine) ? this.presentationLock.acquire(routine.purposeId, priority, waitBudgetMs + 500, `routine:${routine.id}:${step.id}`) : false;

    try {
      if (step.animationId) {
        this.triggerById(step.animationId, {
          durationMs: step.durationMs,
          silent: step.silent ?? true,
          playId,
          ownerPurposeId: routine.purposeId,
          priority
        });
      } else if (step.trigger) {
        this.trigger(step.trigger, {
          durationMs: step.durationMs,
          silent: step.silent ?? true,
          playId,
          ownerPurposeId: routine.purposeId,
          priority
        });
      }

      if (step.waitFor === 'none') {
        return;
      }

      const played = this.currentAnimation?.playId === playId;
      if (step.waitFor === 'complete' && played) {
        await this.waitForAnimationCompletion(playId, waitBudgetMs, signal);
        return;
      }

      const durationMs = Math.max(0, step.durationMs ?? step.timeoutMs ?? 1200);
      await this.delayForPurpose(durationMs, signal);
    } finally {
      if (lockAcquired) {
        this.presentationLock.release(routine.purposeId);
      }
    }
  }

  private async runPurposeWalkStep(step: Extract<SpriteRoutineStep, { type: 'walkTo' }>, signal: AbortSignal, routine: SpriteRoutine): Promise<void> {
    const priority = this.resolveRoutinePriority(routine);
    const lockTtlMs = Math.max(1000, step.timeoutMs ?? 8000);
    const lockAcquired = this.shouldAcquirePurposeStepLock(routine) ? this.presentationLock.acquire(routine.purposeId, priority, lockTtlMs, `routine:${routine.id}:${step.id}`) : false;
    const [x, y] = this.resolvePurposeWalkTarget(step.target);
    try {
      const walk = this.withStateDrivenPresentationOwner({ ownerId: routine.purposeId, priority }, () => this.walkTo(x, y, step.speed));
      if (step.timeoutMs == null) {
        await this.racePurposeSignal(walk, signal);
        return;
      }
      await this.racePurposeSignal(
        Promise.race([
          walk,
          this.delayForPurpose(step.timeoutMs, signal).then(() => {
            this.stopWalk();
            throw new Error('Walk step timed out');
          })
        ]),
        signal
      );
    } finally {
      if (lockAcquired) {
        this.presentationLock.release(routine.purposeId);
      }
    }
  }

  private async runPurposeOpenWindowStep(step: Extract<SpriteRoutineStep, { type: 'openWindow' }>, signal: AbortSignal): Promise<void> {
    if (!this.purposeWindowAdapter) {
      throw new Error('Purpose window adapter is not configured');
    }

    await this.racePurposeSignal(Promise.resolve(this.purposeWindowAdapter.open(step.window, step.payload)), signal);
  }

  private resolvePurposeWalkTarget(target: Extract<SpriteRoutineStep, { type: 'walkTo' }>['target']): [number, number] {
    if (typeof target === 'object') {
      return [target.x, target.y];
    }

    if (target === 'previous') {
      return this.getPosition();
    }

    const screen = this.getScreenSize();
    const { width, height, padding } = this.getSpriteConfig();
    const winWidth = width + padding * 2;
    const winHeight = height + padding * 2;

    if (target === 'center') {
      return [Math.max(0, (screen.width - winWidth) / 2), Math.max(0, (screen.height - winHeight) / 2)];
    }

    return [Math.max(0, screen.width - winWidth - 20), Math.max(0, screen.height - winHeight - 40)];
  }

  private delayForPurpose(durationMs: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new Error('Routine cancelled'));
        return;
      }

      const timer = setTimeout(
        () => {
          cleanup();
          resolve();
        },
        Math.max(0, durationMs)
      );
      const onAbort = (): void => {
        cleanup();
        reject(new Error('Routine cancelled'));
      };
      const cleanup = (): void => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  private racePurposeSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) {
      return promise;
    }
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        if (signal.aborted) {
          reject(new Error('Routine cancelled'));
          return;
        }
        signal.addEventListener('abort', () => reject(new Error('Routine cancelled')), { once: true });
      })
    ]);
  }

  private syncPersonaRules(snapshot = getPersonaRulesSnapshot()): void {
    this.personaState.setXPSources(snapshot.xpSources);
    this.personaState.setFavorModifiers(snapshot.favorModifiers);
    this.personaState.setMoodRules(snapshot.moodRules);
  }

  private setSpriteMetrics(metrics: Pick<SpriteConfig, 'width' | 'height' | 'padding'>): void {
    this.spriteConfig.width = metrics.width;
    this.spriteConfig.height = metrics.height;
    this.spriteConfig.padding = metrics.padding;
  }

  /** 发送统一配置快照 */
  private emitConfigChanged(): void {
    this.sendToRenderer('sprite:config', this.getSpriteConfig());
  }

  /** 安全发送 IPC 到渲染进程 */
  private sendToRenderer(channel: string, data: any): void {
    try {
      if (this.win && !this.win.isDestroyed()) {
        this.win.webContents.send(channel, data);
      }
    } catch {
      /* ignore */
    }
  }

  /** 构建行为引擎上下文 */
  private buildBehaviorContext(): BehaviorContext {
    const screenSize = this.getScreenSize();
    const position = this.getPosition();

    return {
      spriteState: this.stateMachine.getState(),
      personaState: this.personaState.getState(),
      interactionStats: this.interactionTracker.getStats(),
      now: new Date(),
      screenSize,
      position
    };
  }

  /** 获取持久化用的状态行 */
  private getPersonaStateForPersistence(): PersonaStatePersistenceRow {
    const state = this.personaState.getState();
    return {
      id: this.activePersonaStateId,
      version: 2,
      name: state.name,
      description: state.description,
      xp: state.xp,
      level: state.level,
      favor: state.favor,
      mood: state.mood,
      moodIntensity: state.moodIntensity,
      totalInteractions: state.totalInteractions,
      totalSessionTime: state.totalSessionTime,
      loginStreak: state.loginStreak,
      lastLoginDate: state.lastLoginDate,
      achievements: [...state.achievements],
      dimensions: { ...state.dimensions },
      createdAt: state.createdAt,
      updatedAt: state.updatedAt
    };
  }

  private buildDefaultPersonaState(): Partial<PersonaState> {
    const now = Date.now();
    return {
      name: this.activePersonaIdentity.name,
      ...(this.activePersonaIdentity.description !== undefined ? { description: this.activePersonaIdentity.description } : {}),
      xp: 0,
      level: 1,
      xpToNextLevel: 100,
      favor: 50,
      favorLevel: 'friend',
      mood: 'neutral',
      moodIntensity: 50,
      totalInteractions: 0,
      totalSessionTime: 0,
      loginStreak: 0,
      lastLoginDate: '',
      achievements: [],
      dimensions: {},
      createdAt: now,
      updatedAt: now
    };
  }
}
