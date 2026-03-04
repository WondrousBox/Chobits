import clsx from 'clsx';
import React, { useState } from 'react';
import { TbEye, TbEyeOff, TbSettings, TbTrash, TbVolume } from 'react-icons/tb';

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';

import { DEFAULT_CONFIG } from '../../types';

export interface TTSTrackLabelProps {
  trackLabel: string;
  trackColor: string;
  ttsTrackId: string;
  onDelete?: (ttsTrackId: string) => void;
  /** 轨道是否启用 */
  enabled?: boolean;
  /** 切换启用/禁用回调 */
  onToggleEnabled?: (ttsTrackId: string) => void;
  /** 打开 TTS 设置回调 */
  onOpenSettings?: (ttsTrackId: string) => void;
  /** TTS 语音名称（简短显示，如 "Xiaoxiao"） */
  voiceLabel?: string;
}

/**
 * TTS轨道标签组件（带右键删除菜单和设置按钮）
 */
export const TTSTrackLabel: React.FC<TTSTrackLabelProps> = ({ trackLabel, trackColor, ttsTrackId, onDelete, enabled = true, onToggleEnabled, onOpenSettings, voiceLabel }) => {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const content = (
    <div
      className={clsx('flex items-center gap-1.5 px-2 border-b border-border bg-muted/20 shrink-0 overflow-hidden', !enabled && 'opacity-40')}
      style={{ height: DEFAULT_CONFIG.TRACK_HEIGHT + DEFAULT_CONFIG.TRACK_GAP }}
    >
      <div className="w-1.5 h-4 rounded-full shrink-0" style={{ backgroundColor: trackColor }} />
      <div className="flex items-center gap-1 min-w-0 flex-1">
        <TbVolume className="w-3 h-3 text-muted-foreground shrink-0" />
        <span className="text-xs text-foreground/80 truncate" title={trackLabel}>
          {trackLabel}
        </span>
        {voiceLabel && <span className="text-[10px] text-muted-foreground truncate">({voiceLabel})</span>}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        {onOpenSettings && (
          <button
            className="p-0.5 rounded hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSettings(ttsTrackId);
            }}
            title="TTS 设置"
          >
            <TbSettings className="w-3 h-3" />
          </button>
        )}
        {onToggleEnabled && (
          <button
            className={clsx('p-0.5 rounded hover:bg-accent/50 transition-colors shrink-0', enabled ? 'text-muted-foreground hover:text-foreground' : 'text-muted-foreground/50 hover:text-foreground')}
            onClick={(e) => {
              e.stopPropagation();
              onToggleEnabled(ttsTrackId);
            }}
            title={enabled ? '禁用TTS轨道' : '启用TTS轨道'}
          >
            {enabled ? <TbEye className="w-3 h-3" /> : <TbEyeOff className="w-3 h-3" />}
          </button>
        )}
      </div>
    </div>
  );

  if (onDelete) {
    return (
      <>
        <ContextMenu>
          <ContextMenuTrigger asChild>{content}</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteDialogOpen(true)}>
              <TbTrash className="w-4 h-4 mr-2" />
              删除TTS轨道
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="w-96">
            <AlertDialogHeader>
              <AlertDialogTitle>删除 TTS 轨道</AlertDialogTitle>
              <AlertDialogDescription>确定要删除 TTS 轨道「{trackLabel}」吗？此操作将永久删除该轨道及所有音频文件，无法恢复。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => onDelete(ttsTrackId)}>
                删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return content;
};
