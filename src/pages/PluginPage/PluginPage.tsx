import React, { useEffect, useState } from 'react';
import { TbBox, TbChevronDown, TbChevronRight, TbLoader2, TbPlug, TbWifi, TbWifiOff } from 'react-icons/tb';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface PluginPageProps {
  hideTitleBar?: boolean;
}

type ModelDefinition = {
  id: string;
  name: string;
  displayName: string;
  description?: string;
  version: string;
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
  // 模型作为引擎的子资源（仅当 type === 'engine' 时存在）
  models?: ModelDefinition[];
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

type NetworkCheckResult = {
  name: string;
  url: string;
  success: boolean;
  error?: string;
};

const PluginPage: React.FC<PluginPageProps> = ({ hideTitleBar }: PluginPageProps) => {
  const [supported, setSupported] = useState<PluginDefinition[]>([]);
  const [installed, setInstalled] = useState<InstalledResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState<'available' | 'installed'>('available');
  const [installing, setInstalling] = useState<string | null>(null);
  const [expandedPlugins, setExpandedPlugins] = useState<Set<string>>(new Set());
  const [showNetworkDialog, setShowNetworkDialog] = useState(false);
  const [networkChecking, setNetworkChecking] = useState(false);
  const [networkResults, setNetworkResults] = useState<NetworkCheckResult[]>([]);

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

    const listener = (_: any, info: any): void => {
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

  const install = async (pluginId: string, resourceId: string): Promise<void> => {
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

  const cancel = async (id: string): Promise<void> => {
    const res = await window.YUA.pluginResource['plugin-resource:cancel']({ id });
    if (res.ok) {
      setInstalled((prev) => prev.map((m) => (m.id === id ? { ...m, status: 'cancelled' } : m)));
    }
  };

  const retry = async (id: string): Promise<void> => {
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

  // 按插件分组资源
  const resourcesByPlugin = supported.reduce(
    (acc, resource) => {
      if (!acc[resource.pluginId]) {
        acc[resource.pluginId] = { engines: [], models: [] };
      }
      if (resource.type === 'engine') {
        acc[resource.pluginId].engines.push(resource);
      } else if (resource.type === 'model') {
        acc[resource.pluginId].models.push(resource);
      }
      return acc;
    },
    {} as Record<string, { engines: PluginDefinition[]; models: PluginDefinition[] }>
  );

  const togglePluginExpanded = (pluginId: string): void => {
    setExpandedPlugins((prev) => {
      const next = new Set(prev);
      if (next.has(pluginId)) {
        next.delete(pluginId);
      } else {
        next.add(pluginId);
      }
      return next;
    });
  };

  const checkNetwork = async (): Promise<void> => {
    setShowNetworkDialog(true);
    setNetworkChecking(true);
    setNetworkResults([]);
    try {
      const res = await window.YUA.pluginResource['plugin-resource:checkNetwork']();
      if (res.ok && res.results) {
        setNetworkResults(res.results);
      }
    } catch (error) {
      console.error('Network check failed:', error);
      setNetworkResults([
        { name: 'Hugging Face', url: 'https://huggingface.co', success: false, error: '检测失败' },
        { name: 'GitHub', url: 'https://github.com', success: false, error: '检测失败' }
      ]);
    } finally {
      setNetworkChecking(false);
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
            <div className="flex items-center gap-2 no-drag">
              <Button size="sm" variant="outline" onClick={checkNetwork} className="w-8 h-8" title="检测网络连通性">
                <TbWifi size={16} />
              </Button>
              <Tabs value={tabValue} onValueChange={(v) => setTabValue(v as 'available' | 'installed')}>
                <TabsList>
                  <TabsTrigger value="available">可用插件</TabsTrigger>
                  <TabsTrigger value="installed">已安装</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
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
          <Button size="sm" variant="outline" onClick={checkNetwork} className="w-8 h-8" title="检测网络连通性">
            <TbWifi size={16} />
          </Button>
        </div>
      )}

      <Dialog open={showNetworkDialog} onOpenChange={setShowNetworkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>网络连通性检测</DialogTitle>
            <DialogDescription>检测是否能访问插件和模型下载所需的网站</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {networkChecking ? (
              <div className="flex items-center justify-center gap-2 py-8">
                <TbLoader2 className="animate-spin" size={20} />
                <span className="text-sm text-muted-foreground">正在检测...</span>
              </div>
            ) : (
              networkResults.map((result) => (
                <div key={result.url} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    {result.success ? <TbWifi className="text-green-500" size={20} /> : <TbWifiOff className="text-red-500" size={20} />}
                    <div>
                      <div className="text-sm font-medium">{result.name}</div>
                      <div className="text-xs text-muted-foreground">{result.url}</div>
                    </div>
                  </div>
                  <div className="text-sm">{result.success ? <span className="text-green-500">可访问</span> : <span className="text-red-500">{result.error || '无法访问'}</span>}</div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {tabValue === 'installed' && (
        <>
          {installed.filter((m) => m.status === 'installed').length === 0 && <div className="text-xs text-muted-foreground border rounded px-2 text-center py-20">暂无已安装插件。</div>}
          <ul className="space-y-1">
            {installed
              .filter((m) => m.status === 'installed')
              .map((m) => {
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
          {Object.keys(resourcesByPlugin).length === 0 && <div className="text-xs text-muted-foreground border rounded px-2 text-center py-20">暂无可用插件。</div>}
          <div className="space-y-4">
            {Object.entries(resourcesByPlugin).map(([pluginId, { engines, models }]) => {
              const pluginName = engines[0]?.pluginId.replace('plugin:', '') || models[0]?.pluginId.replace('plugin:', '') || pluginId.replace('plugin:', '');
              const isExpanded = expandedPlugins.has(pluginId);
              const hasModels = models.length > 0;
              const hasEngines = engines.length > 0;

              return (
                <div key={pluginId} className="space-y-2">
                  {/* 引擎列表 */}
                  {hasEngines &&
                    engines.map((s) => {
                      const busy = installing === s.id;
                      const rec = installed.find((m) => m.pluginId === s.pluginId && m.name === s.name && m.status !== 'removed');
                      const status = rec?.status as string | undefined;
                      const percent = rec?.sizeBytes ? Math.round((((rec?.progressBytes as number) || 0) / ((rec?.sizeBytes as number) || 1)) * 100) : 0;
                      return (
                        <div key={s.id} className="border p-3 rounded flex items-center justify-between bg-background/60">
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
                                  {rec?.progressBytes && rec?.sizeBytes
                                    ? `(${((rec.progressBytes as number) / 1024 / 1024).toFixed(2)}MB / ${((rec.sizeBytes as number) / 1024 / 1024).toFixed(2)}MB)`
                                    : ''}
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
                            {hasModels && (
                              <Button size="sm" variant="outline" className="w-8 h-8" onClick={() => togglePluginExpanded(pluginId)} title="展开模型列表">
                                {isExpanded ? <TbChevronDown /> : <TbChevronRight />}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}

                  {/* 模型列表（可展开） */}
                  {hasModels && (
                    <div className={hasEngines ? 'ml-4' : ''}>
                      <button
                        onClick={() => togglePluginExpanded(pluginId)}
                        className="flex items-center gap-2 text-sm font-medium text-foreground mb-2 px-2 hover:text-foreground/80 transition-colors"
                      >
                        {isExpanded ? <TbChevronDown className="w-4 h-4" /> : <TbChevronRight className="w-4 h-4" />}
                        <TbBox className="w-4 h-4" />
                        <span>
                          {pluginName} 模型列表 ({models.length})
                        </span>
                      </button>
                      {isExpanded && (
                        <ul className="space-y-2 ml-6">
                          {models.map((s) => {
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
                                        {rec?.progressBytes && rec?.sizeBytes
                                          ? `(${((rec.progressBytes as number) / 1024 / 1024).toFixed(2)}MB / ${((rec.sizeBytes as number) / 1024 / 1024).toFixed(2)}MB)`
                                          : ''}
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
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
