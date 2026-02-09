// 主组件
export { SubtitleTimeline } from './SubtitleTimeline';

// 类型
export type { ClipSegment, ClipTool, ClipTrackCallbacks, ClipTrackData, SelectionState, SubtitleTimelineProps, TimelineCallbacks, TimelineSegment, TimelineTrack, ViewportState } from './types';
export { DEFAULT_CONFIG, TRACK_COLORS } from './types';

// 工具函数
export type { ClipPlaybackInfo, ClipTimeMapping, TimeRange } from './utils';
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
  parseSegmentId,
  parseTimeToSeconds
} from './utils';

// Hooks（可选导出，供高级用户使用）
export { useClipPlayback, useTimelineInteraction, useTimelineViewport } from './hooks';

// 子组件（可选导出，供高级用户自定义）
export { ClipTrack, ClipTrackLabel, TimelineSegmentBlock, TimelineTrackView, TimeRuler, TrackLabel } from './components';
