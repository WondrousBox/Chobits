/**
 * Sprite Preload Bridge
 *
 * window.YUA.sprite.* 接口
 * 包含原有动画管理 + 新增的交互上报/拖拽/状态订阅
 * + 语音合成 (speak) 功能
 */

import { ipcRenderer } from 'electron';

import type { SpriteInteractionIntent, SpriteInteractionPayload } from '../interaction-contract';
import type { SpriteSpontaneousUtteranceHistoryItem, SpriteSpontaneousUtteranceHistoryQuery, SpriteSpontaneousUtterancePreferences } from '../manager';
import type {
  SpritePurposeDailyRetrospective,
  SpritePurposeHistoryEntry,
  SpritePurposeHistoryQuery,
  SpritePurposePlannerPreferences,
  SpritePurposePlannerStatus,
  SpritePurposeRetrospectiveQuery,
  SpritePurposeRuntimeEventInput,
  SpritePurposeSnapshot,
  SpritePurposeStartResult,
  StartSpritePurposeRequest
} from '../purpose';
import type { SpeakResult, SpriteRealtimeSpeechEvent, SpriteRealtimeSpeechHandle, SpriteRealtimeSpeechSessionRequest, SpriteRealtimeSpeechSessionStartResult, SpriteSpeakConfig } from '../speak/types';
import type {
  AssistantEntrancePreparePayload,
  AssistantEntrancePrepareResult,
  AssistantEntranceRun,
  MessageBridgePayload,
  MessageIPCPayload,
  SpriteAnimation,
  SpriteAnimationPlaylistMode,
  SpriteAnimationTrigger,
  SpriteBubbleMode,
  SpriteConfirmNoticeRequest,
  SpriteConfirmNoticeResult,
  SpriteEffectBridgePayload,
  SpriteEffectClearPayload,
  SpriteEffectPayload,
  SpriteFeedbackRequest,
  SpriteFeedbackResult,
  SpriteMotionEffectCancelPayload,
  SpriteMotionEffectRun,
  SpriteMovementPreviewConfig,
  SpriteTriggerOptions
} from '../types';
import { ASSISTANT_ENTRANCE_IPC_CHANNELS, MESSAGE_IPC_CHANNELS, SPRITE_EFFECT_IPC_CHANNELS, SPRITE_MOTION_EFFECT_IPC_CHANNELS } from '../types';
import type { WindowControllerAvoidRegion } from '../window-controller-model';

function onMessageBridge(cb: (payload: MessageBridgePayload) => void): () => void {
  const handler = (_: any, payload: MessageBridgePayload): void => cb(payload);
  ipcRenderer.on(MESSAGE_IPC_CHANNELS.BRIDGE, handler);
  return () => {
    ipcRenderer.off(MESSAGE_IPC_CHANNELS.BRIDGE, handler);
  };
}

function onEffectBridge(cb: (payload: SpriteEffectBridgePayload) => void): () => void {
  const handler = (_: any, payload: SpriteEffectBridgePayload): void => cb(payload);
  ipcRenderer.on(SPRITE_EFFECT_IPC_CHANNELS.BRIDGE, handler);
  return () => {
    ipcRenderer.off(SPRITE_EFFECT_IPC_CHANNELS.BRIDGE, handler);
  };
}

function onAssistantEntranceStart(cb: (payload: AssistantEntranceRun) => void): () => void {
  const handler = (_: any, payload: AssistantEntranceRun): void => cb(payload);
  ipcRenderer.on(ASSISTANT_ENTRANCE_IPC_CHANNELS.START, handler);
  return () => {
    ipcRenderer.off(ASSISTANT_ENTRANCE_IPC_CHANNELS.START, handler);
  };
}

function onMotionEffectStart(cb: (payload: SpriteMotionEffectRun) => void): () => void {
  const handler = (_: any, payload: SpriteMotionEffectRun): void => cb(payload);
  ipcRenderer.on(SPRITE_MOTION_EFFECT_IPC_CHANNELS.START, handler);
  return () => ipcRenderer.off(SPRITE_MOTION_EFFECT_IPC_CHANNELS.START, handler);
}

