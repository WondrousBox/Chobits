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
import type { SpeakResult, SpriteSpeakConfig } from '../speak/types';
import type { MessageBridgePayload, MessageIPCPayload, SpriteAnimation, SpriteAnimationTrigger, SpriteMovementPreviewConfig, SpriteTriggerOptions } from '../types';
import { MESSAGE_IPC_CHANNELS } from '../types';

function onMessageBridge(cb: (payload: MessageBridgePayload) => void): () => void {
  const handler = (_: any, payload: MessageBridgePayload): void => cb(payload);
  ipcRenderer.on(MESSAGE_IPC_CHANNELS.BRIDGE, handler);
  return () => {
    ipcRenderer.off(MESSAGE_IPC_CHANNELS.BRIDGE, handler);
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
    autoIdle?: boolean;
    width?: number;
    height?: number;
    padding?: number;
    movement?: SpriteAnimation['movement'];
  }): Promise<SpriteAnimation>;
  remove(id: string, deleteFile?: boolean): Promise<{ ok: boolean }>;
  updateMeta(id: string, meta: Partial<SpriteAnimation['meta']>): Promise<{ ok: boolean; item?: SpriteAnimation }>;

  // 交互上报
  interact(type: SpriteInteractionIntent, data?: SpriteInteractionPayload): Promise<void>;

  // 拖拽（主进程轮询光标，渲染进程仅发 start/end 信号）
  dragStart(offsetX: number, offsetY: number): Promise<void>;
  dragEnd(): Promise<void>;

  // 动画完成上报
  animComplete(animId: string, phase: string, playId?: string): Promise<void>;

  // 文件拖放
  fileDrop(files: any[]): Promise<void>;

  // 初始状态
  getInitialState(): Promise<any>;

  // 就绪通知
  ready(): Promise<void>;

  // 配置
  getAutoWalk(): Promise<boolean>;
  setAutoWalk(enabled: boolean): Promise<boolean>;
  getDebugOverlay(): Promise<boolean>;
  setDebugOverlay(enabled: boolean): Promise<boolean>;
  getSpontaneousUtterancePreferences(): Promise<SpriteSpontaneousUtterancePreferences | null>;
  updateSpontaneousUtterancePreferences(patch: Partial<SpriteSpontaneousUtterancePreferences>): Promise<SpriteSpontaneousUtterancePreferences | null>;
  listSpontaneousUtteranceHistory(query?: SpriteSpontaneousUtteranceHistoryQuery): Promise<SpriteSpontaneousUtteranceHistoryItem[]>;

  // 窗口移动预览
  previewMovement(config: SpriteMovementPreviewConfig): Promise<void>;
  stopMovementPreview(): Promise<void>;

  // 语音合成 (Speak)
  speak(text: string, options?: { showBubble?: boolean; bubbleDuration?: number }): Promise<SpeakResult>;
  synthesizeSpeech(text: string): Promise<SpeakResult>;
  getSpeakConfig(): Promise<SpriteSpeakConfig>;

  // 统一事件触发
  trigger(trigger: SpriteAnimationTrigger, options?: SpriteTriggerOptions): Promise<void>;
  // 按动画 ID 测试播放（开发调试用）
  testAnimation(animationId: string, options?: { message?: string; duration?: number; durationMs?: number; silent?: boolean }): Promise<boolean>;

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
  fileDrop: (files) => ipcRenderer.invoke('sprite:file-drop', { files }),

  // ── 初始状态 ─────────────────────────────────────────────
  getInitialState: () => ipcRenderer.invoke('sprite:get-initial-state'),

  // ── 就绪通知 ─────────────────────────────────────────────
  ready: () => ipcRenderer.invoke('sprite:ready'),

  // ── 配置 ─────────────────────────────────────────────────
  getAutoWalk: () => ipcRenderer.invoke('sprite:config:getAutoWalk'),
  setAutoWalk: (enabled) => ipcRenderer.invoke('sprite:config:setAutoWalk', { enabled }),
  getDebugOverlay: () => ipcRenderer.invoke('sprite:config:getDebugOverlay'),
  setDebugOverlay: (enabled) => ipcRenderer.invoke('sprite:config:setDebugOverlay', { enabled }),
  getSpontaneousUtterancePreferences: () => ipcRenderer.invoke('sprite:spontaneous:getPreferences'),
  updateSpontaneousUtterancePreferences: (patch) => ipcRenderer.invoke('sprite:spontaneous:updatePreferences', patch),
  listSpontaneousUtteranceHistory: (query) => ipcRenderer.invoke('sprite:spontaneous:listHistory', query),
  previewMovement: (config) => ipcRenderer.invoke('sprite:previewMovement', config),
  stopMovementPreview: () => ipcRenderer.invoke('sprite:stopMovementPreview'),

  // ── 语音合成 (Speak) ──────────────────────────────────────
  speak: (text, options) => ipcRenderer.invoke('sprite:speak', { text, showBubble: options?.showBubble, bubbleDuration: options?.bubbleDuration }),
  synthesizeSpeech: (text) => ipcRenderer.invoke('sprite:speak:synthesize', { text }),
  getSpeakConfig: () => ipcRenderer.invoke('sprite:speak:getConfig'),
  setSpeakConfig: (config) => ipcRenderer.invoke('sprite:speak:setConfig', config),
  resetSpeakConfig: () => ipcRenderer.invoke('sprite:speak:resetConfig'),
  getSpeakCacheStats: () => ipcRenderer.invoke('sprite:speak:getCacheStats'),
  clearSpeakCache: () => ipcRenderer.invoke('sprite:speak:clearCache'),

  // ── 统一事件触发 ───────────────────────────────────────
  trigger: (trigger, options) => ipcRenderer.invoke('sprite:trigger', { trigger, ...options }),
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
