import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface InlineEditableTextProps {
  value?: string;
  placeholder?: string;
  onCommit?: (value: string) => void;
  onChange?: (value: string) => void;
  onCancel?: () => void;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  autoSelect?: boolean;
}

const getCaretIndexFromPoint = (element: HTMLSpanElement, x: number, y: number): number => {
  const doc = element.ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const textNode = element.firstChild;
  const textLength = textNode?.textContent?.length ?? 0;
  if (!doc || !textNode || textLength === 0) {
    return 0;
  }

  if (typeof doc.caretPositionFromPoint === 'function') {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos && pos.offsetNode === textNode) {
      return pos.offset;
    }
  }

  if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(x, y);
    if (range && range.startContainer === textNode) {
      return range.startOffset;
    }
  }

  const range = doc.createRange();
  range.selectNodeContents(textNode);

  let low = 0;
  let high = textLength;
  let best = textLength;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    range.setStart(textNode, mid);
    range.setEnd(textNode, mid);
    const rect = range.getBoundingClientRect();
    const left = rect.left || element.getBoundingClientRect().left;

    if (left < x) {
      low = mid + 1;
      best = Math.min(textLength, mid + 1);
    } else {
      best = mid;
      high = mid - 1;
    }
  }

  return best;
};

export const InlineEditableText: React.FC<InlineEditableTextProps> = ({ value = '', placeholder, onCommit, onChange, onCancel, className, inputClassName, disabled, autoSelect = false }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [caretIndex, setCaretIndex] = useState<number | null>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [value, editing]);

  useLayoutEffect(() => {
    if (editing && inputRef.current) {
      const target = Math.max(0, Math.min(typeof caretIndex === 'number' ? caretIndex : draft.length, draft.length));
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        if (autoSelect) {
          inputRef.current?.select();
        } else {
          inputRef.current?.setSelectionRange(target, target);
        }
      });
    }
  }, [editing, caretIndex, draft.length, autoSelect]);

  const handleActivate = useCallback(
    (event: React.MouseEvent<HTMLSpanElement>) => {
      if (disabled) return;
      const span = textRef.current;
      if (!span) return;
      const nextCaret = getCaretIndexFromPoint(span, event.clientX, event.clientY);
      setCaretIndex(nextCaret);
      setEditing(true);
    },
    [disabled]
  );

  const handleCommit = useCallback(() => {
    if (disabled) return;
    setEditing(false);
    onCommit?.(draft);
  }, [draft, disabled, onCommit]);

  const handleCancel = useCallback(() => {
    setEditing(false);
    setDraft(value);
    onCancel?.();
  }, [onCancel, value]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleCommit();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        handleCancel();
      }
    },
    [handleCommit, handleCancel]
  );

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={draft}
        placeholder={placeholder}
        className={cn('h-7 px-2 text-sm', inputClassName)}
        onChange={(event) => {
          setDraft(event.target.value);
          onChange?.(event.target.value);
        }}
        onBlur={handleCommit}
        onKeyDown={handleKeyDown}
      />
    );
  }

  const displayText = draft || placeholder || '';

  return (
    <span
      ref={textRef}
      role="button"
      tabIndex={disabled ? -1 : 0}
      className={cn(
        'inline-flex items-center rounded px-1 text-sm font-medium text-foreground cursor-text hover:bg-muted transition-colors',
        !draft && placeholder ? 'text-muted-foreground' : '',
        className
      )}
      onClick={handleActivate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setCaretIndex(draft.length);
          setEditing(true);
        }
      }}
    >
      {displayText || ' '}
    </span>
  );
};

export default InlineEditableText;
