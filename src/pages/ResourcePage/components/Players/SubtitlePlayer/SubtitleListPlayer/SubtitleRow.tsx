import { AimSegments, utils } from '@aim-packages/subtitle';
import clsx from 'clsx';
import React, { useCallback, useRef, useState } from 'react';
import Textarea from 'react-expanding-textarea';
import { TbArrowMerge, TbTrash } from 'react-icons/tb';

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import type { WordTimestamp } from '../../MediaPlayer/subtitleDisplayEvent';
import type { AddAnnotationParams, SegmentAnnotationHighlight } from '../useAnnotations';
import { AnnotationPopover } from './AnnotationPopover';

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
  /** 字级别时间戳数据（卡拉OK高亮用） */
  words?: WordTimestamp[];
  /** 当前播放时间（秒），配合 words 实现卡拉OK高亮 */
  currentTime?: number;
  /** 当前片段的标注高亮列表 */
  annotationHighlights?: SegmentAnnotationHighlight[];
  /** 添加标注回调 */
  onAddAnnotation?: (params: AddAnnotationParams) => void;
  /** 删除标注回调 */
  onRemoveAnnotation?: (annotationId: string) => void;
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
  trackLabel,
  words,
  currentTime = 0,
  annotationHighlights,
  onAddAnnotation,
  onRemoveAnnotation
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingText, setEditingText] = useState(segment.text);
  const [hasChanged, setHasChanged] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const clickPosition = useRef(0);
  const internalRowRef = useRef<HTMLDivElement>(null);
  /** 标注浮窗状态 */
  const [annotationPopover, setAnnotationPopover] = useState<{
    selectedText: string;
    selectionRect: { top: number; bottom: number; left: number; right: number; width: number };
    wordStartIndex: number;
    wordEndIndex: number;
    startTime: number;
    endTime: number;
  } | null>(null);
  /** 删除确认对话框状态 */
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [annotationToDelete, setAnnotationToDelete] = useState<{ id: string; title?: string } | null>(null);
  const textContainerRef = useRef<HTMLDivElement>(null);

  // 打开删除确认对话框
  const openDeleteDialog = useCallback((annotationId: string, title?: string) => {
    setAnnotationToDelete({ id: annotationId, title });
    setDeleteDialogOpen(true);
  }, []);

  // 确认删除
  const confirmDelete = useCallback(() => {
    if (annotationToDelete && onRemoveAnnotation) {
      onRemoveAnnotation(annotationToDelete.id);
    }
    setAnnotationToDelete(null);
  }, [annotationToDelete, onRemoveAnnotation]);

  // 使用传入的 rowRef 或内部的 ref
  const currentRowRef = rowRef || internalRowRef;

  // 处理时间戳点击
  const handleTimeClick = useCallback(() => {
    if (onTimeClick) {
      const time = utils.convertToSeconds(segment.st);
      onTimeClick(time);
    }
  }, [onTimeClick, segment.st]);

  // 根据字符偏移计算标注的时间范围（共享逻辑）
  const computeAnnotationTimeRange = useCallback(
    (wordStartIdx: number, wordEndIdx: number) => {
      let startTime = utils.convertToSeconds(segment.st);
      let endTime = utils.convertToSeconds(segment.et);
      if (words && words.length > 0) {
        let charPos = 0;
        let foundStart = false;
        for (const w of words) {
          const wEnd = charPos + w.text.length;
          if (!foundStart && wEnd > wordStartIdx) {
            startTime = w.st;
            foundStart = true;
          }
          if (wEnd >= wordEndIdx) {
            endTime = w.et;
            break;
          }
          charPos = wEnd;
        }
      }
      return { startTime, endTime };
    },
    [segment.st, segment.et, words]
  );

  // 处理文字选择（非编辑模式 div 的 mouseup）
  const handleTextMouseUp = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (!onAddAnnotation || !isMainTrack) return;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !selection.toString().trim()) return;

      const selectedText = selection.toString().trim();
      const segText = segment.text || '';

      const range = selection.getRangeAt(0);
      let wordStartIndex = -1;
      let wordEndIndex = -1;

      if (textContainerRef.current) {
        const startIdx = segText.indexOf(selectedText);
        if (startIdx !== -1) {
          wordStartIndex = startIdx;
          wordEndIndex = startIdx + selectedText.length;
        }
      }

      if (wordStartIndex < 0) return;

      const { startTime, endTime } = computeAnnotationTimeRange(wordStartIndex, wordEndIndex);

      // 使用 getClientRects() 获取最后一个矩形（选区尾部），避免多行选区整体 boundingRect 过大
      const rects = range.getClientRects();
      const rect = rects.length > 0 ? rects[rects.length - 1] : range.getBoundingClientRect();
      setAnnotationPopover({
        selectedText,
        selectionRect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width },
        wordStartIndex,
        wordEndIndex,
        startTime,
        endTime
      });
    },
    [onAddAnnotation, isMainTrack, segment.text, computeAnnotationTimeRange]
  );

  // 处理文字选择（编辑模式 textarea 的 mouseup）
  const handleTextareaMouseUp = useCallback(
    (event: React.MouseEvent<HTMLTextAreaElement>) => {
      if (!onAddAnnotation || !isMainTrack) return;
      const textarea = event.currentTarget;
      const selStart = textarea.selectionStart;
      const selEnd = textarea.selectionEnd;
      if (selStart === selEnd) {
        // 没有选中文字，只是放置光标——关闭可能已存在的浮窗
        setAnnotationPopover(null);
        return;
      }

      const selectedText = textarea.value.slice(selStart, selEnd).trim();
      if (!selectedText) return;

      const { startTime, endTime } = computeAnnotationTimeRange(selStart, selEnd);

      // textarea 内无法用 Range.getBoundingClientRect()，
      // 用鼠标释放坐标近似选区矩形（配合两阶段触发按钮足够准确）
      const textareaRect = textarea.getBoundingClientRect();
      setAnnotationPopover({
        selectedText,
        selectionRect: {
          top: event.clientY - 14,
          bottom: event.clientY + 4,
          left: Math.max(event.clientX - 30, textareaRect.left),
          right: Math.min(event.clientX + 30, textareaRect.right),
          width: 60
        },
        wordStartIndex: selStart,
        wordEndIndex: selEnd,
        startTime,
        endTime
      });
    },
    [onAddAnnotation, isMainTrack, computeAnnotationTimeRange]
  );

  const handleTextClick = (event: React.MouseEvent<HTMLDivElement>): void => {
    // 如果有选中文字（刚触发了 mouseup），不进入编辑模式
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim()) {
      return;
    }
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
          onMouseUp={handleTextareaMouseUp}
          rows={Math.max(1, editingText.split('\n').length)}
          onFocus={
            // // https://stackoverflow.com/questions/44983286/send-cursor-to-the-end-of-input-value-in-react
            // (e) => e.currentTarget.setSelectionRange(e.currentTarget.value.length, e.currentTarget.value.length)
            (e) => e.currentTarget.setSelectionRange(clickPosition.current, clickPosition.current)
          }
          autoFocus
        />
      ) : (
        <div className="flex-1 relative z-10" ref={textContainerRef}>
          {/* 原始文本（可卡拉OK高亮 + 标注高亮） */}
          <div
            className={clsx(getClassName(segment.delete, isActive), disabled && 'pointer-events-none cursor-not-allowed opacity-80')}
            style={{ whiteSpace: 'pre-wrap' }}
            onClick={handleTextClick}
            onMouseUp={handleTextMouseUp}
          >
            {isActive && words && words.length > 0
              ? renderWordsWithAnnotations(words, currentTime, annotationHighlights, openDeleteDialog)
              : renderTextWithAnnotations(segment.text?.trim() || '\u200b', annotationHighlights, openDeleteDialog)}
          </div>
        </div>
      )}

      {/* 标注浮窗 */}
      {annotationPopover && onAddAnnotation && (
        <AnnotationPopover
          selectedText={annotationPopover.selectedText}
          selectionRect={annotationPopover.selectionRect}
          startTime={annotationPopover.startTime}
          endTime={annotationPopover.endTime}
          segmentIndex={index}
          wordStartIndex={annotationPopover.wordStartIndex}
          wordEndIndex={annotationPopover.wordEndIndex}
          onAdd={(params) => {
            onAddAnnotation(params);
            setAnnotationPopover(null);
            window.getSelection()?.removeAllRanges();
            // 清除 textarea 选区（如果还在编辑模式）
            if (inputRef.current) {
              const pos = inputRef.current.selectionEnd;
              inputRef.current.selectionStart = pos;
            }
          }}
          onClose={() => {
            setAnnotationPopover(null);
            window.getSelection()?.removeAllRanges();
            if (inputRef.current) {
              const pos = inputRef.current.selectionEnd;
              inputRef.current.selectionStart = pos;
            }
          }}
        />
      )}

      {/* 删除确认对话框 */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除标注</AlertDialogTitle>
            <AlertDialogDescription>
              {annotationToDelete?.title
                ? `确定要删除标注「${annotationToDelete.title}」吗？此操作无法撤销。`
                : '确定要删除此标注吗？此操作无法撤销。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ========== 辅助渲染函数：带标注高亮的文字 ==========

/**
 * 渲染带标注高亮的纯文本（非卡拉OK模式）
 */
function renderTextWithAnnotations(text: string, highlights?: SegmentAnnotationHighlight[], openDeleteDialog?: (id: string, title?: string) => void): React.ReactNode {
  if (!highlights || highlights.length === 0) return text;

  // 按 startIndex 排序
  const sorted = [...highlights].sort((a, b) => a.startIndex - b.startIndex);
  const parts: React.ReactNode[] = [];
  let lastEnd = 0;

  for (const hl of sorted) {
    const start = Math.max(hl.startIndex, lastEnd);
    const end = Math.min(hl.endIndex, text.length);
    if (start >= end) continue;

    // 前面没有高亮的部分
    if (lastEnd < start) {
      parts.push(<span key={`t-${lastEnd}`}>{text.slice(lastEnd, start)}</span>);
    }

    // 高亮部分
    const hlText = text.slice(start, end);
    parts.push(<AnnotationHighlightSpan key={`a-${hl.id}`} highlight={hl} text={hlText} openDeleteDialog={openDeleteDialog} />);

    lastEnd = end;
  }

  // 剩余文字
  if (lastEnd < text.length) {
    parts.push(<span key={`t-${lastEnd}`}>{text.slice(lastEnd)}</span>);
  }

  return parts;
}

/**
 * 渲染卡拉OK模式 + 标注高亮的文字
 * words 模式下按字符偏移匹配标注
 */
function renderWordsWithAnnotations(words: WordTimestamp[], currentTime: number, highlights?: SegmentAnnotationHighlight[], openDeleteDialog?: (id: string, title?: string) => void): React.ReactNode {
  if (!highlights || highlights.length === 0) {
    return words.map((word, i) => {
      const isWordActive = currentTime >= word.st && currentTime < word.et;
      const isPast = currentTime >= word.et;
      return (
        <span
          key={i}
          className={clsx(
            'transition-colors duration-100',
            isWordActive && 'text-primary font-bold bg-primary/20 rounded-sm',
            isPast && 'text-foreground',
            !isPast && !isWordActive && 'text-muted-foreground'
          )}
        >
          {word.text}
        </span>
      );
    });
  }

  // 构建字符偏移到标注的映射
  const hlMap = new Map<number, SegmentAnnotationHighlight>();
  for (const hl of highlights) {
    for (let i = hl.startIndex; i < hl.endIndex; i++) {
      hlMap.set(i, hl);
    }
  }

  let charPos = 0;
  return words.map((word, i) => {
    const wordStart = charPos;
    const wordEnd = charPos + word.text.length;
    charPos = wordEnd;

    const isWordActive = currentTime >= word.st && currentTime < word.et;
    const isPast = currentTime >= word.et;

    // 检查这个 word 是否被标注覆盖
    const hl = hlMap.get(wordStart);

    const wordEl = (
      <span
        key={i}
        className={clsx(
          'transition-colors duration-100',
          isWordActive && 'text-primary font-bold bg-primary/20 rounded-sm',
          isPast && 'text-foreground',
          !isPast && !isWordActive && 'text-muted-foreground',
          hl && 'underline decoration-2 decoration-wavy'
        )}
        style={hl ? { textDecorationColor: hl.color } : undefined}
      >
        {word.text}
      </span>
    );

    // 如果这个 word 是标注范围的第一个字，用 Tooltip 包裹
    if (hl && wordStart === hl.startIndex) {
      return (
        <Tooltip key={`a-${i}`}>
          <TooltipTrigger asChild>{wordEl}</TooltipTrigger>
          <TooltipContent side="top" className="max-w-[200px]">
            <div className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  {hl.title && <div className="font-medium truncate">{hl.title}</div>}
                  {hl.description && <div className="text-muted-foreground mt-0.5 line-clamp-2">{hl.description}</div>}
                  {!hl.title && !hl.description && <div className="text-muted-foreground">{hl.type}</div>}
                </div>
                {openDeleteDialog && (
                  <button
                    onClick={() => openDeleteDialog(hl.id, hl.title)}
                    className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    title="删除标注"
                  >
                    <TbTrash className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      );
    }

    return wordEl;
  });
}

/**
 * 标注高亮文字片段（带 Tooltip 和右键删除）
 */
const AnnotationHighlightSpan: React.FC<{
  highlight: SegmentAnnotationHighlight;
  text: string;
  openDeleteDialog?: (id: string, title?: string) => void;
}> = ({ highlight, text, openDeleteDialog }) => {
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (!openDeleteDialog) return;
      e.preventDefault();
      openDeleteDialog(highlight.id, highlight.title);
    },
    [highlight.id, highlight.title, openDeleteDialog]
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="underline decoration-2 decoration-wavy cursor-pointer"
          style={{
            textDecorationColor: highlight.color,
            backgroundColor: `${highlight.color}20`
          }}
          onContextMenu={handleContextMenu}
        >
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[200px]">
        <div className="text-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              {highlight.title && <div className="font-medium truncate">{highlight.title}</div>}
              {highlight.description && <div className="text-muted-foreground mt-0.5 line-clamp-2">{highlight.description}</div>}
              {!highlight.title && !highlight.description && <div className="text-muted-foreground">{highlight.type}</div>}
            </div>
            {openDeleteDialog && (
              <button
                onClick={() => openDeleteDialog(highlight.id, highlight.title)}
                className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                title="删除标注"
              >
                <TbTrash className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
};
