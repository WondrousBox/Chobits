/**
 * Sprite Preload Bridge
 *
 * window.chobits.sprite.* 接口
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
  SpriteMovementPreviewConfig,
  SpriteTriggerOptions
} from '../types';
import { MESSAGE_IPC_CHANNELS, SPRITE_EFFECT_IPC_CHANNELS } from '../types';
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
  getDebugOverlay(): Promise<boolean>;
  setDebugOverlay(enabled: boolean): Promise<boolean>;
  getAnimationPlaylistMode(trigger?: SpriteAnimationTrigger): Promise<SpriteAnimationPlaylistMode>;
  setAnimationPlaylistMode(mode: SpriteAnimationPlaylistMode, trigger?: SpriteAnimationTrigger): Promise<SpriteAnimationPlaylistMode>;
  getBubbleMode(): Promise<SpriteBubbleMode>;
  setBubbleMode(mode: SpriteBubbleMode): Promise<SpriteBubbleMode>;

  // 气泡跟随窗口控制
  bubbleResize(width: number, height: number): Promise<{ ok: boolean; error?: string }>;
  bubbleSetVisible(visible: boolean): Promise<{ ok: boolean; error?: string }>;

  // 特效跟随窗口与桥接事件
  effectResize(width: number, height: number): Promise<{ ok: boolean; error?: string }>;
  effectSetVisible(visible: boolean): Promise<{ ok: boolean; error?: string }>;
  effectShow(payload: SpriteEffectPayload): Promise<{ ok: boolean; error?: string }>;
  effectClear(payload?: SpriteEffectClearPayload): Promise<{ ok: boolean; error?: string }>;
  getSpontaneousUtterancePreferences(): Promise<SpriteSpontaneousUtterancePreferences | null>;
  updateSpontaneousUtterancePreferences(patch: Partial<SpriteSpontaneousUtterancePreferences>): Promise<SpriteSpontaneousUtterancePreferences | null>;
  listSpontaneousUtteranceHistory(query?: SpriteSpontaneousUtteranceHistoryQuery): Promise<SpriteSpontaneousUtteranceHistoryItem[]>;

  // 窗口移动预览
  previewMovement(config: SpriteMovementPreviewConfig): Promise<void>;
  stopMovementPreview(): Promise<void>;
  setMovementAvoidRegions(regions: WindowControllerAvoidRegion[]): Promise<{ ok: boolean }>;

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
  addTempResourceRoot(root: string): Promise<{ ok: boolean }>;
  setSpeakConfig(config: Partial<SpriteSpeakConfig>): Promise<SpriteSpeakConfig>;
  resetSpeakConfig(): Promise<SpriteSpeakConfig>;
  getSpeakCacheStats(): Promise<{ totalEntries: number; totalSizeBytes: number }>;
  clearSpeakCache(): Promise<{ ok: boolean }>;

  // 事件订阅
  onPlay(cb: (data: any) => void): () => void;
  onState(cb: (data: any) => void): () => void;
  onMessage(cb: (data: any) => void): () => void;
  onEffect(cb: (data: SpriteEffectBridgePayload) => void): () => void;
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
  listByTrigger: (trigger) => ipcRenderer.invoke('sprite:list-by-trigger', { trigger }),
  get: (id) => ipcRenderer.invoke('sprite:get', { id }),
  register: (anim) => ipcRenderer.invoke('sprite:register', anim),
  registerFromData: (payload) => ipcRenderer.invoke('sprite:register-from-data', payload),
  remove: (id, deleteFile) => ipcRenderer.invoke('sprite:remove', { id, deleteFile }),
  updateConfig: (id, patch) => ipcRenderer.invoke('sprite:update-config', { id, patch }),
  updateMeta: (id, meta) => ipcRenderer.invoke('sprite:update-meta', { id, meta }),

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
  getDebugOverlay: () => ipcRenderer.invoke('sprite:config:get-debug-overlay'),
  setDebugOverlay: (enabled) => ipcRenderer.invoke('sprite:config:set-debug-overlay', { enabled }),
  getAnimationPlaylistMode: (trigger) => (trigger ? ipcRenderer.invoke('sprite:config:get-animation-playlist-mode', { trigger }) : ipcRenderer.invoke('sprite:config:get-animation-playlist-mode')),
  setAnimationPlaylistMode: (mode, trigger) => ipcRenderer.invoke('sprite:config:set-animation-playlist-mode', trigger ? { mode, trigger } : { mode }),
  getBubbleMode: () => ipcRenderer.invoke('sprite:config:get-bubble-mode'),
  setBubbleMode: (mode) => ipcRenderer.invoke('sprite:config:set-bubble-mode', { mode }),

  // 气泡跟随窗口控制
  bubbleResize: (width, height) => ipcRenderer.invoke('sprite:bubble:resize', { width, height }),
  bubbleSetVisible: (visible) => ipcRenderer.invoke('sprite:bubble:set-visible', { visible }),

  // 特效跟随窗口与桥接事件
  effectResize: (width, height) => ipcRenderer.invoke('sprite:effect:resize', { width, height }),
  effectSetVisible: (visible) => ipcRenderer.invoke('sprite:effect:set-visible', { visible }),
  effectShow: (payload) => ipcRenderer.invoke(SPRITE_EFFECT_IPC_CHANNELS.SHOW, payload),
  effectClear: (payload) => ipcRenderer.invoke(SPRITE_EFFECT_IPC_CHANNELS.CLEAR, payload ?? { type: 'all' }),
  getSpontaneousUtterancePreferences: () => ipcRenderer.invoke('sprite:spontaneous:get-preferences'),
  updateSpontaneousUtterancePreferences: (patch) => ipcRenderer.invoke('sprite:spontaneous:update-preferences', patch),
  listSpontaneousUtteranceHistory: (query) => ipcRenderer.invoke('sprite:spontaneous:list-history', query),
  previewMovement: (config) => ipcRenderer.invoke('sprite:preview-movement', config),
  stopMovementPreview: () => ipcRenderer.invoke('sprite:stop-movement-preview'),
  setMovementAvoidRegions: (regions) => ipcRenderer.invoke('sprite:movement:set-avoid-regions', { regions }),

  // ── 语音合成 (Speak) ──────────────────────────────────────
  speak: (text, options) => ipcRenderer.invoke('sprite:speak', { text, showBubble: options?.showBubble, bubbleDuration: options?.bubbleDuration }),
  synthesizeSpeech: (text) => ipcRenderer.invoke('sprite:speak:synthesize', { text }),
  getSpeakConfig: () => ipcRenderer.invoke('sprite:speak:get-config'),
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
        await ipcRenderer.invoke('sprite:speak:realtime:append-text', { sessionId: res.sessionId, text });
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
  setSpeakConfig: (config) => ipcRenderer.invoke('sprite:speak:set-config', config),
  resetSpeakConfig: () => ipcRenderer.invoke('sprite:speak:reset-config'),
  getSpeakCacheStats: () => ipcRenderer.invoke('sprite:speak:get-cache-stats'),
  clearSpeakCache: () => ipcRenderer.invoke('sprite:speak:clear-cache'),

  // ── 统一事件触发 ───────────────────────────────────────
  trigger: (trigger, options) => ipcRenderer.invoke('sprite:trigger', { trigger, ...options }),
  playFeedback: (request) => ipcRenderer.invoke('sprite:feedback:play', request),
  testAnimation: (animationId, options) => ipcRenderer.invoke('sprite:trigger-by-id', { animationId, ...options }),

  // ── Purpose / Routine 编排 ──────────────────────────────
  startPurpose: (request) => ipcRenderer.invoke('sprite:purpose:start', request),
  cancelPurpose: (purposeId, reason) => ipcRenderer.invoke('sprite:purpose:cancel', { purposeId, reason }),
  getPurposeSnapshot: () => ipcRenderer.invoke('sprite:purpose:get-snapshot'),
  emitPurposeEvent: (event) => ipcRenderer.invoke('sprite:purpose:event', event),
  listPurposeHistory: (query) => ipcRenderer.invoke('sprite:purpose:list-history', query),
  getPurposeDailyRetrospective: (query) => ipcRenderer.invoke('sprite:purpose:get-daily-retrospective', query),
  getPurposePlannerPreferences: () => ipcRenderer.invoke('sprite:purpose-planner:get-preferences'),
  updatePurposePlannerPreferences: (patch) => ipcRenderer.invoke('sprite:purpose-planner:update-preferences', patch),
  getPurposePlannerStatus: () => ipcRenderer.invoke('sprite:purpose-planner:get-status'),
  confirmNotice: (request) => ipcRenderer.invoke('sprite:message:confirm', request),

  // ── 临时资源根目录 ──────────────────────────────────────
  addTempResourceRoot: (root) => ipcRenderer.invoke('sprite:add-temp-resource-root', root),

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
