import React, { useCallback, useMemo, useRef } from 'react';

import type { TTSAudioItem } from '../types';
import { DEFAULT_CONFIG, ViewportState } from '../types';
import { detectOverlappingIndices, TimeRange } from '../utils';
import { TTSAudioBlock } from './TTSAudioBlock';

/** 从 types 导出，供外部使用 */
export type { TTSAudioItem } from '../types';

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
  /** 选中的块索引（null 表示未选中） */
  selectedIndex?: number | null;
  /** 播放TTS音频回调 */
  onPlayAudio?: (index: number, audioPath: string) => void;
  /** 停止播放回调 */
  onStopAudio?: () => void;
  /** 当前正在播放的索引 */
  playingIndex?: number;
  /** 点击块回调（选中） */
  onBlockSelect?: (index: number) => void;
  /** 删除TTS片段回调 */
  onDeleteSegment?: (item: TTSAudioItem) => void;
}

/**
 * TTS音频轨道组件
 * 在时间轴上显示TTS合成的音频片段
 */
export const TTSAudioTrack: React.FC<TTSAudioTrackProps> = ({
  items,
  viewport,
  pixelsPerSecond,
  totalDuration,
  currentTime,
  width,
  selectedIndex = null,
  onPlayAudio,
  onStopAudio,
  playingIndex,
  onBlockSelect,
  onDeleteSegment
}) => {
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

  // 处理点击块（选中）
  const handleBlockClick = useCallback(
    (e: React.MouseEvent, item: TTSAudioItem) => {
      e.stopPropagation();
      onBlockSelect?.(item.index);
    },
    [onBlockSelect]
  );

  // 处理点击播放按钮（仅从浮动按钮触发）
  const handlePlayClick = useCallback(
    (e: React.MouseEvent, item: TTSAudioItem) => {
      e.stopPropagation();
      if (item.status === 'completed' && item.audioPath) {
        if (playingIndex === item.index) {
          onStopAudio?.();
        } else {
          onPlayAudio?.(item.index, item.audioPath);
        }
      }
    },
    [onPlayAudio, onStopAudio, playingIndex]
  );

  // 处理点击删除按钮
  const handleDeleteClick = useCallback(
    (e: React.MouseEvent, item: TTSAudioItem) => {
      e.stopPropagation();
      onDeleteSegment?.(item);
    },
    [onDeleteSegment]
  );

  // 计算当前时间指示线位置
  const currentTimeX = useMemo(() => {
    if (currentTime === undefined || currentTime < 0) return null;
    return currentTime * pixelsPerSecond;
  }, [currentTime, pixelsPerSecond]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className="relative border-border" style={{ height: DEFAULT_CONFIG.TRACK_HEIGHT + DEFAULT_CONFIG.TRACK_GAP, width }}>
      {/* 轨道内容容器（设置总宽度） */}
      <div ref={containerRef} className="relative h-full" style={{ width }}>
        {visibleItems.map((item) => (
          <TTSAudioBlock
            key={item.index}
            item={item}
            pixelsPerSecond={pixelsPerSecond}
            isPlaying={playingIndex === item.index}
            isOverlapping={overlappingIndices.has(item.index)}
            isSelected={selectedIndex === item.index}
            onBlockClick={handleBlockClick}
            onPlayClick={handlePlayClick}
            onDeleteClick={handleDeleteClick}
          />
        ))}

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
