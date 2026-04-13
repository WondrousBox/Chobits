import clsx from 'clsx';
import React, { useState } from 'react';
import { TbEye, TbEyeOff, TbTrash, TbVideo } from 'react-icons/tb';

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';

import { useLabels } from '../../context/TimelineContext';
import type { MediaTrackData, TrackLabelProps } from '../../types';
import { MEDIA_CONFIG } from '../../types';

/**
 * 媒体轨道标签组件 Props
 * 扩展自统一的 TrackLabelProps，添加媒体轨道特有属性
 */
export interface MediaTrackLabelProps extends TrackLabelProps {
  /** 轨道完整数据（用于获取额外信息如高度，可选） */
  track: MediaTrackData;
}

/**
 * MediaTrackLabel - 媒体轨道标签组件
 *
 * 显示轨道名称、颜色、启用/禁用切换按钮，右键菜单支持删除
 */
export const MediaTrackLabel: React.FC<MediaTrackLabelProps> = ({ track, onSelect, onToggleEnabled, onDelete }) => {
  const labels = useLabels();
  const height = track?.height ?? MEDIA_CONFIG.DEFAULT_TRACK_HEIGHT;
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // 从 track 获取状态
  const isVisible = track?.visible ?? true;
  const isSelected = track?.selected ?? false;
  const disabled = track?.disabled ?? false;

  const handleClick = (): void => {
    if (!disabled) {
      onSelect?.(track.id);
    }
  };

  if (!track) {
    return null;
  }

  const content = (
    <div
      className={clsx(
        'flex items-center gap-1.5 px-2 border-b border-r shrink-0 box-border transition-colors cursor-pointer',
        isSelected ? 'bg-accent/50 hover:bg-accent/60' : 'bg-muted/30 hover:bg-muted/50',
        !isVisible && 'opacity-50',
        disabled && 'opacity-40 pointer-events-none'
      )}
      style={{ height: height + 4 }}
      onClick={handleClick}
    >
      {/* 轨道颜色指示器 */}
      <div className={clsx('w-1.5 rounded-full shrink-0', isVisible ? '' : 'opacity-40')} style={{ height: Math.min(height - 8, 20), backgroundColor: track?.color || 'hsl(160, 60%, 40%)' }} />

      <TbVideo />
      {/* 轨道名称 */}
      <span className={clsx('text-xs truncate flex-1', isVisible ? 'text-foreground/80' : 'text-muted-foreground')}>{track.label}</span>

      {/* 操作按钮 */}
      <div className="flex items-center gap-0.5 shrink-0">
        {/* 启用/禁用切换 */}
        {onToggleEnabled && (
          <button
            className={clsx(
              'p-0.5 rounded hover:bg-accent/50 transition-colors shrink-0',
              isVisible ? 'text-muted-foreground hover:text-foreground' : 'text-muted-foreground/50 hover:text-foreground'
            )}
            onClick={(e) => {
              e.stopPropagation();
              onToggleEnabled(track.id);
            }}
            title={isVisible ? labels.mediaTrackHide : labels.mediaTrackShow}
          >
            {isVisible ? <TbEye className="w-3 h-3" /> : <TbEyeOff className="w-3 h-3" />}
          </button>
        )}
      </div>
    </div>
  );

  // 如果支持删除，包装在右键菜单中
  if (onDelete) {
    return (
      <>
        <ContextMenu>
          <ContextMenuTrigger asChild>{content}</ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem className="text-destructive focus:text-destructive" onClick={() => setShowDeleteDialog(true)}>
              <TbTrash className="w-4 h-4 mr-2" />
              {labels.mediaTrackDelete}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{labels.mediaTrackDeleteConfirmTitle}</AlertDialogTitle>
              <AlertDialogDescription>{labels.mediaTrackDeleteConfirmDescription.replace('{label}', track.label || '')}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{labels.cancel}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  setShowDeleteDialog(false);
                  onDelete(track.id);
                }}
              >
                {labels.delete}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return content;
};
