import { isSystemPresetPlugin, PluginDefinition } from '@packages/plugins/types';
import prettyBytes from 'pretty-bytes';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TbDownload, TbLoader2, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import type { InstalledResource } from './types';

interface PluginListItemProps {
  resource: PluginDefinition;
  installedResource?: InstalledResource;
  isInstalling: boolean;
  onInstall: (pluginId: string, resourceId: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove?: (id: string) => void;
}

// 获取当前平台对应的包大小
const getPackageSize = (resource: PluginDefinition): number | undefined => {
  const platform = window.chobits?.platform || 'win32';
  const arch = window.chobits?.arch || 'x64';

  // 优先匹配精确的平台和架构
  let match = resource.platforms.find((p) => p.platform === platform && p.arch === arch);
  if (!match) {
    match = resource.platforms.find((p) => p.platform === platform && p.arch === 'all');
  }
  if (!match) {
    match = resource.platforms.find((p) => p.platform === platform);
  }
  if (!match) {
    match = resource.platforms.find((p) => p.platform === 'all' && p.arch === 'all');
  }
  if (!match) {
    match = resource.platforms.find((p) => p.platform === 'all');
  }

  if (match?.sizeBytes) return match.sizeBytes;
  const filesSize = match?.files?.reduce((sum, file) => sum + (file.sizeBytes || 0), 0);
  return filesSize && filesSize > 0 ? filesSize : undefined;
};

// 轻量状态徽章组件
const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  const { t } = useTranslation('plugins');
  const map: Record<string, { labelKey: string; cls: string }> = {
    queued: { labelKey: 'item.status.queued', cls: 'bg-gray-200 text-gray-700' },
    downloading: { labelKey: 'item.status.downloading', cls: 'bg-blue-500/90 text-white' },
    extracting: { labelKey: 'item.status.extracting', cls: 'bg-purple-500/90 text-white' },
    verifying: { labelKey: 'item.status.verifying', cls: 'bg-amber-500/90 text-white' },
    installed: { labelKey: 'item.status.installed', cls: 'bg-green-500/90 text-white' },
    failed: { labelKey: 'item.status.failed', cls: 'bg-red-500/90 text-white' },
    cancelled: { labelKey: 'item.status.cancelled', cls: 'bg-zinc-400 text-white' },
    removed: { labelKey: 'item.status.removed', cls: 'bg-zinc-300 text-zinc-600' }
  };
  const info = status ? map[status] : undefined;
  if (!info) return <span className="text-[10px] px-1 py-0.5 rounded bg-muted text-muted-foreground">{t('item.status.unknown')}</span>;
  return <span className={'text-[10px] px-1.5 rounded-md ' + info.cls}>{t(info.labelKey)}</span>;
};

