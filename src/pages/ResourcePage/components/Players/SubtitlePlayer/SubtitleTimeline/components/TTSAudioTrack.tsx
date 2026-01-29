import clsx from 'clsx';
import React, { useCallback, useMemo, useRef } from 'react';
import { TbLoader2, TbPlayerPause, TbPlayerPlay } from 'react-icons/tb';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { DEFAULT_CONFIG, ViewportState } from '../types';
import { detectOverlappingIndices, TimeRange } from '../utils';

/**
 * TTS音频项状态
 */
export interface TTSAudioItem {
  /** 字幕索引 */
  index: number;
  /** 合成状态 */
  status: 'pending' | 'synthesizing' | 'completed' | 'error';
  /** 音频文件路径 */
  audioPath?: string;
  /** 原始时长（秒） */
  duration?: number;
  /** 去静音后时长（秒） */
  trimmedDuration?: number;
  /** 错误信息 */
  error?: string;
  /** 对应的开始时间（秒）- 来自字幕 */
  startTime: number;
  /** 对应的结束时间（秒）- 来自字幕 */
  endTime: number;
}

interface TTSAudioTrackProps {
  /** TTS音频项列表 */
  items: TTSAudioItem[];
  /** 视口状态 */
  viewport: ViewportState;
  /** 总时长 */
  totalDuration: number;
  /** 每秒像素数 */
  pixelsPerSecond: number;
  /** 轨道总宽度 */
  width: number;
  /** 当前播放时间 */
  currentTime?: number;
  /** 轨道标签宽度 */
  trackLabelWidth?: number;
  /** 是否显示轨道标签 */
  showTrackLabel?: boolean;
  /** 播放TTS音频回调 */
  onPlayAudio?: (index: number, audioPath: string) => void;
  /** 停止播放回调 */
  onStopAudio?: () => void;
  /** 当前正在播放的索引 */
  playingIndex?: number;
}

/**
 * TTS音频轨道组件
 * 在时间轴上显示TTS合成的音频片段
 */
