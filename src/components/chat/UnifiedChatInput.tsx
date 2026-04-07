import clsx from 'clsx';
import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { TbBookmark, TbLoader2, TbSend, TbSquare } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export interface UnifiedChatInputProps {
  // Controlled value; if omitted, component manages its own state
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;

  // 发送消息回调 (用于聊天)
  onSend?: (content: string) => void | Promise<void>;
  // 保存内容回调 (用于保存为资源)
  onSave?: (content: string) => void | Promise<void>;
  // 停止生成回调
  onStop?: () => void;

  // 是否正在加载/生成中
  loading?: boolean;

  // 占位文字数组，会滚动展示
  placeholders?: string[];
  // 占位文字轮换间隔 (ms)
  placeholderInterval?: number;

  // 自定义类名
  className?: string;

  // 底部左侧工具栏内容
  footerLeft?: React.ReactNode;
  // 底部右侧额外内容 (在发送/保存按钮之前)
  footerRightExtra?: React.ReactNode;

  // 发送后自动清空 (默认 true)
  autoClear?: boolean;
  // 禁用输入
  disabled?: boolean;
  // 自动聚焦
  autoFocus?: boolean;

  // 可选的键盘事件处理
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>, value: string) => void;

  // 是否显示发送按钮 (默认 true)
  showSendButton?: boolean;
  // 是否显示保存按钮 (默认 true)
  showSaveButton?: boolean;

  // 文本区域的最大高度 (px)
  maxHeight?: number;

  // 高度变化回调 (用于通知父组件调整窗口大小)
  onHeightChange?: (height: number) => void;
}

export interface UnifiedChatInputHandle {
  focus: () => void;
  getValue: () => string;
  setValue: (value: string) => void;
}

const DEFAULT_PLACEHOLDERS = ['输入问题，开始对话...', '让我帮你分析一段文字', '帮我把这段中文翻译成英文', '写一个代码示例', '检索资源库中的内容'];

