import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TbHighlight, TbLoader2, TbNote, TbVocabulary, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';

import type { AddAnnotationParams, AnnotationType } from '../useAnnotations';

interface AnnotationPopoverProps {
  /** 选中的文字 */
  selectedText: string;
  /** 选中文字的矩形区域（用于定位） */
  selectionRect: { top: number; bottom: number; left: number; right: number; width: number };
  /** 标注的时间范围 */
  startTime: number;
  endTime: number;
  /** 片段索引 */
  segmentIndex: number;
  /** 文字在片段中的字符位置 */
  wordStartIndex: number;
  wordEndIndex: number;
  /** 添加标注回调 */
  onAdd: (params: AddAnnotationParams) => void;
  /** 关闭回调 */
  onClose: () => void;
}

/** AI 生成单词表的系统提示词 */
const VOCABULARY_SYSTEM_PROMPT = `你是一个语言学习助手。用户会给你一段文本，请从中提取有学习价值的单词或短语。

要求：
1. 提取生词、习语、短语等有学习价值的内容
2. 如果是英文，提供音标、词性、中文释义和例句
3. 如果是其他语言，提供相应的释义和用法
4. 以简洁的格式返回，便于用户学习

返回格式示例：
**word** /音标/ [词性]
释义：xxx
例句：xxx`;

/**
 * 标注操作浮窗
 *
 * 选中文本后直接在选区下方显示操作面板，支持快速高亮、备注、单词表等操作。
 * 靠近视口底部时自动翻转到上方。
 */
