import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import React, { useEffect, useRef, useState } from 'react';
import { TbBox, TbSettings } from 'react-icons/tb';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import SelectModelFolder from './components/SelectModelFolder';

interface ModelPageProps {
  hideTitleBar?: boolean;
}

const ModelPage: React.FC<ModelPageProps> = ({ hideTitleBar }: ModelPageProps) => {
  const [config, setConfig] = useState<any>(null); // 仍保留整体 config 用于其它用途
  const [rootDir, setRootDir] = useState<string | undefined>(undefined);
  const [installed, setInstalled] = useState<any[]>([]);
  const [supported, setSupported] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState<'installed' | 'available'>('available');
  // 目录选择逻辑已移入子组件
  // 已移除并发设置逻辑
  const [installing, setInstalling] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  // 记录是否已自动弹出（避免用户关闭后再次强制弹出导致困扰）
  const autoOpenedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cfg = await window.YUA.model['model:getConfig']();
        const sup = await window.YUA.model['model:listSupported']();
        const inst = await window.YUA.model['model:listInstalled']();
        if (!mounted) return;
        setConfig(cfg);
        if (cfg?.rootDir) setRootDir(cfg.rootDir);
        setSupported(sup);
        setInstalled(inst);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    const listener = (_: any, info: any) => {
      setInstalled((prev) => {
        const idx = prev.findIndex((m) => m.id === info.id);
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], status: info.status, progressBytes: info.doneBytes, sizeBytes: info.totalBytes || next[idx].sizeBytes, speedBps: info.speedBps, etaMs: info.etaMs };
        return next;
      });
    };
    window.ipcRenderer.on('model:progress', listener);
    return () => {
      mounted = false;
    };
  }, []);

  // 首次进入且未配置模型目录时自动弹出设置窗口
  useEffect(() => {
    if (!loading && !rootDir && !autoOpenedRef.current) {
      autoOpenedRef.current = true;
      setShowSettings(true);
    }
  }, [loading, rootDir]);

  // 由子组件处理 pickDir

  // 并发保存逻辑已移除

  const install = async (name: string, version: string) => {
    setInstalling(name + version);
    try {
      const res = await window.YUA.model['model:install']({ name, version });
      if (res.ok && res.data) {
        const data: any = res.data;
        setInstalled((prev) => [...prev.filter((m) => m.id !== data.id), data]);
      }
    } finally {
      setInstalling(null);
    }
  };

  const retry = async (id: string) => {
    const res = await window.YUA.model['model:retry']({ id });
    if (res.ok) {
      setInstalled((prev) => prev.map((m) => (m.id === id ? { ...m, status: 'queued', progressBytes: 0 } : m)));
    }
  };

  const cancel = async (id: string) => {
    const res = await window.YUA.model['model:cancel']({ id });
    if (res.ok) {
      setInstalled((prev) => prev.map((m) => (m.id === id ? { ...m, status: 'cancelled' } : m)));
    }
  };

  if (loading) return <div className="p-4 text-xs text-muted-foreground">加载中...</div>;

  return (
    <>
      {!hideTitleBar ? (
        <DragAbleTitle
          title={
            <div className="flex items-center gap-2">
              <TbBox size={20} />
              模型管理
            </div>
          }
          actions={
            <>
              <Tabs value={tabValue} onValueChange={(v) => setTabValue(v as 'installed' | 'available')} className="no-drag">
                <TabsList>
                  <TabsTrigger value="available">所有模型</TabsTrigger>
                  <TabsTrigger value="installed">已安装</TabsTrigger>
                </TabsList>
              </Tabs>
              <Dialog open={showSettings} onOpenChange={setShowSettings}>
                <DialogTrigger asChild>
                  <Button size={'icon'} className="w-8 h-8" variant={'outline'} title="打开模型设置">
                    <TbSettings />
                  </Button>
                </DialogTrigger>
                <DialogContent hideClose className="w-80">
                  <DialogHeader>
                    <DialogTitle></DialogTitle>
                    <DialogDescription></DialogDescription>
                  </DialogHeader>
                  <SelectModelFolder
                    onConfigured={(cfg) => {
                      setConfig(cfg);
                      setRootDir(cfg.rootDir);
                      setShowSettings(false);
                    }}
                  />
                </DialogContent>
              </Dialog>
            </>
          }
        />
      ) : (
        <div className="flex items-center gap-2 px-2">
          <div className="flex items-center gap-2">
            <TbBox size={20} />
            模型管理
          </div>
          <>
            <Tabs value={tabValue} onValueChange={(v) => setTabValue(v as 'installed' | 'available')} className="no-drag">
              <TabsList>
                <TabsTrigger value="available">所有模型</TabsTrigger>
                <TabsTrigger value="installed">已安装</TabsTrigger>
              </TabsList>
            </Tabs>
            <Dialog open={showSettings} onOpenChange={setShowSettings}>
              <DialogTrigger asChild>
                <Button size={'icon'} className="w-8 h-8" variant={'outline'} title="打开模型设置">
                  <TbSettings />
                </Button>
              </DialogTrigger>
              <DialogContent hideClose className="w-80">
                <DialogHeader>
                  <DialogTitle></DialogTitle>
                  <DialogDescription></DialogDescription>
                </DialogHeader>
                <SelectModelFolder
                  onConfigured={(cfg) => {
                    setConfig(cfg);
                    setRootDir(cfg.rootDir);
                    setShowSettings(false);
                  }}
                />
              </DialogContent>
            </Dialog>
          </>
        </div>
      )}

      {tabValue === 'installed' && (
        <>
          {installed.filter((m) => m.status === 'installed').length === 0 && (
            <div className="text-xs text-muted-foreground border rounded px-2 text-center py-20">暂无已安装模型，先在 “所有模型” 中选择一个进行安装。</div>
          )}
          <ul className="space-y-1">
            {installed
              .filter((m) => m.status === 'installed')
              .map((m) => {
                const percent = m.sizeBytes ? Math.round(((m.progressBytes || 0) / (m.sizeBytes || 1)) * 100) : 0;
                return (
                  <li key={m.id} className="text-sm flex flex-col gap-1 border px-3 py-2 rounded bg-background/60">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="font-medium truncate">{m.displayName || m.name}</span>
                        {m.version && <span className="text-[10px] rounded bg-muted px-1 py-0.5">v{m.version}</span>}
                        <StatusBadge status={m.status} />
                      </div>
                      <div className="flex gap-1">
                        {m.status === 'downloading' && (
                          <button className="text-xs px-2 py-0.5 border rounded" onClick={() => cancel(m.id)}>
                            取消
                          </button>
                        )}
                        {['failed', 'cancelled'].includes(m.status) && (
                          <button className="text-xs px-2 py-0.5 border rounded" onClick={() => retry(m.id)}>
                            重试
                          </button>
                        )}
                      </div>
                    </div>
                    {m.status === 'downloading' && m.sizeBytes && (
                      <div className="w-full bg-muted h-2 rounded overflow-hidden">
                        <div className="h-full bg-blue-500 transition-all" style={{ width: percent + '%' }}></div>
                      </div>
                    )}
                    {m.status === 'downloading' && (
                      <div className="text-[10px] text-muted-foreground flex justify-between">
                        <span>
                          {percent}% {m.progressBytes && m.sizeBytes ? `(${(m.progressBytes / 1024 / 1024).toFixed(2)}MB / ${(m.sizeBytes / 1024 / 1024).toFixed(2)}MB)` : ''}
                        </span>
                        <span>
                          {m.speedBps ? `${(m.speedBps / 1024).toFixed(1)} KB/s` : ''} {m.etaMs ? `ETA ${(m.etaMs / 1000).toFixed(1)}s` : ''}
                        </span>
                      </div>
                    )}
                    {m.status === 'verifying' && <div className="text-[10px] text-muted-foreground">校验中…</div>}
                    {m.status === 'failed' && <div className="text-[10px] text-red-500">安装失败，可重试</div>}
                  </li>
                );
              })}
          </ul>
        </>
      )}
      {tabValue === 'available' && (
        <>
          <ul className="space-y-2">
            {supported.map((s) => {
              const busy = installing === s.name + s.version;
              const rec = installed.find((m) => m.name === s.name && m.version === s.version && m.status !== 'removed');
              const status = rec?.status as string | undefined;
              const percent = rec?.sizeBytes ? Math.round((((rec?.progressBytes as number) || 0) / ((rec?.sizeBytes as number) || 1)) * 100) : 0;
              return (
                <li key={s.name + s.version} className="border p-3 rounded flex items-center justify-between bg-background/60">
                  <div className="flex flex-col gap-1 flex-1">
                    <div className="text-sm font-medium flex items-center gap-2">
                      <span>{s.displayName || s.name}</span>
                      <span className="text-[10px] rounded bg-muted px-1 py-0.5">v{s.version}</span>
                      {status && <StatusBadge status={status} />}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      ~{s.sizeBytes ? (s.sizeBytes / 1024 / 1024).toFixed(2) + 'MB' : '?'} · {s.algo?.toUpperCase()}
                    </div>
                    {status === 'downloading' && rec?.sizeBytes && (
                      <div className="w-full bg-muted h-2 rounded overflow-hidden mt-1">
                        <div className="h-full bg-blue-500 transition-all" style={{ width: percent + '%' }}></div>
                      </div>
                    )}
                    {status === 'downloading' && (
                      <div className="text-[10px] text-muted-foreground flex justify-between">
                        <span>
                          {percent}%{' '}
                          {rec?.progressBytes && rec?.sizeBytes ? `(${((rec.progressBytes as number) / 1024 / 1024).toFixed(2)}MB / ${((rec.sizeBytes as number) / 1024 / 1024).toFixed(2)}MB)` : ''}
                        </span>
                        <span>
                          {rec?.speedBps ? `${((rec.speedBps as number) / 1024).toFixed(1)} KB/s` : ''} {rec?.etaMs ? `ETA ${((rec.etaMs as number) / 1000).toFixed(1)}s` : ''}
                        </span>
                      </div>
                    )}
                    {status === 'verifying' && <div className="text-[10px] text-muted-foreground">校验中…</div>}
                    {status === 'failed' && <div className="text-[10px] text-red-500">安装失败，可重试</div>}
                  </div>
                  <div className="ml-3 flex items-center gap-1">
                    {status === 'installed' && (
                      <button className="px-3 py-1 border rounded text-xs disabled:opacity-40" disabled>
                        已安装
                      </button>
                    )}
                    {status === 'downloading' && rec?.id && (
                      <button className="px-3 py-1 border rounded text-xs" onClick={() => cancel(rec.id)}>
                        取消
                      </button>
                    )}
                    {['failed', 'cancelled'].includes(status || '') && rec?.id && (
                      <button className="px-3 py-1 border rounded text-xs" onClick={() => retry(rec.id)}>
                        重试
                      </button>
                    )}
                    {!status && (
                      <button className="px-3 py-1 border rounded text-xs disabled:opacity-40" disabled={!rootDir || busy} onClick={() => install(s.name, s.version)}>
                        {busy ? '安装中...' : '安装'}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
};

export default ModelPage;

// 轻量状态徽章组件
const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  const map: Record<string, { label: string; cls: string }> = {
    queued: { label: '排队', cls: 'bg-gray-200 text-gray-700' },
    downloading: { label: '下载中', cls: 'bg-blue-500/90 text-white' },
    verifying: { label: '校验中', cls: 'bg-amber-500/90 text-white' },
    installed: { label: '已安装', cls: 'bg-green-500/90 text-white' },
    failed: { label: '失败', cls: 'bg-red-500/90 text-white' },
    cancelled: { label: '已取消', cls: 'bg-zinc-400 text-white' },
    removed: { label: '已移除', cls: 'bg-zinc-300 text-zinc-600' }
  };
  const info = status ? map[status] : undefined;
  if (!info) return <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground">未知</span>;
  return <span className={'text-[10px] px-1.5 py-0.5 rounded ' + info.cls}>{info.label}</span>;
};
