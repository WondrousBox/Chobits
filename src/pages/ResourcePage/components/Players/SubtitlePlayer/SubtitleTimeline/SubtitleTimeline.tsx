import clsx from 'clsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbBookmark, TbLetterT, TbMinus, TbMusic, TbPlayerPause, TbPlayerPlay, TbPlus, TbPointer, TbRewindBackward5, TbRewindForward5, TbScissors, TbWaveSine } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

import { DEFAULT_LABELS } from './adapters/defaults';
import {
  AnnotationTrack,
  ClipTrack,
  ClipTrackLabel,
  MediaTrackLabel,
  MediaTrackManager,
  SeekBar,
  TimecodeControl,
  TimelineTrackView,
  TimeRuler,
  TrackAddMenu,
  TTSAudioTrack,
  WaveformTrack
} from './components';
import { CommonTrackLabel } from './components';
import { TimelineAdapterProvider } from './context';
import { useTimelineInteraction } from './hooks';
import type { TimelineSegment } from './types';
import { ClipTool, DEFAULT_CONFIG, SubtitleTimelineProps, TRACK_COLORS, ViewportState } from './types';
import { parseSegmentId } from './utils';

const audioWaveformHeight = 40;
const SCROLL_SYNC_THRESHOLD_PX = 0.5;
const SEEK_SYNC_THRESHOLD_SECONDS = 0.001;

