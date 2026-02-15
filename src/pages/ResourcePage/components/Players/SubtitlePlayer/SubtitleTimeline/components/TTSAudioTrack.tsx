import clsx from 'clsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { TTSAudioItem } from '../types';
import { DEFAULT_CONFIG, ViewportState } from '../types';
import { detectOverlappingIndices, TimeRange } from '../utils';
import type { WaveformData } from '../utils/ttsWaveformLoader';
import { getTTSBlockWaveform } from '../utils/ttsWaveformLoader';
import { TTSAudioBlock } from './TTSAudioBlock';

/** 从 types 导出，供外部使用 */
export type { TTSAudioItem } from '../types';

interface TTSAudioTrackProps {
  /** TTS 轨道 ID（如 main、zh-CN） */
  ttsTrackId?: string;
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
  /** 块时间变更回调（拖拽移动或边缘调整后） */
  onTimeChange?: (index: number, newStartTime: number, newEndTime: number) => void;
  /** 最大时长（秒），用于拖拽边界 */
  maxDuration?: number;
  /** 禁用交互（轨道未启用时） */
  disabled?: boolean;
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
  onDeleteSegment,
  onTimeChange,
  maxDuration,
  disabled = false
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [waveformMap, setWaveformMap] = useState<Record<string, WaveformData>>({});

  const trackHeight = DEFAULT_CONFIG.TRACK_HEIGHT + DEFAULT_CONFIG.TRACK_GAP;

  // 检测重叠的音频项（基于块的 startTime/endTime 时间槽）
  const overlappingIndices = useMemo(() => {
    const ranges: TimeRange[] = items.map((item) => ({
      startTime: item.startTime,
      endTime: item.endTime,
      index: item.index
    }));
    return detectOverlappingIndices(ranges);
  }, [items]);

  // 过滤出在视口范围内的项目（带缓冲区）
  const visibleItems = useMemo(() => {
    const buffer = 2;
    return items.filter((item) => {
      return item.endTime >= viewport.startTime - buffer && item.startTime <= viewport.endTime + buffer;
    });
  }, [items, viewport]);

  // 为可见且已完成的块按需请求波形数据
  useEffect(() => {
    let cancelled = false;
    const pathsToRequest = visibleItems.filter((item) => item.status === 'completed' && item.audioPath).map((item) => item.audioPath as string);

    pathsToRequest.forEach((audioPath) => {
      getTTSBlockWaveform(audioPath).then(
        (data) => {
          if (!cancelled) {
            setWaveformMap((prev) => (prev[audioPath] ? prev : { ...prev, [audioPath]: data }));
          }
        },
        () => {
          // 忽略单条失败，不更新 state
        }
      );
    });

    return () => {
      cancelled = true;
    };
  }, [visibleItems]);

  // 单轨单 Canvas：根据 waveformMap 与可见块绘制所有波形
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || trackHeight <= 0) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(trackHeight * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${trackHeight}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, trackHeight);

    const centerY = trackHeight / 2;
    const maxAmplitude = (trackHeight / 2) * 0.9;
    const BAR_WIDTH = 1;
    const BAR_GAP = 1;
    const BAR_STEP = BAR_WIDTH + BAR_GAP;

    visibleItems.forEach((item) => {
      if (item.status !== 'completed' || !item.audioPath) return;
      const data = waveformMap[item.audioPath];
      if (!data?.peaks?.length) return;

      const { peaks } = data;
      const duration = data.duration;
      const blockLeft = item.startTime * pixelsPerSecond;
      const blockDuration = item.endTime - item.startTime;
      const blockWidth = Math.max(blockDuration * pixelsPerSecond, DEFAULT_CONFIG.SEGMENT_MIN_WIDTH);

      if (blockLeft + blockWidth <= 0 || blockLeft >= width) return;
      const clipLeft = Math.max(0, blockLeft);
      const clipRight = Math.min(width, blockLeft + blockWidth);
      const drawWidth = clipRight - clipLeft;
      if (drawWidth <= 0) return;

      const totalBarsInBlock = Math.ceil(blockWidth / BAR_STEP);
      const timePerBar = duration / Math.max(1, totalBarsInBlock);
      const peakDuration = duration / peaks.length;

      const localStart = clipLeft - blockLeft;
      const startBarIndex = Math.max(0, Math.floor(localStart / BAR_STEP));
      const endBarIndex = Math.min(totalBarsInBlock, Math.ceil((localStart + drawWidth) / BAR_STEP));
      const barsToDraw = endBarIndex - startBarIndex;
      if (barsToDraw <= 0) return;

      ctx.save();
      ctx.beginPath();
      ctx.rect(clipLeft, 0, drawWidth, trackHeight);
      ctx.clip();

      ctx.fillStyle = 'hsl(142, 70%, 45%)';
      ctx.globalAlpha = 0.85;

      for (let i = 0; i < barsToDraw; i++) {
        const barIndex = startBarIndex + i;
        const barStartTime = barIndex * timePerBar;
        const barEndTime = barStartTime + timePerBar;
        const startPeakIndex = Math.floor(barStartTime / peakDuration);
        const endPeakIndex = Math.ceil(barEndTime / peakDuration);

        let maxPeak = 0;
        let sumPeak = 0;
        let count = 0;
        for (let j = Math.max(0, startPeakIndex); j <= Math.min(peaks.length - 1, endPeakIndex); j++) {
          const v = peaks[j] ?? 0;
          maxPeak = Math.max(maxPeak, v);
          sumPeak += v;
          count++;
        }
        const avgPeak = count > 0 ? sumPeak / count : 0;
        const displayPeak = maxPeak * 0.7 + avgPeak * 0.3;

        const x = clipLeft + i * BAR_STEP;
        const barHeight = Math.max(1, displayPeak * maxAmplitude * 2);
        const y = centerY - barHeight / 2;
        ctx.fillRect(Math.round(x), Math.round(y), BAR_WIDTH, Math.max(1, Math.round(barHeight)));
      }

      ctx.globalAlpha = 1;
      ctx.restore();
    });
  }, [visibleItems, waveformMap, pixelsPerSecond, width, trackHeight]);

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
    <div className={clsx('relative border-border', disabled && 'opacity-40 pointer-events-none')} style={{ height: trackHeight, width }}>
      {/* 轨道内容容器（设置总宽度） */}
      <div ref={containerRef} className="relative h-full" style={{ width }}>
        {/* 单轨单 Canvas：波形层（在块下方，半透明块背景可透出波形） */}
        <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none" style={{ left: 0, top: 0, width, height: trackHeight }} />
        <div className="absolute inset-0 z-10">
          {visibleItems.map((item) => (
            <TTSAudioBlock
              key={item.index}
              item={item}
              pixelsPerSecond={pixelsPerSecond}
              maxDuration={maxDuration}
              isPlaying={playingIndex === item.index}
              isOverlapping={overlappingIndices.has(item.index)}
              isSelected={selectedIndex === item.index}
              onBlockClick={handleBlockClick}
              onPlayClick={handlePlayClick}
              onDeleteClick={handleDeleteClick}
              onTimeChange={item.md5 && onTimeChange ? (newStartTime, newEndTime) => onTimeChange(item.index, newStartTime, newEndTime) : undefined}
            />
          ))}
        </div>

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
