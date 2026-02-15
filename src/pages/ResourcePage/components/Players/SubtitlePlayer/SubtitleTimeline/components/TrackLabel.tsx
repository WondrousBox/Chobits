import clsx from 'clsx';
import React from 'react';
import { TbEye, TbEyeOff, TbLock, TbLockOpen, TbTrash } from 'react-icons/tb';

import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';

import { DEFAULT_CONFIG, TimelineTrack } from '../types';

interface TrackLabelProps {
  track: TimelineTrack;
  index: number;
  onToggleLock?: (trackId: string) => void;
  onToggleHidden?: (trackId: string) => void;
  /** 是否允许删除（翻译轨道可删除，主轨道不可删除） */
  allowDelete?: boolean;
  /** 删除轨道回调 */
  onDelete?: (trackId: string) => void;
  /** 切换启用/禁用回调 */
  onToggleEnabled?: (trackId: string) => void;
  className?: string;
}

/**
 * 轨道标签组件
 */
export const TrackLabel: React.FC<TrackLabelProps> = ({ track, index, onToggleLock, onToggleHidden, allowDelete = false, onDelete, onToggleEnabled, className }) => {
  const height = track.height ?? DEFAULT_CONFIG.TRACK_HEIGHT;
  const isEnabled = track.enabled !== false;

  const content = (
    <div
      className={clsx('flex items-center justify-between px-2 border-b border-border bg-muted/30 shrink-0 overflow-hidden', !isEnabled && 'opacity-40', className)}
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
        {onToggleEnabled && (
          <button
            className={clsx('p-0.5 rounded hover:bg-accent/50 transition-colors', isEnabled ? 'text-muted-foreground hover:text-foreground' : 'text-muted-foreground/50 hover:text-foreground')}
            onClick={(e) => {
              e.stopPropagation();
              onToggleEnabled(track.id);
            }}
            title={isEnabled ? '禁用轨道（播放时不生效）' : '启用轨道（播放时生效）'}
          >
            {isEnabled ? <TbEye className="w-3 h-3" /> : <TbEyeOff className="w-3 h-3" />}
          </button>
        )}
      </div>
    </div>
  );

  // 如果允许删除，包装在右键菜单中
  if (allowDelete && onDelete) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{content}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => {
              if (confirm(`确定要删除轨道「${track.label}」吗？此操作将删除该翻译资源。`)) {
                onDelete(track.id);
              }
            }}
          >
            <TbTrash className="w-4 h-4 mr-2" />
            删除轨道
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  return content;
};
