import React, { useEffect, useMemo, useState } from 'react';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
  const [validationMap, setValidationMap] = useState<Record<string, boolean | undefined>>({});

  useEffect(() => {
    let mounted = true;
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
      .catch(() => { });

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
            return [d.id, !!res?.ok] as const;
          } catch {
            return [d.id, false] as const;
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
    await window.YUA.window['window:open']('workflowBuilder' as any, { mode: 'create' });
  };

  const openExisting = async (id: string): Promise<void> => {
    await window.YUA.window['window:open']('workflowBuilder' as any, { id });
  };

  const deleteOne = async (e: React.MouseEvent, id: string): Promise<void> => {
    e.stopPropagation();
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
      <div className="flex-1 overflow-auto p-3 space-y-3 bg-muted">
        {loading && <div className="text-xs opacity-60">加载中...</div>}
        {!loading && filtered.length === 0 && <div className="text-xs opacity-60">暂无工作流或无匹配结果</div>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((wf) => (
            <div
              key={wf.id}
              className="group border border-border/60 rounded-lg p-3 bg-card hover:border-primary transition-colors cursor-pointer flex flex-col relative"
              onClick={() => openExisting(wf.id)}
            >
              <Button variant={'destructive'} size={'sm'} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100" onClick={(e) => deleteOne(e, wf.id)}>
                删除
              </Button>
              <div className="flex items-start justify-between gap-2 mb-1 pr-16">
                <div className="font-medium text-sm truncate" title={wf.name}>
                  {wf.name || '未命名'}
                </div>
                <div className="text-[10px] px-1 py-0.5 rounded bg-neutral-800/70 border border-neutral-700 opacity-70 group-hover:opacity-100">{wf.nodes?.length || 0} 节点</div>
              </div>
              <div className="text-xs text-neutral-400 line-clamp-2 min-h-[32px]">{wf.description || '—'}</div>
              {/* badges */}
              <div className="mt-2 flex items-center gap-2 text-[10px]">
                <span
                  className={`px-1.5 py-0.5 rounded border ${validationMap[wf.id] === undefined ? 'border-neutral-700 text-neutral-400' : validationMap[wf.id] ? 'border-green-700 text-green-400' : 'border-yellow-700 text-yellow-400'}`}
                >
                  {validationMap[wf.id] === undefined ? '校验中' : validationMap[wf.id] ? '校验通过' : '需修复'}
                </span>
                {runsByWorkflow[wf.id] &&
                  (() => {
                    const status = runsByWorkflow[wf.id]?.status;
                    const cls = status === 'completed' ? 'border-green-700 text-green-400' : status === 'failed' ? 'border-red-700 text-red-400' : 'border-blue-700 text-blue-400';
                    return <span className={`px-1.5 py-0.5 rounded border ${cls}`}>最近运行：{status}</span>;
                  })()}
              </div>
              <div className="mt-auto pt-2 flex items-center justify-between text-[10px] text-neutral-500">
                <span>ID: {wf.id}</span>
                {wf.updatedAt && <span>{new Date(wf.updatedAt).toLocaleDateString()}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WorkflowPage;
