import React, { useEffect, useState } from 'react';
import { TbLoader2, TbPlug } from 'react-icons/tb';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface PluginPageProps {
  hideTitleBar?: boolean;
}

type PluginDefinition = {
  id: string;
  pluginId: string;
  type: 'engine' | 'model';
  name: string;
  displayName: string;
  description?: string;
  version: string;
  binaryName?: string;
  archiveType?: 'zip' | 'tar.gz' | 'tar' | 'none';
  platforms: {
    platform: string;
    arch: string;
    sourceUrl: string;
    sizeBytes?: number;
    checksum?: string;
    algo?: string;
  }[];
};

type InstalledResource = {
  id: string;
  pluginId: string;
  type: 'engine' | 'model';
  name: string;
  displayName?: string;
  version?: string;
  sizeBytes?: number;
  progressBytes?: number;
  status?: string;
  speedBps?: number;
  etaMs?: number;
  lastError?: string;
};

const PluginPage: React.FC<PluginPageProps> = ({ hideTitleBar }: PluginPageProps) => {
  const [supported, setSupported] = useState<PluginDefinition[]>([]);
  const [installed, setInstalled] = useState<InstalledResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState<'available' | 'installed'>('available');
  const [installing, setInstalling] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const sup = await window.YUA.pluginResource['plugin-resource:listSupported']();
        const inst = await window.YUA.pluginResource['plugin-resource:list']();
        if (!mounted) return;
        setSupported(sup);
        setInstalled(inst);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    const listener = (_: any, info: any) => {
      setInstalled((prev) => {
        const idx = prev.findIndex((m) => m.id === info.id);
        if (idx < 0) {
          // 新安装的资源
          if (info.status === 'downloading' || info.status === 'installed') {
            return [...prev, info];
          }
          return prev;
        }
        const next = [...prev];
        next[idx] = {
          ...next[idx],
          status: info.status,
          progressBytes: info.doneBytes,
          sizeBytes: info.totalBytes || next[idx].sizeBytes,
          speedBps: info.speedBps,
          etaMs: info.etaMs
        };
        return next;
      });
    };
    window.ipcRenderer.on('plugin-resource:progress', listener);
    return () => {
      mounted = false;
      window.ipcRenderer.off('plugin-resource:progress', listener);
    };
  }, []);

  const install = async (pluginId: string, resourceId: string) => {
    setInstalling(resourceId);
    try {
      const res = await window.YUA.pluginResource['plugin-resource:install']({ pluginId, resourceId });
      if (res.ok && res.data) {
        const data: InstalledResource = res.data;
        setInstalled((prev) => [...prev.filter((m) => m.id !== data.id), data]);
      }
    } finally {
      setInstalling(null);
    }
  };

  const cancel = async (id: string) => {
    const res = await window.YUA.pluginResource['plugin-resource:cancel']({ id });
    if (res.ok) {
      setInstalled((prev) => prev.map((m) => (m.id === id ? { ...m, status: 'cancelled' } : m)));
    }
  };

  const retry = async (id: string) => {
    const resource = installed.find((r) => r.id === id);
    if (!resource) return;
    const res = await window.YUA.pluginResource['plugin-resource:install']({
      pluginId: resource.pluginId,
      resourceId: resource.name
    });
    if (res.ok) {
      setInstalled((prev) => prev.map((m) => (m.id === id ? { ...m, status: 'queued', progressBytes: 0 } : m)));
    }
  };

  if (loading) return <div className="p-4 text-xs text-muted-foreground">加载中...</div>;

  return (
    <>
      {!hideTitleBar ? (
        <DragAbleTitle
          title={
            <div className="flex items-center gap-2">
              <TbPlug size={20} />
              插件管理
            </div>
          }
          actions={
            <Tabs value={tabValue} onValueChange={(v) => setTabValue(v as 'available' | 'installed')} className="no-drag">
              <TabsList>
                <TabsTrigger value="available">可用插件</TabsTrigger>
                <TabsTrigger value="installed">已安装</TabsTrigger>
              </TabsList>
            </Tabs>
          }
        />
      ) : (
        <div className="flex items-center gap-2 px-2">
          <div className="flex-1">
            <Tabs value={tabValue} onValueChange={(v) => setTabValue(v as 'available' | 'installed')} className="no-drag">
              <TabsList>
                <TabsTrigger value="available">可用插件</TabsTrigger>
                <TabsTrigger value="installed">已安装</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      )}

      {tabValue === 'installed' && (
        <>
          {installed.filter((m) => m.status === 'installed').length === 0 && <div className="text-xs text-muted-foreground border rounded px-2 text-center py-20">暂无已安装插件。</div>}
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
                    </div>
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
              const busy = installing === s.id;
              const rec = installed.find((m) => m.pluginId === s.pluginId && m.name === s.name && m.status !== 'removed');
              const status = rec?.status as string | undefined;
              const percent = rec?.sizeBytes ? Math.round((((rec?.progressBytes as number) || 0) / ((rec?.sizeBytes as number) || 1)) * 100) : 0;
              return (
                <li key={s.id} className="border p-3 rounded flex items-center justify-between bg-background/60">
                  <div className="flex flex-col gap-1 flex-1">
                    <div className="text-sm font-medium flex items-center gap-2">
                      <span>{s.displayName || s.name}</span>
                      <span className="text-[10px] rounded bg-muted px-1 py-0.5">v{s.version}</span>
                      {status && <StatusBadge status={status} />}
                    </div>
                    {s.description && <div className="text-xs text-muted-foreground">{s.description}</div>}
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
                    {status === 'extracting' && <div className="text-[10px] text-muted-foreground">解压中…</div>}
                    {status === 'verifying' && <div className="text-[10px] text-muted-foreground">校验中…</div>}
                    {status === 'failed' && <div className="text-[10px] text-red-500">安装失败，可重试</div>}
                  </div>
                  <div className="ml-3 flex items-center gap-1">
                    {status === 'installed' && <Button disabled>已安装</Button>}
                    {status === 'downloading' && rec?.id && <Button onClick={() => cancel(rec.id)}>取消</Button>}
                    {['failed', 'cancelled'].includes(status || '') && rec?.id && (
                      <Button variant={'outline'} onClick={() => retry(rec.id)}>
                        重试
                      </Button>
                    )}
                    {!status && (
                      <Button disabled={busy} onClick={() => install(s.pluginId, s.id)}>
                        {busy ? <TbLoader2 className="animate-spin" /> : '安装'}
                      </Button>
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

// 轻量状态徽章组件
const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  const map: Record<string, { label: string; cls: string }> = {
    queued: { label: '排队', cls: 'bg-gray-200 text-gray-700' },
    downloading: { label: '下载中', cls: 'bg-blue-500/90 text-white' },
    extracting: { label: '解压中', cls: 'bg-purple-500/90 text-white' },
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

export default PluginPage;
