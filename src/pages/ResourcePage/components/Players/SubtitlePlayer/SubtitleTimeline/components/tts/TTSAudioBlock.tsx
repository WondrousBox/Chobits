import clsx from 'clsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbLoader2, TbPencil, TbPlayerPause, TbPlayerPlay, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import { DEFAULT_CONFIG, type TTSAudioItem } from '../../types';

type DragMode = 'none' | 'move' | 'resize-left' | 'resize-right';

export interface TTSAudioBlockProps {
  /** TTS 音频项 */
  item: TTSAudioItem;
  /** 每秒像素数 */
  pixelsPerSecond: number;
  /** 最大时长（秒），用于拖拽边界 */
  maxDuration?: number;
  /** 是否正在播放 */
  isPlaying?: boolean;
  /** 是否与其他片段重叠 */
  isOverlapping?: boolean;
  /** 是否选中（选中时显示浮动播放/删除按钮） */
  isSelected?: boolean;
  /** 点击块回调（选中，不直接播放） */
  onBlockClick?: (e: React.MouseEvent, item: TTSAudioItem) => void;
  /** 点击播放按钮回调 */
  onPlayClick?: (e: React.MouseEvent, item: TTSAudioItem) => void;
  /** 点击删除按钮回调 */
  onDeleteClick?: (e: React.MouseEvent, item: TTSAudioItem) => void;
  /** 时间变更回调（拖拽移动或边缘调整后） */
  onTimeChange?: (newStartTime: number, newEndTime: number) => void;
  /** 文本变更回调（内联编辑后） */
  onTextChange?: (newText: string) => void;
  /** 双击块回调（编辑文本） */
  onDoubleClick?: (e: React.MouseEvent, item: TTSAudioItem) => void;
}

/** 根据状态与重叠返回块样式类名 */
function getStatusColor(status: TTSAudioItem['status'], isOverlapping: boolean): string {
  if (isOverlapping) {
    return 'bg-orange-500/50 border-orange-600 border-2';
  }
  switch (status) {
    case 'completed':
      return 'bg-green-500/20 border-green-500/50 hover:bg-green-500/30';
    case 'synthesizing':
      return 'bg-blue-500/20 border-blue-500/50';
    case 'error':
      return 'bg-red-500/20 border-red-500/50';
    case 'pending':
    default:
      return 'bg-muted/30 border-border/50';
  }
}

const EDGE_WIDTH = 6;

/**
 * TTS 音频块组件
 * 支持拖拽移动与左右边缘调整时间（与字幕块一致）
 */
