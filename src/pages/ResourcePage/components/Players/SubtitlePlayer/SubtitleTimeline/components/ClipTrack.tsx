import clsx from 'clsx';
import React, { useCallback, useMemo, useRef } from 'react';
import { TbArrowBackUp } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import type { ClipSegment, ClipTool } from '../types';
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
  /** 启用/禁用切换 */
  onToggleDisabled?: (clipId: string) => void;
  /** 片段点击（选中） */
  onClipSelect?: (clipId: string) => void;
}

/**
 * ClipTrack - 剪辑轨道组件（源时间布局）
 *
 * 片段按源时间位置排列，与字幕/TTS 轨道共享同一时间轴。
 * 已删除的片段显示为带斜线的空白区域，可以恢复。
 */
export const ClipTrack: React.FC<ClipTrackProps> = ({
  clips,
  pixelsPerSecond,
  width,
  currentTime,
  activeTool = 'select',
  selectedClipId,
  onCut,
  onDelete,
  onRestore,
  onSpeedChange,
  onToggleDisabled,
  onClipSelect
}) => {
  const trackRef = useRef<HTMLDivElement>(null);

  const sequence = useMemo(() => new ClipSequence(clips), [clips]);
  const allInfos = useMemo(() => sequence.getAllPlaybackInfos(), [sequence]);

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

      {/* 渲染所有片段（含已删除的） */}
      {allInfos.map((info) =>
        info.clip.deleted ? (
          <div
            key={info.clip.id}
            data-clip-block={info.clip.id}
            className={clsx('absolute flex items-center justify-center', 'border border-dashed rounded opacity-40', selectedClipId === info.clip.id && 'ring-2 ring-orange-400 opacity-60')}
            style={{
              left: info.playStart * pixelsPerSecond,
              width: Math.max(DEFAULT_CONFIG.SEGMENT_MIN_WIDTH, info.playDuration * pixelsPerSecond),
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
            playStart={info.playStart}
            playEnd={info.playEnd}
            pixelsPerSecond={pixelsPerSecond}
            trackHeight={trackHeight}
            isSelected={selectedClipId === info.clip.id}
            isActive={activeClipInfo?.clipId === info.clip.id}
            activeProgress={activeClipInfo?.clipId === info.clip.id ? activeClipInfo.progress : 0}
            isDisabled={!!info.clip.disabled}
            activeTool={activeTool}
            onClick={handleClipClick}
            onDelete={onDelete}
            onSpeedChange={onSpeedChange}
            onToggleDisabled={onToggleDisabled}
          />
        )
      )}

      {activeTool === 'cut' && <div className="absolute inset-0 pointer-events-none z-30" />}
    </div>
  );
};
