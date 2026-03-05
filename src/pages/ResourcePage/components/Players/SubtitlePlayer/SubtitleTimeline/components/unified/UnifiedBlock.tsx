/**
 * UnifiedBlock - 通用块组件
 *
 * 通过能力配置驱动的通用时间轴块组件，支持字幕块、TTS音频块、剪辑块、媒体块等多种类型。
 *
 * @example
 * // 字幕块
 * <UnifiedBlock
 *   capabilities={SUBTITLE_BLOCK_CAPABILITIES}
 *   content={{ id: 'seg-1', startTime: 0, endTime: 3, text: 'Hello' }}
 *   layout={{ pixelsPerSecond: 100, trackHeight: 40 }}
 * />
 */

import clsx from 'clsx';
import React, { useCallback, useRef, useState } from 'react';

import { DEFAULT_CONFIG } from '../../types';
import { useBlockDrag, useBlockLayout } from './hooks';
import type { BlockCallbacks, BlockCapabilities, BlockContent, BlockLayout, UnifiedBlockProps } from './types';
import {
  BlockContainer,
  BlockContent as BlockContentComponent,
  BlockHandles,
  BlockActionBar,
  BlockProgressBar,
  BlockTimeTooltip,
  BlockOrderBadge,
  BlockStatusBadge,
  BlockRateLabel
} from './components';

/**
 * UnifiedBlock 主组件
 */
