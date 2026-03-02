import clsx from 'clsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbArrowMerge, TbPencil, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import type { WordTimestamp } from '../../../../MediaPlayer/subtitleDisplayEvent';
import { DEFAULT_CONFIG, TimelineSegment } from '../../types';

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
  /** 删除片段（选中时按钮或快捷键） */
  onDeleteSegment?: (segment: TimelineSegment, trackId: string) => void;
  /** 当前播放时间（秒），用于在活跃片段上显示播放进度 */
  currentTime?: number;
  /** 字级别时间戳数据（卡拉OK高亮用） */
  words?: WordTimestamp[];
}

type DragMode = 'none' | 'move' | 'resize-left' | 'resize-right';

/** 校验字幕块编辑内容：非空、无影响展示的非法字符 */
function validateSegmentText(text: string): { valid: boolean; message?: string } {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { valid: false, message: '内容不能为空' };
  }
  // 控制字符（除换行、制表符外）可能影响解析或展示
  const hasControlChar = /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text);
  if (hasControlChar) {
    return { valid: false, message: '不能包含控制字符' };
  }
  // SRT 时间轴分隔符，出现在文本中可能破坏解析
  if (trimmed.includes('-->')) {
    return { valid: false, message: '不能包含 "-->"' };
  }
  return { valid: true };
}

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
  onMergePrev,
  onDeleteSegment,
  currentTime,
  words
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(segment.text);
  const [validationError, setValidationError] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [dragStartX, setDragStartX] = useState(0);
  const [originalTimes, setOriginalTimes] = useState({ start: 0, end: 0 });
  const [dragHoverTime, setDragHoverTime] = useState<{ startTime?: number; endTime?: number; x: number; y: number } | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const blockRef = useRef<HTMLDivElement>(null);
  /** 刚结束拖拽（时间调整）后的 mouseup 会触发 click，此时不进入编辑 */
  const didDragJustEndRef = useRef(false);
  /** 本次按下后是否发生过拖拽（mousemove），用于区分单击与拖拽结束 */
  const didMoveDuringDragRef = useRef(false);

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

  // 尝试提交编辑：校验通过则保存并退出，否则晃动提示错误
  const tryCommitEdit = useCallback(() => {
    if (!isEditing) return;
    const result = validateSegmentText(editText);
    if (!result.valid) {
      setValidationMessage(result.message ?? '内容无效');
      setValidationError(true);
      return;
    }
    setValidationError(false);
    setValidationMessage(null);
    setIsEditing(false);
    if (editText.trim() !== segment.text) {
      onTextChange?.(segment, trackId, editText.trim());
    }
  }, [isEditing, editText, segment, trackId, onTextChange]);

  // 处理编辑完成（失焦时）
  const handleBlur = useCallback(() => {
    if (!isEditing) return;
    tryCommitEdit();
  }, [isEditing, tryCommitEdit]);

  // 处理键盘事件
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        tryCommitEdit();
      } else if (e.key === 'Escape') {
        setEditText(segment.text);
        setValidationError(false);
        setValidationMessage(null);
        setIsEditing(false);
      }
    },
    [tryCommitEdit, segment.text]
  );

  // 校验失败后一段时间清除晃动状态，便于用户继续编辑
  useEffect(() => {
    if (!validationError) return;
    const t = setTimeout(() => setValidationError(false), 500);
    return () => clearTimeout(t);
  }, [validationError]);

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
      didMoveDuringDragRef.current = false;

      onDragStart?.(segment, trackId);
    },
    [disabled, isEditing, getEdgeFromPosition, segment, trackId, onDragStart]
  );

  // 处理鼠标移动（拖拽中）
  useEffect(() => {
    if (dragMode === 'none') return;

    const handleMouseMove = (e: MouseEvent): void => {
      didMoveDuringDragRef.current = true; // 发生过位移，视为拖拽
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
      if (didMoveDuringDragRef.current) didDragJustEndRef.current = true;
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

  // 处理点击：未选中时通知父组件高亮；已选中时再次单击进入编辑（与双击一致）；刚结束拖拽后的 click 不进入编辑
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.stopPropagation();
      if (didDragJustEndRef.current) {
        didDragJustEndRef.current = false;
        onClick?.(segment, trackId, e);
        return;
      }
      if (isSelected) {
        setIsEditing(true);
        setEditText(segment.text);
        onDoubleClick?.(segment, trackId, e);
        return;
      }
      onClick?.(segment, trackId, e);
    },
    [disabled, isSelected, segment, trackId, onClick, onDoubleClick]
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
          (isSelected || dragMode !== 'none') && 'z-20',
          dragMode !== 'none' && 'opacity-80 shadow-lg',
          validationError && isEditing && 'ring-2 ring-destructive animate-pulse'
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

        {/* 选中时右上角悬浮：编辑、删除 */}
        {!disabled && !isEditing && isSelected && (
          <div className="absolute right-0 top-0 -translate-y-1/2 flex items-center gap-0.5 z-30">
            <Button
              size="icon"
              variant="outline"
              className="w-8 h-8 rounded-full p-0 bg-background shadow-sm hover:bg-accent"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
                setEditText(segment.text);
                onDoubleClick?.(segment, trackId, e);
              }}
              title="编辑"
            >
              <TbPencil />
            </Button>
            <Button
              size="icon"
              variant="outline"
              className="w-8 h-8 rounded-full p-0 bg-background shadow-sm hover:bg-destructive hover:text-destructive-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteSegment?.(segment, trackId);
              }}
              title="删除"
            >
              <TbTrash />
            </Button>
          </div>
        )}

        {/* 活跃片段播放进度指示条 */}
        {isActive &&
          !isEditing &&
          currentTime !== undefined &&
          (() => {
            const duration = segment.endTime - segment.startTime;
            if (duration <= 0) return null;
            const progress = Math.min(1, Math.max(0, (currentTime - segment.startTime) / duration));
            return (
              <div
                className="absolute left-0 top-0 bottom-0 bg-foreground/30 pointer-events-none rounded-l"
                style={{
                  width: `${progress * 100}%`,
                  borderRadius: progress >= 0.99 ? DEFAULT_CONFIG.SEGMENT_BORDER_RADIUS : `${DEFAULT_CONFIG.SEGMENT_BORDER_RADIUS}px 0 0 ${DEFAULT_CONFIG.SEGMENT_BORDER_RADIUS}px`
                }}
              />
            );
          })()}

        {/* 内容区域 */}
        {isEditing ? (
          // 编辑模式：显示完整文字，可编辑；右下角提示回车确定、esc取消
          <div className="absolute inset-0 z-30" style={{ left: -1, right: -1, top: -1, bottom: -1 }} onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            <textarea
              ref={inputRef}
              className={clsx('w-full h-full px-1.5 py-0.5 text-xs leading-tight resize-none box-border', 'bg-background border-2 border-primary rounded outline-none', 'text-foreground')}
              style={{
                minWidth: Math.max(segmentWidth, 150),
                minHeight: trackHeight + 20
              }}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
            />
            <div className={clsx('absolute right-1 -bottom-2 pointer-events-none select-none text-[10px] leading-none', validationError ? 'text-destructive font-medium' : 'text-muted-foreground')}>
              {validationError ? validationMessage : '回车确定，Esc 取消'}
            </div>
          </div>
        ) : (
          // 普通模式：省略显示，活跃时显示卡拉OK字级别高亮
          // 只改变颜色，不改变字体大小/粗细/padding，避免播放时抖动
          <span className={clsx('text-xs text-foreground truncate leading-tight px-1.5', isDeleted && 'line-through')}>
            {isActive && words && words.length > 0 && currentTime !== undefined
              ? words.map((word, i) => {
                  const isWordActive = currentTime >= word.st && currentTime < word.et;
                  const isPast = currentTime >= word.et;
                  return (
                    <span key={i} className={clsx('transition-colors duration-100', isWordActive && 'text-primary', isPast && 'text-foreground', !isPast && !isWordActive && 'text-foreground/40')}>
                      {word.text}
                    </span>
                  );
                })
              : segment.text?.trim()}
          </span>
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
              const format = (t: number): string => {
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
