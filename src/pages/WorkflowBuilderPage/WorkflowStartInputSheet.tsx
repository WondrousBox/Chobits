import { useEffect, useMemo, useState } from 'react';
import { TbLoader2, TbPlayerPlay } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { runWorkflow } from '@/lib/workflow-runner';

import { ConfigFieldRenderer } from './ConfigFieldRenderer';
import { getGradientBackgroundStyle, getIconComponent } from './nodeUtils';
import type { NodeSpec } from './types';

type ConfigSchema = NonNullable<NodeSpec['config']>[number];

type MissingConfig = {
  nodeId: string;
  nodeLabel: string;
  nodeType?: string;
  missingFields: ConfigSchema[];
  currentConfig?: Record<string, any>;
  icon?: string;
  backgroundColor?: string;
};

type IncomingPayload = {
  defId: string;
  metadata?: Record<string, any>;
  missingConfigs?: MissingConfig[];
  originalInput?: Record<string, any>; // 保留原始输入，包括 resource 对象等
};

const invoke = window.ipcRenderer.invoke;

type Folder = {
  id: string;
  name: string;
  parentId?: string | null;
  workspaceId?: string;
};

const WORKFLOW_START_INPUT_STORAGE_KEY = 'workflow:start-input';

export default function WorkflowStartInputSheet(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [defId, setDefId] = useState<string>('');
  const [metadata, setMetadata] = useState<Record<string, any>>({});
  const [originalInput, setOriginalInput] = useState<Record<string, any>>({}); // 保留原始输入
  const [missingConfigs, setMissingConfigs] = useState<MissingConfig[]>([]);
  const [configValues, setConfigValues] = useState<Record<string, Record<string, any>>>({});
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rememberConfig, setRememberConfig] = useState(false);

  const loadStoredConfig = (workflowDefId: string, payloadMissingConfigs?: MissingConfig[]): void => {
    try {
      const raw = window.localStorage.getItem(WORKFLOW_START_INPUT_STORAGE_KEY);
      if (!raw) {
        setRememberConfig(false);
        setConfigValues({});
        return;
      }

      const parsed = JSON.parse(raw) as Record<
        string,
        {
          remember: boolean;
          configValues: Record<string, Record<string, any>>;
        }
      >;

      const record = parsed[workflowDefId];
      if (!record || !record.remember) {
        setRememberConfig(false);
        setConfigValues({});
        return;
      }

      // 只保留当前 missingConfigs 中出现的字段，避免脏数据
      const safeConfigValues: Record<string, Record<string, any>> = {};
      const source = record.configValues || {};
      const targetMissingConfigs = payloadMissingConfigs || missingConfigs;

      for (const node of targetMissingConfigs) {
        const nodeConfig = source[node.nodeId];
        if (!nodeConfig) continue;

        const filtered: Record<string, any> = {};
        for (const field of node.missingFields) {
          if (Object.prototype.hasOwnProperty.call(nodeConfig, field.key)) {
            filtered[field.key] = nodeConfig[field.key];
          }
        }

        if (Object.keys(filtered).length > 0) {
          safeConfigValues[node.nodeId] = filtered;
        }
      }

      setRememberConfig(true);
      setConfigValues(safeConfigValues);
    } catch {
      setRememberConfig(false);
      setConfigValues({});
    }
  };

  // 监听工作流开始节点需要输入的事件
  useEffect(() => {
    const handleStartInputRequired = (_e: any, payload: IncomingPayload): void => {
      setDefId(payload.defId);
      setMetadata(payload.metadata || {});
      setOriginalInput(payload.originalInput || {}); // 保存原始输入
      setMissingConfigs(payload.missingConfigs || []);
      setOpen(true);

      // 根据 defId 和当前缺失配置从本地缓存恢复上次设置
      if (payload.defId) {
        loadStoredConfig(payload.defId, payload.missingConfigs || []);
      } else {
        setRememberConfig(false);
        setConfigValues({});
      }
    };

    // 监听来自渲染进程内部的事件（新逻辑）
    const handleInternalEvent = (e: CustomEvent<IncomingPayload>): void => {
      handleStartInputRequired(null, e.detail);
    };
    window.addEventListener('wf:start-input-required', handleInternalEvent as EventListener);

    return () => {
      window.removeEventListener('wf:start-input-required', handleInternalEvent as EventListener);
    };
  }, []);

  // 加载文件夹列表（仅在需要文件夹输入时）
  useEffect(() => {
    const hasFolderInput = missingConfigs.some((node) => node.missingFields.some((field) => field.inputType === 'folder'));
    if (!hasFolderInput || !open) return;

    let mounted = true;
    const loadFolders = async (): Promise<void> => {
      setLoadingFolders(true);
      try {
        const folderAPI: any = window.YUA?.folder;
        if (!folderAPI) {
          if (mounted) setLoadingFolders(false);
          return;
        }

        // 获取默认工作空间
        const ws = await window.YUA.workspace['workspace:getDefault']();
        if (!ws?.id) {
          if (mounted) setLoadingFolders(false);
          return;
        }

        // 获取所有文件夹
        const folderList = await folderAPI['folder.list']({
          workspaceId: ws.id,
          deletedAt: 0
        });

        if (mounted) {
          setFolders(folderList || []);
        }
      } catch (err) {
        console.warn('load folders failed', err);
        if (mounted) {
          toast.error('加载文件夹列表失败');
        }
      } finally {
        if (mounted) setLoadingFolders(false);
      }
    };

    loadFolders();

    return () => {
      mounted = false;
    };
  }, [missingConfigs, open]);

  // 监听配置变化，动态更新表单项
  useEffect(() => {
    if (!open || missingConfigs.length === 0) return;

    let mounted = true;

    const timer = setTimeout(async () => {
      let hasUpdates = false;
      const newMissingConfigs = [...missingConfigs];

      for (let i = 0; i < newMissingConfigs.length; i++) {
        if (!mounted) return;
        const node = newMissingConfigs[i];
        if (!node.nodeType) continue;

        // 获取当前节点的配置值（合并原有配置和用户输入）
        const userConfig = configValues[node.nodeId] || {};
        const effectiveConfig = { ...(node.currentConfig || {}), ...userConfig };

        try {
          // 调用后端获取最新的配置 schema
          const result = await invoke('wf:getNodeConfig', {
            nodeId: node.nodeType,
            config: effectiveConfig
          });

          if (!mounted) return;

          if (result?.ok && Array.isArray(result.config)) {
            const dynamicConfig = result.config as ConfigSchema[];

            // 更新 missingFields 中的 options 等属性
            const updatedMissingFields = node.missingFields.map((field) => {
              const newField = dynamicConfig.find((f) => f.key === field.key);
              if (newField) {
                // 如果找到了对应的字段，更新它
                return { ...field, ...newField };
              }
              return field;
            });

            // 检查是否有变化
            if (JSON.stringify(updatedMissingFields) !== JSON.stringify(node.missingFields)) {
              newMissingConfigs[i] = { ...node, missingFields: updatedMissingFields };
              hasUpdates = true;
            }
          }
        } catch (err) {
          console.warn(`Failed to update dynamic config for node ${node.nodeId}`, err);
        }
      }

      if (hasUpdates && mounted) {
        setMissingConfigs(newMissingConfigs);
      }
    }, 300);

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [configValues, open, missingConfigs]);

  const isValidUrl = (urlString: string): boolean => {
    try {
      const urlObj = new URL(urlString);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const isFormValid = useMemo(() => {
    if (missingConfigs.length === 0) return true;
    for (const node of missingConfigs) {
      for (const field of node.missingFields) {
        const val = configValues[node.nodeId]?.[field.key];
        if (val === undefined || val === null || val === '') {
          return false;
        }
        if ((field.key === 'url' || field.inputType === 'url') && typeof val === 'string' && !isValidUrl(val)) {
          return false;
        }
      }
    }
    return true;
  }, [missingConfigs, configValues]);

  const handleConfirm = async (): Promise<void> => {
    if (submitting) return;

    let input: Record<string, any> = {};

    // 收集配置输入
    if (missingConfigs.length > 0) {
      // 验证配置值
      if (!isFormValid) {
        toast.error('请完善所有必填项');
        return;
      }

      // 处理 Start 节点的特殊输入
      const startNodeConfig = missingConfigs.find((n) => n.nodeType === 'core/start');
      if (startNodeConfig) {
        const startValues = configValues[startNodeConfig.nodeId] || {};
        // 将 Start 节点的值合并到 input 根对象
        input = { ...input, ...startValues };

        // 如果是文件夹输入，还需要查找 workspaceId
        if (startValues.folderId) {
          const selectedFolder = folders.find((f) => f.id === startValues.folderId);
          if (selectedFolder?.workspaceId) {
            input.workspaceId = selectedFolder.workspaceId;
          }
        }
      }

      input = { ...input, __configOverrides__: configValues };
    }

    // 处理本地记住配置
    try {
      const raw = window.localStorage.getItem(WORKFLOW_START_INPUT_STORAGE_KEY);
      const parsed =
        (raw
          ? (JSON.parse(raw) as Record<
            string,
            {
              remember: boolean;
              configValues: Record<string, Record<string, any>>;
            }
          >)
          : {}) || {};

      if (rememberConfig) {
        parsed[defId] = {
          remember: true,
          configValues
        };
      } else {
        if (parsed[defId]) {
          delete parsed[defId];
        }
      }

      window.localStorage.setItem(WORKFLOW_START_INPUT_STORAGE_KEY, JSON.stringify(parsed));
    } catch {
      // ignore storage error
    }

    setSubmitting(true);
    try {
      // 构建最终的 input，合并原始 input 和用户填写的配置
      // 优先保留原始 input 中的信息（如 resource 对象），然后合并用户填写的配置
      const finalInput = {
        ...originalInput, // 保留原始输入，包括 resource 对象等
        ...input // 用户填写的配置会覆盖原始 input 中对应的字段
      };

      // 构建最终的 metadata，优先保留原始 metadata 中的所有值
      const data = {
        // 首先保留原始 metadata 中的所有值（包括 workspaceId 和 folderId）
        ...metadata,
        // 添加输入模式相关的元数据（不覆盖已有的值）
        ...(input.text && !metadata.textLength ? { textLength: input.text.length } : {}),
        ...(input.url && !metadata.url ? { url: input.url } : {}),
        ...(input.file && !metadata.filePath ? { filePath: input.file } : {}),
        // 只有在用户明确输入新的 folderId 时才更新，否则保留原始 metadata 中的值
        ...(input.folderId
          ? {
            folderId: input.folderId,
            // 优先使用用户选择的文件夹对应的 workspaceId，如果没有则保留原始 metadata 中的 workspaceId
            workspaceId: input.workspaceId || metadata.workspaceId
          }
          : {}),
        ...(missingConfigs.length > 0 ? { configOverridesCount: Object.keys(configValues).length } : {})
      };

      console.log('finalInput', finalInput);
      console.log('metadata', data);

      await runWorkflow({
        defId,
        input: finalInput, // 使用合并后的 input
        metadata: data,
        onSuccess: () => {
          toast.success('工作流已开始执行');
          setOpen(false);
        }
      });
    } catch (err: any) {
      // runWorkflow handles most errors, but we catch unexpected ones here
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-[400px] h-full flex flex-col p-0">
        <SheetHeader className="pt-6 px-4">
          <SheetTitle>完善必填项</SheetTitle>
          <SheetDescription>当前执行的任务需要你填写以下信息</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 box-border flex-1 overflow-y-auto px-4">
          {missingConfigs.length > 0 && (
            <div className="space-y-4 overflow-y-auto">
              {missingConfigs.map((node) => {
                const Icon = getIconComponent(node.icon);
                const bgStyle = getGradientBackgroundStyle(node.backgroundColor, 0.1);
                const iconColor = node.backgroundColor || 'currentColor';

                return (
                  <div key={node.nodeId} className="border rounded-md py-4 relative overflow-hidden">
                    <div className="absolute inset-0 pointer-events-none" style={bgStyle} />
                    <div className="flex items-center gap-2 font-medium px-4 relative z-10 pb-4">
                      {Icon ? <Icon className="w-5 h-5" style={{ color: iconColor }} /> : <div className="w-1 h-4 bg-primary rounded-full" />}
                      {node.nodeLabel}
                    </div>
                    <div className="space-y-4 px-4 relative z-10">
                      {node.missingFields.map((field) => (
                        <ConfigFieldRenderer
                          key={field.key}
                          field={field}
                          value={configValues[node.nodeId]?.[field.key]}
                          onChange={(val) => {
                            setConfigValues((prev) => ({
                              ...prev,
                              [node.nodeId]: {
                                ...prev[node.nodeId],
                                [field.key]: val
                              }
                            }));
                          }}
                          folderList={folders}
                          loadingFolders={loadingFolders}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 box-border pb-4 px-4">
          <label className="flex items-center gap-2 text-xs text-muted-foreground select-none">
            <input type="checkbox" className="w-3 h-3 rounded border-muted-foreground/40" checked={rememberConfig} onChange={(e) => setRememberConfig(e.target.checked)} />
            记住本次设置
          </label>
          <Button onClick={handleConfirm} disabled={submitting || !isFormValid}>
            {submitting ? (
              <>
                <TbLoader2 className="animate-spin" />
                运行中...
              </>
            ) : (
              <>
                <TbPlayerPlay />
                运行
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
