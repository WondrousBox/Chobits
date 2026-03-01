import clsx from 'clsx';
import React, { useCallback, useMemo, useRef } from 'react';

import type { MediaSegment, MediaSource, MediaTool, MediaTrackData, ViewportState } from '../types';
import { DEFAULT_CONFIG, MEDIA_CONFIG } from '../types';
import { MediaSegmentBlock } from './MediaSegmentBlock';

interface MediaTrackProps {
  /** 轨道数据 */
  track: MediaTrackData;
  /** 媒体源映射 */
  sources?: Map<string, MediaSource>;
  /** 当前视口 */
  viewport: ViewportState;
  /** 每秒像素数 */
  pixelsPerSecond: number;
  /** 轨道总宽度 */
  width: number;
  /** 当前播放时间 */
  currentTime?: number;
  /** 当前激活的工具 */
  activeTool?: MediaTool;
  /** 选中的片段 ID */
  selectedSegmentId?: string | null;
  /** 点击片段回调 */
  onSegmentClick?: (trackId: string, segmentId: string, event: React.MouseEvent) => void;
  /** 删除片段回调 */
  onSegmentDelete?: (trackId: string, segmentId: string) => void;
  /** 恢复片段回调 */
  onSegmentRestore?: (trackId: string, segmentId: string) => void;
  /** 移动片段回调 */
  onSegmentMove?: (trackId: string, segmentId: string, newTimelineStart: number) => void;
  /** 调整片段大小回调 */
  onSegmentResize?: (trackId: string, segmentId: string, edge: 'start' | 'end', newTime: number) => void;
  /** 在指定时间切割回调 */
  onSegmentCut?: (trackId: string, timelineTime: number) => void;
  /** 禁用状态 */
  disabled?: boolean;
}

/**
 * MediaTrack - 媒体轨道组件
 *
 * 渲染单个媒体轨道，包含所有媒体片段。
 * 支持虚拟化渲染（只渲染可见片段）和轨道级别的交互。
 */
export const MediaTrack: React.FC<MediaTrackProps> = ({
  track,
  sources,
  viewport,
  pixelsPerSecond,
  width,
  currentTime,
  activeTool = 'select',
  selectedSegmentId,
  onSegmentClick,
  onSegmentDelete,
  onSegmentRestore,
  onSegmentMove,
  onSegmentResize,
  onSegmentCut,
  disabled = false
}) => {
  const trackRef = useRef<HTMLDivElement>(null);

  const trackHeight = track.height ?? MEDIA_CONFIG.DEFAULT_TRACK_HEIGHT;
  const containerHeight = trackHeight + DEFAULT_CONFIG.TRACK_GAP;

  // 过滤出可见的片段（虚拟化）
  const visibleSegments = useMemo(() => {
    const bufferTime = 5; // 5秒缓冲区
    return track.segments.filter((segment) => {
      if (segment.deleted) return true; // 已删除的片段也要渲染（显示占位）
      return segment.timelineEnd >= viewport.startTime - bufferTime && segment.timelineStart <= viewport.endTime + bufferTime;
    });
  }, [track.segments, viewport.startTime, viewport.endTime]);

  // 当前正在播放的片段
  const activeSegment = useMemo(() => {
    if (currentTime === undefined) return null;
    return track.segments.find((s) => !s.deleted && !s.disabled && currentTime >= s.timelineStart && currentTime < s.timelineEnd);
  }, [track.segments, currentTime]);

  // 裁剪工具点击处理
  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (activeTool !== 'cut' || !onSegmentCut || disabled || track.locked) return;

      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const timelineTime = x / pixelsPerSecond;
      onSegmentCut(track.id, timelineTime);
    },
    [activeTool, onSegmentCut, disabled, track.locked, track.id, pixelsPerSecond]
  );

  // 片段点击处理
  const handleSegmentClick = useCallback(
    (segmentId: string, event: React.MouseEvent) => {
      onSegmentClick?.(track.id, segmentId, event);
    },
    [onSegmentClick, track.id]
  );

  // 禁用状态
  const isDisabled = disabled || track.locked || !track.visible;

  return (
    <div
      ref={trackRef}
      data-media-track={track.id}
      className={clsx('relative border-border', activeTool === 'cut' && !isDisabled && 'cursor-crosshair', isDisabled && 'opacity-40 pointer-events-none')}
      style={{
        height: containerHeight,
        width
      }}
      onClick={handleTrackClick}
    >
      {/* 背景 */}
      <div className={clsx('absolute inset-0', track.visible ? 'bg-background/30' : 'bg-background/10')} />

      {/* 渲染所有可见片段 */}
      {visibleSegments.map((segment) => {
        const source = sources?.get(segment.sourceId);
        const isActive = activeSegment?.id === segment.id;
        const activeProgress = isActive && currentTime !== undefined ? (currentTime - segment.timelineStart) / (segment.timelineEnd - segment.timelineStart) : 0;

        return (
          <MediaSegmentBlock
            key={segment.id}
            segment={segment}
            source={source}
            pixelsPerSecond={pixelsPerSecond}
            trackHeight={trackHeight}
            isSelected={selectedSegmentId === segment.id}
            isActive={isActive}
            activeProgress={activeProgress}
            activeTool={activeTool}
            onClick={handleSegmentClick}
            onDelete={onSegmentDelete ? () => onSegmentDelete(track.id, segment.id) : undefined}
            onRestore={onSegmentRestore ? () => onSegmentRestore(track.id, segment.id) : undefined}
            onMove={onSegmentMove ? (id, newStart) => onSegmentMove(track.id, id, newStart) : undefined}
            onResize={onSegmentResize ? (id, edge, newTime) => onSegmentResize(track.id, id, edge, newTime) : undefined}
            disabled={isDisabled}
          />
        );
      })}
    </div>
  );
};
