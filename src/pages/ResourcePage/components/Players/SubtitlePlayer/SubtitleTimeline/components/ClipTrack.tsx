import clsx from 'clsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbArrowBackUp } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import type { ClipLayoutMode, ClipSegment, ClipTool } from '../types';
import { DEFAULT_CONFIG } from '../types';
import { ClipSequence } from '../utils';
import { ClipSegmentBlock } from './ClipSegmentBlock';

interface ClipTrackProps {
  /** 剪辑片段列表 */
  clips: ClipSegment[];
  /** 原始媒体总时长（秒） */
  sourceDuration: number;
  /** 每秒像素数 */
  pixelsPerSecond: number;
  /** 轨道总宽度 */
  width: number;
  /** 当前播放时间（源时间） */
  currentTime?: number;
  /** 当前激活的工具 */
  activeTool?: ClipTool;
  /** 选中的片段 ID */
  selectedClipId?: string | null;
  /** 在某个源时间点切割 */
  onCut?: (sourceTime: number) => void;
  /** 删除片段（软删除） */
  onDelete?: (clipId: string) => void;
  /** 恢复已删除的片段 */
  onRestore?: (clipId: string) => void;
  /** 变速变更 */
  onSpeedChange?: (clipId: string, playbackRate: number) => void;
  /** 片段点击（选中） */
  onClipSelect?: (clipId: string) => void;
  /** 上移回调 */
  onMoveUp?: (clipId: string) => void;
  /** 下移回调 */
  onMoveDown?: (clipId: string) => void;
  /** 布局模式 */
  layoutMode?: ClipLayoutMode;
  /** 音频文件路径（用于显示波形） */
  audioPath?: string;
}

interface WaveformData {
  peaks: number[];
  duration: number;
}

/**
 * ClipTrack - 剪辑轨道组件（源时间布局 + 乱序播放）
 *
 * 片段按源时间位置排列，与字幕/TTS 轨道共享同一时间轴。
 * 每个片段显示播放顺序号（order），支持通过上移/下移按钮调整播放顺序。
 * 已删除的片段显示为带斜线的空白区域，可以恢复。
 *
 * 布局模式：
 * - source-time: 按源时间位置排列（默认，与字幕轨道对齐）
 * - playback-order: 按播放顺序连续排列（符合直觉）
 */
