import React from 'react';
import { TbTrash, TbVolume } from 'react-icons/tb';

import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';

import { DEFAULT_CONFIG } from '../types';

export interface TTSTrackLabelProps {
  trackLabel: string;
  trackColor: string;
  ttsTrackId: string;
  onDelete?: (ttsTrackId: string) => void;
}

/**
 * TTS轨道标签组件（带右键删除菜单）
 */
export const TTSTrackLabel: React.FC<TTSTrackLabelProps> = ({ trackLabel, trackColor, ttsTrackId, onDelete }) => {
  const content = (
    <div className="flex items-center gap-1.5 px-2 border-b border-border bg-muted/20 shrink-0 overflow-hidden" style={{ height: DEFAULT_CONFIG.TRACK_HEIGHT + DEFAULT_CONFIG.TRACK_GAP }}>
      {/* 使用和字幕轨道相同的颜色指示器 */}
      <div className="w-1.5 h-4 rounded-full shrink-0" style={{ backgroundColor: trackColor }} />
      {/* 轨道名称 + TTS图标 */}
      <div className="flex items-center gap-1 min-w-0 flex-1">
        <span className="text-xs text-foreground/80 truncate" title={trackLabel}>
          {trackLabel}
        </span>
        <TbVolume className="w-3 h-3 text-muted-foreground shrink-0" />
      </div>
    </div>
  );

  if (onDelete) {
    return (
      <ContextMenu>
        <ContextMenuTrigger asChild>{content}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => {
              if (confirm(`确定要删除TTS轨道「${trackLabel}」吗？此操作将删除该轨道的所有TTS音频文件。`)) {
                onDelete(ttsTrackId);
              }
            }}
          >
            <TbTrash className="w-4 h-4 mr-2" />
            删除TTS轨道
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  }

  return content;
};
