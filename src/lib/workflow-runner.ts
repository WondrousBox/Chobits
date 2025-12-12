import { toast } from 'sonner';

export interface RunWorkflowOptions {
  defId: string;
  input?: Record<string, any>;
  metadata?: Record<string, any>;
  onSuccess?: (runId: string) => void;
  onError?: (error: any) => void;
}

/**
 * 统一运行工作流，自动处理输入参数缺失的情况
 */
export async function runWorkflow(options: RunWorkflowOptions): Promise<void> {
  const { defId, input = {}, metadata = {}, onSuccess, onError } = options;

  try {
    const result = await window.ipcRenderer.invoke('wf:run', {
      defId,
      input,
      metadata
    });

    if (!result?.ok) {
      if (result?.error === 'input-required' && result?.inputMode) {
        // 触发输入侧边栏
        window.dispatchEvent(
          new CustomEvent('wf:start-input-required', {
            detail: {
              defId,
              inputMode: result.inputMode,
              metadata
            }
          })
        );
        return;
      }

      const description = result?.error || (result?.validation ? (typeof result.validation === 'string' ? result.validation : JSON.stringify(result.validation)) : '未知错误');
      toast.error('工作流执行失败', { description });
      onError?.(new Error(description));
      return;
    }

    onSuccess?.(result.runId);
  } catch (err: any) {
    const message = err?.message || String(err);
    toast.error('工作流执行失败', { description: message });
    onError?.(err);
  }
}
