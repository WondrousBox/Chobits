/**
 * 精灵事件监听器
 *
 * 订阅 AppEvent 中的精灵相关事件，并触发相应的动画。
 * 通过事件系统解耦业务模块与精灵模块。
 */

import { AppEvent, eventManager } from '@packages/event';

import type { SpriteManager } from '../sprite-manager';

export interface SpriteEventPayload {
  message?: string;
  progress?: number;
  workflowName?: string;
  count?: number;
  error?: string;
}

type SpriteHandler = (data?: SpriteEventPayload) => void;

/**
 * 初始化精灵事件监听器
 *
 * 订阅业务模块发送的精灵触发事件，并调用 SpriteManager 触发动画
 */
export function initSpriteEventListener(mgr: SpriteManager): () => void {
  const handlers: Array<{ event: AppEvent; handler: SpriteHandler }> = [];

  // AI 聊天事件
  handlers.push({
    event: AppEvent.SPRITE_AI_START,
    handler: (data) => {
      mgr.showToast(data?.message || '思考中...', { category: 'loading' });
      mgr.playOnce('emotion', { durationMs: 2000 });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_AI_COMPLETE,
    handler: (data) => {
      mgr.showToast(data?.message || '完成！', { category: 'success', duration: 1500 });
      mgr.playOnce('celebrate', { durationMs: 1500 });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_AI_ERROR,
    handler: (data) => {
      mgr.showToast(data?.message || data?.error || '出错了', { category: 'error', duration: 2000 });
      mgr.playOnce('emotion', { durationMs: 1500 });
    }
  });

  // 工作流事件
  handlers.push({
    event: AppEvent.SPRITE_WORKFLOW_START,
    handler: (data) => {
      mgr.showBusy(data?.message || data?.workflowName || '执行中...', 0);
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
      mgr.showToast(data?.message || '任务完成！', { category: 'celebrate', duration: 2000 });
      mgr.playOnce('celebrate', { durationMs: 2000 });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_WORKFLOW_FAIL,
    handler: (data) => {
      mgr.clearBusy();
      mgr.showToast(data?.message || data?.error || '执行失败', { category: 'error', duration: 2000 });
      mgr.playOnce('emotion', { durationMs: 1500 });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_WORKFLOW_CANCEL,
    handler: () => {
      mgr.clearBusy();
      mgr.showToast('已取消', { category: 'info', duration: 1000 });
    }
  });

  // 资源导入事件
  handlers.push({
    event: AppEvent.SPRITE_RESOURCE_IMPORT_START,
    handler: (data) => {
      mgr.showBusy(data?.message || '导入中...', 0);
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
      const msg = data?.count ? `已导入 ${data.count} 个文件` : '导入完成';
      mgr.showToast(msg, { category: 'success', duration: 1500 });
      mgr.playOnce('celebrate', { durationMs: 1500 });
    }
  });

  handlers.push({
    event: AppEvent.SPRITE_RESOURCE_IMPORT_ERROR,
    handler: (data) => {
      mgr.clearBusy();
      mgr.showToast(data?.message || data?.error || '导入失败', { category: 'error', duration: 2000 });
      mgr.playOnce('emotion', { durationMs: 1500 });
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
