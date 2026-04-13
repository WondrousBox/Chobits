/**
 * BlockHandles - 边缘拖拽手柄组件
 *
 * 显示在块的左右两侧，用于调整时间或速度
 */

import clsx from 'clsx';
import React from 'react';

import { useLabels } from '../../../context/TimelineContext';
import type { BlockCapabilities, BlockDragMode, BlockHandlesProps } from '../types';

/**
 * 获取手柄颜色（根据调整模式）
 */
function getHandleColor(capabilities: BlockCapabilities): string {
  if (capabilities.drag?.edgeResize === 'speed') {
    return 'bg-yellow-400/40';
  }
  return 'bg-foreground/20';
}

/**
 * BlockHandles 组件
 */
export const BlockHandles: React.FC<BlockHandlesProps> = ({ capabilities, dragMode, disabled }) => {
  const labels = useLabels();
  if (disabled || capabilities.drag?.edgeResize === 'none') {
    return null;
  }

  const handleColor = getHandleColor(capabilities);
  const handleTitle = capabilities.drag?.edgeResize === 'speed'
    ? labels.blockHandlesDragSpeed
    : labels.blockHandlesDragTime;
  const isActive = dragMode === 'resize-start' || dragMode === 'resize-end';

  return (
    <>
      {/* 左边缘手柄 */}
      <div
        className={clsx(
          'absolute left-0 top-0 bottom-0 w-1.5 rounded-l transition-opacity z-20',
          handleColor,
          isActive && dragMode === 'resize-start' ? 'opacity-100' : 'opacity-0 hover:opacity-100'
        )}
        style={{ cursor: 'ew-resize' }}
        title={handleTitle}
      />

      {/* 右边缘手柄 */}
      <div
        className={clsx(
          'absolute right-0 top-0 bottom-0 w-1.5 rounded-r transition-opacity z-20',
          handleColor,
          isActive && dragMode === 'resize-end' ? 'opacity-100' : 'opacity-0 hover:opacity-100'
        )}
        style={{ cursor: 'ew-resize' }}
        title={handleTitle}
      />
    </>
  );
};

BlockHandles.displayName = 'BlockHandles';
