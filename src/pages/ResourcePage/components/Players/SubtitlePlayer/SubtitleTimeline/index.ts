// 主组件
export { SubtitleTimeline } from './SubtitleTimeline';

// 类型
export type { SelectionState, SubtitleTimelineProps, TimelineCallbacks, TimelineSegment, TimelineTrack, ViewportState } from './types';
export { DEFAULT_CONFIG, TRACK_COLORS } from './types';

// 工具函数
export type { TimeRange } from './utils';
export {
    aimSegmentsToTimelineSegments,
    aimTracksToTimelineTracks,
    calculateDuration,
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
export { useTimelineInteraction } from './hooks/useTimelineInteraction';
export { useTimelineViewport } from './hooks/useTimelineViewport';

// 子组件（可选导出，供高级用户自定义）
export { TimelineSegmentBlock } from './components/TimelineSegmentBlock';
export { TimelineTrackView } from './components/TimelineTrackView';
export { TimeRuler } from './components/TimeRuler';
export { TrackLabel } from './components/TrackLabel';
