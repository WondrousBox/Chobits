import React, { useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { TbLoader2, TbSend } from 'react-icons/tb';
import ServiceInstanceSelect from '@/components/AIAssistant/ServiceInstanceSelect';
import { useChatSelection } from './context/ChatSelectionContext';

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
  // Auto clear input after successful onStart (default true)
  autoClear?: boolean;
  // Disable input and actions
  disabled?: boolean;
  // Autofocus on mount
  autoFocus?: boolean;
  // Optional keydown handler; call e.preventDefault() to stop default submit behavior
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>, value: string) => void;
  // Notify when built-in instance selector menu opens/closes (e.g., to resize small windows)
  onInstanceMenuOpenChange?: (open: boolean) => void;
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
  autoClear = true,
  disabled = false,
  autoFocus = false,
  onKeyDown,
  onInstanceMenuOpenChange,
}: ChatInputProps) {
  // Standardized chat selection (provider/instance) available for all chat inputs
  // This makes instance selection a built-in part of ChatInput rather than requiring parent injection
  const { providerId, instanceId, setProviderId, setInstanceId, getOrderedInstances } = useChatSelection();

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
          onKeyDown?.(e, text);
          if (e.defaultPrevented) return;
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!loading) doStart();
          }
        }}
      />

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
        <div className="absolute bottom-2 right-14 flex items-center gap-2 drag-region">
          {footerRightExtra}
        </div>
      )}

      {/* Bottom toolbar */}
      <div className="absolute bottom-2 left-2 right-16 flex items-center gap-2 overflow-x-auto drag-region ">
        {/* Built-in: Service Instance selector (standard across all chat inputs) */}
        <div className="shrink-0 no-drag">
          <ServiceInstanceSelect
            providerId={providerId}
            instanceId={instanceId}
            onChange={(pid, iid) => { setProviderId(pid); setInstanceId(iid); }}
            buttonVariant="outline"
            buttonSize="sm"
            orderInstances={(list, pid) => (getOrderedInstances ? getOrderedInstances(pid) : list)}
            onOpenChange={onInstanceMenuOpenChange}
          />
        </div>
        {/* Extra left-side content from parent (optional) */}
        {footerLeft}
        <div className="shrink-0 text-xs text-muted-foreground">
          {'Enter 发送， Shift+Enter 换行'}
        </div>
      </div>
    </div>
  );
}
