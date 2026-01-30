import { useCallback, useRef, useState } from 'react';

import { DEFAULT_CONFIG, TimelineSegment } from '../types';

interface UseTimelineInteractionOptions {
  /** 是否禁用 */
  disabled?: boolean;
  /** 缩放回调 */
  onZoom?: (factor: number, centerTime: number) => void;
  /** 平移回调（像素） */
  onPan?: (deltaPixels: number) => void;
  /** 像素转时间 */
  pixelToTime?: (pixel: number) => number;
  /** 点击时间轴回调 */
  onSeek?: (time: number) => void;
  /** 片段点击回调 */
  onSegmentClick?: (segment: TimelineSegment, trackId: string, event: React.MouseEvent) => void;
  /** 片段双击回调 */
  onSegmentDoubleClick?: (segment: TimelineSegment, trackId: string, event: React.MouseEvent) => void;
}

interface UseTimelineInteractionReturn {
  /** 是否正在拖拽 */
  isDragging: boolean;
  /** 鼠标事件处理器 */
  handlers: {
    onWheel: (e: React.WheelEvent) => void;
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: (e: React.MouseEvent) => void;
    onMouseLeave: (e: React.MouseEvent) => void;
  };
  /** 处理片段点击 */
  handleSegmentClick: (segment: TimelineSegment, trackId: string, event: React.MouseEvent) => void;
  /** 处理片段双击 */
  handleSegmentDoubleClick: (segment: TimelineSegment, trackId: string, event: React.MouseEvent) => void;
}

/**
 * 时间轴交互 Hook
 * 处理鼠标滚轮缩放、拖拽平移等交互
 */
export function useTimelineInteraction({ disabled = false, onZoom, onPan, pixelToTime, onSeek, onSegmentClick, onSegmentDoubleClick }: UseTimelineInteractionOptions): UseTimelineInteractionReturn {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  // 滚轮缩放
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (disabled) return;

      // Ctrl + 滚轮 = 缩放
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 1 / DEFAULT_CONFIG.ZOOM_STEP : DEFAULT_CONFIG.ZOOM_STEP;
        const scrollContainer = e.currentTarget as HTMLElement;
        const rect = scrollContainer.getBoundingClientRect();
        // 鼠标在视口内的位置 + 滚动偏移 = 相对于时间轴起点的像素位置
        const mouseX = e.clientX - rect.left + scrollContainer.scrollLeft;
        const centerTime = pixelToTime?.(mouseX) ?? 0;
        onZoom?.(factor, centerTime);
      }
      // 普通滚轮让浏览器原生处理水平滚动
    },
    [disabled, onZoom, pixelToTime]
  );

  // 拖拽开始
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;

      // 只响应左键或中键
      if (e.button !== 0 && e.button !== 1) return;

      // 如果点击的是片段或 TTS 块，不处理拖拽
      const target = e.target as HTMLElement;
      if (target.closest('[data-segment]') || target.closest('[data-tts-block]')) return;

      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      lastPosRef.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
    },
    [disabled]
  );

  // 拖拽移动
  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging || !lastPosRef.current) return;

      const deltaX = lastPosRef.current.x - e.clientX;
      onPan?.(deltaX);
      lastPosRef.current = { x: e.clientX, y: e.clientY };
    },
    [isDragging, onPan]
  );

  // 拖拽结束
  const onMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;

      setIsDragging(false);

      // 检查是否为点击（移动距离很小）
      if (dragStartRef.current) {
        const dx = Math.abs(e.clientX - dragStartRef.current.x);
        const dy = Math.abs(e.clientY - dragStartRef.current.y);

        if (dx < 3 && dy < 3) {
          // 这是一个点击，触发 seek
          const target = e.target as HTMLElement;
          if (!target.closest('[data-segment]') && pixelToTime && onSeek) {
            const scrollContainer = e.currentTarget as HTMLElement;
            const rect = scrollContainer.getBoundingClientRect();
            // 考虑滚动位置：视口内的点击位置 + 滚动偏移量
            const x = e.clientX - rect.left + scrollContainer.scrollLeft;
            const time = pixelToTime(x);
            onSeek(Math.max(0, time));
          }
        }
      }

      dragStartRef.current = null;
      lastPosRef.current = null;
    },
    [isDragging, pixelToTime, onSeek]
  );

  // 鼠标离开
  const onMouseLeave = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      dragStartRef.current = null;
      lastPosRef.current = null;
    }
  }, [isDragging]);

  // 片段点击
  const handleSegmentClick = useCallback(
    (segment: TimelineSegment, trackId: string, event: React.MouseEvent) => {
      if (disabled) return;
      event.stopPropagation();
      onSegmentClick?.(segment, trackId, event);
    },
    [disabled, onSegmentClick]
  );

  // 片段双击
  const handleSegmentDoubleClick = useCallback(
    (segment: TimelineSegment, trackId: string, event: React.MouseEvent) => {
      if (disabled) return;
      event.stopPropagation();
      onSegmentDoubleClick?.(segment, trackId, event);
    },
    [disabled, onSegmentDoubleClick]
  );

  return {
    isDragging,
    handlers: {
      onWheel,
      onMouseDown,
      onMouseMove,
      onMouseUp,
      onMouseLeave
    },
    handleSegmentClick,
    handleSegmentDoubleClick
  };
}
