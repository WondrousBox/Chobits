// 主组件
export { SubtitleTimeline } from './SubtitleTimeline';

// 类型
export type {
  BaseSegment,
  ClipSegment,
  ClipTool,
  ClipTrackCallbacks,
  ClipTrackData,
  MediaSegment,
  MediaSource,
  MediaThumbnail,
  MediaTool,
  MediaTrackCallbacks,
  MediaTrackData,
  MediaTransform,
  MediaTransition,
  MediaType,
  SelectionState,
  StandaloneTTSTrack,
  SubtitleTimelineProps,
  TimelineCallbacks,
  TimelineSegment,
  TimelineTrack,
  TrackProps,
  ViewportState
} from './types';
export { DEFAULT_CONFIG, DEFAULT_TRANSFORM, MEDIA_CONFIG, TRACK_COLORS } from './types';

// 适配器类型与默认值
export type { TimelineAdapters, TimelineLabels } from './adapters';
export { DEFAULT_LABELS } from './adapters/defaults';

// 工具函数
export type { ActiveSegmentInfo, ClipPlaybackInfo, ClipTimeMapping, OverlapInfo, SegmentLayoutInfo, SkipRegion, SplitResult, TimeRange, TransformMatrix } from './utils';
export {
  aimSegmentsToTimelineSegments,
  aimTracksToTimelineTracks,
  calculateDuration,
  ClipSequence,
  detectOverlappingIndices,
  detectOverlappingSegments,
  formatSecondsToTime,
  indexToSegmentId,
  indicesToIds,
  isOverlapping,
  MediaSequence,
  parseSegmentId,
  parseTimeToSeconds
} from './utils';

// Hooks（可选导出，供高级用户使用）
export { useClipPlayback, useMediaDrag, useMediaThumbnails, useTimelineInteraction, useTimelineViewport } from './hooks';

// 子组件（可选导出，供高级用户自定义）
export type { TrackAddMenuProps } from './components';
export {
  ClipTrack,
  ClipTrackLabel,
  MediaImportPanel,
  MediaSegmentBlock,
  MediaTrack,
  MediaTrackLabel,
  MediaTrackManager,
  MediaTransformPanel,
  MediaTransitionSelector,
  ThumbnailStrip,
  TimelineSegmentBlock,
  TimelineTrackView,
  TimeRuler,
  TrackAddMenu,
  TrackLabel,
  TransitionIndicator,
  TransitionTypeButton
} from './components';
