import clsx from 'clsx';
import React, { useCallback, useMemo, useRef } from 'react';

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
  /** 当前播放时间（播放序列时间，非源时间） */
  currentTime?: number;
  /** 当前激活的工具 */
  activeTool?: ClipTool;
  /** 选中的片段 ID */
  selectedClipId?: string | null;
  /** 在某个时间点切割 */
  onCut?: (sourceTime: number) => void;
  /** 删除片段 */
  onDelete?: (clipId: string) => void;
  /** 排序变更 */
  onReorder?: (orderedClipIds: string[]) => void;
  /** 变速变更 */
  onSpeedChange?: (clipId: string, playbackRate: number) => void;
  /** 启用/禁用切换 */
  onToggleDisabled?: (clipId: string) => void;
  /** 片段点击（选中） */
  onClipSelect?: (clipId: string) => void;
}

/**
 * ClipTrack - 剪辑轨道组件
 *
 * 显示按播放顺序排列的剪辑片段。
 * 支持裁剪工具（点击在源时间轴上切割）和片段拖拽排序。
 *
 * 注意：剪辑轨道的横轴表示的是"播放时间"而非"源时间"。
 * 片段按 order 顺序首尾相接排列，每个片段的宽度 = 源时长 / playbackRate * pixelsPerSecond。
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
  onReorder,
  onSpeedChange,
  onToggleDisabled,
  onClipSelect
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ clipId: string; startX: number; startOrder: number } | null>(null);

  // 构建 ClipSequence 以获取每个片段的播放位置
  const sequence = useMemo(() => new ClipSequence(clips), [clips]);
  const playbackInfos = useMemo(() => sequence.getPlaybackInfos(), [sequence]);

  // 当前正在播放的片段信息
  const activeClipInfo = useMemo(() => {
    if (currentTime === undefined) return null;
    const mapping = sequence.playTimeToSource(currentTime);
    if (!mapping) return null;
    return { clipId: mapping.clipId, progress: mapping.progress };
  }, [sequence, currentTime]);

  // 裁剪工具点击处理：将点击位置的播放时间映射回源时间，然后执行切割
  const handleTrackClick = useCallback(
    (e: React.MouseEvent) => {
      if (activeTool !== 'cut' || !onCut) return;

      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;

      const x = e.clientX - rect.left;
      const playTime = x / pixelsPerSecond;

      // 将播放时间映射到源时间
      const mapping = sequence.playTimeToSource(playTime);
      if (mapping) {
        onCut(mapping.sourceTime);
      }
    },
    [activeTool, onCut, pixelsPerSecond, sequence]
  );

  // 拖拽排序开始
  const handleDragStart = useCallback(
    (clipId: string, e: React.MouseEvent) => {
      const clip = clips.find((c) => c.id === clipId);
      if (!clip) return;
      dragState.current = { clipId, startX: e.clientX, startOrder: clip.order };

      const handleMouseMove = (me: MouseEvent): void => {
        if (!dragState.current) return;
        const deltaX = me.clientX - dragState.current.startX;
        const deltaTime = deltaX / pixelsPerSecond;

        // 基于拖拽距离确定交换方向
        const sorted = [...clips].sort((a, b) => a.order - b.order);
        const currentIndex = sorted.findIndex((c) => c.id === clipId);
        if (currentIndex === -1) return;

        // 获取当前片段的播放时长
        const info = playbackInfos.find((pi) => pi.clip.id === clipId);
        if (!info) return;

        // 如果拖拽距离超过当前片段一半宽度，执行交换
        const halfDuration = info.playDuration / 2;
        if (Math.abs(deltaTime) > halfDuration) {
          const direction = deltaTime > 0 ? 1 : -1;
          const swapIndex = currentIndex + direction;
          if (swapIndex >= 0 && swapIndex < sorted.length) {
            const newOrder = sorted.map((c) => c.id);
            // 交换
            [newOrder[currentIndex], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[currentIndex]];
            onReorder?.(newOrder);
            // 重置拖拽起始位置
            dragState.current.startX = me.clientX;
          }
        }
      };

      const handleMouseUp = (): void => {
        dragState.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [clips, pixelsPerSecond, playbackInfos, onReorder]
  );

  // 点击片段选中
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

      {/* 渲染剪辑片段 */}
      {playbackInfos.map((info) => (
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
          onDragStart={onReorder ? handleDragStart : undefined}
        />
      ))}

      {/* 裁剪工具鼠标跟踪线 */}
      {activeTool === 'cut' && <div className="absolute inset-0 pointer-events-none z-30" />}

      {/* 总时长结束线 */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-orange-500 z-10 pointer-events-none"
        style={{ left: sequence.totalDuration * pixelsPerSecond }}
        title={`剪辑总时长: ${sequence.totalDuration.toFixed(2)}s`}
      />
    </div>
  );
};
