/**
 * BlockActionBar - 操作按钮栏组件
 *
 * 选中时显示的操作按钮（编辑、删除、播放等）
 */

import React from 'react';
import { TbArrowMerge, TbArrowsHorizontal, TbChevronDown, TbChevronUp, TbPencil, TbPlayerPause, TbPlayerPlay, TbRestore, TbRotate, TbTrash } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import { useLabels } from '../../../context/TimelineContext';
import type { BlockActionBarProps } from '../types';

/**
 * BlockActionBar 组件
 */
export const BlockActionBar: React.FC<BlockActionBarProps> = ({ capabilities, content, callbacks, disabled }) => {
  const labels = useLabels();
  if (disabled) return null;

  const buttons: React.ReactNode[] = [];

  // 编辑按钮（文本可编辑时）
  if (capabilities.text?.editable && callbacks?.onTextChange) {
    buttons.push(
      <Button
        key="edit"
        size="icon"
        variant="outline"
        className="w-6 h-6 rounded-full p-0 bg-background shadow-sm hover:bg-accent"
        onClick={(e) => {
          e.stopPropagation();
          // 触发编辑模式（通过双击回调）
          callbacks.onDoubleClick?.(content.id, e as unknown as React.MouseEvent);
        }}
        title={labels.blockEdit}
      >
        <TbPencil className="w-3 h-3" />
      </Button>
    );
  }

  // 播放/暂停按钮（有播放能力且已完成时）
  if (capabilities.playback?.showPlayButton && content.status === 'completed') {
    buttons.push(
      <Button
        key="play"
        size="icon"
        variant="outline"
        className="w-6 h-6 rounded-full p-0 bg-background shadow-sm hover:bg-accent"
        onClick={(e) => {
          e.stopPropagation();
          if (content.isPlaying) {
            callbacks?.onPause?.(content.id);
          } else {
            callbacks?.onPlay?.(content.id);
          }
        }}
        title={content.isPlaying ? labels.blockPause : labels.blockPlay}
      >
        {content.isPlaying ? <TbPlayerPause className="w-3 h-3" /> : <TbPlayerPlay className="w-3 h-3" />}
      </Button>
    );
  }

  // 上移按钮（剪辑块）
  if (capabilities.special?.showOrder && callbacks?.onMoveUp) {
    const canMoveUp = content.order !== undefined && content.order > 0;
    if (canMoveUp) {
      buttons.push(
        <Button
          key="moveUp"
          size="icon"
          variant="outline"
          className="w-6 h-6 rounded-full p-0 bg-background shadow-sm hover:bg-accent"
          onClick={(e) => {
            e.stopPropagation();
            callbacks.onMoveUp?.(content.id);
          }}
          title={labels.blockMoveUp}
        >
          <TbChevronUp className="w-3 h-3" />
        </Button>
      );
    }
  }

  // 下移按钮（剪辑块）
  if (capabilities.special?.showOrder && callbacks?.onMoveDown) {
    const canMoveDown = content.order !== undefined && content.totalSegments !== undefined && content.order < content.totalSegments - 1;
    if (canMoveDown) {
      buttons.push(
        <Button
          key="moveDown"
          size="icon"
          variant="outline"
          className="w-6 h-6 rounded-full p-0 bg-background shadow-sm hover:bg-accent"
          onClick={(e) => {
            e.stopPropagation();
            callbacks.onMoveDown?.(content.id);
          }}
          title={labels.blockMoveDown}
        >
          <TbChevronDown className="w-3 h-3" />
        </Button>
      );
    }
  }

  // 速率显示（剪辑块，只显示不可点击）
  if (capabilities.special?.showRateLabel && content.playbackRate !== undefined) {
    buttons.push(
      <span key="rate" className="inline-flex items-center justify-center w-7 h-6 rounded bg-background border shadow-sm text-[10px] font-mono text-foreground/70" title={labels.blockDragEdgeSpeed}>
        {content.playbackRate}x
      </span>
    );
  }

  // 变换按钮（媒体块）
  if (callbacks?.onTransform) {
    buttons.push(
      <Button key="transform" size="icon" variant="outline" className="w-6 h-6 rounded-full p-0 bg-background shadow-sm hover:bg-accent" title={labels.blockTransformSettings}>
        <TbArrowsHorizontal className="w-3 h-3" />
      </Button>
    );

    // 旋转按钮
    buttons.push(
      <Button
        key="rotate"
        size="icon"
        variant="outline"
        className="w-6 h-6 rounded-full p-0 bg-background shadow-sm hover:bg-accent"
        onClick={(e) => {
          e.stopPropagation();
          const currentRotation = content.transform?.rotation ?? 0;
          callbacks.onTransform?.(content.id, { rotation: (currentRotation + 90) % 360 });
        }}
        title={labels.blockRotate90}
      >
        <TbRotate className="w-3 h-3" />
      </Button>
    );
  }

  // 恢复按钮（已删除时）
  if (content.deleted && callbacks?.onRestore) {
    buttons.push(
      <Button
        key="restore"
        size="icon"
        variant="outline"
        className="w-6 h-6 rounded-full p-0 bg-background shadow-sm hover:bg-accent"
        onClick={(e) => {
          e.stopPropagation();
          callbacks.onRestore?.(content.id);
        }}
        title={labels.blockRestore}
      >
        <TbRestore className="w-3 h-3" />
      </Button>
    );
  }

  // 合并按钮（字幕块）
  if (capabilities.special?.showMergeButton && callbacks?.onMergePrev) {
    buttons.push(
      <Button
        key="merge"
        size="icon"
        variant="outline"
        className="w-6 h-6 rounded-full p-0 bg-background shadow-sm hover:bg-accent"
        onClick={(e) => {
          e.stopPropagation();
          callbacks.onMergePrev?.(content.id);
        }}
        title={labels.blockMergePrev}
      >
        <TbArrowMerge className="-rotate-90 w-3 h-3" />
      </Button>
    );
  }

  // 删除按钮
  if (callbacks?.onDelete && !content.deleted) {
    buttons.push(
      <Button
        key="delete"
        size="icon"
        variant="outline"
        className="w-6 h-6 rounded-full p-0 bg-background shadow-sm hover:bg-destructive hover:text-destructive-foreground"
        onClick={(e) => {
          e.stopPropagation();
          callbacks.onDelete?.(content.id);
        }}
        title={labels.blockDelete}
      >
        <TbTrash className="w-3 h-3" />
      </Button>
    );
  }

  if (buttons.length === 0) return null;

  return <div className="absolute -top-3 right-0 flex items-center gap-0.5 z-30">{buttons}</div>;
};

BlockActionBar.displayName = 'BlockActionBar';
