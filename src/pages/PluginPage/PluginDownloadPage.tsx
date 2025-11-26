import React, { useEffect, useState } from 'react';
import { TbAlertCircle, TbBox, TbCheck, TbClock, TbDownload, TbPlug, TbX } from 'react-icons/tb';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';

interface PluginDownloadProgress {
  id: string;
  pluginId: string;
  type: 'engine' | 'model';
  name: string;
  displayName?: string;
  version?: string;
  status: 'queued' | 'downloading' | 'extracting' | 'verifying' | 'installed' | 'failed' | 'cancelled';
  doneBytes: number;
  totalBytes?: number;
  speedBps?: number;
  etaMs?: number;
  percentage?: number;
  error?: string;
}

const PluginDownloadPage: React.FC = () => {
  const [downloads, setDownloads] = useState<Map<string, PluginDownloadProgress>>(new Map());

  useEffect(() => {
    // 加载已有的下载任务（包括进行中和已完成的）
    (async () => {
      try {
        const allResources = await window.YUA.pluginResource['plugin-resource:list']();
        const initialDownloads = new Map<string, PluginDownloadProgress>();
        allResources.forEach((resource: any) => {
          if (resource.status && ['queued', 'downloading', 'extracting', 'verifying', 'installed', 'failed', 'cancelled'].includes(resource.status)) {
            initialDownloads.set(resource.id, {
              id: resource.id,
              pluginId: resource.pluginId,
              type: resource.type,
              name: resource.name,
              displayName: resource.displayName,
              version: resource.version,
              status: resource.status,
              doneBytes: resource.progressBytes || resource.doneBytes || 0,
              totalBytes: resource.sizeBytes || resource.totalBytes,
              speedBps: resource.speedBps,
              etaMs: resource.etaMs,
              error: resource.lastError || resource.error
            });
          }
        });
        setDownloads(initialDownloads);
      } catch (error) {
        console.error('Failed to load existing downloads:', error);
      }
    })();

    const listener = (_: any, info: PluginDownloadProgress): void => {
      if (!info || !info.id) return;

      setDownloads((prev) => {
        const next = new Map(prev);
        const existing = next.get(info.id);
        next.set(info.id, {
          ...info,
          doneBytes: info.doneBytes !== undefined ? info.doneBytes : existing?.doneBytes || 0,
          totalBytes: info.totalBytes !== undefined ? info.totalBytes : existing?.totalBytes,
          speedBps: info.speedBps !== undefined ? info.speedBps : existing?.speedBps,
          etaMs: info.etaMs !== undefined ? info.etaMs : existing?.etaMs,
          percentage: info.percentage !== undefined ? info.percentage : existing?.percentage,
          error: info.error !== undefined ? info.error : existing?.error
        });
        return next;
      });
    };

    window.ipcRenderer.on('plugin-resource:progress', listener);
    return () => {
      window.ipcRenderer.off('plugin-resource:progress', listener);
    };
  }, []);

  const handleCancel = async (id: string): Promise<void> => {
    const res = await window.YUA.pluginResource['plugin-resource:cancel']({ id });
    if (res.ok) {
      setDownloads((prev) => {
        const next = new Map(prev);
        const item = next.get(id);
        if (item) {
          next.set(id, { ...item, status: 'cancelled' });
        }
        return next;
      });
    }
  };

  const getStatusIcon = (status: string): React.ReactNode => {
    switch (status) {
      case 'queued':
        return <TbClock className="w-4 h-4 text-yellow-500" />;
      case 'downloading':
        return <TbDownload className="w-4 h-4 text-blue-500 animate-pulse" />;
      case 'extracting':
        return <TbBox className="w-4 h-4 text-purple-500 animate-pulse" />;
      case 'verifying':
        return <TbCheck className="w-4 h-4 text-orange-500 animate-pulse" />;
      case 'installed':
        return <TbCheck className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <TbAlertCircle className="w-4 h-4 text-red-500" />;
      case 'cancelled':
        return <TbX className="w-4 h-4 text-gray-500" />;
      default:
        return <TbDownload className="w-4 h-4 text-blue-500" />;
    }
  };

  const getStatusText = (status: string): string => {
    switch (status) {
      case 'queued':
        return '等待中';
      case 'downloading':
        return '下载中';
      case 'extracting':
        return '解压中';
      case 'verifying':
        return '校验中';
      case 'installed':
        return '已安装';
      case 'failed':
        return '安装失败';
      case 'cancelled':
        return '已取消';
      default:
        return '未知状态';
    }
  };

  const formatBytes = (bytes?: number): string => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatSpeed = (speedBps?: number): string => {
    if (!speedBps) return '';
    return `${formatBytes(speedBps)}/s`;
  };

  const formatEta = (etaMs?: number): string => {
    if (!etaMs) return '';
    const seconds = Math.floor(etaMs / 1000);
    if (seconds < 60) return `${seconds}秒`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}分${remainingSeconds}秒`;
  };

  const getProgressPercent = (item: PluginDownloadProgress): number => {
    if (item.percentage !== undefined) return item.percentage;
    if (!item.totalBytes || item.totalBytes === 0) return 0;
    return Math.min(100, Math.max(0, (item.doneBytes / item.totalBytes) * 100));
  };

  const downloadList = Array.from(downloads.values());
  const activeDownloads = downloadList.filter((d) => ['queued', 'downloading', 'extracting', 'verifying'].includes(d.status));
  const completedDownloads = downloadList.filter((d) => d.status === 'installed');
  const failedDownloads = downloadList.filter((d) => d.status === 'failed');

  return (
    <div className="w-full h-full flex flex-col bg-background">
      <DragAbleTitle
        title={
          <div className="flex items-center gap-2">
            <TbPlug size={20} />
            插件下载
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-4">
        {downloadList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <TbPlug className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-sm">暂无下载任务</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* 进行中的下载 */}
            {activeDownloads.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2 text-foreground">进行中 ({activeDownloads.length})</h3>
                <div className="space-y-2">
                  {activeDownloads.map((item) => {
                    const percent = getProgressPercent(item);
                    return (
                      <div key={item.id} className="border rounded-lg p-3 bg-card">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {getStatusIcon(item.status)}
                              <span className="text-sm font-medium truncate">{item.displayName || item.name}</span>
                              {item.type === 'engine' && <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">引擎</span>}
                              {item.type === 'model' && <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">模型</span>}
                            </div>
                            {item.pluginId && (
                              <div className="text-xs text-muted-foreground">
                                {item.pluginId.replace('plugin:', '')} {item.version && `v${item.version}`}
                              </div>
                            )}
                          </div>
                          <Button size="icon" variant="ghost" onClick={() => handleCancel(item.id)} className="w-8 h-8 flex-shrink-0" title="取消下载">
                            <TbX className="w-4 h-4" />
                          </Button>
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{getStatusText(item.status)}</span>
                            <span>{percent.toFixed(1)}%</span>
                          </div>
                          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 rounded-full transition-all duration-300 ease-out" style={{ width: `${percent}%` }} />
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>
                              {formatBytes(item.doneBytes)} / {formatBytes(item.totalBytes)}
                            </span>
                            <div className="flex items-center gap-3">
                              {item.speedBps && (
                                <span className="flex items-center gap-1">
                                  <TbDownload className="w-3 h-3" />
                                  {formatSpeed(item.speedBps)}
                                </span>
                              )}
                              {item.etaMs && (
                                <span className="flex items-center gap-1">
                                  <TbClock className="w-3 h-3" />
                                  剩余 {formatEta(item.etaMs)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 已完成的下载 */}
            {completedDownloads.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2 text-foreground">已完成 ({completedDownloads.length})</h3>
                <div className="space-y-2">
                  {completedDownloads.map((item) => (
                    <div key={item.id} className="border rounded-lg p-3 bg-card">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {getStatusIcon(item.status)}
                          <span className="text-sm font-medium truncate">{item.displayName || item.name}</span>
                          {item.type === 'engine' && <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">引擎</span>}
                          {item.type === 'model' && <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">模型</span>}
                        </div>
                        <span className="text-xs text-green-600">{getStatusText(item.status)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 失败的下载 */}
            {failedDownloads.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2 text-foreground">失败 ({failedDownloads.length})</h3>
                <div className="space-y-2">
                  {failedDownloads.map((item) => (
                    <div key={item.id} className="border rounded-lg p-3 bg-card border-red-200">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {getStatusIcon(item.status)}
                          <span className="text-sm font-medium truncate">{item.displayName || item.name}</span>
                          {item.type === 'engine' && <span className="text-xs px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded">引擎</span>}
                          {item.type === 'model' && <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">模型</span>}
                        </div>
                        <span className="text-xs text-red-600">{getStatusText(item.status)}</span>
                      </div>
                      {item.error && <div className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded mt-2">{item.error}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default PluginDownloadPage;
