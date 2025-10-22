import React, { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { TbLoader2, TbSend } from 'react-icons/tb';

export interface ChatInputProps {
  // Controlled value; if omitted, component manages its own state
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  // Called when user submits (Enter or click send). Receives plain text content
  onStart: (content: string) => void | Promise<void>;
  onStop?: () => void;
  loading?: boolean;
  placeholder?: string;
  className?: string;
  // Optional content displayed on the bottom-left toolbar area
  footerLeft?: React.ReactNode;
  // Extra actions displayed near the bottom-right send/stop button
  footerRightExtra?: React.ReactNode;
  // Optional overlay rendered above the footer, positioned absolute within container
  overlay?: React.ReactNode;
  // Auto clear input after successful onStart (default true)
  autoClear?: boolean;
  // Disable input and actions
  disabled?: boolean;
  // Autofocus on mount
  autoFocus?: boolean;
  // Optional keydown handler; call e.preventDefault() to stop default submit behavior
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>, value: string) => void;
  // Slash command support
  commands?: Array<{ key: string; title: string; hint?: string }>;
  onCommandPick?: (cmd: { key: string; title: string; hint?: string }) => void;
}

export default function ChatInput({
  value,
  defaultValue,
  onChange,
  onStart,
  onStop,
  loading,
  placeholder,
  className,
  footerLeft,
  footerRightExtra,
  overlay,
  autoClear = true,
  disabled = false,
  autoFocus = false,
  onKeyDown,
  commands,
  onCommandPick,
}: ChatInputProps) {
  const isControlled = useMemo(() => value !== undefined, [value]);
  const [inner, setInner] = useState<string>(defaultValue ?? '');
  const text = isControlled ? (value as string) : inner;
  const setText = (v: string) => {
    if (disabled) return;
    if (isControlled) onChange?.(v);
    else setInner(v);
  };

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [showScrollbar, setShowScrollbar] = useState(false);
  const [cmdIndex, setCmdIndex] = useState(0);

  const cmdMatch = useMemo(() => {
    const t = (text || '').trim();
    const m = t.match(/^\/(\S*)$/);
    return m ? m[1] : '';
  }, [text]);
  const isCommandMode = !!commands && commands.length > 0 && (text || '').trim().startsWith('/');
  const filteredCommands = useMemo(() => {
    if (!isCommandMode) return [] as Array<{ key: string; title: string; hint?: string }>;
    const f = (cmdMatch || '').toLowerCase();
    return (commands || []).filter(c => {
      if (!f) return true;
      return c.key.toLowerCase().includes(f) || (c.title || '').toLowerCase().includes(f);
    });
  }, [isCommandMode, cmdMatch, commands]);

  useEffect(() => {
    // reset selection when filter changes
    setCmdIndex(0);
  }, [cmdMatch]);

  // Auto focus
  useEffect(() => {
    if (!autoFocus) return;
    const el = textareaRef.current;
    if (el) {
      // slight delay to ensure visible
      const t = setTimeout(() => el.focus(), 10);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  // Textarea auto height and scroll pinning
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxH = 200;
    el.style.height = Math.min(el.scrollHeight, maxH) + 'px';
    const isOverflowing = el.scrollHeight > maxH;
    setShowScrollbar(isOverflowing);
    const isFocused = document.activeElement === el;
    const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
    if (isOverflowing && isFocused && atEnd) el.scrollTop = el.scrollHeight;
  }, [text]);

  const doStart = async () => {
    if (disabled || loading) return;
    const content = (text || '').trim();
    if (!content) return;
    try {
      await onStart(content);
      if (autoClear) setText('');
    } catch {
      // Let parent surface errors
    }
  };

  const doStop = () => {
    if (disabled) return;
    onStop?.();
  };

  return (
    <div className={clsx('relative box-border my-2 mx-2 max-w-[800px] w-[calc(100%-1rem)]', className)}>
      <Textarea
        ref={textareaRef}
        rows={1}
        disabled={disabled}
        className={clsx(
          'resize-none min-h-0 max-h-52 pr-24 pb-16 box-border rounded-2xl text-muted-foreground bg-muted',
          showScrollbar ? 'overflow-y-auto' : 'overflow-y-hidden',
          disabled ? 'opacity-60 cursor-not-allowed' : ''
        )}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={placeholder ?? '输入消息'}
        onKeyDown={(e) => {
          // built-in command mode handling
          if (isCommandMode) {
            if (e.key === 'ArrowDown') { e.preventDefault(); setCmdIndex(i => Math.min(filteredCommands.length - 1, i + 1)); return; }
            if (e.key === 'ArrowUp') { e.preventDefault(); setCmdIndex(i => Math.max(0, i - 1)); return; }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              const cmd = filteredCommands[cmdIndex];
              if (cmd) {
                const replaced = `/${cmd.key} `;
                setText(replaced);
                onCommandPick?.(cmd);
              }
              return;
            }
          }
          onKeyDown?.(e, text);
          if (e.defaultPrevented) return;
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!loading) doStart();
          }
        }}
      />

      {/* Built-in command palette overlay */}
      {isCommandMode && (
        <div className="absolute z-20 left-2 right-[4.5rem] top-full mt-2 rounded-2xl overflow-hidden border border-white/15 backdrop-blur-xl bg-[rgba(32,38,52,0.72)] shadow-xl">
          <div className="max-h-72 overflow-auto py-2">
            {filteredCommands.length === 0 && (
              <div className="px-4 py-3 text-sm text-white/50">无匹配命令</div>
            )}
            {filteredCommands.map((c, i) => (
              <button
                key={c.key}
                onMouseDown={e => { e.preventDefault(); setText(`/${c.key} `); onCommandPick?.(c); }}
                onMouseEnter={() => setCmdIndex(i)}
                className={`w-full text-left px-4 py-2.5 flex flex-col gap-1 transition-colors ${i === cmdIndex ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/10'}`}
              >
                <span className="text-[13px] font-medium">/{c.key} <span className="ml-2 opacity-70 font-normal">{c.title}</span></span>
                {c.hint && <span className="text-[11px] leading-snug opacity-60">{c.hint}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Send / Stop */}
      {!loading ? (
        <Button
          onClick={doStart}
          size="icon"
          disabled={disabled || !(text || '').trim()}
          className="absolute bottom-2 right-2 rounded-full"
          aria-label="发送"
        >
          <TbSend className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          onClick={doStop}
          size="icon"
          variant={"destructive"}
          className="absolute bottom-2 right-2 rounded-full"
          aria-label="停止"
        >
          <TbLoader2 className="h-4 w-4 animate-spin" />
        </Button>
      )}

      {/* Extra right actions (placed left to the send/stop button) */}
      {footerRightExtra && (
        <div className="absolute bottom-2 right-14 flex items-center gap-2">
          {footerRightExtra}
        </div>
      )}

      {/* Bottom toolbar */}
      <div className="absolute bottom-2 left-2 right-16 flex items-center gap-2 overflow-x-auto">
        {footerLeft}
        <div className="shrink-0 text-xs text-muted-foreground">
          {isCommandMode ? '输入命令关键字，↑↓ 选择，Enter 确认' : '输入 / 进入命令模式，Enter 发送， Shift+Enter 换行'}
        </div>
      </div>

      {/* Optional overlay (e.g., command palette) */}
      {overlay}
    </div>
  );
}
