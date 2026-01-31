import clsx from 'clsx';
import React, { useCallback } from 'react';
import { TbLoader2, TbPlayerPause, TbPlayerPlay, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import { DEFAULT_CONFIG, type TTSAudioItem } from '../types';

export interface TTSAudioBlockProps {
  /** TTS 音频项 */
  item: TTSAudioItem;
  /** 每秒像素数 */
  pixelsPerSecond: number;
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

/**
 * TTS 音频块组件
 * 单个 TTS 音频片段在时间轴上的展示与交互，与 TimelineSegmentBlock 对应
 */
export const TTSAudioBlock: React.FC<TTSAudioBlockProps> = ({ item, pixelsPerSecond, isPlaying = false, isOverlapping = false, isSelected = false, onBlockClick, onPlayClick, onDeleteClick }) => {
  const left = item.startTime * pixelsPerSecond;
  const duration = item.trimmedDuration ?? item.duration ?? item.endTime - item.startTime;
  const width = Math.max(duration * pixelsPerSecond, DEFAULT_CONFIG.SEGMENT_MIN_WIDTH);

  const handleBlockClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onBlockClick?.(e, item);
    },
    [item, onBlockClick]
  );

  const pillClass = 'pointer-events-none select-none text-[10px] leading-none text-foreground/70 bg-background/70 rounded px-1 py-0.5';

  return (
    <div
      data-tts-block
      data-tts-index={item.index}
      className={clsx(
        'group absolute top-0 bottom-0 rounded border transition-all cursor-pointer overflow-visible [container-type:inline-size]',
        getStatusColor(item.status, isOverlapping),
        isPlaying && 'ring-2 ring-primary',
        isSelected && 'ring-2 ring-blue-500'
      )}
      style={{
        left,
        width,
        minWidth: DEFAULT_CONFIG.SEGMENT_MIN_WIDTH
      }}
      onClick={handleBlockClick}
    >
      {/* 左上角：重叠警告 */}
      {isOverlapping && <div className={clsx('absolute left-1 top-0.5 z-10 text-orange-600', pillClass)}>⚠️</div>}

      {/* 左侧上下居中：片段序号 */}
      <div className={clsx('absolute left-1 top-1/2 -translate-y-1/2', pillClass, '[@container(max-width:48px)]:hidden')}>#{item.index + 1}</div>

      <div className="flex items-center justify-center h-full px-1 overflow-hidden">
        {item.status === 'synthesizing' ? (
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

      {/* 右下角：持续时长（含去静音时标注） */}
      {item.status === 'completed' && duration != null && (
        <div className={clsx('absolute right-1 bottom-0.5 max-w-[calc(100%-4px)] truncate whitespace-nowrap [@container(max-width:48px)]:hidden', pillClass)}>
          {(() => {
            const dur = Math.max(0, duration);
            const precision = dur >= 10 ? 1 : 2;
            const hasTrimmed = item.trimmedDuration != null && item.duration != null && item.trimmedDuration !== item.duration;
            return hasTrimmed ? `${dur.toFixed(precision)}s 去静音` : `${dur.toFixed(precision)}s`;
          })()}
        </div>
      )}

      {/* 左下角：错误信息 */}
      {item.status === 'error' && (item.error ?? '合成失败') && (
        <div className={clsx('absolute left-1 bottom-0.5 max-w-[calc(100%-4px)] truncate whitespace-nowrap text-red-600', pillClass)} title={item.error ?? '合成失败'}>
          {item.error ?? '合成失败'}
        </div>
      )}

      {/* 选中时右上角悬浮：播放、删除 */}
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
  );
};