export const ClipTrack: React.FC<ClipTrackProps> = ({
  clips,
  sourceDuration,
  pixelsPerSecond,
  width,
  currentTime,
  activeTool = 'select',
  selectedClipId,
  onCut,
  onDelete,
  onRestore,
  onSpeedChange,
  onClipSelect,
  onMoveUp,
  onMoveDown,
  layoutMode = 'source-time',
  audioPath
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [waveformData, setWaveformData] = useState<WaveformData | null>(null);
  const [isLoadingWaveform, setIsLoadingWaveform] = useState(false);

  const sequence = useMemo(() => new ClipSequence(clips), [clips]);
  const allInfos = useMemo(() => sequence.getAllPlaybackInfos(), [sequence]);
  const orderedClips = useMemo(() => sequence.getOrderedClips(), [sequence]);

  // 加载波形数据
  useEffect(() => {
    const loadWaveform = async () => {
      if (!audioPath || layoutMode !== 'source-time') {
        setWaveformData(null);
        return;
      }

      setIsLoadingWaveform(true);
      try {
        const samplesCount = Math.min(Math.max(5000, Math.ceil(sourceDuration * 200)), 100000);
        const result = await window.YUA.ffmpeg.extractWaveform({
          inputPath: audioPath,
          samplesCount
        });
        setWaveformData(result);
      } catch (err) {
        console.error('[ClipTrack] Failed to load waveform:', err);
        setWaveformData(null);
      } finally {
        setIsLoadingWaveform(false);
      }
    };

    loadWaveform();
  }, [audioPath, sourceDuration, layoutMode]);

  // 根据布局模式计算片段位置
  const clipLayouts = useMemo(() => {
    if (layoutMode === 'playback-order') {
      const activeClips = allInfos.filter((info) => !info.clip.deleted);
      let currentX = 0;
      const SEGMENT_GAP = 8;

      const layoutMap = new Map<string, { playStart: number; playEnd: number }>();

      activeClips.forEach((info) => {
        const segWidth = Math.max(DEFAULT_CONFIG.SEGMENT_MIN_WIDTH, info.playDuration * pixelsPerSecond);
        layoutMap.set(info.clip.id, {
          playStart: currentX / pixelsPerSecond,
          playEnd: (currentX + segWidth) / pixelsPerSecond
        });
        currentX += segWidth + SEGMENT_GAP;
      });

      return layoutMap;
    }

    return new Map<string, { playStart: number; playEnd: number }>();
  }, [layoutMode, allInfos, pixelsPerSecond]);

  // 构建 clipId -> orderIndex 的映射
  const orderIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    orderedClips.forEach((info, index) => {
      map.set(info.clip.id, index);
    });
    return map;
  }, [orderedClips]);

  const activeClipInfo = useMemo(() => {
    if (currentTime === undefined) return null;
    const mapping = sequence.playTimeToSource(currentTime);
    if (!mapping) return null;
    return { clipId: mapping.clipId, progress: mapping.progress };
  }, [sequence, currentTime]);

  // 裁剪工具：源时间布局下点击位置直接就是源时间
  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (activeTool !== 'cut' || !onCut) return;
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const sourceTime = x / pixelsPerSecond;
      onCut(sourceTime);
    },
    [activeTool, onCut, pixelsPerSecond]
  );

  const handleClipClick = useCallback(
    (clipId: string) => {
      onClipSelect?.(clipId);
    },
    [onClipSelect]
  );

  const trackHeight = DEFAULT_CONFIG.CLIP_TRACK_HEIGHT;
  const totalActiveClips = orderedClips.length;

  // 波形渲染（仅在源时间布局模式下显示）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveformData || layoutMode !== 'source-time') return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { peaks } = waveformData;
    if (!peaks || peaks.length === 0) return;

    const actualAudioDuration = waveformData.duration;
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = width;
    const displayHeight = trackHeight;

    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;
    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, displayWidth, displayHeight);

    const centerY = displayHeight / 2;
    const maxAmplitude = (displayHeight / 2) * 0.9;
    const BAR_WIDTH = 1;
    const BAR_GAP = 1;
    const BAR_STEP = BAR_WIDTH + BAR_GAP;

    const barsCount = Math.ceil(displayWidth / BAR_STEP);
    const timePerBar = actualAudioDuration / barsCount;
    const peakDuration = actualAudioDuration / peaks.length;

    ctx.fillStyle = 'hsla(210, 80%, 60%, 0.2)';

    for (let i = 0; i < barsCount; i++) {
      const barStartTime = i * timePerBar;
      const barEndTime = barStartTime + timePerBar;

      const startPeakIndex = Math.floor(barStartTime / peakDuration);
      const endPeakIndex = Math.ceil(barEndTime / peakDuration);

      let maxPeak = 0;
      let sumPeak = 0;
      let count = 0;

      for (let j = Math.max(0, startPeakIndex); j <= Math.min(peaks.length - 1, endPeakIndex); j++) {
        const peakValue = peaks[j] || 0;
        maxPeak = Math.max(maxPeak, peakValue);
        sumPeak += peakValue;
        count++;
      }

      const avgPeak = count > 0 ? sumPeak / count : 0;
      const displayPeak = maxPeak * 0.7 + avgPeak * 0.3;

      const x = i * BAR_STEP;
      const barHeight = Math.max(1, displayPeak * maxAmplitude * 2);
      const y = centerY - barHeight / 2;

      ctx.fillRect(x, y, BAR_WIDTH, barHeight);
    }
  }, [waveformData, width, trackHeight, layoutMode]);

  // 获取片段的渲染位置
  const getClipPosition = useCallback(
    (clipId: string, defaultPlayStart: number, defaultPlayEnd: number) => {
      if (layoutMode === 'playback-order') {
        const layout = clipLayouts.get(clipId);
        if (layout) {
          return { playStart: layout.playStart, playEnd: layout.playEnd };
        }
      }
      return { playStart: defaultPlayStart, playEnd: defaultPlayEnd };
    },
    [layoutMode, clipLayouts]
  );

  return (
    <div
      ref={trackRef}
      data-clip-track
      className={clsx('relative border-border', activeTool === 'cut' && 'cursor-crosshair')}
      style={{ height: trackHeight + DEFAULT_CONFIG.TRACK_GAP, width }}
      onClick={handleTrackClick}
    >
      {/* 背景 */}
      <div className="absolute inset-0 bg-background/50" />

      {/* 波形层（仅在源时间布局模式下显示） */}
      {layoutMode === 'source-time' && <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" style={{ top: DEFAULT_CONFIG.TRACK_GAP / 2 }} />}

      {/* 渲染所有片段（含已删除的） */}
      {allInfos.map((info) => {
        const position = getClipPosition(info.clip.id, info.playStart, info.playEnd);

        return info.clip.deleted ? (
          <div
            key={info.clip.id}
            data-clip-block={info.clip.id}
            className={clsx('absolute flex items-center justify-center', 'border border-dashed rounded opacity-40', selectedClipId === info.clip.id && 'ring-2 ring-orange-400 opacity-60')}
            style={{
              left: position.playStart * pixelsPerSecond,
              width: Math.max(DEFAULT_CONFIG.SEGMENT_MIN_WIDTH, (position.playEnd - position.playStart) * pixelsPerSecond),
              top: DEFAULT_CONFIG.TRACK_GAP / 2,
              height: trackHeight,
              borderColor: 'hsl(0, 60%, 50%)',
              borderRadius: DEFAULT_CONFIG.SEGMENT_BORDER_RADIUS,
              backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 3px, hsla(0, 60%, 50%, 0.15) 3px, hsla(0, 60%, 50%, 0.15) 6px)',
              cursor: activeTool === 'cut' ? 'crosshair' : 'pointer'
            }}
            onClick={(e) => {
              if (activeTool === 'cut') return;
              e.stopPropagation();
              onClipSelect?.(info.clip.id);
            }}
          >
            <span className="text-[9px] text-muted-foreground select-none">已删除</span>
            {selectedClipId === info.clip.id && onRestore && (
              <Button
                size="icon"
                variant="outline"
                className="absolute -top-3 right-0 w-6 h-6 rounded-full p-0 bg-background shadow-sm hover:bg-accent z-30"
                onClick={(e) => {
                  e.stopPropagation();
                  onRestore(info.clip.id);
                }}
                title="恢复片段"
              >
                <TbArrowBackUp className="w-3 h-3" />
              </Button>
            )}
          </div>
        ) : (
          <ClipSegmentBlock
            key={info.clip.id}
            clip={info.clip}
            playStart={position.playStart}
            playEnd={position.playEnd}
            pixelsPerSecond={pixelsPerSecond}
            trackHeight={trackHeight}
            orderIndex={orderIndexMap.get(info.clip.id)}
            totalActiveClips={totalActiveClips}
            isSelected={selectedClipId === info.clip.id}
            isActive={activeClipInfo?.clipId === info.clip.id}
            activeProgress={activeClipInfo?.clipId === info.clip.id ? activeClipInfo.progress : 0}
            activeTool={activeTool}
            onClick={handleClipClick}
            onDelete={onDelete}
            onSpeedChange={onSpeedChange}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
          />
        );
      })}

      {activeTool === 'cut' && <div className="absolute inset-0 pointer-events-none z-30" />}
    </div>
  );
};