export const UnifiedBlock: React.FC<UnifiedBlockProps> = ({
  capabilities,
  content,
  callbacks,
  layout,
  isActive = false,
  isSelected = false,
  isHighlighted = false,
  isOverlapping = false,
  disabled = false,
  activeTool = 'select',
  className,
  dataAttrType = 'block'
}) => {
  const blockRef = useRef<HTMLDivElement>(null);

  // 编辑状态
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(content.text ?? '');

  // 拖拽逻辑
  const { dragMode, dragState, handlers, didDragJustEndRef } = useBlockDrag({
    capabilities,
    layout,
    content: {
      id: content.id,
      startTime: content.startTime,
      endTime: content.endTime,
      playbackRate: content.playbackRate,
      audioDuration: content.audioDuration
    },
    callbacks,
    disabled,
    activeTool
  });

  // 布局计算
  const { visualLeft, visualWidth, duration } = useBlockLayout({
    content,
    layout,
    dragMode,
    dragDeltaX: dragState.deltaX,
    dragStartTime: dragState.startTime,
    dragEndTime: dragState.endTime
  });

  // 点击处理
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.stopPropagation();

      // 拖拽刚结束，不触发点击
      if (didDragJustEndRef.current) {
        didDragJustEndRef.current = false;
        callbacks?.onClick?.(content.id, e);
        return;
      }

      // 已选中且支持编辑时进入编辑模式
      if (isSelected && capabilities.text?.editable && callbacks?.onTextChange) {
        setIsEditing(true);
        setEditText(content.text ?? '');
        callbacks.onDoubleClick?.(content.id, e);
        return;
      }

      callbacks?.onClick?.(content.id, e);
    },
    [disabled, isSelected, capabilities, callbacks, content.id, content.text, didDragJustEndRef]
  );

  // 双击处理
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (disabled) return;
      e.stopPropagation();

      if (capabilities.text?.editable) {
        setIsEditing(true);
        setEditText(content.text ?? '');
      }

      callbacks?.onDoubleClick?.(content.id, e);
    },
    [disabled, capabilities, callbacks, content.id, content.text]
  );

  // 编辑提交
  const handleEditCommit = useCallback(() => {
    if (!isEditing) return;

    const trimmedText = editText.trim();
    if (trimmedText && trimmedText !== content.text) {
      callbacks?.onTextChange?.(content.id, trimmedText);
    }

    setIsEditing(false);
  }, [isEditing, editText, content.id, content.text, callbacks]);

  // 编辑取消
  const handleEditCancel = useCallback(() => {
    setEditText(content.text ?? '');
    setIsEditing(false);
  }, [content.text]);

  // 编辑文本变更
  const handleEditTextChange = useCallback((text: string) => {
    setEditText(text);
  }, []);

  // 计算播放进度
  const playbackProgress = React.useMemo(() => {
    if (!isActive || !content.currentTime) return 0;
    const dur = content.endTime - content.startTime;
    if (dur <= 0) return 0;
    return Math.min(1, Math.max(0, (content.currentTime - content.startTime) / dur));
  }, [isActive, content.currentTime, content.startTime, content.endTime]);

  // 计算预览速率（拖拽时）
  const previewRate = React.useMemo(() => {
    if (dragMode === 'none' || capabilities.drag?.edgeResize !== 'speed') return null;
    const sourceDuration = content.audioDuration ?? duration;
    const newPlayDuration = dragState.endTime - dragState.startTime;
    if (newPlayDuration <= 0) return null;
    return Math.round((sourceDuration / newPlayDuration) * 100) / 100;
  }, [dragMode, capabilities, content.audioDuration, duration, dragState]);

  // 轨道间距
  const trackGap = layout.trackGap ?? DEFAULT_CONFIG.TRACK_GAP;

  return (
    <>
      <BlockContainer
        ref={blockRef}
        content={content}
        layout={{ ...layout, trackGap }}
        capabilities={capabilities}
        isActive={isActive}
        isSelected={isSelected}
        isOverlapping={isOverlapping}
        disabled={disabled}
        dragMode={dragMode}
        visualLeft={visualLeft}
        visualWidth={visualWidth}
        className={className}
        dataAttrType={dataAttrType}
        onMouseDown={handlers.onMouseDown}
        onMouseMove={handlers.onMouseMove}
        onMouseLeave={handlers.onMouseLeave}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      >
        {/* 播放进度条 */}
        {capabilities.playback?.showProgress && <BlockProgressBar progress={playbackProgress} />}

        {/* 边缘拖拽手柄 */}
        <BlockHandles capabilities={capabilities} dragMode={dragMode} disabled={disabled} />

        {/* 顶部信息行（剪辑块/媒体块） */}
        {(capabilities.special?.showOrder || capabilities.special?.showRateLabel || content.label) && (
          <div className="absolute top-0 left-0 right-0 flex items-center gap-1 px-1 pt-0.5 z-10">
            {/* 顺序徽章 */}
            {capabilities.special?.showOrder && content.order !== undefined && (
              <BlockOrderBadge order={content.order} isActive={isActive} />
            )}

            {/* 媒体类型图标或标签 */}
            {content.label && (
              <span className="text-[10px] text-foreground/80 truncate leading-tight flex-1">
                {content.label}
              </span>
            )}

            {/* 速率标签 */}
            {capabilities.special?.showRateLabel && content.playbackRate !== undefined && (
              <BlockRateLabel rate={previewRate ?? content.playbackRate} isPreview={previewRate !== null} />
            )}
          </div>
        )}

        {/* 内容区域 */}
        <BlockContentComponent
          capabilities={capabilities}
          content={content}
          layout={{ ...layout, trackGap }}
          isActive={isActive}
          isSelected={isSelected}
          disabled={disabled}
          isEditing={isEditing}
          editText={editText}
          onEditTextChange={handleEditTextChange}
          onEditCommit={handleEditCommit}
          onEditCancel={handleEditCancel}
        />

        {/* 状态徽章（TTS块） */}
        {capabilities.special?.showStatusBadge && content.status && content.status !== 'completed' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <BlockStatusBadge status={content.status} errorMessage={content.errorMessage} />
          </div>
        )}

        {/* 操作按钮栏 */}
        {isSelected && capabilities.selection?.showActionBar && (
          <BlockActionBar capabilities={capabilities} content={content} callbacks={callbacks} disabled={disabled} />
        )}
      </BlockContainer>

      {/* 拖拽时间提示 */}
      {dragState.tooltip && <BlockTimeTooltip {...dragState.tooltip} />}
    </>
  );
};

UnifiedBlock.displayName = 'UnifiedBlock';
