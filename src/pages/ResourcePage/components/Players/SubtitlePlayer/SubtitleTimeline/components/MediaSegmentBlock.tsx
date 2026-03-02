import clsx from 'clsx';
import React, { useCallback, useRef, useState } from 'react';
import { TbArrowsHorizontal, TbArrowsVertical, TbPhoto, TbPlayerPause, TbRefresh, TbRestore, TbRotate, TbTrash, TbVideo } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import type { MediaSegment, MediaSource, MediaTool, MediaTransform } from '../types';
import { DEFAULT_CONFIG, MEDIA_CONFIG } from '../types';
import { formatSecondsToTime } from '../utils';
import { ThumbnailStrip } from './ThumbnailStrip';
import { TransitionIndicator } from './TransitionIndicator';

/** 边缘拖拽检测宽度 */
const EDGE_WIDTH = 8;

type DragMode = 'none' | 'move' | 'resize-start' | 'resize-end';

interface MediaSegmentBlockProps {
  /** 片段数据 */
  segment: MediaSegment;
  /** 媒体源 */
  source?: MediaSource;
  /** 每秒像素数 */
  pixelsPerSecond: number;
  /** 轨道高度 */
  trackHeight: number;
  /** 是否选中 */
  isSelected?: boolean;
  /** 是否为当前正在播放 */
  isActive?: boolean;
  /** 当前播放进度（0~1） */
  activeProgress?: number;
  /** 当前激活的工具 */
  activeTool?: MediaTool;
  /** 点击回调 */
  onClick?: (segmentId: string, event: React.MouseEvent) => void;
  /** 删除回调 */
  onDelete?: (segmentId: string) => void;
  /** 恢复回调 */
  onRestore?: (segmentId: string) => void;
  /** 移动回调 */
  onMove?: (segmentId: string, newTimelineStart: number) => void;
  /** 调整大小回调 */
  onResize?: (segmentId: string, edge: 'start' | 'end', newTime: number) => void;
  /** 变换回调 */
  onTransform?: (segmentId: string, transform: Partial<MediaTransform>) => void;
  /** 请求缩略图回调 */
  onThumbnailRequest?: (segmentId: string) => void;
  /** 禁用状态 */
  disabled?: boolean;
}

/**
 * MediaSegmentBlock - 媒体片段块组件
 *
 * 在媒体轨道上显示单个媒体片段，包括：
 * - 视频缩略图条或图片缩略图
 * - 片段信息（类型、时长、速率）
 * - 转场指示器
 * - 选中时的调整手柄和操作按钮
 * - 拖拽移动和调整大小
 */
