import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbWaveSine } from 'react-icons/tb';

import type { ViewportState } from '../types';

interface WaveformTrackProps {
  /** 音频文件路径 */
  audioPath?: string;
  /** 时间轴总宽度 */
  totalWidth: number;
  /** 时长（秒） */
  duration: number;
  /** 每秒像素数 */
  pixelsPerSecond: number;
  /** 视口状态 */
  viewport: ViewportState;
  /** 当前播放时间 */
  currentTime?: number;
  /** 波形高度 */
  height?: number;
  /** 轨道标签宽度（用于固定标签） */
  trackLabelWidth?: number;
  /** 是否显示轨道标签 */
  showTrackLabel?: boolean;
  /** 滚动位置 */
  scrollLeft: number;
  /** 点击跳转回调 */
  onSeek?: (time: number) => void;
  /** 容器宽度（用于确定可见区域） */
  containerWidth?: number;
}

interface WaveformData {
  peaks: number[];
  duration: number;
}

/**
 * WaveformTrack - 高性能音频波形轨道组件
 *
 * 特性：
 * - 使用 Canvas 高性能渲染波形
 * - 视口感知：只渲染可见区域的波形
 * - 支持缩放和平移
 * - 固定在顶部，不随轨道垂直滚动
 * - 水平滚动与时间轴同步
 */
