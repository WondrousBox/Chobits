import clsx from 'clsx';
import React from 'react';
import { TbBookmark, TbEye, TbEyeOff } from 'react-icons/tb';

import { DEFAULT_CONFIG } from '../types';

interface AnnotationTrackLabelProps {
  /** 标注数量 */
  annotationCount: number;
  /** 轨道是否启用 */
  enabled?: boolean;
  /** 切换启用/禁用回调 */
  onToggleEnabled?: () => void;
  className?: string;
}

/**
 * AnnotationTrackLabel - 标注轨道左侧标签
 */
export const AnnotationTrackLabel: React.FC<AnnotationTrackLabelProps> = ({ annotationCount, enabled = true, onToggleEnabled, className }) => {
  return (
    <div
      className={clsx('flex items-center justify-between px-2 border-b border-border bg-muted/30 shrink-0 overflow-hidden', !enabled && 'opacity-40', className)}
      style={{ height: DEFAULT_CONFIG.TRACK_HEIGHT + DEFAULT_CONFIG.TRACK_GAP }}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <TbBookmark className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
        <span className="text-xs text-foreground/80 truncate">标注</span>
        <span className="text-[10px] text-muted-foreground">{annotationCount}</span>
      </div>
      {onToggleEnabled && (
        <button
          className={clsx('p-0.5 rounded hover:bg-accent/50 transition-colors shrink-0', enabled ? 'text-muted-foreground hover:text-foreground' : 'text-muted-foreground/50 hover:text-foreground')}
          onClick={(e) => {
            e.stopPropagation();
            onToggleEnabled();
          }}
          title={enabled ? '隐藏标注轨道' : '显示标注轨道'}
        >
          {enabled ? <TbEye className="w-3 h-3" /> : <TbEyeOff className="w-3 h-3" />}
        </button>
      )}
    </div>
  );
};