export const MediaSegmentBlock: React.FC<MediaSegmentBlockProps> = ({
  segment,
  source,
  pixelsPerSecond,
  trackHeight,
  isSelected = false,
  isActive = false,
  activeProgress = 0,
  activeTool = 'select',
  onClick,
  onDelete,
  onRestore,
  onMove,
  onResize,
  onTransform,
  onThumbnailRequest,
  disabled = false
}) => {
  const blockRef = useRef<HTMLDivElement>(null);

  // 拖拽状态
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartTimelineStart, setDragStartTimelineStart] = useState(0);
  const [dragStartTimelineEnd, setDragStartTimelineEnd] = useState(0);
  const [dragDeltaX, setDragDeltaX] = useState(0);
  const didDragRef = useRef(false);

  // 计算布局
  const duration = segment.timelineEnd - segment.timelineStart;
  const left = segment.timelineStart * pixelsPerSecond;
  const width = Math.max(MEDIA_CONFIG.MIN_SEGMENT_WIDTH, duration * pixelsPerSecond);

  // 拖拽时的视觉位置
  const visualLeft = dragMode === 'move' ? left + dragDeltaX : dragMode === 'resize-start' ? left + dragDeltaX : left;
  const visualWidth =
    dragMode === 'resize-start' ? Math.max(MEDIA_CONFIG.MIN_SEGMENT_WIDTH, width - dragDeltaX) : dragMode === 'resize-end' ? Math.max(MEDIA_CONFIG.MIN_SEGMENT_WIDTH, width + dragDeltaX) : width;

  // 片段颜色
  const isDeleted = segment.deleted;
  const bgColor = isDeleted ? 'hsla(0, 60%, 50%, 0.15)' : isActive ? 'hsla(160, 70%, 45%, 0.5)' : isSelected ? 'hsla(160, 70%, 45%, 0.4)' : 'hsla(160, 60%, 40%, 0.25)';

  const borderColor = isDeleted ? 'hsla(0, 60%, 50%, 0.5)' : isActive ? 'hsla(160, 70%, 45%, 0.8)' : isSelected ? 'hsla(160, 70%, 45%, 0.7)' : 'hsla(160, 60%, 40%, 0.4)';

  // 媒体类型图标
  const TypeIcon = source?.type === 'video' ? TbVideo : TbPhoto;

  // 边缘检测
  const getEdgeFromPosition = useCallback((clientX: number): 'start' | 'end' | 'center' => {
    if (!blockRef.current) return 'center';
    const rect = blockRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    if (relativeX <= EDGE_WIDTH) return 'start';
    if (relativeX >= rect.width - EDGE_WIDTH) return 'end';
    return 'center';
  }, []);

  // 拖拽开始
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled || activeTool === 'cut' || e.button !== 0) return;

      const edge = getEdgeFromPosition(e.clientX);
      e.stopPropagation();
      e.preventDefault();

      setDragStartX(e.clientX);
      setDragStartTimelineStart(segment.timelineStart);
      setDragStartTimelineEnd(segment.timelineEnd);
      setDragDeltaX(0);
      didDragRef.current = false;

      if (edge === 'center') {
        setDragMode('move');
      } else if (edge === 'start') {
        setDragMode('resize-start');
      } else {
        setDragMode('resize-end');
      }
    },
    [disabled, activeTool, getEdgeFromPosition, segment.timelineStart, segment.timelineEnd]
  );

  // 拖拽过程和结束
  React.useEffect(() => {
    if (dragMode === 'none') return;

    // Use a ref to track current delta for the mouseup handler
    let currentDeltaX = 0;

    const handleMouseMove = (e: MouseEvent): void => {
      didDragRef.current = true;
      currentDeltaX = e.clientX - dragStartX;
      setDragDeltaX(currentDeltaX);
    };

    const handleMouseUp = (): void => {
      if (didDragRef.current) {
        const deltaTime = currentDeltaX / pixelsPerSecond;

        if (dragMode === 'move' && onMove) {
          const newStart = Math.max(0, dragStartTimelineStart + deltaTime);
          onMove(segment.id, newStart);
        } else if (dragMode === 'resize-start' && onResize) {
          const newTime = Math.max(0, dragStartTimelineStart + deltaTime);
          if (newTime < dragStartTimelineEnd - 0.1) {
            onResize(segment.id, 'start', newTime);
          }
        } else if (dragMode === 'resize-end' && onResize) {
          const newTime = dragStartTimelineEnd + deltaTime;
          if (newTime > dragStartTimelineStart + 0.1) {
            onResize(segment.id, 'end', newTime);
          }
        }
      }

      setDragMode('none');
      setDragDeltaX(0);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragMode, dragStartX, dragStartTimelineStart, dragStartTimelineEnd, pixelsPerSecond, segment.id, onMove, onResize]);

  // 光标样式
  const getCursor = useCallback((): string => {
    if (disabled) return 'not-allowed';
    if (activeTool === 'cut') return 'crosshair';
    if (dragMode === 'move') return 'grabbing';
    if (dragMode === 'resize-start' || dragMode === 'resize-end') return 'ew-resize';
    return 'pointer';
  }, [disabled, activeTool, dragMode]);

  // 点击处理
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (activeTool === 'cut') return;
      if (didDragRef.current) {
        didDragRef.current = false;
        return;
      }
      e.stopPropagation();
      onClick?.(segment.id, e);
    },
    [activeTool, onClick, segment.id]
  );

  // 删除处理
  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete?.(segment.id);
    },
    [onDelete, segment.id]
  );

  // 恢复处理
  const handleRestore = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRestore?.(segment.id);
    },
    [onRestore, segment.id]
  );

  // 鼠标移动更新光标
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (disabled || activeTool === 'cut' || dragMode !== 'none') return;
      const block = blockRef.current;
      if (!block) return;

      const edge = getEdgeFromPosition(e.clientX);
      block.style.cursor = edge === 'center' ? 'pointer' : 'ew-resize';
    },
    [disabled, activeTool, dragMode, getEdgeFromPosition]
  );

  // 已删除的片段
  if (isDeleted) {
    return (
      <div
        data-media-block={segment.id}
        className={clsx('absolute flex items-center justify-center border border-dashed rounded', isSelected && 'ring-2 ring-orange-400')}
        style={{
          left,
          width,
          top: DEFAULT_CONFIG.TRACK_GAP / 2,
          height: trackHeight,
          borderColor: 'hsl(0, 60%, 50%)',
          borderRadius: DEFAULT_CONFIG.SEGMENT_BORDER_RADIUS,
          backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 3px, hsla(0, 60%, 50%, 0.15) 3px, hsla(0, 60%, 50%, 0.15) 6px)',
          cursor: 'pointer'
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(segment.id, e);
        }}
      >
        <span className="text-[10px] text-muted-foreground select-none">已删除</span>
        {isSelected && onRestore && (
          <Button size="icon" variant="outline" className="absolute -top-3 right-0 w-6 h-6 rounded-full p-0 bg-background shadow-sm hover:bg-accent z-30" onClick={handleRestore} title="恢复片段">
            <TbRestore className="w-3 h-3" />
          </Button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={blockRef}
      data-media-block={segment.id}
      className={clsx(
        'group absolute flex flex-col overflow-hidden transition-shadow duration-100',
        'border rounded',
        isSelected && 'ring-2 ring-emerald-400 z-20',
        isActive && 'ring-1 ring-emerald-400',
        dragMode !== 'none' && 'opacity-80 shadow-lg z-30'
      )}
      style={{
        left: visualLeft,
        width: visualWidth,
        top: DEFAULT_CONFIG.TRACK_GAP / 2,
        height: trackHeight,
        backgroundColor: bgColor,
        borderColor,
        borderRadius: DEFAULT_CONFIG.SEGMENT_BORDER_RADIUS,
        cursor: getCursor()
      }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
    >
      {/* 播放进度指示条 */}
      {isActive && activeProgress > 0 && <div className="absolute top-0 left-0 bottom-0 bg-emerald-400/30 pointer-events-none z-0" style={{ width: `${Math.min(100, activeProgress * 100)}%` }} />}

      {/* 缩略图条 */}
      <ThumbnailStrip thumbnails={segment.thumbnails} width={visualWidth} height={trackHeight} />

      {/* 转场指示器 */}
      <TransitionIndicator transition={segment.transitionIn} position="in" height={trackHeight} />
      <TransitionIndicator transition={segment.transitionOut} position="out" height={trackHeight} />

      {/* 左右拖拽边缘手柄 */}
      {activeTool === 'select' && !disabled && (
        <>
          <div
            className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l opacity-0 group-hover:opacity-100 bg-emerald-400/40 transition-opacity z-20"
            style={{ cursor: 'ew-resize' }}
            title="拖拽调整开始时间"
          />
          <div
            className="absolute right-0 top-0 bottom-0 w-1.5 rounded-r opacity-0 group-hover:opacity-100 bg-emerald-400/40 transition-opacity z-20"
            style={{ cursor: 'ew-resize' }}
            title="拖拽调整结束时间"
          />
        </>
      )}

      {/* 顶部信息行 */}
      <div className="absolute top-0 left-0 right-0 flex items-center gap-1 px-1.5 pt-0.5 z-10">
        {/* 媒体类型图标 */}
        <div className="shrink-0 w-4 h-4 rounded bg-black/40 flex items-center justify-center">
          <TypeIcon className="w-2.5 h-2.5 text-white" />
        </div>

        {/* 片段标签或时间范围 */}
        <span className="text-[10px] text-white/90 truncate leading-tight flex-1 drop-shadow-sm">
          {segment.label || `${formatSecondsToTime(segment.timelineStart, false)} - ${formatSecondsToTime(segment.timelineEnd, false)}`}
        </span>

        {/* 速率标记 */}
        {segment.playbackRate !== 1.0 && <span className="text-[9px] font-mono shrink-0 bg-black/40 px-1 rounded text-white/90">{segment.playbackRate}x</span>}

        {/* 静音标记 */}
        {segment.muted && <TbPlayerPause className="w-3 h-3 text-white/70" title="已静音" />}
      </div>

      {/* 底部时长信息 */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center px-1.5 pb-0.5 z-10">
        <span className="text-[9px] text-white/70 font-mono drop-shadow-sm">
          {duration.toFixed(1)}s{segment.playbackRate !== 1.0 && ` → ${(duration / segment.playbackRate).toFixed(1)}s`}
        </span>
      </div>

      {/* 选中时的操作按钮 */}
      {isSelected && (
        <div className="absolute -top-3 right-0 flex items-center gap-0.5 z-30">
          {/* 变换按钮 */}
          {onTransform && (
            <Button size="icon" variant="outline" className="w-6 h-6 rounded-full p-0 bg-background shadow-sm hover:bg-accent" title="变换设置">
              <TbArrowsHorizontal className="w-3 h-3" />
            </Button>
          )}

          {/* 旋转按钮 */}
          {onTransform && (
            <Button
              size="icon"
              variant="outline"
              className="w-6 h-6 rounded-full p-0 bg-background shadow-sm hover:bg-accent"
              onClick={(e) => {
                e.stopPropagation();
                onTransform(segment.id, { rotation: (segment.transform.rotation + 90) % 360 });
              }}
              title="旋转 90°"
            >
              <TbRotate className="w-3 h-3" />
            </Button>
          )}

          {/* 删除按钮 */}
          {onDelete && (
            <Button
              size="icon"
              variant="outline"
              className="w-6 h-6 rounded-full p-0 bg-background shadow-sm hover:bg-destructive hover:text-destructive-foreground"
              onClick={handleDelete}
              title="删除片段"
            >
              <TbTrash className="w-3 h-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
