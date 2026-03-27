/**
 * Sprite Preload Bridge
 *
 * window.YUA.sprite.* 接口
 * 包含原有动画管理 + 新增的交互上报/拖拽/状态订阅
 * + 语音合成 (speak) 功能
 */

import { ipcRenderer } from 'electron';

import type { SpeakResult, SpriteSpeakConfig } from '../speak/types';
import type { SpriteAnimation } from '../types';

export type SpriteBridgeType = {
  // 动画管理 (原有)
  list(): Promise<SpriteAnimation[]>;
  listByEvent(eventType?: string): Promise<SpriteAnimation[]>;
  get(id: string): Promise<SpriteAnimation | undefined>;
  register(anim: Partial<SpriteAnimation> & { filePath?: string }): Promise<SpriteAnimation>;
  registerFromData(payload: {
    data: ArrayBuffer;
    meta?: Partial<SpriteAnimation['meta']>;
    loopStartMs?: number;
    loopEndMs?: number;
    durationMs?: number;
    width?: number;
    height?: number;
  }): Promise<SpriteAnimation>;
  remove(id: string, deleteFile?: boolean): Promise<{ ok: boolean }>;
  updateMeta(id: string, meta: Partial<SpriteAnimation['meta']>): Promise<{ ok: boolean; item?: SpriteAnimation }>;

  // 交互上报
  interact(type: string, data?: any): Promise<void>;

  // 拖拽
  dragStart(offsetX: number, offsetY: number): Promise<void>;
  dragMove(screenX: number, screenY: number): Promise<void>;
  dragEnd(): Promise<void>;

  // 动画完成上报
  animComplete(animId: string, phase: string): Promise<void>;

  // 文件拖放
  fileDrop(files: any[]): Promise<void>;

  // 初始状态
  getInitialState(): Promise<any>;

  // 就绪通知
  ready(): Promise<void>;

  // 配置
  getAutoWalk(): Promise<boolean>;
  setAutoWalk(enabled: boolean): Promise<boolean>;

  // 语音合成 (Speak)
  speak(text: string, options?: { showBubble?: boolean; bubbleDuration?: number }): Promise<SpeakResult>;
  synthesizeSpeech(text: string): Promise<SpeakResult>;
  getSpeakConfig(): Promise<SpriteSpeakConfig>;

  // 统一事件触发
  trigger(eventType: string, options?: { message?: string; duration?: number; durationMs?: number; ctx?: any; silent?: boolean }): Promise<void>;

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
  onWalk(cb: (data: any) => void): () => void;
  onConfig(cb: (data: any) => void): () => void;
  onBusyUpdate(cb: (data: any) => void): () => void;
  onBusyClear(cb: () => void): () => void;
  /** 监听语音播放事件（主进程合成完成后触发） */
  onSpeak(cb: (data: { text: string; audioPath: string; cacheId: string; volume: number }) => void): () => void;
};

export const spriteBridge: SpriteBridgeType = {
  // ── 动画管理 (原有) ──────────────────────────────────────
  list: () => ipcRenderer.invoke('sprite:list'),
  listByEvent: (eventType) => ipcRenderer.invoke('sprite:listByEvent', { eventType }),
  get: (id) => ipcRenderer.invoke('sprite:get', { id }),
  register: (anim) => ipcRenderer.invoke('sprite:register', anim),
  registerFromData: (payload) => ipcRenderer.invoke('sprite:registerFromData', payload),
  remove: (id, deleteFile) => ipcRenderer.invoke('sprite:remove', { id, deleteFile }),
  updateMeta: (id, meta) => ipcRenderer.invoke('sprite:updateMeta', { id, meta }),

  // ── 交互上报 ─────────────────────────────────────────────
  interact: (type, data) => ipcRenderer.invoke('sprite:interact', { type, data }),

  // ── 拖拽 ─────────────────────────────────────────────────
  dragStart: (offsetX, offsetY) =>
    ipcRenderer.invoke('sprite:drag', {
      phase: 'start',
      offsetX,
      offsetY
    }),
  dragMove: (screenX, screenY) =>
    ipcRenderer.invoke('sprite:drag', {
      phase: 'move',
      screenX,
      screenY
    }),
  dragEnd: () => ipcRenderer.invoke('sprite:drag', { phase: 'end' }),

  // ── 动画完成上报 ─────────────────────────────────────────
  animComplete: (animId, phase) => ipcRenderer.invoke('sprite:anim-complete', { animId, phase }),

  // ── 文件拖放 ─────────────────────────────────────────────
  fileDrop: (files) => ipcRenderer.invoke('sprite:file-drop', { files }),

  // ── 初始状态 ─────────────────────────────────────────────
  getInitialState: () => ipcRenderer.invoke('sprite:get-initial-state'),

  // ── 就绪通知 ─────────────────────────────────────────────
  ready: () => ipcRenderer.invoke('sprite:ready'),

  // ── 配置 ─────────────────────────────────────────────────
  getAutoWalk: () => ipcRenderer.invoke('sprite:config:getAutoWalk'),
  setAutoWalk: (enabled) => ipcRenderer.invoke('sprite:config:setAutoWalk', { enabled }),

  // ── 语音合成 (Speak) ──────────────────────────────────────
  speak: (text, options) => ipcRenderer.invoke('sprite:speak', { text, showBubble: options?.showBubble, bubbleDuration: options?.bubbleDuration }),
  synthesizeSpeech: (text) => ipcRenderer.invoke('sprite:speak:synthesize', { text }),
  getSpeakConfig: () => ipcRenderer.invoke('sprite:speak:getConfig'),
  setSpeakConfig: (config) => ipcRenderer.invoke('sprite:speak:setConfig', config),
  resetSpeakConfig: () => ipcRenderer.invoke('sprite:speak:resetConfig'),
  getSpeakCacheStats: () => ipcRenderer.invoke('sprite:speak:getCacheStats'),
  clearSpeakCache: () => ipcRenderer.invoke('sprite:speak:clearCache'),

  // ── 统一事件触发 ───────────────────────────────────────
  trigger: (eventType, options) => ipcRenderer.invoke('sprite:trigger', { eventType, ...options }),

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
  onMessage: (cb) => {
    const handler = (_: any, data: any): void => cb(data);
    ipcRenderer.on('sprite:message', handler);
    return () => {
      ipcRenderer.off('sprite:message', handler);
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
  onBusyUpdate: (cb) => {
    const handler = (_: any, data: any): void => cb(data);
    ipcRenderer.on('sprite:busy:update', handler);
    return () => {
      ipcRenderer.off('sprite:busy:update', handler);
    };
  },
  onBusyClear: (cb) => {
    const handler = (_: any): void => cb();
    ipcRenderer.on('sprite:busy:clear', handler);
    return () => {
      ipcRenderer.off('sprite:busy:clear', handler);
    };
  },
  onSpeak: (cb) => {
    const handler = (_: any, data: any): void => cb(data);
    ipcRenderer.on('sprite:speak', handler);
    return () => {
      ipcRenderer.off('sprite:speak', handler);
    };
  }
};
