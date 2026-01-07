import React, { useEffect, useMemo, useRef, useState } from 'react';
import { TbLoader, TbPlayerStop } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

// 内存中的任务状态，通过 IPC 事件同步

type Job = { id: string; total: number; done: number; status: string; error?: string };

type Props = {
  className?: string;
};

export default function EmbeddingJobsPanel({ className }: Props): JSX.Element {
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const unsub = useRef<() => void>();
  const unsub2 = useRef<() => void>();

  useEffect(() => {
    const onJob = (job: Job): void => {
      setJobs((prev) => ({ ...prev, [job.id]: job }));
    };
    const onProg = (p: { id: string; done: number; total: number }): void => {
      setJobs((prev) => {
        const old = prev[p.id] || ({ id: p.id, total: p.total, done: 0, status: 'running' } as Job);
        return { ...prev, [p.id]: { ...old, done: p.done, total: p.total } };
      });
    };
    unsub.current = window.YUA.vector.onEmbeddingJob(onJob);
    unsub2.current = window.YUA.vector.onEmbeddingProgress((data: any) => {
      if ((data as any).id) onProg(data as any);
    });
    return () => {
      unsub.current?.();
      unsub2.current?.();
    };
  }, []);

  const list = useMemo(() => Object.values(jobs).sort((a, b) => a.id.localeCompare(b.id)), [jobs]);

  const cancel = async (id: string): Promise<void> => {
    await window.YUA.vector['embedding:cancelJob']({ jobId: id });
  };

  const statusLabel: Record<string, string> = {
    running: '运行中',
    completed: '已完成',
    error: '错误',
    cancelled: '已取消'
  };

  return (
    <div className={cn('bg-card border border-border rounded-lg overflow-hidden', className)}>
      {list.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">暂无嵌入任务</div>
      ) : (
        <div className="divide-y divide-border">
          {list.map((job) => {
            const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
            const isRunning = job.status === 'running';
            const isError = job.status === 'error';
            return (
              <div key={job.id} className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-mono text-muted-foreground truncate max-w-[200px]">{job.id}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {pct}% ({job.done}/{job.total})
                    </span>
                    <span
                      className={cn('text-xs', {
                        'text-primary': isRunning,
                        'text-destructive': isError,
                        'text-muted-foreground': !isRunning && !isError
                      })}
                    >
                      {isRunning && <TbLoader className="inline h-3 w-3 mr-1 animate-spin" />}
                      {statusLabel[job.status] || job.status}
                    </span>
                  </div>
                </div>
                <Progress value={pct} className={cn('h-1.5', isError && '[&>[data-slot=progress-indicator]]:bg-destructive')} />
                {isRunning && (
                  <div className="mt-2">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => cancel(job.id)}>
                      <TbPlayerStop className="h-3.5 w-3.5 mr-1" />
                      取消
                    </Button>
                  </div>
                )}
                {job.error && <div className="mt-2 text-xs text-destructive">{job.error}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
