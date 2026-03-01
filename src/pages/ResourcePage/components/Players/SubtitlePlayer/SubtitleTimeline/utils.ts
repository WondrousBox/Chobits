import { TimelineSegment, TimelineTrack, TRACK_COLORS } from './types';

/**
 * AimSegments 格式（来自 @aim-packages/subtitle）
 */
interface AimSegments {
  st: string; // 开始时间 (HH:MM:SS,mmm 或 MM:SS,mmm)
  et: string; // 结束时间
  text: string;
  delete?: boolean;
  [key: string]: unknown;
}

/**
 * 解析时间字符串为秒数
 * 支持格式：HH:MM:SS,mmm 或 MM:SS,mmm 或 SS,mmm
 */
export function parseTimeToSeconds(timeStr: string): number {
  if (!timeStr) return 0;

  // 替换逗号为点（处理 SRT 格式）
  const normalized = timeStr.replace(',', '.');
  const parts = normalized.split(':');

  if (parts.length === 3) {
    // HH:MM:SS.mmm
    const [h, m, s] = parts;
    return parseFloat(h) * 3600 + parseFloat(m) * 60 + parseFloat(s);
  } else if (parts.length === 2) {
    // MM:SS.mmm
    const [m, s] = parts;
    return parseFloat(m) * 60 + parseFloat(s);
  } else {
    // SS.mmm
    return parseFloat(parts[0]) || 0;
  }
}

/**
 * 秒数格式化为时间字符串
 */
export function formatSecondsToTime(seconds: number, includeMs = true): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);

  if (h > 0) {
    const base = `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return includeMs ? `${base},${ms.toString().padStart(3, '0')}` : base;
  }
  const base = `${m}:${s.toString().padStart(2, '0')}`;
  return includeMs ? `${base},${ms.toString().padStart(3, '0')}` : base;
}

/**
 * 将 AimSegments 数组转换为 TimelineSegment 数组
 */
export function aimSegmentsToTimelineSegments(segments: AimSegments[], idPrefix = ''): TimelineSegment[] {
  return segments.map((seg, index) => ({
    id: `${idPrefix}${index}`,
    startTime: parseTimeToSeconds(seg.st),
    endTime: parseTimeToSeconds(seg.et),
    text: seg.text,
    deleted: seg.delete,
    data: { original: seg }
  }));
}

/**
 * 将多个 AimSegments 轨道转换为 TimelineTrack 数组
 */
export function aimTracksToTimelineTracks(tracks: AimSegments[][], labels?: string[]): TimelineTrack[] {
  const defaultLabels = ['原文', '译文', '轨道 3', '轨道 4', '轨道 5', '轨道 6'];

  return tracks.map((segments, index) => ({
    id: `track-${index}`,
    label: labels?.[index] ?? defaultLabels[index] ?? `轨道 ${index + 1}`,
    segments: aimSegmentsToTimelineSegments(segments, `t${index}-`),
    color: TRACK_COLORS[index % TRACK_COLORS.length]
  }));
}

/**
 * 根据索引查找对应的 TimelineSegment ID
 */
export function indexToSegmentId(trackIndex: number, segmentIndex: number): string {
  return `t${trackIndex}-${segmentIndex}`;
}

/**
 * 从 TimelineSegment ID 解析出轨道索引和片段索引
 */
export function parseSegmentId(id: string): { trackIndex: number; segmentIndex: number } | null {
  const match = id.match(/^t(\d+)-(\d+)$/);
  if (!match) return null;
  return {
    trackIndex: parseInt(match[1], 10),
    segmentIndex: parseInt(match[2], 10)
  };
}

/**
 * 将索引集合转换为 ID 集合
 */
export function indicesToIds(indices: Set<number> | number[], trackIndex = 0): Set<string> {
  const indexSet = indices instanceof Set ? indices : new Set(indices);
  const idSet = new Set<string>();
  for (const idx of indexSet) {
    idSet.add(indexToSegmentId(trackIndex, idx));
  }
  return idSet;
}

/**
 * 计算轨道的总时长
 */
export function calculateDuration(tracks: TimelineTrack[]): number {
  let maxEnd = 0;
  for (const track of tracks) {
    for (const seg of track.segments) {
      if (seg.endTime > maxEnd) maxEnd = seg.endTime;
    }
  }
  return maxEnd;
}

/**
 * 检测时间范围对象（用于重叠检测）
 */
export interface TimeRange {
  startTime: number;
  endTime: number;
  index: number;
}

/**
 * 检测两个时间范围是否重叠
 */
export function isOverlapping(a: TimeRange, b: TimeRange): boolean {
  // 如果 a 的结束时间 <= b 的开始时间，或 b 的结束时间 <= a 的开始时间，则不重叠
  // 否则重叠
  return !(a.endTime <= b.startTime || b.endTime <= a.startTime);
}

/**
 * 检测轨道内所有重叠的时间范围对
 * 返回一个 Set，包含所有参与重叠的索引
 */
export function detectOverlappingIndices(ranges: TimeRange[]): Set<number> {
  const overlappingIndices = new Set<number>();

  // 按开始时间排序
  const sortedRanges = [...ranges].sort((a, b) => a.startTime - b.startTime);

  // 检测所有可能的重叠对
  for (let i = 0; i < sortedRanges.length - 1; i++) {
    const current = sortedRanges[i];

    // 检查当前范围与后续所有可能重叠的范围
    for (let j = i + 1; j < sortedRanges.length; j++) {
      const next = sortedRanges[j];

      // 如果 next 的开始时间已经大于等于 current 的结束时间，后面的都不会重叠了
      if (next.startTime >= current.endTime) {
        break;
      }

      // 检测重叠
      if (isOverlapping(current, next)) {
        overlappingIndices.add(current.index);
        overlappingIndices.add(next.index);
      }
    }
  }

  return overlappingIndices;
}

/**
 * 从 TimelineSegment 数组中检测重叠的片段
 */
export function detectOverlappingSegments(segments: TimelineSegment[]): Set<string> {
  const ranges: TimeRange[] = segments.map((seg, index) => ({
    startTime: seg.startTime,
    endTime: seg.endTime,
    index
  }));

  const overlappingIndices = detectOverlappingIndices(ranges);

  // 将索引转换为片段 ID
  const overlappingIds = new Set<string>();
  overlappingIndices.forEach((index) => {
    if (index < segments.length) {
      overlappingIds.add(segments[index].id);
    }
  });

  return overlappingIds;
}

// Re-export clip sequence utilities
export type { ClipPlaybackInfo, ClipTimeMapping, SkipRegion } from './utils/clipSequence';
export { ClipSequence } from './utils/clipSequence';

// Re-export media sequence utilities
export type { ActiveSegmentInfo, OverlapInfo, SegmentLayoutInfo, SplitResult, TransformMatrix } from './utils/mediaSequence';
export { MediaSequence } from './utils/mediaSequence';
