import clsx from 'clsx';
import React, { useCallback } from 'react';
import { TbLoader2, TbPlayerPause, TbPlayerPlay, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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

/** 格式化时长显示 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m${secs.toFixed(0)}s`;
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

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          data-tts-block
          data-tts-index={item.index}
          className={clsx(
            'group absolute top-0 bottom-0 rounded border transition-all cursor-pointer overflow-visible',
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
          <div className="flex items-center justify-center h-full px-1 overflow-hidden">
            {item.status === 'synthesizing' ? (
              <TbLoader2 className="h-3 w-3 animate-spin text-blue-500" />
            ) : item.status === 'completed' ? (
              <div className="flex items-center gap-0.5">
                {isPlaying ? <TbPlayerPause className="h-3 w-3 text-green-600" /> : <TbPlayerPlay className="h-3 w-3 text-green-600" />}
                {width > 40 && item.trimmedDuration != null && <span className="text-[10px] text-green-600">{formatDuration(item.trimmedDuration)}</span>}
              </div>
            ) : item.status === 'error' ? (
              <span className="text-[10px] text-red-500">!</span>
            ) : (
              <span className="text-[10px] text-muted-foreground">#{item.index + 1}</span>
            )}
          </div>

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
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <div className="text-xs space-y-1">
          <div className="font-medium">片段 #{item.index + 1}</div>
          {isOverlapping && <div className="text-orange-600 font-medium">⚠️ 与其他片段时间重叠</div>}
          {item.status === 'completed' && (
            <>
              <div>
                时长: {item.duration != null ? formatDuration(item.duration) : '--'}
                {item.trimmedDuration != null && item.duration != null && item.trimmedDuration !== item.duration && (
                  <span className="text-muted-foreground"> → {formatDuration(item.trimmedDuration)} (去静音)</span>
                )}
              </div>
              <div className="text-muted-foreground">选中后点击右上角{isPlaying ? '停止' : '播放'}</div>
            </>
          )}
          {item.status === 'synthesizing' && <div className="text-blue-500">正在合成...</div>}
          {item.status === 'pending' && <div className="text-muted-foreground">等待合成</div>}
          {item.status === 'error' && <div className="text-red-500">{item.error ?? '合成失败'}</div>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
};
