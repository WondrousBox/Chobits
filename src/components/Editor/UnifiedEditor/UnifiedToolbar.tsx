import { Editor } from '@tiptap/react';
import clsx from 'clsx';
import { Bold, Heading1, Heading2, Heading3, Italic, List, ListOrdered, Redo, Strikethrough, Undo } from 'lucide-react';
import React, { useState } from 'react';
import { TbCamera, TbFlag3, TbPlayerPauseFilled, TbPlayerPlayFilled, TbPlayerTrackNextFilled, TbPlayerTrackPrevFilled } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

import { editorCommandActions } from '../commandActions';
import type { PlayerControls, UnifiedToolbarProps } from './types';

/**
 * 播放器控制按钮组
 */
const PlayerControlsComponent: React.FC<{ controls?: PlayerControls }> = ({ controls }) => {
  const isControlled = typeof controls?.isPlaying === 'boolean';
  const [localPlaying, setLocalPlaying] = useState(false);
  const isPlaying = isControlled ? (controls?.isPlaying as boolean) : localPlaying;

  const setPlaying = (next: boolean) => {
    if (!isControlled) {
      setLocalPlaying(next);
    }
    controls?.onPlayStateChange?.(next);
  };

  const handleSeekBackward = () => {
    controls?.seekBackward?.(15);
  };

  const handleSeekForward = () => {
    controls?.seekForward?.(15);
  };

  const handlePlay = () => {
    setPlaying(true);
    controls?.play?.();
  };

  const handlePause = () => {
    setPlaying(false);
    controls?.pause?.();
  };

  return (
    <div className="flex items-center">
      <Button size="icon" variant="ghost" onClick={handleSeekBackward} title="后退 15 秒">
        <TbPlayerTrackPrevFilled />
      </Button>
      {!isPlaying ? (
        <Button size="icon" variant="ghost" onClick={handlePlay} title="播放">
          <TbPlayerPlayFilled />
        </Button>
      ) : (
        <Button size="icon" variant="ghost" onClick={handlePause} title="暂停">
          <TbPlayerPauseFilled />
        </Button>
      )}
      <Button size="icon" variant="ghost" onClick={handleSeekForward} title="前进 15 秒">
        <TbPlayerTrackNextFilled />
      </Button>
    </div>
  );
};

/**
 * 媒体操作按钮组（截图、标记等）
 */
const MediaButtons: React.FC<{ controls?: PlayerControls }> = ({ controls }) => {
  const handleScreenshot = () => {
    controls?.screenshot?.();
  };

  const handleTimestamp = () => {
    controls?.getCurrentTime?.();
  };

  return (
    <div className="flex items-center gap-1">
      <Button size="icon" variant="outline" onClick={handleScreenshot} title="截图">
        <TbCamera />
      </Button>
      <Button size="icon" variant="outline" onClick={handleTimestamp} title="标记时间戳">
        <TbFlag3 />
      </Button>
    </div>
  );
};

/**
 * 格式化按钮组
 */
