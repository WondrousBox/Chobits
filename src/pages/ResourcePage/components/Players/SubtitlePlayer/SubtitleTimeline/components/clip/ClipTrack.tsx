import clsx from 'clsx';
import React, { useCallback, useMemo, useRef } from 'react';
import { TbArrowBackUp } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import type { ClipSegment, ClipTool, ViewportState } from '../../types';
import { DEFAULT_CONFIG } from '../../types';
import { ClipSequence } from '../../utils';
import { ClipSegmentBlock } from './ClipSegmentBlock';

/**
 * 剪辑轨道组件 Props
 *
 * 遵循统一命名规范：
 * - width: 轨道宽度
 * - totalDuration: 总时长 (原 sourceDuration)
 * - pixelsPerSecond: 缩放级别
 * - viewport: 视口状态 (可选，用于未来扩展)
 * - currentTime: 当前播放时间
 * - disabled: 是否禁用
 * - selectedId: 选中的片段 ID (原 selectedId)
 */
interface ClipTrackProps {
  /** 剪辑片段列表 */
  clips: ClipSegment[];
  /** 原始媒体总时长（秒） - 统一命名为 totalDuration */
  totalDuration: number;
  /** 每秒像素数 */
  pixelsPerSecond: number;
  /** 轨道总宽度 */
  width: number;
  /** 视口状态 (可选，用于虚拟化) */
  viewport?: ViewportState;
  /** 当前播放时间（源时间） */
  currentTime?: number;
  /** 当前激活的工具 */
  activeTool?: ClipTool;
  /** 选中的片段 ID - 统一命名为 selectedId */
  selectedId?: string | null;
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
  /** 禁用交互（轨道未启用时） */
  disabled?: boolean;
  /** 覆盖模式（叠加在波形轨道上方） */
  overlay?: boolean;
  /** 自定义轨道容器高度（覆盖模式下由父级控制） */
  height?: number;
}

/**
 * ClipTrack - 剪辑轨道组件
 *
 * 片段按源时间位置排列，与字幕/TTS 轨道共享同一时间轴。
 * 每个片段显示播放顺序号（order），支持通过上移/下移按钮调整播放顺序。
 * 已删除的片段显示为带斜线的空白区域，可以恢复。
 */
export const ClipTrack: React.FC<ClipTrackProps> = ({
  clips,
  totalDuration,
  pixelsPerSecond,
  width,
  viewport,
  currentTime,
  activeTool = 'select',
  selectedId,
  onCut,
  onDelete,
  onRestore,
  onSpeedChange,
  onClipSelect,
  onMoveUp,
  onMoveDown,
  disabled = false,
  overlay = false,
  height
}) => {
  const trackRef = useRef<HTMLDivElement>(null);

  const sequence = useMemo(() => new ClipSequence(clips), [clips]);
  const allInfos = useMemo(() => sequence.getAllPlaybackInfos(), [sequence]);
  const orderedClips = useMemo(() => sequence.getOrderedClips(), [sequence]);

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

  // 覆盖模式下，容器高度由父级指定；块高度 = 容器高度 - 间距
  const containerHeight = overlay ? (height ?? DEFAULT_CONFIG.CLIP_TRACK_HEIGHT) : DEFAULT_CONFIG.CLIP_TRACK_HEIGHT + DEFAULT_CONFIG.TRACK_GAP;
  const trackHeight = overlay ? containerHeight - DEFAULT_CONFIG.TRACK_GAP : DEFAULT_CONFIG.CLIP_TRACK_HEIGHT;
  const totalActiveClips = orderedClips.length;

  return (
    <div
      ref={trackRef}
      data-clip-track
      className={clsx('relative border-border', activeTool === 'cut' && 'cursor-crosshair', disabled && 'opacity-40 pointer-events-none')}
      style={{
        height: containerHeight,
        width,
        // 覆盖模式：选择工具时容器不拦截鼠标事件，让点击穿透到下方波形轨道；
        // 裁剪工具时容器需要拦截点击以执行切割
        pointerEvents: overlay && activeTool !== 'cut' && !disabled ? 'none' : undefined
      }}
      onClick={handleTrackClick}
    >
      {/* 背景 - 覆盖模式下透明，让波形可见 */}
      {!overlay && <div className="absolute inset-0 bg-background/50" />}

      {/* 渲染所有片段（含已删除的） */}
      {allInfos.map((info) => {
        return info.clip.deleted ? (
          <div
            key={info.clip.id}
            data-clip-block={info.clip.id}
            className={clsx('absolute flex items-center justify-center', 'border border-dashed rounded opacity-40', selectedId === info.clip.id && 'ring-2 ring-orange-400 opacity-60')}
            style={{
              left: info.playStart * pixelsPerSecond,
              width: Math.max(DEFAULT_CONFIG.SEGMENT_MIN_WIDTH, (info.playEnd - info.playStart) * pixelsPerSecond),
              top: DEFAULT_CONFIG.TRACK_GAP / 2,
              height: trackHeight,
              borderColor: 'hsl(0, 60%, 50%)',
              borderRadius: DEFAULT_CONFIG.SEGMENT_BORDER_RADIUS,
              backgroundImage: 'repeating-linear-gradient(135deg, transparent, transparent 3px, hsla(0, 60%, 50%, 0.15) 3px, hsla(0, 60%, 50%, 0.15) 6px)',
              cursor: activeTool === 'cut' ? 'crosshair' : 'pointer',
              // 覆盖模式下，让删除块也能接收鼠标事件
              pointerEvents: overlay ? 'auto' : undefined
            }}
            onClick={(e) => {
              if (activeTool === 'cut') return;
              e.stopPropagation();
              onClipSelect?.(info.clip.id);
            }}
          >
            <span className="text-[9px] text-muted-foreground select-none">已删除</span>
            {selectedId === info.clip.id && onRestore && (
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
            orderIndex={orderIndexMap.get(info.clip.id)}
            totalActiveClips={totalActiveClips}
            isSelected={selectedId === info.clip.id}
            isActive={activeClipInfo?.clipId === info.clip.id}
            activeProgress={activeClipInfo?.clipId === info.clip.id ? activeClipInfo.progress : 0}
            activeTool={activeTool}
            overlay={overlay}
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
