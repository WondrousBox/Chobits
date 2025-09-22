import DragAbleHeader from '@/components/common/DragableHeader';
import React, { useEffect, useState } from 'react';

const ModelManager: React.FC = () => {
  const [config, setConfig] = useState<any>(null);
  const [installed, setInstalled] = useState<any[]>([]);
  const [supported, setSupported] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickBusy, setPickBusy] = useState(false);
  const [savingConcurrency, setSavingConcurrency] = useState(false);
  const [concurrencyInput, setConcurrencyInput] = useState<number>(2);
  const [hint, setHint] = useState<string>('');
  const [installing, setInstalling] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await window.YUA.model['model:getConfig']();
        const sup = await window.YUA.model['model:listSupported']();
        const inst = await window.YUA.model['model:listInstalled']();
        if (!mounted) return;
        setConfig(cfg);
        if (cfg?.concurrency) setConcurrencyInput(cfg.concurrency);
        setSupported(sup);
        setInstalled(inst);
      } finally { if (mounted) setLoading(false); }
    })();
    const listener = (_: any, info: any) => {
      setInstalled(prev => {
        const idx = prev.findIndex(m => m.id === info.id);
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], status: info.status, progressBytes: info.doneBytes, sizeBytes: info.totalBytes || next[idx].sizeBytes, speedBps: info.speedBps, etaMs: info.etaMs };
        return next;
      });
    };
    window.ipcRenderer.on('model:progress', listener);
    return () => { mounted = false; };
  }, []);

  const pickDir = async () => {
    setPickBusy(true);
    try {
      const r = await window.YUA.model['model:pickDir']();
      if (!r.canceled && r.path) {
        const res = await window.YUA.model['model:setConfig']({ rootDir: r.path });
        if (res.ok) setConfig(res.data);
      }
    } finally { setPickBusy(false); }
  };

  const saveConcurrency = async () => {
    setSavingConcurrency(true);
    setHint('');
    try {
      if (concurrencyInput < 1 || concurrencyInput > 5) { setHint('并发范围 1~5'); return; }
      const res = await window.YUA.model['model:setConfig']({ concurrency: concurrencyInput });
      if (res.ok) setConfig(res.data);
    } finally { setSavingConcurrency(false); }
  };

  const install = async (name: string, version: string) => {
    setInstalling(name + version);
    try {
      const res = await window.YUA.model['model:install']({ name, version });
      if (res.ok && res.data) {
        setInstalled(prev => [...prev.filter(m => m.id !== res.data.id), res.data]);
      }
    } finally { setInstalling(null); }
  };

  const retry = async (id: string) => {
    const res = await window.YUA.model['model:retry']({ id });
    if (res.ok) {
      setInstalled(prev => prev.map(m => m.id === id ? { ...m, status: 'queued', progressBytes: 0 } : m));
    }
  };

  const cancel = async (id: string) => {
    const res = await window.YUA.model['model:cancel']({ id });
    if (res.ok) {
      setInstalled(prev => prev.map(m => m.id === id ? { ...m, status: 'cancelled' } : m));
    }
  };

  if (loading) return <div className='p-4 text-xs text-muted-foreground'>加载中...</div>;

  return (
    <div className='p-4 space-y-6'>
      <DragAbleHeader title="模型配置" />
      <section className='space-y-3'>
        <div className='flex flex-wrap items-center gap-2 text-sm'>
          <span className='font-medium'>目录:</span>
          <span className='px-2 py-0.5 rounded bg-muted text-xs'>{config?.rootDir || '未配置'}</span>
          <button className='px-2 py-1 border rounded text-xs' disabled={pickBusy} onClick={pickDir}>选择目录</button>
        </div>
        <div className='flex flex-wrap items-center gap-2 text-sm'>
          <span className='font-medium'>下载并发:</span>
          <input type='number' className='w-16 border rounded px-1 py-0.5 text-xs' value={concurrencyInput}
            onChange={e => setConcurrencyInput(Number(e.target.value))} />
          <button className='px-2 py-1 border rounded text-xs' disabled={savingConcurrency} onClick={saveConcurrency}>保存</button>
          <span className='text-[10px] text-muted-foreground'>范围 1~5，过高会占用带宽</span>
        </div>
        {hint && <div className='text-xs text-red-500'>{hint}</div>}
      </section>
      <section className='space-y-2'>
        <h2 className='text-lg font-semibold'>已安装 / 进行中</h2>
        {installed.length === 0 && <div className='text-xs text-muted-foreground border rounded px-2 py-4 text-center'>暂无模型，先在下方“可安装”列表选择一个进行安装。</div>}
        <ul className='space-y-1'>
          {installed.map(m => {
            const percent = m.sizeBytes ? Math.round(((m.progressBytes || 0) / (m.sizeBytes || 1)) * 100) : 0;
            return (
              <li key={m.id} className='text-sm flex flex-col gap-1 border px-3 py-2 rounded bg-background/60'>
                <div className='flex items-center justify-between gap-4'>
                  <div className='flex items-center gap-2 overflow-hidden'>
                    <span className='font-medium truncate'>{m.displayName || m.name}</span>
                    {m.version && <span className='text-[10px] rounded bg-muted px-1 py-0.5'>v{m.version}</span>}
                    <StatusBadge status={m.status} />
                  </div>
                  <div className='flex gap-1'>
                    {m.status === 'downloading' && <button className='text-xs px-2 py-0.5 border rounded' onClick={() => cancel(m.id)}>取消</button>}
                    {['failed', 'cancelled'].includes(m.status) && <button className='text-xs px-2 py-0.5 border rounded' onClick={() => retry(m.id)}>重试</button>}
                  </div>
                </div>
                {m.status === 'downloading' && m.sizeBytes && (
                  <div className='w-full bg-muted h-2 rounded overflow-hidden'>
                    <div className='h-full bg-blue-500 transition-all' style={{ width: percent + '%' }}></div>
                  </div>
                )}
                {m.status === 'downloading' && (
                  <div className='text-[10px] text-muted-foreground flex justify-between'>
                    <span>{percent}% {m.progressBytes && m.sizeBytes ? `(${(m.progressBytes / 1024 / 1024).toFixed(2)}MB / ${(m.sizeBytes / 1024 / 1024).toFixed(2)}MB)` : ''}</span>
                    <span>{m.speedBps ? `${(m.speedBps / 1024).toFixed(1)} KB/s` : ''} {m.etaMs ? `ETA ${(m.etaMs / 1000).toFixed(1)}s` : ''}</span>
                  </div>
                )}
                {m.status === 'verifying' && (
                  <div className='text-[10px] text-muted-foreground'>校验中…</div>
                )}
                {m.status === 'failed' && (
                  <div className='text-[10px] text-red-500'>安装失败，可重试</div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h2 className='text-lg font-semibold mb-2'>可安装</h2>
        <ul className='space-y-2'>
          {supported.map(s => {
            const busy = installing === (s.name + s.version);
            return (
              <li key={s.name + s.version} className='border p-3 rounded flex items-center justify-between bg-background/60'>
                <div className='flex flex-col gap-1'>
                  <div className='text-sm font-medium flex items-center gap-2'>
                    <span>{s.displayName || s.name}</span>
                    <span className='text-[10px] rounded bg-muted px-1 py-0.5'>v{s.version}</span>
                  </div>
                  <div className='text-[10px] text-muted-foreground'>~{s.sizeBytes ? (s.sizeBytes / 1024 / 1024).toFixed(2) + 'MB' : '?'} · {s.algo?.toUpperCase()}</div>
                </div>
                <button className='px-3 py-1 border rounded text-xs disabled:opacity-40' disabled={!config?.rootDir || busy} onClick={() => install(s.name, s.version)}>
                  {busy ? '安装中...' : '安装'}
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};

export default ModelManager;

// 轻量状态徽章组件
const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  const map: Record<string, { label: string; cls: string }> = {
    queued: { label: '排队', cls: 'bg-gray-200 text-gray-700' },
    downloading: { label: '下载中', cls: 'bg-blue-500/90 text-white' },
    verifying: { label: '校验中', cls: 'bg-amber-500/90 text-white' },
    installed: { label: '已安装', cls: 'bg-green-500/90 text-white' },
    failed: { label: '失败', cls: 'bg-red-500/90 text-white' },
    cancelled: { label: '已取消', cls: 'bg-zinc-400 text-white' },
    removed: { label: '已移除', cls: 'bg-zinc-300 text-zinc-600' },
  };
  const info = status ? map[status] : undefined;
  if (!info) return <span className='text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground'>未知</span>;
  return <span className={'text-[10px] px-1.5 py-0.5 rounded ' + info.cls}>{info.label}</span>;
};
