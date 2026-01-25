import clsx from 'clsx';
import React from 'react';
import { TbEye, TbEyeOff, TbLock, TbLockOpen } from 'react-icons/tb';

import { DEFAULT_CONFIG, TimelineTrack } from '../types';

interface TrackLabelProps {
  track: TimelineTrack;
  index: number;
  onToggleLock?: (trackId: string) => void;
  onToggleHidden?: (trackId: string) => void;
  className?: string;
}

/**
 * 轨道标签组件
 */
export const TrackLabel: React.FC<TrackLabelProps> = ({ track, index, onToggleLock, onToggleHidden, className }) => {
  const height = track.height ?? DEFAULT_CONFIG.TRACK_HEIGHT;

  return (
    <div
      className={clsx('flex items-center justify-between px-2 border-b border-border bg-muted/30 shrink-0 overflow-hidden', track.hidden && 'opacity-50', className)}
      style={{ height: height + DEFAULT_CONFIG.TRACK_GAP }}
    >
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {/* 轨道颜色指示器 */}
        <div className="w-1.5 h-4 rounded-full shrink-0" style={{ backgroundColor: track.color }} />

        {/* 轨道名称 */}
        <span className="text-xs text-foreground/80 truncate" title={track.label}>
          {track.label}
        </span>
      </div>

      {/* 控制按钮 */}
      <div className="flex items-center gap-0.5 shrink-0">
        {onToggleLock && (
          <button
            className="p-0.5 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => onToggleLock(track.id)}
            title={track.locked ? '解锁轨道' : '锁定轨道'}
          >
            {track.locked ? <TbLock className="w-3 h-3" /> : <TbLockOpen className="w-3 h-3" />}
          </button>
        )}
        {onToggleHidden && (
          <button
            className="p-0.5 rounded hover:bg-accent/50 text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => onToggleHidden(track.id)}
            title={track.hidden ? '显示轨道' : '隐藏轨道'}
          >
            {track.hidden ? <TbEyeOff className="w-3 h-3" /> : <TbEye className="w-3 h-3" />}
          </button>
        )}
      </div>
    </div>
  );
};
