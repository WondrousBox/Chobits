import type { MissingModel, ValidateResult, WorkflowDefinition, WorkflowDraft, WorkflowValidationIssue } from '@packages/workflow/types';
import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { toPersistedWorkflowDefinition } from './workflow-definition-mapper';

interface WorkflowSaveResponse {
  ok: boolean;
  error?: string;
  validation?: {
    issues?: WorkflowValidationIssue[];
    errors?: string[];
  };
}

export interface WorkflowPersistenceClient {
  validate(definition: WorkflowDefinition): Promise<ValidateResult>;
  save(definition: WorkflowDefinition, workspaceId?: string): Promise<WorkflowSaveResponse>;
}

interface WorkflowPluginResource {
  id: string;
  pluginId: string;
  type: 'engine' | 'model';
  name?: string;
  displayName?: string;
}

export interface WorkflowPluginResourceClient {
  listSupported(): Promise<WorkflowPluginResource[]>;
  install(request: { pluginId: string; resourceId: string; deleteAfterInstall: boolean }): Promise<{ ok?: boolean; error?: string; data?: { status?: string } }>;
}

interface WorkflowNotificationOptions {
  description?: string;
  action?: { label: string; onClick(): void };
}

export interface WorkflowPersistenceNotifier {
  success(title: string, options?: WorkflowNotificationOptions): void;
  error(title: string, options?: WorkflowNotificationOptions): void;
  info(title: string, options?: WorkflowNotificationOptions): void;
}

interface WorkflowDefinitionEventPublisher {
  postMessage(message: { type: 'definition-upserted'; def: WorkflowDefinition; workspaceId: string }): void;
}

interface UseWorkflowPersistenceOptions {
  draft: WorkflowDraft | null;
  isPresetWorkflow: boolean;
  eventPublisher: WorkflowDefinitionEventPublisher;
  client?: WorkflowPersistenceClient;
  pluginResources?: WorkflowPluginResourceClient;
  notifier?: WorkflowPersistenceNotifier;
  notifyPresetReadOnly?: () => void;
}

interface WorkflowPersistenceState {
  saving: boolean;
  validateDefinition(): Promise<void>;
  saveDefinition(): Promise<void>;
}

interface SaveAttempt {
  scope: symbol;
  attempt: symbol;
}

const defaultClient: WorkflowPersistenceClient = {
  validate: (definition) => window.ipcRenderer.invoke('wf:validate', { def: definition }),
  save: (definition, workspaceId) => window.ipcRenderer.invoke('wf:saveDefinition', { def: definition, workspaceId })
};

const defaultPluginResources: WorkflowPluginResourceClient = {
  async listSupported() {
    const list = window.YUA?.pluginResource?.['plugin-resource:listSupported'];
    if (typeof list !== 'function') throw new Error('无法访问插件资源列表接口');
    const resources = await list();
    if (!Array.isArray(resources)) throw new Error('无法获取插件资源列表');
    return resources as WorkflowPluginResource[];
  },
  async install(request) {
    const install = window.YUA?.pluginResource?.['plugin-resource:install'];
    if (typeof install !== 'function') throw new Error('缺少插件安装接口');
    return install(request);
  }
};

const defaultNotifier: WorkflowPersistenceNotifier = {
  success: (title, options) => toast.success(title, options),
  error: (title, options) => toast.error(title, options),
  info: (title, options) => toast.info(title, options)
};

export function formatWorkflowValidationDetails(validation?: WorkflowSaveResponse['validation']): string | undefined {
  if (Array.isArray(validation?.issues)) {
    return validation.issues.map((issue) => `${issue.path.length > 0 ? `${issue.path.join('.')}: ` : ''}${issue.message}`).join('；');
  }
  return Array.isArray(validation?.errors) ? validation.errors.join('；') : undefined;
}

