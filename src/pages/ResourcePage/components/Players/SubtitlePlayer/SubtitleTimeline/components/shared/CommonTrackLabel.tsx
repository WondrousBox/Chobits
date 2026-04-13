import clsx from 'clsx';
import React, { useCallback, useState } from 'react';
import { TbEye, TbEyeOff, TbSettings, TbTrash } from 'react-icons/tb';

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';

import { useLabels } from '../../context/TimelineContext';
import type { TrackLabelProps } from '../../types';
import { DEFAULT_CONFIG } from '../../types';

export const CommonTrackLabel: React.FC<TrackLabelProps> = ({ track, icon, onDelete, onToggleEnabled, onOpenSettings, onLabelClick, onSelect }) => {
  const labels = useLabels();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const handleLabelClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('button')) return;
      // 先触发选中，再触发其他点击事件
      onSelect?.(track.id);
      onLabelClick?.(track.id);
    },
    [onSelect, onLabelClick, track]
  );

  if (!track) {
    return null;
  }

  const content = (
    <div
      className={clsx(
        'flex items-center gap-1.5 px-2 border-b border-border shrink-0 overflow-hidden cursor-pointer transition-colors',
        track.selected ? 'bg-accent/50 hover:bg-accent/60' : 'bg-muted/20 hover:bg-muted/40',
        track.visible === false && 'opacity-40'
      )}
      style={{ height: DEFAULT_CONFIG.TRACK_HEIGHT + DEFAULT_CONFIG.TRACK_GAP }}
      onClick={handleLabelClick}
    >
      <div className="w-1.5 h-4 rounded-full shrink-0" style={{ backgroundColor: track.color }} />
      <div className="flex items-center gap-1 min-w-0 flex-1">
        {icon}
        <span className="text-xs text-foreground/80 truncate" title={track.label}>
          {track.label}
        </span>
        {track.description && <span className="text-[10px] text-muted-foreground truncate">({track.description})</span>}
      </div>
      <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
        {onOpenSettings && (
          <button
            className="p-0.5 rounded hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onOpenSettings(track.id);
            }}
            title={labels.settings}
          >
            <TbSettings className="w-3 h-3" />
          </button>
        )}
        {onToggleEnabled && (
          <button
            className={clsx(
              'p-0.5 rounded hover:bg-accent/50 transition-colors shrink-0',
              track.visible !== false ? 'text-muted-foreground hover:text-foreground' : 'text-muted-foreground/50 hover:text-foreground'
            )}
            onClick={(e) => {
              e.stopPropagation();
              onToggleEnabled(track.id);
            }}
            title={track.visible !== false ? labels.hide : labels.show}
          >
            {track.visible !== false ? <TbEye className="w-3 h-3" /> : <TbEyeOff className="w-3 h-3" />}
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
              {labels.deleteTrack}
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="w-96">
            <AlertDialogHeader>
              <AlertDialogTitle>{labels.deleteConfirmTitle.replace('{label}', track.label || '')}</AlertDialogTitle>
              <AlertDialogDescription>{labels.deleteConfirmDescription}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{labels.cancel}</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => onDelete(track.id)}>
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
