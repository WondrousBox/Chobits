import clsx from 'clsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { TimelineSegment } from '../../types';

interface SeekBarProps {
  /** 总时长（秒） */
  duration: number;
  /** 当前播放时间（秒） */
  currentTime?: number;
  /** 主字幕轨道的片段（用于显示高亮块） */
  segments: TimelineSegment[];
  /** 点击跳转回调 */
  onSeek?: (time: number) => void;
  /** 自定义类名 */
  className?: string;
}

type SeekPosition = {
  time: number;
  x: number;
};

const DRAG_SEEK_THROTTLE_MS = 80;
const DRAG_PREVIEW_HOLD_MS = 300;

/**
 * SeekBar - 时间线进度条组件
 *
 * 功能：
 * - 显示总时长的进度条
 * - 显示当前播放位置
 * - 显示主字幕轨道的所有片段（作为高亮块）
 * - 支持点击跳转到指定时间
 */
export const SeekBar: React.FC<SeekBarProps> = ({ duration, currentTime = 0, segments, onSeek, className }) => {
  const seekBarRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const lastDragSeekTimeRef = useRef(0);
  const pendingDragSeekTimeRef = useRef<number | null>(null);
  const dragSeekTimerRef = useRef<number | null>(null);
  const dragPreviewClearTimerRef = useRef<number | null>(null);
  const onSeekRef = useRef(onSeek);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);
  const [dragTime, setDragTime] = useState<number | null>(null);

  useEffect(() => {
    onSeekRef.current = onSeek;
  }, [onSeek]);

  useEffect(() => {
    return () => {
      if (dragSeekTimerRef.current !== null) {
        window.clearTimeout(dragSeekTimerRef.current);
      }
      if (dragPreviewClearTimerRef.current !== null) {
        window.clearTimeout(dragPreviewClearTimerRef.current);
      }
    };
  }, []);

  const getTimeFromClientX = useCallback(
    (clientX: number) => {
      if (!seekBarRef.current || duration <= 0) return null;

      const rect = seekBarRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const percentage = rect.width > 0 ? x / rect.width : 0;
      const time = Math.max(0, Math.min(duration, percentage * duration));

      return { time, x };
    },
    [duration]
  );

  const updateHoverTime = useCallback(
    (clientX: number) => {
      const result = getTimeFromClientX(clientX);
      if (!result) return;

      setHoverTime(result.time);
      setHoverX(result.x);
    },
    [getTimeFromClientX]
  );

  const clearDragPreviewTimer = useCallback(() => {
    if (dragPreviewClearTimerRef.current !== null) {
      window.clearTimeout(dragPreviewClearTimerRef.current);
      dragPreviewClearTimerRef.current = null;
    }
  }, []);

  const updateSeekPosition = useCallback(
    (position: SeekPosition) => {
      clearDragPreviewTimer();
      setDragTime(position.time);
      setHoverTime(position.time);
      setHoverX(position.x);
    },
    [clearDragPreviewTimer]
  );

  const scheduleDragPreviewClear = useCallback(() => {
    clearDragPreviewTimer();
    dragPreviewClearTimerRef.current = window.setTimeout(() => {
      dragPreviewClearTimerRef.current = null;
      setDragTime(null);
    }, DRAG_PREVIEW_HOLD_MS);
  }, [clearDragPreviewTimer]);

  const commitSeek = useCallback((time: number) => {
    onSeekRef.current?.(time);
    lastDragSeekTimeRef.current = performance.now();
  }, []);

  const scheduleDragSeek = useCallback(
    (time: number) => {
      pendingDragSeekTimeRef.current = time;

      const elapsed = performance.now() - lastDragSeekTimeRef.current;
      if (elapsed >= DRAG_SEEK_THROTTLE_MS) {
        if (dragSeekTimerRef.current !== null) {
          window.clearTimeout(dragSeekTimerRef.current);
          dragSeekTimerRef.current = null;
        }
        pendingDragSeekTimeRef.current = null;
        commitSeek(time);
        return;
      }

      if (dragSeekTimerRef.current === null) {
        dragSeekTimerRef.current = window.setTimeout(() => {
          dragSeekTimerRef.current = null;
          const pendingTime = pendingDragSeekTimeRef.current;
          pendingDragSeekTimeRef.current = null;

          if (pendingTime !== null && isDraggingRef.current) {
            commitSeek(pendingTime);
          }
        }, DRAG_SEEK_THROTTLE_MS - elapsed);
      }
    },
    [commitSeek]
  );

  const flushDragSeek = useCallback(
    (time?: number) => {
      if (dragSeekTimerRef.current !== null) {
        window.clearTimeout(dragSeekTimerRef.current);
        dragSeekTimerRef.current = null;
      }

      const finalTime = time ?? pendingDragSeekTimeRef.current;
      pendingDragSeekTimeRef.current = null;

      if (finalTime !== undefined && finalTime !== null) {
        commitSeek(finalTime);
      }
    },
    [commitSeek]
  );

  const seekToClientX = useCallback(
    (clientX: number, immediate = false) => {
      const result = getTimeFromClientX(clientX);
      if (!result) return null;

      updateSeekPosition(result);
      if (immediate) {
        flushDragSeek(result.time);
      } else {
        scheduleDragSeek(result.time);
      }

      return result;
    },
    [flushDragSeek, getTimeFromClientX, scheduleDragSeek, updateSeekPosition]
  );

  // 处理按下跳转并开始拖拽
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;

      e.currentTarget.setPointerCapture(e.pointerId);
      isDraggingRef.current = true;
      seekToClientX(e.clientX, true);
    },
    [seekToClientX]
  );

  // 处理指针移动（显示悬停时间，拖拽时持续 seek）
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isDraggingRef.current) {
        seekToClientX(e.clientX);
        return;
      }

      updateHoverTime(e.clientX);
    },
    [seekToClientX, updateHoverTime]
  );

  // 处理松开或取消拖拽
  const handlePointerEnd = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }

      const result = getTimeFromClientX(e.clientX);
      if (result) {
        updateSeekPosition(result);
      }

      flushDragSeek(result?.time);
      isDraggingRef.current = false;
      if (result) {
        scheduleDragPreviewClear();
      } else {
        setDragTime(null);
      }
    },
    [flushDragSeek, getTimeFromClientX, scheduleDragPreviewClear, updateSeekPosition]
  );

  // 处理鼠标离开
  const handlePointerLeave = useCallback(() => {
    if (!isDraggingRef.current) {
      setHoverTime(null);
    }
  }, []);

  // 计算当前播放位置百分比
  const currentProgress = useMemo(() => {
    if (duration <= 0) return 0;
    return ((dragTime ?? currentTime) / duration) * 100;
  }, [currentTime, dragTime, duration]);

  // 计算片段的位置和宽度百分比
  const segmentBlocks = useMemo(() => {
    if (duration <= 0) return [];

    return segments.map((segment) => {
      const left = (segment.startTime / duration) * 100;
      const width = ((segment.endTime - segment.startTime) / duration) * 100;
      return {
        id: segment.id,
        left: `${left}%`,
        width: `${width}%`
      };
    });
  }, [segments, duration]);

  return (
    <div
      className={clsx('relative h-8 bg-muted/30 border-b cursor-pointer touch-none select-none group', className)}
      ref={seekBarRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerLeave}
    >
      {/* 背景轨道 */}
      <div className="absolute inset-0 bg-muted/40 overflow-hidden">
        {/* 字幕片段高亮块 */}
        {segmentBlocks.map((block) => (
          <div
            key={block.id}
            className="absolute h-full bg-primary/30 transition-colors"
            style={{
              left: block.left,
              width: block.width
            }}
          />
        ))}

        {/* 已播放进度 */}
        <div className="absolute left-0 top-0 h-full bg-primary/50" style={{ width: `${currentProgress}%` }} />
      </div>

      {/* 当前播放位置指示器 */}
      <div className="absolute inset-y-0 -translate-x-1/2 pointer-events-none" style={{ left: `${currentProgress}%` }}>
        <div className="h-full w-0.5 bg-primary shadow-md" />
      </div>

      {/* 悬停时显示时间提示 */}
      {hoverTime !== null && (
        <div className="absolute inset-y-0 -translate-x-1/2 pointer-events-none z-10" style={{ left: `${hoverX}px` }}>
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-foreground text-background text-xs rounded whitespace-nowrap font-mono shadow-lg">
            {(() => {
              const formatTime = (seconds: number): string => {
                const h = Math.floor(seconds / 3600);
                const m = Math.floor((seconds % 3600) / 60);
                const s = Math.floor(seconds % 60);
                if (h > 0) {
                  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                }
                return `${m}:${s.toString().padStart(2, '0')}`;
              };
              return formatTime(hoverTime);
            })()}
          </div>
          {/* 悬停位置的垂直指示线 */}
          <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-red-500" />
        </div>
      )}
    </div>
  );
};
