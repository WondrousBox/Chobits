import clsx from 'clsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbChevronDown, TbChevronUp, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import type { ClipSegment, ClipTool } from '../types';
import { DEFAULT_CONFIG } from '../types';
import { formatSecondsToTime } from '../utils';

/** 变速范围 */
const MIN_RATE = 0.25;
const MAX_RATE = 16.0;

/** 拖拽边缘宽度 */
const EDGE_WIDTH = 6;

type DragMode = 'none' | 'resize-left' | 'resize-right';

interface ClipSegmentBlockProps {
  /** 剪辑片段 */
  clip: ClipSegment;
  /** 该片段在播放序列中的起始时间（秒） */
  playStart: number;
  /** 该片段在播放序列中的结束时间（秒） */
  playEnd: number;
  /** 每秒像素数 */
  pixelsPerSecond: number;
  /** 轨道高度 */
  trackHeight: number;
  /** 该片段在排序中的索引（用于显示顺序号） */
  orderIndex?: number;
  /** 总活跃片段数（用于判断是否可以上移/下移） */
  totalActiveClips?: number;
  /** 是否选中 */
  isSelected?: boolean;
  /** 是否为当前正在播放的片段 */
  isActive?: boolean;
  /** 当前播放进度（0~1，仅在 isActive 时有意义） */
  activeProgress?: number;
  /** 点击回调 */
  onClick?: (clipId: string, event: React.MouseEvent) => void;
  /** 删除回调 */
  onDelete?: (clipId: string) => void;
  /** 变速回调 */
  onSpeedChange?: (clipId: string, playbackRate: number) => void;
  /** 上移回调 */
  onMoveUp?: (clipId: string) => void;
  /** 下移回调 */
  onMoveDown?: (clipId: string) => void;
  /** 当前激活的工具（cut 模式下点击事件不拦截，让父级处理切割） */
  activeTool?: ClipTool;
  /** 覆盖模式（叠加在波形上，需要 pointer-events: auto） */
  overlay?: boolean;
}

/**
 * ClipSegmentBlock - 单个剪辑片段块
 *
 * 在剪辑轨道上显示一个片段，包括：
 * - 播放顺序号
 * - 源时间范围标记
 * - 播放速率显示（拖拽左右边缘可调整速度）
 * - 选中时的操作按钮（包括上移/下移）
 * - 播放进度指示
 */
