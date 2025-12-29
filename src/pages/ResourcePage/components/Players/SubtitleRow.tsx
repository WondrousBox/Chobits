import { AimSegments, tools, utils } from '@aim-packages/subtitle';
import clsx from 'clsx';
import React, { useRef, useState } from 'react';
import Textarea from 'react-expanding-textarea';
import { TbArrowMerge } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

function getClickTextPosition(e: MouseEvent): number {
  let position = 0;
  const range = document.caretRangeFromPoint(e.clientX, e.clientY);
  if (range) {
    position = range.startOffset;
    return position;
  }
  return position;
}

interface SubtitleRowProps {
  index: number;
  segment: AimSegments;
  onTextChange: (index: number, text: string) => void;
  onMergePrev?: (index: number) => void;
  onMergeNext?: (index: number) => void;
}

const textareaStyle = 'resize-none block p-2 flex-1 outline-none box-border bg-background text-foreground border-none text-base';

const getClassName = (isDelete?: boolean): Array<string> => {
  return ['p-2 flex-1 outline-none break-words cursor-text border-none text-base text-foreground select-text', isDelete ? 'line-through pointer-events-none text-muted-foreground' : ''];
};

export const SubtitleRow: React.FC<SubtitleRowProps> = ({ index, segment, onTextChange, onMergePrev, onMergeNext }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingText, setEditingText] = useState(segment.text);
  const [hasChanged, setHasChanged] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const clickPosition = useRef(0);

  const handleTextClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    // 使用 getClickTextPosition 获取点击位置的字符偏移
    const offset = getClickTextPosition(event.nativeEvent);
    clickPosition.current = offset;
    setIsEditing(true);
    setEditingText(segment.text);
    setHasChanged(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const newText = e.target.value;
    setEditingText(newText);
    // 检查内容是否与原始内容不同
    if (newText !== segment.text) {
      if (!hasChanged) {
        setHasChanged(true);
      }
      // 内容变更时触发保存
      onTextChange(index, newText);
    } else {
      // 如果内容恢复为原始值，重置变更状态
      if (hasChanged) {
        setHasChanged(false);
      }
    }
  };

  const handleBlur = (): void => {
    if (!isEditing) return;

    // 失焦时如果内容有变更，确保最后一次变更被保存
    if (hasChanged) {
      onTextChange(index, editingText);
    }
    setIsEditing(false);
    setHasChanged(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // 检测退格键
    if (e.key === 'Backspace') {
      const textarea = e.currentTarget;
      const cursorPosition = textarea.selectionStart;

      // 如果光标在最前面（位置为0）且不是第一个字幕
      if (cursorPosition === 0 && index > 0 && onMergePrev) {
        e.preventDefault(); // 阻止默认的退格行为
        // 触发向前合并：将当前字幕与前一个字幕合并
        onMergePrev(index);
      }
    }
  };

  return (
    <div className="flex items-start justify-center gap-2 relative pl-4 group">
      {/* 合并按钮：绝对定位在两行之间，不占高度 */}
      {index > 0 && onMergePrev && (
        <div className="absolute left-1 top-0 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 pointer-events-auto">
          <div className="w-14 h-1 absolute -top-1 left-4 rounded-tl-lg border border-dashed border-ring border-r-0 border-b-0"></div>
          <Button size="sm" variant="outline" className="w-8 h-8 rounded-full p-0 bg-background shadow-sm hover:bg-accent" onClick={() => onMergePrev(index)} title="合并到上一行">
            <TbArrowMerge />
          </Button>
          <div className="w-4 h-1 absolute -top-2 left-16 rounded-br-lg border border-dashed border-ring border-t-0 border-l-0"></div>
          <div className=" w-2 h-2 absolute -top-4 left-16 rounded-lg ml-3 bg-ring"></div>
        </div>
      )}
      <div className="select-none pt-3 cursor-pointer text-muted-foreground text-xs hover:text-primary w-12 text-center relative" onClick={() => { }}>
        <span className="text-xs absolute left-1/2 -translate-x-1/2 -top-1  group-hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300">#{index + 1}</span>
        {utils.cleanTimeDisplay(segment.st)}
      </div>
      {isEditing ? (
        <Textarea
          ref={inputRef}
          className={textareaStyle}
          value={editingText}
          onChange={handleChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          rows={Math.max(1, editingText.split('\n').length)}
          onFocus={
            // // https://stackoverflow.com/questions/44983286/send-cursor-to-the-end-of-input-value-in-react
            // (e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)

            (e) => e.currentTarget.setSelectionRange(clickPosition.current, clickPosition.current)
          }
          autoFocus
        />
      ) : (
        <div className={clsx(getClassName(segment.delete))} style={{ whiteSpace: 'pre-wrap' }} onClick={handleTextClick}>
          {segment.text || '\u200b'}
        </div>
      )}
    </div>
  );
};
