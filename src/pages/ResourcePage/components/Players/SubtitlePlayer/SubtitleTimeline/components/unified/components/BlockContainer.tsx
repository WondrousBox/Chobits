/**
 * BlockContainer - 块容器组件
 *
 * 负责块的基础布局、样式和状态管理
 */

import clsx from 'clsx';
import React, { forwardRef } from 'react';

import { DEFAULT_CONFIG } from '../../../types';
import type { BlockCapabilities, BlockContainerProps, BlockContent, BlockDragMode, BlockLayout } from '../types';

/**
 * 计算块背景颜色
 */
function getBackgroundColor(
  content: BlockContent,
  layout: BlockLayout,
  capabilities: BlockCapabilities,
  isActive: boolean,
  isSelected: boolean,
  isOverlapping: boolean
): string {
  // 重叠时使用警告色
  if (isOverlapping) {
    return 'hsla(15, 85%, 55%, 0.5)';
  }

  // 使用轨道颜色或默认颜色
  const baseColor = layout.trackColor ?? 'hsl(var(--primary))';

  // 解析颜色并添加透明度
  const alpha = isActive ? 0.9 : isSelected ? 0.7 : 0.35;
  return applyAlpha(baseColor, alpha);
}

/**
 * 为颜色添加透明度
 */
function applyAlpha(color: string, alpha: number): string {
  // 处理 hsl()
  const hslMatch = color.match(/^hsl\(([^)]+)\)$/i);
  if (hslMatch) {
    return `hsla(${hslMatch[1]}, ${alpha})`;
  }

  // 处理 hsla()
  const hslaMatch = color.match(/^hsla\(([^,]+,\s*[^,]+,\s*[^,]+)(?:,\s*[^)]+)?\)$/i);
  if (hslaMatch) {
    return `hsla(${hslaMatch[1]}, ${alpha})`;
  }

  // 处理 CSS 变量
  if (color.includes('var(--')) {
    return color.replace(/var\((--[^)]+)\)/, `hsla(var($1), ${alpha})`);
  }

  return color;
}

/**
 * 计算块边框颜色
 */
function getBorderColor(
  content: BlockContent,
  layout: BlockLayout,
  capabilities: BlockCapabilities,
  isActive: boolean,
  isSelected: boolean
): string {
  const baseColor = layout.trackColor ?? 'hsl(var(--primary))';
  const alpha = isActive ? 0.8 : isSelected ? 0.6 : 0.3;
  return applyAlpha(baseColor, alpha);
}

/**
 * BlockContainer 组件
 */
export const BlockContainer = forwardRef<HTMLDivElement, BlockContainerProps>(
  (
    {
      children,
      content,
      layout,
      capabilities,
      isActive,
      isSelected,
      isOverlapping,
      disabled,
      dragMode,
      visualLeft,
      visualWidth,
      style,
      className,
      dataAttrType = 'block',
      onMouseDown,
      onMouseMove,
      onMouseLeave,
      onClick,
      onDoubleClick
    },
    ref
  ) => {
    const { trackHeight, trackGap = DEFAULT_CONFIG.TRACK_GAP } = layout;

    // 计算样式
    const backgroundColor = getBackgroundColor(content, layout, capabilities, isActive ?? false, isSelected ?? false, isOverlapping ?? false);
    const borderColor = getBorderColor(content, layout, capabilities, isActive ?? false, isSelected ?? false);

    // 光标样式
    const getCursor = (): string => {
      if (disabled) return 'not-allowed';
      if (dragMode === 'move') return 'grabbing';
      if (dragMode === 'resize-start' || dragMode === 'resize-end') return 'ew-resize';
      if (capabilities.drag?.movable || capabilities.drag?.edgeResize !== 'none') return 'grab';
      return 'pointer';
    };

    return (
      <div
        ref={ref}
        data-unified-block={dataAttrType}
        data-block-id={content.id}
        className={clsx(
          'group absolute flex items-center transition-shadow duration-100 overflow-visible [container-type:inline-size]',
          'border rounded',
          content.deleted && 'opacity-40',
          isOverlapping && 'border-orange-600 border-2',
          isActive && 'ring-1 ring-primary/50',
          isSelected && 'ring-2 ring-blue-500 z-20',
          disabled && 'pointer-events-none opacity-60',
          dragMode !== 'none' && 'opacity-80 shadow-lg z-30',
          className
        )}
        style={{
          left: visualLeft,
          width: visualWidth,
          top: trackGap / 2,
          height: trackHeight,
          backgroundColor,
          borderColor,
          borderRadius: DEFAULT_CONFIG.SEGMENT_BORDER_RADIUS,
          cursor: getCursor(),
          contain: 'layout style',
          ...style
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
      >
        {children}
      </div>
    );
  }
);

BlockContainer.displayName = 'BlockContainer';
