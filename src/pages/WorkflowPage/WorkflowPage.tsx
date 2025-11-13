import React, { useEffect, useMemo, useState } from 'react';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
  const [list, setList] = useState<WorkflowBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [runsByWorkflow, setRunsByWorkflow] = useState<Record<string, RunBrief | undefined>>({});
  const [validationMap, setValidationMap] = useState<Record<string, { ok: boolean; errors?: string[]; missingPlugins?: { id: string; hint?: string }[] } | undefined>>({});
  const [showPresetDialog, setShowPresetDialog] = useState(false);
  const [presets, setPresets] = useState<WorkflowBrief[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('');
  const [presetIds, setPresetIds] = useState<Set<string>>(new Set());

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

  // listen to cross-window workflow events for optimistic updates
  useEffect(() => {
    const ch = new BroadcastChannel('wf-events');
    ch.onmessage = (e) => {
      const data = e.data || {};
      if (data.type === 'definition-upserted') {
        setList((prev) => {
          const idx = prev.findIndex((p) => p.id === data.def?.id || p.id === data.id);
          if (idx >= 0) {
            const next = prev.slice();
            next[idx] = { ...next[idx], ...(data.def || {}), updatedAt: new Date().toISOString() } as any;
            return next;
          }
          if (data.def) return [{ ...(data.def as any) }, ...prev];
          return prev;
        });
      } else if (data.type === 'run-started') {
        setRunsByWorkflow((prev) => ({ ...prev, [data.defId]: { workflowId: data.defId, status: 'queued', createdAt: Date.now() } }));
      }
    };
    return () => ch.close();
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
        setShowPresetDialog(true);
        return;
      }
    } catch (err) {
      console.error('加载预设工作流失败:', err);
    }
    // 如果没有预设，使用默认的空白预设
    await window.YUA.window['window:open']('workflowBuilder' as any, { mode: 'create', presetId: 'blank' }, { sameDisplayAsSender: true });
  };

  const handleCreateFromPreset = async (): Promise<void> => {
    if (selectedPresetId) {
      await window.YUA.window['window:open']('workflowBuilder' as any, { mode: 'create', presetId: selectedPresetId }, { sameDisplayAsSender: true });
    } else {
      // 如果没有选择，默认使用空白预设
      await window.YUA.window['window:open']('workflowBuilder' as any, { mode: 'create', presetId: 'blank' }, { sameDisplayAsSender: true });
    }
    setShowPresetDialog(false);
    setSelectedPresetId('');
  };

  const openExisting = async (id: string): Promise<void> => {
    await window.YUA.window['window:open']('workflowBuilder' as any, { id }, { sameDisplayAsSender: true });
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
        resourceId: pluginResource.id
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

  return (
    <div className="h-full w-full flex flex-col bg-background text-foreground">
      <DragAbleTitle
        title={
          <div className="flex items-center gap-2">
            <span>🧩</span>
            <span className="font-semibold">工作流</span>
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <Input placeholder="搜索名称/描述" className="h-8 w-48" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <Button size="sm" variant="outline" onClick={() => setRefreshTick((t) => t + 1)} disabled={loading}>
              刷新
            </Button>
            <Button size="sm" onClick={openNew}>
              新建工作流
            </Button>
          </div>
        }
      />
      <div className="flex-1 overflow-auto bg-background">
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
          <div className="w-full">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-muted/50 backdrop-blur-sm">
                <TableRow>
                  <TableHead className="w-[200px]">名称</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead className="w-20 text-center">节点数</TableHead>
                  <TableHead className="w-24 text-center">校验状态</TableHead>
                  <TableHead className="w-28 text-center">运行状态</TableHead>
                  <TableHead className="w-32">更新时间</TableHead>
                  <TableHead className="w-24 text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((wf) => {
                  const validationStatus = validationMap[wf.id];
                  const runStatus = runsByWorkflow[wf.id]?.status;
                  const isPreset = presetIds.has(wf.id);
                  return (
                    <TableRow key={wf.id} className="cursor-pointer" onClick={() => openExisting(wf.id)}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-sm">{wf.name || '未命名'}</div>
                          {isPreset && <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">预设</span>}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 font-mono">{wf.id}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-foreground/80 line-clamp-2 max-w-md">{wf.description || '—'}</div>
                      </TableCell>
                      <TableCell className="text-center">
                        <span className="text-sm">{wf.nodes?.length || 0}</span>
                      </TableCell>
                      <TableCell className="text-center">
                        {validationStatus === undefined ? (
                          <span className="text-xs text-muted-foreground">校验中</span>
                        ) : validationStatus.ok ? (
                          <span className="text-xs px-2 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">通过</span>
                        ) : (
                          <Popover>
                            <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
                              <button className="text-xs px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/20 transition-colors cursor-pointer">
                                点击修复
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
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {runStatus ? (
                          <span
                            className={`text-xs px-2 py-0.5 rounded border ${runStatus === 'completed'
                                ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20'
                                : runStatus === 'failed'
                                  ? 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20'
                                  : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
                              }`}
                          >
                            {runStatus === 'completed' ? '已完成' : runStatus === 'failed' ? '失败' : runStatus === 'running' ? '运行中' : runStatus === 'queued' ? '排队中' : runStatus}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">
                          {wf.updatedAt ? new Date(wf.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </div>
                      </TableCell>
                      <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <Button size="sm" variant="ghost" onClick={() => openExisting(wf.id)} disabled={isPreset} title={isPreset ? '预设工作流不允许修改' : ''}>
                            {isPreset ? '查看' : '编辑'}
                          </Button>
                          {!isPreset && (
                            <Button size="sm" variant="ghost" onClick={(e) => deleteOne(e, wf.id)}>
                              删除
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      <Dialog open={showPresetDialog} onOpenChange={setShowPresetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>选择预设模板</DialogTitle>
            <DialogDescription>选择一个预设工作流模板来创建新工作流</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={selectedPresetId} onValueChange={setSelectedPresetId}>
              <SelectTrigger>
                <SelectValue placeholder="选择预设模板" />
              </SelectTrigger>
              <SelectContent>
                {presets.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.name} {preset.description ? `- ${preset.description}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
