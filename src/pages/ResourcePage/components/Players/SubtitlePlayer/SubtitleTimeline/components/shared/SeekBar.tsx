import clsx from 'clsx';
import React, { useCallback, useMemo, useRef, useState } from 'react';

import { TimelineSegment } from '../../types';

interface SeekBarProps {
  /** 总时长（秒） */
  duration: number;
  /** 当前播放时间（秒） */
  currentTime?: number;
  /** 主字幕轨道的片段（用于显示高亮块） */
  segments: TimelineSegment[];
  /** 点击跳转回调 */
  onSeek?: (time: number) => void;
  /** 自定义类名 */
  className?: string;
}

/**
 * SeekBar - 时间线进度条组件
 *
 * 功能：
 * - 显示总时长的进度条
 * - 显示当前播放位置
 * - 显示主字幕轨道的所有片段（作为高亮块）
 * - 支持点击跳转到指定时间
 */
export const SeekBar: React.FC<SeekBarProps> = ({ duration, currentTime = 0, segments, onSeek, className }) => {
  const seekBarRef = useRef<HTMLDivElement>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);

  // 处理鼠标移动（显示悬停时间）
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!seekBarRef.current) return;

      const rect = seekBarRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = x / rect.width;
      const time = percentage * duration;

      setHoverTime(Math.max(0, Math.min(duration, time)));
      setHoverX(x);
    },
    [duration]
  );

  // 处理鼠标离开
  const handleMouseLeave = useCallback(() => {
    setHoverTime(null);
  }, []);

  // 处理点击跳转
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onSeek || !seekBarRef.current) return;

      const rect = seekBarRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percentage = x / rect.width;
      const time = percentage * duration;

      onSeek(Math.max(0, Math.min(duration, time)));
    },
    [duration, onSeek]
  );

  // 计算当前播放位置百分比
  const currentProgress = useMemo(() => {
    if (duration <= 0) return 0;
    return (currentTime / duration) * 100;
  }, [currentTime, duration]);

  // 计算片段的位置和宽度百分比
  const segmentBlocks = useMemo(() => {
    if (duration <= 0) return [];

    return segments.map((segment) => {
      const left = (segment.startTime / duration) * 100;
      const width = ((segment.endTime - segment.startTime) / duration) * 100;
      return {
        id: segment.id,
        left: `${left}%`,
        width: `${width}%`
      };
    });
  }, [segments, duration]);

  return (
    <div className={clsx('relative h-8 bg-muted/30 border-b cursor-pointer group', className)} ref={seekBarRef} onClick={handleClick} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
      {/* 背景轨道 */}
      <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-1.5 bg-muted rounded-full overflow-hidden">
        {/* 字幕片段高亮块 */}
        {segmentBlocks.map((block) => (
          <div
            key={block.id}
            className="absolute h-full bg-primary/30 transition-colors"
            style={{
              left: block.left,
              width: block.width
            }}
          />
        ))}

        {/* 已播放进度 */}
        <div className="absolute left-0 top-0 h-full bg-primary/50" style={{ width: `${currentProgress}%` }} />
      </div>

      {/* 当前播放位置指示器 */}
      <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2" style={{ left: `${currentProgress}%` }}>
        <div className="w-3 h-3 bg-primary rounded-full shadow-md border-2 border-background group-hover:scale-125" />
      </div>

      {/* 悬停时显示时间提示 */}
      {hoverTime !== null && (
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 pointer-events-none z-10" style={{ left: `${hoverX}px` }}>
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-foreground text-background text-xs rounded whitespace-nowrap font-mono shadow-lg">
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
              return formatTime(hoverTime);
            })()}
          </div>
          {/* 悬停位置的垂直指示线 */}
          <div className="w-0.5 h-3 bg-foreground/50 rounded-full" />
        </div>
      )}
    </div>
  );
};
