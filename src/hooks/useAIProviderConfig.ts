import { useEffect } from 'react';
import { toast } from 'sonner';

/**
 * useAIProviderConfig
 * - 负责：全局监听 AI Provider 配置缺失事件，确保无论用户在哪个页面都能弹出配置窗口
 * - 场景：应用级别，在 App 组件挂载时调用一次
 */
export function useAIProviderConfig(): void {
  useEffect(() => {
    const handleMissingProvider = (_e: any, payload: any): void => {
      const providerId: string = payload?.providerId || 'zhipu';
      const fields: string[] = Array.isArray(payload?.fields) && payload.fields.length ? payload.fields : ['apiKey'];
      console.log('[AI Provider Config] 检测到缺少配置，准备打开配置窗口:', { providerId, fields });

      // 预设已经成为 AI 配置的主入口，这里直接引导用户前往设置页管理预设
      window.chobits.window['window:open']('settings' as any, { category: 'ai', aiProviderId: providerId }, { sameDisplayAsSender: true })
        .then(() => {
          console.log('[AI Provider Config] 已打开 AI 设置页');
        })
        .catch((err: any) => {
          console.error('[AI Provider Config] 打开 AI 设置页失败:', err);
          toast.error(`无法打开 AI 设置页: ${err?.message || '未知错误'}`);
        });
    };

    try {
      window.ipcRenderer.on('wf:ai-missing-provider', handleMissingProvider);
    } catch (err) {
      console.error('[AI Provider Config] 注册全局事件监听器失败:', err);
    }

    return () => {
      try {
        window.ipcRenderer.off('wf:ai-missing-provider', handleMissingProvider);
      } catch (err) {
        console.error('[AI Provider Config] 移除全局事件监听器失败:', err);
      }
    };
  }, []);
}
