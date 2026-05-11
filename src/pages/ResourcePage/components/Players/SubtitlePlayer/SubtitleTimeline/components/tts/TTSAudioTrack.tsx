import clsx from 'clsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useMediaAdapter } from '../../context';
import type { TTSAudioItem } from '../../types';
import { DEFAULT_CONFIG, ViewportState } from '../../types';
import { detectOverlappingIndices, TimeRange } from '../../utils';
import { createTTSWaveformLoader, type WaveformData } from '../../utils/ttsWaveformLoader';
import { InlinePendingSegmentInput } from '../shared/InlinePendingSegmentInput';
import { TTSAudioBlock } from './TTSAudioBlock';

/** 从 types 导出，供外部使用 */
export type { TTSAudioItem } from '../../types';

interface TTSAudioTrackProps {
  /** TTS 轨道 ID（如 main、zh-CN） */
  trackId?: string;
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
  /** 块文本变更回调（内联编辑后） */
  onTextChange?: (index: number, newText: string) => void;
  /** 最大时长（秒），用于拖拽边界 */
  maxDuration?: number;
  /** 禁用交互（轨道未启用时） */
  disabled?: boolean;
  /** 是否允许点击空白添加片段（独立 TTS 轨道） */
  allowAddSegment?: boolean;
  /** 点击空白处请求添加片段回调 (startTime, endTime) - 父组件设置 pendingNewSegment */
  onAddSegment?: (startTime: number, endTime: number) => void;
  /** 待新增片段的时间范围（显示 inline 输入框） */
  pendingNewSegment?: { startTime: number; endTime: number } | null;
  /** 确认新增片段（输入框失焦且有内容时） */
  onAddSegmentConfirm?: (startTime: number, endTime: number, text: string) => void;
  /** 取消新增（输入框失焦且无内容时） */
  onCancelNewSegment?: () => void;
  /** 双击已有块编辑回调 */
  onBlockDoubleClick?: (item: TTSAudioItem) => void;
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
  width,
  selectedIndex = null,
  onPlayAudio,
  onStopAudio,
  playingIndex,
  onBlockSelect,
  onDeleteSegment,
  onTimeChange,
  onTextChange,
  maxDuration,
  disabled = false,
  allowAddSegment = false,
  onAddSegment,
  pendingNewSegment,
  onAddSegmentConfirm,
  onCancelNewSegment,
  onBlockDoubleClick
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [waveformMap, setWaveformMap] = useState<Record<string, WaveformData>>({});

  // Get media adapter from context and create waveform loader
  const mediaAdapter = useMediaAdapter();
  const waveformLoader = useMemo(() => createTTSWaveformLoader(mediaAdapter), [mediaAdapter]);

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
      waveformLoader.getWaveform(audioPath).then(
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
  }, [visibleItems, waveformLoader]);

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

  /** mousedown 时的横向滚动位置，用于区分「点击空白」与「拖拽滚动后松开」 */
  const scrollLeftAtMouseDownRef = useRef<number | null>(null);

  // 点击空白区域添加片段（类似字幕轨道的单击添加）
  const handleTrackMouseDown = useCallback(() => {
    // 记录 mousedown 时的滚动位置，用于判断是否是真正的点击
    scrollLeftAtMouseDownRef.current = null; // TTS 轨道没有 scrollLeft，暂时用 null
  }, []);

  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (!allowAddSegment || !onAddSegment || disabled) return;
      // 确保点击的是轨道背景，而不是块
      const target = e.target as HTMLElement;
      if (target.closest('[data-tts-block]')) return;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const clickTime = x / pixelsPerSecond;

      // 按 startTime 排序现有片段，找到点击位置所在的间隙
      const sortedItems = [...items].sort((a, b) => a.startTime - b.startTime);

      // 找到包含点击时间的间隙
      let gapStart = 0;
      let gapEnd = maxDuration ?? Infinity;

      for (const item of sortedItems) {
        if (item.startTime <= clickTime) {
          gapStart = Math.max(gapStart, item.endTime);
        } else {
          gapEnd = Math.min(gapEnd, item.startTime);
          break;
        }
      }

      const gapDuration = gapEnd - gapStart;

      // 间隙太小（小于 1 秒），不允许添加
      if (gapDuration < 1) return;

      let startTime: number;
      let endTime: number;

      if (gapDuration >= 3) {
        // 间隙足够大：以点击时间为中心，前后各 1.5 秒（共 3 秒）
        const segDuration = 3;
        const halfDuration = segDuration / 2;
        startTime = clickTime - halfDuration;
        endTime = clickTime + halfDuration;

        // 确保不超出间隙边界
        if (startTime < gapStart) {
          startTime = gapStart;
          endTime = gapStart + segDuration;
        }
        if (endTime > gapEnd) {
          endTime = gapEnd;
          startTime = gapEnd - segDuration;
          if (startTime < gapStart) {
            startTime = gapStart;
          }
        }
      } else {
        // 间隙较小：使用整个间隙
        startTime = gapStart;
        endTime = gapEnd;
      }

      // 最终边界检查
      if (maxDuration && endTime > maxDuration) {
        endTime = maxDuration;
      }
      if (startTime < 0) {
        startTime = 0;
      }

      onAddSegment(startTime, endTime);
    },
    [allowAddSegment, onAddSegment, disabled, pixelsPerSecond, maxDuration, items]
  );

  if (items.length === 0 && !allowAddSegment) {
    return null;
  }

  return (
    <div className={clsx('relative border-border', disabled && 'opacity-40 pointer-events-none')} style={{ height: trackHeight, width }} onMouseDown={handleTrackMouseDown} onClick={handleTrackClick}>
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
              onTextChange={onTextChange ? (newText) => onTextChange(item.index, newText) : undefined}
              onDoubleClick={onBlockDoubleClick ? (_e, it) => onBlockDoubleClick(it) : undefined}
            />
          ))}
        </div>

        <InlinePendingSegmentInput
          pendingSegment={pendingNewSegment ?? null}
          pixelsPerSecond={pixelsPerSecond}
          top={DEFAULT_CONFIG.TRACK_GAP / 2}
          height={DEFAULT_CONFIG.TRACK_HEIGHT + 20}
          onConfirm={(startTime, endTime, text) => onAddSegmentConfirm?.(startTime, endTime, text)}
          onCancel={onCancelNewSegment}
        />

        {/* 空轨道提示 */}
        {items.length === 0 && allowAddSegment && (
          <div className="absolute inset-0 flex items-center justify-start pointer-events-none px-2 bg-primary/20">
            <span className="text-[10px] text-muted-foreground/60">点击添加配音片段</span>
          </div>
        )}

        {/* 音频结束截止线 */}
        <div className="absolute top-0 bottom-0 w-0.5 bg-orange-500 z-10 pointer-events-none" style={{ left: totalDuration * pixelsPerSecond }} title={`音频结束: ${totalDuration.toFixed(2)}s`} />
      </div>
    </div>
  );
};
