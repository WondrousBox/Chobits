import clsx from 'clsx';
import React, { useState } from 'react';
import { TbEye, TbEyeClosed, TbLock, TbLockOpen, TbPlus, TbTrash } from 'react-icons/tb';

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';

import type { MediaTrackData } from '../../types';
import { MEDIA_CONFIG } from '../../types';

interface MediaTrackLabelProps {
  /** 轨道数据 */
  track: MediaTrackData;
  /** 是否选中 */
  isSelected?: boolean;
  /** 点击选中回调 */
  onSelect?: (trackId: string) => void;
  /** 切换可见性回调 */
  onToggleVisibility?: (trackId: string) => void;
  /** 切换锁定状态回调 */
  onToggleLock?: (trackId: string) => void;
  /** 删除轨道回调 */
  onDelete?: (trackId: string) => void;
  /** 禁用状态 */
  disabled?: boolean;
}

/**
 * MediaTrackLabel - 媒体轨道标签组件
 *
 * 显示轨道名称、颜色、可见性/锁定切换按钮，右键菜单支持删除
 */
export const MediaTrackLabel: React.FC<MediaTrackLabelProps> = ({ track, isSelected = false, onSelect, onToggleVisibility, onToggleLock, onDelete, disabled = false }) => {
  const height = track.height ?? MEDIA_CONFIG.DEFAULT_TRACK_HEIGHT;
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleClick = (): void => {
    if (!disabled) {
      onSelect?.(track.id);
    }
  };

  const content = (
    <div
      className={clsx(
        'flex items-center gap-1.5 px-2 border-b border-r shrink-0 box-border transition-colors',
        isSelected ? 'bg-accent/50' : 'bg-muted/30 hover:bg-muted/50',
        !track.visible && 'opacity-50',
        disabled && 'opacity-40 pointer-events-none'
      )}
      style={{ height: height + 4 }}
      onClick={handleClick}
    >
      {/* 轨道颜色指示器 */}
      <div className={clsx('w-1.5 rounded-full shrink-0', track.visible ? '' : 'opacity-40')} style={{ height: Math.min(height - 8, 20), backgroundColor: track.color || 'hsl(160, 60%, 40%)' }} />

      {/* 轨道名称 */}
      <span className={clsx('text-xs truncate flex-1', track.visible ? 'text-foreground/80' : 'text-muted-foreground')}>{track.label}</span>

      {/* 片段数量 */}
      <span className="text-[10px] text-muted-foreground shrink-0">{track.segments.filter((s) => !s.deleted).length}</span>

      {/* 操作按钮 */}
      <div className="flex items-center gap-0.5 shrink-0">
        {/* 可见性切换 */}
        {onToggleVisibility && (
          <Button
            size="icon"
            variant="ghost"
            className="w-5 h-5 p-0 opacity-50 hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility(track.id);
            }}
            title={track.visible ? '隐藏轨道' : '显示轨道'}
          >
            {track.visible ? <TbEye className="w-3 h-3" /> : <TbEyeClosed className="w-3 h-3" />}
          </Button>
        )}

        {/* 锁定切换 */}
        {onToggleLock && (
          <Button
            size="icon"
            variant="ghost"
            className={clsx('w-5 h-5 p-0', track.locked ? 'opacity-100' : 'opacity-50 hover:opacity-100')}
            onClick={(e) => {
              e.stopPropagation();
              onToggleLock(track.id);
            }}
            title={track.locked ? '解锁轨道' : '锁定轨道'}
          >
            {track.locked ? <TbLock className="w-3 h-3 text-orange-500" /> : <TbLockOpen className="w-3 h-3" />}
          </Button>
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
              删除轨道
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除轨道</AlertDialogTitle>
              <AlertDialogDescription>确定要删除轨道「{track.label}」吗？此操作将永久删除该资源，无法恢复。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  setShowDeleteDialog(false);
                  onDelete(track.id);
                }}
              >
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

/**
 * MediaTrackAddButton - 添加媒体轨道按钮
 */
interface MediaTrackAddButtonProps {
  /** 添加轨道回调 */
  onAddTrack?: () => void;
  /** 禁用状态 */
  disabled?: boolean;
}

export const MediaTrackAddButton: React.FC<MediaTrackAddButtonProps> = ({ onAddTrack, disabled = false }) => {
  return (
    <button
      type="button"
      className={clsx('flex items-center justify-center gap-1 px-2 border-b border-r bg-muted/20 hover:bg-muted/40 transition-colors', disabled && 'opacity-40 pointer-events-none')}
      style={{ height: MEDIA_CONFIG.DEFAULT_TRACK_HEIGHT + 4 }}
      onClick={onAddTrack}
      disabled={disabled}
    >
      <TbPlus className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">添加轨道</span>
    </button>
  );
};