export const PluginListItem: React.FC<PluginListItemProps> = ({ resource, installedResource, isInstalling, onInstall, onCancel, onRetry, onRemove }) => {
  const { t } = useTranslation('plugins');
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const isSystemPreset = isSystemPresetPlugin(resource);
  const status = installedResource?.status as string | undefined;
  const percent = installedResource?.sizeBytes ? Math.round((((installedResource?.progressBytes as number) || 0) / ((installedResource?.sizeBytes as number) || 1)) * 100) : 0;
  const isInstalled = status === 'installed' || isSystemPreset;

  // 获取包大小
  const packageSize = getPackageSize(resource);
  const displaySize = installedResource?.sizeBytes || packageSize;
  const resourceLabel = resource.type === 'model' ? t('item.type.model') : t('item.type.plugin');

  // 分类/语言代码 → 本地化名称（未收录的代码回退原样显示）
  const getCategoryLabel = (category?: string): string => (category ? t(`category.${category}`, { defaultValue: category }) : '');
  const getLanguageLabel = (code: string): string => t(`language.${code}`, { defaultValue: code.toUpperCase() });

  const content = (
    <>
      <div className="flex flex-col gap-1 flex-1">
        <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
          <span className="text-[10px] rounded bg-muted px-1 py-0.5">{resource.type === 'engine' ? t('item.type.engine') : t('item.type.model')}</span>
          <span>{resource.displayName || resource.name}</span>
          <span className="text-[10px] rounded bg-muted px-1 py-0.5">v{resource.version}</span>
          {resource.category &&
            (Array.isArray(resource.category) ? (
              resource.category.map((cat) => (
                <span key={cat} className="text-[10px] rounded px-1.5 py-0.5 bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
                  {getCategoryLabel(cat)}
                </span>
              ))
            ) : (
              <span className="text-[10px] rounded px-1.5 py-0.5 bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">{getCategoryLabel(resource.category)}</span>
            ))}
          {displaySize !== undefined && typeof displaySize === 'number' && displaySize >= 0 && (
            <span className="text-[10px] rounded bg-muted px-1 py-0.5 text-muted-foreground">{prettyBytes(displaySize || 0)}</span>
          )}
          {status && <StatusBadge status={status} />}
        </div>
        {resource.description && <div className="text-xs text-muted-foreground">{resource.description}</div>}
        {resource.languages && resource.languages.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            <span className="text-[10px] text-muted-foreground">{t('item.supportedLanguages')}</span>
            {resource.languages.map((lang) => {
              const isMulti = lang === 'multi';
              return (
                <span
                  key={lang}
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    isMulti
                      ? 'bg-gradient-to-r from-purple-100 to-pink-100 text-purple-700 dark:from-purple-900/40 dark:to-pink-900/40 dark:text-purple-300 font-medium'
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                  }`}
                >
                  {getLanguageLabel(lang)}
                </span>
              );
            })}
          </div>
        )}
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
        {status === 'queued' && <div className="text-[10px] text-muted-foreground">{t('item.progress.queued')}</div>}
        {status === 'extracting' && <div className="text-[10px] text-muted-foreground">{t('item.progress.extracting')}</div>}
        {status === 'verifying' && <div className="text-[10px] text-muted-foreground">{t('item.progress.verifying')}</div>}
        {status === 'failed' && (
          <div className="text-[10px] text-red-500">
            {installedResource?.lastError ? t('item.progress.failedWithError', { error: installedResource.lastError }) : t('item.progress.failedRetryable')}
          </div>
        )}
      </div>
      <div className="ml-3 flex items-center gap-1">
        {['queued', 'downloading', 'extracting', 'verifying'].includes(status || '') && installedResource?.id && (
          <Button size="sm" variant={'outline'} onClick={() => onCancel(installedResource.id)}>
            {t('item.action.cancel')}
          </Button>
        )}
        {['failed', 'cancelled'].includes(status || '') && installedResource?.id && (
          <Button size="sm" variant={'outline'} onClick={() => onRetry(installedResource.id)}>
            {t('item.action.retry')}
          </Button>
        )}
        {isInstalled && installedResource?.id && onRemove && !isSystemPreset && (
          <Button size="icon" variant={'destructive'} onClick={() => setIsDeleteDialogOpen(true)}>
            <TbTrash />
          </Button>
        )}
        {!status && !isSystemPreset && (
          <Button size="sm" variant={'outline'} disabled={isInstalling} onClick={() => onInstall(resource.pluginId, resource.id)}>
            {isInstalling ? (
              <>
                <TbLoader2 className="animate-spin" /> {t('item.action.installing')}
              </>
            ) : (
              <>
                <TbDownload />
                {t('item.action.install')}
              </>
            )}
          </Button>
        )}
        {isSystemPreset && <span className="text-[10px] px-1.5 rounded-md bg-muted text-muted-foreground">{t('item.systemPreset')}</span>}
      </div>
    </>
  );

  return (
    <>
      <div className="px-4 py-3 flex items-center justify-between hover:bg-muted/20 transition-colors">{content}</div>
      {onRemove && installedResource?.id && (
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('item.delete.title', { type: resourceLabel })}</DialogTitle>
              <DialogDescription>{t('item.delete.description', { name: resource.displayName || resource.name })}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
                {t('item.action.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  onRemove(installedResource.id);
                  setIsDeleteDialogOpen(false);
                }}
              >
                {t('item.action.delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

export { StatusBadge };
