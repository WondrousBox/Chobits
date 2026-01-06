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
      const pid: string = payload?.providerId || 'zhipu';
      const fields: string[] = Array.isArray(payload?.fields) && payload.fields.length ? payload.fields : ['apiKey'];
      console.log('[AI Provider Config] 检测到缺少配置，准备打开配置窗口:', { providerId: pid, fields });

      // 使用统一的窗口管理器打开配置窗口，并通过 payload 传递需要配置的字段
      window.YUA.window['window:open']('aiProviderConfig' as any, { providerId: pid, fields }, { sameDisplayAsSender: true })
        .then(() => {
          console.log('[AI Provider Config] 配置窗口已打开');
        })
        .catch((err: any) => {
          console.error('[AI Provider Config] 打开配置窗口失败:', err);
          toast.error(`无法打开配置窗口: ${err?.message || '未知错误'}`);
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
