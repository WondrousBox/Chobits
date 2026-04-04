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
import { SpriteEventBus } from '../event-bus';
import type { InteractionType } from '../interaction-tracker';
import { InteractionTracker } from '../interaction-tracker';
import Messages from '../messages/zh-CN';
import { getSpriteEventText } from '../messages/zh-CN';
import type { MoodType, PersonaState } from '../persona-state';
import { PersonaStateManager } from '../persona-state';
import { SpeakService } from '../speak/speak-service';
import type { SpeakResult, SpriteSpeakConfig, SpriteSpeakPayload } from '../speak/types';
import type { SpriteState, SpriteSubState } from '../state-machine';
import { SpriteStateMachine } from '../state-machine';
import type { MessageCategory, MessageIPCPayload, SpriteAnimation, SpriteConfig, SpriteInitialState, SpritePlayCommand, SpriteStateSnapshot } from '../types';
import { registerDefaultBehaviors } from './default-behaviors';
import { AutoWalkConfig, PersonaStatePersistence } from './persistence';
import { mapStateToEventType } from './state-mapping';
import type { PersonaStatePersistenceRow, SpriteManagerOptions, SpriteWindow } from './types';

// ============================================================================
// SpriteManager 实现
// ============================================================================

export class SpriteManager {
  // 内部引擎实例
  private eventBus: SpriteEventBus;
  private stateMachine: SpriteStateMachine;
  private personaState: PersonaStateManager;
  private interactionTracker: InteractionTracker;
  private behaviorEngine: BehaviorEngine;
  private animationRegistry: AnimationRegistry;

  // 内建持久化
  private persistence: PersonaStatePersistence;
  private autoWalkConfig: AutoWalkConfig;

  // 语音合成服务
  private speakService: SpeakService;
  /** 防止 speak() → showToast() → speakService.speak() 递归 */
  private _speakGuard = false;

  // Electron 依赖
  private win: SpriteWindow;
  private getScreenSize: () => { width: number; height: number };

  // 当前动画和配置
  private currentAnimation: SpritePlayCommand | null = null;
  private spriteConfig: SpriteConfig = { width: 200, height: 200, padding: 100 };

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

  // 单例
  private static instance: SpriteManager | null = null;