const UnifiedChatInput = React.forwardRef<UnifiedChatInputHandle, UnifiedChatInputProps>(function UnifiedChatInput(
  {
    value,
    defaultValue,
    onChange,
    onSend,
    onSave,
    onStop,
    loading = false,
    placeholders = DEFAULT_PLACEHOLDERS,
    placeholderInterval = 3000,
    className,
    footerLeft,
    footerRightExtra,
    autoClear = true,
    disabled = false,
    autoFocus = false,
    onKeyDown,
    showSendButton = true,
    showSaveButton = true,
    maxHeight = 200,
    onHeightChange
  }: UnifiedChatInputProps,
  ref
): JSX.Element {
  // 受控/非受控模式
  const isControlled = useMemo(() => value !== undefined, [value]);
  const [inner, setInner] = useState<string>(defaultValue ?? '');
  const text = isControlled ? (value as string) : inner;
  const setText = useCallback(
    (v: string): void => {
      if (disabled) return;
      if (isControlled) onChange?.(v);
      else setInner(v);
    },
    [disabled, isControlled, onChange]
  );

  // 占位文字轮换
  const [phIndex, setPhIndex] = useState(() => Math.floor(Math.random() * placeholders.length));
  const [phVisible, setPhVisible] = useState(true);

  useEffect(() => {
    const isEmpty = !text.trim();
    if (!isEmpty) return;

    const interval = setInterval(() => {
      // 先淡出
      setPhVisible(false);
      setTimeout(() => {
        setPhIndex((i) => (i + 1) % placeholders.length);
        setPhVisible(true);
      }, 150);
    }, placeholderInterval);

    return () => clearInterval(interval);
  }, [text, placeholders.length, placeholderInterval]);

  const currentPlaceholder = placeholders[phIndex % placeholders.length];

  // textarea 引用和滚动状态
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [showScrollbar, setShowScrollbar] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        textareaRef.current?.focus();
      },
      getValue: () => text,
      setValue: (nextValue: string) => {
        setText(nextValue);
      }
    }),
    [setText, text]
  );

  // 自动聚焦
  useEffect(() => {
    if (!autoFocus) return;
    const el = textareaRef.current;
    if (el) {
      const t = setTimeout(() => el.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  // Textarea 自动高度
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const newHeight = Math.min(el.scrollHeight, maxHeight);
    el.style.height = newHeight + 'px';
    const isOverflowing = el.scrollHeight > maxHeight;
    setShowScrollbar(isOverflowing);

    // 通知父组件高度变化
    if (onHeightChange && containerRef.current) {
      onHeightChange(containerRef.current.getBoundingClientRect().height);
    }

    // 保持滚动到底部
    const isFocused = document.activeElement === el;
    const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
    if (isOverflowing && isFocused && atEnd) {
      el.scrollTop = el.scrollHeight;
    }
  }, [text, maxHeight, onHeightChange]);

  // 发送消息
  const doSend = async (): Promise<void> => {
    if (disabled || loading || !onSend) return;
    const content = (text || '').trim();
    if (!content) return;
    try {
      await onSend(content);
      if (autoClear) setText('');
    } catch {
      // 让父组件处理错误
    }
  };

  // 保存内容
  const doSave = async (): Promise<void> => {
    if (disabled || !onSave) return;
    const content = (text || '').trim();
    if (!content) return;
    try {
      await onSave(content);
      if (autoClear) setText('');
    } catch {
      // 让父组件处理错误
    }
  };

  // 停止生成
  const doStop = (): void => {
    if (disabled) return;
    onStop?.();
  };

  const hasContent = (text || '').trim().length > 0;

  return (
    <div ref={containerRef} className={clsx('relative box-border my-2 mx-2 max-w-[800px] w-[calc(100%-1rem)]', className)}>
      <Textarea
        ref={textareaRef}
        rows={1}
        disabled={disabled}
        className={clsx(
          'resize-none min-h-0 pr-24 pb-14 box-border rounded-2xl text-foreground bg-muted transition-all',
          showScrollbar ? 'overflow-y-auto' : 'overflow-y-hidden',
          disabled ? 'opacity-60 cursor-not-allowed' : ''
        )}
        style={{ maxHeight: `${maxHeight}px` }}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder=""
        onKeyDown={(e) => {
          onKeyDown?.(e, text);
          if (e.defaultPrevented) return;
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!loading && onSend) doSend();
          }
        }}
      />

      {/* 自定义占位文字，带淡入淡出效果 */}
      {!text && (
        <div className={clsx('absolute top-3 left-3 text-muted-foreground pointer-events-none transition-opacity duration-150', phVisible ? 'opacity-100' : 'opacity-0')}>{currentPlaceholder}</div>
      )}

      {/* 底部工具栏 */}
      <div className="absolute bottom-2 flex items-center gap-2 overflow-x-auto w-[calc(100%-1rem)] px-2">
        {/* 左侧额外内容 */}
        {footerLeft}

        {/* 提示文字 */}
        <div className="shrink-0 flex-1 text-xs text-muted-foreground drag-region select-none">Enter 发送，Shift+Enter 换行</div>

        {/* 右侧额外内容 */}
        {footerRightExtra}

        {/* 保存按钮 */}
        {showSaveButton && onSave && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button onClick={doSave} size="icon" variant="outline" disabled={disabled || !hasContent} className="rounded-full" aria-label="保存">
                <TbBookmark />
              </Button>
            </TooltipTrigger>
            <TooltipContent>保存为资源</TooltipContent>
          </Tooltip>
        )}

        {/* 发送/停止按钮 */}
        {showSendButton && onSend && (
          <>
            {!loading ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={doSend} size="icon" disabled={disabled || !hasContent} className="rounded-full" aria-label="发送">
                    <TbSend />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>发送消息</TooltipContent>
              </Tooltip>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button onClick={doStop} size="icon" variant="destructive" className="rounded-full" aria-label="停止">
                    {onStop ? <TbSquare /> : <TbLoader2 className="animate-spin" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>停止生成</TooltipContent>
              </Tooltip>
            )}
          </>
        )}
      </div>
    </div>
  );
});

export default UnifiedChatInput;
