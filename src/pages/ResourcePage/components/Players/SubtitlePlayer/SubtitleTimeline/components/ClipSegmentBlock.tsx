import clsx from 'clsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TbChevronDown, TbChevronUp, TbGripVertical, TbPlayerPause, TbPlayerPlay, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import type { ClipSegment, ClipTool } from '../types';
import { DEFAULT_CONFIG } from '../types';
import { formatSecondsToTime } from '../utils';

/** 预设变速选项 */
const SPEED_PRESETS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];

interface ClipSegmentBlockProps {
  /** 剪辑片段 */
  clip: ClipSegment;
  /** 该片段在播放序列中的起始时间（秒） */
  playStart: number;
  /** 该片段在播放序列中的结束时间（秒） */
  playEnd: number;
  /** 每秒像素数 */
  pixelsPerSecond: number;
  /** 轨道高度 */
  trackHeight: number;
  /** 该片段在排序中的索引（用于显示顺序号） */
  orderIndex?: number;
  /** 总活跃片段数（用于判断是否可以上移/下移） */
  totalActiveClips?: number;
  /** 是否选中 */
  isSelected?: boolean;
  /** 是否为当前正在播放的片段 */
  isActive?: boolean;
  /** 当前播放进度（0~1，仅在 isActive 时有意义） */
  activeProgress?: number;
  /** 是否禁用 */
  isDisabled?: boolean;
  /** 点击回调 */
  onClick?: (clipId: string, event: React.MouseEvent) => void;
  /** 删除回调 */
  onDelete?: (clipId: string) => void;
  /** 变速回调 */
  onSpeedChange?: (clipId: string, playbackRate: number) => void;
  /** 启用/禁用切换 */
  onToggleDisabled?: (clipId: string) => void;
  /** 上移回调 */
  onMoveUp?: (clipId: string) => void;
  /** 下移回调 */
  onMoveDown?: (clipId: string) => void;
  /** 当前激活的工具（cut 模式下点击事件不拦截，让父级处理切割） */
  activeTool?: ClipTool;
}

/**
 * ClipSegmentBlock - 单个剪辑片段块
 *
 * 在剪辑轨道上显示一个片段，包括：
 * - 播放顺序号
 * - 源时间范围标记
 * - 播放速率显示
 * - 选中时的操作按钮（包括上移/下移）
 * - 播放进度指示
 */
