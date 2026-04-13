/**
 * BlockContent - 块内容组件
 *
 * 根据能力配置渲染文本、缩略图、波形等内容
 */

import clsx from 'clsx';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { WordTimestamp } from '../../../types';
import type { BlockCapabilities, BlockContentProps } from '../types';
import type { TimelineLabels } from '../../../adapters/types';
import { useLabels } from '../../../context/TimelineContext';

/**
 * 校验文本内容
 */
function validateText(text: string, capabilities: BlockCapabilities, labels: Required<TimelineLabels>): { valid: boolean; message?: string } {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { valid: false, message: labels.blockValidationEmpty };
  }

  // 控制字符
  const hasControlChar = /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text);
  if (hasControlChar) {
    return { valid: false, message: labels.blockValidationControlChar };
  }

  // SRT 时间轴分隔符
  if (trimmed.includes('-->')) {
    return { valid: false, message: labels.blockValidationArrow };
  }

  // 长度限制
  const maxLength = capabilities.text?.maxLength;
  if (maxLength && trimmed.length > maxLength) {
    return { valid: false, message: labels.blockValidationMaxLength.replace('{maxLength}', String(maxLength)) };
  }

  return { valid: true };
}

/**
 * 渲染卡拉OK 字级别高亮文本
 */
function renderWordHighlight(words: WordTimestamp[], currentTime: number): React.ReactNode {
  return words.map((word, i) => {
    const isWordActive = currentTime >= word.st && currentTime < word.et;
    const isPast = currentTime >= word.et;

    return (
      <span
        key={i}
        className={clsx(
          'transition-colors duration-100',
          isWordActive && 'text-primary',
          isPast && 'text-foreground',
          !isPast && !isWordActive && 'text-foreground/40'
        )}
      >
        {word.text}
      </span>
    );
  });
}

/**
 * BlockContent 组件
 */
export const BlockContent: React.FC<BlockContentProps> = ({
  capabilities,
  content,
  layout,
  isActive,
  isSelected,
  disabled,
  isEditing,
  editText,
  onEditTextChange,
  onEditCommit,
  onEditCancel
}) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const labels = useLabels();
  const [validationError, setValidationError] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  // 编辑模式时聚焦输入框
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // 提交编辑
  const tryCommitEdit = useCallback(() => {
    if (!isEditing) return;

    const result = validateText(editText, capabilities, labels);
    if (!result.valid) {
      setValidationMessage(result.message ?? labels.blockValidationInvalid);
      setValidationError(true);
      return;
    }

    setValidationError(false);
    setValidationMessage(null);
    onEditCommit?.();
  }, [isEditing, editText, capabilities, onEditCommit]);

  // 失焦处理
  const handleBlur = useCallback(() => {
    if (!isEditing) return;
    tryCommitEdit();
  }, [isEditing, tryCommitEdit]);

  // 键盘事件
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        tryCommitEdit();
      } else if (e.key === 'Escape') {
        onEditCancel?.();
      }
    },
    [tryCommitEdit, onEditCancel]
  );

  // 清除验证错误
  useEffect(() => {
    if (!validationError) return;
    const t = setTimeout(() => setValidationError(false), 500);
    return () => clearTimeout(t);
  }, [validationError]);

  const { text, thumbnail, waveform, playback, special } = capabilities;
  const hasText = text?.enabled && content.text !== undefined;
  const hasThumbnail = thumbnail?.enabled && content.thumbnails && content.thumbnails.length > 0;
  const hasWaveform = waveform?.enabled && content.waveform;

  // 编辑模式
  if (isEditing && hasText && text?.editable) {
    return (
      <div
        className="absolute inset-0 z-30"
        style={{ left: -1, right: -1, top: -1, bottom: -1 }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <textarea
          ref={inputRef}
          className={clsx(
            'w-full h-full px-1.5 py-0.5 text-xs leading-tight resize-none box-border',
            'bg-background border-2 border-primary rounded outline-none',
            'text-foreground',
            validationError && isEditing && 'ring-2 ring-destructive animate-pulse'
          )}
          style={{
            minWidth: Math.max(layout.trackHeight * 2, 150),
            minHeight: layout.trackHeight + 20
          }}
          value={editText}
          onChange={(e) => onEditTextChange?.(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        <div
          className={clsx(
            'absolute right-1 -bottom-2 pointer-events-none select-none text-[10px] leading-none',
            validationError ? 'text-destructive font-medium' : 'text-muted-foreground'
          )}
        >
          {validationError ? validationMessage : labels.blockEditHint}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full w-full overflow-hidden relative">
      {/* 缩略图（媒体块） */}
      {hasThumbnail && (
        <div className="absolute inset-0 z-0">
          {/* ThumbnailStrip 组件会在这里渲染，暂时用占位 */}
          <div className="w-full h-full bg-muted/20" />
        </div>
      )}

      {/* 文本内容 */}
      {hasText && (
        <span
          className={clsx(
            'text-xs text-foreground truncate leading-tight px-1.5 z-10',
            content.deleted && 'line-through'
          )}
          title={!isEditing ? content.text : undefined}
        >
          {/* 卡拉OK 高亮 */}
          {isActive && text?.wordHighlight && content.words && content.words.length > 0 && content.currentTime !== undefined
            ? renderWordHighlight(content.words, content.currentTime)
            : content.text?.trim()}
        </span>
      )}

      {/* 波形（TTS块） */}
      {hasWaveform && (
        <div className="absolute inset-0 z-0">
          {/* 波形会在这里渲染 */}
          {content.waveform?.loading && (
            <div className="flex items-center justify-center h-full">
              <span className="text-[10px] text-muted-foreground">{labels.blockWaveformLoading}</span>
            </div>
          )}
        </div>
      )}

      {/* 底部时长信息 */}
      {!isEditing && (
        <div className="absolute right-1 bottom-0.5 pointer-events-none select-none text-[10px] leading-none text-foreground/70 bg-background/70 rounded px-1 py-0.5 max-w-[calc(100%-4px)] truncate whitespace-nowrap [@container(max-width:48px)]:hidden z-10">
          {(() => {
            const dur = Math.max(0, content.endTime - content.startTime);
            const precision = dur >= 10 ? 1 : 2;
            return `${dur.toFixed(precision)}s`;
          })()}
        </div>
      )}
    </div>
  );
};

BlockContent.displayName = 'BlockContent';
