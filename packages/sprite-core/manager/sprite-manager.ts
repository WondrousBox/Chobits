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
import { getCharacterCategoryText, getCharacterSpriteEventText } from '../messages/character';
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
  type SpritePurposeRuntimeEvent,
  type SpritePurposeRuntimeEventInput,
  type SpritePurposeSnapshot,
  type SpritePurposeStartResult,
  type SpriteRoutine,
  SpriteRoutineRunner,
  type SpriteRoutineStep,
  type StartSpritePurposeRequest
} from '../purpose';
import { SpeakService, type SpriteRealtimeSpeechSession } from '../speak/speak-service';
import type {
  SpeakResult,
  SpriteRealtimeSpeechAvailabilityRequest,
  SpriteRealtimeSpeechEvent,
  SpriteRealtimeSpeechSessionRequest,
  SpriteSpeakConfig,
  SpriteSpeakPayload,
  SpriteSpeakPlaybackContext
} from '../speak/types';
import type { SpriteReactionState, SpriteState } from '../state-machine';
import { SpriteStateMachine } from '../state-machine';
import {
  compileSpriteAnimationCondition,
  DEFAULT_SPRITE_ANIMATION_PLAYLIST_MODE,
  getSpriteAnimationTriggers,
  isBubbleWindowMode,
  MESSAGE_IPC_CHANNELS,
  type MessageBridgeClearPayload,
  type MessageBridgePayload,
  type MessageBridgeTarget,
  type MessageCategory,
  type MessageIPCPayload,
  normalizeSpriteAnimationPlaylistMode,
  normalizeSpriteAnimationPlaylistModeMap,
  normalizeSpriteBubbleMode,
  type SpriteAnimation,
  type SpriteAnimationPlaylistMode,
  type SpriteAnimationTrigger,
  type SpriteBubbleMode,
  type SpriteConfig,
  type SpriteFeedbackRequest,
  type SpriteFeedbackResult,
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
import { AutoWalkConfig, BubbleModeConfig, PersonaStatePersistence } from './persistence';
import { mapStateToEventType } from './state-mapping';
import type {
  PersonaStatePersistenceRow,
  SpriteAmbientMessageContext,
  SpriteBehaviorScheduler,
  SpriteManagerOptions,
  SpritePurposeWindowAdapter,
  SpriteSchedulerScheduleSpec,
  SpriteSpontaneousUtteranceExecutor,
  SpriteWindow,
  SpriteWindowAnimationPlaybackSize
} from './types';

// ============================================================================
// SpriteManager 实现
// ============================================================================

type SpriteAnimationCompletionPhase = 'intro' | 'loop' | 'outro' | 'full';

interface SpriteAnimationCompletionWaiter {
  resolve: () => void;
  timer: ReturnType<typeof setTimeout>;
}

interface RendererDeliveryResult {
  primarySent: boolean;
  recipientCount: number;
}

interface SpritePresentationOwnerContext {
  ownerId: string;
  priority: number;
}

interface ActiveAnimationPlaylist {
  trigger: SpriteAnimationTrigger;
  mode: SpriteAnimationPlaylistMode;
  entries: AnimationEntry[];
  currentIndex: number;
  sessionMode: 'state-bound' | 'trigger';
  durationMs?: number;
  playId?: string;
  presentationOwner?: SpritePresentationOwnerContext | null;
}

interface PlayAnimationEntryOptions {
  trigger?: SpriteAnimationTrigger;
  playlistMode: SpriteAnimationPlaylistMode;
  playlistEntries?: AnimationEntry[];
  playlistIndex?: number;
  sessionMode: 'state-bound' | 'trigger';
  durationMs?: number;
  playId?: string;
  allowMovementDuringPlayback?: boolean;
  presentationOwner?: SpritePresentationOwnerContext | null;
}

type SpriteSpeechPlaybackOptions = {
  talkDurationMs?: number;
  ownerPurposeId?: string;
  priority?: number;
  ignorePresentationLock?: boolean;
};

type SpritePlaybackMetrics = Pick<SpriteConfig, 'width' | 'height' | 'padding'>;

interface SpriteBehaviorSchedulerPayload {
  behaviorId: string;
}

interface SpriteFileDropPayloadItem {
  name?: string;
  path?: string;
}

interface SpriteFileDropOptions {
  correlationId?: string;
}

const SPRITE_BEHAVIOR_SCHEDULER_OWNER = 'sprite.behavior';
const SPRITE_AUTO_MOVE_SCHEDULER_GATE = 'sprite.canAutoMove';
const SPRITE_TRIGGER_DEBUG_PREFIX = '[SpriteManager][trigger]';
const MUSIC_DANCE_TRIGGER = 'music:dance' as SpriteAnimationTrigger;
const MUSIC_DANCE_FALLBACK_TRIGGER = 'dance' as SpriteAnimationTrigger;
const PLAYLIST_LOOP_FALLBACK_COUNT = 1;
const DEFAULT_ANIMATION_PLAYBACK_METRICS: SpritePlaybackMetrics = {
  width: 180,
  height: 240,
  padding: 100
};

export class SpriteManager {
  // 内部引擎实例
  private eventBus: SpriteEventBus;
  private stateMachine: SpriteStateMachine;
  private personaState: PersonaStateManager;
  private interactionTracker: InteractionTracker;
  private behaviorEngine: BehaviorEngine;
  private behaviorScheduler?: SpriteBehaviorScheduler;
  private shouldSuppressAmbientMessages?: SpriteManagerOptions['shouldSuppressAmbientMessages'];
  private behaviorSchedulerStarted = false;
  private behaviorSchedulerJobIds = new Set<string>();
  private unbindBehaviorSchedulerHandler: (() => void) | null = null;
  private unbindBehaviorSchedulerGate: (() => void) | null = null;
  private animationRegistry: AnimationRegistry;
  private purposeManager: SpritePurposeManager;
  private purposeEventWaiter: SpritePurposeEventWaiter;
  private purposeHistory: SpritePurposeHistoryStore;
  private purposeWindowAdapter?: SpritePurposeWindowAdapter;
  private windowAnimationAdapter?: SpriteManagerOptions['windowAnimationAdapter'];

  // 内建持久化
  private persistence: PersonaStatePersistence;
  private autoWalkConfig: AutoWalkConfig;
  private bubbleModeConfig: BubbleModeConfig;
  private movementSuspensionReasons = new Set<string>();
  private animationMovementSuspensionReasons = new Map<string, string>();

  // 额外消息/配置接收方（如顶部气泡 / spriteEffect 窗口）
  private getMessageRecipients?: () => Array<SpriteWindow | null | undefined>;
  private ensureMessageRecipients?: () => Promise<void> | void;
  private getConfigRecipients?: () => Array<SpriteWindow | null | undefined>;

  // 语音合成服务
  private speakService: SpeakService;
  private realtimeSpeechTalkSessions = new Set<string>();
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
  private activeAnimationPlaylist: ActiveAnimationPlaylist | null = null;
  private currentAnimationPresentationOwner: SpritePresentationOwnerContext | null = null;
  private animationPlayCounter = 0;
  private animationCompletionWaiters = new Map<string, SpriteAnimationCompletionWaiter>();
  private presentationLock = new SpritePresentationLock();
  private activeRoutinePresentationOwner: SpritePresentationOwnerContext | null = null;
  private stateDrivenPresentationOwner: SpritePresentationOwnerContext | null = null;
  private spriteConfig: SpriteConfig = { width: 200, height: 200, padding: 100, animationPlaylistMode: DEFAULT_SPRITE_ANIMATION_PLAYLIST_MODE, showDebugOverlay: false };
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
  private pendingIdlePresentationOwner: SpritePresentationOwnerContext | null = null;

  // 欢迎消息只在首次 rendererReady 时发送
  private _welcomeSent = false;

  // 单例
  private static instance: SpriteManager | null = null;

  private constructor(options: SpriteManagerOptions) {
    this.win = options.win;
    this.getScreenSize = options.getScreenSize;
    this.spontaneousUtteranceExecutor = options.spontaneousUtteranceExecutor;
    this.purposeWindowAdapter = options.purposeWindowAdapter;
    this.windowAnimationAdapter = options.windowAnimationAdapter;
    this.activePersonaIdentity = {
      name: options.appName ?? 'Chobits'
    };

    // 创建引擎实例
    this.eventBus = new SpriteEventBus();
    this.stateMachine = new SpriteStateMachine({ eventBus: this.eventBus });
    this.personaState = new PersonaStateManager({
      initialState: { name: options.appName ?? 'Chobits' },
      onStateChange: () => this.onPersonaStateChange()
    });
    this.interactionTracker = new InteractionTracker({ eventBus: this.eventBus });
    this.behaviorEngine = new BehaviorEngine({
      eventBus: this.eventBus,
      stateMachine: this.stateMachine,
      tickIntervalMs: 1000
    });
    this.behaviorScheduler = options.behaviorScheduler;
    this.shouldSuppressAmbientMessages = options.shouldSuppressAmbientMessages;
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
      emitConfigChanged: () => this.emitConfigChanged(),
      playWindowAnimation: (movement, playbackSize) =>
        this.windowAnimationAdapter?.playPreset({
          presetId: movement.windowAnimationPresetId,
          direction: movement.windowAnimationDirection,
          duration: movement.windowAnimationDuration,
          target: movement.windowAnimationTarget,
          playPosition: movement.windowAnimationPlayPosition,
          ...(playbackSize ? { playbackSize } : {})
        })
    });
    this.purposeManager = new SpritePurposeManager({
      runner: new SpriteRoutineRunner({
        playAnimation: (step, signal, routine) => this.runPurposeAnimationStep(step, signal, routine),
        walkTo: (step, signal, routine) => this.runPurposeWalkStep(step, signal, routine),
        waitForEvent: (step, signal, routine) => this.purposeEventWaiter.wait(step, routine, signal),
        speak: (step, _signal, routine) => this.runPurposeSpeakStep(step, routine),
        showToast: (step, routine) =>
          this.showToast(step.content, {
            category: step.category as MessageCategory | undefined,
            duration: step.duration,
            ownerPurposeId: routine.purposeId,
            priority: this.resolveRoutinePriority(routine)
          }),
        showNotice: (step, routine) =>
          this.showNotice(step.content, {
            id: step.messageId,
            buttons: step.buttons?.map((b) => ({
              id: b.id,
              label: b.label,
              variant: b.variant,
              // 让按钮点击能在前端被识别为 purpose-action：约定 'purpose:<action>' 格式
              action: b.purposeAction ? `purpose:${b.purposeAction}` : 'dismiss'
            })),
            duration: step.duration,
            persistent: step.persistent,
            routineId: step.routineId,
            level: step.level,
            speak: step.speak,
            ownerPurposeId: routine.purposeId,
            priority: this.resolveRoutinePriority(routine)
          }),
        clearMessage: (step) => this.clearRendererMessage({ id: step.messageId, type: step.messageType ?? 'all' }),
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
    this.bubbleModeConfig = new BubbleModeConfig(options.dataDir);

    // 额外消息接收方
    this.getMessageRecipients = options.getMessageRecipients;
    this.ensureMessageRecipients = options.ensureMessageRecipients;
    this.getConfigRecipients = options.getConfigRecipients;

    // 语音合成服务
    this.speakService = new SpeakService(options.dataDir, options.speechSynthesisExecutor, options.textTranslator);
    this.speakService.setPlayAudioCallback((payload: SpriteSpeakPayload, context?: SpriteSpeakPlaybackContext) => {
      this.triggerTalkForSpeech(payload, context);
      this.sendToRenderer('sprite:speak', payload);
    });
    this.speakService.setRealtimeSpeechEventCallback((sessionId, event) => {
      if (event.type === 'audio_delta' && !this.realtimeSpeechTalkSessions.has(sessionId)) {
        this.realtimeSpeechTalkSessions.add(sessionId);
        this.triggerTalkForRealtimeSpeech();
      }
      if (event.type === 'done' || event.type === 'error') {
        this.realtimeSpeechTalkSessions.delete(sessionId);
      }
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
    // 1. 加载自动行走配置 + 气泡模式
    this.autoWalkConfig.load();
    this.bubbleModeConfig.load();
    this.spriteConfig.bubbleMode = this.bubbleModeConfig.mode;

    // 2. 加载持久化的人格状态（读取时忽略旧文件中的养成字段）
    const saved = await this.persistence.load(this.activePersonaStateId);
    if (saved) {
      this.personaState.loadState({
        name: this.activePersonaIdentity.name,
        ...(this.activePersonaIdentity.description !== undefined ? { description: this.activePersonaIdentity.description } : { description: saved.description }),
        mood: saved.mood,
        moodIntensity: saved.moodIntensity,
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
  }

  /** 停止引擎 */
  stop(): void {
    this.stopBehaviorScheduler();
    this.behaviorEngine.stop();
    this.persistence.stopAutoSave();
    if (this.stateBroadcastTimer) {
      clearTimeout(this.stateBroadcastTimer);
      this.stateBroadcastTimer = null;
    }
  }

  /** 销毁并清理 */
  async destroy(): Promise<void> {
    this.stop();
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
    for (const playId of Array.from(this.animationMovementSuspensionReasons.keys())) {
      this.releaseAnimationMovementSuspension(playId);
    }

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

  private hasSegmentLoop(playback: AnimationEntry['playback'] | SpritePlayCommand['playback'] | undefined): boolean {
    return playback?.loopStartMs != null && playback?.loopEndMs != null;
  }

  private resolveAnimationPlaylistMode(trigger?: SpriteAnimationTrigger): SpriteAnimationPlaylistMode {
    const normalizedTrigger = typeof trigger === 'string' ? trigger.trim() : '';
    if (normalizedTrigger) {
      const animationPlaylistModes = normalizeSpriteAnimationPlaylistModeMap(this.spriteConfig.animationPlaylistModes);
      const triggerMode = animationPlaylistModes[normalizedTrigger];
      if (triggerMode) {
        return triggerMode;
      }
    }
    return normalizeSpriteAnimationPlaylistMode(this.spriteConfig.animationPlaylistMode);
  }

  private shouldUseListPlaylist(mode: SpriteAnimationPlaylistMode, candidateCount?: number): boolean {
    return (mode === 'list-loop' || mode === 'list-once') && (candidateCount ?? 0) > 1;
  }

  private resolvePlaybackLoop(playback: AnimationEntry['playback'] | undefined): boolean {
    if (this.hasSegmentLoop(playback)) {
      return true;
    }

    const explicitLoopCount = playback?.loopCount;
    if (typeof explicitLoopCount === 'number' && Number.isFinite(explicitLoopCount) && explicitLoopCount > 0) {
      return true;
    }

    if (playback?.loop === true) {
      return true;
    }

    return false;
  }

  private resolvePlaybackLoopCount(playback: AnimationEntry['playback'] | undefined, mode: SpriteAnimationPlaylistMode, candidateCount?: number): number | undefined {
    const explicitLoopCount = playback?.loopCount;
    if (typeof explicitLoopCount === 'number' && Number.isFinite(explicitLoopCount) && explicitLoopCount > 0) {
      return Math.floor(explicitLoopCount);
    }

    if (this.isWalkToMovementPlayback(playback)) {
      return undefined;
    }

    if (!this.shouldUseListPlaylist(mode, candidateCount)) {
      return undefined;
    }

    if (this.hasSegmentLoop(playback) || playback?.loop === true) {
      return PLAYLIST_LOOP_FALLBACK_COUNT;
    }

    return undefined;
  }

  private isWalkToMovementPlayback(playback: AnimationEntry['playback'] | undefined): boolean {
    return playback?.movement?.enabled === true && playback.movement.mode === 'walkTo';
  }

  private selectAnimationFromCandidates(candidates: AnimationEntry[]): { anim: AnimationEntry; index: number } | null {
    if (candidates.length === 0) return null;
    return { anim: candidates[0], index: 0 };
  }

  private shouldSuspendMovementForTrigger(trigger?: SpriteAnimationTrigger, options?: SpriteTriggerOptions): boolean {
    if (options?.allowMovementDuringPlayback !== undefined) {
      return options.allowMovementDuringPlayback === false;
    }

    return trigger === MUSIC_DANCE_TRIGGER || trigger === MUSIC_DANCE_FALLBACK_TRIGGER;
  }

  private resolveTriggerPlayId(trigger: SpriteAnimationTrigger | undefined, options: SpriteTriggerOptions | undefined, suspendMovement: boolean): string | undefined {
    if (options?.playId) {
      return options.playId;
    }

    if (!suspendMovement) {
      return undefined;
    }

    return this.createAnimationPlayId(`trigger:${trigger ?? 'animation'}`);
  }

  private getAnimationMovementSuspensionReason(playId: string): string {
    return `animation:${playId}`;
  }

  private registerAnimationMovementSuspension(playId?: string, allowMovementDuringPlayback?: boolean): void {
    if (!playId || allowMovementDuringPlayback !== false) {
      return;
    }

    if (this.animationMovementSuspensionReasons.has(playId)) {
      return;
    }

    const reason = this.getAnimationMovementSuspensionReason(playId);
    this.animationMovementSuspensionReasons.set(playId, reason);
    this.setMovementSuspended(reason, true);
  }

  private releaseAnimationMovementSuspension(playId?: string): void {
    if (!playId) {
      return;
    }

    const reason = this.animationMovementSuspensionReasons.get(playId);
    if (!reason) {
      return;
    }

    this.animationMovementSuspensionReasons.delete(playId);
    this.setMovementSuspended(reason, false);
  }

  private resolveAnimationPlaybackMetrics(playback: AnimationEntry['playback']): SpritePlaybackMetrics {
    return {
      width: this.resolvePlaybackMetric(playback.width, DEFAULT_ANIMATION_PLAYBACK_METRICS.width),
      height: this.resolvePlaybackMetric(playback.height, DEFAULT_ANIMATION_PLAYBACK_METRICS.height),
      padding: this.resolvePlaybackMetric(playback.padding, DEFAULT_ANIMATION_PLAYBACK_METRICS.padding)
    };
  }

  private resolvePlaybackMetric(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  private playAnimationEntry(anim: AnimationEntry, options: PlayAnimationEntryOptions): void {
    const previousPlayId = this.currentAnimation?.playId;
    if (previousPlayId && previousPlayId !== options.playId) {
      this.releaseAnimationMovementSuspension(previousPlayId);
    }

    const resolvedDurationMs = options.durationMs ?? anim.playback?.durationMs;
    const playlistCandidateCount = options.playlistEntries?.length ?? 0;
    const playbackLoop = this.resolvePlaybackLoop(anim.playback);
    const playbackLoopCount = this.resolvePlaybackLoopCount(anim.playback, options.playlistMode, playlistCandidateCount);
    const playbackMetrics = anim.playback ? this.resolveAnimationPlaybackMetrics(anim.playback) : null;

    this.currentAnimation = {
      playId: options.playId,
      animationId: anim.id,
      trigger: options.trigger,
      sessionMode: options.sessionMode,
      source: anim.source,
      playbackSession: this.buildPlaybackSession(anim.playback, resolvedDurationMs, options.sessionMode),
      playback: anim.playback
        ? {
          width: playbackMetrics!.width,
          height: playbackMetrics!.height,
          padding: playbackMetrics!.padding,
          loop: playbackLoop,
          loopCount: playbackLoopCount,
          loopStartMs: anim.playback.loopStartMs,
          loopEndMs: anim.playback.loopEndMs,
          durationMs: resolvedDurationMs,
          autoIdle: anim.playback.autoIdle ?? true,
          movement: anim.playback.movement
        }
        : { durationMs: options.durationMs ?? 2000, loop: playbackLoop, loopCount: playbackLoopCount, autoIdle: true }
    };
    this.currentAnimationPresentationOwner = options.presentationOwner ? { ...options.presentationOwner } : null;

    if (playbackMetrics) {
      this.setSpriteMetrics(playbackMetrics);
    }

    if (options.trigger && this.shouldUseListPlaylist(options.playlistMode, playlistCandidateCount) && options.playlistEntries?.length) {
      this.activeAnimationPlaylist = {
        trigger: options.trigger,
        mode: options.playlistMode,
        entries: options.playlistEntries,
        currentIndex: options.playlistIndex ?? 0,
        sessionMode: options.sessionMode,
        durationMs: options.durationMs,
        playId: options.playId,
        presentationOwner: options.presentationOwner ? { ...options.presentationOwner } : null
      };
    } else {
      this.activeAnimationPlaylist = null;
    }

    this.sendToRenderer('sprite:play', this.currentAnimation);
    this.registerAnimationMovementSuspension(options.playId, options.allowMovementDuringPlayback);
    if (options.trigger === 'welcome' || options.trigger === 'idle' || this.currentAnimation.animationId === 'sprite-fx718a5q') {
      console.log('sprite:play sent: ' + options.trigger);
      // console.info('❤❤❤❤❤ sprite:play sent', {
      //   trigger: options.trigger,
      //   animationId: anim.id,
      //   title: anim.title,
      //   playId: options.playId,
      //   sessionMode: options.sessionMode,
      //   playlistMode: options.playlistMode,
      //   playlistCandidateCount,
      //   loop: this.currentAnimation.playback?.loop,
      //   loopCount: this.currentAnimation.playback?.loopCount,
      //   autoIdle: this.currentAnimation.playback?.autoIdle
      // });
    }
    if (options.trigger && this.shouldLogTriggerDebug(options.trigger, { playId: options.playId })) {
      console.log('sprite:play sent: ' + options.trigger);
      // this.logTriggerDebug('sprite:play sent', {
      //   trigger: options.trigger,
      //   animationId: anim.id,
      //   title: anim.title,
      //   playId: options.playId,
      //   playlistMode: options.playlistMode,
      //   sessionMode: options.sessionMode,
      //   durationMs: resolvedDurationMs,
      //   hasPlayback: Boolean(anim.playback)
      // });
    }
    this.handleAnimationMovement(anim.playback?.movement, this.resolveWindowAnimationPlaybackSize(anim.playback));
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
  trigger(trigger: SpriteAnimationTrigger, options?: SpriteTriggerOptions & { ambientContext?: SpriteAmbientMessageContext }): void {
    // 1. Try to find and play a matching animation.
    let resolvedTrigger = trigger;
    let candidates = this.animationRegistry.findCandidatesByTrigger({
      trigger,
      personaState: this.personaState.getState()
    });
    const requestedCandidateCount = candidates.length;
    let fallbackTrigger: SpriteAnimationTrigger | undefined;
    if (candidates.length === 0 && this.shouldFallbackMusicDanceTrigger(trigger)) {
      fallbackTrigger = MUSIC_DANCE_FALLBACK_TRIGGER;
      resolvedTrigger = fallbackTrigger;
      candidates = this.animationRegistry.findCandidatesByTrigger({
        trigger: fallbackTrigger,
        personaState: this.personaState.getState()
      });
    }
    const playlistMode = this.resolveAnimationPlaylistMode(resolvedTrigger);
    const suspendMovement = this.shouldSuspendMovementForTrigger(resolvedTrigger, options);
    const playId = this.resolveTriggerPlayId(resolvedTrigger, options, suspendMovement);
    const playlistEntries = options?.playId && !options.allowPlaylistWithPlayId ? undefined : candidates;
    const selected = this.selectAnimationFromCandidates(candidates);
    const presentationAllowed = this.canPresentAnimation(options);
    const shouldLogDebug = this.shouldLogTriggerDebug(trigger, options);
    if (shouldLogDebug) {
      this.logTriggerDebug('received trigger', {
        trigger,
        resolvedTrigger,
        fallbackTrigger,
        playId,
        silent: options?.silent,
        priority: options?.priority,
        ownerPurposeId: options?.ownerPurposeId,
        ignorePresentationLock: options?.ignorePresentationLock,
        playlistMode,
        requestedCandidateCount,
        candidateCount: candidates.length,
        candidateIds: candidates.slice(0, 5).map((candidate) => candidate.id),
        selectedAnimationId: selected?.anim.id,
        selectedTitle: selected?.anim.title,
        presentationAllowed,
        presentationLock: this.presentationLock.getSnapshot()
      });
    }

    if (!selected && shouldLogDebug) {
      this.logTriggerDebug('no animation candidates', {
        trigger,
        resolvedTrigger,
        fallbackTrigger,
        playId,
        availableTriggerSample: this.animationRegistry.getTriggers().slice(0, 30)
      });
    } else if (selected && !presentationAllowed && shouldLogDebug) {
      this.logTriggerDebug('animation blocked by presentation lock', {
        trigger,
        resolvedTrigger,
        fallbackTrigger,
        playId,
        selectedAnimationId: selected.anim.id,
        presentationLock: this.presentationLock.getSnapshot()
      });
    }

    if (selected && presentationAllowed) {
      if (fallbackTrigger && shouldLogDebug) {
        this.logTriggerDebug('using fallback trigger', {
          requestedTrigger: trigger,
          fallbackTrigger,
          selectedAnimationId: selected.anim.id,
          selectedTitle: selected.anim.title
        });
      }
      this.playAnimationEntry(selected.anim, {
        trigger: resolvedTrigger,
        playlistMode,
        playlistEntries,
        playlistIndex: selected.index,
        sessionMode: 'trigger',
        durationMs: options?.durationMs,
        playId,
        allowMovementDuringPlayback: suspendMovement ? false : options?.allowMovementDuringPlayback,
        presentationOwner: this.toPresentationOwner(options)
      });
    }

    // 2. 显示气泡文案（除非 silent）
    if (!options?.silent && !this.shouldSuppressAmbientMessage(options?.ambientContext)) {
      const text = options?.message || getCharacterSpriteEventText(trigger, options?.ctx);
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
    const trigger = anim.eventTypes?.[0];
    const suspendMovement = this.shouldSuspendMovementForTrigger(trigger, options);

    this.playAnimationEntry(anim, {
      playlistMode: this.resolveAnimationPlaylistMode(trigger),
      sessionMode: 'trigger',
      durationMs: options?.durationMs,
      playId: this.resolveTriggerPlayId(trigger, options, suspendMovement),
      allowMovementDuringPlayback: suspendMovement ? false : options?.allowMovementDuringPlayback,
      presentationOwner: this.toPresentationOwner(options)
    });

    if (!options?.silent) {
      const eventType = anim.eventTypes?.[0];
      const text = options?.message || (eventType ? getCharacterSpriteEventText(eventType) : undefined);
      if (text) {
        this.showToast(text, { duration: options?.duration });
      }
    }

    return true;
  }

  playFeedbackAnimation(request?: SpriteFeedbackRequest | null): SpriteFeedbackResult {
    const feedbackRequest = request ?? {};
    const trigger = typeof feedbackRequest.trigger === 'string' ? (feedbackRequest.trigger.trim() as SpriteAnimationTrigger) : undefined;
    const kind = typeof feedbackRequest.kind === 'string' ? feedbackRequest.kind.trim() : undefined;
    if (!trigger || !kind) {
      return {
        ok: false,
        played: false,
        reason: 'invalid-request',
        error: 'Feedback trigger and kind are required'
      };
    }

    const candidates = this.animationRegistry.findCandidatesByTrigger({
      trigger,
      personaState: this.personaState.getState()
    });
    if (candidates.length === 0) {
      return { ok: true, played: false, reason: 'missing-animation' };
    }

    const lock = this.presentationLock.getSnapshot();
    const owner = lock ? this.resolveCurrentPresentationOwner(lock.ownerId) : null;
    if (lock && !owner) {
      return { ok: true, played: false, reason: 'blocked-by-lock' };
    }

    this.trigger(trigger, {
      silent: feedbackRequest.silent,
      durationMs: feedbackRequest.durationMs,
      message: feedbackRequest.message,
      ctx: feedbackRequest.ctx,
      ...(owner ? this.toPresentationOptions(owner) : {})
    });

    return owner ? { ok: true, played: true, ownerPurposeId: owner.ownerId } : { ok: true, played: true };
  }

  private resolveCurrentPresentationOwner(lockOwnerId: string): SpritePresentationOwnerContext | null {
    if (this.activeRoutinePresentationOwner?.ownerId === lockOwnerId) {
      return { ...this.activeRoutinePresentationOwner };
    }

    const currentPurpose = this.purposeManager.getSnapshot().current;
    if (currentPurpose?.id !== lockOwnerId) {
      return null;
    }

    return {
      ownerId: currentPurpose.id,
      priority: currentPurpose.priority
    };
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

  private sendMessageBridge(payload: MessageBridgePayload): RendererDeliveryResult {
    return this.sendToRenderer(MESSAGE_IPC_CHANNELS.BRIDGE, payload);
  }

  private sendRendererMessage(payload: MessageIPCPayload): void {
    this.sendMessageBridge({ kind: 'show', payload, source: 'sprite' });
  }

  async sendBridgeMessage(payload: MessageIPCPayload, options?: { target?: MessageBridgeTarget }): Promise<{ deliveredToSprite: boolean }> {
    if (options?.target === 'sprite') {
      try {
        await this.ensureMessageRecipients?.();
      } catch (error) {
        console.warn('[SpriteManager] failed to ensure sprite message recipients', error);
      }
    }
    const delivery = this.sendMessageBridge({ kind: 'show', payload, source: 'app', target: options?.target });
    const deliveredToSprite = options?.target === 'sprite' || isBubbleWindowMode(this.bubbleModeConfig.mode) ? delivery.recipientCount > 0 : delivery.primarySent;
    return { deliveredToSprite };
  }

  waitForPurposeEvent(options: {
    event: string;
    source?: SpritePurposeRuntimeEvent['source'];
    match?: Record<string, unknown>;
    timeoutMs?: number;
    ignoreHistory?: boolean;
    signal?: AbortSignal;
    routineId?: string;
    purposeId?: string;
  }): Promise<SpritePurposeRuntimeEvent> {
    const routineId = options.routineId || `manual-${Date.now()}`;
    const routine: SpriteRoutine = {
      id: routineId,
      purposeId: options.purposeId || routineId,
      source: 'system',
      status: 'running',
      steps: [],
      cursor: 0,
      createdAt: Date.now()
    };
    const step: Extract<SpriteRoutineStep, { type: 'waitForEvent' }> = {
      id: `wait-${options.event}`,
      type: 'waitForEvent',
      event: options.event,
      source: options.source,
      match: options.match,
      timeoutMs: options.timeoutMs,
      ignoreHistory: options.ignoreHistory
    };

    return this.purposeEventWaiter.wait(step, routine, options.signal);
  }

  clearMessage(payload: MessageBridgeClearPayload): void {
    this.clearRendererMessage(payload);
  }

  private clearRendererMessage(payload: MessageBridgeClearPayload): void {
    this.sendMessageBridge({ kind: 'clear', payload, source: 'sprite' });
  }

  /** 轻量提示 */
  showToast(
    content?: string,
    options?: {
      category?: MessageCategory;
      duration?: number;
      level?: string;
      ctx?: any;
      speak?: boolean;
      ambientContext?: SpriteAmbientMessageContext;
      ownerPurposeId?: string;
      priority?: number;
      ignorePresentationLock?: boolean;
    }
  ): void {
    if (this.shouldSuppressAmbientMessage(options?.ambientContext)) {
      return;
    }

    // 如果只传了 category 没有 content，先获取文本以确保显示和朗读一致
    const resolvedContent = content ?? (options?.category ? getCharacterCategoryText(options.category, options?.ctx) : undefined);

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
    if (options?.speak !== false && !this._speakGuard && !SpriteManager.MUTE_CATEGORIES.has(options?.category ?? '')) {
      if (resolvedContent) {
        this.playSpeechAudio(resolvedContent, {
          talkDurationMs: options?.duration,
          ownerPurposeId: options?.ownerPurposeId,
          priority: options?.priority,
          ignorePresentationLock: options?.ignorePresentationLock
        }).catch(() => { });
      }
    }
  }

  /** 通知消息 */
  showNotice(
    content: string,
    options?: {
      id?: string;
      buttons?: any[];
      duration?: number;
      persistent?: boolean;
      routineId?: string;
      level?: string;
      speak?: boolean;
      ambientContext?: SpriteAmbientMessageContext;
      ownerPurposeId?: string;
      priority?: number;
      ignorePresentationLock?: boolean;
    }
  ): boolean {
    if (this.shouldSuppressAmbientMessage(options?.ambientContext)) {
      return false;
    }

    const payload: MessageIPCPayload = {
      type: 'notice',
      id: options?.id,
      content,
      buttons: options?.buttons,
      duration: options?.duration,
      persistent: options?.persistent,
      routineId: options?.routineId,
      level: options?.level as any,
      speak: options?.speak
    };
    this.sendRendererMessage(payload);

    // 自动朗读通知内容
    if (options?.speak !== false && content && !this._speakGuard) {
      this.playSpeechAudio(content, {
        talkDurationMs: options?.duration,
        ownerPurposeId: options?.ownerPurposeId,
        priority: options?.priority,
        ignorePresentationLock: options?.ignorePresentationLock
      }).catch(() => { });
    }
    return true;
  }

  /** 显示忙碌状态 */
  async showSpriteNotice(
    content: string,
    options?: {
      id?: string;
      buttons?: any[];
      duration?: number;
      persistent?: boolean;
      routineId?: string;
      level?: string;
      speak?: boolean;
    }
  ): Promise<boolean> {
    const payload: MessageIPCPayload = {
      type: 'notice',
      id: options?.id,
      content,
      buttons: options?.buttons,
      duration: options?.duration,
      persistent: options?.persistent,
      routineId: options?.routineId,
      level: options?.level as any,
      speak: options?.speak
    };
    const result = await this.sendBridgeMessage(payload, { target: 'sprite' });
    return result.deliveredToSprite;
  }

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
  async speak(
    text: string,
    options?: {
      showBubble?: boolean;
      bubbleDuration?: number;
      ambientContext?: SpriteAmbientMessageContext;
      ownerPurposeId?: string;
      priority?: number;
      ignorePresentationLock?: boolean;
    }
  ): Promise<SpeakResult> {
    if (this.shouldSuppressAmbientMessage(options?.ambientContext)) {
      return { success: false, error: 'suppressed-by-onboarding' };
    }

    const showBubble = options?.showBubble ?? true;

    this._speakGuard = true;
    try {
      const bubbleDuration = options?.bubbleDuration ?? Math.max(3000, text.length * 200);
      if (showBubble) {
        this.showToast(text, { duration: bubbleDuration, category: 'message' });
      }
      return await this.playSpeechAudio(text, {
        talkDurationMs: bubbleDuration,
        ownerPurposeId: options?.ownerPurposeId,
        priority: options?.priority,
        ignorePresentationLock: options?.ignorePresentationLock
      });
    } finally {
      this._speakGuard = false;
    }
  }

  private playSpeechAudio(text: string, options?: SpriteSpeechPlaybackOptions): Promise<SpeakResult> {
    return this.speakService.speak(text, this.resolveSpeechPlaybackContext(text, options));
  }

  private resolveSpeechPlaybackContext(text: string, options?: SpriteSpeechPlaybackOptions): SpriteSpeakPlaybackContext {
    const owner = this.resolveSpeechPresentationOwner(options);
    return {
      talkDurationMs: options?.talkDurationMs ?? Math.max(3000, text.length * 200),
      ...(owner ? { ownerPurposeId: owner.ownerId, priority: owner.priority } : {}),
      ...(options?.ignorePresentationLock ? { ignorePresentationLock: true } : {})
    };
  }

  private resolveSpeechPresentationOwner(options?: SpriteSpeechPlaybackOptions): SpritePresentationOwnerContext | null {
    if (options?.ownerPurposeId) {
      return {
        ownerId: options.ownerPurposeId,
        priority: options.priority ?? 0
      };
    }

    const lock = this.presentationLock.getSnapshot();
    if (!lock) {
      return null;
    }

    return this.resolveCurrentPresentationOwner(lock.ownerId);
  }

  private triggerTalkForSpeech(payload: SpriteSpeakPayload, context?: SpriteSpeakPlaybackContext): void {
    if (!this.canUseTalkForSpeech()) {
      return;
    }

    this.trigger('talk', {
      durationMs: context?.talkDurationMs ?? Math.max(3000, payload.text.length * 200),
      silent: true,
      ownerPurposeId: context?.ownerPurposeId,
      priority: context?.priority,
      ignorePresentationLock: context?.ignorePresentationLock
    });
  }

  private triggerTalkForRealtimeSpeech(): void {
    if (!this.canUseTalkForSpeech()) {
      return;
    }

    this.trigger('talk', {
      durationMs: 3000,
      silent: true
    });
  }

  private canUseTalkForSpeech(): boolean {
    return this.getState() === 'idle' && this.getSubState() == null && (!this.currentAnimation || this.currentAnimation.sessionMode === 'state-bound' || this.currentAnimation.trigger === 'idle');
  }

  /** 仅合成语音（不播放） */
  async synthesizeSpeech(text: string): Promise<SpeakResult> {
    return this.speakService.synthesize(text);
  }

  async startRealtimeSpeechSession(request: SpriteRealtimeSpeechSessionRequest, onEvent?: (event: SpriteRealtimeSpeechEvent) => void): Promise<SpriteRealtimeSpeechSession> {
    return this.speakService.startRealtimeSession(request, onEvent);
  }

  isRealtimeSpeechEnabled(request: SpriteRealtimeSpeechAvailabilityRequest): boolean {
    return this.speakService.isRealtimeSpeechEnabled(request);
  }

  async appendRealtimeSpeechText(sessionId: string, text: string): Promise<void> {
    await this.speakService.appendRealtimeSpeechText(sessionId, text);
  }

  async flushRealtimeSpeech(sessionId: string): Promise<void> {
    await this.speakService.flushRealtimeSpeech(sessionId);
  }

  async finishRealtimeSpeech(sessionId: string): Promise<void> {
    await this.speakService.finishRealtimeSpeech(sessionId);
  }

  async cancelRealtimeSpeech(sessionId: string): Promise<void> {
    await this.speakService.cancelRealtimeSpeech(sessionId);
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

  /** 批量初始化维度（仅对尚未初始化的维度设置初始值） */
  initDimensions(defs: Array<{ id: string; initialValue: number }>): void {
    this.personaState.initDimensions(defs);
    this.persistence.markDirty();
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

  /** 当前是否已回到空闲站立动画，可被低优先级环境触发接管。 */
  isIdlePresentationActive(): boolean {
    if (this.getState() !== 'idle' || this.getSubState() != null) return false;
    return !this.currentAnimation || (this.currentAnimation.sessionMode === 'state-bound' && this.currentAnimation.trigger === 'idle');
  }

  /** 获取动画列表 (AnimationRegistry) */
  stopAnimationSession(playId: string): boolean {
    const normalizedPlayId = playId.trim();
    if (!normalizedPlayId) return false;

    const currentMatches = this.currentAnimation?.playId === normalizedPlayId;
    const playlistMatches = this.activeAnimationPlaylist?.playId === normalizedPlayId;
    if (!currentMatches && !playlistMatches) return false;

    this.releaseAnimationMovementSuspension(normalizedPlayId);

    if (playlistMatches) {
      this.activeAnimationPlaylist = null;
    }

    if (currentMatches) {
      this.currentAnimation = null;
      this.currentAnimationPresentationOwner = null;
      this._pendingIdleAfterOutro = false;
      this.pendingIdlePresentationOwner = null;
      this.stopAutoMove();
      this.transitionToIdleAnimation();
    }

    return true;
  }

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
        loopCount: anim.loopCount,
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
    this.currentAnimationPresentationOwner = null;
    this.activeAnimationPlaylist = null;
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
    const { animationPlaylistModes: rawAnimationPlaylistModes, ...restConfig } = this.spriteConfig;
    const animationPlaylistModes = normalizeSpriteAnimationPlaylistModeMap(rawAnimationPlaylistModes);
    return {
      ...restConfig,
      animationPlaylistMode: normalizeSpriteAnimationPlaylistMode(this.spriteConfig.animationPlaylistMode),
      ...(Object.keys(animationPlaylistModes).length > 0 ? { animationPlaylistModes } : {}),
      autoWalkEnabled: this.autoWalkConfig.enabled,
      bubbleMode: this.bubbleModeConfig.mode
    };
  }

  /**
   * 获取运行期生效的 padding
   * - 独立窗口气泡模式下 padding 被视为 0（不修改持久化的 spriteConfig.padding）
   * - inline 模式下返回真实 padding
   */
  getEffectivePadding(): number {
    return isBubbleWindowMode(this.bubbleModeConfig.mode) ? 0 : this.spriteConfig.padding;
  }

  /** 获取气泡展示模式 */
  getBubbleMode(): SpriteBubbleMode {
    return this.bubbleModeConfig.mode;
  }

  /** 设置气泡展示模式并广播 */
  setBubbleMode(mode: SpriteBubbleMode): SpriteBubbleMode {
    const normalized = normalizeSpriteBubbleMode(mode);
    if (this.bubbleModeConfig.mode !== normalized) {
      this.bubbleModeConfig.mode = normalized;
      this.spriteConfig.bubbleMode = normalized;
      this.emitConfigChanged();
    } else {
      this.spriteConfig.bubbleMode = normalized;
    }
    return normalized;
  }

  /** 设置精灵配置 */
  setSpriteConfig(config: Partial<SpriteConfig>): void {
    const { autoWalkEnabled, animationPlaylistMode, animationPlaylistModes, bubbleMode, ...restConfig } = config;
    Object.assign(this.spriteConfig, restConfig);
    if (animationPlaylistMode !== undefined) {
      this.spriteConfig.animationPlaylistMode = normalizeSpriteAnimationPlaylistMode(animationPlaylistMode);
    }
    if (animationPlaylistModes !== undefined) {
      const normalizedAnimationPlaylistModes = normalizeSpriteAnimationPlaylistModeMap(animationPlaylistModes);
      if (Object.keys(normalizedAnimationPlaylistModes).length > 0) {
        this.spriteConfig.animationPlaylistModes = normalizedAnimationPlaylistModes;
      } else {
        delete this.spriteConfig.animationPlaylistModes;
      }
      this.activeAnimationPlaylist = null;
    }
    if (typeof autoWalkEnabled === 'boolean') {
      this.autoWalkConfig.enabled = autoWalkEnabled;
      if (!autoWalkEnabled) {
        this.stopWalk();
      }
    }
    if (bubbleMode !== undefined) {
      const normalized = normalizeSpriteBubbleMode(bubbleMode);
      if (this.bubbleModeConfig.mode !== normalized) {
        this.bubbleModeConfig.mode = normalized;
      }
      this.spriteConfig.bubbleMode = normalized;
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

  /** 获取动画播放列表模式 */
  getAnimationPlaylistMode(trigger?: SpriteAnimationTrigger): SpriteAnimationPlaylistMode {
    const normalizedTrigger = typeof trigger === 'string' ? trigger.trim() : '';
    if (normalizedTrigger) {
      const animationPlaylistModes = normalizeSpriteAnimationPlaylistModeMap(this.spriteConfig.animationPlaylistModes);
      const triggerMode = animationPlaylistModes[normalizedTrigger];
      if (triggerMode) return triggerMode;
    }
    return normalizeSpriteAnimationPlaylistMode(this.spriteConfig.animationPlaylistMode);
  }

  /** 设置动画播放列表模式 */
  setAnimationPlaylistMode(mode: SpriteAnimationPlaylistMode, trigger?: SpriteAnimationTrigger): SpriteAnimationPlaylistMode {
    const nextMode = normalizeSpriteAnimationPlaylistMode(mode);
    const normalizedTrigger = typeof trigger === 'string' ? trigger.trim() : '';
    if (normalizedTrigger) {
      const animationPlaylistModes = normalizeSpriteAnimationPlaylistModeMap(this.spriteConfig.animationPlaylistModes);
      if (animationPlaylistModes[normalizedTrigger] !== nextMode) {
        this.spriteConfig.animationPlaylistModes = {
          ...animationPlaylistModes,
          [normalizedTrigger]: nextMode
        };
        this.activeAnimationPlaylist = null;
        this.emitConfigChanged();
      }
      return nextMode;
    }

    if (this.spriteConfig.animationPlaylistMode !== nextMode) {
      this.spriteConfig.animationPlaylistMode = nextMode;
      this.activeAnimationPlaylist = null;
      this.emitConfigChanged();
    }
    return nextMode;
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
    console.info('❤❤❤❤❤ handleAnimationComplete: ' + animId);
    // console.info('❤❤❤❤❤ handleAnimationComplete', {
    //   animId,
    //   phase,
    //   playId,
    //   currentAnimationId: this.currentAnimation?.animationId,
    //   currentPlayId: this.currentAnimation?.playId,
    //   currentTrigger: this.currentAnimation?.trigger,
    //   currentState: this.getState(),
    //   currentSubState: this.getSubState(),
    //   isCurrentAnimation,
    //   pendingIdleAfterOutro: this._pendingIdleAfterOutro,
    //   activePlaylist: this.activeAnimationPlaylist
    //     ? {
    //       trigger: this.activeAnimationPlaylist.trigger,
    //       mode: this.activeAnimationPlaylist.mode,
    //       currentIndex: this.activeAnimationPlaylist.currentIndex,
    //       count: this.activeAnimationPlaylist.entries.length,
    //       playId: this.activeAnimationPlaylist.playId
    //     }
    //     : null,
    //   autoIdle: this.shouldAutoIdleAfterComplete(animId, playId)
    // });
    if ((phase === 'full' || phase === 'outro') && isCurrentAnimation) {
      this.stopAutoMove();
    }

    if (phase !== 'outro' && phase !== 'full') {
      return;
    }

    if (isCurrentAnimation && !this._pendingIdleAfterOutro && this.shouldAdvanceTrackedPlaylist(animId, playId)) {
      const playlistResult = this.advanceAnimationPlaylist(animId);
      if (playlistResult === 'advanced') {
        return;
      }
    }

    if (playId) {
      this.releaseAnimationMovementSuspension(playId);
    }

    const autoIdle = this.shouldAutoIdleAfterComplete(animId, playId);

    if (!autoIdle) {
      if (isCurrentAnimation && !this._pendingIdleAfterOutro) {
        const playlistResult = this.advanceAnimationPlaylist(animId);
        if (playlistResult === 'advanced') {
          return;
        }
        if (playlistResult === 'completed' && this.getState() === 'idle' && this.getSubState() == null) {
          return;
        }
      }

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

    this.activeAnimationPlaylist = null;
    console.log('❤❤❤❤❤ transition to idle after completion: ' + animId);

    // console.info('❤❤❤❤❤ transition to idle after completion', {
    //   animId,
    //   phase,
    //   playId,
    //   state: this.getState(),
    //   subState: this.getSubState()
    // });
    this.transitionToIdleAnimation(this.consumeIdleTransitionPresentationOptions());
  }

  /** 处理文件拖放 */
  async handleFileDrop(files: SpriteFileDropPayloadItem[], options: SpriteFileDropOptions = {}): Promise<SpritePurposeStartResult> {
    const normalizedFiles = Array.isArray(files) ? files : [];
    const correlationId = options.correlationId ?? this.createFileDropCorrelationId();
    this.reportInteraction('file-drop', { fileCount: normalizedFiles.length, correlationId });

    return this.startFileDropPurpose(normalizedFiles, correlationId);
  }

  private startFileDropPurpose(files: SpriteFileDropPayloadItem[], correlationId: string): Promise<SpritePurposeStartResult> {
    return this.startPurpose({
      kind: 'file.drop',
      reason: '用户把文件拖给角色处理',
      source: 'user-event',
      presetId: 'file.drop',
      priority: 100,
      interruptPolicy: 'interruptible',
      correlationId,
      coalesceKey: `file-drop:${correlationId}`,
      plannerMode: 'preset-only',
      context: {
        source: 'drop',
        purposeSource: 'sprite-drop',
        files,
        fileCount: files.length,
        fileNames: files.map((file) => file.name).filter(Boolean)
      }
    });
  }

  private getFileDropCorrelationId(data?: SpriteInteractionPayload): string {
    const correlationId = data?.correlationId;
    return typeof correlationId === 'string' && correlationId.trim() ? correlationId : this.createFileDropCorrelationId();
  }

  private createFileDropCorrelationId(): string {
    return `file-drop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
        this.trigger('welcome', { ambientContext: 'welcome' });
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

  setSuppressAmbientMessagesHandler(handler?: SpriteManagerOptions['shouldSuppressAmbientMessages']): void {
    this.shouldSuppressAmbientMessages = handler;
  }

  getSuppressAmbientMessagesHandler(): SpriteManagerOptions['shouldSuppressAmbientMessages'] | undefined {
    return this.shouldSuppressAmbientMessages;
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
  runBehaviorMovement(movement?: SpriteMovementConfig): Promise<boolean> {
    return this.movementCoordinator.runBehaviorMovement(movement);
  }

  // ============================================================================
  // 内部方法
  // ============================================================================

  /** 状态机变化回调 */
  private onStateChange(newState: SpriteState, _oldState: SpriteState, subState: SpriteReactionState | null): void {
    if (newState === 'idle' && _oldState !== 'idle' && this.currentAnimation?.playback?.loopStartMs != null && this.currentAnimation?.playback?.loopEndMs != null) {
      const autoIdle = this.currentAnimation?.playback?.autoIdle ?? true;
      this._pendingIdleAfterOutro = autoIdle;
      this.pendingIdlePresentationOwner = autoIdle && this.stateDrivenPresentationOwner ? { ...this.stateDrivenPresentationOwner } : null;
      this.broadcastState();
      if (autoIdle) {
        setTimeout(() => {
          if (this._pendingIdleAfterOutro) {
            this._pendingIdleAfterOutro = false;
            this.transitionToIdleAnimation(this.consumePendingIdlePresentationOptions());
          }
        }, 3000);
      }
      return;
    }

    this._pendingIdleAfterOutro = false;
    this.pendingIdlePresentationOwner = null;
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

  private shouldAdvanceTrackedPlaylist(animId: string, playId?: string): boolean {
    const playlist = this.activeAnimationPlaylist;
    if (!playlist?.playId) return false;
    if (playlist.entries[playlist.currentIndex]?.id !== animId) return false;
    if (this.currentAnimation?.playId !== playlist.playId) return false;
    return !playId || playId === playlist.playId;
  }

  private advanceAnimationPlaylist(animId: string): 'advanced' | 'completed' | 'none' {
    const playlist = this.activeAnimationPlaylist;
    if (!playlist) return 'none';
    if (playlist.entries[playlist.currentIndex]?.id !== animId) return 'none';

    const nextIndex = playlist.currentIndex + 1;
    if (nextIndex >= playlist.entries.length) {
      if (playlist.mode === 'list-once') {
        this.activeAnimationPlaylist = null;
        return 'completed';
      }

      const nextEntry = playlist.entries[0];
      if (!nextEntry) {
        this.activeAnimationPlaylist = null;
        return 'completed';
      }
      this.playAnimationEntry(nextEntry, {
        trigger: playlist.trigger,
        playlistMode: playlist.mode,
        playlistEntries: playlist.entries,
        playlistIndex: 0,
        sessionMode: playlist.sessionMode,
        durationMs: playlist.durationMs,
        playId: playlist.playId,
        presentationOwner: playlist.presentationOwner ? { ...playlist.presentationOwner } : null
      });
      return 'advanced';
    }

    const nextEntry = playlist.entries[nextIndex];
    if (!nextEntry) {
      this.activeAnimationPlaylist = null;
      return 'completed';
    }

    this.playAnimationEntry(nextEntry, {
      trigger: playlist.trigger,
      playlistMode: playlist.mode,
      playlistEntries: playlist.entries,
      playlistIndex: nextIndex,
      sessionMode: playlist.sessionMode,
      durationMs: playlist.durationMs,
      playId: playlist.playId,
      presentationOwner: playlist.presentationOwner ? { ...playlist.presentationOwner } : null
    });
    return 'advanced';
  }

  private transitionToIdleAnimation(options?: SpriteTriggerOptions): void {
    const isAlreadyIdle = this.getState() === 'idle' && this.getSubState() == null;
    if (!isAlreadyIdle) {
      const owner = this.toPresentationOwner(options);
      if (owner) {
        this.withStateDrivenPresentationOwner(owner, () => this.transitionTo('idle'));
      } else {
        this.transitionTo('idle');
      }
      return;
    }

    this.resolveAndSendAnimation('idle', null, options);
    this.broadcastState();
  }

  private toPresentationOwner(options?: SpriteTriggerOptions): SpritePresentationOwnerContext | null {
    if (!options?.ownerPurposeId) return null;
    return {
      ownerId: options.ownerPurposeId,
      priority: options.priority ?? 0
    };
  }

  private toPresentationOptions(owner: SpritePresentationOwnerContext): SpriteTriggerOptions {
    return {
      ownerPurposeId: owner.ownerId,
      priority: owner.priority
    };
  }

  private consumePendingIdlePresentationOptions(): SpriteTriggerOptions | undefined {
    const owner = this.pendingIdlePresentationOwner;
    this.pendingIdlePresentationOwner = null;
    if (!owner) return undefined;
    return this.toPresentationOptions(owner);
  }

  private consumeIdleTransitionPresentationOptions(): SpriteTriggerOptions | undefined {
    const pendingOptions = this.consumePendingIdlePresentationOptions();
    if (pendingOptions) return pendingOptions;

    const owner = this.currentAnimationPresentationOwner;
    this.currentAnimationPresentationOwner = null;
    if (!owner) return undefined;
    return this.toPresentationOptions(owner);
  }

  /** 根据当前状态解析并发送动画指令到渲染进程 */
  private resolveAndSendAnimation(state: SpriteState, subState: SpriteReactionState | null, options?: SpriteTriggerOptions): void {
    const trigger = mapStateToEventType(state, subState);
    const playlistMode = this.resolveAnimationPlaylistMode(trigger);
    const candidates = this.animationRegistry.findCandidatesByTrigger({
      trigger,
      personaState: this.personaState.getState(),
      allowFallback: true
    });
    const selected = this.selectAnimationFromCandidates(candidates);

    if (!selected) {
      this.activeAnimationPlaylist = null;
      return;
    }

    if (this.canPresentAnimation(options)) {
      this.playAnimationEntry(selected.anim, {
        trigger,
        playlistMode,
        playlistEntries: candidates,
        playlistIndex: selected.index,
        sessionMode: 'state-bound',
        durationMs: options?.durationMs,
        playId: options?.playId,
        presentationOwner: this.toPresentationOwner(options)
      });
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
  private resolveWindowAnimationPlaybackSize(playback?: AnimationEntry['playback']): SpriteWindowAnimationPlaybackSize | undefined {
    if (!playback) return undefined;
    const hasExplicitPlaybackSize = [playback.width, playback.height, playback.padding].some((value) => typeof value === 'number' && Number.isFinite(value));
    if (!hasExplicitPlaybackSize) return undefined;

    return {
      width: this.spriteConfig.width,
      height: this.spriteConfig.height,
      padding: this.getEffectivePadding()
    };
  }

  private handleAnimationMovement(movement?: SpriteMovementConfig, playbackSize?: SpriteWindowAnimationPlaybackSize): void {
    this.movementCoordinator.applyAnimationMovement(movement, playbackSize);
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
        if (step.waitFor === 'duration') {
          return step.durationMs ?? step.timeoutMs ?? 1200;
        }
        if (step.waitFor === 'complete') {
          return step.timeoutMs ?? step.durationMs ?? 1200;
        }
        return 0;
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
      case 'sequence':
        return step.body.reduce((sum, child) => sum + this.estimateRoutineStepPresentationMs(child), 0);
      case 'parallel':
        return Math.max(1000, ...step.body.map((child) => this.estimateRoutineStepPresentationMs(child)));
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
          allowMovementDuringPlayback: step.allowMovementDuringPlayback,
          ownerPurposeId: routine.purposeId,
          priority
        });
      } else if (step.trigger) {
        this.trigger(step.trigger, {
          durationMs: step.durationMs,
          silent: step.silent ?? true,
          playId,
          allowMovementDuringPlayback: step.allowMovementDuringPlayback,
          ownerPurposeId: routine.purposeId,
          priority
        });
      }

      if (step.waitFor == null || step.waitFor === 'none') {
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

  private async runPurposeSpeakStep(step: Extract<SpriteRoutineStep, { type: 'speak' }>, routine: SpriteRoutine): Promise<SpeakResult> {
    return this.speak(step.text, {
      showBubble: true,
      bubbleDuration: step.bubbleDuration,
      ownerPurposeId: routine.purposeId,
      priority: this.resolveRoutinePriority(routine)
    });
  }

  private async runPurposeWalkStep(step: Extract<SpriteRoutineStep, { type: 'walkTo' }>, signal: AbortSignal, routine: SpriteRoutine): Promise<void> {
    const priority = this.resolveRoutinePriority(routine);
    const lockTtlMs = Math.max(1000, step.timeoutMs ?? 8000);
    const lockAcquired = this.shouldAcquirePurposeStepLock(routine) ? this.presentationLock.acquire(routine.purposeId, priority, lockTtlMs, `routine:${routine.id}:${step.id}`) : false;
    const [x, y] = this.resolvePurposeWalkTarget(step.target);
    const owner: SpritePresentationOwnerContext = { ownerId: routine.purposeId, priority };
    try {
      const walk = this.withStateDrivenPresentationOwner(owner, () => this.walkTo(x, y, step.speed));
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
      if (this._pendingIdleAfterOutro && this.getState() === 'idle' && this.getSubState() == null) {
        this.pendingIdlePresentationOwner = owner;
      } else {
        this.transitionToIdleAnimation(this.toPresentationOptions(owner));
      }
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
    if (typeof target === 'object' && 'x' in target) {
      return [target.x, target.y];
    }

    if (typeof target === 'object' && 'window' in target) {
      return this.resolvePurposeWindowWalkTarget(target);
    }

    if (target === 'previous') {
      return this.getPosition();
    }

    const screen = this.getScreenSize();
    const { width, height } = this.getSpriteConfig();
    const padding = this.getEffectivePadding();
    const winWidth = width + padding * 2;
    const winHeight = height + padding * 2;

    if (target === 'center') {
      return [Math.max(0, (screen.width - winWidth) / 2), Math.max(0, (screen.height - winHeight) / 2)];
    }

    return [Math.max(0, screen.width - winWidth - 20), Math.max(0, screen.height - winHeight - 40)];
  }

  private resolvePurposeWindowWalkTarget(target: Extract<Extract<SpriteRoutineStep, { type: 'walkTo' }>['target'], { window: string }>): [number, number] {
    const bounds = this.purposeWindowAdapter?.getBounds?.(target.window);
    if (!bounds) {
      return this.resolvePurposeWalkTarget('center');
    }

    const screen = this.getScreenSize();
    const { width, height } = this.getSpriteConfig();
    const padding = this.getEffectivePadding();
    const winWidth = width + padding * 2;
    const winHeight = height + padding * 2;
    const offset = Math.max(0, target.offset ?? 16);
    const placement = target.placement ?? 'right';
    const clampX = (x: number): number => Math.max(0, Math.min(Math.max(0, screen.width - winWidth), x));
    const clampY = (y: number): number => Math.max(0, Math.min(Math.max(0, screen.height - winHeight), y));

    switch (placement) {
      case 'left':
        return [clampX(bounds.x - winWidth - offset), clampY(bounds.y + (bounds.height - winHeight) / 2)];
      case 'top':
        return [clampX(bounds.x + (bounds.width - winWidth) / 2), clampY(bounds.y - winHeight - offset)];
      case 'bottom':
        return [clampX(bounds.x + (bounds.width - winWidth) / 2), clampY(bounds.y + bounds.height + offset)];
      case 'center':
        return [clampX(bounds.x + (bounds.width - winWidth) / 2), clampY(bounds.y + (bounds.height - winHeight) / 2)];
      case 'right':
      default:
        return [clampX(bounds.x + bounds.width + offset), clampY(bounds.y + (bounds.height - winHeight) / 2)];
    }
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

  private setSpriteMetrics(metrics: Pick<SpriteConfig, 'width' | 'height' | 'padding'>): void {
    this.spriteConfig.width = metrics.width;
    this.spriteConfig.height = metrics.height;
    this.spriteConfig.padding = metrics.padding;
  }

  /** 仅需广播到气泡窗口的频道（消息桥与配置） */
  private static BROADCAST_CHANNELS: ReadonlySet<string> = new Set<string>([MESSAGE_IPC_CHANNELS.BRIDGE, 'sprite:config']);

  /** 发送统一配置快照 */
  private emitConfigChanged(): void {
    this.sendToRenderer('sprite:config', this.getSpriteConfig());
  }

  /** 安全发送 IPC 到渲染进程 */
  private sendToRenderer(channel: string, data: any): RendererDeliveryResult {
    let primarySent = false;
    let recipientCount = 0;
    const isMessageBridge = channel === MESSAGE_IPC_CHANNELS.BRIDGE;
    const bridgePayload = isMessageBridge ? (data as MessageBridgePayload | undefined) : undefined;
    try {
      if (this.win && !this.win.isDestroyed()) {
        this.win.webContents.send(channel, data);
        primarySent = true;
      } else if (channel === 'sprite:play') {
        this.logTriggerDebug('sprite:play skipped: main sprite window unavailable', {
          isDestroyed: this.win?.isDestroyed?.()
        });
      }
    } catch {
      if (channel === 'sprite:play') {
        this.logTriggerDebug('sprite:play send failed');
      }
      /* ignore */
    }

    if (!SpriteManager.BROADCAST_CHANNELS.has(channel)) {
      return { primarySent, recipientCount };
    }

    const bridgeTarget = bridgePayload?.target;
    const shouldBroadcastBridgeToSprite = bridgeTarget === 'sprite' || isBubbleWindowMode(this.bubbleModeConfig.mode);

    if (channel === MESSAGE_IPC_CHANNELS.BRIDGE && !shouldBroadcastBridgeToSprite) {
      return { primarySent, recipientCount };
    }

    const recipients = channel === 'sprite:config' ? (this.getConfigRecipients?.() ?? this.getMessageRecipients?.()) : this.getMessageRecipients?.();
    if (!recipients || recipients.length === 0) {
      return { primarySent, recipientCount };
    }

    for (const recipient of recipients) {
      if (!recipient || recipient === this.win) continue;
      try {
        if (recipient.isDestroyed()) continue;
        recipient.webContents.send(channel, data);
        recipientCount += 1;
      } catch {
        /* ignore */
      }
    }

    return { primarySent, recipientCount };
  }

  private logTriggerDebug(message: string, details: Record<string, unknown> = {}): void {
    if (process.env.SPRITE_TRIGGER_DEBUG === '1') {
      console.info(SPRITE_TRIGGER_DEBUG_PREFIX, message, details);
    }
  }

  private shouldLogTriggerDebug(trigger?: SpriteAnimationTrigger, options?: Pick<SpriteTriggerOptions, 'playId'>): boolean {
    const normalizedTrigger = typeof trigger === 'string' ? trigger.trim() : '';
    const playId = typeof options?.playId === 'string' ? options.playId : '';
    return normalizedTrigger.startsWith('music:') || playId.startsWith('music-');
  }

  private shouldFallbackMusicDanceTrigger(trigger?: SpriteAnimationTrigger): boolean {
    return typeof trigger === 'string' && trigger.trim() === MUSIC_DANCE_TRIGGER;
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
      mood: state.mood,
      moodIntensity: state.moodIntensity,
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
      mood: 'neutral',
      moodIntensity: 50,
      achievements: [],
      dimensions: {},
      createdAt: now,
      updatedAt: now
    };
  }

  private shouldSuppressAmbientMessage(context?: SpriteAmbientMessageContext): boolean {
    if (!context) return false;
    try {
      return this.shouldSuppressAmbientMessages?.(context) === true;
    } catch {
      return false;
    }
  }
}
