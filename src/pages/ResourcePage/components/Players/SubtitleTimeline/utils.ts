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
