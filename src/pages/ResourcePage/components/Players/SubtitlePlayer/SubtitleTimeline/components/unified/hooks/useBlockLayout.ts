/**
 * useBlockLayout - 块布局计算 Hook
 *
 * 计算块在时间轴上的位置和尺寸，包括拖拽时的视觉位置
 */

import { useMemo } from 'react';

import { DEFAULT_CONFIG } from '../../../types';
import type { BlockContent, BlockDragMode, BlockLayout } from '../types';

interface UseBlockLayoutOptions {
  content: BlockContent;
  layout: BlockLayout;
  dragMode: BlockDragMode;
  dragDeltaX: number;
  dragStartTime: number;
  dragEndTime: number;
}

interface UseBlockLayoutReturn {
  /** 基础位置（未拖拽时） */
  left: number;
  /** 基础宽度 */
  width: number;
  /** 视觉位置（拖拽时实时更新） */
  visualLeft: number;
  /** 视觉宽度 */
  visualWidth: number;
  /** 片段持续时间 */
  duration: number;
}

export function useBlockLayout({
  content,
  layout,
  dragMode,
  dragDeltaX,
  dragStartTime,
  dragEndTime
}: UseBlockLayoutOptions): UseBlockLayoutReturn {
  const { pixelsPerSecond } = layout;

  // 基础布局计算
  const { left, width, duration } = useMemo(() => {
    const dur = content.endTime - content.startTime;
    const l = content.startTime * pixelsPerSecond;
    const w = Math.max(DEFAULT_CONFIG.SEGMENT_MIN_WIDTH, dur * pixelsPerSecond);
    return { left: l, width: w, duration: dur };
  }, [content.startTime, content.endTime, pixelsPerSecond]);

  // 拖拽时的视觉位置和宽度
  const { visualLeft, visualWidth } = useMemo(() => {
    if (dragMode === 'none') {
      return { visualLeft: left, visualWidth: width };
    }

    if (dragMode === 'move') {
      const newLeft = dragStartTime * pixelsPerSecond;
      return { visualLeft: newLeft, visualWidth: width };
    }

    if (dragMode === 'resize-start') {
      const newLeft = dragStartTime * pixelsPerSecond;
      const newWidth = Math.max(DEFAULT_CONFIG.SEGMENT_MIN_WIDTH, (dragEndTime - dragStartTime) * pixelsPerSecond);
      return { visualLeft: newLeft, visualWidth: newWidth };
    }

    if (dragMode === 'resize-end') {
      const newWidth = Math.max(DEFAULT_CONFIG.SEGMENT_MIN_WIDTH, (dragEndTime - dragStartTime) * pixelsPerSecond);
      return { visualLeft: left, visualWidth: newWidth };
    }

    return { visualLeft: left, visualWidth: width };
  }, [dragMode, dragDeltaX, dragStartTime, dragEndTime, left, width, pixelsPerSecond]);

  return {
    left,
    width,
    visualLeft,
    visualWidth,
    duration
  };
}
