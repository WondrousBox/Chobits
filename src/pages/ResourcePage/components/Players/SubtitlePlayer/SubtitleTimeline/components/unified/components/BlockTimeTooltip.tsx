/**
 * BlockTimeTooltip - 拖拽时间提示组件
 *
 * 拖拽时显示时间变化的悬浮提示
 */

import React from 'react';

import type { BlockTimeTooltipProps } from '../types';

/**
 * 格式化时间
 */
function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = (seconds % 60).toFixed(2);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.padStart(5, '0')}`;
  }
  return `${m}:${s.padStart(5, '0')}`;
}

/**
 * BlockTimeTooltip 组件
 */
export const BlockTimeTooltip: React.FC<BlockTimeTooltipProps> = ({ startTime, endTime, x, y }) => {
  // 生成显示文本
  const getText = (): string | null => {
    if (startTime !== undefined && endTime !== undefined) {
      return `${formatTime(startTime)} — ${formatTime(endTime)}`;
    }
    if (startTime !== undefined) {
      return formatTime(startTime);
    }
    if (endTime !== undefined) {
      return formatTime(endTime);
    }
    return null;
  };

  const text = getText();
  if (!text) return null;

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{
        left: `${x + 10}px`,
        top: `${y - 30}px`
      }}
    >
      <div className="bg-primary text-primary-foreground px-2 py-1 rounded shadow-lg text-xs font-mono whitespace-nowrap">
        {text}
      </div>
    </div>
  );
};

BlockTimeTooltip.displayName = 'BlockTimeTooltip';
