import clsx from 'clsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbMinus, TbPlus, TbVolume } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

import { SeekBar, TimelineTrackView, TimeRuler, TrackLabel, TTSAudioTrack, WaveformTrack } from './components';
import { useTimelineInteraction } from './hooks';
import { DEFAULT_CONFIG, SubtitleTimelineProps, TRACK_COLORS, ViewportState } from './types';

/**
 * SubtitleTimeline - 高性能字幕时间轴组件
 *
 * 特性：
 * - 真实滚动：使用原生滚动条，可以查看整个时间轴
 * - 虚拟化渲染：只渲染可视区域附近的片段（带缓冲区）
 * - 多轨道支持：支持多个字幕轨道并排显示
 * - 缩放和平移：滚轮缩放，拖拽平移
 * - 交互友好：点击跳转，双击编辑
 */
export const SubtitleTimeline: React.FC<SubtitleTimelineProps> = ({
  tracks,
  duration: propDuration,
  currentTime,
  followCurrentTime = false,
  initialViewport,
  showRuler = true,
  showTrackLabels = true,
  trackLabelWidth = DEFAULT_CONFIG.TRACK_LABEL_WIDTH,
  minPixelsPerSecond = DEFAULT_CONFIG.MIN_PIXELS_PER_SECOND,
  maxPixelsPerSecond = DEFAULT_CONFIG.MAX_PIXELS_PER_SECOND,
  disabled = false,
  highlightIds: propHighlightIds,
  className,
  audioPath,
  showWaveform = true,
  ttsItemsByTrack,
  ttsTrackLabels,
  subtitleToTTSTrackMap,
  showTTSTrack = true,
  onPlayTTSAudio,
  onStopTTSAudio,
  playingTTSIndex,
  onSegmentClick,
  onSegmentDoubleClick,
  onSegmentTextChange,
  onSegmentTimeChange,
  onMergePrev,
  onSeek,
  onViewportChange
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [scrollLeft, setScrollLeft] = useState(0);
  // 本地 mock 播放时间（用于没有音视频时的“假 seek”）
  const [mockCurrentTime, setMockCurrentTime] = useState(0);

  // 记录初始的 pixelsPerSecond 作为滑块的最小值（使用普通常量而不是 ref）
  const initialPixelsPerSecondValue = initialViewport?.pixelsPerSecond ?? DEFAULT_CONFIG.DEFAULT_PIXELS_PER_SECOND;

  // 缩放级别（每秒像素数）
  const [pixelsPerSecond, setPixelsPerSecond] = useState(initialPixelsPerSecondValue);

  // 转换高亮 ID 为 Set
  const highlightIds = useMemo(() => {
    if (!propHighlightIds) return undefined;
    return propHighlightIds instanceof Set ? propHighlightIds : new Set(propHighlightIds);
  }, [propHighlightIds]);

  // 计算总时长
  const duration = useMemo(() => {
    if (propDuration !== undefined) return propDuration;
    let maxEnd = 0;
    for (const track of tracks) {
      for (const seg of track.segments) {
        if (seg.endTime > maxEnd) maxEnd = seg.endTime;
      }
    }
    return maxEnd || 60; // 默认至少 60 秒
  }, [tracks, propDuration]);

  // 给轨道分配颜色
  const tracksWithColors = useMemo(() => {
    return tracks.map((track, index) => ({
      ...track,
      color: track.color ?? TRACK_COLORS[index % TRACK_COLORS.length]
    }));
  }, [tracks]);

  // 时间轴内容区域宽度（不包含轨道标签）
  const timelineContentWidth = containerWidth - (showTrackLabels ? trackLabelWidth : 0);

  // 时间轴总宽度（根据时长和缩放级别计算）
  const totalWidth = useMemo(() => {
    return Math.max(timelineContentWidth, duration * pixelsPerSecond);
  }, [duration, pixelsPerSecond, timelineContentWidth]);

  // 计算当前视口（根据滚动位置和容器宽度）
  const viewport: ViewportState = useMemo(() => {
    const startTime = scrollLeft / pixelsPerSecond;
    const endTime = (scrollLeft + timelineContentWidth) / pixelsPerSecond;
    return { startTime, endTime, pixelsPerSecond };
  }, [scrollLeft, timelineContentWidth, pixelsPerSecond]);

  // 通知视口变化
  useEffect(() => {
    onViewportChange?.(viewport);
  }, [viewport, onViewportChange]);

  // 像素转时间
  const pixelToTime = useCallback(
    (pixel: number): number => {
      return pixel / pixelsPerSecond;
    },
    [pixelsPerSecond]
  );

  // 统一的 seek 处理：如果外部提供 onSeek 则调用，否则更新本地 mock 时间
  const handleSeekUnified = useCallback(
    (time: number) => {
      const clamped = Math.max(0, Math.min(duration, time));
      if (onSeek) {
        onSeek(clamped);
      } else {
        setMockCurrentTime(clamped);
      }
    },
    [onSeek, duration]
  );

  // 生效的当前时间：优先外部的 currentTime，否则使用 mockCurrentTime
  const effectiveCurrentTime = currentTime ?? mockCurrentTime;

  // 滚动到指定时间
  const scrollToTime = useCallback(
    (time: number) => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) return;

      const targetScrollLeft = time * pixelsPerSecond - timelineContentWidth / 2;
      scrollContainer.scrollTo({
        left: Math.max(0, targetScrollLeft),
        behavior: 'smooth'
      });
    },
    [pixelsPerSecond, timelineContentWidth]
  );

  // 缩放处理
  const handleZoom = useCallback(
    (factor: number, centerTime?: number) => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) return;

      // 计算缩放中心点的时间（默认为视口中心）
      const center = centerTime ?? (scrollLeft + timelineContentWidth / 2) / pixelsPerSecond;

      // 计算新的缩放级别
      const newPps = Math.max(minPixelsPerSecond, Math.min(maxPixelsPerSecond, pixelsPerSecond * factor));

      // 计算新的滚动位置，保持中心点在相同的视觉位置
      const newScrollLeft = center * newPps - timelineContentWidth / 2;

      setPixelsPerSecond(newPps);

      // 使用 requestAnimationFrame 确保在缩放后调整滚动位置
      requestAnimationFrame(() => {
        scrollContainer.scrollLeft = Math.max(0, newScrollLeft);
      });
    },
    [scrollLeft, timelineContentWidth, pixelsPerSecond, minPixelsPerSecond, maxPixelsPerSecond]
  );

  // 平移处理（用于拖拽）
  const handlePan = useCallback((deltaPixels: number) => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    scrollContainer.scrollLeft += deltaPixels;
  }, []);

  // 通过滑块调整缩放
  const handleSliderChange = useCallback(
    (value: number[]) => {
      const newPps = value[0];
      setPixelsPerSecond(newPps);

      // 保持当前视口中心点位置不变
      const scrollContainer = scrollContainerRef.current;
      if (scrollContainer) {
        const centerTime = (scrollLeft + timelineContentWidth / 2) / pixelsPerSecond;
        const newScrollLeft = centerTime * newPps - timelineContentWidth / 2;

        requestAnimationFrame(() => {
          scrollContainer.scrollLeft = Math.max(0, newScrollLeft);
        });
      }
    },
    [scrollLeft, timelineContentWidth, pixelsPerSecond]
  );

  // 交互管理
  const { isDragging, handlers, handleSegmentClick, handleSegmentDoubleClick } = useTimelineInteraction({
    disabled,
    onZoom: handleZoom,
    onPan: handlePan,
    pixelToTime, // 像素直接转时间（包含滚动偏移的计算在 hook 内部处理）
    onSeek: handleSeekUnified,
    onSegmentClick,
    onSegmentDoubleClick
  });

  // 监听容器尺寸变化
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // 监听滚动
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = (): void => {
      setScrollLeft(scrollContainer.scrollLeft);
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  // 当前时间改变时，检查是否需要滚动到可见区域
  useEffect(() => {
    if (!followCurrentTime || effectiveCurrentTime === undefined) return;

    // 如果当前时间在可视区域外，自动滚动
    const currentX = effectiveCurrentTime * pixelsPerSecond;
    const viewStart = scrollLeft;
    const viewEnd = scrollLeft + timelineContentWidth;

    // 只有当时间指示器完全不在视野内时才自动滚动
    if (currentX < viewStart || currentX > viewEnd) {
      scrollToTime(effectiveCurrentTime);
    }
  }, [effectiveCurrentTime, followCurrentTime, pixelsPerSecond, scrollLeft, timelineContentWidth, scrollToTime]);

  // 缩放控制按钮
  const handleZoomIn = useCallback(() => {
    handleZoom(DEFAULT_CONFIG.ZOOM_STEP);
  }, [handleZoom]);

  const handleZoomOut = useCallback(() => {
    handleZoom(1 / DEFAULT_CONFIG.ZOOM_STEP);
  }, [handleZoom]);

  return (
    <div ref={containerRef} className={clsx('flex flex-col bg-background border rounded-lg overflow-hidden select-none h-full', className)}>
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-2 py-1 border-b bg-muted/30 shrink-0">
        <div className="flex items-center gap-2 flex-1">
          <Button variant="ghost" size="sm" className="w-8 h-8 p-0 shrink-0" onClick={handleZoomOut} title="缩小">
            <TbMinus className="w-4 h-4" />
          </Button>

          {/* 缩放滑块 */}
          <div className="flex items-center gap-2 flex-1 max-w-[200px]">
            <Slider
              value={[pixelsPerSecond]}
              onValueChange={handleSliderChange}
              min={DEFAULT_CONFIG.MIN_PIXELS_PER_SECOND}
              max={DEFAULT_CONFIG.MAX_PIXELS_PER_SECOND}
              step={10}
              className="flex-1"
              title={`缩放级别: ${pixelsPerSecond.toFixed(0)} px/s`}
            />
          </div>

          <Button variant="ghost" size="sm" className="w-8 h-8 p-0 shrink-0" onClick={handleZoomIn} title="放大">
            <TbPlus className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs text-muted-foreground">
            {tracks.length} 轨道 · {tracks.reduce((sum, t) => sum + t.segments.length, 0)} 片段
          </div>
          <div className="text-xs font-mono text-foreground">
            {(() => {
              const formatTime = (seconds: number): string => {
                const h = Math.floor(seconds / 3600);
                const m = Math.floor((seconds % 3600) / 60);
                const s = Math.floor(seconds % 60);
                if (h > 0) {
                  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                }
                return `${m}:${s.toString().padStart(2, '0')}`;
              };
              const current = effectiveCurrentTime !== undefined ? formatTime(effectiveCurrentTime) : '--:--';
              const total = formatTime(duration);
              return `${current} / ${total}`;
            })()}
          </div>
        </div>
      </div>

      {/* SeekBar - 播放进度条和字幕片段概览 */}
      <SeekBar duration={duration} currentTime={effectiveCurrentTime} segments={tracksWithColors[0]?.segments || []} onSeek={handleSeekUnified} />

      {/* 波形轨道（固定在顶部，不随字幕轨道垂直滚动） */}
      {showWaveform && audioPath && (
        <WaveformTrack
          audioPath={audioPath}
          totalWidth={totalWidth}
          duration={duration}
          pixelsPerSecond={pixelsPerSecond}
          viewport={viewport}
          currentTime={effectiveCurrentTime}
          trackLabelWidth={trackLabelWidth}
          showTrackLabel={showTrackLabels}
          scrollLeft={scrollLeft}
          onSeek={handleSeekUnified}
        />
      )}

      {/* 主内容区域 */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* 左侧轨道标签（固定） */}
        {showTrackLabels && (
          <div className="flex flex-col shrink-0 border-r" style={{ width: trackLabelWidth }}>
            {/* 标签区域顶部占位（对应时间刻度） */}
            {showRuler && <div className="border-b bg-muted/30 shrink-0" style={{ height: DEFAULT_CONFIG.RULER_HEIGHT }} />}

            {/* 轨道标签列表（每个字幕轨道后紧跟对应的TTS轨道标签） */}
            {tracksWithColors
              .filter((t) => !t.hidden)
              .map((track, index) => {
                const ttsTrackId = subtitleToTTSTrackMap?.get(track.id);
                const ttsItems = ttsTrackId ? ttsItemsByTrack?.get(ttsTrackId) : undefined;
                // 如果有TTS项（包括正在合成的），或者正在合成这个轨道，则显示TTS轨道
                const hasTTSTrack = showTTSTrack && ttsTrackId && (ttsItems?.length ?? 0) > 0;

                return (
                  <React.Fragment key={track.id}>
                    {/* 字幕轨道标签 */}
                    <TrackLabel track={track} index={index} />
                    {/* TTS轨道标签（如果有） */}
                    {hasTTSTrack && (
                      <div
                        className="flex items-center gap-1.5 px-2 border-b border-border bg-muted/20 shrink-0 overflow-hidden"
                        style={{ height: DEFAULT_CONFIG.TRACK_HEIGHT + DEFAULT_CONFIG.TRACK_GAP }}
                      >
                        {/* 使用和字幕轨道相同的颜色指示器 */}
                        <div className="w-1.5 h-4 rounded-full shrink-0" style={{ backgroundColor: track.color }} />
                        {/* 轨道名称 + TTS图标 */}
                        <div className="flex items-center gap-1 min-w-0 flex-1">
                          <span className="text-xs text-foreground/80 truncate" title={track.label}>
                            {track.label}
                          </span>
                          <TbVolume className="w-3 h-3 text-muted-foreground shrink-0" />
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
          </div>
        )}

        {/* 右侧时间轴内容区域（可滚动） */}
        <div ref={scrollContainerRef} className={clsx('flex-1 overflow-x-auto overflow-y-hidden', isDragging && 'cursor-grabbing')} {...handlers}>
          {/* 内容容器（设置总宽度） */}
          <div style={{ width: totalWidth, minWidth: '100%' }}>
            {/* 时间刻度尺 */}
            {showRuler && (
              <TimeRuler
                startTime={0}
                endTime={duration}
                pixelsPerSecond={pixelsPerSecond}
                width={totalWidth}
                currentTime={effectiveCurrentTime}
                onClick={handleSeekUnified}
                viewportStart={viewport.startTime}
                viewportEnd={viewport.endTime}
              />
            )}

            {/* 轨道内容（每个字幕轨道后紧跟对应的TTS轨道） */}
            {tracksWithColors
              .filter((t) => !t.hidden)
              .map((track) => {
                const ttsTrackId = subtitleToTTSTrackMap?.get(track.id);
                const ttsItems = ttsTrackId ? ttsItemsByTrack?.get(ttsTrackId) : undefined;
                // 如果有TTS项（包括正在合成的），或者正在合成这个轨道，则显示TTS轨道
                const hasTTSTrack = showTTSTrack && ttsTrackId && (ttsItems?.length ?? 0) > 0;

                return (
                  <React.Fragment key={track.id}>
                    {/* 字幕轨道内容 */}
                    <TimelineTrackView
                      track={track}
                      viewport={viewport}
                      totalDuration={duration}
                      pixelsPerSecond={pixelsPerSecond}
                      width={totalWidth}
                      currentTime={effectiveCurrentTime}
                      highlightIds={highlightIds}
                      onMergePrev={onMergePrev}
                      onSegmentClick={handleSegmentClick}
                      onSegmentDoubleClick={handleSegmentDoubleClick}
                      onSegmentTextChange={onSegmentTextChange}
                      onSegmentTimeChange={onSegmentTimeChange}
                      disabled={disabled || track.locked}
                    />
                    {/* TTS轨道内容（如果有） */}
                    {hasTTSTrack && (
                      <TTSAudioTrack
                        key={`tts-${ttsTrackId}`}
                        items={ttsItems}
                        viewport={viewport}
                        totalDuration={duration}
                        pixelsPerSecond={pixelsPerSecond}
                        width={totalWidth}
                        currentTime={effectiveCurrentTime}
                        trackLabelWidth={0}
                        showTrackLabel={false}
                        onPlayAudio={onPlayTTSAudio}
                        onStopAudio={onStopTTSAudio}
                        playingIndex={playingTTSIndex}
                      />
                    )}
                  </React.Fragment>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
};
