/**
 * BlockProgressBar - 播放进度条组件
 *
 * 显示块的播放进度
 */

import clsx from 'clsx';
import React from 'react';

import type { BlockProgressBarProps } from '../types';

/**
 * BlockProgressBar 组件
 */
export const BlockProgressBar: React.FC<BlockProgressBarProps> = ({ progress, color }) => {
  if (progress <= 0) return null;

  const clampedProgress = Math.min(100, Math.max(0, progress * 100));

  return (
    <div
      className={clsx('absolute left-0 top-0 bottom-0 pointer-events-none rounded-l z-0', color ? '' : 'bg-foreground/30')}
      style={{
        width: `${clampedProgress}%`,
        backgroundColor: color ?? undefined,
        borderRadius: clampedProgress >= 99 ? undefined : '4px 0px 0px 4px'
      }}
    />
  );
};

BlockProgressBar.displayName = 'BlockProgressBar';
