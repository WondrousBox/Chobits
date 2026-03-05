import clsx from 'clsx';
import React, { useCallback, useState } from 'react';

export interface PendingSegmentRange {
  startTime: number;
  endTime: number;
}

interface InlinePendingSegmentInputProps {
  pendingSegment: PendingSegmentRange | null;
  pixelsPerSecond: number;
  top: number;
  height: number;
  minWidth?: number;
  placeholder?: string;
  onConfirm?: (startTime: number, endTime: number, text: string) => void;
  onCancel?: () => void;
}

/**
 * 统一的“待新增片段”内联输入框
 * - Enter：确认
 * - Esc：取消
 * - Blur：有内容确认，无内容取消
 */
export const InlinePendingSegmentInput: React.FC<InlinePendingSegmentInputProps> = ({
  pendingSegment,
  pixelsPerSecond,
  top,
  height,
  minWidth = 150,
  placeholder = '输入内容，enter 确认，esc 取消',
  onConfirm,
  onCancel
}) => {
  const [inputValue, setInputValue] = useState('');

  const handleBlur = useCallback(() => {
    if (!pendingSegment) return;
    const text = inputValue.trim();
    if (text === '') {
      onCancel?.();
    } else {
      onConfirm?.(pendingSegment.startTime, pendingSegment.endTime, text);
    }
    setInputValue('');
  }, [pendingSegment, inputValue, onCancel, onConfirm]);

  if (!pendingSegment) {
    return null;
  }

  const width = Math.max(minWidth, (pendingSegment.endTime - pendingSegment.startTime) * pixelsPerSecond);

  return (
    <div
      key={`${pendingSegment.startTime}-${pendingSegment.endTime}`}
      className="absolute z-20 overflow-hidden rounded"
      style={{
        left: pendingSegment.startTime * pixelsPerSecond,
        width,
        top,
        height
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <textarea
        autoFocus
        className={clsx(
          'w-full h-full min-w-[150px] px-1.5 py-0.5 text-xs leading-tight resize-none',
          'bg-background border-2 border-primary rounded outline-none text-foreground box-border',
          'placeholder:text-muted-foreground'
        )}
        style={{ minHeight: height }}
        placeholder={placeholder}
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          } else if (e.key === 'Escape') {
            setInputValue('');
            onCancel?.();
          }
        }}
      />
    </div>
  );
};