function onMotionEffectCancel(cb: (payload: SpriteMotionEffectCancelPayload) => void): () => void {
  const handler = (_: any, payload: SpriteMotionEffectCancelPayload): void => cb(payload);
  ipcRenderer.on(SPRITE_MOTION_EFFECT_IPC_CHANNELS.CANCEL, handler);
  return () => ipcRenderer.off(SPRITE_MOTION_EFFECT_IPC_CHANNELS.CANCEL, handler);
}

export type SpriteBridgeType = {
  // 动画管理 (原有)
  list(): Promise<SpriteAnimation[]>;
  listByTrigger(trigger?: SpriteAnimationTrigger): Promise<SpriteAnimation[]>;
  get(id: string): Promise<SpriteAnimation | undefined>;
  register(anim: Partial<SpriteAnimation> & { filePath?: string }): Promise<SpriteAnimation>;
  registerFromData(payload: {
    data: ArrayBuffer;
    meta?: Partial<SpriteAnimation['meta']>;
    loopStartMs?: number;
    loopEndMs?: number;
    durationMs?: number;
    loop?: boolean;
    loopCount?: number;
    autoIdle?: boolean;
    width?: number;
    height?: number;
    padding?: number;
    movement?: SpriteAnimation['movement'];
  }): Promise<SpriteAnimation>;
  remove(id: string, deleteFile?: boolean): Promise<{ ok: boolean }>;
  updateConfig(
    id: string,
    patch: Partial<Pick<SpriteAnimation, 'width' | 'height' | 'padding' | 'loop' | 'loopCount' | 'autoIdle' | 'durationMs' | 'loopStartMs' | 'loopEndMs' | 'movement'>> & {
      meta?: Partial<SpriteAnimation['meta']>;
    }
  ): Promise<{ ok: boolean; item?: SpriteAnimation }>;
  updateMeta(id: string, meta: Partial<SpriteAnimation['meta']>): Promise<{ ok: boolean; item?: SpriteAnimation }>;

  // 交互上报
  interact(type: SpriteInteractionIntent, data?: SpriteInteractionPayload): Promise<void>;

  // 拖拽（主进程轮询光标，渲染进程仅发 start/end 信号）
  dragStart(offsetX: number, offsetY: number): Promise<void>;
  dragEnd(): Promise<void>;

  // 动画完成上报
  animComplete(animId: string, phase: string, playId?: string): Promise<void>;

  // 文件拖放
  fileDrop(files: any[], options?: { correlationId?: string }): Promise<SpritePurposeStartResult>;

  // 初始状态
  getInitialState(): Promise<any>;

  // 就绪通知
  ready(): Promise<void>;

  // 配置
  getAutoWalk(): Promise<boolean>;
  setAutoWalk(enabled: boolean): Promise<boolean>;
  getDebugOverlay(): Promise<boolean>;
  setDebugOverlay(enabled: boolean): Promise<boolean>;
  getAnimationPlaylistMode(trigger?: SpriteAnimationTrigger): Promise<SpriteAnimationPlaylistMode>;
  setAnimationPlaylistMode(mode: SpriteAnimationPlaylistMode, trigger?: SpriteAnimationTrigger): Promise<SpriteAnimationPlaylistMode>;
  getBubbleMode(): Promise<SpriteBubbleMode>;
  setBubbleMode(mode: SpriteBubbleMode): Promise<SpriteBubbleMode>;

  // 气泡跟随窗口控制
  bubbleResize(width: number, height: number): Promise<{ success: boolean; error?: string }>;
  bubbleSetVisible(visible: boolean): Promise<{ success: boolean; error?: string }>;

  // 特效跟随窗口与桥接事件
  effectResize(width: number, height: number): Promise<{ success: boolean; error?: string }>;
  effectSetVisible(visible: boolean): Promise<{ success: boolean; error?: string }>;
  effectShow(payload: SpriteEffectPayload): Promise<{ success: boolean; error?: string }>;
  effectClear(payload?: SpriteEffectClearPayload): Promise<{ success: boolean; error?: string }>;
  prepareEntrance(payload: AssistantEntrancePreparePayload): Promise<AssistantEntrancePrepareResult>;
  effectEntranceReady(): Promise<void>;
  completeEntrance(runId: string): Promise<void>;
  motionEffectReady(): Promise<void>;
  completeMotionEffect(runId: string): Promise<void>;
  getSpontaneousUtterancePreferences(): Promise<SpriteSpontaneousUtterancePreferences | null>;
  updateSpontaneousUtterancePreferences(patch: Partial<SpriteSpontaneousUtterancePreferences>): Promise<SpriteSpontaneousUtterancePreferences | null>;
  listSpontaneousUtteranceHistory(query?: SpriteSpontaneousUtteranceHistoryQuery): Promise<SpriteSpontaneousUtteranceHistoryItem[]>;

  // 窗口移动预览
  previewMovement(config: SpriteMovementPreviewConfig): Promise<void>;
  stopMovementPreview(): Promise<void>;
  setMovementAvoidRegions(regions: WindowControllerAvoidRegion[]): Promise<{ ok: boolean }>;
  warpTo(x: number, y: number): Promise<boolean>;
  cancelWarp(): Promise<void>;

  // 语音合成 (Speak)
  speak(text: string, options?: { showBubble?: boolean; bubbleDuration?: number }): Promise<SpeakResult>;
  synthesizeSpeech(text: string): Promise<SpeakResult>;
  getSpeakConfig(): Promise<SpriteSpeakConfig>;
  startRealtimeSpeechSession(request: SpriteRealtimeSpeechSessionRequest): Promise<SpriteRealtimeSpeechHandle>;

  // 统一事件触发
  trigger(trigger: SpriteAnimationTrigger, options?: SpriteTriggerOptions): Promise<void>;
  playFeedback(request: SpriteFeedbackRequest): Promise<SpriteFeedbackResult>;
  // 按动画 ID 测试播放（开发调试用）
  testAnimation(animationId: string, options?: SpriteTriggerOptions): Promise<boolean>;

  // Purpose / Routine 编排
  startPurpose(request: StartSpritePurposeRequest): Promise<SpritePurposeStartResult>;
  cancelPurpose(purposeId?: string, reason?: string): Promise<boolean>;
  getPurposeSnapshot(): Promise<SpritePurposeSnapshot>;
  emitPurposeEvent(event: SpritePurposeRuntimeEventInput): Promise<{ matched: number }>;
  listPurposeHistory(query?: SpritePurposeHistoryQuery): Promise<SpritePurposeHistoryEntry[]>;
  getPurposeDailyRetrospective(query?: SpritePurposeRetrospectiveQuery): Promise<SpritePurposeDailyRetrospective>;
  getPurposePlannerPreferences(): Promise<SpritePurposePlannerPreferences>;
  updatePurposePlannerPreferences(patch: Partial<SpritePurposePlannerPreferences>): Promise<SpritePurposePlannerPreferences>;
  getPurposePlannerStatus(): Promise<SpritePurposePlannerStatus>;
  confirmNotice(request: SpriteConfirmNoticeRequest): Promise<SpriteConfirmNoticeResult>;

  // 临时资源根目录（用于视频预览等场景）
  addTempResourceRoot(root: string): Promise<{ success: boolean }>;
  setSpeakConfig(config: Partial<SpriteSpeakConfig>): Promise<SpriteSpeakConfig>;
  resetSpeakConfig(): Promise<SpriteSpeakConfig>;
  getSpeakCacheStats(): Promise<{ totalEntries: number; totalSizeBytes: number }>;
  clearSpeakCache(): Promise<{ success: boolean }>;

  // 事件订阅
  onPlay(cb: (data: any) => void): () => void;
  onState(cb: (data: any) => void): () => void;
  onMessage(cb: (data: any) => void): () => void;
  onEffect(cb: (data: SpriteEffectBridgePayload) => void): () => void;
  onEntranceStart(cb: (data: AssistantEntranceRun) => void): () => void;
  onMotionEffectStart(cb: (data: SpriteMotionEffectRun) => void): () => void;
  onMotionEffectCancel(cb: (data: SpriteMotionEffectCancelPayload) => void): () => void;
  onWalk(cb: (data: any) => void): () => void;
  onConfig(cb: (data: any) => void): () => void;
  onPurposeState(cb: (data: SpritePurposeSnapshot) => void): () => void;
  onBusyUpdate(cb: (data: any) => void): () => void;
  onBusyClear(cb: () => void): () => void;
  /** 监听语音播放事件（主进程合成完成后触发） */
  onSpeak(cb: (data: { text: string; audioPath: string; cacheId: string; volume: number }) => void): () => void;
};