function isEditableElement(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  const tagName = element.tagName.toLowerCase();

  return element.isContentEditable || tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

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
  isPlaying = false,
  onTogglePlayback,
  followCurrentTime = 'center',
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
  pendingTTSSegment,
  onAddTTSSegmentConfirm,
  onCancelTTSSegment,
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
  onTTSTextChange,
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
  onOpenTTSBatchInput,
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
  // Adapters
  adapters
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollLeftRef = useRef(0);
  const scrollStateRafRef = useRef<number | null>(null);
  const scrollToTimeRafRef = useRef<number | null>(null);
  const panSeekRafRef = useRef<number | null>(null);
  const pendingPanSeekTimeRef = useRef<number | null>(null);
  const suppressScrollSeekRafRef = useRef<number | null>(null);
  const effectiveCurrentTimeRef = useRef(0);
  const isPlayingRef = useRef(isPlaying);
  const resumePlaybackAfterPanRef = useRef(false);
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
  /** 选中的轨道 ID（用于高亮显示轨道标签） */
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

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
  const followMode = followCurrentTime;
  effectiveCurrentTimeRef.current = effectiveCurrentTime;
  isPlayingRef.current = isPlaying;

  const getViewportWidth = useCallback(
    (scrollContainer: HTMLDivElement): number => {
      return scrollContainer.clientWidth || scrollContainerWidth || timelineContentWidth;
    },
    [scrollContainerWidth, timelineContentWidth]
  );

  const getViewportCenterTime = useCallback(
    (scrollContainer: HTMLDivElement): number => {
      const viewportWidth = getViewportWidth(scrollContainer);
      return Math.max(0, Math.min(duration, (scrollContainer.scrollLeft + viewportWidth / 2) / pixelsPerSecond));
    },
    [duration, getViewportWidth, pixelsPerSecond]
  );

  const seekViewportCenter = useCallback(
    (scrollContainer: HTMLDivElement) => {
      const nextTime = getViewportCenterTime(scrollContainer);
      pendingPanSeekTimeRef.current = nextTime;
      if (Math.abs(nextTime - effectiveCurrentTimeRef.current) < SEEK_SYNC_THRESHOLD_SECONDS) return;
      if (panSeekRafRef.current !== null) return;

      panSeekRafRef.current = window.requestAnimationFrame(() => {
        panSeekRafRef.current = null;
        const pendingTime = pendingPanSeekTimeRef.current;
        pendingPanSeekTimeRef.current = null;
        if (pendingTime === null || Math.abs(pendingTime - effectiveCurrentTimeRef.current) < SEEK_SYNC_THRESHOLD_SECONDS) return;
        handleSeekUnified(pendingTime);
      });
    },
    [getViewportCenterTime, handleSeekUnified]
  );

  // 滚动到指定时间。instant 为 true 时无动画、瞬间到位，用于跟随当前时间，避免滞后
  const scrollToTime = useCallback(
    (time: number, instant = false) => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) return;

      const applyScroll = (): void => {
        const currentScrollContainer = scrollContainerRef.current;
        if (!currentScrollContainer) return;

        const maxScrollLeft = Math.max(0, currentScrollContainer.scrollWidth - currentScrollContainer.clientWidth);
        const targetScrollLeft = Math.min(maxScrollLeft, Math.max(0, time * pixelsPerSecond - getViewportWidth(currentScrollContainer) / 2));
        if (Math.abs(currentScrollContainer.scrollLeft - targetScrollLeft) < SCROLL_SYNC_THRESHOLD_PX) return;

        if (suppressScrollSeekRafRef.current !== null) {
          window.cancelAnimationFrame(suppressScrollSeekRafRef.current);
        }
        if (instant) {
          currentScrollContainer.scrollLeft = targetScrollLeft;
        } else {
          currentScrollContainer.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
        }
        suppressScrollSeekRafRef.current = window.requestAnimationFrame(() => {
          suppressScrollSeekRafRef.current = null;
        });
      };

      if (instant) {
        if (scrollToTimeRafRef.current !== null) {
          window.cancelAnimationFrame(scrollToTimeRafRef.current);
        }
        scrollToTimeRafRef.current = window.requestAnimationFrame(() => {
          scrollToTimeRafRef.current = null;
          applyScroll();
        });
        return;
      }

      applyScroll();
    },
    [getViewportWidth, pixelsPerSecond]
  );

  // 缩放处理
  useEffect(() => {
    return () => {
      if (scrollToTimeRafRef.current !== null) {
        window.cancelAnimationFrame(scrollToTimeRafRef.current);
        scrollToTimeRafRef.current = null;
      }
      if (panSeekRafRef.current !== null) {
        window.cancelAnimationFrame(panSeekRafRef.current);
        panSeekRafRef.current = null;
      }
      if (suppressScrollSeekRafRef.current !== null) {
        window.cancelAnimationFrame(suppressScrollSeekRafRef.current);
        suppressScrollSeekRafRef.current = null;
      }
      resumePlaybackAfterPanRef.current = false;
    };
  }, []);

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
        const targetScrollLeft = Math.max(0, newScrollLeft);
        if (Math.abs(scrollContainer.scrollLeft - targetScrollLeft) >= SCROLL_SYNC_THRESHOLD_PX) {
          scrollContainer.scrollLeft = targetScrollLeft;
          scrollLeftRef.current = targetScrollLeft;
        }
      });
    },
    [scrollLeft, timelineContentWidth, pixelsPerSecond, minPixelsPerSecond, maxPixelsPerSecond]
  );

  // 平移处理（用于拖拽）
  const handlePan = useCallback(
    (deltaPixels: number) => {
      const scrollContainer = scrollContainerRef.current;
      if (!scrollContainer) return;

      scrollContainer.scrollLeft += deltaPixels;
      scrollLeftRef.current = scrollContainer.scrollLeft;

      if (followMode === 'center') {
        seekViewportCenter(scrollContainer);
      }
    },
    [followMode, seekViewportCenter]
  );

  const handlePanStart = useCallback(() => {
    resumePlaybackAfterPanRef.current = isPlayingRef.current && !!onTogglePlayback;
    if (resumePlaybackAfterPanRef.current) {
      onTogglePlayback?.();
    }
  }, [onTogglePlayback]);

  const handlePanEnd = useCallback(() => {
    if (!resumePlaybackAfterPanRef.current) return;
    resumePlaybackAfterPanRef.current = false;
    window.requestAnimationFrame(() => {
      onTogglePlayback?.();
    });
  }, [onTogglePlayback]);

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
          const targetScrollLeft = Math.max(0, newScrollLeft);
          if (Math.abs(scrollContainer.scrollLeft - targetScrollLeft) >= SCROLL_SYNC_THRESHOLD_PX) {
            scrollContainer.scrollLeft = targetScrollLeft;
            scrollLeftRef.current = targetScrollLeft;
          }
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
    onPanStart: handlePanStart,
    onPanEnd: handlePanEnd,
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
      if (isEditableElement(document.activeElement)) return;
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
      const nextScrollLeft = scrollContainer.scrollLeft;
      scrollLeftRef.current = nextScrollLeft;

      if (scrollStateRafRef.current !== null) return;
      scrollStateRafRef.current = window.requestAnimationFrame(() => {
        scrollStateRafRef.current = null;
        setScrollLeft((prev) => (Math.abs(prev - scrollLeftRef.current) < SCROLL_SYNC_THRESHOLD_PX ? prev : scrollLeftRef.current));
      });

      if (followMode === 'center' && suppressScrollSeekRafRef.current === null) {
        seekViewportCenter(scrollContainer);
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
      if (scrollStateRafRef.current !== null) {
        window.cancelAnimationFrame(scrollStateRafRef.current);
        scrollStateRafRef.current = null;
      }
    };
  }, [followMode, seekViewportCenter]);

  // 当前时间改变时，检查是否需要滚动到可见区域
  useEffect(() => {
    if (followMode !== 'center' || effectiveCurrentTime === undefined) return;

    scrollToTime(effectiveCurrentTime, true);
  }, [effectiveCurrentTime, followMode, scrollToTime]);

  useEffect(() => {
    if (followMode !== 'visibility' || effectiveCurrentTime === undefined) return;
    const currentX = effectiveCurrentTime * pixelsPerSecond;
    const viewStart = scrollLeft;
    const viewEnd = scrollLeft + timelineContentWidth;

    if (currentX < viewStart || currentX > viewEnd) {
      scrollToTime(effectiveCurrentTime, true);
    }
  }, [effectiveCurrentTime, followMode, pixelsPerSecond, scrollLeft, timelineContentWidth, scrollToTime]);

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

  const totalSegmentCount = useMemo(() => tracks.reduce((sum, t) => sum + t.segments.length, 0), [tracks]);
  const trackSegmentSummary = useMemo(() => {
    const trackCount = labels.trackCount.replace('{count}', String(tracks.length));
    const segmentCount = labels.segmentCount.replace('{count}', String(totalSegmentCount));
    return labels.trackSegmentSummary.replace('{tracks}', trackCount).replace('{segments}', segmentCount);
  }, [labels, totalSegmentCount, tracks.length]);

  const handleSeekBackward = useCallback(() => {
    handleSeekUnified(effectiveCurrentTime - 5);
  }, [effectiveCurrentTime, handleSeekUnified]);

  const handleSeekForward = useCallback(() => {
    handleSeekUnified(effectiveCurrentTime + 5);
  }, [effectiveCurrentTime, handleSeekUnified]);

  return (
    <TimelineAdapterProvider adapters={adapters}>
      <div ref={containerRef} className={clsx('flex flex-col bg-background border rounded-lg overflow-hidden select-none h-full', className)}>
        {/* 工具栏 */}
        <div className="flex items-center border-b bg-muted/30 shrink-0">
          {showTrackLabels && (
            <div className="flex items-center self-stretch px-2 border-r shrink-0 box-border" style={{ width: trackLabelWidth }}>
              <div className="text-xs text-muted-foreground truncate">{trackSegmentSummary}</div>
            </div>
          )}

          <div className="relative flex flex-1 items-center justify-between px-2 py-1 min-w-0">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {/* 剪辑工具（从剪辑轨道标签移至顶部工具栏） */}
              {clipTrackData && (
                <>
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
            </div>

            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <TimecodeControl currentTime={effectiveCurrentTime} duration={duration} onSeek={handleSeekUnified} />
            </div>

            <div className="flex items-center gap-2 w-40">
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
            </div>
          </div>
        </div>

        {/* SeekBar - 播放进度条和字幕片段概览 */}
        <div className="flex items-center border-b bg-muted/30 shrink-0">
          {showTrackLabels && (
            <div className="flex items-center justify-center self-stretch gap-1 px-2 border-r shrink-0 box-border" style={{ width: trackLabelWidth }}>
              <Button variant="ghost" size="sm" className="w-7 h-7 p-0" onClick={handleSeekBackward} title={labels.seekBackward5}>
                <TbRewindBackward5 />
              </Button>
              <Button variant="ghost" size="sm" className="w-7 h-7 p-0" onClick={onTogglePlayback} disabled={!onTogglePlayback} title={isPlaying ? labels.blockPause : labels.blockPlay}>
                {isPlaying ? <TbPlayerPause /> : <TbPlayerPlay />}
              </Button>
              <Button variant="ghost" size="sm" className="w-7 h-7 p-0" onClick={handleSeekForward} title={labels.seekForward5}>
                <TbRewindForward5 />
              </Button>
            </div>
          )}

          <SeekBar className="flex-1 border-b-0 min-w-0" duration={duration} currentTime={effectiveCurrentTime} segments={tracksWithColors[0]?.segments || []} onSeek={handleSeekUnified} />
        </div>

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
              {tracksWithColors.map((track, index) => {
                const ttsTrackId = subtitleToTTSTrackMap?.get(track.id);
                const ttsItems = ttsTrackId ? ttsItemsByTrack?.get(ttsTrackId) : undefined;
                // 如果有TTS项（包括正在合成的），或者正在合成这个轨道，则显示TTS轨道
                const hasTTSTrack = showTTSTrack && ttsTrackId && (ttsItems?.length ?? 0) > 0;

                return (
                  <React.Fragment key={track.id}>
                    {/* 字幕轨道标签 */}
                    <CommonTrackLabel
                      index={0}
                      track={{
                        id: track.id,
                        label: track.label,
                        color: track.color,
                        visible: track.visible,
                        selected: selectedTrackId === track.id,
                        segments: []
                      }}
                      onSelect={setSelectedTrackId}
                      onDelete={track.id !== 'track-0' ? onDeleteSubtitleTrack : undefined}
                      onToggleEnabled={onToggleSubtitleTrackEnabled}
                      icon={<TbLetterT />}
                    />
                    {/* TTS轨道标签（如果有） */}
                    {hasTTSTrack && (
                      <CommonTrackLabel
                        index={0}
                        track={{
                          id: ttsTrackId,
                          label: track.label,
                          color: track.color,
                          visible: ttsTrackEnabledMap?.get(ttsTrackId) !== false,
                          selected: selectedTrackId === ttsTrackId,
                          segments: [],
                          description: ttsVoiceLabels?.get(ttsTrackId)
                        }}
                        onSelect={setSelectedTrackId}
                        onDelete={onDeleteTTSTrack}
                        onToggleEnabled={onToggleTTSTrackEnabled}
                        onOpenSettings={onOpenTTSSettings}
                        icon={<TbMusic />}
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
                    <CommonTrackLabel
                      key={`standalone-tts-label-${stt.id}`}
                      index={0}
                      track={{
                        id: stt.id,
                        label: stt.label,
                        color: stt.color ?? TRACK_COLORS[(tracksWithColors.length + standaloneTTSTracks.indexOf(stt)) % TRACK_COLORS.length],
                        visible: ttsTrackEnabledMap?.get(stt.id) !== false,
                        selected: selectedTrackId === stt.id,
                        segments: [],
                        description: ttsVoiceLabels?.get(stt.id)
                      }}
                      onSelect={setSelectedTrackId}
                      onDelete={onDeleteTTSTrack}
                      onToggleEnabled={onToggleTTSTrackEnabled}
                      onOpenSettings={onOpenTTSSettings}
                      onLabelClick={onOpenTTSBatchInput}
                      icon={<TbMusic />}
                    />
                  );
                })}
              {annotationTrackData && (
                <CommonTrackLabel
                  index={0}
                  track={{
                    id: annotationTrackData.id,
                    label: annotationTrackData.label || labels.annotationDefaultLabel,
                    color: '#eab308',
                    visible: annotationTrackEnabled,
                    selected: selectedTrackId === annotationTrackData.id,
                    segments: []
                  }}
                  onSelect={setSelectedTrackId}
                  icon={<TbBookmark />}
                />
              )}
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
                    index={0}
                    track={{
                      ...mediaTrack,
                      selected: selectedTrackId === mediaTrack.id
                    }}
                    onSelect={setSelectedTrackId}
                    onDelete={mediaCallbacks?.onTrackDelete}
                    onToggleEnabled={(trackId) => {
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
                        width={totalWidth}
                        totalDuration={duration}
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
                        totalDuration={clipTrackData.sourceDuration}
                        pixelsPerSecond={pixelsPerSecond}
                        width={totalWidth}
                        currentTime={effectiveCurrentTime}
                        activeTool={internalClipTool}
                        selectedId={selectedClipId}
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
              {tracksWithColors.map((track) => {
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
                      disabled={disabled || track.locked || track.visible === false}
                      wordsMap={wordsMapByTrack?.get(track.id)}
                    />
                    {/* TTS轨道内容（如果有） */}
                    {hasTTSTrack && (
                      <TTSAudioTrack
                        key={`tts-${ttsTrackId}`}
                        trackId={ttsTrackId}
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
                        onTextChange={onTTSTextChange ? (index, newText) => onTTSTextChange(ttsTrackId, index, newText) : undefined}
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
                  const isPendingThisTrack = pendingTTSSegment?.trackId === stt.id;
                  return (
                    <TTSAudioTrack
                      key={`standalone-tts-content-${stt.id}`}
                      trackId={stt.id}
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
                      onTextChange={onTTSTextChange ? (index, newText) => onTTSTextChange(stt.id, index, newText) : undefined}
                      maxDuration={duration}
                      onDeleteSegment={onDeleteTTSSegment ? (item) => onDeleteTTSSegment(stt.id, item.index) : undefined}
                      disabled={ttsTrackEnabledMap?.get(stt.id) === false}
                      allowAddSegment={!!onAddTTSSegment}
                      onAddSegment={onAddTTSSegment ? (startTime, endTime) => onAddTTSSegment(stt.id, startTime, endTime) : undefined}
                      pendingNewSegment={isPendingThisTrack ? { startTime: pendingTTSSegment.startTime, endTime: pendingTTSSegment.endTime } : null}
                      onAddSegmentConfirm={onAddTTSSegmentConfirm ? (startTime, endTime, text) => onAddTTSSegmentConfirm(stt.id, startTime, endTime, text) : undefined}
                      onCancelNewSegment={onCancelTTSSegment}
                      onBlockDoubleClick={onTTSBlockDoubleClick ? (item) => onTTSBlockDoubleClick(stt.id, item) : undefined}
                    />
                  );
                })}

              {annotationTrackData && (
                <AnnotationTrack
                  annotations={annotationTrackData.annotations}
                  width={totalWidth}
                  pixelsPerSecond={pixelsPerSecond}
                  viewport={viewport}
                  callbacks={annotationCallbacks}
                  disabled={!annotationTrackEnabled}
                />
              )}

              {clipTrackData && !waveformClipOverlay && (
                <ClipTrack
                  clips={clipTrackData.clips}
                  totalDuration={clipTrackData.sourceDuration}
                  pixelsPerSecond={pixelsPerSecond}
                  width={totalWidth}
                  currentTime={effectiveCurrentTime}
                  activeTool={internalClipTool}
                  selectedId={selectedClipId}
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
      </div>
    </TimelineAdapterProvider>
  );
};
