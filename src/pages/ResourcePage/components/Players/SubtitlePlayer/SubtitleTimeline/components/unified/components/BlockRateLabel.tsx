/**
 * BlockRateLabel - 速率标签组件
 *
 * 显示播放速率（当不为 1.0x 时）
 */

import clsx from 'clsx';
import React from 'react';

import type { BlockRateLabelProps } from '../types';

/**
 * 格式化速率显示
 */
function formatRate(rate: number): string {
  if (rate >= 10) {
    return `${rate.toFixed(0)}x`;
  }
  return `${rate.toFixed(1)}x`;
}

/**
 * BlockRateLabel 组件
 */
export const BlockRateLabel: React.FC<BlockRateLabelProps> = ({ rate, isPreview }) => {
  // 只在速率不为 1.0 时显示
  if (Math.abs(rate - 1.0) < 0.02) {
    return null;
  }

  return (
    <span
      className={clsx(
        'text-[9px] font-mono shrink-0 px-1 rounded',
        isPreview ? 'text-orange-400 bg-orange-400/10' : 'text-yellow-400 bg-yellow-400/10'
      )}
    >
      {formatRate(rate)}
    </span>
  );
};

BlockRateLabel.displayName = 'BlockRateLabel';
