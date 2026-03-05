/**
 * UnifiedBlock 通用块组件
 *
 * 通过能力配置驱动的通用时间轴块组件，支持字幕块、TTS音频块、剪辑块、媒体块等多种类型。
 *
 * @example
 * ```tsx
 * import { UnifiedBlock, SUBTITLE_BLOCK_CAPABILITIES } from './unified';
 *
 * <UnifiedBlock
 *   capabilities={SUBTITLE_BLOCK_CAPABILITIES}
 *   content={{
 *     id: 'seg-1',
 *     startTime: 0,
 *     endTime: 3,
 *     text: 'Hello World'
 *   }}
 *   callbacks={{
 *     onTextChange: (id, text) => console.log('Text changed:', id, text)
 *   }}
 *   layout={{ pixelsPerSecond: 100, trackHeight: 40 }}
 *   isSelected={selectedId === 'seg-1'}
 * />
 * ```
 */

// 主组件
export { UnifiedBlock } from './UnifiedBlock';

// 预设配置
export {
  SUBTITLE_BLOCK_CAPABILITIES,
  TTS_BLOCK_CAPABILITIES,
  CLIP_BLOCK_CAPABILITIES,
  MEDIA_BLOCK_CAPABILITIES,
  ANNOTATION_BLOCK_CAPABILITIES,
  DEFAULT_BLOCK_CAPABILITIES,
  mergeCapabilities
} from './presets';

// 类型导出
export type {
  // 能力配置
  BlockCapabilities,
  BlockTextCapabilities,
  BlockThumbnailCapabilities,
  BlockWaveformCapabilities,
  BlockPlaybackCapabilities,
  BlockDragCapabilities,
  BlockSelectionCapabilities,
  BlockSpecialCapabilities,

  // 数据类型
  BlockContent,
  BlockCallbacks,
  BlockLayout,

  // 拖拽相关
  BlockDragMode,
  BlockDragState,
  BlockTimeTooltip as BlockTimeTooltipData,

  // Props
  UnifiedBlockProps,
  BlockContainerProps,
  BlockContentProps,
  BlockHandlesProps,
  BlockActionBarProps,
  BlockProgressBarProps,
  BlockTimeTooltipProps,
  BlockOrderBadgeProps,
  BlockStatusBadgeProps,
  BlockRateLabelProps
} from './types';

// 子组件（用于高级自定义）
export {
  BlockContainer,
  BlockHandles,
  BlockActionBar,
  BlockProgressBar,
  BlockTimeTooltip,
  BlockOrderBadge,
  BlockStatusBadge,
  BlockRateLabel,
  UnifiedBlockContent
} from './components';

// Hooks（用于自定义实现）
export { useBlockDrag, useBlockLayout } from './hooks';