export const spriteBridge: SpriteBridgeType = {
  // ── 动画管理 (原有) ──────────────────────────────────────
  list: () => ipcRenderer.invoke('sprite:list'),
  listByTrigger: (trigger) => ipcRenderer.invoke('sprite:listByTrigger', { trigger }),
  get: (id) => ipcRenderer.invoke('sprite:get', { id }),
  register: (anim) => ipcRenderer.invoke('sprite:register', anim),
  registerFromData: (payload) => ipcRenderer.invoke('sprite:registerFromData', payload),
  remove: (id, deleteFile) => ipcRenderer.invoke('sprite:remove', { id, deleteFile }),
  updateConfig: (id, patch) => ipcRenderer.invoke('sprite:updateConfig', { id, patch }),
  updateMeta: (id, meta) => ipcRenderer.invoke('sprite:updateMeta', { id, meta }),

  // ── 交互上报 ─────────────────────────────────────────────
  interact: (type, data) => ipcRenderer.invoke('sprite:interact', { type, data }),

  // ── 拖拽（主进程轮询光标，渲染进程仅发 start/end 信号）────
  dragStart: (offsetX, offsetY) =>
    ipcRenderer.invoke('sprite:drag', {
      phase: 'start',
      offsetX,
      offsetY
    }),
  dragEnd: () => ipcRenderer.invoke('sprite:drag', { phase: 'end' }),

  // ── 动画完成上报 ─────────────────────────────────────────
  animComplete: (animId, phase, playId) => ipcRenderer.invoke('sprite:anim-complete', { animId, phase, playId }),

  // ── 文件拖放 ─────────────────────────────────────────────
  fileDrop: (files, options) => ipcRenderer.invoke('sprite:file-drop', { files, correlationId: options?.correlationId }),

  // ── 初始状态 ─────────────────────────────────────────────
  getInitialState: () => ipcRenderer.invoke('sprite:get-initial-state'),

  // ── 就绪通知 ─────────────────────────────────────────────
  ready: () => ipcRenderer.invoke('sprite:ready'),

  // ── 配置 ─────────────────────────────────────────────────
  getAutoWalk: () => ipcRenderer.invoke('sprite:config:getAutoWalk'),
  setAutoWalk: (enabled) => ipcRenderer.invoke('sprite:config:setAutoWalk', { enabled }),
  getDebugOverlay: () => ipcRenderer.invoke('sprite:config:getDebugOverlay'),
  setDebugOverlay: (enabled) => ipcRenderer.invoke('sprite:config:setDebugOverlay', { enabled }),
  getAnimationPlaylistMode: (trigger) => (trigger ? ipcRenderer.invoke('sprite:config:getAnimationPlaylistMode', { trigger }) : ipcRenderer.invoke('sprite:config:getAnimationPlaylistMode')),
  setAnimationPlaylistMode: (mode, trigger) => ipcRenderer.invoke('sprite:config:setAnimationPlaylistMode', trigger ? { mode, trigger } : { mode }),
  getBubbleMode: () => ipcRenderer.invoke('sprite:config:getBubbleMode'),
  setBubbleMode: (mode) => ipcRenderer.invoke('sprite:config:setBubbleMode', { mode }),

  // 气泡跟随窗口控制
  bubbleResize: (width, height) => ipcRenderer.invoke('sprite:bubble:resize', { width, height }),
  bubbleSetVisible: (visible) => ipcRenderer.invoke('sprite:bubble:setVisible', { visible }),

  // 特效跟随窗口与桥接事件
  effectResize: (width, height) => ipcRenderer.invoke('sprite:effect:resize', { width, height }),
  effectSetVisible: (visible) => ipcRenderer.invoke('sprite:effect:setVisible', { visible }),
  effectShow: (payload) => ipcRenderer.invoke(SPRITE_EFFECT_IPC_CHANNELS.SHOW, payload),
  effectClear: (payload) => ipcRenderer.invoke(SPRITE_EFFECT_IPC_CHANNELS.CLEAR, payload ?? { type: 'all' }),
  prepareEntrance: (payload) => ipcRenderer.invoke(ASSISTANT_ENTRANCE_IPC_CHANNELS.PREPARE, payload),
  effectEntranceReady: () => ipcRenderer.invoke(ASSISTANT_ENTRANCE_IPC_CHANNELS.EFFECT_READY),
  completeEntrance: (runId) => ipcRenderer.invoke(ASSISTANT_ENTRANCE_IPC_CHANNELS.COMPLETE, { runId }),
  motionEffectReady: () => ipcRenderer.invoke(SPRITE_MOTION_EFFECT_IPC_CHANNELS.READY),
  completeMotionEffect: (runId) => ipcRenderer.invoke(SPRITE_MOTION_EFFECT_IPC_CHANNELS.COMPLETE, { runId }),
  getSpontaneousUtterancePreferences: () => ipcRenderer.invoke('sprite:spontaneous:getPreferences'),
  updateSpontaneousUtterancePreferences: (patch) => ipcRenderer.invoke('sprite:spontaneous:updatePreferences', patch),
  listSpontaneousUtteranceHistory: (query) => ipcRenderer.invoke('sprite:spontaneous:listHistory', query),
  previewMovement: (config) => ipcRenderer.invoke('sprite:previewMovement', config),
  stopMovementPreview: () => ipcRenderer.invoke('sprite:stopMovementPreview'),
  setMovementAvoidRegions: (regions) => ipcRenderer.invoke('sprite:movement:setAvoidRegions', { regions }),
  warpTo: (x, y) => ipcRenderer.invoke('sprite:movement:warpTo', { x, y }),
  cancelWarp: () => ipcRenderer.invoke('sprite:movement:cancelWarp'),

  // ── 语音合成 (Speak) ──────────────────────────────────────
  speak: (text, options) => ipcRenderer.invoke('sprite:speak', { text, showBubble: options?.showBubble, bubbleDuration: options?.bubbleDuration }),
  synthesizeSpeech: (text) => ipcRenderer.invoke('sprite:speak:synthesize', { text }),
  getSpeakConfig: () => ipcRenderer.invoke('sprite:speak:getConfig'),
  startRealtimeSpeechSession: async (request) => {
    const res = (await ipcRenderer.invoke('sprite:speak:realtime:start', request)) as SpriteRealtimeSpeechSessionStartResult;
    const listeners = new Set<(event: SpriteRealtimeSpeechEvent) => void>();
    let active = true;
    const handler = (_event: any, data: SpriteRealtimeSpeechEvent): void => {
      listeners.forEach((cb) => {
        try {
          cb(data);
        } catch {
          //
        }
      });
      if (data.type === 'done' || data.type === 'error') {
        cleanup();
      }
    };
    ipcRenderer.on(res.eventsChannel, handler);

    const cleanup = (): void => {
      active = false;
      try {
        ipcRenderer.off(res.eventsChannel, handler);
      } catch {
        //
      }
      listeners.clear();
    };

    const api: SpriteRealtimeSpeechHandle = {
      sessionId: res.sessionId,
      appendText: async (text) => {
        if (!active) return;
        await ipcRenderer.invoke('sprite:speak:realtime:appendText', { sessionId: res.sessionId, text });
      },
      flush: async () => {
        if (!active) return;
        await ipcRenderer.invoke('sprite:speak:realtime:flush', { sessionId: res.sessionId });
      },
      finish: async () => {
        if (!active) return;
        await ipcRenderer.invoke('sprite:speak:realtime:finish', { sessionId: res.sessionId });
      },
      cancel: async () => {
        if (!active) return;
        await ipcRenderer.invoke('sprite:speak:realtime:cancel', { sessionId: res.sessionId });
      },
      on: (cb) => {
        listeners.add(cb);
        return () => {
          listeners.delete(cb);
        };
      },
      off: (cb) => {
        listeners.delete(cb);
      },
      dispose: cleanup
    };

    return api;
  },
  setSpeakConfig: (config) => ipcRenderer.invoke('sprite:speak:setConfig', config),
  resetSpeakConfig: () => ipcRenderer.invoke('sprite:speak:resetConfig'),
  getSpeakCacheStats: () => ipcRenderer.invoke('sprite:speak:getCacheStats'),
  clearSpeakCache: () => ipcRenderer.invoke('sprite:speak:clearCache'),

  // ── 统一事件触发 ───────────────────────────────────────
  trigger: (trigger, options) => ipcRenderer.invoke('sprite:trigger', { trigger, ...options }),
  playFeedback: (request) => ipcRenderer.invoke('sprite:feedback:play', request),
  testAnimation: (animationId, options) => ipcRenderer.invoke('sprite:triggerById', { animationId, ...options }),

  // ── Purpose / Routine 编排 ──────────────────────────────
  startPurpose: (request) => ipcRenderer.invoke('sprite:purpose:start', request),
  cancelPurpose: (purposeId, reason) => ipcRenderer.invoke('sprite:purpose:cancel', { purposeId, reason }),
  getPurposeSnapshot: () => ipcRenderer.invoke('sprite:purpose:getSnapshot'),
  emitPurposeEvent: (event) => ipcRenderer.invoke('sprite:purpose:event', event),
  listPurposeHistory: (query) => ipcRenderer.invoke('sprite:purpose:listHistory', query),
  getPurposeDailyRetrospective: (query) => ipcRenderer.invoke('sprite:purpose:getDailyRetrospective', query),
  getPurposePlannerPreferences: () => ipcRenderer.invoke('sprite:purposePlanner:getPreferences'),
  updatePurposePlannerPreferences: (patch) => ipcRenderer.invoke('sprite:purposePlanner:updatePreferences', patch),
  getPurposePlannerStatus: () => ipcRenderer.invoke('sprite:purposePlanner:getStatus'),
  confirmNotice: (request) => ipcRenderer.invoke('sprite:message:confirm', request),

  // ── 临时资源根目录 ──────────────────────────────────────
  addTempResourceRoot: (root) => ipcRenderer.invoke('sprite:addTempResourceRoot', root),

  // ── 事件订阅 ─────────────────────────────────────────────
  onPlay: (cb) => {
    const handler = (_: any, data: any): void => cb(data);
    ipcRenderer.on('sprite:play', handler);
    return () => {
      ipcRenderer.off('sprite:play', handler);
    };
  },
  onState: (cb) => {
    const handler = (_: any, data: any): void => cb(data);
    ipcRenderer.on('sprite:state', handler);
    return () => {
      ipcRenderer.off('sprite:state', handler);
    };
  },
  onMessage: (cb) =>
    onMessageBridge((event) => {
      if (event.source !== 'sprite' || event.kind !== 'show') return;
      cb(event.payload as MessageIPCPayload);
    }),
  onEffect: (cb) => onEffectBridge(cb),
  onEntranceStart: (cb) => onAssistantEntranceStart(cb),
  onMotionEffectStart: (cb) => onMotionEffectStart(cb),
  onMotionEffectCancel: (cb) => onMotionEffectCancel(cb),
  onWalk: (cb) => {
    const handler = (_: any, data: any): void => cb(data);
    ipcRenderer.on('sprite:walk', handler);
    return () => {
      ipcRenderer.off('sprite:walk', handler);
    };
  },
  onConfig: (cb) => {
    const handler = (_: any, data: any): void => cb(data);
    ipcRenderer.on('sprite:config', handler);
    return () => {
      ipcRenderer.off('sprite:config', handler);
    };
  },
  onPurposeState: (cb) => {
    const handler = (_: any, data: SpritePurposeSnapshot): void => cb(data);
    ipcRenderer.on('sprite:purpose:state', handler);
    return () => {
      ipcRenderer.off('sprite:purpose:state', handler);
    };
  },
  onBusyUpdate: (cb) =>
    onMessageBridge((event) => {
      if (event.source !== 'sprite' || event.kind !== 'show' || event.payload.type !== 'busy') return;
      cb({
        progress: event.payload.progress,
        message: event.payload.content
      });
    }),
  onBusyClear: (cb) =>
    onMessageBridge((event) => {
      if (event.source !== 'sprite' || event.kind !== 'clear') return;
      if (event.payload.type === 'busy' || event.payload.type === 'all' || event.payload.type === undefined) {
        cb();
      }
    }),
  onSpeak: (cb) => {
    const handler = (_: any, data: any): void => cb(data);
    ipcRenderer.on('sprite:speak', handler);
    return () => {
      ipcRenderer.off('sprite:speak', handler);
    };
  }
};
