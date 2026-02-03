import { Editor } from '@tiptap/react';
import clsx from 'clsx';
import { Bold, Heading1, Heading2, Heading3, Italic, List, ListOrdered, Redo, Strikethrough, Undo } from 'lucide-react';
import React, { useState } from 'react';
import { TbCamera, TbFlag3, TbPlayerPauseFilled, TbPlayerPlayFilled, TbPlayerTrackNextFilled, TbPlayerTrackPrevFilled } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

import type { UnifiedToolbarProps } from './types';

/**
 * 播放器控制按钮组
 */
const PlayerControls: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div className="flex items-center">
      <Button size="icon" variant="ghost" onClick={() => (window as any).AIM?.player?.seekBackward?.(15)} title="后退 15 秒">
        <TbPlayerTrackPrevFilled />
      </Button>
      {!isPlaying ? (
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            setIsPlaying(true);
            (window as any).AIM?.player?.play?.();
          }}
          title="播放"
        >
          <TbPlayerPlayFilled />
        </Button>
      ) : (
        <Button
          size="icon"
          variant="ghost"
          onClick={() => {
            setIsPlaying(false);
            (window as any).AIM?.player?.pause?.();
          }}
          title="暂停"
        >
          <TbPlayerPauseFilled />
        </Button>
      )}
      <Button size="icon" variant="ghost" onClick={() => (window as any).AIM?.player?.seekForward?.(15)} title="前进 15 秒">
        <TbPlayerTrackNextFilled />
      </Button>
    </div>
  );
};

/**
 * 媒体操作按钮组（截图、标记等）
 */
const MediaButtons: React.FC = () => {
  return (
    <div className="flex items-center gap-1">
      <Button size="icon" variant="outline" onClick={() => (window as any).AIM?.player?.screenshot?.()} title="截图">
        <TbCamera />
      </Button>
      <Button size="icon" variant="outline" onClick={() => (window as any).AIM?.player?.getCurrentTime?.()} title="标记时间戳">
        <TbFlag3 />
      </Button>
    </div>
  );
};

/**
 * 格式化按钮组
 */
const FormatButtons: React.FC<{ editor: Editor }> = ({ editor }) => {
  return (
    <div className="flex flex-wrap gap-1 items-center">
      {/* 撤销/重做 */}
      <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="撤销" className="w-8 h-8">
        <Undo className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="重做" className="w-8 h-8">
        <Redo className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* 文字样式 */}
      <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleBold().run()} className={cn('w-8 h-8', editor.isActive('bold') && 'bg-muted')} title="粗体">
        <Bold className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleItalic().run()} className={cn('w-8 h-8', editor.isActive('italic') && 'bg-muted')} title="斜体">
        <Italic className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleStrike().run()} className={cn('w-8 h-8', editor.isActive('strike') && 'bg-muted')} title="删除线">
        <Strikethrough className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* 标题 */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        className={cn('w-8 h-8', editor.isActive('heading', { level: 1 }) && 'bg-muted')}
        title="标题 1"
      >
        <Heading1 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={cn('w-8 h-8', editor.isActive('heading', { level: 2 }) && 'bg-muted')}
        title="标题 2"
      >
        <Heading2 className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={cn('w-8 h-8', editor.isActive('heading', { level: 3 }) && 'bg-muted')}
        title="标题 3"
      >
        <Heading3 className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-6 mx-1" />

      {/* 列表 */}
      <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleBulletList().run()} className={cn('w-8 h-8', editor.isActive('bulletList') && 'bg-muted')} title="无序列表">
        <List className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={cn('w-8 h-8', editor.isActive('orderedList') && 'bg-muted')} title="有序列表">
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
  mini = false
}) => {
  if (!editor || !visible) {
    return null;
  }

  // 迷你模式只显示播放控制
  if (mini) {
    return (
      <div className={clsx('flex items-center w-full p-1 justify-center', className)}>
        <PlayerControls />
      </div>
    );
  }

  // 底部工具栏模式（用于完整编辑器）
  if (position === 'bottom') {
    return (
      <div className={clsx('flex items-center w-full p-1 justify-between', className)}>
        {showMediaButtons && <MediaButtons />}
        <PlayerControls />
      </div>
    );
  }

  // 顶部/浮动工具栏模式（用于简洁编辑器）
  return (
    <div className={clsx('border-b p-1 flex flex-wrap gap-1 items-center justify-between bg-muted/30 transition-opacity', className)}>
      <div className="flex flex-wrap gap-1 items-center">
        <FormatButtons editor={editor} />
        {showPlayerControls && (
          <>
            <Separator orientation="vertical" className="h-6 mx-1" />
            <PlayerControls />
          </>
        )}
        {showMediaButtons && (
          <>
            <Separator orientation="vertical" className="h-6 mx-1" />
            <MediaButtons />
          </>
        )}
      </div>
      {toolbarRight && <div className="flex items-center gap-2 ml-auto">{toolbarRight}</div>}
    </div>
  );
};

export default UnifiedToolbar;
