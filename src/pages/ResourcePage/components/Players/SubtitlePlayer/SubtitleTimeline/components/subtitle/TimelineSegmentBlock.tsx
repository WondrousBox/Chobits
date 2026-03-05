/**
 * TimelineSegmentBlock - 字幕片段块组件
 *
 * 使用 UnifiedBlock 实现，通过 SUBTITLE_BLOCK_CAPABILITIES 配置能力。
 * 保持原有接口以实现向后兼容。
 */

import React, { useCallback } from 'react';

import type { WordTimestamp } from '../../../../MediaPlayer/subtitleDisplayEvent';
import { TimelineSegment } from '../../types';
import { UnifiedBlock } from '../unified';
import { SUBTITLE_BLOCK_CAPABILITIES } from '../unified/presets';
import type { BlockCallbacks, BlockCapabilities, BlockContent, BlockLayout } from '../unified/types';

interface TimelineSegmentBlockProps {
  segment: TimelineSegment;
  trackId: string;
  trackColor?: string;
  trackHeight: number;
  pixelsPerSecond: number;
  /** 该片段在轨道中的索引 */
  segmentIndex?: number;
  /** 最大时长限制（秒）- 片段不能超出此时间 */
  maxDuration?: number;
  /** 是否为当前播放的片段 */
  isActive?: boolean;
  /** 是否高亮 */
  isHighlighted?: boolean;
  /** 是否选中 */
  isSelected?: boolean;
  /** 是否与其他片段重叠（时间冲突） */
  isOverlapping?: boolean;
  /** 是否禁用交互 */
  disabled?: boolean;
  /** 点击回调 */
  onClick?: (segment: TimelineSegment, trackId: string, event: React.MouseEvent) => void;
  /** 双击回调（进入编辑模式） */
  onDoubleClick?: (segment: TimelineSegment, trackId: string, event: React.MouseEvent) => void;
  /** 文本变更回调 */
  onTextChange?: (segment: TimelineSegment, trackId: string, newText: string) => void;
  /** 时间变更回调（拖拽移动或调整边缘） */
  onTimeChange?: (segment: TimelineSegment, trackId: string, newStartTime: number, newEndTime: number) => void;
  /** 拖拽开始 */
  onDragStart?: (segment: TimelineSegment, trackId: string) => void;
  /** 拖拽结束 */
  onDragEnd?: (segment: TimelineSegment, trackId: string) => void;
  /** 往前合并（统一回调签名） */
  onMergePrev?: (payload: { trackId: string; segmentIndex: number }) => void;
  /** 删除片段（选中时按钮或快捷键） */
  onDeleteSegment?: (segment: TimelineSegment, trackId: string) => void;
  /** 当前播放时间（秒），用于在活跃片段上显示播放进度 */
  currentTime?: number;
  /** 字级别时间戳数据（卡拉OK高亮用） */
  words?: WordTimestamp[];
}

/**
 * 时间轴片段块组件
 *
 * 使用 UnifiedBlock 作为底层实现，通过能力配置驱动功能。
 */
export const TimelineSegmentBlock: React.FC<TimelineSegmentBlockProps> = ({
  segment,
  trackId,
  trackColor,
  trackHeight,
  pixelsPerSecond,
  segmentIndex,
  maxDuration,
  isActive = false,
  isHighlighted = false,
  isSelected = false,
  isOverlapping = false,
  disabled = false,
  onClick,
  onDoubleClick,
  onTextChange,
  onTimeChange,
  onDragStart,
  onDragEnd,
  onMergePrev,
  onDeleteSegment,
  currentTime,
  words
}) => {
  // 扩展能力配置：添加合并按钮支持
  const capabilities: BlockCapabilities = {
    ...SUBTITLE_BLOCK_CAPABILITIES,
    special: {
      ...SUBTITLE_BLOCK_CAPABILITIES.special,
      showMergeButton: (segmentIndex ?? 0) > 0
    }
  };

  // 映射内容数据
  const content: BlockContent = {
    id: segment.id,
    startTime: segment.startTime,
    endTime: segment.endTime,
    text: segment.text,
    deleted: segment.deleted,
    color: trackColor,
    currentTime,
    words
  };

  // 映射回调函数
  const callbacks: BlockCallbacks = {
    onClick: useCallback(
      (id: string, event: React.MouseEvent) => {
        onClick?.(segment, trackId, event);
      },
      [segment, trackId, onClick]
    ),
    onDoubleClick: useCallback(
      (id: string, event: React.MouseEvent) => {
        onDoubleClick?.(segment, trackId, event);
      },
      [segment, trackId, onDoubleClick]
    ),
    onTextChange: useCallback(
      (id: string, newText: string) => {
        onTextChange?.(segment, trackId, newText);
      },
      [segment, trackId, onTextChange]
    ),
    onTimeChange: useCallback(
      (id: string, newStart: number, newEnd: number) => {
        onTimeChange?.(segment, trackId, newStart, newEnd);
      },
      [segment, trackId, onTimeChange]
    ),
    onMove: useCallback(
      (id: string, newStart: number) => {
        // 移动时保持时长不变
        const duration = segment.endTime - segment.startTime;
        onTimeChange?.(segment, trackId, newStart, newStart + duration);
      },
      [segment, trackId, onTimeChange]
    ),
    onMergePrev: useCallback(() => {
      if (typeof segmentIndex === 'number') {
        onMergePrev?.({ trackId, segmentIndex });
      }
    }, [trackId, segmentIndex, onMergePrev]),
    onDelete: useCallback(() => {
      onDeleteSegment?.(segment, trackId);
    }, [segment, trackId, onDeleteSegment])
  };

  // 映射布局配置
  const layout: BlockLayout = {
    pixelsPerSecond,
    maxDuration,
    trackHeight,
    trackColor
  };

  return (
    <UnifiedBlock
      capabilities={capabilities}
      content={content}
      callbacks={callbacks}
      layout={layout}
      isActive={isActive}
      isSelected={isSelected}
      isHighlighted={isHighlighted}
      isOverlapping={isOverlapping}
      disabled={disabled}
      dataAttrType="segment"
    />
  );
};
