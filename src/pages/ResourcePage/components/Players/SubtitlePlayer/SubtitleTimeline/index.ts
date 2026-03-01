// 主组件
export { SubtitleTimeline } from './SubtitleTimeline';

// 类型
export type {
  ClipSegment,
  ClipTool,
  ClipTrackCallbacks,
  ClipTrackData,
  MediaSegment,
  MediaSource,
  MediaTool,
  MediaTrackCallbacks,
  MediaTrackData,
  MediaTransform,
  MediaTransition,
  MediaThumbnail,
  MediaType,
  SelectionState,
  SubtitleTimelineProps,
  TimelineCallbacks,
  TimelineSegment,
  TimelineTrack,
  ViewportState
} from './types';
export { DEFAULT_CONFIG, MEDIA_CONFIG, TRACK_COLORS, DEFAULT_TRANSFORM } from './types';

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
  TrackLabel,
  TransitionIndicator,
  TransitionTypeButton
} from './components';
