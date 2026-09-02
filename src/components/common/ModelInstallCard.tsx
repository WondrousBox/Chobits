import React from 'react';
import { TbDownload, TbLoader2 } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ModelInstallState } from '@/hooks/usePluginModelInstall';

export interface ModelInstallItem {
  /** 模型资源 ID（用于区分多个安装项） */
  id: string;
  name: string;
  /** 模型压缩包大小（用于安装前提示用户） */
  sizeBytes?: number;
  state: ModelInstallState;
}

interface ModelInstallCardProps {
  /** 待安装的模型列表（已安装的不要传进来） */
  items: ModelInstallItem[];
  /** 一键安装所有未安装的模型 */
  onInstall: () => void;
  /** 取消所有进行中的安装 */
  onCancel: () => void;
}

function formatMB(bytes?: number): string {
  if (!bytes) return '';
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

// 模型未安装时的一键安装引导卡片：安装按钮 / 下载进度 / 失败重试（支持一次安装多个模型）
export const ModelInstallCard: React.FC<ModelInstallCardProps> = ({ items, onInstall, onCancel }) => {
  if (items.length === 0) return null;

  const installingItems = items.filter((item) => item.state.status === 'installing');
  const failedItems = items.filter((item) => item.state.status === 'failed' || item.state.status === 'cancelled');
  const pendingItems = items.filter((item) => item.state.status === 'idle');
  const totalBytes = items.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);

  // 有进行中的下载：逐项展示进度
  if (installingItems.length > 0) {
    return (
      <div className="rounded-lg border px-3 py-2 space-y-2">
        {installingItems.map((item) => {
          const percent = item.state.sizeBytes ? Math.round(((item.state.progressBytes || 0) / item.state.sizeBytes) * 100) : 0;
          return (
            <div key={item.id} className="space-y-1">
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1 min-w-0">
                  <TbLoader2 className="animate-spin shrink-0" />
                  <span className="truncate">正在下载 {item.name}</span>
                  {item.state.sizeBytes ? ` (${formatMB(item.state.progressBytes)} / ${formatMB(item.state.sizeBytes)})` : ''}
                </span>
                <span className="shrink-0">{percent}%</span>
              </div>
              <Progress value={percent} className="h-1.5" />
            </div>
          );
        })}
        <div className="flex justify-end">
          <Button size="sm" variant="outline" className="h-6 text-xs px-2" onClick={onCancel}>
            取消
          </Button>
        </div>
      </div>
    );
  }

  // 无进行中：待安装 / 失败重试
  const hasFailed = failedItems.length > 0;
  const names = items.map((item) => item.name).join(' + ');
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/40">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-amber-700 dark:text-amber-400 break-words">
          {hasFailed ? `模型安装失败${failedItems[0]?.state.error ? `：${failedItems[0].state.error}` : ''}` : `模型 ${names} 未安装${totalBytes > 0 ? `（共约 ${formatMB(totalBytes)}）` : ''}`}
        </span>
        {(pendingItems.length > 0 || hasFailed) && (
          <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={onInstall}>
            {hasFailed ? '重试' : '一键安装'}
            <TbDownload />
          </Button>
        )}
      </div>
    </div>
  );
};