const FormatButtons: React.FC<{ editor: Editor }> = ({ editor }) => {
  const undoAction = editorCommandActions.undo;
  const redoAction = editorCommandActions.redo;
  const boldAction = editorCommandActions.bold;
  const italicAction = editorCommandActions.italic;
  const strikeAction = editorCommandActions.strike;
  const heading1Action = editorCommandActions.heading1;
  const heading2Action = editorCommandActions.heading2;
  const heading3Action = editorCommandActions.heading3;
  const bulletListAction = editorCommandActions.bulletList;
  const orderedListAction = editorCommandActions.orderedList;

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {/* 撤销/重做 */}
      <Button variant="ghost" size="icon" onClick={() => undoAction.run(editor)} disabled={!undoAction.canRun?.(editor)} title="撤销" className="w-8 h-8">
        <Undo className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => redoAction.run(editor)} disabled={!redoAction.canRun?.(editor)} title="重做" className="w-8 h-8">
        <Redo className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* 文字样式 */}
      <Button variant="ghost" size="icon" onClick={() => boldAction.run(editor)} className={cn('w-8 h-8', boldAction.isActive?.(editor) && 'bg-muted')} title="粗体">
        <Bold className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => italicAction.run(editor)} className={cn('w-8 h-8', italicAction.isActive?.(editor) && 'bg-muted')} title="斜体">
        <Italic className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => strikeAction.run(editor)} className={cn('w-8 h-8', strikeAction.isActive?.(editor) && 'bg-muted')} title="删除线">
        <Strikethrough className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* 标题 */}
      <Button variant="ghost" size="icon" onClick={() => heading1Action.run(editor)} className={cn('w-8 h-8', heading1Action.isActive?.(editor) && 'bg-muted')} title="标题 1">
        <Heading1 className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => heading2Action.run(editor)} className={cn('w-8 h-8', heading2Action.isActive?.(editor) && 'bg-muted')} title="标题 2">
        <Heading2 className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => heading3Action.run(editor)} className={cn('w-8 h-8', heading3Action.isActive?.(editor) && 'bg-muted')} title="标题 3">
        <Heading3 className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* 列表 */}
      <Button variant="ghost" size="icon" onClick={() => bulletListAction.run(editor)} className={cn('w-8 h-8', bulletListAction.isActive?.(editor) && 'bg-muted')} title="无序列表">
        <List className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => orderedListAction.run(editor)} className={cn('w-8 h-8', orderedListAction.isActive?.(editor) && 'bg-muted')} title="有序列表">
        <ListOrdered className="h-4 w-4" />
      </Button>
    </div>
  );
};

/**
 * 统一工具栏组件
 *
 * 支持多种展示模式：
 * - 顶部固定/浮动工具栏（用于简洁编辑器）
 * - 底部固定工具栏（用于完整编辑器）
 * - 迷你模式（只显示播放控制）
 */
export const UnifiedToolbar: React.FC<UnifiedToolbarProps> = ({
  editor,
  visible = true,
  className,
  position = 'top',
  toolbarRight,
  showMediaButtons = false,
  showPlayerControls = false,
  mini = false,
  playerControls,
  onInteractionStart
}) => {
  if (!editor || !visible) {
    return null;
  }

  // 当用户与工具栏交互时，取消隐藏计时器
  const handleMouseDown = (): void => {
    onInteractionStart?.();
  };

  // 迷你模式只显示播放控制
  if (mini) {
    return (
      <div className={clsx('flex items-center w-full p-1 justify-center', className)} onMouseDown={handleMouseDown}>
        <PlayerControlsComponent controls={playerControls} />
      </div>
    );
  }

  // 底部工具栏模式（用于完整编辑器）
  if (position === 'bottom') {
    return (
      <div className={clsx('flex items-center w-full p-1 justify-between', className)} onMouseDown={handleMouseDown}>
        {showMediaButtons && <MediaButtons controls={playerControls} />}
        <PlayerControlsComponent controls={playerControls} />
      </div>
    );
  }

  // 顶部/浮动工具栏模式（用于简洁编辑器）
  return (
    <div className={clsx('border-b p-1 flex flex-wrap gap-1 items-center justify-between bg-muted/30 transition-opacity', className)} onMouseDown={handleMouseDown}>
      <div className="flex flex-wrap gap-1 items-center">
        <FormatButtons editor={editor} />
        {showPlayerControls && (
          <>
            <Separator orientation="vertical" className="h-6 mx-1" />
            <PlayerControlsComponent controls={playerControls} />
          </>
        )}
        {showMediaButtons && (
          <>
            <Separator orientation="vertical" className="h-6 mx-1" />
            <MediaButtons controls={playerControls} />
          </>
        )}
      </div>
      {toolbarRight && <div className="flex items-center gap-2 ml-auto">{toolbarRight}</div>}
    </div>
  );
};

export default UnifiedToolbar;
