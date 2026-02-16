import { AimSegments, utils } from '@aim-packages/subtitle';
import clsx from 'clsx';
import React, { useCallback, useRef, useState } from 'react';
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
  isActive?: boolean; // 是否正在播放（高亮显示）
  rowRef?: React.RefObject<HTMLDivElement>; // 用于滚动定位的 ref
  onTextChange: (index: number, text: string) => void;
  onMergePrev?: (index: number) => void;
  onMergeNext?: (index: number) => void;
  onTimeClick?: (time: number) => void; // 点击时间戳的回调，传递时间（秒）
  disabled?: boolean; // 是否禁用编辑
  highlight?: boolean; // 是否高亮显示（用于标识新变更的内容，引起用户注意）
  isMainTrack?: boolean; // 是否是主轨道（用于控制时间显示）
  isEditable?: boolean; // 是否允许编辑文本
  trackLabel?: string; // 轨道显示名称
}

const textareaStyle = 'resize-none block p-2 flex-1 outline-none box-border bg-background text-foreground border-none text-base';

const getClassName = (isDelete?: boolean, isActive?: boolean): Array<string> => {
  return [
    'p-2 flex-1 outline-none break-words cursor-text border-none text-base text-foreground select-text',
    isDelete ? 'line-through pointer-events-none text-muted-foreground' : '',
    isActive ? 'bg-primary/10 text-primary' : ''
  ];
};

export const SubtitleRow: React.FC<SubtitleRowProps> = ({
  index,
  segment,
  isActive = false,
  rowRef,
  onTextChange,
  onMergePrev,
  onTimeClick,
  disabled = false,
  highlight = false,
  isMainTrack = true,
  isEditable = true,
  trackLabel
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingText, setEditingText] = useState(segment.text);
  const [hasChanged, setHasChanged] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const clickPosition = useRef(0);
  const internalRowRef = useRef<HTMLDivElement>(null);

  // 使用传入的 rowRef 或内部的 ref
  const currentRowRef = rowRef || internalRowRef;

  // 处理时间戳点击
  const handleTimeClick = useCallback(() => {
    if (onTimeClick) {
      const time = utils.convertToSeconds(segment.st);
      onTimeClick(time);
    }
  }, [onTimeClick, segment.st]);

  const handleTextClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    // 如果禁用，禁止编辑
    if (disabled || !isEditable) {
      return;
    }
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
    <div
      ref={currentRowRef}
      className={clsx(
        'flex items-start justify-center gap-2 relative pl-4 group transition-colors duration-200 overflow-hidden',
        isActive && 'bg-primary/10',
        disabled && 'pointer-events-none',
        highlight && !disabled && 'rounded-lg'
      )}
    >
      {/* 高亮时的炫酷动画效果 */}
      {highlight && (
        <>
          {/* 渐变背景 */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/15 via-purple-500/15 to-pink-500/15 dark:from-blue-500/8 dark:via-purple-500/8 dark:to-pink-500/8 animate-pulse" />
          {/* 流动光效 */}
          <div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent dark:via-white/8 animate-[shimmer_3s_ease-in-out_infinite] -translate-x-full"
            style={{ animationDelay: '0.5s' }}
          />
          {/* 边框光晕 */}
          <div className="absolute inset-0 rounded-lg border-2 border-blue-400/40 dark:border-blue-500/40 shadow-[0_0_10px_rgba(59,130,246,0.4)] dark:shadow-[0_0_10px_rgba(59,130,246,0.25)] animate-pulse" />
          <style>{`
            @keyframes shimmer {
              0% { transform: translateX(-100%) skewX(-15deg); }
              100% { transform: translateX(200%) skewX(-15deg); }
            }
          `}</style>
        </>
      )}
      {/* 合并按钮：绝对定位在两行之间，不占高度 */}
      {index > 0 && onMergePrev && isMainTrack && (
        <div className="absolute left-1 top-0 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-20 pointer-events-auto">
          <div className="w-14 h-1 absolute -top-1 left-4 rounded-tl-lg border border-dashed border-ring border-r-0 border-b-0"></div>
          <Button size="sm" variant="outline" className="w-8 h-8 rounded-full p-0 bg-background shadow-sm hover:bg-accent" onClick={() => onMergePrev(index)} title="合并到上一行">
            <TbArrowMerge />
          </Button>
          <div className="w-4 h-1 absolute -top-2 left-16 rounded-br-lg border border-dashed border-ring border-t-0 border-l-0"></div>
          <div className=" w-2 h-2 absolute -top-4 left-16 rounded-lg ml-3 bg-ring"></div>
        </div>
      )}
      <div
        className={clsx(
          'select-none pt-3 text-xs w-16 text-center relative transition-colors duration-200 z-10',
          isMainTrack && onTimeClick && 'cursor-pointer',
          isMainTrack && (isActive ? 'text-primary font-medium' : 'text-muted-foreground hover:text-primary'),
          isMainTrack && onTimeClick && 'hover:underline',
          !isMainTrack && 'text-muted-foreground/60'
        )}
        onClick={isMainTrack && onTimeClick ? handleTimeClick : undefined}
        title={isMainTrack && onTimeClick ? '点击跳转到此时间' : undefined}
      >
        {isMainTrack ? (
          <>
            <span className="text-xs absolute left-1/2 -translate-x-1/2 -top-1 group-hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300">#{index + 1}</span>
            {utils.cleanTimeDisplay(segment.st)}
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground/50 truncate"></span>
        )}
      </div>
      {isEditing ? (
        <Textarea
          ref={inputRef}
          className={clsx(textareaStyle, 'relative z-10')}
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
        <div className="flex-1 relative z-10">
          {/* 原始文本 */}
          <div className={clsx(getClassName(segment.delete, isActive), disabled && 'pointer-events-none cursor-not-allowed opacity-80')} style={{ whiteSpace: 'pre-wrap' }} onClick={handleTextClick}>
            {segment.text?.trim() || '\u200b'}
          </div>
        </div>
      )}
    </div>
  );
};
