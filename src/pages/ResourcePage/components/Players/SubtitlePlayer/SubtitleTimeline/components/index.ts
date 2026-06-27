// Annotation components
export { AnnotationTrack } from './annotation';

// Clip components
export { ClipSegmentBlock } from './clip';
export { ClipTrack } from './clip';
export { ClipTrackLabel } from './clip';

// Media components
export { MediaImportPanel } from './media';
export { MediaSegmentBlock } from './media';
export { MediaTrack } from './media';
export { MediaTrackLabel } from './media';
export { MediaTrackManager } from './media';
export { MediaTrackQuickAdd, useMediaDrop } from './media';
export { MediaTransformPanel } from './media';
export { MediaTransitionSelector, TransitionTypeButton } from './media';
export { ThumbnailStrip } from './media';

// Shared components
export { SeekBar } from './shared';
export { TimecodeControl } from './shared';
export { TimeRuler } from './shared';
export { TrackAddMenu } from './shared';
export { TransitionBadge, TransitionIndicator } from './shared';
export { CommonTrackLabel, WaveformTrack } from './shared';

// Subtitle components
export { TimelineSegmentBlock } from './subtitle';
export { TimelineTrackView } from './subtitle';

// TTS components
export type { TTSAudioItem } from './tts';
export { TTSAudioTrack, TTSBatchTextInputPanel } from './tts';

// Unified Block components (通用块组件)
export {
  ANNOTATION_BLOCK_CAPABILITIES,
  BlockActionBar,
  BlockContainer,
  BlockHandles,
  BlockOrderBadge,
  BlockProgressBar,
  BlockRateLabel,
  BlockStatusBadge,
  BlockTimeTooltip,
  CLIP_BLOCK_CAPABILITIES,
  DEFAULT_BLOCK_CAPABILITIES,
  MEDIA_BLOCK_CAPABILITIES,
  mergeCapabilities,
  SUBTITLE_BLOCK_CAPABILITIES,
  TTS_BLOCK_CAPABILITIES,
  UnifiedBlock,
  UnifiedBlockContent,
  useBlockDrag,
  useBlockLayout
} from './unified';

// Unified Block types
export type {
  BlockActionBarProps,
  BlockCallbacks,
  BlockCapabilities,
  BlockContainerProps,
  BlockContentProps,
  BlockDragCapabilities,
  BlockDragMode,
  BlockDragState,
  BlockHandlesProps,
  BlockLayout,
  BlockOrderBadgeProps,
  BlockPlaybackCapabilities,
  BlockProgressBarProps,
  BlockRateLabelProps,
  BlockSelectionCapabilities,
  BlockSpecialCapabilities,
  BlockStatusBadgeProps,
  BlockTextCapabilities,
  BlockThumbnailCapabilities,
  BlockTimeTooltipData,
  BlockTimeTooltipProps,
  BlockWaveformCapabilities,
  UnifiedBlockProps
} from './unified';
