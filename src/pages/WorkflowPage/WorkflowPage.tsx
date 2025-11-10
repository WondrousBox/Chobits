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

const invoke = window.ipcRenderer.invoke;

const WorkflowPage: React.FC = () => {
  const [list, setList] = useState<WorkflowBrief[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let mounted = true;
    invoke('wf:listDefinitions')
      .then((defs: WorkflowBrief[]) => {
        if (mounted) setList(defs || []);
      })
      .finally(() => mounted && setLoading(false));
    return () => {
      mounted = false;
    };
  }, [refreshTick]);

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
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {loading && <div className="text-xs opacity-60">加载中...</div>}
        {!loading && filtered.length === 0 && <div className="text-xs opacity-60">暂无工作流或无匹配结果</div>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((wf) => (
            <div key={wf.id} className="group border border-border/60 rounded-lg p-3 bg-card hover:border-primary transition-colors cursor-pointer flex flex-col" onClick={() => openExisting(wf.id)}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="font-medium text-sm truncate" title={wf.name}>
                  {wf.name || '未命名'}
                </div>
                <div className="text-[10px] px-1 py-0.5 rounded bg-neutral-800/70 border border-neutral-700 opacity-70 group-hover:opacity-100">{wf.nodes?.length || 0} 节点</div>
              </div>
              <div className="text-xs text-neutral-400 line-clamp-2 min-h-[32px]">{wf.description || '—'}</div>
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
