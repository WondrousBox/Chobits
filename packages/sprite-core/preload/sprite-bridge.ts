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
import type { SpritePurposeDailyRetrospective, SpritePurposeRetrospectiveQuery, SpritePurposeRuntimeEventInput, SpritePurposeStartResult, StartSpritePurposeRequest } from '../purpose';
import type { SpeakResult, SpriteRealtimeSpeechEvent, SpriteRealtimeSpeechHandle, SpriteRealtimeSpeechSessionRequest, SpriteRealtimeSpeechSessionStartResult, SpriteSpeakConfig } from '../speak/types';
import type { SpriteAnimation, SpriteAnimationPlaylistMode, SpriteAnimationTrigger, SpriteBubbleMode, SpriteTriggerOptions } from '../types';

export type SpriteBridgeType = {
  // 动画管理 (原有)
  list(): Promise<SpriteAnimation[]>;
  register(anim: Partial<SpriteAnimation> & { filePath?: string }): Promise<SpriteAnimation>;
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

  getSpontaneousUtterancePreferences(): Promise<SpriteSpontaneousUtterancePreferences | null>;
  updateSpontaneousUtterancePreferences(patch: Partial<SpriteSpontaneousUtterancePreferences>): Promise<SpriteSpontaneousUtterancePreferences | null>;
  listSpontaneousUtteranceHistory(query?: SpriteSpontaneousUtteranceHistoryQuery): Promise<SpriteSpontaneousUtteranceHistoryItem[]>;

  // 语音合成 (Speak)
  speak(text: string, options?: { bubbleEnabled?: boolean; bubbleDuration?: number }): Promise<SpeakResult>;
  getSpeakConfig(): Promise<SpriteSpeakConfig>;
  startRealtimeSpeechSession(request: SpriteRealtimeSpeechSessionRequest): Promise<SpriteRealtimeSpeechHandle>;

  // 统一事件触发
  trigger(trigger: SpriteAnimationTrigger, options?: SpriteTriggerOptions): Promise<void>;
  // 按动画 ID 测试播放（开发调试用）
  testAnimation(animationId: string, options?: SpriteTriggerOptions): Promise<boolean>;

  // Purpose / Routine 编排
  startPurpose(request: StartSpritePurposeRequest): Promise<SpritePurposeStartResult>;
  emitPurposeEvent(event: SpritePurposeRuntimeEventInput): Promise<{ matched: number }>;
  getPurposeDailyRetrospective(query?: SpritePurposeRetrospectiveQuery): Promise<SpritePurposeDailyRetrospective>;

  setSpeakConfig(config: Partial<SpriteSpeakConfig>): Promise<SpriteSpeakConfig>;
  getSpeakCacheStats(): Promise<{ totalEntries: number; totalSizeBytes: number }>;
  clearSpeakCache(): Promise<{ ok: boolean }>;

  // 事件订阅
  onPlay(cb: (data: any) => void): () => void;
  onState(cb: (data: any) => void): () => void;
  onWalk(cb: (data: any) => void): () => void;
  onConfig(cb: (data: any) => void): () => void;
  /** 监听语音播放事件（主进程合成完成后触发） */
  onSpeak(cb: (data: { text: string; audioPath: string; cacheId: string; volume: number }) => void): () => void;
};

export const spriteBridge: SpriteBridgeType = {
  // ── 动画管理 (原有) ──────────────────────────────────────
  list: () => ipcRenderer.invoke('sprite:list'),
  register: (anim) => ipcRenderer.invoke('sprite:register', anim),
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

  getSpontaneousUtterancePreferences: () => ipcRenderer.invoke('sprite:spontaneous:get-preferences'),
  updateSpontaneousUtterancePreferences: (patch) => ipcRenderer.invoke('sprite:spontaneous:update-preferences', patch),
  listSpontaneousUtteranceHistory: (query) => ipcRenderer.invoke('sprite:spontaneous:list-history', query),

  // ── 语音合成 (Speak) ──────────────────────────────────────
  speak: (text, options) => ipcRenderer.invoke('sprite:speak', { text, bubbleEnabled: options?.bubbleEnabled, bubbleDuration: options?.bubbleDuration }),
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
  getSpeakCacheStats: () => ipcRenderer.invoke('sprite:speak:get-cache-stats'),
  clearSpeakCache: () => ipcRenderer.invoke('sprite:speak:clear-cache'),

  // ── 统一事件触发 ───────────────────────────────────────
  trigger: (trigger, options) => ipcRenderer.invoke('sprite:trigger', { trigger, ...options }),
  testAnimation: (animationId, options) => ipcRenderer.invoke('sprite:trigger-by-id', { animationId, ...options }),

  // ── Purpose / Routine 编排 ──────────────────────────────
  startPurpose: (request) => ipcRenderer.invoke('sprite:purpose:start', request),
  emitPurposeEvent: (event) => ipcRenderer.invoke('sprite:purpose:event', event),
  getPurposeDailyRetrospective: (query) => ipcRenderer.invoke('sprite:purpose:get-daily-retrospective', query),

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
  onSpeak: (cb) => {
    const handler = (_: any, data: any): void => cb(data);
    ipcRenderer.on('sprite:speak-started', handler);
    return () => {
      ipcRenderer.off('sprite:speak-started', handler);
    };
  }
};
