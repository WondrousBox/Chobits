/**
 * TTSAudioBlock - TTS 音频块组件
 *
 * 使用 UnifiedBlock 实现，通过 TTS_BLOCK_CAPABILITIES 配置能力。
 * 保持原有接口以实现向后兼容。
 */

import React, { useCallback } from 'react';

import type { TTSAudioItem } from '../../types';
import { UnifiedBlock } from '../unified';
import { TTS_BLOCK_CAPABILITIES } from '../unified/presets';
import type { BlockCallbacks, BlockCapabilities, BlockContent, BlockLayout } from '../unified/types';

export interface TTSAudioBlockProps {
  /** TTS 音频项 */
  item: TTSAudioItem;
  /** 每秒像素数 */
  pixelsPerSecond: number;
  /** 最大时长（秒），用于拖拽边界 */
  maxDuration?: number;
  /** 是否正在播放 */
  isPlaying?: boolean;
  /** 是否与其他片段重叠 */
  isOverlapping?: boolean;
  /** 是否选中（选中时显示浮动播放/删除按钮） */
  isSelected?: boolean;
  /** 点击块回调（选中，不直接播放） */
  onBlockClick?: (e: React.MouseEvent, item: TTSAudioItem) => void;
  /** 点击播放按钮回调 */
  onPlayClick?: (e: React.MouseEvent, item: TTSAudioItem) => void;
  /** 点击删除按钮回调 */
  onDeleteClick?: (e: React.MouseEvent, item: TTSAudioItem) => void;
  /** 时间变更回调（拖拽移动或边缘调整后） */
  onTimeChange?: (newStartTime: number, newEndTime: number) => void;
  /** 文本变更回调（内联编辑后） */
  onTextChange?: (newText: string) => void;
  /** 双击块回调（编辑文本） */
  onDoubleClick?: (e: React.MouseEvent, item: TTSAudioItem) => void;
}

/**
 * TTS 音频块组件
 * 支持拖拽移动与左右边缘调整时间（与字幕块一致）
 */
export const TTSAudioBlock: React.FC<TTSAudioBlockProps> = ({
  item,
  pixelsPerSecond,
  maxDuration,
  isPlaying = false,
  isOverlapping = false,
  isSelected = false,
  onBlockClick,
  onPlayClick,
  onDeleteClick,
  onTimeChange,
  onTextChange,
  onDoubleClick
}) => {
  // 映射内容数据
  const content: BlockContent = {
    id: `tts-${item.index}`,
    startTime: item.startTime,
    endTime: item.endTime,
    text: item.text,
    isPlaying,
    status: item.status,
    errorMessage: item.error,
    audioDuration: item.duration,
    trimmedDuration: item.trimmedDuration,
    order: item.index + 1 // 显示为 1-indexed
  };

  // 映射回调函数
  const callbacks: BlockCallbacks = {
    onClick: useCallback(
      (id: string, event: React.MouseEvent) => {
        onBlockClick?.(event, item);
      },
      [item, onBlockClick]
    ),
    onDoubleClick: useCallback(
      (id: string, event: React.MouseEvent) => {
        onDoubleClick?.(event, item);
      },
      [item, onDoubleClick]
    ),
    onTextChange: useCallback(
      (id: string, newText: string) => {
        onTextChange?.(newText);
      },
      [onTextChange]
    ),
    onTimeChange: useCallback(
      (id: string, newStart: number, newEnd: number) => {
        onTimeChange?.(newStart, newEnd);
      },
      [onTimeChange]
    ),
    onPlay: useCallback(() => {
      // 通过构造事件调用 onPlayClick
      const mockEvent = {} as React.MouseEvent;
      onPlayClick?.(mockEvent, item);
    }, [item, onPlayClick]),
    onDelete: useCallback(() => {
      const mockEvent = {} as React.MouseEvent;
      onDeleteClick?.(mockEvent, item);
    }, [item, onDeleteClick]),
    onMove: useCallback(
      (id: string, newStart: number) => {
        // 移动时保持时长不变
        const duration = item.endTime - item.startTime;
        onTimeChange?.(newStart, newStart + duration);
      },
      [item, onTimeChange]
    )
  };

  // 布局配置
  const layout: BlockLayout = {
    pixelsPerSecond,
    maxDuration,
    trackHeight: 40 // TTS 块默认高度
  };

  return <UnifiedBlock capabilities={TTS_BLOCK_CAPABILITIES} content={content} callbacks={callbacks} layout={layout} isSelected={isSelected} isOverlapping={isOverlapping} dataAttrType="tts-block" />;
};
