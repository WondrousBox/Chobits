import clsx from 'clsx';
import React from 'react';
import { TbFileText, TbPlus, TbVideo, TbWaveSawTool } from 'react-icons/tb';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

import { MEDIA_CONFIG } from '../../types';

export interface TrackAddMenuProps {
  onAddMediaTrack?: () => void;
  onAddSubtitleTrack?: () => void;
  onAddTTSTrack?: () => void;
  disabled?: boolean;
}

/**
 * TrackAddMenu - 添加轨道按钮（点击弹出菜单选择轨道类型）
 */
export const TrackAddMenu: React.FC<TrackAddMenuProps> = ({ onAddMediaTrack, onAddSubtitleTrack, onAddTTSTrack, disabled = false }) => {
  const hasAnyCallback = onAddMediaTrack || onAddSubtitleTrack || onAddTTSTrack;

  if (!hasAnyCallback || disabled) {
    return (
      <button
        type="button"
        className={clsx('flex items-center justify-center gap-1 w-full px-2 border-b border-r bg-muted/20 transition-colors', 'opacity-40 pointer-events-none')}
        style={{ height: MEDIA_CONFIG.DEFAULT_TRACK_HEIGHT + 4 }}
        disabled
      >
        <TbPlus className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">添加轨道</span>
      </button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center justify-center gap-1 w-full px-2 border-b border-r bg-muted/20 hover:bg-muted/40 transition-colors"
          style={{ height: MEDIA_CONFIG.DEFAULT_TRACK_HEIGHT + 4 }}
        >
          <TbPlus className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">添加轨道</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right">
        {onAddSubtitleTrack && (
          <DropdownMenuItem onClick={onAddSubtitleTrack}>
            <TbFileText />
            字幕
          </DropdownMenuItem>
        )}
        {onAddTTSTrack && (
          <DropdownMenuItem onClick={onAddTTSTrack}>
            <TbWaveSawTool />
            语音合成
          </DropdownMenuItem>
        )}
        {onAddMediaTrack && (
          <DropdownMenuItem onClick={onAddMediaTrack}>
            <TbVideo />
            图片和视频
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