export function useWorkflowPersistence({
  draft,
  isPresetWorkflow,
  eventPublisher,
  client = defaultClient,
  pluginResources = defaultPluginResources,
  notifier = defaultNotifier,
  notifyPresetReadOnly = () => alert('预设工作流不允许修改，请先保存为新工作流')
}: UseWorkflowPersistenceOptions): WorkflowPersistenceState {
  const persistenceScope = useMemo(() => Symbol(`${draft?.workspaceId || 'default'}:${draft?.id || 'none'}`), [draft?.id, draft?.workspaceId]);
  const saveAttemptRef = useRef<SaveAttempt | null>(null);
  const [saveAttempt, setSaveAttempt] = useState<SaveAttempt | null>(null);

  const installPluginResource = useCallback(
    async (pluginId: string): Promise<boolean> => {
      try {
        const supported = await pluginResources.listSupported();
        const resource = supported.find((candidate) => candidate.pluginId === pluginId && candidate.type === 'engine');
        if (!resource) {
          notifier.error('插件安装失败', { description: `未找到插件资源: ${pluginId}` });
          return false;
        }
        const result = await pluginResources.install({ pluginId: resource.pluginId, resourceId: resource.id, deleteAfterInstall: true });
        if (!result?.ok) {
          notifier.error('插件安装失败', { description: result?.error || '未知错误' });
          return false;
        }
        if (result.data?.status === 'installed') {
          notifier.success('插件安装成功', { description: pluginId });
          return true;
        }
        notifier.info('插件已加入下载队列', { description: resource.displayName || pluginId });
        return false;
      } catch (error: any) {
        notifier.error('插件安装失败', { description: error?.message || String(error) });
        return false;
      }
    },
    [pluginResources, notifier]
  );

  const installModelResource = useCallback(
    async (missing: MissingModel): Promise<boolean> => {
      try {
        const supported = await pluginResources.listSupported();
        const resource = missing.resourceId
          ? supported.find((candidate) => candidate.id === missing.resourceId && candidate.pluginId === missing.pluginId && candidate.type === 'model')
          : supported.find((candidate) => candidate.pluginId === missing.pluginId && candidate.type === 'model' && candidate.name === missing.modelName);
        if (!resource) {
          notifier.error('模型安装失败', { description: `未找到模型资源: ${missing.modelName}` });
          return false;
        }
        const result = await pluginResources.install({ pluginId: resource.pluginId, resourceId: resource.id, deleteAfterInstall: true });
        if (!result?.ok) {
          notifier.error('模型安装失败', { description: result?.error || '未知错误' });
          return false;
        }
        if (result.data?.status === 'installed') {
          notifier.success('模型安装成功', { description: resource.displayName || missing.modelName });
          return true;
        }
        notifier.info('模型已加入下载队列', { description: resource.displayName || missing.modelName });
        return false;
      } catch (error: any) {
        notifier.error('模型安装失败', { description: error?.message || String(error) });
        return false;
      }
    },
    [pluginResources, notifier]
  );

  const validateDefinition = useCallback(async (): Promise<void> => {
    if (!draft) return;
    const result = await client.validate(toPersistedWorkflowDefinition(draft));
    if (result.ok) {
      notifier.success('校验通过', { description: '工作流配置正确，可以保存和运行' });
      return;
    }

    const missingPlugins = result.missingPlugins || [];
    const missingModels = result.missingModels || [];
    const errors = [
      ...(result.errors || []),
      ...missingPlugins.map((missing) => `缺少插件: ${missing.id}${missing.hint ? `（${missing.hint}）` : ''}`),
      ...missingModels.map((missing) => `缺少模型: ${missing.displayName || missing.modelName}（${missing.pluginId}）`)
    ];
    const firstMissingPlugin = missingPlugins[0]?.id;
    const firstMissingModel = missingModels[0];
    notifier.error('校验失败', {
      description: errors.length > 0 ? errors.join('；') : '工作流配置存在问题',
      action: firstMissingPlugin
        ? {
            label: '下载插件',
            onClick: () => {
              void installPluginResource(firstMissingPlugin).then(async (installed) => {
                if (installed) await validateDefinition();
              });
            }
          }
        : firstMissingModel
          ? {
              label: '下载模型',
              onClick: () => {
                void installModelResource(firstMissingModel).then(async (installed) => {
                  if (installed) await validateDefinition();
                });
              }
            }
          : undefined
    });
  }, [draft, client, notifier, installPluginResource, installModelResource]);

  const saveDefinition = useCallback(async (): Promise<void> => {
    if (!draft) return;
    if (isPresetWorkflow) {
      notifyPresetReadOnly();
      return;
    }

    const attempt = { scope: persistenceScope, attempt: Symbol('workflow-save') };
    saveAttemptRef.current = attempt;
    setSaveAttempt(attempt);
    try {
      const definition = toPersistedWorkflowDefinition(draft);
      const result = await client.save(definition, draft.workspaceId);
      if (!result.ok) {
        notifier.error(result.error || '工作流保存失败', { description: formatWorkflowValidationDetails(result.validation) });
        return;
      }
      try {
        eventPublisher.postMessage({ type: 'definition-upserted', def: definition, workspaceId: draft.workspaceId! });
      } catch {
        // A closed cross-window channel must not change the save result.
      }
      notifier.success('工作流保存成功', {
        description: draft.id.startsWith('new-') ? '新工作流已创建，可在工作流列表中查看' : '工作流已更新'
      });
    } finally {
      if (saveAttemptRef.current?.attempt === attempt.attempt) {
        saveAttemptRef.current = null;
        setSaveAttempt((current) => (current?.attempt === attempt.attempt ? null : current));
      }
    }
  }, [draft, isPresetWorkflow, persistenceScope, client, notifier, notifyPresetReadOnly, eventPublisher]);

  return {
    saving: saveAttempt?.scope === persistenceScope,
    validateDefinition,
    saveDefinition
  };
}
