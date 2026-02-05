import { Editor } from '@tiptap/react';
import clsx from 'clsx';
import { Bold, Heading1, Heading2, Heading3, Italic, List, ListOrdered, Redo, Strikethrough, Undo } from 'lucide-react';
import React from 'react';
import { TbCamera, TbFlag3 } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

import { editorCommandActions } from '../commandActions';
import type { MediaControls, UnifiedToolbarProps } from './types';

/**
 * 媒体操作按钮组（截图、插入时间戳）
 */
const MediaButtons: React.FC<{ controls?: MediaControls }> = ({ controls }) => {
  const handleScreenshot = () => {
    controls?.screenshot?.();
  };

  const handleTimestamp = () => {
    controls?.getCurrentTime?.();
  };

  return (
    <div className="flex items-center gap-1">
      <Button size="icon" variant="outline" className="w-8 h-8" onClick={handleScreenshot} title="截图">
        <TbCamera />
      </Button>
      <Button size="icon" variant="outline" className="w-8 h-8" onClick={handleTimestamp} title="插入时间戳">
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
 */
export const UnifiedToolbar: React.FC<UnifiedToolbarProps> = ({
  editor,
  visible = true,
  className,
  position = 'top',
  toolbarRight,
  showMediaButtons = false,
  mediaControls,
  onInteractionStart
}) => {
  if (!editor || !visible) {
    return null;
  }

  // 当用户与工具栏交互时，取消隐藏计时器
  const handleMouseDown = (): void => {
    onInteractionStart?.();
  };

  // 顶部/浮动工具栏模式（用于简洁编辑器）
  return (
    <div className={clsx('border-b p-1 flex flex-wrap gap-1 items-center justify-between bg-muted/30 transition-opacity', className)} onMouseDown={handleMouseDown}>
      <div className="flex flex-wrap gap-1 items-center">
        <FormatButtons editor={editor} />
        {showMediaButtons && (
          <>
            <Separator orientation="vertical" className="h-6 mx-1" />
            <MediaButtons controls={mediaControls} />
          </>
        )}
      </div>
      {toolbarRight && <div className="flex items-center gap-2 ml-auto">{toolbarRight}</div>}
    </div>
  );
};

export default UnifiedToolbar;
