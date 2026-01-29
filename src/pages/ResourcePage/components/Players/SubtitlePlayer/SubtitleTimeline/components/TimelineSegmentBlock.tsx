import clsx from 'clsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbArrowMerge } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import { DEFAULT_CONFIG, TimelineSegment } from '../types';

interface TimelineSegmentBlockProps {
  segment: TimelineSegment;
  trackId: string;
  trackColor?: string;
  trackHeight: number;
  pixelsPerSecond: number;
  /** 该片段在轨道中的索引 */
  segmentIndex?: number;
  /** 最大时长限制（秒）- 片段不能超出此时间 */
  maxDuration?: number;
  /** 是否为当前播放的片段 */
  isActive?: boolean;
  /** 是否高亮 */
  isHighlighted?: boolean;
  /** 是否选中 */
  isSelected?: boolean;
  /** 是否与其他片段重叠（时间冲突） */
  isOverlapping?: boolean;
  /** 是否禁用交互 */
  disabled?: boolean;
  /** 点击回调 */
  onClick?: (segment: TimelineSegment, trackId: string, event: React.MouseEvent) => void;
  /** 双击回调（进入编辑模式） */
  onDoubleClick?: (segment: TimelineSegment, trackId: string, event: React.MouseEvent) => void;
  /** 文本变更回调 */
  onTextChange?: (segment: TimelineSegment, trackId: string, newText: string) => void;
  /** 时间变更回调（拖拽移动或调整边缘） */
  onTimeChange?: (segment: TimelineSegment, trackId: string, newStartTime: number, newEndTime: number) => void;
  /** 拖拽开始 */
  onDragStart?: (segment: TimelineSegment, trackId: string) => void;
  /** 拖拽结束 */
  onDragEnd?: (segment: TimelineSegment, trackId: string) => void;
  /** 往前合并（统一回调签名） */
  onMergePrev?: (payload: { trackId: string; segmentIndex: number }) => void;
}

type DragMode = 'none' | 'move' | 'resize-left' | 'resize-right';

/**
 * 时间轴片段块组件
 *
 * 功能：
 * - 文字省略显示，悬停显示完整内容
 * - 双击进入编辑模式，显示完整文字并可编辑
 * - 拖拽整体移动调整开始时间
 * - 拖拽左右边缘调整时长
 */
