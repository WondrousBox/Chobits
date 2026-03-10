/**
 * 精灵动画触发辅助函数
 *
 * 提供便捷的触发函数，供业务代码调用
 * 支持配置驱动设计，可扩展
 */

import type { TriggerConfig } from '../config/trigger-mapping';
import { TRIGGER_MAPPING } from '../config/trigger-mapping';
import { SpriteManager } from '../sprite-manager';
import type { MessageCategory } from '../types';

/**
 * 触发精灵动画(核心函数)
 * @param triggerKey 触发器key，如 'ai:chat:complete'
 * @param options 可选配置覆盖
 */
export function triggerSpriteAnimation(
  triggerKey: string,
  options?: {
    skipAnimation?: boolean;
    skipToast?: boolean;
    customMessage?: string;
    progress?: number;
  }
): void {
  const config = TRIGGER_MAPPING[triggerKey];
  if (!config) {
    console.warn(`[triggerSpriteAnimation] Unknown trigger: ${triggerKey}`);
    return;
  }

  try {
    const mgr = SpriteManager.getInstance();
    if (!mgr) return;

    // 播放动画(通过 playOnce 触发反应状态)
    if (!options?.skipAnimation && config.eventType) {
      mgr.playOnce(config.eventType as any, {
        durationMs: config.duration ?? 1500
      });
    }

    // 显示 toast
    if (!options?.skipToast && config.showToast) {
      mgr.showToast(options?.customMessage || config.toastMessage, {
        category: config.toastCategory,
        duration: config.duration
      });
    }

    // 进度更新
    if (options?.progress !== undefined) {
      if (options.progress > 0 && options.progress < 100) {
        mgr.showBusy(options.customMessage, options.progress);
      } else if (options.progress >= 100) {
        mgr.clearBusy();
      }
    }
  } catch (error) {
    console.error(`[triggerSpriteAnimation] Error:`, error);
  }
}

// 便捷函数:AI 聊天
export const spriteAI = {
  start: (msg?: string) => triggerSpriteAnimation('ai:chat:start', { customMessage: msg ?? '思考中...' }),
  complete: (msg?: string) => triggerSpriteAnimation('ai:chat:complete', { customMessage: msg ?? '完成！' }),
  error: (msg: string) => triggerSpriteAnimation('ai:chat:error', { customMessage: msg })
};

// 便捷函数:工作流
export const spriteWorkflow = {
  start: (name?: string) => triggerSpriteAnimation('workflow:start', { customMessage: name ? `执行: ${name}` : '执行中...' }),
  complete: () => triggerSpriteAnimation('workflow:complete'),
  fail: (msg?: string) => triggerSpriteAnimation('workflow:fail', { customMessage: msg })
};

// 便捷函数:资源导入
export const spriteResource = {
  start: () => triggerSpriteAnimation('resource:import:start', { customMessage: '导入中...' }),
  progress: (p: number) => triggerSpriteAnimation('resource:import:start', { progress: p }),
  complete: (count?: number) =>
    triggerSpriteAnimation('resource:import:complete', {
      customMessage: count ? `已导入 ${count} 个文件` : '导入完成'
    })
};
