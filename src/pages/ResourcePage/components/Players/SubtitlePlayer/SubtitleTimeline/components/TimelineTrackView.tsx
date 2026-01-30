import clsx from 'clsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_CONFIG, TimelineSegment, TimelineTrack, ViewportState } from '../types';
import { detectOverlappingSegments } from '../utils';
import { TimelineSegmentBlock } from './TimelineSegmentBlock';

interface TimelineTrackViewProps {
  track: TimelineTrack;
  viewport: ViewportState;
  /** 总时长 */
  totalDuration: number;
  /** 每秒像素数 */
  pixelsPerSecond: number;
  /** 轨道总宽度 */
  width: number;
  /** 当前播放时间 */
  currentTime?: number;
  /** 高亮的片段 ID */
  highlightIds?: Set<string>;
  /** 选中的片段 ID */
  selectedIds?: Set<string>;
  /** 横向滚动偏移（用于空白处点击计算时间） */
  scrollLeft?: number;
  /** 待新增片段的输入框时间范围（仅主轨道等支持新增时使用） */
  pendingNewSegment?: { startTime: number; endTime: number } | null;
  /** 点击轨道空白处（非片段区域） */
  onTrackEmptyClick?: (trackId: string, clickTime: number) => void;
  /** 确认新增片段（输入框失焦且有内容时） */
  onAddSegmentConfirm?: (trackId: string, startTime: number, endTime: number, text: string) => void;
  /** 取消新增（输入框失焦且无内容时） */
  onCancelNewSegment?: () => void;
  /** 是否允许在空白处点击新增片段 */
  allowAddSegment?: boolean;
  /** 片段点击 */
  onSegmentClick?: (segment: TimelineSegment, trackId: string, event: React.MouseEvent) => void;
  /** 片段双击 */
  onSegmentDoubleClick?: (segment: TimelineSegment, trackId: string, event: React.MouseEvent) => void;
  /** 片段文本变更 */
  onSegmentTextChange?: (segment: TimelineSegment, trackId: string, newText: string) => void;
  /** 片段时间变更 */
  onSegmentTimeChange?: (segment: TimelineSegment, trackId: string, newStartTime: number, newEndTime: number) => void;
  /** 往前合并（统一回调签名） */
  onMergePrev?: (payload: { trackId: string; segmentIndex: number }) => void;
  /** 删除选中片段 */
  onDeleteSegment?: (segment: TimelineSegment, trackId: string) => void;
  /** 禁用交互 */
  disabled?: boolean;
  className?: string;
}

/**
 * 单个轨道的渲染组件
 *
 * 虚拟化策略：
 * - 只渲染可视区域 + 缓冲区内的片段
 * - 缓冲区为可视区域的 100%（前后各 50%）
 * - 这样可以确保滚动时有足够的预渲染内容
 */