export const ClipSegmentBlock: React.FC<ClipSegmentBlockProps> = ({
  clip,
  playStart,
  playEnd,
  pixelsPerSecond,
  trackHeight,
  orderIndex,
  totalActiveClips = 0,
  isSelected = false,
  isActive = false,
  activeProgress = 0,
  isDisabled = false,
  onClick,
  onDelete,
  onSpeedChange,
  onToggleDisabled,
  onMoveUp,
  onMoveDown,
  activeTool = 'select'
}) => {
  const blockRef = useRef<HTMLDivElement>(null);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const speedMenuRef = useRef<HTMLDivElement>(null);

  const playDuration = playEnd - playStart;
  const left = playStart * pixelsPerSecond;
  const width = Math.max(DEFAULT_CONFIG.SEGMENT_MIN_WIDTH, playDuration * pixelsPerSecond);
  const sourceDuration = clip.sourceEnd - clip.sourceStart;

  // 片段颜色：根据状态
  const bgColor = isDisabled ? 'hsla(0, 0%, 50%, 0.2)' : isActive ? 'hsla(200, 80%, 55%, 0.6)' : isSelected ? 'hsla(200, 80%, 55%, 0.45)' : 'hsla(200, 70%, 50%, 0.3)';

  const borderColor = isDisabled ? 'hsla(0, 0%, 50%, 0.4)' : isActive ? 'hsla(200, 80%, 55%, 0.8)' : isSelected ? 'hsla(200, 80%, 55%, 0.6)' : 'hsla(200, 70%, 50%, 0.4)';

  // 点击速度菜单外部时关闭
  useEffect(() => {
    if (!showSpeedMenu) return;
    const handleOutsideClick = (e: MouseEvent): void => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setShowSpeedMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showSpeedMenu]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // 切割模式下不拦截事件，让父级 ClipTrack 处理切割
      if (activeTool === 'cut') return;
      e.stopPropagation();
      onClick?.(clip.id, e);
    },
    [clip.id, onClick, activeTool]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete?.(clip.id);
    },
    [clip.id, onDelete]
  );

  const handleToggleDisabled = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleDisabled?.(clip.id);
    },
    [clip.id, onToggleDisabled]
  );

  const handleSpeedSelect = useCallback(
    (rate: number) => {
      onSpeedChange?.(clip.id, rate);
      setShowSpeedMenu(false);
    },
    [clip.id, onSpeedChange]
  );

  const handleMoveUp = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onMoveUp?.(clip.id);
    },
    [clip.id, onMoveUp]
  );

  const handleMoveDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onMoveDown?.(clip.id);
    },
    [clip.id, onMoveDown]
  );

  // 顺序号（1-indexed）
  const displayOrder = orderIndex !== undefined ? orderIndex + 1 : clip.order + 1;
  const canMoveUp = orderIndex !== undefined && orderIndex > 0;
  const canMoveDown = orderIndex !== undefined && orderIndex < totalActiveClips - 1;

  return (
    <div
      ref={blockRef}
      data-clip-block={clip.id}
      data-clip-order={displayOrder}
      className={clsx(
        'group absolute flex flex-col transition-shadow duration-100 overflow-hidden',
        'border rounded',
        isDisabled && 'opacity-40',
        isSelected && 'ring-2 ring-blue-500 z-20',
        isActive && 'ring-1 ring-blue-400'
      )}
      style={{
        left,
        width,
        top: DEFAULT_CONFIG.TRACK_GAP / 2,
        height: trackHeight,
        backgroundColor: bgColor,
        borderColor,
        borderRadius: DEFAULT_CONFIG.SEGMENT_BORDER_RADIUS,
        cursor: activeTool === 'cut' ? 'crosshair' : 'pointer'
      }}
      onClick={handleClick}
    >
      {/* 播放进度指示条 */}
      {isActive && activeProgress > 0 && <div className="absolute top-0 left-0 bottom-0 bg-blue-400/20 pointer-events-none z-0" style={{ width: `${Math.min(100, activeProgress * 100)}%` }} />}

      {/* 顶部信息行 */}
      <div className="flex items-center gap-1 px-1 pt-0.5 min-w-0 z-10">
        {/* 播放顺序号 */}
        <span
          className={clsx(
            'shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold',
            isDisabled ? 'bg-gray-500/30 text-gray-400' : isActive ? 'bg-blue-500 text-white' : 'bg-blue-500/60 text-white'
          )}
          title={`播放顺序: 第 ${displayOrder} 个`}
        >
          {displayOrder}
        </span>

        {/* 片段标签或源时间范围 */}
        <span className="text-[10px] text-foreground/80 truncate leading-tight flex-1">
          {clip.label || `${formatSecondsToTime(clip.sourceStart, false)} - ${formatSecondsToTime(clip.sourceEnd, false)}`}
        </span>

        {/* 速率标记（非 1.0x 时显示） */}
        {clip.playbackRate !== 1.0 && <span className="text-[9px] text-yellow-400 font-mono shrink-0">{clip.playbackRate}x</span>}
      </div>

      {/* 底部信息行 */}
      <div className="flex items-center justify-between px-1 mt-auto pb-0.5 min-w-0 z-10">
        <span className="text-[9px] text-foreground/50 font-mono truncate">
          {sourceDuration.toFixed(1)}s{clip.playbackRate !== 1.0 && ` → ${(sourceDuration / clip.playbackRate).toFixed(1)}s`}
        </span>
      </div>

      {/* 选中时的操作按钮 */}
      {isSelected && (
        <div className="absolute -top-3 right-0 flex items-center gap-0.5 z-30">
          {/* 上移按钮 */}
          {canMoveUp && (
            <Button size="icon" variant="outline" className="w-6 h-6 rounded-full p-0 bg-background shadow-sm hover:bg-accent" onClick={handleMoveUp} title="上移（提前播放）">
              <TbChevronUp className="w-3 h-3" />
            </Button>
          )}

          {/* 下移按钮 */}
          {canMoveDown && (
            <Button size="icon" variant="outline" className="w-6 h-6 rounded-full p-0 bg-background shadow-sm hover:bg-accent" onClick={handleMoveDown} title="下移（延后播放）">
              <TbChevronDown className="w-3 h-3" />
            </Button>
          )}

          {/* 变速按钮 */}
          <div className="relative" ref={speedMenuRef}>
            <Button
              size="icon"
              variant="outline"
              className="w-7 h-6 rounded p-0 bg-background shadow-sm hover:bg-accent text-[10px] font-mono"
              onClick={(e) => {
                e.stopPropagation();
                setShowSpeedMenu(!showSpeedMenu);
              }}
              title="调整速度"
            >
              {clip.playbackRate}x
            </Button>
            {showSpeedMenu && (
              <div className="absolute top-full right-0 mt-1 bg-popover border rounded shadow-lg z-50 py-1 min-w-[60px]">
                {SPEED_PRESETS.map((rate) => (
                  <button
                    key={rate}
                    className={clsx('w-full text-left px-2 py-0.5 text-xs hover:bg-accent', rate === clip.playbackRate && 'bg-accent font-medium')}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSpeedSelect(rate);
                    }}
                  >
                    {rate}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 启用/禁用 */}
          <Button
            size="icon"
            variant="outline"
            className="w-6 h-6 rounded-full p-0 bg-background shadow-sm hover:bg-accent"
            onClick={handleToggleDisabled}
            title={isDisabled ? '启用片段' : '禁用片段（跳过播放）'}
          >
            {isDisabled ? <TbPlayerPlay className="w-3 h-3" /> : <TbPlayerPause className="w-3 h-3" />}
          </Button>

          {/* 删除 */}
          <Button
            size="icon"
            variant="outline"
            className="w-6 h-6 rounded-full p-0 bg-background shadow-sm hover:bg-destructive hover:text-destructive-foreground"
            onClick={handleDelete}
            title="删除片段"
          >
            <TbTrash className="w-3 h-3" />
          </Button>
        </div>
      )}
    </div>
  );
};
