import React, { useEffect, useMemo, useState } from 'react';
import { TbBolt, TbCheck, TbChevronDown, TbDots, TbEdit, TbEye, TbSparkles, TbTopologyRing3, TbTrash } from 'react-icons/tb';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import PageToolbar from '@/components/common/PageToolbar';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { BroadcastChannelManager, CHANNEL_NAMES, type WorkflowEventMessage } from '@/utils/broadcastChannels';

import AIChatSidebar from './components/AIChatSidebar';

interface WorkflowBrief {
  id: string;
  name: string;
  description?: string;
  nodes?: any[];
  edges?: any[];
  updatedAt?: string;
  createdAt?: string;
}

type ExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
type RunBrief = { workflowId: string; status: ExecutionStatus; createdAt: number };

const invoke = window.ipcRenderer.invoke;

const WorkflowPage: React.FC = () => {
  const navigate = useNavigate();
  const [list, setList] = useState<WorkflowBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [runsByWorkflow, setRunsByWorkflow] = useState<Record<string, RunBrief | undefined>>({});
  const [validationMap, setValidationMap] = useState<
    Record<
      string,
      | {
        ok: boolean;
        errors?: string[];
        missingPlugins?: { id: string; hint?: string }[];
        missingModels?: { pluginId: string; modelName: string; resourceId?: string; displayName?: string }[];
      }
      | undefined
    >
  >({});
  const [showPresetDialog, setShowPresetDialog] = useState(false);
  const [presets, setPresets] = useState<WorkflowBrief[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [presetIds, setPresetIds] = useState<Set<string>>(new Set());
  const [presetPopoverOpen, setPresetPopoverOpen] = useState(false);
  // AI 侧边栏状态
  const [aiChatOpen, setAiChatOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    // 加载预设工作流 ID 列表
    invoke('wf:listPresets')
      .then((presetList: WorkflowBrief[]) => {
        if (mounted) {
          setPresetIds(new Set(presetList.map((p) => p.id)));
        }
      })
      .catch(() => {
        //
      });

    invoke('wf:listDefinitions')
      .then((defs: WorkflowBrief[]) => {
        if (mounted) setList(defs || []);
      })
      .finally(() => mounted && setLoading(false));

    // also fetch recent runs to surface last-run status
    invoke('wf:listRuns')
      .then((runs: any[]) => {
        if (!mounted || !Array.isArray(runs)) return;
        const map: Record<string, RunBrief> = {};
        for (const r of runs as any[]) {
          const cur = map[r.workflowId];
          if (!cur || r.createdAt > cur.createdAt) map[r.workflowId] = { workflowId: r.workflowId, status: r.status, createdAt: r.createdAt };
        }
        setRunsByWorkflow(map);
      })
      .catch(() => {
        //
      });

    return () => {
      mounted = false;
    };
  }, [refreshTick]);

  // validate each workflow definition in background to show badges
  useEffect(() => {
    let canceled = false;
    const run = async (): Promise<void> => {
      const entries = list.slice(0, 50); // cap to 50 to avoid overload
      const results = await Promise.all(
        entries.map(async (d) => {
          try {
            const res = await invoke('wf:validate', { def: d });
            return [d.id, res] as const;
          } catch {
            return [d.id, { ok: false, errors: ['校验失败'] }] as const;
          }
        })
      );
      if (!canceled) {
        setValidationMap((prev) => ({ ...prev, ...Object.fromEntries(results) }));
      }
    };
    if (list.length) run();
    return () => {
      canceled = true;
    };
  }, [list]);

  // 监听跨窗口工作流事件，用于乐观更新
  useEffect(() => {
    const channel = BroadcastChannelManager.acquire(CHANNEL_NAMES.WF_EVENTS);

    const handleMessage = (event: MessageEvent<WorkflowEventMessage>): void => {
      const { type } = event.data;
      if (type === 'definition-upserted') {
        const { def, id } = event.data;
        setList((prev) => {
          const idx = prev.findIndex((p) => p.id === (def as WorkflowBrief)?.id || p.id === id);
          if (idx >= 0) {
            const next = prev.slice();
            next[idx] = { ...next[idx], ...(def || {}), updatedAt: new Date().toISOString() } as WorkflowBrief;
            return next;
          }
          if (def) return [{ ...(def as WorkflowBrief) }, ...prev];
          return prev;
        });
      } else if (type === 'run-started') {
        const { defId } = event.data;
        setRunsByWorkflow((prev) => ({ ...prev, [defId]: { workflowId: defId, status: 'queued', createdAt: Date.now() } }));
      }
    };

    channel.addEventListener('message', handleMessage);
    return () => {
      channel.removeEventListener('message', handleMessage);
      BroadcastChannelManager.release(CHANNEL_NAMES.WF_EVENTS);
    };
  }, []);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return list;
    return list.filter((w) => w.name.toLowerCase().includes(f) || (w.description || '').toLowerCase().includes(f) || w.id.includes(f));
  }, [list, filter]);

  const openNew = async (): Promise<void> => {
    // 加载预设工作流列表
    try {
      const presetList = await invoke('wf:listPresets');
      if (presetList && presetList.length > 0) {
        setPresets(presetList);
        // 默认选中空白模板
        setSelectedPresetId('blank');
        setPresetPopoverOpen(false);
        setShowPresetDialog(true);
        return;
      }
    } catch (err) {
      console.error('加载预设工作流失败:', err);
    }
    // 如果没有预设，使用默认的空白预设，采用路由方式跳转并通过查询参数传递
    navigate('/workflow?mode=create&presetId=blank');
  };

  const handleCreateFromPreset = async (): Promise<void> => {
    const targetPresetId = selectedPresetId || 'blank';
    // 通过路由跳转，并将 mode 和 presetId 作为查询参数传递
    navigate(`/workflow?mode=create&presetId=${encodeURIComponent(targetPresetId)}`);
    setShowPresetDialog(false);
    setSelectedPresetId('');
    setPresetPopoverOpen(false);
  };

  const openExisting = async (id: string): Promise<void> => {
    // 使用路由参数方式打开已有工作流
    navigate(`/workflow/${encodeURIComponent(id)}`);
  };

  const deleteOne = async (e: React.MouseEvent, id: string): Promise<void> => {
    e.stopPropagation();
    // 检查是否为预设工作流
    if (presetIds.has(id)) {
      alert('预设工作流不允许删除');
      return;
    }
    if (!confirm('确认删除该工作流吗？此操作不可撤销。')) return;
    // optimistic removal
    setList((prev) => prev.filter((w) => w.id !== id));
    try {
      await invoke('wf:deleteDefinition', { id });
    } catch {
      // rollback on failure
      setRefreshTick((t) => t + 1);
    }
  };

  const installPlugin = async (e: React.MouseEvent, pluginId: string): Promise<void> => {
    e.stopPropagation();
    try {
      // 查找插件资源定义
      const supportedPlugins = await window.YUA.pluginResource['plugin-resource:listSupported']();
      // 工作流插件 ID 格式是 plugin:xxx，查找对应的引擎资源（type === 'engine'）
      const pluginResource = supportedPlugins.find((p: any) => p.pluginId === pluginId && p.type === 'engine');
      if (!pluginResource) {
        alert(`未找到插件资源: ${pluginId}\n请前往插件管理页面安装`);
        return;
      }
      // 安装插件
      const result = await window.YUA.pluginResource['plugin-resource:install']({
        pluginId: pluginResource.pluginId,
        resourceId: pluginResource.id,
        deleteAfterInstall: true
      });
      if (result.ok) {
        // 安装成功后，重新校验工作流
        setRefreshTick((t) => t + 1);
      } else {
        alert(`安装失败: ${result.error || '未知错误'}`);
      }
    } catch (err: any) {
      alert(`安装插件失败: ${err?.message || String(err)}`);
    }
  };

  const installModel = async (e: React.MouseEvent, pluginId: string, modelName: string, resourceId?: string): Promise<void> => {
    e.stopPropagation();
    try {
      // 查找模型资源定义
      const supportedResources = await window.YUA.pluginResource['plugin-resource:listSupported']();
      // 优先使用 resourceId 查找，否则根据 modelName 查找
      const modelResource = resourceId
        ? supportedResources.find((p: any) => p.id === resourceId && p.pluginId === pluginId && p.type === 'model')
        : supportedResources.find((p: any) => p.pluginId === pluginId && p.type === 'model' && p.name === modelName);

      if (!modelResource) {
        alert(`未找到模型资源: ${modelName}\n请前往插件管理页面安装`);
        return;
      }
      // 安装模型
      const result = await window.YUA.pluginResource['plugin-resource:install']({
        pluginId: modelResource.pluginId,
        resourceId: modelResource.id,
        deleteAfterInstall: true
      });
      if (result.ok) {
        // 安装成功后，重新校验工作流
        setRefreshTick((t) => t + 1);
      } else {
        alert(`安装失败: ${result.error || '未知错误'}`);
      }
    } catch (err: any) {
      alert(`安装模型失败: ${err?.message || String(err)}`);
    }
  };

  return (
    <div className="h-full w-full flex flex-col bg-background text-foreground">
      {/* 顶部标题栏 + 分割线 */}
      <div className="border-b">
        <DragAbleTitle
          fixed
          title={<span />}
          actions={
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className={`p-1.5 rounded transition-colors ${aiChatOpen ? 'bg-muted text-primary' : 'hover:bg-muted'}`}
                    onClick={() => setAiChatOpen((prev) => !prev)}
                  >
                    <TbSparkles className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>AI 助手</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="p-1.5 rounded hover:bg-muted transition-colors" onClick={() => toast.info('自动化功能即将上线')}>
                    <TbBolt className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>自动化</TooltipContent>
              </Tooltip>
            </div>
          }
        />
      </div>

      {/* 主内容区域 + AI 侧边栏 */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={aiChatOpen ? 70 : 100} minSize={40}>
          <div className="h-full flex flex-col">
            {/* 工具栏 */}
            <PageToolbar
              icon={<TbTopologyRing3 className="w-4 h-4" />}
              title="工作流"
              searchPlaceholder="搜索名称/描述"
              searchValue={filter}
              onSearchChange={setFilter}
              actions={
                <>
                  <Button size="sm" variant="outline" onClick={() => setRefreshTick((t) => t + 1)} disabled={loading}>
                    刷新
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => navigate('/workflow-history')}>
                    执行记录
                  </Button>
                  <Button size="sm" onClick={openNew}>
                    新建工作流
                  </Button>
                </>
              }
            />

            {/* 卡片列表内容 */}
            <div className="flex-1 overflow-auto bg-background p-3">
              {loading && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-sm text-muted-foreground">加载中...</div>
                </div>
              )}
              {!loading && filtered.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-sm text-muted-foreground">暂无工作流或无匹配结果</div>
                </div>
              )}
              {!loading && filtered.length > 0 && (
                <div className="space-y-2">
                  {filtered.map((wf) => {
                    const validationStatus = validationMap[wf.id];
                    const runStatus = runsByWorkflow[wf.id]?.status;
                    const isPreset = presetIds.has(wf.id);
                    return (
                      <div
                        key={wf.id}
                        className="group relative flex items-center gap-3 px-3 py-2.5 rounded-lg border border-transparent hover:border-border hover:bg-muted/50 cursor-pointer transition-all"
                        onClick={() => openExisting(wf.id)}
                      >
                        {/* 左侧：图标 */}
                        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <TbTopologyRing3 className="w-5 h-5 text-primary" />
                        </div>

                        {/* 中间：名称和描述 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{wf.name || '未命名'}</span>
                            {isPreset && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                                预设
                              </span>
                            )}
                            {/* 校验状态 */}
                            {validationStatus === undefined ? (
                              <span className="text-[10px] text-muted-foreground shrink-0">校验中...</span>
                            ) : validationStatus.ok ? (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400 shrink-0">
                                通过
                              </span>
                            ) : (
                              <Popover>
                                <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                                  <button className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/20 transition-colors shrink-0">
                                    需修复
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-80" onClick={(e) => e.stopPropagation()}>
                                  <div className="space-y-3">
                                    <div className="font-medium text-sm">校验失败原因</div>
                                    {validationStatus.errors && validationStatus.errors.length > 0 && (
                                      <div className="space-y-1">
                                        <div className="text-xs font-medium text-muted-foreground">错误信息：</div>
                                        {validationStatus.errors.map((error, idx) => (
                                          <div key={idx} className="text-xs text-destructive">
                                            • {error}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {validationStatus.missingPlugins && validationStatus.missingPlugins.length > 0 && (
                                      <div className="space-y-2">
                                        <div className="text-xs font-medium text-muted-foreground">缺少插件：</div>
                                        {validationStatus.missingPlugins.map((plugin, idx) => (
                                          <div key={idx} className="flex items-center justify-between gap-2">
                                            <div className="flex-1">
                                              <div className="text-xs font-medium">{plugin.id}</div>
                                              {plugin.hint && <div className="text-xs text-muted-foreground">{plugin.hint}</div>}
                                            </div>
                                            <Button size="sm" variant="outline" onClick={(e) => installPlugin(e, plugin.id)}>
                                              安装
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {validationStatus.missingModels && validationStatus.missingModels.length > 0 && (
                                      <div className="space-y-2">
                                        <div className="text-xs font-medium text-muted-foreground">缺少模型：</div>
                                        {validationStatus.missingModels.map((model, idx) => (
                                          <div key={idx} className="flex items-center justify-between gap-2">
                                            <div className="flex-1">
                                              <div className="text-xs font-medium">{model.displayName || model.modelName}</div>
                                              <div className="text-xs text-muted-foreground">{model.pluginId}</div>
                                            </div>
                                            <Button size="sm" variant="outline" onClick={(e) => installModel(e, model.pluginId, model.modelName, model.resourceId)}>
                                              安装
                                            </Button>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </PopoverContent>
                              </Popover>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate mt-0.5">
                            {wf.description || '暂无描述'}
                          </div>
                        </div>

                        {/* 右侧：元信息 */}
                        <div className="flex items-center gap-3 shrink-0">
                          {/* 节点数 */}
                          <div className="text-xs text-muted-foreground">
                            <span className="tabular-nums">{wf.nodes?.length || 0}</span> 节点
                          </div>

                          {/* 运行状态 */}
                          {runStatus && (
                            <span
                              className={cn(
                                'text-[10px] px-1.5 py-0.5 rounded',
                                runStatus === 'completed' && 'bg-green-500/10 text-green-600 dark:text-green-400',
                                runStatus === 'failed' && 'bg-red-500/10 text-red-600 dark:text-red-400',
                                (runStatus === 'running' || runStatus === 'queued') && 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                              )}
                            >
                              {runStatus === 'completed' ? '已完成' : runStatus === 'failed' ? '失败' : runStatus === 'running' ? '运行中' : '排队中'}
                            </span>
                          )}

                          {/* 操作按钮 - 悬停时显示 */}
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <TbDots className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => openExisting(wf.id)}>
                                  {isPreset ? <TbEye className="w-4 h-4 mr-2" /> : <TbEdit className="w-4 h-4 mr-2" />}
                                  {isPreset ? '查看' : '编辑'}
                                </DropdownMenuItem>
                                {!isPreset && (
                                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={(e) => deleteOne(e as any, wf.id)}>
                                    <TbTrash className="w-4 h-4 mr-2" />
                                    删除
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </ResizablePanel>

        {/* AI 侧边栏 */}
        {aiChatOpen && (
          <>
            <ResizableHandle className="hover:bg-primary" withHandle />
            <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
              <AIChatSidebar onClose={() => setAiChatOpen(false)} />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      <Dialog open={showPresetDialog} onOpenChange={setShowPresetDialog}>
        <DialogContent className="w-96">
          <DialogHeader>
            <DialogTitle>选择预设模板</DialogTitle>
            <DialogDescription></DialogDescription>
          </DialogHeader>
          <div>
            <Popover modal open={presetPopoverOpen} onOpenChange={setPresetPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-between">
                  {selectedPresetId ? presets.find((p) => p.id === selectedPresetId)?.name || selectedPresetId : '选择预设模板'}
                  <TbChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent side="right" className="w-[300px] p-0" align="start">
                <Command className="rounded-lg border shadow-md">
                  <CommandInput placeholder="搜索预设模板..." />
                  <CommandList>
                    <CommandEmpty>未找到匹配的预设模板</CommandEmpty>
                    <CommandGroup>
                      {presets.map((preset) => {
                        const isSelected = selectedPresetId === preset.id;
                        return (
                          <CommandItem
                            key={preset.id}
                            value={`${preset.name} ${preset.description || ''} ${preset.id}`}
                            onSelect={() => {
                              setSelectedPresetId(preset.id);
                              setPresetPopoverOpen(false);
                            }}
                            className={cn('flex flex-col items-start gap-1 py-2', isSelected && 'bg-accent text-accent-foreground')}
                          >
                            <div className="flex items-center gap-2 w-full">
                              <span className="font-medium flex-1">{preset.name}</span>
                              {isSelected && <TbCheck className="h-4 w-4 shrink-0" />}
                            </div>
                            {preset.description && <span className="text-xs text-muted-foreground">{preset.description}</span>}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPresetDialog(false)}>
              取消
            </Button>
            <Button onClick={handleCreateFromPreset}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WorkflowPage;
