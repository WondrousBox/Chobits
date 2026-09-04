/**
 * 精灵事件监听器
 *
 * 订阅 AppEvent 中的精灵相关事件，并触发相应的动画。
 * 通过事件系统解耦业务模块与精灵模块。
 */

import { AppEvent, eventManager } from '@packages/event';

import type { SpriteManager } from '../manager';
import { ProgressSpeechAnnouncer, type ProgressSpeechKind } from '../manager/progress-speech-announcer';
import { getCharacterRoutineText, getCharacterSpriteEventText } from '../messages/character';
import type { SpriteRealtimeSpeechScope } from '../speak/types';

export interface SpriteEventPayload {
  taskId?: string;
  resourceId?: string;
  count?: number;
  error?: string;
  message?: string;
  progress?: number;
  operationKind?: ProgressSpeechKind;
  providerId?: string;
  presetId?: string;
  field?: string;
  action?: string;
  // AI conversation metadata fields
  conversationId?: string;
  messageCount?: number;
  toolCallCount?: number;
  assistantContentLength?: number;
  realtimeSpeechScope?: SpriteRealtimeSpeechScope;
}

interface SpriteHandlerContext {
  purposeMatches: number;
}

type SpriteHandler = (data?: SpriteEventPayload, context?: SpriteHandlerContext) => void;

function getProgressSpeechId(scope: string, id?: string): string {
  return `${scope}:${id || 'global'}`;
}

function getDownloadProgressSpeechId(data?: SpriteEventPayload): string {
  return getProgressSpeechId('download', data?.taskId ?? data?.resourceId);
}

function eventText(eventType: string, data?: SpriteEventPayload, fallback?: string): string {
  return getCharacterSpriteEventText(eventType, data as Record<string, unknown> | undefined, fallback);
}

const MINIMAX_CHAT_API_CONFIG_EASTER_EGG_COOLDOWN_MS = 5 * 60 * 1000;
const MINIMAX_CHAT_API_CONFIG_EASTER_EGG_BUBBLE_MS = 6200;
const CHAT_API_CONFIG_SAVE_ACTIONS = new Set([
  'provider-secrets-updated',
  'provider-api-keys-updated',
  'provider-api-key-added',
  'provider-api-key-updated',
  'provider-api-key-default-updated',
  'preset-secrets-updated'
]);

