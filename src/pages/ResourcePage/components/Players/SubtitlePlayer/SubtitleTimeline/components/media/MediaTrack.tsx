import clsx from 'clsx';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { TbUpload } from 'react-icons/tb';

import { useConfigAdapter, useIdGeneratorAdapter, useMediaAdapter } from '../../context';
import type { MediaSegment, MediaSource, MediaTool, MediaTrackData, ViewportState } from '../../types';
import { DEFAULT_CONFIG, DEFAULT_TRANSFORM, MEDIA_CONFIG } from '../../types';
import { MediaSegmentBlock } from './MediaSegmentBlock';
import { MediaTrackQuickAdd } from './MediaTrackQuickAdd';

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
  /** 滚动偏移（用于计算拖放时间） */
  scrollLeft?: number;
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
  /** 快速添加媒体回调 */
  onQuickAdd?: (trackId: string, sources: MediaSource[], segments: Omit<MediaSegment, 'id'>[]) => void;
  /** 禁用状态 */
  disabled?: boolean;
}

/**
 * MediaTrack - 媒体轨道组件
 *
 * 渲染单个媒体轨道，包含所有媒体片段。
 * 支持：
 * - 虚拟化渲染（只渲染可见片段）
 * - 右键菜单快速添加媒体
 * - 拖拽文件添加媒体
 * - 轨道级别的交互
 */
