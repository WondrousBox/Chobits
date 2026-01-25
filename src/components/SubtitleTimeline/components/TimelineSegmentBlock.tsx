import clsx from 'clsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { DEFAULT_CONFIG, TimelineSegment } from '../types';

interface TimelineSegmentBlockProps {
  segment: TimelineSegment;
  trackId: string;
  trackColor?: string;
  trackHeight: number;
  pixelsPerSecond: number;
  /** 是否为当前播放的片段 */
  isActive?: boolean;
  /** 是否高亮 */
  isHighlighted?: boolean;
  /** 是否选中 */
  isSelected?: boolean;
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
  isActive = false,
  isHighlighted = false,
  isSelected = false,
  disabled = false,
  onClick,
  onDoubleClick,
  onTextChange,
  onTimeChange,
  onDragStart,
  onDragEnd
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(segment.text);
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [dragStartX, setDragStartX] = useState(0);
  const [originalTimes, setOriginalTimes] = useState({ start: 0, end: 0 });

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);

  // 计算位置和尺寸
  const left = segment.startTime * pixelsPerSecond;
  const segmentWidth = Math.max(DEFAULT_CONFIG.SEGMENT_MIN_WIDTH, (segment.endTime - segment.startTime) * pixelsPerSecond);

  // 边缘拖拽区域宽度
  const EDGE_WIDTH = 6;

  // 进入编辑模式时聚焦输入框
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // 当 segment.text 变化时更新编辑文本
  useEffect(() => {
    if (!isEditing) {
      setEditText(segment.text);
    }
  }, [segment.text, isEditing]);

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
  const getEdgeFromPosition = useCallback(
    (clientX: number): DragMode => {
      if (!blockRef.current) return 'move';

      const rect = blockRef.current.getBoundingClientRect();
      const relativeX = clientX - rect.left;

      if (relativeX <= EDGE_WIDTH) return 'resize-left';
      if (relativeX >= rect.width - EDGE_WIDTH) return 'resize-right';
      return 'move';
    },
    []
  );

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

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartX;
      const deltaTime = deltaX / pixelsPerSecond;

      let newStartTime = originalTimes.start;
      let newEndTime = originalTimes.end;
      const minDuration = 0.1; // 最小时长 0.1 秒

      switch (dragMode) {
        case 'move':
          // 整体移动
          newStartTime = Math.max(0, originalTimes.start + deltaTime);
          newEndTime = newStartTime + (originalTimes.end - originalTimes.start);
          break;

        case 'resize-left':
          // 调整左边缘（改变开始时间）
          newStartTime = Math.max(0, Math.min(originalTimes.end - minDuration, originalTimes.start + deltaTime));
          break;

        case 'resize-right':
          // 调整右边缘（改变结束时间）
          newEndTime = Math.max(originalTimes.start + minDuration, originalTimes.end + deltaTime);
          break;
      }

      onTimeChange?.(segment, trackId, newStartTime, newEndTime);
    };

    const handleMouseUp = () => {
      setDragMode('none');
      onDragEnd?.(segment, trackId);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragMode, dragStartX, pixelsPerSecond, originalTimes, segment, trackId, onTimeChange, onDragEnd]);

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
    <div
      ref={blockRef}
      data-segment={segment.id}
      className={clsx(
        'absolute flex items-center transition-shadow duration-100 overflow-visible',
        'border border-transparent hover:border-foreground/20',
        isDeleted && 'opacity-40',
        isActive && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
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
        backgroundColor: trackColor ?? 'hsl(var(--primary) / 0.2)',
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
      {/* 左边缘拖拽区域指示器 */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l opacity-0 hover:opacity-100 bg-foreground/20 transition-opacity"
        style={{ cursor: 'ew-resize' }}
      />

      {/* 右边缘拖拽区域指示器 */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1.5 rounded-r opacity-0 hover:opacity-100 bg-foreground/20 transition-opacity"
        style={{ cursor: 'ew-resize' }}
      />

      {/* 内容区域 */}
      {isEditing ? (
        // 编辑模式：显示完整文字，可编辑
        <div
          className="absolute inset-0 z-30"
          style={{ left: -1, right: -1, top: -1, bottom: -1 }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <textarea
            ref={inputRef}
            className={clsx(
              'w-full h-full px-1.5 py-0.5 text-xs leading-tight resize-none',
              'bg-background border-2 border-primary rounded outline-none',
              'text-foreground'
            )}
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
    </div>
  );
};
