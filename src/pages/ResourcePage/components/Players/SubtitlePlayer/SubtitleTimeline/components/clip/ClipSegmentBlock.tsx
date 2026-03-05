/**
 * ClipSegmentBlock - 剪辑片段块组件
 *
 * 使用 UnifiedBlock 实现，通过 CLIP_BLOCK_CAPABILITIES 配置能力。
 * 保持原有接口以实现向后兼容。
 */

import React, { useCallback } from 'react';

import type { ClipSegment, ClipTool } from '../../types';
import { UnifiedBlock } from '../unified';
import { CLIP_BLOCK_CAPABILITIES } from '../unified/presets';
import type { BlockCallbacks, BlockCapabilities, BlockContent, BlockLayout } from '../unified/types';

interface ClipSegmentBlockProps {
  /** 剪辑片段 */
  clip: ClipSegment;
  /** 该片段在播放序列中的起始时间（秒） */
  playStart: number;
  /** 该片段在播放序列中的结束时间（秒） */
  playEnd: number;
  /** 每秒像素数 */
  pixelsPerSecond: number;
  /** 轨道高度 */
  trackHeight: number;
  /** 该片段在排序中的索引（用于显示顺序号） */
  orderIndex?: number;
  /** 总活跃片段数（用于判断是否可以上移/下移） */
  totalActiveClips?: number;
  /** 是否选中 */
  isSelected?: boolean;
  /** 是否为当前正在播放的片段 */
  isActive?: boolean;
  /** 当前播放进度（0~1，仅在 isActive 时有意义） */
  activeProgress?: number;
  /** 点击回调 */
  onClick?: (clipId: string, event: React.MouseEvent) => void;
  /** 删除回调 */
  onDelete?: (clipId: string) => void;
  /** 变速回调 */
  onSpeedChange?: (clipId: string, playbackRate: number) => void;
  /** 上移回调 */
  onMoveUp?: (clipId: string) => void;
  /** 下移回调 */
  onMoveDown?: (clipId: string) => void;
  /** 当前激活的工具（cut 模式下点击事件不拦截，让父级处理切割） */
  activeTool?: ClipTool;
  /** 覆盖模式（叠加在波形上，需要 pointer-events: auto） */
  overlay?: boolean;
}

/**
 * ClipSegmentBlock - 单个剪辑片段块
 *
 * 在剪辑轨道上显示一个片段，包括：
 * - 播放顺序号
 * - 源时间范围标记
 * - 播放速率显示（拖拽左右边缘可调整速度）
 * - 选中时的操作按钮（包括上移/下移）
 * - 播放进度指示
 */
export const ClipSegmentBlock: React.FC<ClipSegmentBlockProps> = ({
  clip,
  playStart,
  playEnd,
  pixelsPerSecond,
  trackHeight,
  orderIndex,
  totalActiveClips = 0,
  isSelected = false,
  isActive = false,
  activeProgress = 0,
  onClick,
  onDelete,
  onSpeedChange,
  onMoveUp,
  onMoveDown,
  activeTool = 'select',
  overlay = false
}) => {
  const canMoveUp = orderIndex !== undefined && orderIndex > 0;
  const canMoveDown = orderIndex !== undefined && orderIndex < totalActiveClips - 1;

  // 扩展能力配置
  const capabilities: BlockCapabilities = {
    ...CLIP_BLOCK_CAPABILITIES,
    special: {
      ...CLIP_BLOCK_CAPABILITIES.special,
      showReorderButtons: canMoveUp || canMoveDown
    }
  };

  // 映射内容数据
  const content: BlockContent = {
    id: clip.id,
    startTime: playStart,
    endTime: playEnd,
    text: clip.label,
    playbackRate: clip.playbackRate,
    audioDuration: clip.sourceEnd - clip.sourceStart, // 源时长
    order: orderIndex !== undefined ? orderIndex + 1 : clip.order + 1,
    totalSegments: totalActiveClips,
    playbackProgress: activeProgress,
    label: clip.label || `${clip.sourceStart.toFixed(1)}s - ${clip.sourceEnd.toFixed(1)}s`
  };

  // 映射回调函数
  const callbacks: BlockCallbacks = {
    onClick: useCallback(
      (id: string, event: React.MouseEvent) => {
        onClick?.(clip.id, event);
      },
      [clip.id, onClick]
    ),
    onSpeedChange: useCallback(
      (id: string, newSpeed: number) => {
        onSpeedChange?.(clip.id, newSpeed);
      },
      [clip.id, onSpeedChange]
    ),
    onMoveUp: useCallback(() => {
      onMoveUp?.(clip.id);
    }, [clip.id, onMoveUp]),
    onMoveDown: useCallback(() => {
      onMoveDown?.(clip.id);
    }, [clip.id, onMoveDown]),
    onDelete: useCallback(() => {
      onDelete?.(clip.id);
    }, [clip.id, onDelete])
  };

  // 布局配置
  const layout: BlockLayout = {
    pixelsPerSecond,
    trackHeight
  };

  return (
    <UnifiedBlock
      capabilities={capabilities}
      content={content}
      callbacks={callbacks}
      layout={layout}
      isActive={isActive}
      isSelected={isSelected}
      disabled={activeTool === 'cut'}
      activeTool={activeTool === 'cut' ? 'cut' : 'select'}
      className={overlay ? 'pointer-events-auto' : undefined}
      dataAttrType="clip"
    />
  );
};