export const TimelineSegmentBlock: React.FC<TimelineSegmentBlockProps> = ({
  segment,
  trackId,
  trackColor,
  trackHeight,
  pixelsPerSecond,
  maxDuration,
  isActive = false,
  isHighlighted = false,
  isSelected = false,
  isOverlapping = false,
  disabled = false,
  segmentIndex,
  onClick,
  onDoubleClick,
  onTextChange,
  onTimeChange,
  onDragStart,
  onDragEnd,
  onMergePrev
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(segment.text);
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [dragStartX, setDragStartX] = useState(0);
  const [originalTimes, setOriginalTimes] = useState({ start: 0, end: 0 });
  const [dragHoverTime, setDragHoverTime] = useState<{ startTime?: number; endTime?: number; x: number; y: number } | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);

  // 计算位置和尺寸
  const left = segment.startTime * pixelsPerSecond;
  const segmentWidth = Math.max(DEFAULT_CONFIG.SEGMENT_MIN_WIDTH, (segment.endTime - segment.startTime) * pixelsPerSecond);

  // 背景色透明度：非激活时降低不透明度，激活时恢复更实
  const toAlpha = useCallback((color: string | undefined, alpha: number): string => {
    if (!color) return `hsl(var(--primary) / ${alpha})`;

    // Handle hsl(...) → hsla(...)
    const hslMatch = color.match(/^hsl\(([^)]+)\)$/i);
    if (hslMatch) {
      const inner = hslMatch[1];
      const withoutAlpha = inner.split('/')[0].trim();
      return `hsla(${withoutAlpha}, ${alpha})`;
    }

    // Handle hsla(...) by replacing alpha
    const hslaMatch = color.match(/^hsla\(([^)]+)\)$/i);
    if (hslaMatch) {
      const parts = hslaMatch[1].split(',').map((p) => p.trim());
      if (parts.length >= 3) {
        return `hsla(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`;
      }
    }

    return color;
  }, []);

  // 如果存在重叠，使用异常颜色（橙红色）
  const backgroundColor = isOverlapping
    ? 'hsla(15, 85%, 55%, 0.5)' // 橙红色，半透明
    : toAlpha(trackColor, isActive ? 1 : 0.35);

  // 边缘拖拽区域宽度
  const EDGE_WIDTH = 6;

  // 进入编辑模式时聚焦输入框
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // 处理双击进入编辑
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.stopPropagation();

      setIsEditing(true);
      setEditText(segment.text);
      onDoubleClick?.(segment, trackId, e);
    },
    [disabled, segment, trackId, onDoubleClick]
  );

  // 处理编辑完成
  const handleBlur = useCallback(() => {
    if (!isEditing) return;

    setIsEditing(false);
    if (editText !== segment.text) {
      onTextChange?.(segment, trackId, editText);
    }
  }, [isEditing, editText, segment, trackId, onTextChange]);

  // 处理键盘事件
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleBlur();
      } else if (e.key === 'Escape') {
        setEditText(segment.text);
        setIsEditing(false);
      }
    },
    [handleBlur, segment.text]
  );

  // 判断鼠标是否在边缘
  const getEdgeFromPosition = useCallback((clientX: number): DragMode => {
    if (!blockRef.current) return 'move';

    const rect = blockRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;

    if (relativeX <= EDGE_WIDTH) return 'resize-left';
    if (relativeX >= rect.width - EDGE_WIDTH) return 'resize-right';
    return 'move';
  }, []);

  // 处理鼠标按下
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (disabled || isEditing) return;
      if (e.button !== 0) return; // 只处理左键

      e.stopPropagation();
      e.preventDefault();

      const mode = getEdgeFromPosition(e.clientX);
      setDragMode(mode);
      setDragStartX(e.clientX);
      setOriginalTimes({ start: segment.startTime, end: segment.endTime });

      onDragStart?.(segment, trackId);
    },
    [disabled, isEditing, getEdgeFromPosition, segment, trackId, onDragStart]
  );

  // 处理鼠标移动（拖拽中）
  useEffect(() => {
    if (dragMode === 'none') return;

    const handleMouseMove = (e: MouseEvent): void => {
      const deltaX = e.clientX - dragStartX;
      const deltaTime = deltaX / pixelsPerSecond;

      let newStartTime = originalTimes.start;
      let newEndTime = originalTimes.end;
      const minDuration = 0.1; // 最小时长 0.1 秒
      const segmentDuration = originalTimes.end - originalTimes.start;

      switch (dragMode) {
        case 'move':
          // 整体移动
          newStartTime = Math.max(0, originalTimes.start + deltaTime);
          newEndTime = newStartTime + segmentDuration;
          // 限制不超出最大时长
          if (maxDuration !== undefined && newEndTime > maxDuration) {
            newEndTime = maxDuration;
            newStartTime = maxDuration - segmentDuration;
          }
          break;

        case 'resize-left':
          // 调整左边缘（改变开始时间）
          newStartTime = Math.max(0, Math.min(originalTimes.end - minDuration, originalTimes.start + deltaTime));
          break;

        case 'resize-right':
          // 调整右边缘（改变结束时间）
          newEndTime = Math.max(originalTimes.start + minDuration, originalTimes.end + deltaTime);
          // 限制不超出最大时长
          if (maxDuration !== undefined && newEndTime > maxDuration) {
            newEndTime = maxDuration;
          }
          break;
      }

      // 更新悬浮时间提示：拖左侧只显示开始时间，拖右侧只显示结束时间，拖中间显示开始和结束
      if (dragMode === 'move') {
        setDragHoverTime({ startTime: newStartTime, endTime: newEndTime, x: e.clientX, y: e.clientY });
      } else if (dragMode === 'resize-left') {
        setDragHoverTime({ startTime: newStartTime, x: e.clientX, y: e.clientY });
      } else {
        setDragHoverTime({ endTime: newEndTime, x: e.clientX, y: e.clientY });
      }

      onTimeChange?.(segment, trackId, newStartTime, newEndTime);
    };

    const handleMouseUp = (): void => {
      setDragMode('none');
      setDragHoverTime(null);
      onDragEnd?.(segment, trackId);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragMode, dragStartX, pixelsPerSecond, originalTimes, segment, trackId, onTimeChange, onDragEnd, maxDuration]);

  // 更新鼠标样式
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (disabled || isEditing || dragMode !== 'none') return;

      const mode = getEdgeFromPosition(e.clientX);
      const block = blockRef.current;
      if (!block) return;

      switch (mode) {
        case 'resize-left':
        case 'resize-right':
          block.style.cursor = 'ew-resize';
          break;
        default:
          block.style.cursor = 'grab';
      }
    },
    [disabled, isEditing, dragMode, getEdgeFromPosition]
  );

  // 处理点击
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.stopPropagation();
      onClick?.(segment, trackId, e);
    },
    [disabled, segment, trackId, onClick]
  );

  const isDeleted = segment.deleted;

  return (
    <>
      <div
        ref={blockRef}
        data-segment={segment.id}
        className={clsx(
          'group absolute flex items-center transition-shadow duration-100 overflow-visible [container-type:inline-size]',
          'border border-transparent hover:border-foreground/20',
          isDeleted && 'opacity-40',
          isOverlapping && 'border-orange-600 border-2',
          isHighlighted && !isActive && 'ring-1 ring-primary/50',
          isSelected && 'ring-2 ring-blue-500',
          disabled && 'pointer-events-none opacity-60',
          dragMode !== 'none' && 'opacity-80 shadow-lg z-20'
        )}
        style={{
          left,
          width: segmentWidth,
          top: DEFAULT_CONFIG.TRACK_GAP / 2,
          height: trackHeight,
          backgroundColor,
          borderRadius: DEFAULT_CONFIG.SEGMENT_BORDER_RADIUS,
          cursor: isEditing ? 'text' : dragMode !== 'none' ? 'grabbing' : 'grab'
        }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          if (blockRef.current && dragMode === 'none') {
            blockRef.current.style.cursor = 'grab';
          }
        }}
        title={isEditing ? undefined : segment.text}
      >
        {/* 往前合并按钮（悬浮显示，仅当不是第一个片段时） */}
        {!disabled && !isEditing && (segmentIndex ?? 0) > 0 && (
          <div className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-30">
            <Button
              size="icon"
              variant="outline"
              className="w-6 h-6 rounded-full p-0 bg-background shadow-sm hover:bg-accent"
              onClick={(e) => {
                e.stopPropagation();
                if (typeof segmentIndex === 'number') {
                  onMergePrev?.({ trackId, segmentIndex });
                }
              }}
              title="合并到上一条"
            >
              <TbArrowMerge className="-rotate-90" />
            </Button>
          </div>
        )}

        {/* 左边缘拖拽区域指示器 */}
        <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l opacity-0 hover:opacity-100 bg-foreground/20 transition-opacity" style={{ cursor: 'ew-resize' }} />

        {/* 右边缘拖拽区域指示器 */}
        <div className="absolute right-0 top-0 bottom-0 w-1.5 rounded-r opacity-0 hover:opacity-100 bg-foreground/20 transition-opacity" style={{ cursor: 'ew-resize' }} />

        {/* 内容区域 */}
        {isEditing ? (
          // 编辑模式：显示完整文字，可编辑
          <div className="absolute inset-0 z-30" style={{ left: -1, right: -1, top: -1, bottom: -1 }} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            <textarea
              ref={inputRef}
              className={clsx('w-full h-full px-1.5 py-0.5 text-xs leading-tight resize-none', 'bg-background border-2 border-primary rounded outline-none', 'text-foreground')}
              style={{
                minWidth: Math.max(segmentWidth, 150),
                minHeight: trackHeight + 20
              }}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
            />
          </div>
        ) : (
          // 普通模式：省略显示
          <span className={clsx('text-xs text-foreground truncate leading-tight px-1.5', isDeleted && 'line-through')}>{segment.text?.trim()}</span>
        )}

        {/* 右下角显示持续时长（秒） */}
        {!isEditing && (
          <div className="absolute right-1 bottom-0.5 pointer-events-none select-none text-[10px] leading-none text-foreground/70 bg-background/70 rounded px-1 py-0.5 max-w-[calc(100%-4px)] truncate whitespace-nowrap [@container(max-width:48px)]:hidden">
            {(() => {
              const dur = Math.max(0, segment.endTime - segment.startTime);
              const precision = dur >= 10 ? 1 : 2;
              return `${dur.toFixed(precision)}s`;
            })()}
          </div>
        )}
      </div>

      {/* 拖拽时的悬浮时间提示 */}
      {dragHoverTime && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: `${dragHoverTime.x + 10}px`,
            top: `${dragHoverTime.y - 30}px`
          }}
        >
          <div className="bg-primary text-primary-foreground px-2 py-1 rounded shadow-lg text-xs font-mono whitespace-nowrap">
            {(() => {
              const format = (t: number) => {
                const h = Math.floor(t / 3600);
                const m = Math.floor((t % 3600) / 60);
                const s = (t % 60).toFixed(2);
                if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.padStart(5, '0')}`;
                return `${m}:${s.padStart(5, '0')}`;
              };
              const { startTime, endTime } = dragHoverTime;
              if (startTime !== undefined && endTime !== undefined) {
                return `${format(startTime)} — ${format(endTime)}`;
              }
              if (startTime !== undefined) return format(startTime);
              if (endTime !== undefined) return format(endTime);
              return null;
            })()}
          </div>
        </div>
      )}
    </>
  );
};
