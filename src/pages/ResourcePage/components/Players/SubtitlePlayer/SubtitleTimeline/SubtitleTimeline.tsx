import clsx from 'clsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbFileImport, TbMinus, TbPlus, TbPointer, TbScissors, TbWaveSine } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

import { DEFAULT_LABELS } from './adapters/defaults';
import {
  AnnotationTrack,
  AnnotationTrackLabel,
  ClipTrack,
  ClipTrackLabel,
  MediaImportPanel,
  MediaTrackLabel,
  MediaTrackManager,
  SeekBar,
  TimelineTrackView,
  TimeRuler,
  TrackAddMenu,
  TrackLabel,
  TTSAudioTrack,
  TTSTrackLabel,
  WaveformTrack
} from './components';
import { TimelineAdapterProvider } from './context';
import { useTimelineInteraction } from './hooks';
import type { MediaSegment, MediaSource, TimelineSegment } from './types';
import { ClipTool, DEFAULT_CONFIG, MediaTool, SubtitleTimelineProps, TRACK_COLORS, ViewportState, WaveformState } from './types';
import { parseSegmentId } from './utils';

const audioWaveformHeight = 40;
/** 波形+剪辑叠加时的轨道高度 */
const overlayTrackHeight = Math.max(audioWaveformHeight, DEFAULT_CONFIG.CLIP_TRACK_HEIGHT);

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
  waveform,
  showWaveform = true,
  ttsItemsByTrack,
  ttsTrackLabels,
  subtitleToTTSTrackMap,
  showTTSTrack = true,
  standaloneTTSTracks,
  onAddTTSSegment,
  onTTSBlockDoubleClick,
  onPlayTTSAudio,
  onStopTTSAudio,
  playingTTSIndex,
  onAddSubtitleTrack,
  onAddTTSTrack,
  onDeleteSubtitleTrack,
  onDeleteTTSTrack,
  onDeleteTTSSegment,
  onTTSTimeChange,
  onSegmentClick,
  onSegmentDoubleClick,
  onSegmentTextChange,
  onSegmentTimeChange,
  onMergePrev,
  onAddSegment,
  onDeleteSegment,
  onSeek,
  onViewportChange,
  clipTrack: clipTrackData,
  clipTool: propClipTool = 'select',
  clipCallbacks,
  onToggleSubtitleTrackEnabled,
  onToggleTTSTrackEnabled,
  onOpenTTSSettings,
  ttsVoiceLabels,
  clipTrackEnabled = true,
  ttsTrackEnabledMap,
  wordsMapByTrack,
  annotationTrack: annotationTrackData,
  annotationCallbacks,
  annotationTrackEnabled = true,
  // Media Track Props
  mediaTracks,
  mediaSources,
  mediaCallbacks,
  mediaTool: propMediaTool = 'select',
  // Adapters
  adapters
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [scrollContainerWidth, setScrollContainerWidth] = useState(384);
  const [scrollLeft, setScrollLeft] = useState(0);
  /** 在轨道空白处点击后待新增的输入框：时间范围；失焦无内容则取消，有内容则调用 onAddSegment */
  const [pendingNewSegment, setPendingNewSegment] = useState<{ trackId: string; startTime: number; endTime: number } | null>(null);
  /** 单击选中的片段 ID（再单击该块进入编辑） */
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  /** 单击选中的 TTS 块：{ trackId, index } */
  const [selectedTTS, setSelectedTTS] = useState<{ trackId: string; index: number } | null>(null);
  // 本地 mock 播放时间（用于没有音视频时的“假 seek”）
  const [mockCurrentTime, setMockCurrentTime] = useState(0);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [internalClipTool, setInternalClipTool] = useState<ClipTool>(propClipTool);
  /** 选中的媒体片段（格式：trackId:segmentId） */
  const [selectedMediaSegmentId, setSelectedMediaSegmentId] = useState<string | null>(null);
  const [internalMediaTool, setInternalMediaTool] = useState<MediaTool>(propMediaTool);
  /** 显示媒体导入面板 */
  const [showMediaImport, setShowMediaImport] = useState(false);

  const labels = useMemo(() => ({ ...DEFAULT_LABELS, ...adapters?.config?.labels }), [adapters?.config?.labels]);

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

  // 是否显示波形轨道
  const showWaveformTrack = showWaveform && (waveform?.data || waveform?.loading) && propDuration !== undefined && propDuration > 0;
  // 是否将剪辑轨道叠加在波形上方（有波形且有剪辑数据时叠加显示）
  const waveformClipOverlay = showWaveformTrack && !!clipTrackData;
  // 波形/叠加区域的实际高度
  const effectiveWaveformHeight = waveformClipOverlay ? overlayTrackHeight : audioWaveformHeight;

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

  // 滚动到指定时间。instant 为 true 时无动画、瞬间到位，用于跟随当前时间，避免滞后
  const scrollToTime = useCallback(
    (time: number, instant = false) => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) return;

      const targetScrollLeft = Math.max(0, time * pixelsPerSecond - timelineContentWidth / 2);
      if (instant) {
        scrollContainer.scrollLeft = targetScrollLeft;
      } else {
        scrollContainer.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
      }
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

  // 单击选中片段（再单击选中块进入编辑由 TimelineSegmentBlock 内部处理）
  const handleSegmentClickInternal = useCallback(
    (segment: TimelineSegment, trackId: string, event: React.MouseEvent) => {
      setSelectedSegmentId(segment.id);
      setSelectedTTS(null); // 点击字幕块时取消 TTS 选中
      onSegmentClick?.(segment, trackId, event);
    },
    [onSegmentClick]
  );

  // 剪辑片段上移
  const handleClipMoveUp = useCallback(
    (clipId: string) => {
      const clip = clipTrackData?.clips.find((c) => c.id === clipId);
      if (!clip || clip.deleted) return;

      const activeClips = clipTrackData?.clips.filter((c) => !c.deleted) || [];
      const sortedActive = [...activeClips].sort((a, b) => a.order - b.order);
      const currentIndex = sortedActive.findIndex((c) => c.id === clipId);

      if (currentIndex <= 0) return;

      const targetIndex = currentIndex - 1;
      const targetClip = sortedActive[targetIndex];

      clipCallbacks?.onClipReorder?.(
        sortedActive
          .map((c) => c.id)
          .toSpliced(currentIndex, 1)
          .toSpliced(targetIndex, 0, clipId)
      );
    },
    [clipTrackData, clipCallbacks]
  );

  // 剪辑片段下移
  const handleClipMoveDown = useCallback(
    (clipId: string) => {
      const clip = clipTrackData?.clips.find((c) => c.id === clipId);
      if (!clip || clip.deleted) return;

      const activeClips = clipTrackData?.clips.filter((c) => !c.deleted) || [];
      const sortedActive = [...activeClips].sort((a, b) => a.order - b.order);
      const currentIndex = sortedActive.findIndex((c) => c.id === clipId);

      if (currentIndex >= sortedActive.length - 1 || currentIndex === -1) return;

      const targetIndex = currentIndex + 1;
      const targetClip = sortedActive[targetIndex];

      clipCallbacks?.onClipReorder?.(
        sortedActive
          .map((c) => c.id)
          .toSpliced(currentIndex, 1)
          .toSpliced(targetIndex, 0, clipId)
      );
    },
    [clipTrackData, clipCallbacks]
  );

  // 交互管理
  const { isDragging, handlers, handleSegmentClick, handleSegmentDoubleClick } = useTimelineInteraction({
    disabled,
    onZoom: handleZoom,
    onPan: handlePan,
    pixelToTime, // 像素直接转时间（包含滚动偏移的计算在 hook 内部处理）
    onSeek: handleSeekUnified,
    onSegmentClick: handleSegmentClickInternal,
    onSegmentDoubleClick
  });

  const selectedIds = useMemo(() => (selectedSegmentId ? new Set<string>([selectedSegmentId]) : new Set<string>()), [selectedSegmentId]);

  // 点击时间轴空白处时清除字幕与 TTS 选中
  const handlersWithClearSelection = useMemo(
    () => ({
      ...handlers,
      onMouseDown: (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-segment]') && !target.closest('[data-tts-block]') && !target.closest('[data-clip-block]') && !target.closest('[data-media-block]')) {
          setSelectedSegmentId(null);
          setSelectedTTS(null);
          setSelectedClipId(null);
          setSelectedMediaSegmentId(null);
        }
        handlers.onMouseDown(e);
      }
    }),
    [handlers]
  );

  // 快捷键：Delete / Backspace 删除选中的字幕块或 TTS 块或媒体片段（不在输入框中时）
  useEffect(() => {
    const hasSubtitleTarget = onDeleteSegment && selectedSegmentId;
    const hasTTSTarget = onDeleteTTSSegment && selectedTTS;
    const hasClipTarget = clipCallbacks?.onClipDelete && selectedClipId;
    const hasMediaTarget = mediaCallbacks?.onSegmentDelete && selectedMediaSegmentId;
    if (!hasSubtitleTarget && !hasTTSTarget && !hasClipTarget && !hasMediaTarget) return;
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = document.activeElement as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      if (hasClipTarget && selectedClipId) {
        e.preventDefault();
        clipCallbacks?.onClipDelete?.(selectedClipId);
        setSelectedClipId(null);
        return;
      }
      if (hasMediaTarget && selectedMediaSegmentId) {
        e.preventDefault();
        const [trackId, segmentId] = selectedMediaSegmentId.split(':');
        mediaCallbacks?.onSegmentDelete?.(trackId, segmentId);
        setSelectedMediaSegmentId(null);
        return;
      }
      if (hasSubtitleTarget && selectedSegmentId) {
        const parsed = parseSegmentId(selectedSegmentId);
        if (!parsed) return;
        const { trackIndex, segmentIndex } = parsed;
        const track = tracksWithColors[trackIndex];
        if (!track || segmentIndex < 0 || segmentIndex >= track.segments.length) return;
        const segment = track.segments[segmentIndex];
        e.preventDefault();
        onDeleteSegment(segment, track.id);
        setSelectedSegmentId(null);
        return;
      }
      if (hasTTSTarget && selectedTTS) {
        e.preventDefault();
        onDeleteTTSSegment(selectedTTS.trackId, selectedTTS.index);
        setSelectedTTS(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDeleteSegment, selectedSegmentId, tracksWithColors, onDeleteTTSSegment, selectedTTS, clipCallbacks, selectedClipId, mediaCallbacks, selectedMediaSegmentId]);

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

  // 监听滚动容器宽度（用于波形轨道等固定宽度区域）
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setScrollContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(scrollContainer);
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

    // 只有当时间指示器完全不在视野内时才自动滚动；用 instant 避免动画导致跟随滞后
    if (currentX < viewStart || currentX > viewEnd) {
      scrollToTime(effectiveCurrentTime, true);
    }
  }, [effectiveCurrentTime, followCurrentTime, pixelsPerSecond, scrollLeft, timelineContentWidth, scrollToTime]);

  // 缩放控制按钮
  const handleZoomIn = useCallback(() => {
    handleZoom(DEFAULT_CONFIG.ZOOM_STEP);
  }, [handleZoom]);

  const handleZoomOut = useCallback(() => {
    handleZoom(1 / DEFAULT_CONFIG.ZOOM_STEP);
  }, [handleZoom]);

  // 轨道空白处点击：以点击时间为中心前后各 1.5 秒（共 3 秒）；空间不足则平移或缩短
  const handleTrackEmptyClick = useCallback(
    (trackId: string, clickTime: number) => {
      if (!onAddSegment) return;
      const track = tracksWithColors.find((t) => t.id === trackId);
      if (!track) return;
      const segs = track.segments;
      const total = duration;
      let gapStart = 0;
      const applyGap = (gapEnd: number) => {
        const gapDuration = gapEnd - gapStart;
        if (gapDuration < 1) return;
        let startTime: number;
        let endTime: number;
        if (gapDuration >= 3) {
          const idealStart = clickTime - 1.5;
          const idealEnd = clickTime + 1.5;
          if (idealStart < gapStart) {
            startTime = gapStart;
            endTime = gapStart + 3;
          } else if (idealEnd > gapEnd) {
            endTime = gapEnd;
            startTime = gapEnd - 3;
          } else {
            startTime = idealStart;
            endTime = idealEnd;
          }
        } else {
          startTime = gapStart;
          endTime = gapEnd;
        }
        setSelectedSegmentId(null);
        setPendingNewSegment({ trackId, startTime, endTime });
      };
      for (const seg of segs) {
        if (clickTime < seg.startTime) {
          applyGap(seg.startTime);
          return;
        }
        gapStart = Math.max(gapStart, seg.endTime);
      }
      if (clickTime >= gapStart && clickTime < total) {
        applyGap(total);
      }
    },
    [onAddSegment, tracksWithColors, duration]
  );

  const handleAddSegmentConfirm = useCallback(
    (trackId: string, startTime: number, endTime: number, text: string) => {
      onAddSegment?.(trackId, startTime, endTime, text);
      setPendingNewSegment(null);
    },
    [onAddSegment]
  );

  const handleCancelNewSegment = useCallback(() => {
    setPendingNewSegment(null);
  }, []);

  return (
    <TimelineAdapterProvider adapters={adapters}>
      <div ref={containerRef} className={clsx('flex flex-col bg-background border rounded-lg overflow-hidden select-none h-full', className)}>
        {/* 工具栏 */}
        <div className="flex items-center justify-between px-2 py-1 border-b bg-muted/30 shrink-0">
          <div className="flex items-center gap-2 flex-1">
            <Button variant="ghost" size="sm" className="w-8 h-8 p-0 shrink-0" onClick={handleZoomOut} title={labels.zoomOut}>
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
                title={labels.zoomLevel.replace('{value}', pixelsPerSecond.toFixed(0))}
              />
            </div>

            <Button variant="ghost" size="sm" className="w-8 h-8 p-0 shrink-0" onClick={handleZoomIn} title={labels.zoomIn}>
              <TbPlus className="w-4 h-4" />
            </Button>

            {/* 剪辑工具（从剪辑轨道标签移至顶部工具栏） */}
            {clipTrackData && (
              <>
                <div className="w-px h-5 bg-border mx-1" />
                <div className="flex items-center gap-0.5">
                  <Button
                    variant={internalClipTool === 'select' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="w-7 h-7 p-0"
                    onClick={() => (clipCallbacks?.onClipToolChange ?? setInternalClipTool)('select')}
                    title={labels.selectTool}
                  >
                    <TbPointer className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant={internalClipTool === 'cut' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="w-7 h-7 p-0"
                    onClick={() => (clipCallbacks?.onClipToolChange ?? setInternalClipTool)('cut')}
                    title={labels.cutTool}
                  >
                    <TbScissors className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </>
            )}

            {/* 媒体工具 */}
            {mediaTracks && mediaTracks.length > 0 && (
              <>
                <div className="w-px h-5 bg-border mx-1" />
                <div className="flex items-center gap-0.5">
                  <Button
                    variant={internalMediaTool === 'select' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="w-7 h-7 p-0"
                    onClick={() => (mediaCallbacks?.onToolChange ?? setInternalMediaTool)('select')}
                    title={labels.selectTool}
                  >
                    <TbPointer className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant={internalMediaTool === 'cut' ? 'secondary' : 'ghost'}
                    size="sm"
                    className="w-7 h-7 p-0"
                    onClick={() => (mediaCallbacks?.onToolChange ?? setInternalMediaTool)('cut')}
                    title={labels.cutTool}
                  >
                    <TbScissors className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" className="w-7 h-7 p-0" onClick={() => setShowMediaImport(true)} title={labels.importMedia}>
                    <TbFileImport className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="text-xs text-muted-foreground">
              {labels.trackCount.replace('{count}', String(tracks.length))} · {labels.segmentCount.replace('{count}', String(tracks.reduce((sum, t) => sum + t.segments.length, 0)))}
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

        {/* 主内容区域 */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* 左侧轨道标签（固定） */}
          {showTrackLabels && (
            <div className="flex flex-col shrink-0 border-r" style={{ width: trackLabelWidth }}>
              {/* 标签区域顶部占位（对应时间刻度） */}
              {showRuler && <div className="border-b bg-muted/30 shrink-0" style={{ height: DEFAULT_CONFIG.RULER_HEIGHT }} />}

              {showTrackLabels && showWaveformTrack && (
                <div className="flex items-center gap-1 px-2 border-b border-r bg-muted/30 shrink-0 box-border" style={{ width: trackLabelWidth, height: effectiveWaveformHeight }}>
                  <TbWaveSine className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground truncate">{waveformClipOverlay ? labels.waveformClip : labels.waveform}</span>
                </div>
              )}

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
                      <TrackLabel
                        track={track}
                        index={index}
                        allowDelete={track.id !== 'track-0' && !!onDeleteSubtitleTrack}
                        onDelete={onDeleteSubtitleTrack}
                        onToggleEnabled={onToggleSubtitleTrackEnabled}
                      />
                      {/* TTS轨道标签（如果有） */}
                      {hasTTSTrack && (
                        <TTSTrackLabel
                          trackLabel={track.label}
                          trackColor={track.color}
                          ttsTrackId={ttsTrackId}
                          onDelete={onDeleteTTSTrack}
                          enabled={ttsTrackEnabledMap?.get(ttsTrackId) !== false}
                          onToggleEnabled={onToggleTTSTrackEnabled}
                          onOpenSettings={onOpenTTSSettings}
                          voiceLabel={ttsVoiceLabels?.get(ttsTrackId)}
                        />
                      )}
                    </React.Fragment>
                  );
                })}

              {/* 独立 TTS 轨道标签 */}
              {showTTSTrack &&
                standaloneTTSTracks?.map((stt) => {
                  const items = ttsItemsByTrack?.get(stt.id);
                  return (
                    <TTSTrackLabel
                      key={`standalone-tts-label-${stt.id}`}
                      trackLabel={stt.label}
                      trackColor={stt.color ?? TRACK_COLORS[(tracksWithColors.length + standaloneTTSTracks.indexOf(stt)) % TRACK_COLORS.length]}
                      ttsTrackId={stt.id}
                      onDelete={onDeleteTTSTrack}
                      enabled={ttsTrackEnabledMap?.get(stt.id) !== false}
                      onToggleEnabled={onToggleTTSTrackEnabled}
                      onOpenSettings={onOpenTTSSettings}
                      voiceLabel={ttsVoiceLabels?.get(stt.id)}
                    />
                  );
                })}

              {annotationTrackData && <AnnotationTrackLabel annotationCount={annotationTrackData.annotations.length} enabled={annotationTrackEnabled} />}

              {clipTrackData && !waveformClipOverlay && (
                <div
                  className={clsx('flex items-center gap-1.5 px-2 border-b border-r bg-muted/30 shrink-0 box-border', !clipTrackEnabled && 'opacity-40')}
                  style={{ width: trackLabelWidth, height: DEFAULT_CONFIG.CLIP_TRACK_HEIGHT + DEFAULT_CONFIG.TRACK_GAP }}
                >
                  <div className="w-1.5 h-4 rounded-full shrink-0 bg-cyan-500" />
                  <span className="text-xs text-foreground/80 truncate flex-1">{labels.clip}</span>
                  <span className="text-[10px] text-muted-foreground">{clipTrackData.clips.length}</span>
                </div>
              )}

              {/* 媒体轨道标签 */}
              {mediaTracks &&
                mediaTracks.map((mediaTrack) => (
                  <MediaTrackLabel
                    key={mediaTrack.id}
                    track={mediaTrack}
                    canDelete={mediaTracks.length > 1}
                    onDelete={mediaCallbacks?.onTrackDelete}
                    onToggleVisibility={(trackId) => {
                      mediaCallbacks?.onTrackReorder?.(mediaTracks.map((t) => t.id));
                    }}
                  />
                ))}

              {/* 添加轨道菜单 */}
              <TrackAddMenu onAddMediaTrack={mediaCallbacks?.onTrackAdd} onAddSubtitleTrack={onAddSubtitleTrack} onAddTTSTrack={onAddTTSTrack} />
            </div>
          )}

          {/* 右侧时间轴内容区域（可滚动） */}
          <div
            ref={scrollContainerRef}
            className={clsx('flex-1 overflow-x-auto overflow-y-hidden', isDragging && 'cursor-grabbing')}
            style={{
              backgroundImage: 'radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)',
              backgroundSize: '20px 20px'
            }}
            {...handlersWithClearSelection}
          >
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

              {/* 波形轨道（固定在顶部，不随字幕轨道垂直滚动）+ 剪辑轨道叠加 */}
              {showWaveformTrack && (
                <>
                  <div className="h-0 w-0">
                    <div className="absolute" style={{ width: scrollContainerWidth }}>
                      <WaveformTrack
                        waveformData={waveform?.data}
                        isLoading={waveform?.loading}
                        error={waveform?.error}
                        totalWidth={totalWidth}
                        duration={duration}
                        height={effectiveWaveformHeight}
                        pixelsPerSecond={pixelsPerSecond}
                        viewport={viewport}
                        currentTime={effectiveCurrentTime}
                        scrollLeft={scrollLeft}
                        onSeek={handleSeekUnified}
                      />
                    </div>
                  </div>
                  <div className="w-full" style={{ height: effectiveWaveformHeight }}>
                    {/* 剪辑轨道叠加在波形上方 */}
                    {waveformClipOverlay && (
                      <ClipTrack
                        overlay
                        clips={clipTrackData.clips}
                        sourceDuration={clipTrackData.sourceDuration}
                        pixelsPerSecond={pixelsPerSecond}
                        width={totalWidth}
                        currentTime={effectiveCurrentTime}
                        activeTool={internalClipTool}
                        selectedClipId={selectedClipId}
                        onCut={clipCallbacks?.onClipCut}
                        onDelete={clipCallbacks?.onClipDelete}
                        onRestore={clipCallbacks?.onClipRestore}
                        onSpeedChange={clipCallbacks?.onClipSpeedChange}
                        onMoveUp={handleClipMoveUp}
                        onMoveDown={handleClipMoveDown}
                        onClipSelect={(id: string) => {
                          setSelectedSegmentId(null);
                          setSelectedTTS(null);
                          setSelectedClipId(id);
                        }}
                        disabled={!clipTrackEnabled}
                        height={effectiveWaveformHeight}
                      />
                    )}
                  </div>
                </>
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
                        selectedIds={selectedIds}
                        scrollLeft={scrollLeft}
                        pendingNewSegment={pendingNewSegment?.trackId === track.id ? { startTime: pendingNewSegment.startTime, endTime: pendingNewSegment.endTime } : null}
                        onTrackEmptyClick={handleTrackEmptyClick}
                        onAddSegmentConfirm={handleAddSegmentConfirm}
                        onCancelNewSegment={handleCancelNewSegment}
                        allowAddSegment={!!onAddSegment}
                        onMergePrev={onMergePrev}
                        onSegmentClick={handleSegmentClick}
                        onSegmentDoubleClick={handleSegmentDoubleClick}
                        onSegmentTextChange={onSegmentTextChange}
                        onSegmentTimeChange={onSegmentTimeChange}
                        onDeleteSegment={onDeleteSegment}
                        disabled={disabled || track.locked || track.enabled === false}
                        wordsMap={wordsMapByTrack?.get(track.id)}
                      />
                      {/* TTS轨道内容（如果有） */}
                      {hasTTSTrack && (
                        <TTSAudioTrack
                          key={`tts-${ttsTrackId}`}
                          ttsTrackId={ttsTrackId}
                          items={ttsItems ?? []}
                          viewport={viewport}
                          totalDuration={duration}
                          pixelsPerSecond={pixelsPerSecond}
                          width={totalWidth}
                          currentTime={effectiveCurrentTime}
                          trackLabelWidth={0}
                          showTrackLabel={false}
                          selectedIndex={selectedTTS?.trackId === ttsTrackId ? selectedTTS.index : null}
                          onBlockSelect={(index) => {
                            setSelectedSegmentId(null);
                            setSelectedTTS({ trackId: ttsTrackId, index });
                          }}
                          onPlayAudio={onPlayTTSAudio}
                          onStopAudio={onStopTTSAudio}
                          playingIndex={playingTTSIndex}
                          onTimeChange={(index, newStartTime, newEndTime) => onTTSTimeChange?.(ttsTrackId, index, newStartTime, newEndTime)}
                          maxDuration={duration}
                          onDeleteSegment={onDeleteTTSSegment ? (item) => onDeleteTTSSegment(ttsTrackId, item.index) : undefined}
                          disabled={ttsTrackEnabledMap?.get(ttsTrackId) === false}
                        />
                      )}
                    </React.Fragment>
                  );
                })}

              {/* 独立 TTS 轨道内容 */}
              {showTTSTrack &&
                standaloneTTSTracks?.map((stt) => {
                  const items = ttsItemsByTrack?.get(stt.id) ?? [];
                  return (
                    <TTSAudioTrack
                      key={`standalone-tts-content-${stt.id}`}
                      ttsTrackId={stt.id}
                      items={items}
                      viewport={viewport}
                      totalDuration={duration}
                      pixelsPerSecond={pixelsPerSecond}
                      width={totalWidth}
                      currentTime={effectiveCurrentTime}
                      trackLabelWidth={0}
                      showTrackLabel={false}
                      selectedIndex={selectedTTS?.trackId === stt.id ? selectedTTS.index : null}
                      onBlockSelect={(index) => {
                        setSelectedSegmentId(null);
                        setSelectedTTS({ trackId: stt.id, index });
                      }}
                      onPlayAudio={onPlayTTSAudio}
                      onStopAudio={onStopTTSAudio}
                      playingIndex={playingTTSIndex}
                      onTimeChange={(index, newStartTime, newEndTime) => onTTSTimeChange?.(stt.id, index, newStartTime, newEndTime)}
                      maxDuration={duration}
                      onDeleteSegment={onDeleteTTSSegment ? (item) => onDeleteTTSSegment(stt.id, item.index) : undefined}
                      disabled={ttsTrackEnabledMap?.get(stt.id) === false}
                      allowAddSegment={!!onAddTTSSegment}
                      onAddSegment={onAddTTSSegment ? (startTime, endTime) => onAddTTSSegment(stt.id, startTime, endTime) : undefined}
                      onBlockDoubleClick={onTTSBlockDoubleClick ? (item) => onTTSBlockDoubleClick(stt.id, item) : undefined}
                    />
                  );
                })}

              {annotationTrackData && (
                <AnnotationTrack
                  annotations={annotationTrackData.annotations}
                  totalWidth={totalWidth}
                  pixelsPerSecond={pixelsPerSecond}
                  viewport={viewport}
                  callbacks={annotationCallbacks}
                  enabled={annotationTrackEnabled}
                />
              )}

              {clipTrackData && !waveformClipOverlay && (
                <ClipTrack
                  clips={clipTrackData.clips}
                  sourceDuration={clipTrackData.sourceDuration}
                  pixelsPerSecond={pixelsPerSecond}
                  width={totalWidth}
                  currentTime={effectiveCurrentTime}
                  activeTool={internalClipTool}
                  selectedClipId={selectedClipId}
                  onCut={clipCallbacks?.onClipCut}
                  onDelete={clipCallbacks?.onClipDelete}
                  onRestore={clipCallbacks?.onClipRestore}
                  onSpeedChange={clipCallbacks?.onClipSpeedChange}
                  onMoveUp={handleClipMoveUp}
                  onMoveDown={handleClipMoveDown}
                  onClipSelect={(id: string) => {
                    setSelectedSegmentId(null);
                    setSelectedTTS(null);
                    setSelectedClipId(id);
                  }}
                  disabled={!clipTrackEnabled}
                />
              )}

              {/* 媒体轨道 */}
              {mediaTracks && mediaTracks.length > 0 && (
                <MediaTrackManager
                  tracks={mediaTracks}
                  sources={mediaSources}
                  viewport={viewport}
                  pixelsPerSecond={pixelsPerSecond}
                  width={totalWidth}
                  scrollLeft={scrollLeft}
                  currentTime={effectiveCurrentTime}
                  activeTool={internalMediaTool}
                  selectedSegmentId={selectedMediaSegmentId}
                  onSegmentClick={(trackId, segmentId) => {
                    setSelectedSegmentId(null);
                    setSelectedTTS(null);
                    setSelectedClipId(null);
                    setSelectedMediaSegmentId(`${trackId}:${segmentId}`);
                    mediaCallbacks?.onSegmentSelect?.(trackId, segmentId);
                  }}
                  onSegmentDelete={(trackId, segmentId) => {
                    mediaCallbacks?.onSegmentDelete?.(trackId, segmentId);
                    setSelectedMediaSegmentId(null);
                  }}
                  onSegmentRestore={(trackId, segmentId) => {
                    mediaCallbacks?.onSegmentRestore?.(trackId, segmentId);
                  }}
                  onSegmentMove={(trackId, segmentId, newTimelineStart) => {
                    mediaCallbacks?.onSegmentMove?.(trackId, segmentId, newTimelineStart);
                  }}
                  onSegmentResize={(trackId, segmentId, edge, newTime) => {
                    mediaCallbacks?.onSegmentResize?.(trackId, segmentId, edge, newTime);
                  }}
                  onSegmentCut={(trackId, timelineTime) => {
                    mediaCallbacks?.onSegmentCut?.(trackId, timelineTime);
                  }}
                  onQuickAdd={(trackId, sources, segments) => {
                    // 1. 先添加媒体源
                    mediaCallbacks?.onSourceAdd?.(sources);
                    // 2. 添加片段到轨道
                    if (segments.length > 0) {
                      segments.forEach((segment) => {
                        mediaCallbacks?.onSegmentAdd?.(trackId, segment);
                      });
                    }
                  }}
                />
              )}
            </div>
          </div>
        </div>

        {/* 媒体导入面板 */}
        <MediaImportPanel
          open={showMediaImport}
          onClose={() => setShowMediaImport(false)}
          tracks={mediaTracks ?? []}
          currentTime={effectiveCurrentTime}
          duration={duration}
          onImport={(sources: MediaSource[], segments?: Omit<MediaSegment, 'id'>[]) => {
            // 1. 先添加媒体源
            mediaCallbacks?.onSourceAdd?.(sources);

            // 2. 添加 segments 到轨道（onSegmentAdd 会自动创建轨道如果不存在）
            if (segments && segments.length > 0) {
              const targetTrackId = mediaTracks && mediaTracks.length > 0 ? mediaTracks[0].id : 'auto-create';
              segments.forEach((segment) => {
                mediaCallbacks?.onSegmentAdd?.(targetTrackId, segment);
              });
            }
            setShowMediaImport(false);
          }}
        />
      </div>
    </TimelineAdapterProvider>
  );
};
