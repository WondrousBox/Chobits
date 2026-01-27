import clsx from 'clsx';
import React, { useMemo } from 'react';

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
  onSegmentClick,
  onSegmentDoubleClick,
  onSegmentTextChange,
  onSegmentTimeChange,
  onMergePrev,
  disabled = false,
  className
}) => {
  const height = track.height ?? DEFAULT_CONFIG.TRACK_HEIGHT;

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

  if (track.hidden) {
    return null;
  }

  return (
    <div className={clsx('relative border-b border-border', className)} style={{ height: height + DEFAULT_CONFIG.TRACK_GAP, width }}>
      {/* 背景区域 */}
      <div className="absolute inset-0 bg-background" />

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
        />
      ))}

      {/* 当前时间指示线 */}
      {currentTime !== undefined && currentTime >= 0 && currentTime <= totalDuration && (
        <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none" style={{ left: timeToPixel(currentTime) }} />
      )}
    </div>
  );
};
