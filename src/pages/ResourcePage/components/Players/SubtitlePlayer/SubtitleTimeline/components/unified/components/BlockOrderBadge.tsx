/**
 * BlockOrderBadge - 顺序徽章组件
 *
 * 显示片段的播放顺序号（用于剪辑块）
 */

import clsx from 'clsx';
import React from 'react';

import { useLabels } from '../../../context/TimelineContext';
import type { BlockOrderBadgeProps } from '../types';

/**
 * BlockOrderBadge 组件
 */
export const BlockOrderBadge: React.FC<BlockOrderBadgeProps> = ({ order, isActive }) => {
  const labels = useLabels();
  // 顺序号从 0 开始，显示时 +1
  const displayOrder = order + 1;

  return (
    <span
      className={clsx(
        'shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold',
        isActive ? 'bg-blue-500 text-white' : 'bg-blue-500/60 text-white'
      )}
      title={labels.blockOrderPlayback.replace('{order}', String(displayOrder))}
    >
      {displayOrder}
    </span>
  );
};

BlockOrderBadge.displayName = 'BlockOrderBadge';
