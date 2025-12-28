import { AimSegments, tools, utils } from '@aim-packages/subtitle';
import clsx from 'clsx';
import React, { useRef, useState } from 'react';
import Textarea from 'react-expanding-textarea';

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
}

const textareaStyle = 'resize-none block p-2 flex-1 outline-none box-border bg-background text-foreground border-none text-base';

const getClassName = (isDelete?: boolean): Array<string> => {
  return ['p-2 flex-1 outline-none break-words cursor-text border-none text-base text-foreground', isDelete ? 'line-through pointer-events-none text-muted-foreground' : ''];
};

export const SubtitleRow: React.FC<SubtitleRowProps> = ({ index, segment, onTextChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingText, setEditingText] = useState(segment.text);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const clickPosition = useRef(0);

  const handleTextClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    // 使用 getClickTextPosition 获取点击位置的字符偏移
    const offset = getClickTextPosition(event.nativeEvent);
    clickPosition.current = offset;
    setIsEditing(true);
    setEditingText(segment.text);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const newText = e.target.value;
    setEditingText(newText);
    // 内容变更时立即触发保存
    onTextChange(index, newText);
  };

  const handleBlur = (): void => {
    if (!isEditing) return;

    // 失焦时确保最后一次变更被保存
    onTextChange(index, editingText);
    setIsEditing(false);
  };

  return (
    <div className="flex items-start justify-center gap-2 relative pl-4 group">
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
