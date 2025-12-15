import React, { useEffect, useMemo, useRef, useState } from 'react';

// Minimal in-memory job store synced from IPC events

type Job = { id: string; total: number; done: number; status: string; error?: string };

type Props = {
  style?: React.CSSProperties;
};

export default function EmbeddingJobsPanel(props: Props): JSX.Element {
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
      // vector.ts 主进程发送的 progress 中不含 id，这里用 job 事件同步获取，或扩展主进程带上 jobId
      // 为简化，这里尝试读取 data.id；若不存在，则不更新。
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

  return (
    <div style={{ padding: 12, border: '1px solid #eee', borderRadius: 8, ...props.style }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: 14 }}>Embedding Jobs</strong>
      </div>
      {list.length === 0 ? (
        <div style={{ color: '#888' }}>No jobs</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {list.map((job) => {
            const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
            return (
              <div key={job.id} style={{ border: '1px solid #ddd', padding: 8, borderRadius: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ fontFamily: 'monospace' }}>{job.id}</div>
                  <div>
                    <span style={{ marginRight: 12 }}>
                      {pct}% ({job.done}/{job.total})
                    </span>
                    <span style={{ color: job.status === 'error' ? '#b00' : '#555' }}>{job.status}</span>
                  </div>
                </div>
                <div style={{ height: 6, background: '#f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: '#4f46e5' }} />
                </div>
                <div style={{ marginTop: 6, display: 'flex', gap: 8 }}>
                  <button onClick={() => cancel(job.id)} disabled={job.status !== 'running'} style={{ padding: '4px 8px' }}>
                    Cancel
                  </button>
                </div>
                {job.error && <div style={{ color: '#b00', marginTop: 6 }}>Error: {job.error}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