export const TTSAudioBlock: React.FC<TTSAudioBlockProps> = ({
  item,
  pixelsPerSecond,
  maxDuration,
  isPlaying = false,
  isOverlapping = false,
  isSelected = false,
  onBlockClick,
  onPlayClick,
  onDeleteClick,
  onTimeChange,
  onTextChange,
  onDoubleClick
}) => {
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [dragStartX, setDragStartX] = useState(0);
  const [originalTimes, setOriginalTimes] = useState({ start: 0, end: 0 });
  const [dragHoverTime, setDragHoverTime] = useState<{ startTime?: number; endTime?: number; x: number; y: number } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item.text ?? '');

  const blockRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const didDragJustEndRef = useRef(false);
  const didMoveDuringDragRef = useRef(false);

  const canDragResize = !!onTimeChange;
  const left = item.startTime * pixelsPerSecond;
  const slotDuration = item.endTime - item.startTime;
  const width = Math.max(slotDuration * pixelsPerSecond, DEFAULT_CONFIG.SEGMENT_MIN_WIDTH);
  const audioDuration = item.trimmedDuration ?? item.duration ?? slotDuration;
  // 块展示时长与音频时长不一致时，播放倍率 = 实际音频时长 / 块时长（>1 需加速，<1 需减速）
  const playbackRate = slotDuration > 0 && (item.trimmedDuration != null || item.duration != null) ? (item.trimmedDuration ?? item.duration ?? 0) / slotDuration : null;

  // 进入编辑模式时聚焦输入框
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // 同步外部文本变化
  useEffect(() => {
    if (!isEditing) {
      setEditText(item.text ?? '');
    }
  }, [item.text, isEditing]);

  // 提交编辑：保存文本并退出编辑模式
  const tryCommitEdit = useCallback(() => {
    if (!isEditing) return;
    setIsEditing(false);
    const trimmedText = editText.trim();
    if (trimmedText && trimmedText !== item.text) {
      onTextChange?.(trimmedText);
    }
  }, [isEditing, editText, item.text, onTextChange]);

  // 处理编辑完成（失焦时）
  const handleEditBlur = useCallback(() => {
    if (!isEditing) return;
    tryCommitEdit();
  }, [isEditing, tryCommitEdit]);

  // 处理键盘事件
  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        tryCommitEdit();
      } else if (e.key === 'Escape') {
        setEditText(item.text ?? '');
        setIsEditing(false);
      }
    },
    [tryCommitEdit, item.text]
  );

  const getEdgeFromPosition = useCallback((clientX: number): DragMode => {
    if (!blockRef.current) return 'move';
    const rect = blockRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    if (relativeX <= EDGE_WIDTH) return 'resize-left';
    if (relativeX >= rect.width - EDGE_WIDTH) return 'resize-right';
    return 'move';
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!canDragResize || e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      const mode = getEdgeFromPosition(e.clientX);
      setDragMode(mode);
      setDragStartX(e.clientX);
      setOriginalTimes({ start: item.startTime, end: item.endTime });
      didMoveDuringDragRef.current = false;
    },
    [canDragResize, getEdgeFromPosition, item.startTime, item.endTime]
  );

  useEffect(() => {
    if (dragMode === 'none') return;

    const handleMouseMove = (e: MouseEvent): void => {
      didMoveDuringDragRef.current = true;
      const deltaX = e.clientX - dragStartX;
      const deltaTime = deltaX / pixelsPerSecond;

      let newStartTime = originalTimes.start;
      let newEndTime = originalTimes.end;
      const minDuration = 0.1;
      const segmentDuration = originalTimes.end - originalTimes.start;

      switch (dragMode) {
        case 'move':
          newStartTime = Math.max(0, originalTimes.start + deltaTime);
          newEndTime = newStartTime + segmentDuration;
          if (maxDuration !== undefined && newEndTime > maxDuration) {
            newEndTime = maxDuration;
            newStartTime = maxDuration - segmentDuration;
          }
          break;
        case 'resize-left':
          newStartTime = Math.max(0, Math.min(originalTimes.end - minDuration, originalTimes.start + deltaTime));
          break;
        case 'resize-right':
          newEndTime = Math.max(originalTimes.start + minDuration, originalTimes.end + deltaTime);
          if (maxDuration !== undefined && newEndTime > maxDuration) newEndTime = maxDuration;
          break;
      }

      if (dragMode === 'move') {
        setDragHoverTime({ startTime: newStartTime, endTime: newEndTime, x: e.clientX, y: e.clientY });
      } else if (dragMode === 'resize-left') {
        setDragHoverTime({ startTime: newStartTime, x: e.clientX, y: e.clientY });
      } else {
        setDragHoverTime({ endTime: newEndTime, x: e.clientX, y: e.clientY });
      }

      onTimeChange?.(newStartTime, newEndTime);
    };

    const handleMouseUp = (): void => {
      if (didMoveDuringDragRef.current) didDragJustEndRef.current = true;
      setDragMode('none');
      setDragHoverTime(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragMode, dragStartX, pixelsPerSecond, originalTimes, maxDuration, onTimeChange]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!canDragResize || dragMode !== 'none') return;
      const mode = getEdgeFromPosition(e.clientX);
      const block = blockRef.current;
      if (!block) return;
      if (mode === 'resize-left' || mode === 'resize-right') {
        block.style.cursor = 'ew-resize';
      } else {
        block.style.cursor = 'grab';
      }
    },
    [canDragResize, dragMode, getEdgeFromPosition]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (didDragJustEndRef.current) {
        didDragJustEndRef.current = false;
        onBlockClick?.(e, item);
        return;
      }
      // 已选中时再次点击进入编辑模式
      if (isSelected && onTextChange) {
        setIsEditing(true);
        setEditText(item.text ?? '');
        return;
      }
      onBlockClick?.(e, item);
    },
    [item, isSelected, onTextChange, onBlockClick]
  );

  const pillClass = 'pointer-events-none select-none text-[10px] leading-none text-foreground/70 bg-background/70 rounded px-1 py-0.5';

  return (
    <>
      <div
        ref={blockRef}
        data-tts-block
        data-tts-index={item.index}
        className={clsx(
          'group absolute top-0 bottom-0 rounded border overflow-visible [container-type:inline-size]',
          canDragResize && 'cursor-grab hover:border-foreground/20',
          !canDragResize && 'cursor-pointer',
          getStatusColor(item.status, isOverlapping),
          isPlaying && 'ring-2 ring-primary',
          isSelected && 'ring-2 ring-blue-500',
          (isSelected || dragMode !== 'none') && 'z-20',
          dragMode !== 'none' && 'opacity-80 shadow-lg'
        )}
        style={{
          left,
          width,
          minWidth: DEFAULT_CONFIG.SEGMENT_MIN_WIDTH,
          cursor: canDragResize ? (dragMode !== 'none' ? 'grabbing' : 'grab') : undefined
        }}
        onClick={handleClick}
        onDoubleClick={
          onDoubleClick
            ? (e) => {
              e.stopPropagation();
              onDoubleClick(e, item);
            }
            : undefined
        }
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          if (blockRef.current && dragMode === 'none') blockRef.current.style.cursor = canDragResize ? 'grab' : 'pointer';
        }}
      >
        {isOverlapping && <div className={clsx('absolute left-1 top-0.5 z-10 text-orange-600', pillClass)}>⚠️</div>}

        <div className={clsx('absolute left-1 top-1/2 -translate-y-1/2', pillClass, '[@container(max-width:48px)]:hidden')}>#{item.index + 1}</div>

        {canDragResize && (
          <>
            <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l opacity-0 hover:opacity-100 bg-foreground/20 transition-opacity" style={{ cursor: 'ew-resize' }} />
            <div className="absolute right-0 top-0 bottom-0 w-1.5 rounded-r opacity-0 hover:opacity-100 bg-foreground/20 transition-opacity" style={{ cursor: 'ew-resize' }} />
          </>
        )}

        <div className="flex items-center justify-center h-full px-1 overflow-hidden">
          {isEditing ? (
            // 编辑模式：显示 textarea
            <div
              className="absolute inset-0 z-30 bg-background border-2 border-primary rounded"
              style={{ left: -1, right: -1, top: -1, bottom: -1, minWidth: Math.max(width, 150), minHeight: 60 }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <textarea
                ref={inputRef}
                className="w-full h-full p-1.5 text-xs leading-tight resize-none box-border bg-transparent outline-none text-foreground"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onBlur={handleEditBlur}
                onKeyDown={handleEditKeyDown}
                placeholder="输入文本..."
              />
            </div>
          ) : item.status === 'synthesizing' ? (
            <div className="flex items-center gap-1">
              <TbLoader2 className="h-3 w-3 shrink-0 animate-spin text-blue-500" />
              <span className="text-[10px] text-blue-600 truncate [@container(max-width:56px)]:hidden">合成中</span>
            </div>
          ) : item.status === 'completed' ? null : item.status === 'error' ? (
            <span className="text-[10px] text-red-500">!</span>
          ) : (
            <span className={clsx('text-[10px]', pillClass)}>等待</span>
          )}
        </div>

        {item.status === 'completed' && audioDuration != null && (
          <div className={clsx('absolute right-1 bottom-0.5 max-w-[calc(100%-4px)] truncate whitespace-nowrap [@container(max-width:48px)]:hidden', pillClass)}>
            {(() => {
              const actualDur = Math.max(0, audioDuration);
              const slotDur = Math.max(0, slotDuration);
              const precision = (t: number) => (t >= 10 ? 1 : 2);
              const hasTrimmed = item.trimmedDuration != null && item.duration != null && item.trimmedDuration !== item.duration;
              const showRate = playbackRate != null && Math.abs(playbackRate - 1) > 0.02;
              if (showRate) {
                const actualStr = hasTrimmed ? `${actualDur.toFixed(precision(actualDur))}s 去静音` : `${actualDur.toFixed(precision(actualDur))}s`;
                const rateStr = ` · x${playbackRate >= 10 ? playbackRate.toFixed(0) : playbackRate.toFixed(1)}`;
                return `${actualStr} → ${slotDur.toFixed(precision(slotDur))}s${rateStr}`;
              }
              const base = hasTrimmed ? `${actualDur.toFixed(precision(actualDur))}s 去静音` : `${actualDur.toFixed(precision(actualDur))}s`;
              return base;
            })()}
          </div>
        )}

        {item.status === 'error' && (item.error ?? '合成失败') && (
          <div className={clsx('absolute left-1 bottom-0.5 max-w-[calc(100%-4px)] truncate whitespace-nowrap text-red-600', pillClass)} title={item.error ?? '合成失败'}>
            {item.error ?? '合成失败'}
          </div>
        )}

        {isSelected && (
          <div className="absolute right-0 top-0 -translate-y-1/2 flex items-center gap-0.5 z-30">
            {item.status === 'completed' && item.audioPath && (
              <Button
                size="icon"
                variant="outline"
                className="w-8 h-8 rounded-full p-0 bg-background shadow-sm hover:bg-accent"
                onClick={(e) => {
                  e.stopPropagation();
                  onPlayClick?.(e, item);
                }}
                title={isPlaying ? '停止' : '播放'}
              >
                {isPlaying ? <TbPlayerPause className="h-4 w-4" /> : <TbPlayerPlay className="h-4 w-4" />}
              </Button>
            )}
            <Button
              size="icon"
              variant="outline"
              className="w-8 h-8 rounded-full p-0 bg-background shadow-sm hover:bg-destructive hover:text-destructive-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteClick?.(e, item);
              }}
              title="删除"
            >
              <TbTrash />
            </Button>
          </div>
        )}
      </div>

      {dragHoverTime && (
        <div className="fixed z-50 pointer-events-none" style={{ left: `${dragHoverTime.x + 10}px`, top: `${dragHoverTime.y - 30}px` }}>
          <div className="bg-primary text-primary-foreground px-2 py-1 rounded shadow-lg text-xs font-mono whitespace-nowrap">
            {(() => {
              const format = (t: number): string => {
                const m = Math.floor(t / 60);
                const s = (t % 60).toFixed(2);
                return `${m}:${s.padStart(5, '0')}`;
              };
              const { startTime, endTime } = dragHoverTime;
              if (startTime !== undefined && endTime !== undefined) return `${format(startTime)} — ${format(endTime)}`;
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