  private constructor(options: SpriteManagerOptions) {
    this.win = options.win;
    this.getScreenSize = options.getScreenSize;

    // 创建引擎实例
    this.eventBus = new SpriteEventBus();
    this.stateMachine = new SpriteStateMachine({ eventBus: this.eventBus });
    this.personaState = new PersonaStateManager({
      eventBus: this.eventBus,
      initialState: { name: options.appName ?? 'Chobits' },
      onStateChange: () => this.onPersonaStateChange()
    });
    this.interactionTracker = new InteractionTracker({ eventBus: this.eventBus });
    this.behaviorEngine = new BehaviorEngine({
      eventBus: this.eventBus,
      stateMachine: this.stateMachine,
      tickIntervalMs: 1000
    });
    this.animationRegistry = new AnimationRegistry();

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
    // 1. 加载自动行走配置
    this.autoWalkConfig.load();

    // 2. 加载持久化的人格状态
    const saved = await this.persistence.load();
    if (saved) {
      this.personaState.loadState({
        name: saved.name,
        description: saved.description,
        xp: saved.xp,
        level: saved.level,
        favor: saved.favor,
        mood: saved.mood as any,
        moodIntensity: saved.moodIntensity,
        totalInteractions: saved.totalInteractions,
        totalSessionTime: saved.totalSessionTime,
        loginStreak: saved.loginStreak,
        lastLoginDate: saved.lastLoginDate,
        achievements: JSON.parse(saved.achievements || '[]'),
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt
      });
    }

    // 3. 启动自动保存
    this.persistence.startAutoSave(() => this.getPersonaStateForPersistence());

    // 4. 注册默认行为
    registerDefaultBehaviors(this);

    // 5. 初始化语音合成服务
    await this.speakService.init();

    // 6. 启动行为引擎
    this.behaviorEngine.start();

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

    // 保存最终状态
    await this.persistence.save(this.getPersonaStateForPersistence());

    // 清理所有子系统
    this.behaviorEngine.destroy();
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
  transitionTo(state: SpriteState, options?: { subState?: SpriteSubState; metadata?: Record<string, any>; force?: boolean }): boolean {
    return this.stateMachine.transitionTo(state, options);
  }

  /** 播放一次临时状态 */
  playOnce(subState: SpriteSubState, options?: { durationMs?: number; fallback?: SpriteState; metadata?: Record<string, any> }): boolean {
    return this.stateMachine.playOnce(subState, options);
  }

  // ============================================================================
  // 统一事件触发
  // ============================================================================

  /**
   * 统一触发精灵事件
   *
   * 根据 eventType 尝试播放对应动画 + 显示气泡文案。
   * 如果 AnimationRegistry 中没有匹配动画，则仅显示气泡文字。
   * 这是为所有 SpriteEventType 提供统一触发入口的核心方法。
   */
  trigger(
    eventType: string,
    options?: {
      message?: string;
      duration?: number;
      durationMs?: number;
      ctx?: any;
      silent?: boolean;
    }
  ): void {
    // 1. 尝试查找并播放动画
    const anim = this.animationRegistry.findByEvent({ eventType });
    if (anim) {
      this.currentAnimation = {
        animationId: anim.id,
        source: anim.source,
        playback: anim.playback
          ? {
            width: anim.playback.width,
            height: anim.playback.height,
            padding: anim.playback.padding,
            loop: anim.playback.loop,
            loopStartMs: anim.playback.loopStartMs,
            loopEndMs: anim.playback.loopEndMs,
            durationMs: options?.durationMs ?? anim.playback.durationMs,
            autoIdle: anim.playback.autoIdle ?? true
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
    }

    // 2. 显示气泡文案（除非 silent）
    if (!options?.silent) {
      const text = options?.message || getSpriteEventText(eventType, options?.ctx);
      if (text) {
        this.showToast(text, { duration: options?.duration });
      }
    }
  }

  /**
   * 按动画 ID 直接播放指定动画（用于开发测试）。
   * 不经过 eventType 查找，直接从 AnimationRegistry 取出并播放。
   */
  triggerById(animationId: string, options?: { message?: string; duration?: number; durationMs?: number; silent?: boolean }): boolean {
    const anim = this.animationRegistry.get(animationId);
    if (!anim) return false;

    this.currentAnimation = {
      animationId: anim.id,
      source: anim.source,
      playback: anim.playback
        ? {
          width: anim.playback.width,
          height: anim.playback.height,
          padding: anim.playback.padding,
          loop: anim.playback.loop,
          loopStartMs: anim.playback.loopStartMs,
          loopEndMs: anim.playback.loopEndMs,
          durationMs: options?.durationMs ?? anim.playback.durationMs,
          autoIdle: anim.playback.autoIdle ?? true
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
  getSubState(): SpriteSubState | null {
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

  /** 轻量提示 */
  showToast(content?: string, options?: { category?: MessageCategory; duration?: number; level?: string; ctx?: any }): void {
    const payload: MessageIPCPayload = {
      type: 'toast',
      content,
      category: options?.category,
      duration: options?.duration,
      level: options?.level as any,
      ctx: options?.ctx
    };
    this.sendToRenderer('sprite:message', payload);

    // 自动朗读：非静默类别 且 非来自 speak() 的调用
    if (!this._speakGuard && !SpriteManager.MUTE_CATEGORIES.has(options?.category ?? '')) {
      const speakText = content || (options?.category ? Messages.t(options.category, options?.ctx) : '');
      if (speakText) {
        this.speakService.speak(speakText).catch(() => { });
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
    this.sendToRenderer('sprite:message', payload);

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
    this.sendToRenderer('sprite:message', payload);
  }

  /** 更新忙碌进度 */
  updateBusy(progress: number, content?: string): void {
    this.sendToRenderer('sprite:busy:update', { progress, message: content });
  }

  /** 清除忙碌状态 */
  clearBusy(): void {
    this.sendToRenderer('sprite:busy:clear', {});
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

  /** 设置心情 */
  setMood(mood: MoodType, intensity?: number): void {
    this.personaState.setMood(mood, intensity);
    this.persistence.markDirty();
  }

  /** 获取完整人格状态 */
  getPersonaState(): PersonaState {
    return this.personaState.getState();
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
  reportInteraction(type: InteractionType, data?: Record<string, any>): void {
    this.interactionTracker.record(type, data);

    // 同步触发事件总线
    const eventMap: Record<string, string> = {
      click: 'interact:click',
      'double-click': 'interact:double-click',
      drag: 'interact:drag:end',
      hold: 'interact:hold:end',
      hover: 'interact:hover:enter',
      'file-drag-over': 'interact:file-drag-over',
      'file-drag-leave': 'interact:file-drag-leave',
      'file-drop': 'interact:file-drop',
      'context-menu': 'interact:context-menu'
    };

    const eventType = eventMap[type];
    if (eventType) {
      this.eventBus.emit(eventType as any, data, 'sprite-manager');
    }

    // file-drag-over → 切换到 reacting/file-drag-over（持续到 drag-leave 或 file-drop）
    if (type === 'file-drag-over' && this.getState() !== 'dragging') {
      this.transitionTo('reacting', { subState: 'file-drag-over', force: true });
      return;
    }

    // file-drag-leave / file-drop → 从 file-drag-over 回到 idle
    if ((type === 'file-drag-leave' || type === 'file-drop') && this.getState() === 'reacting' && this.getSubState() === 'file-drag-over') {
      this.transitionTo('idle', { force: true });
      return;
    }

    // 自动触发临时反应状态
    const reactionMap: Record<string, SpriteSubState> = {
      click: 'click',
      hold: 'hold',
      'file-drop': 'file-drop'
    };
    const subState = reactionMap[type];
    if (subState && this.getState() !== 'dragging') {
      this.playOnce(subState, { durationMs: 800 });
    }

    // 根据交互类型显示对应文案
    const toastCategoryMap: Partial<Record<InteractionType, MessageCategory>> = {
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
  async walkTo(x: number, y: number): Promise<void> {
    if (this.windowController) {
      await this.windowController.walkTo(x, y);
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
    this.showToast(undefined, { category: 'hold' });
  }

  /** 结束拖拽 */
  endDrag(): void {
    if (this.windowController) {
      this.windowController.endDrag();
    }
    this.transitionTo('idle');
    this.reportInteraction('drag');
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

  /** 注册动画到 Registry */
  registerAnimation(anim: SpriteAnimation): void {
    this.animationRegistry.register({
      id: anim.meta.id,
      title: anim.meta.title,
      description: anim.meta.description,
      eventTypes: [anim.meta.eventType ?? 'idle'],
      source: anim.source,
      playback: {
        width: anim.width,
        height: anim.height,
        padding: anim.padding,
        loop: anim.loop,
        loopStartMs: anim.loopStartMs,
        loopEndMs: anim.loopEndMs,
        durationMs: anim.durationMs,
        autoIdle: anim.autoIdle
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

  /** 注销动画 */
  unregisterAnimation(id: string): void {
    this.animationRegistry.unregister(id);
  }

  // ============================================================================
  // 配置
  // ============================================================================

  /** 获取精灵配置 */
  getSpriteConfig(): SpriteConfig {
    return { ...this.spriteConfig };
  }

  /** 设置精灵配置 */
  setSpriteConfig(config: Partial<SpriteConfig>): void {
    Object.assign(this.spriteConfig, config);
    this.sendToRenderer('sprite:config', this.spriteConfig);
  }

  /** 自动行走是否启用 */
  isAutoWalkEnabled(): boolean {
    return this.autoWalkConfig.enabled;
  }

  /** 设置自动行走开关 */
  setAutoWalkEnabled(enabled: boolean): void {
    this.autoWalkConfig.enabled = enabled;
    if (!enabled) {
      this.stopWalk();
    }
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
  handleAnimationComplete(animId: string, phase: 'intro' | 'loop' | 'outro' | 'full'): void {
    this.eventBus.emit('anim:complete', { animId, phase }, 'renderer');

    if ((phase === 'outro' || phase === 'full') && this._pendingIdleAfterOutro) {
      this._pendingIdleAfterOutro = false;
      this.resolveAndSendAnimation(this.getState(), this.getSubState());
      return;
    }

    if (phase === 'full' || phase === 'outro') {
      const state = this.getState();
      if (state === 'reacting') {
        this.transitionTo('idle');
      }
    }
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
        this.showToast(undefined, { category: 'welcome' });
      }, 500);
    }
  }

  // ============================================================================
  // 行为注册
  // ============================================================================

  /** 注册自定义行为 */
  registerBehavior(behavior: BehaviorDefinition): void {
    this.behaviorEngine.register(behavior);
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

  // ============================================================================
  // 内部方法
  // ============================================================================

  /** 状态机变化回调 */
  private onStateChange(newState: SpriteState, _oldState: SpriteState, subState: SpriteSubState | null): void {
    if (newState === 'idle' && _oldState !== 'idle' && this.currentAnimation?.playback?.loopStartMs != null && this.currentAnimation?.playback?.loopEndMs != null) {
      this._pendingIdleAfterOutro = true;
      this.broadcastState();
      setTimeout(() => {
        if (this._pendingIdleAfterOutro) {
          this._pendingIdleAfterOutro = false;
          this.resolveAndSendAnimation(this.getState(), this.getSubState());
        }
      }, 3000);
      return;
    }

    this._pendingIdleAfterOutro = false;
    this.resolveAndSendAnimation(newState, subState);

    this.broadcastState();
  }

  /** 根据当前状态解析并发送动画指令到渲染进程 */
  private resolveAndSendAnimation(state: SpriteState, subState: SpriteSubState | null): void {
    const eventType = mapStateToEventType(state, subState);
    const animEntry = this.animationRegistry.findByEvent({
      eventType,
      personaState: this.personaState.getState()
    });

    if (animEntry) {
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
            autoIdle: animEntry.playback.autoIdle
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
      id: 'default',
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
      achievements: JSON.stringify(state.achievements),
      createdAt: state.createdAt,
      updatedAt: state.updatedAt
    };
  }
}
