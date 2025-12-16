import { useEffect, useState } from 'react';
import { TbFolder, TbLoader2, TbPlayerPlay } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { runWorkflow } from '@/lib/workflow-runner';
import type { NodeSpec } from '@/types/workflow';

import { ConfigFieldRenderer } from './ConfigFieldRenderer';

type ConfigSchema = NonNullable<NodeSpec['config']>[number];

type MissingConfig = {
  nodeId: string;
  nodeLabel: string;
  nodeType?: string;
  missingFields: ConfigSchema[];
};

type IncomingPayload = {
  defId: string;
  metadata?: Record<string, any>;
  missingConfigs?: MissingConfig[];
};

const invoke = window.ipcRenderer.invoke;

type Folder = {
  id: string;
  name: string;
  parentId?: string | null;
  workspaceId?: string;
};

export default function WorkflowStartInputSheet(): JSX.Element {
  const [open, setOpen] = useState(false);
  const [defId, setDefId] = useState<string>('');
  const [metadata, setMetadata] = useState<Record<string, any>>({});
  const [missingConfigs, setMissingConfigs] = useState<MissingConfig[]>([]);
  const [configValues, setConfigValues] = useState<Record<string, Record<string, any>>>({});
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 监听工作流开始节点需要输入的事件
  useEffect(() => {
    const handleStartInputRequired = (_e: any, payload: IncomingPayload): void => {
      setDefId(payload.defId);
      setMetadata(payload.metadata || {});
      setMissingConfigs(payload.missingConfigs || []);
      setOpen(true);

      // 重置表单
      setConfigValues({});
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

  const isValidUrl = (urlString: string): boolean => {
    try {
      const urlObj = new URL(urlString);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handlePickFile = async (nodeId: string, fieldKey: string): Promise<void> => {
    try {
      const result = await window.YUA.file['file:pickFile']();
      if (!result.canceled && result.path) {
        setConfigValues((prev) => ({
          ...prev,
          [nodeId]: {
            ...prev[nodeId],
            [fieldKey]: result.path
          }
        }));
      }
    } catch (err: any) {
      toast.error('文件选择失败', { description: err?.message || String(err) });
    }
  };

  const handleConfirm = async (): Promise<void> => {
    if (submitting) return;

    let input: Record<string, any> = {};

    // 收集配置输入
    if (missingConfigs.length > 0) {
      // 验证配置值
      for (const node of missingConfigs) {
        for (const field of node.missingFields) {
          const val = configValues[node.nodeId]?.[field.key];
          if (val === undefined || val === null || val === '') {
            toast.error(`请填写 ${node.nodeLabel} 的 ${field.label || field.key}`);
            return;
          }
          // 验证 URL
          if ((field.key === 'url' || field.inputType === 'url') && typeof val === 'string' && !isValidUrl(val)) {
            toast.error(`请填写有效的 ${field.label || field.key} (以 http:// 或 https:// 开头)`);
            return;
          }
        }
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

    setSubmitting(true);
    try {
      const data = {
        // 保留原始 metadata 中的所有值（包括 workspaceId 和 folderId）
        ...metadata,
        // 添加输入模式相关的元数据
        ...(input.text ? { textLength: input.text.length } : {}),
        ...(input.url ? { url: input.url } : {}),
        ...(input.file ? { filePath: input.file } : {}),
        ...(input.folderId ? { folderId: input.folderId, workspaceId: input.workspaceId } : {}),
        ...(missingConfigs.length > 0 ? { configOverridesCount: Object.keys(configValues).length } : {})
      };

      console.log('data', data);

      await runWorkflow({
        defId,
        input,
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
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>完善必填项</SheetTitle>
          <SheetDescription>当前执行的任务需要你填写以下信息</SheetDescription>
        </SheetHeader>

        <div className="py-6 space-y-6 box-border">
          {missingConfigs.length > 0 && (
            <div className="space-y-6 max-h-[60vh] overflow-y-auto pr-2">
              {missingConfigs.map((node) => (
                <div key={node.nodeId} className="space-y-3 border rounded-md p-4">
                  <div className="flex items-center gap-2 font-medium">
                    <div className="w-1 h-4 bg-primary rounded-full" />
                    {node.nodeLabel}
                  </div>
                  <div className="space-y-4">
                    {node.missingFields.map((field) => {
                      // 特殊处理文件输入
                      if (field.inputType === 'file') {
                        return (
                          <div key={field.key} className="space-y-1">
                            <Label className="text-xs font-medium">{field.label || field.key}</Label>
                            <div className="flex gap-2">
                              <Input
                                value={configValues[node.nodeId]?.[field.key] || ''}
                                onChange={(e) => {
                                  setConfigValues((prev) => ({
                                    ...prev,
                                    [node.nodeId]: {
                                      ...prev[node.nodeId],
                                      [field.key]: e.target.value
                                    }
                                  }));
                                }}
                                placeholder="请选择文件或输入文件路径"
                                className="flex-1 h-8 text-xs"
                                disabled={submitting}
                              />
                              <Button variant="outline" size="sm" className="h-8" onClick={() => handlePickFile(node.nodeId, field.key)} disabled={submitting}>
                                选择文件
                              </Button>
                            </div>
                          </div>
                        );
                      }

                      // 特殊处理文件夹输入
                      if (field.inputType === 'folder') {
                        return (
                          <div key={field.key} className="space-y-1">
                            <Label className="text-xs font-medium">{field.label || field.key}</Label>
                            {loadingFolders ? (
                              <div className="flex items-center py-2">
                                <TbLoader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                <span className="ml-2 text-xs text-muted-foreground">加载文件夹列表...</span>
                              </div>
                            ) : (
                              <Select
                                value={configValues[node.nodeId]?.[field.key] || ''}
                                onValueChange={(val) => {
                                  setConfigValues((prev) => ({
                                    ...prev,
                                    [node.nodeId]: {
                                      ...prev[node.nodeId],
                                      [field.key]: val
                                    }
                                  }));
                                }}
                                disabled={submitting}
                              >
                                <SelectTrigger className="w-full h-8 text-xs">
                                  <SelectValue placeholder="请选择文件夹" />
                                </SelectTrigger>
                                <SelectContent>
                                  {folders.length === 0 ? (
                                    <div className="py-2 text-center text-xs text-muted-foreground">暂无可用文件夹</div>
                                  ) : (
                                    folders.map((folder) => (
                                      <SelectItem key={folder.id} value={folder.id}>
                                        <div className="flex items-center gap-2">
                                          <TbFolder className="h-3 w-3" />
                                          <span>{folder.name}</span>
                                        </div>
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        );
                      }

                      return (
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
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}{' '}
        </div>

        <div className="flex justify-end gap-2">
          <Button onClick={handleConfirm} disabled={submitting}>
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
