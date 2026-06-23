/**
 * 精灵事件监听器
 *
 * 订阅 AppEvent 中的精灵相关事件，并触发相应的动画。
 * 通过事件系统解耦业务模块与精灵模块。
 */

import { AppEvent, eventManager } from '@packages/event';

import type { ActivityRewardId } from '../character-service';
import type { SpriteManager } from '../manager';
import { ProgressSpeechAnnouncer, type ProgressSpeechKind } from '../manager/progress-speech-announcer';
import { getCharacterRoutineText, getCharacterSpriteEventText } from '../messages/character';
import { getResolvedActivityPersonaReward } from '../persona-rules';

export interface SpriteEventPayload {
  runId?: string;
  workflowRunId?: string;
  workflowId?: string;
  message?: string;
  progress?: number;
  workflowName?: string;
  taskId?: string;
  resourceId?: string;
  workspaceId?: string;
  folderId?: string;
  count?: number;
  error?: string;
  success?: boolean;
  operationKind?: ProgressSpeechKind;
  providerId?: string;
  presetId?: string;
  field?: string;
  action?: string;
  // AI conversation reward fields
  conversationId?: string;
  messageCount?: number;
  toolCallCount?: number;
  assistantContentLength?: number;
}

interface SpriteHandlerContext {
  purposeMatches: number;
}

type SpriteHandler = (data?: SpriteEventPayload, context?: SpriteHandlerContext) => void;
export type SpriteEventListenerRouteMode = 'auto' | 'trigger' | 'purpose';

export interface SpriteEventListenerOptions {
  workflow?: SpriteEventListenerRouteMode;
  resourceImport?: SpriteEventListenerRouteMode;
}

interface ResolvedSpriteEventListenerOptions {
  workflow: SpriteEventListenerRouteMode;
  resourceImport: SpriteEventListenerRouteMode;
}

function resolveOptions(options?: SpriteEventListenerOptions): ResolvedSpriteEventListenerOptions {
  return {
    workflow: options?.workflow ?? 'purpose',
    resourceImport: options?.resourceImport ?? 'purpose'
  };
}

function getWorkflowRunId(data?: SpriteEventPayload): string | undefined {
  return data?.workflowRunId ?? data?.runId;
}

function getResourceImportCorrelationId(data?: SpriteEventPayload): string | undefined {
  return data?.resourceId ?? data?.folderId ?? data?.workspaceId;
}

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

function getActiveWorkflowWaitingRunId(mgr: SpriteManager): string | undefined {
  const current = mgr.getPurposeSnapshot().current;
  if (current?.kind !== 'workflow.waiting') {
    return undefined;
  }

  const workflowRunId = current.context?.workflowRunId ?? current.context?.runId;
  return typeof workflowRunId === 'string' && workflowRunId.trim() ? workflowRunId : undefined;
}

function isWorkflowWaitingPurposeHandling(mgr: SpriteManager, data?: SpriteEventPayload): boolean {
  const current = mgr.getPurposeSnapshot().current;
  if (current?.kind !== 'workflow.waiting') {
    return false;
  }

  const activeRunId = getActiveWorkflowWaitingRunId(mgr);
  const eventRunId = getWorkflowRunId(data);
  if (!activeRunId) {
    return true;
  }
  if (!eventRunId) {
    return false;
  }
  return activeRunId === eventRunId;
}

function isResourceImportPurposeHandling(mgr: SpriteManager, data?: SpriteEventPayload): boolean {
  const current = mgr.getPurposeSnapshot().current;
  if (current?.kind !== 'resource.import.waiting') {
    return false;
  }

  const activeCorrelationId = getResourceImportCorrelationId(current.context as SpriteEventPayload | undefined);
  const eventCorrelationId = getResourceImportCorrelationId(data);
  if (!activeCorrelationId) {
    return true;
  }
  if (!eventCorrelationId) {
    return false;
  }
  return activeCorrelationId === eventCorrelationId;
}

function startWorkflowWaitingPurpose(mgr: SpriteManager, data?: SpriteEventPayload): boolean {
  const workflowRunId = getWorkflowRunId(data);
  if (!workflowRunId) {
    return false;
  }

  void mgr.startPurpose({
    kind: 'workflow.waiting',
    reason: data?.message || data?.workflowName || 'Workflow started',
    source: 'app-event',
    presetId: 'workflow.waiting',
    priority: 65,
    correlationId: workflowRunId,
    coalesceKey: `workflow:${workflowRunId}`,
    context: {
      ...data,
      runId: workflowRunId,
      workflowRunId
    }
  });
  return true;
}

