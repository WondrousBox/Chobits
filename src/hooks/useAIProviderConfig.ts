import type { WorkflowAiMissingProviderEvent } from '@workflow/integrations/client';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { workflowClient } from '@/lib/workflow-client';

/**
 * useAIProviderConfig
 * - 负责：全局监听 AI Provider 配置缺失事件，确保无论用户在哪个页面都能弹出配置窗口
 * - 场景：应用级别，在 App 组件挂载时调用一次
 */
export function useAIProviderConfig(): void {
  useEffect(() => {
    const handleMissingProvider = (payload: WorkflowAiMissingProviderEvent): void => {
      const pid: string = payload?.providerId || 'zhipu';
      const fields: string[] = Array.isArray(payload?.fields) && payload.fields.length ? payload.fields : ['apiKey'];
      console.log('[AI Provider Config] 检测到缺少配置，准备打开配置窗口:', { providerId: pid, fields });

      // 预设已经成为 AI 配置的主入口，这里直接引导用户前往设置页管理预设
      window.YUA.window['window:open']('settings' as any, { category: 'ai', aiProviderId: pid }, { sameDisplayAsSender: true })
        .then(() => {
          console.log('[AI Provider Config] 已打开 AI 设置页');
        })
        .catch((err: any) => {
          console.error('[AI Provider Config] 打开 AI 设置页失败:', err);
          toast.error(`无法打开 AI 设置页: ${err?.message || '未知错误'}`);
        });
    };

    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = workflowClient.onAiMissingProvider(handleMissingProvider);
    } catch (err) {
      console.error('[AI Provider Config] 注册全局事件监听器失败:', err);
    }

    return () => {
      try {
        unsubscribe?.();
      } catch (err) {
        console.error('[AI Provider Config] 移除全局事件监听器失败:', err);
      }
    };
  }, []);
}