export const WaveformTrack: React.FC<WaveformTrackProps> = ({
  audioPath,
  // totalWidth 和 viewport 不再需要，但保留在 props 中以保持接口一致性
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  totalWidth: _totalWidth,
  duration,
  pixelsPerSecond,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  viewport: _viewport,
  currentTime,
  height = 48,
  trackLabelWidth = 120,
  showTrackLabel = true,
  scrollLeft,
  onSeek,
  containerWidth = 800
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [waveformData, setWaveformData] = useState<WaveformData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actualContainerWidth, setActualContainerWidth] = useState(containerWidth);

  // 多级缓存：根据采样数量缓存不同精度的波形数据
  const waveformCacheRef = useRef<Map<string, WaveformData>>(new Map());

  // 跟踪鼠标按下位置，用于区分点击和拖拽
  const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

  // 监听容器宽度变化
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setActualContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(wrapper);
    setActualContainerWidth(wrapper.clientWidth);

    return () => observer.disconnect();
  }, []);

  // 计算合适的采样数量（根据当前缩放级别）
  const getSamplesCount = useCallback((pps: number, dur: number): number => {
    // 根据缩放级别计算采样数量
    // 基础：保证有足够的采样点来展现波形细节
    // 最少 5000 个采样点（低质量），最多 100000 个采样点（高质量）
    const idealSamples = Math.ceil(dur * 200); // 平均每秒 200 个采样点
    return Math.min(Math.max(5000, idealSamples), 100000);
  }, []);

  // 加载波形数据
  const loadWaveform = useCallback(async () => {
    if (!audioPath) {
      setWaveformData(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 计算采样数量
      const samplesCount = getSamplesCount(pixelsPerSecond, duration);
      const cacheKey = `${audioPath}:${samplesCount}`;

      // 检查缓存
      const cachedData = waveformCacheRef.current.get(cacheKey);
      if (cachedData) {
        setWaveformData(cachedData);
        setIsLoading(false);
        return;
      }

      // 调用 ffmpeg 提取波形
      const result = await window.YUA.ffmpeg.extractWaveform({
        inputPath: audioPath,
        samplesCount
      });

      console.log(result);

      // 缓存结果
      waveformCacheRef.current.set(cacheKey, result);
      setWaveformData(result);
    } catch (err) {
      console.error('[WaveformTrack] Failed to load waveform:', err);
      setError(err instanceof Error ? err.message : '加载波形失败');
    } finally {
      setIsLoading(false);
    }
  }, [audioPath, pixelsPerSecond, duration, getSamplesCount]);

  // 当音频路径变化或缩放级别变化时重新加载波形
  useEffect(() => {
    loadWaveform();
  }, [loadWaveform]);

  // 绘制波形 - 只绘制可见区域，固定条形宽度
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveformData) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { peaks } = waveformData;
    if (!peaks || peaks.length === 0) {
      console.warn('[WaveformTrack] No peaks data');
      return;
    }

    // Canvas 只需要覆盖可见区域宽度
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = actualContainerWidth;
    const displayHeight = height;

    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    ctx.scale(dpr, dpr);

    // 清空画布
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    // 波形样式
    const centerY = displayHeight / 2;
    const maxAmplitude = (displayHeight / 2) * 0.9; // 90% 高度

    // 固定条形宽度和间隙
    const BAR_WIDTH = 1; // 固定条形宽度
    const BAR_GAP = 1; // 条形间隙
    const BAR_STEP = BAR_WIDTH + BAR_GAP; // 每个条形占用的总宽度

    // 计算可见区域需要多少个条形
    const barsCount = Math.ceil(displayWidth / BAR_STEP);

    // 计算可见区域对应的时间范围
    const viewStartTime = scrollLeft / pixelsPerSecond;
    const viewEndTime = (scrollLeft + displayWidth) / pixelsPerSecond;
    const viewDuration = viewEndTime - viewStartTime;

    // 每个条形代表的时间范围
    const timePerBar = viewDuration / barsCount;

    // 绘制波形 - 使用柱状图方式
    ctx.fillStyle = 'hsl(210, 80%, 60%)';

    for (let i = 0; i < barsCount; i++) {
      // 计算当前条形对应的时间范围
      const barStartTime = viewStartTime + i * timePerBar;
      const barEndTime = barStartTime + timePerBar;

      // 计算对应的峰值索引范围
      const peakDuration = duration / peaks.length;
      const startPeakIndex = Math.floor(barStartTime / peakDuration);
      const endPeakIndex = Math.ceil(barEndTime / peakDuration);

      // 在这个时间范围内计算统计值：最大值、平均值
      let maxPeak = 0;
      let sumPeak = 0;
      let count = 0;

      for (let j = Math.max(0, startPeakIndex); j <= Math.min(peaks.length - 1, endPeakIndex); j++) {
        const peakValue = peaks[j] || 0;
        maxPeak = Math.max(maxPeak, peakValue);
        sumPeak += peakValue;
        count++;
      }

      // 使用最大值和平均值的加权平均，使波形更有起伏
      const avgPeak = count > 0 ? sumPeak / count : 0;
      const displayPeak = maxPeak * 0.7 + avgPeak * 0.3; // 70% 最大值 + 30% 平均值

      // 绘制条形
      const x = i * BAR_STEP;
      const barHeight = Math.max(1, displayPeak * maxAmplitude * 2);
      const y = centerY - barHeight / 2;

      ctx.fillRect(x, y, BAR_WIDTH, barHeight);
    }
  }, [waveformData, actualContainerWidth, height, scrollLeft, pixelsPerSecond, duration]);

  // 处理鼠标按下
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  // 处理鼠标抬起（只有在移动距离小时才算点击）
  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!onSeek || !mouseDownPosRef.current) return;

      const dx = Math.abs(e.clientX - mouseDownPosRef.current.x);
      const dy = Math.abs(e.clientY - mouseDownPosRef.current.y);

      // 只有移动距离小于 3 像素才算点击
      if (dx < 3 && dy < 3) {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        // 计算点击位置对应的时间（考虑滚动偏移）
        const time = (x + scrollLeft) / pixelsPerSecond;
        onSeek(Math.max(0, Math.min(duration, time)));
      }

      mouseDownPosRef.current = null;
    },
    [onSeek, pixelsPerSecond, duration, scrollLeft]
  );

  // 如果没有音频路径，不渲染
  if (!audioPath) {
    return null;
  }

  return (
    <div className="flex border-b bg-muted/20">
      {/* 固定的轨道标签 */}
      {showTrackLabel && (
        <div className="flex items-center gap-1 px-2 border-r bg-muted/30 shrink-0 box-border" style={{ width: trackLabelWidth }}>
          <TbWaveSine className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground truncate">波形</span>
        </div>
      )}

      {/* 波形内容区域 - Canvas 固定大小，只绘制可见区域 */}
      <div ref={wrapperRef} className="flex-1 overflow-hidden relative" style={{ height }}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
            <span className="text-xs text-muted-foreground">加载波形中...</span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-destructive/10">
            <span className="text-xs text-destructive">{error}</span>
          </div>
        )}

        {!isLoading && !error && waveformData && <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseUp={handleMouseUp} className="cursor-pointer" style={{ display: 'block' }} />}

        {!isLoading && !error && !waveformData && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-xs text-muted-foreground">暂无波形数据</span>
          </div>
        )}

        {/* 音频结束截止线 */}
        {duration > 0 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-orange-500 z-10 pointer-events-none"
            style={{ left: duration * pixelsPerSecond - scrollLeft }}
            title={`音频结束: ${duration.toFixed(2)}s`}
          />
        )}
      </div>
    </div>
  );
};