export const TTSAudioTrack: React.FC<TTSAudioTrackProps> = ({ items, viewport, pixelsPerSecond, totalDuration, currentTime, width, onPlayAudio, onStopAudio, playingIndex }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // 检测重叠的音频项（基于音频实际时长，而不是字幕时间戳）
  const overlappingIndices = useMemo(() => {
    const ranges: TimeRange[] = items.map((item) => {
      // 使用音频实际时长来计算结束时间
      // 优先使用 trimmedDuration（去静音后的时长），其次使用 duration，最后回退到字幕时间戳
      const audioDuration = item.trimmedDuration ?? item.duration ?? item.endTime - item.startTime;
      return {
        startTime: item.startTime,
        endTime: item.startTime + audioDuration,
        index: item.index
      };
    });
    return detectOverlappingIndices(ranges);
  }, [items]);

  // 过滤出在视口范围内的项目（带缓冲区）
  const visibleItems = useMemo(() => {
    const buffer = 2; // 缓冲区（秒）
    return items.filter((item) => {
      return item.endTime >= viewport.startTime - buffer && item.startTime <= viewport.endTime + buffer;
    });
  }, [items, viewport]);

  // 计算项目位置和宽度
  const getItemStyle = useCallback(
    (item: TTSAudioItem) => {
      const left = item.startTime * pixelsPerSecond;
      // 使用去静音后的时长，如果有的话
      const duration = item.trimmedDuration ?? item.duration ?? item.endTime - item.startTime;
      const itemWidth = Math.max(duration * pixelsPerSecond, DEFAULT_CONFIG.SEGMENT_MIN_WIDTH);
      return { left, width: itemWidth };
    },
    [pixelsPerSecond]
  );

  // 获取状态颜色（考虑重叠状态）
  const getStatusColor = (status: TTSAudioItem['status'], isOverlapping: boolean) => {
    // 如果存在重叠，使用异常颜色
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
  };

  // 处理点击播放
  const handlePlayClick = useCallback(
    (e: React.MouseEvent, item: TTSAudioItem) => {
      e.stopPropagation();
      if (item.status === 'completed' && item.audioPath) {
        if (playingIndex === item.index) {
          // 正在播放，停止
          onStopAudio?.();
        } else {
          // 开始播放
          onPlayAudio?.(item.index, item.audioPath);
        }
      }
    },
    [onPlayAudio, onStopAudio, playingIndex]
  );

  // 格式化时长
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m${secs.toFixed(0)}s`;
  };

  // 计算当前时间指示线位置
  const currentTimeX = useMemo(() => {
    if (currentTime === undefined || currentTime < 0) return null;
    return currentTime * pixelsPerSecond;
  }, [currentTime, pixelsPerSecond]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="relative border-b bg-muted/5" style={{ height: DEFAULT_CONFIG.TRACK_HEIGHT }}>
      {/* 轨道内容容器（设置总宽度） */}
      <div ref={containerRef} className="relative h-full" style={{ width }}>
        {visibleItems.map((item) => {
          const { left, width: itemWidth } = getItemStyle(item);
          const isPlaying = playingIndex === item.index;
          const isOverlapping = overlappingIndices.has(item.index);

          return (
            <Tooltip key={item.index}>
              <TooltipTrigger asChild>
                <div
                  className={clsx('absolute top-1 bottom-1 rounded border transition-all cursor-pointer', getStatusColor(item.status, isOverlapping), isPlaying && 'ring-2 ring-primary')}
                  style={{
                    left,
                    width: itemWidth,
                    minWidth: DEFAULT_CONFIG.SEGMENT_MIN_WIDTH
                  }}
                  onClick={(e) => handlePlayClick(e, item)}
                >
                  {/* 内容 */}
                  <div className="flex items-center justify-center h-full px-1 overflow-hidden">
                    {item.status === 'synthesizing' ? (
                      <TbLoader2 className="h-3 w-3 animate-spin text-blue-500" />
                    ) : item.status === 'completed' ? (
                      <div className="flex items-center gap-0.5">
                        {isPlaying ? <TbPlayerPause className="h-3 w-3 text-green-600" /> : <TbPlayerPlay className="h-3 w-3 text-green-600" />}
                        {itemWidth > 40 && item.trimmedDuration && <span className="text-[10px] text-green-600">{formatDuration(item.trimmedDuration)}</span>}
                      </div>
                    ) : item.status === 'error' ? (
                      <span className="text-[10px] text-red-500">!</span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">#{item.index + 1}</span>
                    )}
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <div className="text-xs space-y-1">
                  <div className="font-medium">片段 #{item.index + 1}</div>
                  {isOverlapping && <div className="text-orange-600 font-medium">⚠️ 与其他片段时间重叠</div>}
                  {item.status === 'completed' && (
                    <>
                      <div>
                        时长: {item.duration ? formatDuration(item.duration) : '--'}
                        {item.trimmedDuration && item.trimmedDuration !== item.duration && <span className="text-muted-foreground"> → {formatDuration(item.trimmedDuration)} (去静音)</span>}
                      </div>
                      <div className="text-muted-foreground">点击{isPlaying ? '停止' : '播放'}</div>
                    </>
                  )}
                  {item.status === 'synthesizing' && <div className="text-blue-500">正在合成...</div>}
                  {item.status === 'pending' && <div className="text-muted-foreground">等待合成</div>}
                  {item.status === 'error' && <div className="text-red-500">{item.error || '合成失败'}</div>}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}

        {/* 当前时间指示线 */}
        {
          // currentTimeX !== null && <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none" style={{ left: currentTimeX }} />
        }

        {/* 音频结束截止线 */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-orange-500 z-10 pointer-events-none" style={{ left: totalDuration * pixelsPerSecond }} title={`音频结束: ${totalDuration.toFixed(2)}s`} />
      </div>
    </div>
  );
};
