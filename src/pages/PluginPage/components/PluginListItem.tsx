import React from 'react';
import { TbDownload, TbLoader2 } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import type { InstalledResource, PluginDefinition } from './types';

interface PluginListItemProps {
  resource: PluginDefinition;
  installedResource?: InstalledResource;
  isInstalling: boolean;
  onInstall: (pluginId: string, resourceId: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
}

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

export const PluginListItem: React.FC<PluginListItemProps> = ({ resource, installedResource, isInstalling, onInstall, onCancel, onRetry }) => {
  const status = installedResource?.status as string | undefined;
  const percent = installedResource?.sizeBytes ? Math.round((((installedResource?.progressBytes as number) || 0) / ((installedResource?.sizeBytes as number) || 1)) * 100) : 0;

  const content = (
    <>
      <div className="flex flex-col gap-1 flex-1">
        <div className="text-sm font-medium flex items-center gap-2">
          <span>{resource.displayName || resource.name}</span>
          <span className="text-[10px] rounded bg-muted px-1 py-0.5">v{resource.version}</span>
          {status && <StatusBadge status={status} />}
        </div>
        {resource.description && <div className="text-xs text-muted-foreground">{resource.description}</div>}
        {status === 'downloading' && installedResource?.sizeBytes && (
          <div className="w-full bg-muted h-2 rounded overflow-hidden mt-1">
            <div className="h-full bg-blue-500 transition-all" style={{ width: percent + '%' }}></div>
          </div>
        )}
        {status === 'downloading' && (
          <div className="text-[10px] text-muted-foreground flex justify-between">
            <span>
              {percent}%{' '}
              {installedResource?.progressBytes && installedResource?.sizeBytes
                ? `(${((installedResource.progressBytes as number) / 1024 / 1024).toFixed(2)}MB / ${((installedResource.sizeBytes as number) / 1024 / 1024).toFixed(2)}MB)`
                : ''}
            </span>
            <span>
              {installedResource?.speedBps ? `${((installedResource.speedBps as number) / 1024).toFixed(1)} KB/s` : ''}{' '}
              {installedResource?.etaMs ? `ETA ${((installedResource.etaMs as number) / 1000).toFixed(1)}s` : ''}
            </span>
          </div>
        )}
        {status === 'extracting' && <div className="text-[10px] text-muted-foreground">解压中…</div>}
        {status === 'verifying' && <div className="text-[10px] text-muted-foreground">校验中…</div>}
        {status === 'failed' && <div className="text-[10px] text-red-500">安装失败，可重试</div>}
      </div>
      <div className="ml-3 flex items-center gap-1">
        {status === 'downloading' && installedResource?.id && <Button onClick={() => onCancel(installedResource.id)}>取消</Button>}
        {['failed', 'cancelled'].includes(status || '') && installedResource?.id && (
          <Button size="sm" variant={'outline'} onClick={() => onRetry(installedResource.id)}>
            重试
          </Button>
        )}
        {!status && (
          <Button size="sm" variant={'outline'} disabled={isInstalling} onClick={() => onInstall(resource.pluginId, resource.id)}>
            {isInstalling ? (
              <>
                <TbLoader2 className="animate-spin" /> 安装中...
              </>
            ) : (
              <>
                <TbDownload />
                安装
              </>
            )}
          </Button>
        )}
      </div>
    </>
  );

  return <div className="border p-3 rounded flex items-center justify-between bg-background/60">{content}</div>;
};

export { StatusBadge };
