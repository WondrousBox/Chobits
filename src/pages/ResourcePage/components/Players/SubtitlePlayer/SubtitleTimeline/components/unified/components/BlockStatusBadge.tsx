/**
 * BlockStatusBadge - 状态徽章组件
 *
 * 显示 TTS 块的合成状态
 */

import clsx from 'clsx';
import React from 'react';
import { TbLoader2, TbAlertCircle } from 'react-icons/tb';

import { useLabels } from '../../../context/TimelineContext';
import type { BlockContent, BlockStatusBadgeProps } from '../types';

/**
 * 获取状态样式
 */
function getStatusStyle(status: BlockContent['status']): string {
  switch (status) {
    case 'completed':
      return 'bg-green-500/20 text-green-600';
    case 'synthesizing':
      return 'bg-blue-500/20 text-blue-600';
    case 'error':
      return 'bg-red-500/20 text-red-600';
    case 'pending':
    default:
      return 'bg-muted/30 text-muted-foreground';
  }
}

/**
 * BlockStatusBadge 组件
 */
export const BlockStatusBadge: React.FC<BlockStatusBadgeProps> = ({ status, errorMessage }) => {
  const labels = useLabels();

  if (status === 'synthesizing') {
    return (
      <div className="flex items-center gap-1">
        <TbLoader2 className="h-3 w-3 shrink-0 animate-spin text-blue-500" />
        <span className="text-[10px] text-blue-600 truncate">{labels.blockStatusSynthesizing}</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center gap-1">
        <TbAlertCircle className="h-3 w-3 shrink-0 text-red-500" />
        <span className="text-[10px] text-red-600 truncate" title={errorMessage}>
          {errorMessage ?? labels.blockStatusSynthesisFailed}
        </span>
      </div>
    );
  }

  if (status === 'completed') {
    return null; // 完成状态不显示徽章
  }

  // pending 状态
  return (
    <span className={clsx('text-[10px] px-1.5 py-0.5 rounded', getStatusStyle(status))}>
      {labels.blockStatusPending}
    </span>
  );
};

BlockStatusBadge.displayName = 'BlockStatusBadge';