function startResourceImportPurpose(mgr: SpriteManager, data?: SpriteEventPayload): boolean {
  const correlationId = getResourceImportCorrelationId(data) ?? `resource-import:${Date.now()}`;
  void mgr.startPurpose({
    kind: 'resource.import.waiting',
    reason: data?.message || 'Resource import started',
    source: 'app-event',
    presetId: 'resource.import.waiting',
    priority: 65,
    correlationId,
    coalesceKey: `resource-import:${correlationId}`,
    context: data ? { ...data } : { correlationId }
  });
  return true;
}

/**
 * 初始化精灵事件监听器
 *
 * 订阅业务模块发送的精灵触发事件，并调用 SpriteManager 触发动画
 */
export function initSpriteEventListener(mgr: SpriteManager, options?: SpriteEventListenerOptions): () => void {
  const routeMode = resolveOptions(options);
  const handlers: Array<{ event: AppEvent; handler: SpriteHandler }> = [];
  let lastMiniMaxChatApiConfigEasterEggAt = 0;
  const progressSpeech = new ProgressSpeechAnnouncer({
    speak: (text) => {
      void mgr.speak(text, { showBubble: false }).catch(() => { });
    }
  });

  const grantActivityReward = (activityId: ActivityRewardId): void => {
    mgr.applyPersonaReward(getResolvedActivityPersonaReward(activityId), activityId);
  };

  // AI 聊天事件
  handlers.push({
    event: AppEvent.SPRITE_AI_START,
    handler: (data) => {
      mgr.showToast(data?.message || eventText('aiThinking', data), { category: 'loading' });
      mgr.trigger('thinking', { durationMs: 2000, silent: true });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_AI_COMPLETE,
    handler: (data) => {
      mgr.showToast(data?.message || eventText('aiComplete', data), { category: 'success', duration: 1500 });
      mgr.trigger('celebrate', { durationMs: 1500, silent: true });
      mgr.recordConversationEvent({
        assistantContentLength: data?.assistantContentLength,
        toolCallCount: data?.toolCallCount
      });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_AI_ERROR,
    handler: (data) => {
      mgr.showToast(data?.message || data?.error || eventText('aiError', data), { category: 'error', duration: 2000 });
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
      void mgr.speak(text, { bubbleDuration: MINIMAX_CHAT_API_CONFIG_EASTER_EGG_BUBBLE_MS }).catch(() => { });
    }
  });

  // 工作流事件
  handlers.push({
    event: AppEvent.SPRITE_WORKFLOW_START,
    handler: (data) => {
      if (routeMode.workflow !== 'trigger' && isWorkflowWaitingPurposeHandling(mgr, data)) {
        return;
      }
      if (routeMode.workflow === 'purpose' && startWorkflowWaitingPurpose(mgr, data)) {
        return;
      }
      progressSpeech.start({
        id: getProgressSpeechId('workflow', getWorkflowRunId(data)),
        kind: 'workflow',
        progress: data?.progress ?? 0,
        message: data?.message || data?.workflowName
      });
      mgr.showBusy(data?.message || data?.workflowName || eventText('workflowStart', data), 0);
      mgr.trigger('processing', { durationMs: 1500, silent: true });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_WORKFLOW_PROGRESS,
    handler: (data) => {
      if (routeMode.workflow !== 'trigger' && isWorkflowWaitingPurposeHandling(mgr, data)) {
        return;
      }
      if (data?.progress !== undefined) {
        progressSpeech.update({
          id: getProgressSpeechId('workflow', getWorkflowRunId(data)),
          kind: data.operationKind,
          progress: data.progress,
          message: data.message
        });
        mgr.updateBusy(data.progress, data.message);
      }
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_WORKFLOW_COMPLETE,
    handler: (data) => {
      if (routeMode.workflow !== 'trigger' && isWorkflowWaitingPurposeHandling(mgr, data)) {
        grantActivityReward('workflow-complete');
        return;
      }
      progressSpeech.complete({
        id: getProgressSpeechId('workflow', getWorkflowRunId(data)),
        kind: data?.operationKind,
        message: data?.message || data?.workflowName
      });
      mgr.clearBusy();
      mgr.showToast(data?.message || eventText('workflowComplete', data), { category: 'celebrate', duration: 2000, speak: false });
      mgr.trigger('celebrate', { durationMs: 2000, silent: true });
      grantActivityReward('workflow-complete');
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_WORKFLOW_FAIL,
    handler: (data) => {
      if (routeMode.workflow !== 'trigger' && isWorkflowWaitingPurposeHandling(mgr, data)) {
        return;
      }
      progressSpeech.reset(getProgressSpeechId('workflow', getWorkflowRunId(data)));
      mgr.clearBusy();
      mgr.showToast(data?.message || data?.error || eventText('workflowFail', data), { category: 'error', duration: 2000 });
      mgr.trigger('failure', { durationMs: 1500, silent: true });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_WORKFLOW_CANCEL,
    handler: (data) => {
      if (routeMode.workflow !== 'trigger' && isWorkflowWaitingPurposeHandling(mgr, data)) {
        return;
      }
      progressSpeech.reset(getProgressSpeechId('workflow', getWorkflowRunId(data)));
      mgr.clearBusy();
      mgr.showToast(eventText('workflowCancel', data), { category: 'info', duration: 1000 });
    }
  });

  // 资源导入事件
  handlers.push({
    event: AppEvent.SPRITE_RESOURCE_IMPORT_START,
    handler: (data) => {
      if (routeMode.resourceImport !== 'trigger' && isResourceImportPurposeHandling(mgr, data)) {
        return;
      }
      if (routeMode.resourceImport === 'purpose' && startResourceImportPurpose(mgr, data)) {
        return;
      }
      progressSpeech.start({
        id: getProgressSpeechId('import', getResourceImportCorrelationId(data)),
        kind: 'import',
        progress: data?.progress ?? 0,
        message: data?.message
      });
      mgr.showBusy(data?.message || eventText('importStart', data), 0);
      mgr.trigger('loading', { durationMs: 1500, silent: true });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_RESOURCE_IMPORT_PROGRESS,
    handler: (data) => {
      if (routeMode.resourceImport !== 'trigger' && isResourceImportPurposeHandling(mgr, data)) {
        return;
      }
      if (data?.progress !== undefined) {
        progressSpeech.update({
          id: getProgressSpeechId('import', getResourceImportCorrelationId(data)),
          kind: 'import',
          progress: data.progress,
          message: data.message
        });
        mgr.updateBusy(data.progress, data.message);
      }
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_RESOURCE_IMPORT_COMPLETE,
    handler: (data) => {
      if (routeMode.resourceImport !== 'trigger' && isResourceImportPurposeHandling(mgr, data)) {
        grantActivityReward('resource-import-complete');
        return;
      }
      progressSpeech.complete({
        id: getProgressSpeechId('import', getResourceImportCorrelationId(data)),
        kind: 'import',
        message: data?.message
      });
      mgr.clearBusy();
      mgr.showToast(data?.message || eventText('importComplete', data), { category: 'success', duration: 1500, speak: false });
      mgr.trigger('celebrate', { durationMs: 1500, silent: true });
      grantActivityReward('resource-import-complete');
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_RESOURCE_IMPORT_ERROR,
    handler: (data) => {
      if (routeMode.resourceImport !== 'trigger' && isResourceImportPurposeHandling(mgr, data)) {
        return;
      }
      progressSpeech.reset(getProgressSpeechId('import', getResourceImportCorrelationId(data)));
      mgr.clearBusy();
      mgr.showToast(data?.message || data?.error || eventText('importError', data), { category: 'error', duration: 2000 });
      mgr.trigger('error', { durationMs: 1500, silent: true });
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
      grantActivityReward('download-complete');
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_DOWNLOAD_FAIL,
    handler: (data) => {
      progressSpeech.reset(getDownloadProgressSpeechId(data));
      mgr.clearBusy();
      mgr.trigger('error', { message: data?.message || data?.error || eventText('downloadFail', data, '下载失败') });
    }
  });

  // ===== 插件事件 =====

  handlers.push({
    event: AppEvent.SPRITE_PLUGIN_INSTALL,
    handler: (data) => {
      mgr.trigger('install', { message: data?.message || eventText('pluginInstall', data, '插件安装完成！') });
      grantActivityReward('plugin-install');
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_PLUGIN_REMOVE,
    handler: (data) => {
      mgr.trigger('remove', { message: data?.message || eventText('pluginRemove', data, '插件已移除') });
      grantActivityReward('plugin-remove');
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_PLUGIN_UPDATE,
    handler: (data) => {
      mgr.trigger('update', { message: data?.message || eventText('pluginUpdate', data, '插件已更新！') });
      grantActivityReward('plugin-update');
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

  handlers.push({
    event: AppEvent.SPRITE_SYSTEM_FOCUS,
    handler: () => {
      mgr.trigger('wake', { duration: 1500 });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_SYSTEM_BLUR,
    handler: () => {
      mgr.trigger('sleep', { silent: true });
    }
  });

  // ===== 网络事件 =====

  handlers.push({
    event: AppEvent.SPRITE_NETWORK_CONNECT,
    handler: (data) => {
      mgr.trigger('connect', { message: data?.message });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_NETWORK_DISCONNECT,
    handler: (data) => {
      mgr.trigger('disconnect', { message: data?.message });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_NETWORK_TIMEOUT,
    handler: (data) => {
      mgr.trigger('timeout', { message: data?.message });
    }
  });

  // ===== 媒体处理事件 =====

  handlers.push({
    event: AppEvent.SPRITE_MEDIA_PROCESS_START,
    handler: (data) => {
      mgr.showBusy(data?.message || eventText('mediaProcessStart', data, '媒体处理中...'), 0);
      mgr.trigger('processing', { silent: true });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_MEDIA_PROCESS_COMPLETE,
    handler: (data) => {
      mgr.clearBusy();
      if (data?.success === false) {
        mgr.trigger('error', { message: data?.message || eventText('mediaProcessFail', data, '媒体处理失败') });
        return;
      }
      grantActivityReward('media-process-complete');
      mgr.trigger('success', { message: data?.message || eventText('mediaProcessComplete', data, '媒体处理完成！') });
    }
  });

  // ===== RSS 事件 =====

  handlers.push({
    event: AppEvent.SPRITE_RSS_REFRESH,
    handler: (data) => {
      mgr.trigger('sync', { message: data?.message || eventText('rssRefresh', data, '正在刷新订阅...') });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_RSS_NEW_CONTENT,
    handler: (data) => {
      mgr.trigger('curious', { message: data?.message || eventText('rssNewContent', data, '有新内容更新了~') });
    }
  });

  // ===== 回收站事件 =====

  handlers.push({
    event: AppEvent.SPRITE_TRASH_DELETE,
    handler: (data) => {
      mgr.trigger('remove', { message: data?.message || eventText('trashDelete', data, '已移到回收站') });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_TRASH_RESTORE,
    handler: (data) => {
      grantActivityReward('trash-restore');
      mgr.trigger('success', { message: data?.message || eventText('trashRestore', data, '已从回收站恢复！') });
    }
  });

  // ===== 记忆提取事件 =====

  handlers.push({
    event: AppEvent.MEMORY_EXTRACTION_STARTED,
    handler: (data) => {
      mgr.showToast(data?.message || eventText('memoryExtractStart', data), { category: 'processing' });
      mgr.trigger('thinking', { durationMs: 2000, silent: true });
    }
  });

  handlers.push({
    event: AppEvent.MEMORY_EXTRACTION_PROGRESS,
    handler: (data) => {
      if (data?.progress !== undefined) {
        mgr.updateBusy(data.progress, data.message || eventText('memoryExtractProgress', data));
      }
    }
  });

  handlers.push({
    event: AppEvent.MEMORY_EXTRACTION_COMPLETED,
    handler: (data) => {
      mgr.clearBusy();
      mgr.showToast(data?.message || eventText('memoryExtractComplete', data), { category: 'success', duration: 2000 });
      mgr.trigger('write', { silent: true });
      grantActivityReward('memory-extraction-completed');
    }
  });

  handlers.push({
    event: AppEvent.MEMORY_EXTRACTION_FAILED,
    handler: (data) => {
      mgr.clearBusy();
      mgr.showToast(data?.message || data?.error || eventText('memoryExtractFail', data), { category: 'error', duration: 2000 });
      mgr.trigger('error', { durationMs: 1500, silent: true });
    }
  });

  // ===== 用户画像更新事件 =====

  handlers.push({
    event: AppEvent.USER_PERSONA_UPDATE_STARTED,
    handler: (data) => {
      mgr.showToast(data?.message || eventText('personaUpdateStart', data), { category: 'processing' });
      mgr.trigger('thinking', { durationMs: 2000, silent: true });
    }
  });

  handlers.push({
    event: AppEvent.USER_PERSONA_UPDATE_COMPLETED,
    handler: (data) => {
      mgr.showToast(data?.message || eventText('personaUpdateComplete', data), { category: 'success', duration: 2000 });
      mgr.trigger('celebrate', { durationMs: 1500, silent: true });
      grantActivityReward('user-persona-update-completed');
    }
  });

  handlers.push({
    event: AppEvent.USER_PERSONA_UPDATE_FAILED,
    handler: (data) => {
      mgr.showToast(data?.message || data?.error || eventText('personaUpdateFail', data), { category: 'error', duration: 2000 });
      mgr.trigger('error', { durationMs: 1500, silent: true });
    }
  });

  handlers.push({
    event: AppEvent.USER_PERSONA_UPDATE_SKIPPED,
    handler: (data) => {
      mgr.showToast(data?.message || eventText('personaUpdateSkipped', data), { category: 'info', duration: 1500 });
    }
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
