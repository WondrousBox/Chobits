import React, { useCallback, useMemo } from 'react';

import type { MediaSegment, MediaSource, MediaTool, MediaTrackData, ViewportState } from '../types';
import { MediaTrack } from './MediaTrack';

interface MediaTrackManagerProps {
  /** 媒体轨道列表 */
  tracks: MediaTrackData[];
  /** 媒体源映射 */
  sources?: Map<string, MediaSource>;
  /** 当前视口 */
  viewport: ViewportState;
  /** 每秒像素数 */
  pixelsPerSecond: number;
  /** 轨道总宽度 */
  width: number;
  /** 滚动偏移（用于计算拖放时间） */
  scrollLeft?: number;
  /** 当前播放时间 */
  currentTime?: number;
  /** 当前激活的工具 */
  activeTool?: MediaTool;
  /** 选中的轨道 ID */
  selectedTrackId?: string | null;
  /** 选中的片段 ID（格式：trackId:segmentId） */
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
  /** 快速添加媒体回调 */
  onQuickAdd?: (trackId: string, sources: MediaSource[], segments: Omit<MediaSegment, 'id'>[]) => void;
  /** 添加轨道回调 */
  onTrackAdd?: () => void;
  /** 删除轨道回调 */
  onTrackDelete?: (trackId: string) => void;
  /** 重排轨道顺序回调 */
  onTrackReorder?: (trackIds: string[]) => void;
  /** 禁用状态 */
  disabled?: boolean;
}

/**
 * MediaTrackManager - 多媒体轨道管理器
 *
 * 管理多个媒体轨道：
 * - 按 zIndex 顺序渲染轨道
 * - 处理轨道间的交互
 * - 提供轨道管理功能（添加、删除、重排）
 * - 支持快速添加媒体（右键菜单、拖拽）
 */
export const MediaTrackManager: React.FC<MediaTrackManagerProps> = ({
  tracks,
  sources,
  viewport,
  pixelsPerSecond,
  width,
  scrollLeft = 0,
  currentTime,
  activeTool = 'select',
  selectedTrackId,
  selectedSegmentId,
  onSegmentClick,
  onSegmentDelete,
  onSegmentRestore,
  onSegmentMove,
  onSegmentResize,
  onSegmentCut,
  onQuickAdd,
  onTrackAdd,
  onTrackDelete,
  onTrackReorder,
  disabled = false
}) => {
  // 按 zIndex 降序排列轨道（上层优先渲染）
  const sortedTracks = useMemo(() => {
    return [...tracks].sort((a, b) => b.zIndex - a.zIndex);
  }, [tracks]);

  // 解析选中的片段 ID
  const parsedSelection = useMemo(() => {
    if (!selectedSegmentId) return null;
    const [trackId, segmentId] = selectedSegmentId.split(':');
    return { trackId, segmentId };
  }, [selectedSegmentId]);

  // 处理片段点击
  const handleSegmentClick = useCallback(
    (trackId: string, segmentId: string, event: React.MouseEvent) => {
      onSegmentClick?.(trackId, segmentId, event);
    },
    [onSegmentClick]
  );

  // 处理快速添加
  const handleQuickAdd = useCallback(
    (trackId: string, sources: MediaSource[], segments: Omit<MediaSegment, 'id'>[]) => {
      onQuickAdd?.(trackId, sources, segments);
    },
    [onQuickAdd]
  );

  return (
    <div className="relative" style={{ width }}>
      {/* 渲染所有轨道 */}
      {sortedTracks.map((track) => (
        <MediaTrack
          key={track.id}
          track={track}
          sources={sources}
          viewport={viewport}
          pixelsPerSecond={pixelsPerSecond}
          width={width}
          scrollLeft={scrollLeft}
          currentTime={currentTime}
          activeTool={activeTool}
          selectedSegmentId={parsedSelection?.trackId === track.id ? parsedSelection.segmentId : null}
          onSegmentClick={handleSegmentClick}
          onSegmentDelete={onSegmentDelete}
          onSegmentRestore={onSegmentRestore}
          onSegmentMove={onSegmentMove}
          onSegmentResize={onSegmentResize}
          onSegmentCut={onSegmentCut}
          onQuickAdd={handleQuickAdd}
          disabled={disabled || !track.visible}
        />
      ))}
    </div>
  );
};
