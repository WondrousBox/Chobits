import { toast } from 'sonner';

export interface RunWorkflowOptions {
  defId: string;
  input?: Record<string, any>;
  metadata?: Record<string, any>;
  onSuccess?: (runId: string) => void;
  onError?: (error: any) => void;
}

/**
 * 安装模型资源
 */
async function installModelResource(pluginId: string, modelName: string, resourceId?: string): Promise<boolean> {
  try {
    const pluginResourceApi = window.YUA?.pluginResource;
    if (!pluginResourceApi) {
      toast.error('模型安装失败', { description: '无法访问插件资源接口' });
      return false;
    }
    const listFn = pluginResourceApi['plugin-resource:listSupported'];
    if (typeof listFn !== 'function') {
      toast.error('模型安装失败', { description: '缺少插件资源列表接口' });
      return false;
    }
    const supportedResources = await listFn();
    if (!Array.isArray(supportedResources)) {
      toast.error('模型安装失败', { description: '无法获取插件资源列表' });
      return false;
    }
    // 优先使用 resourceId 查找，否则根据 modelName 查找
    const modelResource = resourceId
      ? supportedResources.find((p: any) => p.id === resourceId && p.pluginId === pluginId && p.type === 'model')
      : supportedResources.find((p: any) => p.pluginId === pluginId && p.type === 'model' && p.name === modelName);

    if (!modelResource) {
      toast.error('模型安装失败', { description: `未找到模型资源: ${modelName}` });
      return false;
    }
    const installFn = pluginResourceApi['plugin-resource:install'];
    if (typeof installFn !== 'function') {
      toast.error('模型安装失败', { description: '缺少插件安装接口' });
      return false;
    }
    const result = await installFn({
      pluginId: modelResource.pluginId,
      resourceId: modelResource.id,
      deleteAfterInstall: true
    });
    if (result?.ok) {
      toast.success('模型安装成功', { description: modelResource.displayName || modelName });
      return true;
    }
    toast.error('模型安装失败', { description: result?.error || '未知错误' });
    return false;
  } catch (err: any) {
    toast.error('模型安装失败', { description: err?.message || String(err) });
    return false;
  }
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

    console.log(result);

    if (!result?.ok) {
      if (result?.error === 'input-required') {
        // 触发输入侧边栏（包含开始节点输入和配置输入）
        // 传递原始的 input 和 metadata，以便在用户填写表单后保留所有上下文信息
        window.dispatchEvent(
          new CustomEvent('wf:start-input-required', {
            detail: {
              defId,
              missingConfigs: result.missingConfigs,
              metadata,
              originalInput: input // 保留原始输入，包括 resource 对象等
            }
          })
        );
        return;
      }

      // 检查验证结果中是否有缺失的模型
      const validation = result?.validation;
      if (validation && typeof validation === 'object' && !Array.isArray(validation)) {
        const missingModels = (validation as any).missingModels;
        if (Array.isArray(missingModels) && missingModels.length > 0) {
          const firstMissing = missingModels[0];
          const errors: string[] = [];
          if (validation.errors && Array.isArray(validation.errors)) {
            errors.push(...validation.errors);
          }
          if (validation.missingPlugins && Array.isArray(validation.missingPlugins)) {
            errors.push(...validation.missingPlugins.map((m: any) => `缺少插件: ${m.id}`));
          }
          errors.push(...missingModels.map((m: any) => `缺少模型: ${m.displayName || m.modelName}`));

          toast.error('工作流执行失败', {
            description: errors.join('；'),
            action: {
              label: '下载模型',
              onClick: () => {
                void (async () => {
                  const ok = await installModelResource(firstMissing.pluginId, firstMissing.modelName, firstMissing.resourceId);
                  if (ok) {
                    // 重新运行工作流
                    await runWorkflow(options);
                  }
                })();
              }
            }
          });
          onError?.(new Error(errors.join('；')));
          return;
        }
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