export const MediaTrack: React.FC<MediaTrackProps> = ({
  track,
  sources,
  viewport,
  pixelsPerSecond,
  width,
  scrollLeft = 0,
  currentTime,
  activeTool = 'select',
  selectedSegmentId,
  onSegmentClick,
  onSegmentDelete,
  onSegmentRestore,
  onSegmentMove,
  onSegmentResize,
  onSegmentCut,
  onQuickAdd,
  disabled = false
}) => {
  const trackRef = useRef<HTMLDivElement>(null);

  // Get adapters from context
  const mediaAdapter = useMediaAdapter();
  const configAdapter = useConfigAdapter();
  const idGeneratorAdapter = useIdGeneratorAdapter();

  // Get file extensions from config adapter
  const videoExtensions = configAdapter?.videoExtensions || ['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'];
  const imageExtensions = configAdapter?.imageExtensions || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];

  // 右键菜单点击位置对应的时间
  const [contextMenuTime, setContextMenuTime] = useState(0);
  // 拖拽状态
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isProcessingDrop, setIsProcessingDrop] = useState(false);

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

  // 计算点击位置对应的时间
  const getTimeFromEvent = useCallback(
    (e: React.MouseEvent | React.DragEvent): number => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return 0;
      const x = e.clientX - rect.left + scrollLeft;
      return Math.max(0, x / pixelsPerSecond);
    },
    [pixelsPerSecond, scrollLeft]
  );

  // 裁剪工具点击处理
  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (activeTool !== 'cut' || !onSegmentCut || disabled || track.locked) return;

      const timelineTime = getTimeFromEvent(e);
      onSegmentCut(track.id, timelineTime);
    },
    [activeTool, onSegmentCut, disabled, track.locked, track.id, getTimeFromEvent]
  );

  // 片段点击处理
  const handleSegmentClick = useCallback(
    (segmentId: string, event: React.MouseEvent) => {
      onSegmentClick?.(track.id, segmentId, event);
    },
    [onSegmentClick, track.id]
  );

  // 右键菜单打开时记录时间
  const handleContextMenuOpenChange = useCallback((open: boolean) => {
    if (open) {
      // 菜单打开时，时间已经通过 onContextMenu 设置
    }
  }, []);

  // 处理右键事件，记录点击位置的时间
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const time = getTimeFromEvent(e);
      setContextMenuTime(time);
    },
    [getTimeFromEvent]
  );

  // 处理拖拽添加
  const handleQuickAdd = useCallback(
    (sources: MediaSource[], segments: Omit<MediaSegment, 'id'>[]) => {
      onQuickAdd?.(track.id, sources, segments);
    },
    [onQuickAdd, track.id]
  );

  // 拖拽事件处理
  const handleDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (disabled || track.locked || !onQuickAdd) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.types.includes('Files')) {
        setIsDraggingOver(true);
      }
    },
    [disabled, track.locked, onQuickAdd]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 检查是否真的离开了容器
    const rect = trackRef.current?.getBoundingClientRect();
    if (rect) {
      const { clientX, clientY } = e;
      if (clientX < rect.left || clientX >= rect.right || clientY < rect.top || clientY >= rect.bottom) {
        setIsDraggingOver(false);
      }
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);

      if (disabled || track.locked || !onQuickAdd) return;

      const dropTime = getTimeFromEvent(e);
      const files = e.dataTransfer.files;
      const filePaths: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const filePath = (files[i] as File & { path?: string }).path;
        if (filePath) {
          filePaths.push(filePath);
        }
      }

      if (filePaths.length > 0) {
        setIsProcessingDrop(true);
        try {
          // 处理文件路径
          const mediaSources: MediaSource[] = [];

          for (const filePath of filePaths) {
            const ext = filePath.split('.').pop()?.toLowerCase() || '';

            const isVideo = videoExtensions.includes(ext);
            const isImage = imageExtensions.includes(ext);

            if (!isVideo && !isImage) continue;

            let info: { width: number; height: number; duration?: number } | null = null;
            try {
              info = await mediaAdapter?.getMediaInfo?.(filePath) || null;
            } catch (err) {
              console.warn(`Could not get info for ${filePath}:`, err);
            }

            // Generate ID using adapter
            const sourceId = idGeneratorAdapter?.generateMediaSourceId?.() || `source-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

            mediaSources.push({
              id: sourceId,
              path: filePath,
              type: isVideo ? 'video' : 'image',
              duration: info?.duration || (isVideo ? 10 : undefined),
              width: info?.width || configAdapter?.defaultMediaInfo?.width || 1920,
              height: info?.height || configAdapter?.defaultMediaInfo?.height || 1080
            });
          }

          if (mediaSources.length > 0) {
            const segments: Omit<MediaSegment, 'id'>[] = mediaSources.map((source, index) => {
              const startOffset = index * 0.5;
              const segmentDuration = source.type === 'video' ? Math.min(source.duration || 5, 5) : 5;

              return {
                sourceId: source.id,
                timelineStart: dropTime + startOffset,
                timelineEnd: dropTime + startOffset + segmentDuration,
                sourceStart: 0,
                sourceEnd: source.type === 'video' ? Math.min(source.duration || 5, segmentDuration) : undefined,
                playbackRate: 1.0,
                muted: false,
                volume: 1.0,
                transform: { ...DEFAULT_TRANSFORM },
                label: source.path.split('/').pop()
              };
            });

            onQuickAdd(track.id, mediaSources, segments);
          }
        } finally {
          setIsProcessingDrop(false);
        }
      }
    },
    [disabled, track.locked, onQuickAdd, track.id, getTimeFromEvent, mediaAdapter, configAdapter, idGeneratorAdapter, videoExtensions, imageExtensions]
  );

  // 禁用状态
  const isDisabled = disabled || track.locked || !track.visible;

  // 轨道内容
  const trackContent = (
    <div
      ref={trackRef}
      data-media-track={track.id}
      className={clsx(
        'relative border-border transition-colors',
        activeTool === 'cut' && !isDisabled && 'cursor-crosshair',
        isDisabled && 'opacity-40 pointer-events-none',
        isDraggingOver && 'ring-2 ring-emerald-400 ring-inset bg-emerald-500/5'
      )}
      style={{
        height: containerHeight,
        width
      }}
      onClick={handleTrackClick}
      onContextMenu={handleContextMenu}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* 背景 */}
      <div className={clsx('absolute inset-0', track.visible ? 'bg-background/30' : 'bg-background/10')} />

      {/* 空轨道提示 */}
      {track.segments.filter((s) => !s.deleted).length === 0 && !isDisabled && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs text-muted-foreground/50">右键或拖拽文件添加媒体</span>
        </div>
      )}

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

      {/* 拖拽覆盖层 */}
      {isDraggingOver && (
        <div className="absolute inset-0 bg-emerald-500/10 border-2 border-dashed border-emerald-400 flex items-center justify-center z-20 pointer-events-none">
          <div className="flex flex-col items-center gap-1 bg-background/95 px-4 py-2 rounded-lg shadow-lg">
            <TbUpload className="w-6 h-6 text-emerald-500" />
            <span className="text-sm font-medium text-emerald-600">释放以添加媒体</span>
          </div>
        </div>
      )}

      {/* 处理中指示器 */}
      {isProcessingDrop && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-30">
          <div className="flex items-center gap-2 bg-background px-4 py-2 rounded-lg shadow-lg border">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">处理中...</span>
          </div>
        </div>
      )}
    </div>
  );

  // 如果支持快速添加且未禁用，包装右键菜单
  if (onQuickAdd && !isDisabled) {
    return (
      <MediaTrackQuickAdd trackId={track.id} clickTime={contextMenuTime} onImport={handleQuickAdd} onOpenChange={handleContextMenuOpenChange}>
        {trackContent}
      </MediaTrackQuickAdd>
    );
  }

  return trackContent;
};
