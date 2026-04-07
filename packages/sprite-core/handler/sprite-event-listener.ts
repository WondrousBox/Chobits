/**
 * 精灵事件监听器
 *
 * 订阅 AppEvent 中的精灵相关事件，并触发相应的动画。
 * 通过事件系统解耦业务模块与精灵模块。
 */

import { AppEvent, eventManager } from '@packages/event';

import { getConversationRewards, getDimensionSchema } from '../character-service';
import type { SpriteManager } from '../manager';
import { getSpriteEventText } from '../messages/zh-CN';

export interface SpriteEventPayload {
  message?: string;
  progress?: number;
  workflowName?: string;
  count?: number;
  error?: string;
  // AI conversation reward fields
  conversationId?: string;
  messageCount?: number;
  toolCallCount?: number;
  assistantContentLength?: number;
}

type SpriteHandler = (data?: SpriteEventPayload) => void;

/**
 * 初始化精灵事件监听器
 *
 * 订阅业务模块发送的精灵触发事件，并调用 SpriteManager 触发动画
 */
export function initSpriteEventListener(mgr: SpriteManager): () => void {
  const handlers: Array<{ event: AppEvent; handler: SpriteHandler }> = [];

  // ===== 对话奖励冷却 =====
  let lastRewardTime = 0;

  // AI 聊天事件
  handlers.push({
    event: AppEvent.SPRITE_AI_START,
    handler: (data) => {
      mgr.showToast(data?.message || getSpriteEventText('aiThinking'), { category: 'loading' });
      mgr.playOnce('emotion', { durationMs: 2000 });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_AI_COMPLETE,
    handler: (data) => {
      mgr.showToast(data?.message || getSpriteEventText('aiComplete'), { category: 'success', duration: 1500 });
      mgr.playOnce('celebrate', { durationMs: 1500 });

      // ===== 对话奖励：XP + 好感度 =====
      const rewards = getConversationRewards();
      const now = Date.now();
      if (now - lastRewardTime < rewards.cooldownMs) return;
      lastRewardTime = now;

      let bonusXP = 0;
      let bonusFavor = 0;

      // 检查奖励条件
      for (const cond of rewards.bonusConditions) {
        if (cond.id === 'long-conversation' && data?.assistantContentLength && data.assistantContentLength >= 500) {
          bonusXP += cond.xpBonus;
          bonusFavor += cond.favorBonus;
        }
        if (cond.id === 'tool-usage' && data?.toolCallCount && data.toolCallCount > 0) {
          bonusXP += cond.xpBonus;
          bonusFavor += cond.favorBonus;
        }
      }

      mgr.addXP(rewards.xpPerConversation + bonusXP, 'conversation');
      mgr.changeFavor(rewards.favorPerConversation + bonusFavor, 'conversation');

      // ===== 维度成长 =====
      const dims = getDimensionSchema();
      if (dims) {
        for (const dim of dims) {
          let growth = 0;
          if (dim.growthSources.includes('conversation')) growth += 1.0;
          if (dim.growthSources.includes('tool-usage') && data?.toolCallCount && data.toolCallCount > 0) growth += 0.8;
          if (dim.growthSources.includes('task-completion') && data?.assistantContentLength && data.assistantContentLength >= 500) growth += 0.5;
          if (growth > 0) {
            mgr.updateDimension(dim.id, growth, dim.maxValue);
          }
        }
      }
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_AI_ERROR,
    handler: (data) => {
      mgr.showToast(data?.message || data?.error || getSpriteEventText('aiError'), { category: 'error', duration: 2000 });
      mgr.playOnce('emotion', { durationMs: 1500 });
    }
  });

  // 工作流事件
  handlers.push({
    event: AppEvent.SPRITE_WORKFLOW_START,
    handler: (data) => {
      mgr.showBusy(data?.message || data?.workflowName || getSpriteEventText('workflowStart'), 0);
      mgr.playOnce('emotion', { durationMs: 1500 });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_WORKFLOW_PROGRESS,
    handler: (data) => {
      if (data?.progress !== undefined) {
        mgr.updateBusy(data.progress, data.message);
      }
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_WORKFLOW_COMPLETE,
    handler: (data) => {
      mgr.clearBusy();
      mgr.showToast(data?.message || getSpriteEventText('workflowComplete'), { category: 'celebrate', duration: 2000 });
      mgr.playOnce('celebrate', { durationMs: 2000 });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_WORKFLOW_FAIL,
    handler: (data) => {
      mgr.clearBusy();
      mgr.showToast(data?.message || data?.error || getSpriteEventText('workflowFail'), { category: 'error', duration: 2000 });
      mgr.playOnce('emotion', { durationMs: 1500 });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_WORKFLOW_CANCEL,
    handler: () => {
      mgr.clearBusy();
      mgr.showToast(getSpriteEventText('workflowCancel'), { category: 'info', duration: 1000 });
    }
  });

  // 资源导入事件
  handlers.push({
    event: AppEvent.SPRITE_RESOURCE_IMPORT_START,
    handler: (data) => {
      mgr.showBusy(data?.message || getSpriteEventText('importStart'), 0);
      mgr.playOnce('emotion', { durationMs: 1500 });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_RESOURCE_IMPORT_PROGRESS,
    handler: (data) => {
      if (data?.progress !== undefined) {
        mgr.updateBusy(data.progress, data.message);
      }
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_RESOURCE_IMPORT_COMPLETE,
    handler: (data) => {
      mgr.clearBusy();
      mgr.showToast(data?.message || getSpriteEventText('importComplete', { count: data?.count }), { category: 'success', duration: 1500 });
      mgr.playOnce('celebrate', { durationMs: 1500 });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_RESOURCE_IMPORT_ERROR,
    handler: (data) => {
      mgr.clearBusy();
      mgr.showToast(data?.message || data?.error || getSpriteEventText('importError'), { category: 'error', duration: 2000 });
      mgr.playOnce('emotion', { durationMs: 1500 });
    }
  });

  // ===== 下载事件 =====

  handlers.push({
    event: AppEvent.SPRITE_DOWNLOAD_START,
    handler: (data) => {
      mgr.trigger('download', { message: data?.message || '下载中...' });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_DOWNLOAD_COMPLETE,
    handler: (data) => {
      mgr.trigger('success', { message: data?.message || '下载完成！' });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_DOWNLOAD_FAIL,
    handler: (data) => {
      mgr.trigger('error', { message: data?.message || data?.error || '下载失败' });
    }
  });

  // ===== 插件事件 =====

  handlers.push({
    event: AppEvent.SPRITE_PLUGIN_INSTALL,
    handler: (data) => {
      mgr.trigger('install', { message: data?.message || '插件安装完成！' });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_PLUGIN_REMOVE,
    handler: (data) => {
      mgr.trigger('remove', { message: data?.message || '插件已移除' });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_PLUGIN_UPDATE,
    handler: (data) => {
      mgr.trigger('update', { message: data?.message || '插件已更新！' });
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
      mgr.showBusy(data?.message || '媒体处理中...', 0);
      mgr.trigger('processing', { silent: true });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_MEDIA_PROCESS_COMPLETE,
    handler: (data) => {
      mgr.clearBusy();
      mgr.trigger('success', { message: data?.message || '媒体处理完成！' });
    }
  });

  // ===== RSS 事件 =====

  handlers.push({
    event: AppEvent.SPRITE_RSS_REFRESH,
    handler: (data) => {
      mgr.trigger('sync', { message: data?.message || '正在刷新订阅...' });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_RSS_NEW_CONTENT,
    handler: (data) => {
      mgr.trigger('curious', { message: data?.message || '有新内容更新了~' });
    }
  });

  // ===== 回收站事件 =====

  handlers.push({
    event: AppEvent.SPRITE_TRASH_DELETE,
    handler: (data) => {
      mgr.trigger('remove', { message: data?.message || '已移到回收站' });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_TRASH_RESTORE,
    handler: (data) => {
      mgr.trigger('success', { message: data?.message || '已从回收站恢复！' });
    }
  });

  // ===== 记忆提取事件 =====

  handlers.push({
    event: AppEvent.MEMORY_EXTRACTION_STARTED,
    handler: (data) => {
      mgr.showToast(data?.message || getSpriteEventText('memoryExtractStart'), { category: 'processing' });
      mgr.playOnce('thinking', { durationMs: 2000 });
    }
  });

  handlers.push({
    event: AppEvent.MEMORY_EXTRACTION_PROGRESS,
    handler: (data) => {
      if (data?.progress !== undefined) {
        mgr.updateBusy(data.progress, data.message || getSpriteEventText('memoryExtractProgress', { progress: data.progress }));
      }
    }
  });

  handlers.push({
    event: AppEvent.MEMORY_EXTRACTION_COMPLETED,
    handler: (data) => {
      mgr.clearBusy();
      mgr.showToast(data?.message || getSpriteEventText('memoryExtractComplete'), { category: 'success', duration: 2000 });
      mgr.playOnce('celebrate', { durationMs: 1500 });
    }
  });

  handlers.push({
    event: AppEvent.MEMORY_EXTRACTION_FAILED,
    handler: (data) => {
      mgr.clearBusy();
      mgr.showToast(data?.message || data?.error || getSpriteEventText('memoryExtractFail'), { category: 'error', duration: 2000 });
      mgr.playOnce('emotion', { durationMs: 1500 });
    }
  });

  // ===== 用户画像更新事件 =====

  handlers.push({
    event: AppEvent.USER_PERSONA_UPDATE_STARTED,
    handler: (data) => {
      mgr.showToast(data?.message || getSpriteEventText('personaUpdateStart'), { category: 'processing' });
      mgr.playOnce('thinking', { durationMs: 2000 });
    }
  });

  handlers.push({
    event: AppEvent.USER_PERSONA_UPDATE_COMPLETED,
    handler: (data) => {
      mgr.showToast(data?.message || getSpriteEventText('personaUpdateComplete'), { category: 'success', duration: 2000 });
      mgr.playOnce('celebrate', { durationMs: 1500 });
    }
  });

  handlers.push({
    event: AppEvent.USER_PERSONA_UPDATE_FAILED,
    handler: (data) => {
      mgr.showToast(data?.message || data?.error || getSpriteEventText('personaUpdateFail'), { category: 'error', duration: 2000 });
      mgr.playOnce('emotion', { durationMs: 1500 });
    }
  });

  handlers.push({
    event: AppEvent.USER_PERSONA_UPDATE_SKIPPED,
    handler: (data) => {
      mgr.showToast(data?.message || getSpriteEventText('personaUpdateSkipped'), { category: 'info', duration: 1500 });
    }
  });

  // 注册所有事件监听器
  handlers.forEach(({ event, handler }) => {
    eventManager.on(event, handler);
  });

  // 返回清理函数
  return () => {
    handlers.forEach(({ event, handler }) => {
      eventManager.off(event, handler);
    });
  };
}