function normalizeText(value?: string): string {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function isMiniMaxChatApiConfigSave(data?: SpriteEventPayload): boolean {
  const providerId = normalizeText(data?.providerId);
  if (providerId !== 'minimax' && providerId !== 'minimaxi') {
    return false;
  }

  const field = normalizeText(data?.field);
  if (field && field !== 'apikey' && field !== 'api_key') {
    return false;
  }

  const action = normalizeText(data?.action);
  return !action || CHAT_API_CONFIG_SAVE_ACTIONS.has(action);
}

function getMiniMaxChatApiConfigEasterEggText(): string {
  return getCharacterRoutineText('chat.api-config-guide.done.minimax', { providerId: 'minimax' }, 'MiniMax 还可以制作音乐，以后可以和我说哦');
}

function shouldSuppressAIEventSpeech(data?: SpriteEventPayload): boolean {
  const scope = data?.realtimeSpeechScope;
  if (!scope) {
    return false;
  }
  // 聊天来源的 AI 事件：语音由聊天区的「AI 说话」开关全权决定 ——
  // 开启时回复由实时朗读读出（状态 toast 静音避免重复读）；
  // 关闭时用户已明确静音聊天语音，状态 toast 同样不读。
  return true;
}

/**
 * 初始化精灵事件监听器
 *
 * 订阅业务模块发送的精灵触发事件，并调用 SpriteManager 触发动画
 */
export function initSpriteEventListener(mgr: SpriteManager): () => void {
  const handlers: Array<{ event: AppEvent; handler: SpriteHandler }> = [];
  let lastMiniMaxChatApiConfigEasterEggAt = 0;
  const progressSpeech = new ProgressSpeechAnnouncer({
    speak: (text) => {
      void mgr.speak(text, { bubbleEnabled: false }).catch(() => {});
    }
  });

  // AI 聊天事件
  handlers.push({
    event: AppEvent.SPRITE_AI_START,
    handler: (data) => {
      const suppressSpeech = shouldSuppressAIEventSpeech(data);
      mgr.showToast(data?.message || eventText('aiThinking', data), { category: 'loading', ...(suppressSpeech ? { speak: false } : {}) });
      mgr.trigger('thinking', { durationMs: 2000, silent: true });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_AI_COMPLETED,
    handler: (data) => {
      const suppressSpeech = shouldSuppressAIEventSpeech(data);
      mgr.showToast(data?.message || eventText('aiComplete', data), { category: 'success', duration: 1500, ...(suppressSpeech ? { speak: false } : {}) });
      mgr.trigger('celebrate', { durationMs: 1500, silent: true });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_AI_ERROR,
    handler: (data) => {
      const suppressSpeech = shouldSuppressAIEventSpeech(data);
      mgr.showToast(data?.message || data?.error || eventText('aiError', data), { category: 'error', duration: 2000, ...(suppressSpeech ? { speak: false } : {}) });
      mgr.trigger('error', { durationMs: 1500, silent: true });
    }
  });

  handlers.push({
    event: AppEvent.AI_PROVIDER_CONFIG_UPDATED,
    handler: (data, context) => {
      if (context?.purposeMatches && context.purposeMatches > 0) {
        return;
      }
      if (!isMiniMaxChatApiConfigSave(data)) {
        return;
      }

      const now = Date.now();
      if (now - lastMiniMaxChatApiConfigEasterEggAt < MINIMAX_CHAT_API_CONFIG_EASTER_EGG_COOLDOWN_MS) {
        return;
      }
      lastMiniMaxChatApiConfigEasterEggAt = now;

      const text = getMiniMaxChatApiConfigEasterEggText();
      if (!text) {
        return;
      }
      void mgr.speak(text, { bubbleDuration: MINIMAX_CHAT_API_CONFIG_EASTER_EGG_BUBBLE_MS }).catch(() => {});
    }
  });

  // ===== 下载事件 =====

  handlers.push({
    event: AppEvent.SPRITE_DOWNLOAD_START,
    handler: (data) => {
      progressSpeech.start({
        id: getDownloadProgressSpeechId(data),
        kind: 'download',
        progress: data?.progress ?? 0,
        message: data?.message
      });
      mgr.showBusy(data?.message || eventText('downloadStart', data, '下载中...'), data?.progress ?? 0);
      mgr.trigger('download', { silent: true });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_DOWNLOAD_PROGRESS,
    handler: (data) => {
      if (data?.progress === undefined) {
        return;
      }
      progressSpeech.update({
        id: getDownloadProgressSpeechId(data),
        kind: 'download',
        progress: data.progress,
        message: data.message
      });
      mgr.updateBusy(data.progress, data.message || eventText('downloadProgress', data, '下载中...'));
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_DOWNLOAD_COMPLETE,
    handler: (data) => {
      progressSpeech.complete({
        id: getDownloadProgressSpeechId(data),
        kind: 'download',
        message: data?.message
      });
      mgr.clearBusy();
      mgr.trigger('success', { silent: true });
      mgr.showToast(data?.message || eventText('downloadComplete', data, '下载完成！'), { category: 'success', duration: 1500, speak: false });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_DOWNLOAD_FAILED,
    handler: (data) => {
      progressSpeech.reset(getDownloadProgressSpeechId(data));
      mgr.clearBusy();
      mgr.trigger('error', { message: data?.message || data?.error || eventText('downloadFail', data, '下载失败') });
    }
  });

  // ===== 插件事件 =====

  handlers.push({
    event: AppEvent.SPRITE_PLUGIN_INSTALLED,
    handler: (data) => {
      mgr.trigger('install', { message: data?.message || eventText('pluginInstall', data, '插件安装完成！'), silent: true });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_PLUGIN_REMOVED,
    handler: (data) => {
      mgr.trigger('remove', { message: data?.message || eventText('pluginRemove', data, '插件已移除') });
    }
  });

  // ===== 系统生命周期事件 =====

  handlers.push({
    event: AppEvent.SPRITE_SYSTEM_READY,
    handler: () => {
      // 仅播放出场动画，欢迎文案由 handleRendererReady 发送（避免重复）
      mgr.trigger('appear', { durationMs: 1500, silent: true });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_SYSTEM_QUIT,
    handler: () => {
      mgr.trigger('disappear', { silent: true });
    }
  });

  // ===== 应用窗口事件 =====
  // 无动画行为，仅借下方统一包装把事件转发给 Purpose waiter ——
  // first-chat / chat-api-config-guide 等 routine 的 loopUntil 在等待它们。
  handlers.push({
    event: AppEvent.APP_WINDOW_OPENED,
    handler: () => {}
  });

  handlers.push({
    event: AppEvent.APP_WINDOW_CLOSED,
    handler: () => {}
  });

  const subscriptions = handlers.map(({ event, handler }) => ({
    event,
    handler: (data?: SpriteEventPayload) => {
      const purposeEventResult = mgr.emitPurposeEvent?.({
        source: 'app-event',
        event,
        payload: data as Record<string, unknown> | undefined
      });
      if (event === AppEvent.AI_PROVIDER_CONFIG_UPDATED || event === AppEvent.APP_WINDOW_CLOSED) {
        console.info('[sprite-event-listener] bridged app event to purpose waiter', {
          event,
          payload: data,
          purposeMatches: purposeEventResult?.matched ?? 0
        });
      }
      handler(data, { purposeMatches: purposeEventResult?.matched ?? 0 });
    }
  }));

  // 注册所有事件监听器
  subscriptions.forEach(({ event, handler }) => {
    eventManager.on(event, handler);
  });

  // 返回清理函数
  return () => {
    subscriptions.forEach(({ event, handler }) => {
      eventManager.off(event, handler);
    });
    progressSpeech.reset();
  };
}
