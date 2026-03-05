/**
 * MediaSegmentBlock - 媒体片段块组件
 *
 * 使用 UnifiedBlock 实现，通过 MEDIA_BLOCK_CAPABILITIES 配置能力。
 * 保持原有接口以实现向后兼容。
 */

import React, { useCallback } from 'react';

import type { MediaSegment, MediaSource, MediaTool, MediaTransform } from '../../types';
import { UnifiedBlock } from '../unified';
import { MEDIA_BLOCK_CAPABILITIES, mergeCapabilities } from '../unified/presets';
import type { BlockCallbacks, BlockCapabilities, BlockContent, BlockLayout } from '../unified/types';

interface MediaSegmentBlockProps {
  /** 片段数据 */
  segment: MediaSegment;
  /** 媒体源 */
  source?: MediaSource;
  /** 每秒像素数 */
  pixelsPerSecond: number;
  /** 轨道高度 */
  trackHeight: number;
  /** 是否选中 */
  isSelected?: boolean;
  /** 是否为当前正在播放 */
  isActive?: boolean;
  /** 当前播放进度（0~1） */
  activeProgress?: number;
  /** 当前激活的工具 */
  activeTool?: MediaTool;
  /** 点击回调 */
  onClick?: (segmentId: string, event: React.MouseEvent) => void;
  /** 删除回调 */
  onDelete?: (segmentId: string) => void;
  /** 恢复回调 */
  onRestore?: (segmentId: string) => void;
  /** 移动回调 */
  onMove?: (segmentId: string, newTimelineStart: number) => void;
  /** 调整大小回调 */
  onResize?: (segmentId: string, edge: 'start' | 'end', newTime: number) => void;
  /** 变换回调 */
  onTransform?: (segmentId: string, transform: Partial<MediaTransform>) => void;
  /** 请求缩略图回调 */
  onThumbnailRequest?: (segmentId: string) => void;
  /** 禁用状态 */
  disabled?: boolean;
}

/**
 * MediaSegmentBlock - 媒体片段块组件
 *
 * 在媒体轨道上显示单个媒体片段，包括：
 * - 视频缩略图条或图片缩略图
 * - 片段信息（类型、时长、速率)
 * - 转场指示器
 * - 选中时的调整手柄和操作按钮
 * - 拖拽移动和调整大小
 */
export const MediaSegmentBlock: React.FC<MediaSegmentBlockProps> = ({
  segment,
  source,
  pixelsPerSecond,
  trackHeight,
  isSelected = false,
  isActive = false,
  activeProgress = 0,
  activeTool = 'select',
  onClick,
  onDelete,
  onRestore,
  onMove,
  onResize,
  onTransform,
  onThumbnailRequest,
  disabled = false
}) => {
  // 已删除的片段使用简化渲染
  if (segment.deleted) {
    const deletedCapabilities = mergeCapabilities(MEDIA_BLOCK_CAPABILITIES, {
      selection: {
        showActionBar: !!onRestore
      }
    });

    return (
      <UnifiedBlock
        capabilities={deletedCapabilities}
        content={{
          id: segment.id,
          startTime: segment.timelineStart,
          endTime: segment.timelineEnd,
          deleted: true,
          label: segment.label
        }}
        callbacks={{
          onClick: useCallback(
            (id: string, event: React.MouseEvent) => {
              onClick?.(segment.id, event);
            },
            [segment.id, onClick]
          ),
          onRestore: useCallback(() => {
            onRestore?.(segment.id);
          }, [segment.id, onRestore])
        }}
        layout={{
          pixelsPerSecond,
          trackHeight
        }}
        isSelected={isSelected}
        disabled={disabled}
        activeTool={activeTool === 'cut' ? 'cut' : 'select'}
        dataAttrType="media"
      />
    );
  }

  // 正常片段
  const callbacks: BlockCallbacks = {
    onClick: useCallback(
      (id: string, event: React.MouseEvent) => {
        onClick?.(segment.id, event);
      },
      [segment.id, onClick]
    ),
    onMove: useCallback(
      (id: string, newStart: number) => {
        onMove?.(segment.id, newStart);
      },
      [segment.id, onMove]
    ),
    onResize: useCallback(
      (id: string, edge: 'start' | 'end', newTime: number) => {
        onResize?.(segment.id, edge, newTime);
      },
      [segment.id, onResize]
    ),
    onTimeChange: useCallback(
      (id: string, newStart: number, newEnd: number) => {
        // 如果提供了 onResize， 则分别调用边缘调整
        const oldDuration = segment.timelineEnd - segment.timelineStart;
        const newDuration = newEnd - newStart;
        if (newStart !== segment.timelineStart) {
          onResize?.(segment.id, 'start', newStart);
        }
        if (newEnd !== segment.timelineEnd) {
          onResize?.(segment.id, 'end', newEnd);
        }
        // 如果都没有提供 onResize， 但提供了 onMove， 则调用 onMove
        if (!onResize && onMove && Math.abs(newDuration - oldDuration) < 0.01) {
          onMove?.(segment.id, newStart);
        }
      },
      [segment, onResize, onMove]
    ),
    onDelete: useCallback(() => {
      onDelete?.(segment.id);
    }, [segment.id, onDelete]),
    onTransform: useCallback(
      (id: string, transform: Partial<MediaTransform>) => {
        onTransform?.(segment.id, transform);
      },
      [segment.id, onTransform]
    )
  };

  // 映射内容数据
  const content: BlockContent = {
    id: segment.id,
    startTime: segment.timelineStart,
    endTime: segment.timelineEnd,
    text: segment.label,
    deleted: segment.deleted,
    playbackRate: segment.playbackRate,
    muted: segment.muted,
    thumbnails: segment.thumbnails,
    transitionIn: segment.transitionIn,
    transitionOut: segment.transitionOut,
    mediaType: source?.type,
    label: segment.label,
    transform: segment.transform,
    playbackProgress: activeProgress
  };

  // 布局配置
  const layout: BlockLayout = {
    pixelsPerSecond,
    trackHeight
  };

  return (
    <UnifiedBlock
      capabilities={MEDIA_BLOCK_CAPABILITIES}
      content={content}
      callbacks={callbacks}
      layout={layout}
      isActive={isActive}
      isSelected={isSelected}
      disabled={disabled}
      activeTool={activeTool === 'cut' ? 'cut' : 'select'}
      dataAttrType="media"
    />
  );
};