export const AnnotationPopover: React.FC<AnnotationPopoverProps> = ({ selectedText, selectionRect, startTime, endTime, segmentIndex, wordStartIndex, wordEndIndex, onAdd, onClose }) => {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [annotationType, setAnnotationType] = useState<AnnotationType>('note');
  /** 是否需要翻转到选区上方 */
  const [flipAbove, setFlipAbove] = useState(false);
  /** 是否正在生成单词表 */
  const [isGeneratingVocabulary, setIsGeneratingVocabulary] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // 计算是否需要翻转位置
  useEffect(() => {
    const checkFlip = () => {
      const spaceBelow = window.innerHeight - selectionRect.bottom;
      // 面板高度：按钮行约 48px，表单约 280px
      const neededHeight = showForm ? 280 : 48;
      setFlipAbove(spaceBelow < neededHeight);
    };
    checkFlip();
    window.addEventListener('resize', checkFlip);
    return () => window.removeEventListener('resize', checkFlip);
  }, [selectionRect.bottom, showForm]);

  // 视口边界钳制：确保浮窗不超出屏幕
  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8; // 距离视口边缘的最小间距
    let dx = 0;
    let dy = 0;
    if (rect.left < pad) dx = pad - rect.left;
    else if (rect.right > window.innerWidth - pad) dx = window.innerWidth - pad - rect.right;
    if (rect.top < pad) dy = pad - rect.top;
    else if (rect.bottom > window.innerHeight - pad) dy = window.innerHeight - pad - rect.bottom;
    if (dx !== 0 || dy !== 0) {
      el.style.transform = `translate(calc(-50% + ${dx}px), ${dy}px)`;
    }
  });

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // 延迟绑定，避免创建浮窗的 mouseup 事件立即触发关闭
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // 展开表单时自动聚焦标题输入框
  useEffect(() => {
    if (showForm) {
      titleInputRef.current?.focus();
    }
  }, [showForm]);

  // Esc 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const createAnnotation = useCallback(
    (type: AnnotationType, extra?: { title?: string; description?: string }) => {
      onAdd({
        startTime,
        endTime,
        text: selectedText,
        segmentIndex,
        wordStartIndex,
        wordEndIndex,
        type,
        title: extra?.title,
        description: extra?.description
      });
    },
    [startTime, endTime, selectedText, segmentIndex, wordStartIndex, wordEndIndex, onAdd]
  );

  const handleQuickHighlight = useCallback(() => {
    createAnnotation('highlight');
  }, [createAnnotation]);

  const handleQuickNote = useCallback(() => {
    setAnnotationType('note');
    setShowForm(true);
  }, []);

  /** 生成单词表 - 调用 AI */
  const handleGenerateVocabulary = useCallback(async () => {
    setIsGeneratingVocabulary(true);
    try {
      const resultText = await new Promise<string>((resolve, reject) => {
        let accumulated = '';

        window.YUA.ai
          .chatStream(
            {
              messages: [
                { role: 'system', content: VOCABULARY_SYSTEM_PROMPT },
                { role: 'user', content: `请分析以下文本，提取其中的单词和短语：\n\n${selectedText}` }
              ],
              stream: true,
              persist: false
            },
            (event) => {
              if (event.type === 'delta' && event.data?.text) {
                accumulated += event.data.text;
              } else if (event.type === 'message_completed' && event.data?.message?.content) {
                resolve(event.data.message.content);
              } else if (event.type === 'error') {
                reject(new Error(event.data?.message || 'AI 生成失败'));
              }
            }
          )
          .then((disposer) => {
            // 如果长时间没有 message_completed，使用累积的文本
            setTimeout(() => {
              if (accumulated) {
                resolve(accumulated);
              }
            }, 30000);
            return disposer;
          });
      });

      // 保存单词表标注
      onAdd({
        startTime,
        endTime,
        text: selectedText,
        segmentIndex,
        wordStartIndex,
        wordEndIndex,
        type: 'vocabulary',
        title: '单词表',
        description: resultText
      });

      onClose();
    } catch (error) {
      console.error('[Vocabulary] 生成异常:', error);
    } finally {
      setIsGeneratingVocabulary(false);
    }
  }, [selectedText, startTime, endTime, segmentIndex, wordStartIndex, wordEndIndex, onAdd, onClose]);

  const handleFormSubmit = useCallback(() => {
    createAnnotation(annotationType, { title: title.trim() || undefined, description: description.trim() || undefined });
  }, [createAnnotation, annotationType, title, description]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleFormSubmit();
      }
    },
    [handleFormSubmit]
  );

  // 定位样式
  const positionStyle: React.CSSProperties = flipAbove
    ? {
      // 翻转到上方
      bottom: window.innerHeight - selectionRect.top + 6,
      left: selectionRect.left + selectionRect.width / 2
    }
    : {
      // 默认在下方
      top: selectionRect.bottom + 6,
      left: selectionRect.left + selectionRect.width / 2
    };

  // 阻止浮窗内的 mousedown 事件导致 textarea 失焦
  // 但放行表单内的 input/textarea 元素，以保证它们可以正常获得焦点
  const handlePopoverMouseDown = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    e.preventDefault();
  }, []);

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-[9999]"
      style={{
        ...positionStyle,
        transform: 'translate(-50%, 0)'
      }}
      onMouseDown={handlePopoverMouseDown}
    >
      {!showForm ? (
        /* 快捷操作面板 */
        <div
          className="bg-popover text-popover-foreground border rounded-lg shadow-xl
            animate-in fade-in slide-in-from-top-1 duration-200
            relative"
        >
          {/* 上方小三角指示器（当面板在下方时） */}
          {!flipAbove && <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-popover border-l border-t border-border" />}
          <div className="flex items-center gap-1 p-1 relative z-10">
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={handleQuickHighlight} title="高亮标记">
              <TbHighlight className="w-4 h-4 text-yellow-500" />
              高亮
            </Button>
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={handleQuickNote} title="添加备注">
              <TbNote className="w-4 h-4 text-blue-500" />
              备注
            </Button>
            <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={handleGenerateVocabulary} disabled={isGeneratingVocabulary} title="AI 生成单词表">
              {isGeneratingVocabulary ? <TbLoader2 className="w-4 h-4 text-green-500 animate-spin" /> : <TbVocabulary className="w-4 h-4 text-green-500" />}
              {isGeneratingVocabulary ? '生成中...' : '单词表'}
            </Button>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 ml-auto" onClick={onClose} title="关闭">
              <TbX className="w-4 h-4" />
            </Button>
          </div>
          {/* 下方小三角指示器（当面板在上方时） */}
          {flipAbove && <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-popover border-r border-b border-border" />}
        </div>
      ) : (
        /* 详细表单 */
        <div
          className="bg-popover text-popover-foreground border rounded-lg shadow-xl
            animate-in fade-in slide-in-from-top-1 duration-200
            relative"
          style={{ minWidth: 280 }}
        >
          {!flipAbove && <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-popover border-l border-t border-border" />}
          <div className="p-3 space-y-2 relative z-10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">添加备注</span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
                <TbX className="w-3 h-3" />
              </Button>
            </div>
            <div className="text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1 truncate" title={selectedText}>
              「{selectedText}」
            </div>
            <input
              ref={titleInputRef}
              type="text"
              placeholder="标题（可选）"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full h-8 px-2 text-sm border rounded bg-background text-foreground outline-none focus:ring-1 focus:ring-ring"
            />
            <textarea
              placeholder="描述（可选）"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-2 py-1.5 text-sm border rounded bg-background text-foreground outline-none focus:ring-1 focus:ring-ring resize-none"
            />
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowForm(false)}>
                返回
              </Button>
              <Button size="sm" className="h-7 text-xs" onClick={handleFormSubmit}>
                确认
              </Button>
            </div>
          </div>
          {flipAbove && <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-popover border-r border-b border-border" />}
        </div>
      )}
    </div>,
    document.body
  );
};