export const TimelineTrackView: React.FC<TimelineTrackViewProps> = ({
  track,
  viewport,
  totalDuration,
  pixelsPerSecond,
  width,
  currentTime,
  highlightIds,
  selectedIds,
  scrollLeft = 0,
  pendingNewSegment,
  onTrackEmptyClick,
  onAddSegmentConfirm,
  onCancelNewSegment,
  allowAddSegment = false,
  onSegmentClick,
  onSegmentDoubleClick,
  onSegmentTextChange,
  onSegmentTimeChange,
  onMergePrev,
  onDeleteSegment,
  disabled = false,
  className
}) => {
  const height = track.height ?? DEFAULT_CONFIG.TRACK_HEIGHT;
  const trackRef = useRef<HTMLDivElement>(null);
  const newSegmentInputRef = useRef<HTMLTextAreaElement>(null);
  const [newSegmentInput, setNewSegmentInput] = useState('');
  /** mousedown 时的横向滚动位置，用于区分「点击空白」与「拖拽滚动后松开」 */
  const scrollLeftAtMouseDownRef = useRef<number | null>(null);

  // 打开新增输入框时清空内容并聚焦
  useEffect(() => {
    if (pendingNewSegment) {
      setNewSegmentInput('');
      requestAnimationFrame(() => newSegmentInputRef.current?.focus());
    }
  }, [pendingNewSegment]);

  // 预计算片段的时间数组（用于二分查找）
  const { startTimes, endTimes } = useMemo(() => {
    const starts: number[] = [];
    const ends: number[] = [];
    for (const seg of track.segments) {
      starts.push(seg.startTime);
      ends.push(seg.endTime);
    }
    return { startTimes: starts, endTimes: ends };
  }, [track.segments]);

  // 使用二分查找获取可见片段（带缓冲区）
  const visibleSegments = useMemo(() => {
    const { startTime, endTime } = viewport;
    const n = startTimes.length;

    if (n === 0) return [];

    // 计算缓冲区（可视区域的 100%）
    const viewDuration = endTime - startTime;
    const bufferTime = viewDuration; // 100% 缓冲

    const renderStart = Math.max(0, startTime - bufferTime);
    const renderEnd = Math.min(totalDuration, endTime + bufferTime);

    // 二分查找第一个 endTime > renderStart 的片段
    let left = 0;
    let right = n;
    while (left < right) {
      const mid = (left + right) >>> 1;
      if (endTimes[mid] <= renderStart) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    const start = left;

    // 二分查找第一个 startTime >= renderEnd 的片段
    left = start;
    right = n;
    while (left < right) {
      const mid = (left + right) >>> 1;
      if (startTimes[mid] < renderEnd) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }
    const end = left;

    // 返回可见片段及其索引
    return track.segments.slice(start, end).map((segment, i) => ({
      segment,
      index: start + i
    }));
  }, [track.segments, viewport, startTimes, endTimes, totalDuration]);

  // 计算当前播放位置所在的片段
  const activeSegmentId = useMemo(() => {
    if (currentTime === undefined) return null;
    for (const seg of track.segments) {
      if (currentTime >= seg.startTime && currentTime < seg.endTime) {
        return seg.id;
      }
    }
    return null;
  }, [track.segments, currentTime]);

  // 检测重叠的片段
  const overlappingSegmentIds = useMemo(() => {
    return detectOverlappingSegments(track.segments);
  }, [track.segments]);

  // 时间转像素（相对于轨道起点）
  const timeToPixel = (time: number): number => {
    return time * pixelsPerSecond;
  };

  // 点击轨道空白处：计算点击时间并通知父组件；若发生过横向滚动则视为拖拽滚动，不创建新块
  const handleTrackBackgroundClick = useCallback(
    (e: React.MouseEvent) => {
      if (!allowAddSegment || !onTrackEmptyClick || disabled) return;
      e.stopPropagation();
      if (scrollLeftAtMouseDownRef.current !== null && Math.abs((scrollLeft ?? 0) - scrollLeftAtMouseDownRef.current) > 2) {
        scrollLeftAtMouseDownRef.current = null;
        return;
      }
      scrollLeftAtMouseDownRef.current = null;
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const contentX = e.clientX - rect.left;
      const clickTime = contentX / pixelsPerSecond;
      if (clickTime >= 0 && clickTime <= totalDuration) {
        onTrackEmptyClick(track.id, clickTime);
      }
    },
    [allowAddSegment, onTrackEmptyClick, disabled, pixelsPerSecond, totalDuration, track.id, scrollLeft]
  );

  const handleTrackBackgroundMouseDown = useCallback(() => {
    scrollLeftAtMouseDownRef.current = scrollLeft ?? 0;
  }, [scrollLeft]);

  // 新增片段输入框失焦：无内容则取消，有内容则确认新增
  const handleNewSegmentBlur = useCallback(() => {
    if (!pendingNewSegment) return;
    const text = newSegmentInput.trim();
    if (text === '') {
      onCancelNewSegment?.();
    } else {
      onAddSegmentConfirm?.(track.id, pendingNewSegment.startTime, pendingNewSegment.endTime, text);
    }
    setNewSegmentInput('');
  }, [pendingNewSegment, newSegmentInput, onCancelNewSegment, onAddSegmentConfirm, track.id]);

  if (track.hidden) {
    return null;
  }

  return (
    <div ref={trackRef} className={clsx('relative border-b border-border', className)} style={{ height: height + DEFAULT_CONFIG.TRACK_GAP, width }}>
      {/* 背景区域（点击空白处可新增片段；mousedown 记录滚动位置以区分点击与拖拽滚动） */}
      <div className="absolute inset-0 bg-background" role="presentation" onMouseDown={handleTrackBackgroundMouseDown} onClick={handleTrackBackgroundClick} />

      {/* 待新增片段的输入框：样式与双击编辑一致（多行、边框、最小宽高） */}
      {pendingNewSegment && (
        <div
          className="absolute z-20 overflow-hidden rounded"
          style={{
            left: timeToPixel(pendingNewSegment.startTime),
            width: Math.max(150, timeToPixel(pendingNewSegment.endTime - pendingNewSegment.startTime)),
            top: DEFAULT_CONFIG.TRACK_GAP / 2,
            height: height + 20
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <textarea
            ref={newSegmentInputRef}
            className={clsx(
              'w-full h-full min-w-[150px] px-1.5 py-0.5 text-xs leading-tight resize-none',
              'bg-background border-2 border-primary rounded outline-none text-foreground box-border',
              'placeholder:text-muted-foreground'
            )}
            style={{ minHeight: height + 20 }}
            placeholder="输入内容，回车添加"
            value={newSegmentInput}
            onChange={(e) => setNewSegmentInput(e.target.value)}
            onBlur={handleNewSegmentBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                (e.target as HTMLTextAreaElement).blur();
              } else if (e.key === 'Escape') {
                setNewSegmentInput('');
                onCancelNewSegment?.();
              }
            }}
          />
        </div>
      )}

      {/* 片段渲染 */}
      {visibleSegments.map(({ segment, index }) => (
        <TimelineSegmentBlock
          key={segment.id}
          segment={segment}
          trackId={track.id}
          trackColor={track.color}
          trackHeight={height}
          pixelsPerSecond={pixelsPerSecond}
          segmentIndex={index}
          maxDuration={totalDuration}
          isActive={segment.id === activeSegmentId}
          isHighlighted={highlightIds?.has(segment.id)}
          isSelected={selectedIds?.has(segment.id)}
          isOverlapping={overlappingSegmentIds.has(segment.id)}
          disabled={disabled || track.locked}
          onClick={onSegmentClick}
          onDoubleClick={onSegmentDoubleClick}
          onTextChange={onSegmentTextChange}
          onTimeChange={onSegmentTimeChange}
          onMergePrev={onMergePrev}
          onDeleteSegment={onDeleteSegment}
        />
      ))}

      {/* 当前时间指示线 */}
      {
        // currentTime !== undefined && currentTime >= 0 && currentTime <= totalDuration && (
        //   <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none" style={{ left: timeToPixel(currentTime) }} />
        // )
      }

      {/* 音频结束截止线 */}
      <div className="absolute top-0 bottom-0 w-0.5 bg-orange-500 z-10 pointer-events-none" style={{ left: timeToPixel(totalDuration) }} title={`音频结束: ${totalDuration.toFixed(2)}s`} />
    </div>
  );
};