export const ClipSegmentBlock: React.FC<ClipSegmentBlockProps> = ({
  clip,
  playStart,
  playEnd,
  pixelsPerSecond,
  trackHeight,
  orderIndex,
  totalActiveClips = 0,
  isSelected = false,
  isActive = false,
  activeProgress = 0,
  onClick,
  onDelete,
  onSpeedChange,
  onMoveUp,
  onMoveDown,
  activeTool = 'select',
  overlay = false
}) => {
  const blockRef = useRef<HTMLDivElement>(null);

  // 拖拽调速状态
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [dragStartX, setDragStartX] = useState(0);
  const [originalWidth, setOriginalWidth] = useState(0);
  const [dragDeltaX, setDragDeltaX] = useState(0);
  const [dragHoverInfo, setDragHoverInfo] = useState<{ rate: number; x: number; y: number } | null>(null);
  const didDragRef = useRef(false);

  const playDuration = playEnd - playStart;
  const left = playStart * pixelsPerSecond;
  const width = Math.max(DEFAULT_CONFIG.SEGMENT_MIN_WIDTH, playDuration * pixelsPerSecond);
  const sourceDuration = clip.sourceEnd - clip.sourceStart;

  // 拖拽时的视觉宽度和位置
  const visualWidth = dragMode !== 'none' ? Math.max(DEFAULT_CONFIG.SEGMENT_MIN_WIDTH, originalWidth + (dragMode === 'resize-right' ? dragDeltaX : -dragDeltaX)) : width;
  const visualLeft = dragMode === 'resize-left' ? left + width - visualWidth : left;

  // 拖拽时的预览速率
  const previewRate = dragMode !== 'none' ? Math.min(MAX_RATE, Math.max(MIN_RATE, Math.round((sourceDuration / (visualWidth / pixelsPerSecond)) * 100) / 100)) : clip.playbackRate;

  // 片段颜色：根据状态
  const bgColor = isActive ? 'hsla(200, 80%, 55%, 0.6)' : isSelected ? 'hsla(200, 80%, 55%, 0.45)' : 'hsla(200, 70%, 50%, 0.3)';

  const borderColor = isActive ? 'hsla(200, 80%, 55%, 0.8)' : isSelected ? 'hsla(200, 80%, 55%, 0.6)' : 'hsla(200, 70%, 50%, 0.4)';

  // ── 拖拽边缘检测 ──
  const getEdgeFromPosition = useCallback((clientX: number): DragMode => {
    if (!blockRef.current) return 'none';
    const rect = blockRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    if (relativeX <= EDGE_WIDTH) return 'resize-left';
    if (relativeX >= rect.width - EDGE_WIDTH) return 'resize-right';
    return 'none';
  }, []);

  // ── 拖拽开始 ──
  const handleEdgeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (activeTool === 'cut' || !onSpeedChange || e.button !== 0) return;
      const mode = getEdgeFromPosition(e.clientX);
      if (mode === 'none') return; // 不在边缘，不启动拖拽
      e.stopPropagation();
      e.preventDefault();
      setDragMode(mode);
      setDragStartX(e.clientX);
      setOriginalWidth(width);
      setDragDeltaX(0);
      didDragRef.current = false;
    },
    [activeTool, onSpeedChange, getEdgeFromPosition, width]
  );

  // ── 拖拽过程 & 结束 ──
  useEffect(() => {
    if (dragMode === 'none') return;

    const handleMouseMove = (e: MouseEvent): void => {
      didDragRef.current = true;
      const deltaX = e.clientX - dragStartX;
      setDragDeltaX(deltaX);

      // 计算预览速率
      const newWidth = Math.max(DEFAULT_CONFIG.SEGMENT_MIN_WIDTH, originalWidth + (dragMode === 'resize-right' ? deltaX : -deltaX));
      const newPlayDuration = newWidth / pixelsPerSecond;
      const newRate = Math.min(MAX_RATE, Math.max(MIN_RATE, Math.round((sourceDuration / newPlayDuration) * 100) / 100));
      setDragHoverInfo({ rate: newRate, x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = (): void => {
      if (didDragRef.current) {
        // 计算最终速率并提交
        const newWidth = Math.max(DEFAULT_CONFIG.SEGMENT_MIN_WIDTH, originalWidth + (dragMode === 'resize-right' ? dragDeltaX : -dragDeltaX));
        const newPlayDuration = newWidth / pixelsPerSecond;
        const newRate = Math.min(MAX_RATE, Math.max(MIN_RATE, Math.round((sourceDuration / newPlayDuration) * 100) / 100));
        onSpeedChange?.(clip.id, newRate);
      }
      setDragMode('none');
      setDragDeltaX(0);
      setDragHoverInfo(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragMode, dragStartX, dragDeltaX, originalWidth, pixelsPerSecond, sourceDuration, clip.id, onSpeedChange]);

  // ── 边缘光标提示 ──
  const handleBlockMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (activeTool === 'cut' || !onSpeedChange || dragMode !== 'none') return;
      const block = blockRef.current;
      if (!block) return;
      const mode = getEdgeFromPosition(e.clientX);
      block.style.cursor = mode !== 'none' ? 'ew-resize' : 'pointer';
    },
    [activeTool, onSpeedChange, dragMode, getEdgeFromPosition]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // 切割模式下不拦截事件，让父级 ClipTrack 处理切割
      if (activeTool === 'cut') return;
      // 拖拽刚结束，不触发点击
      if (didDragRef.current) {
        didDragRef.current = false;
        return;
      }
      e.stopPropagation();
      onClick?.(clip.id, e);
    },
    [clip.id, onClick, activeTool]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete?.(clip.id);
    },
    [clip.id, onDelete]
  );

  const handleMoveUp = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onMoveUp?.(clip.id);
    },
    [clip.id, onMoveUp]
  );

  const handleMoveDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onMoveDown?.(clip.id);
    },
    [clip.id, onMoveDown]
  );

  // 顺序号（1-indexed）
  const displayOrder = orderIndex !== undefined ? orderIndex + 1 : clip.order + 1;
  const canMoveUp = orderIndex !== undefined && orderIndex > 0;
  const canMoveDown = orderIndex !== undefined && orderIndex < totalActiveClips - 1;

  return (
    <>
      <div
        ref={blockRef}
        data-clip-block={clip.id}
        data-clip-order={displayOrder}
        className={clsx(
          'group absolute flex flex-col transition-shadow duration-100',
          'border rounded overflow-visible',
          isSelected && 'ring-2 ring-blue-500 z-20',
          isActive && 'ring-1 ring-blue-400',
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
          cursor: activeTool === 'cut' ? 'crosshair' : 'pointer',
          // 覆盖模式下，片段块需要接收鼠标事件（父容器可能 pointer-events: none）
          pointerEvents: overlay ? 'auto' : undefined
        }}
        onClick={handleClick}
        onMouseDown={handleEdgeMouseDown}
        onMouseMove={handleBlockMouseMove}
        onMouseLeave={() => {
          if (blockRef.current && dragMode === 'none') {
            blockRef.current.style.cursor = activeTool === 'cut' ? 'crosshair' : 'pointer';
          }
        }}
      >
        {/* 播放进度指示条 */}
        {isActive && activeProgress > 0 && <div className="absolute top-0 left-0 bottom-0 bg-blue-400/20 pointer-events-none z-0" style={{ width: `${Math.min(100, activeProgress * 100)}%` }} />}

        {/* 左右拖拽边缘手柄 */}
        {onSpeedChange && activeTool !== 'cut' && (
          <>
            <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l opacity-0 hover:opacity-100 bg-yellow-400/40 transition-opacity z-20" style={{ cursor: 'ew-resize' }} title="拖拽调整速度" />
            <div
              className="absolute right-0 top-0 bottom-0 w-1.5 rounded-r opacity-0 hover:opacity-100 bg-yellow-400/40 transition-opacity z-20"
              style={{ cursor: 'ew-resize' }}
              title="拖拽调整速度"
            />
          </>
        )}

        {/* 顶部信息行 */}
        <div className="flex items-center gap-1 px-1 pt-0.5 min-w-0 z-10">
          {/* 播放顺序号 */}
          <span
            className={clsx('shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold', isActive ? 'bg-blue-500 text-white' : 'bg-blue-500/60 text-white')}
            title={`播放顺序: 第 ${displayOrder} 个`}
          >
            {displayOrder}
          </span>

          {/* 片段标签或源时间范围 */}
          <span className="text-[10px] text-foreground/80 truncate leading-tight flex-1">
            {clip.label || `${formatSecondsToTime(clip.sourceStart, false)} - ${formatSecondsToTime(clip.sourceEnd, false)}`}
          </span>

          {/* 速率标记（非 1.0x 时显示，拖拽时显示预览速率） */}
          {(dragMode !== 'none' ? previewRate !== 1.0 : clip.playbackRate !== 1.0) && (
            <span className={clsx('text-[9px] font-mono shrink-0', dragMode !== 'none' ? 'text-orange-400' : 'text-yellow-400')}>{dragMode !== 'none' ? previewRate : clip.playbackRate}x</span>
          )}
        </div>

        {/* 底部信息行 */}
        <div className="flex items-center justify-between px-1 mt-auto pb-0.5 min-w-0 z-10">
          <span className="text-[9px] text-foreground/50 font-mono truncate">
            {sourceDuration.toFixed(1)}s
            {(dragMode !== 'none' ? previewRate !== 1.0 : clip.playbackRate !== 1.0) && ` → ${(sourceDuration / (dragMode !== 'none' ? previewRate : clip.playbackRate)).toFixed(1)}s`}
          </span>
        </div>

        {/* 选中时的操作按钮（不再包含变速下拉，变速通过拖拽边缘实现） */}
        {isSelected && (
          <div className="absolute -top-3 right-0 flex items-center gap-0.5 z-30">
            {/* 上移按钮 */}
            {canMoveUp && (
              <Button size="icon" variant="outline" className="w-6 h-6 rounded-full p-0 bg-background shadow-sm hover:bg-accent" onClick={handleMoveUp} title="上移（提前播放）">
                <TbChevronUp className="w-3 h-3" />
              </Button>
            )}

            {/* 下移按钮 */}
            {canMoveDown && (
              <Button size="icon" variant="outline" className="w-6 h-6 rounded-full p-0 bg-background shadow-sm hover:bg-accent" onClick={handleMoveDown} title="下移（延后播放）">
                <TbChevronDown className="w-3 h-3" />
              </Button>
            )}

            {/* 速率显示标记（只显示，不可点击，拖拽边缘调速） */}
            <span className="inline-flex items-center justify-center w-7 h-6 rounded bg-background border shadow-sm text-[10px] font-mono text-foreground/70" title="拖拽块两端边缘可调整速度">
              {clip.playbackRate}x
            </span>

            {/* 删除 */}
            <Button
              size="icon"
              variant="outline"
              className="w-6 h-6 rounded-full p-0 bg-background shadow-sm hover:bg-destructive hover:text-destructive-foreground"
              onClick={handleDelete}
              title="删除片段"
            >
              <TbTrash className="w-3 h-3" />
            </Button>
          </div>
        )}
      </div>

      {/* 拖拽时的速率提示浮层 */}
      {dragHoverInfo && (
        <div className="fixed z-50 pointer-events-none" style={{ left: `${dragHoverInfo.x + 12}px`, top: `${dragHoverInfo.y - 32}px` }}>
          <div className="bg-primary text-primary-foreground px-2 py-1 rounded shadow-lg text-xs font-mono whitespace-nowrap">
            {previewRate}x · {(sourceDuration / previewRate).toFixed(2)}s
          </div>
        </div>
      )}
    </>
  );
};
