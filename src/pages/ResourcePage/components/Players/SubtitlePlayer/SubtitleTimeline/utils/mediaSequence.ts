import type { MediaSegment, MediaSource, MediaTransform, MediaTrackData } from '../types';
import { DEFAULT_TRANSFORM } from '../types';

/**
 * 时间轴位置信息
 */
export interface SegmentLayoutInfo {
  /** 片段数据 */
  segment: MediaSegment;
  /** 在时间轴上的起始位置（像素） */
  left: number;
  /** 片段宽度（像素） */
  width: number;
  /** 媒体源（如果可用） */
  source?: MediaSource;
}

/**
 * 某时刻的活跃片段信息
 */
export interface ActiveSegmentInfo {
  /** 轨道 ID */
  trackId: string;
  /** 片段数据 */
  segment: MediaSegment;
  /** 媒体源 */
  source?: MediaSource;
  /** 在该片段内的播放进度（0~1） */
  progress: number;
  /** 当前源时间（秒） */
  sourceTime: number;
  /** 图层顺序 */
  zIndex: number;
}

/**
 * 重叠检测结果
 */
export interface OverlapInfo {
  /** 轨道 ID */
  trackId: string;
  /** 重叠的片段 ID 列表 */
  segmentIds: string[];
  /** 重叠时间范围起始 */
  startTime: number;
  /** 重叠时间范围结束 */
  endTime: number;
}

/**
 * 分割片段结果
 */
export interface SplitResult {
  /** 左侧片段 */
  left: MediaSegment;
  /** 右侧片段 */
  right: MediaSegment;
}

/**
 * 变换矩阵
 */
export interface TransformMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/**
 * MediaSequence — 媒体序列引擎
 *
 * 核心功能：
 * - 管理多轨道媒体片段的时间布局
 * - 检测片段重叠
 * - 在指定时间分割片段
 * - 计算变换矩阵
 * - 获取某时刻的所有活跃片段
 */
export class MediaSequence {
  private readonly tracks: MediaTrackData[];
  private readonly sources: Map<string, MediaSource>;

  constructor(tracks: MediaTrackData[], sources?: Map<string, MediaSource>) {
    // 按 zIndex 降序排列（上层优先）
    this.tracks = [...tracks].sort((a, b) => b.zIndex - a.zIndex);
    this.sources = sources ?? new Map();
  }

  /**
   * 获取所有轨道
   */
  getTracks(): MediaTrackData[] {
    return this.tracks;
  }

  /**
   * 获取指定轨道的所有片段布局信息
   */
  getTrackLayout(trackId: string, pixelsPerSecond: number): SegmentLayoutInfo[] {
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track) return [];

    return track.segments
      .filter((s) => !s.deleted)
      .map((segment) => ({
        segment,
        left: segment.timelineStart * pixelsPerSecond,
        width: Math.max((segment.timelineEnd - segment.timelineStart) * pixelsPerSecond, 1),
        source: this.sources.get(segment.sourceId)
      }));
  }

  /**
   * 获取某时刻的所有活跃片段（按 zIndex 排序）
   */
  getSegmentsAtTime(timelineTime: number): ActiveSegmentInfo[] {
    const result: ActiveSegmentInfo[] = [];

    for (const track of this.tracks) {
      if (!track.visible) continue;

      for (const segment of track.segments) {
        if (segment.deleted || segment.disabled) continue;
        if (timelineTime < segment.timelineStart || timelineTime >= segment.timelineEnd) continue;

        const duration = segment.timelineEnd - segment.timelineStart;
        const progress = duration > 0 ? (timelineTime - segment.timelineStart) / duration : 0;

        // 计算当前源时间
        let sourceTime = 0;
        if (segment.sourceStart !== undefined && segment.sourceEnd !== undefined) {
          const sourceDuration = segment.sourceEnd - segment.sourceStart;
          sourceTime = segment.sourceStart + progress * sourceDuration / segment.playbackRate;
        }

        result.push({
          trackId: track.id,
          segment,
          source: this.sources.get(segment.sourceId),
          progress,
          sourceTime,
          zIndex: track.zIndex
        });
      }
    }

    return result;
  }

  /**
   * 检测所有轨道中的片段重叠
   */
  detectOverlaps(): OverlapInfo[] {
    const overlaps: OverlapInfo[] = [];

    for (const track of this.tracks) {
      const activeSegments = track.segments.filter((s) => !s.deleted && !s.disabled);
      const sortedSegments = [...activeSegments].sort((a, b) => a.timelineStart - b.timelineStart);

      for (let i = 0; i < sortedSegments.length - 1; i++) {
        const current = sortedSegments[i];
        for (let j = i + 1; j < sortedSegments.length; j++) {
          const next = sortedSegments[j];

          // 如果下一个片段的开始时间 >= 当前片段的结束时间，则不重叠
          if (next.timelineStart >= current.timelineEnd) break;

          // 检测重叠
          overlaps.push({
            trackId: track.id,
            segmentIds: [current.id, next.id],
            startTime: next.timelineStart,
            endTime: Math.min(current.timelineEnd, next.timelineEnd)
          });
        }
      }
    }

    return overlaps;
  }

  /**
   * 在指定时间分割片段
   */
  static splitSegment(segment: MediaSegment, splitTime: number): SplitResult | null {
    // 验证分割时间在片段范围内
    if (splitTime <= segment.timelineStart || splitTime >= segment.timelineEnd) {
      return null;
    }

    const leftDuration = splitTime - segment.timelineStart;
    const rightDuration = segment.timelineEnd - splitTime;

    // 计算源时间
    let leftSourceStart = segment.sourceStart;
    let leftSourceEnd = segment.sourceEnd;
    let rightSourceStart = segment.sourceStart;
    let rightSourceEnd = segment.sourceEnd;

    if (segment.sourceStart !== undefined && segment.sourceEnd !== undefined) {
      const totalDuration = segment.timelineEnd - segment.timelineStart;
      const splitRatio = leftDuration / totalDuration;
      const sourceDuration = segment.sourceEnd - segment.sourceStart;

      leftSourceEnd = segment.sourceStart + sourceDuration * splitRatio;
      rightSourceStart = leftSourceEnd;
    }

    const leftSegment: MediaSegment = {
      ...segment,
      id: `${segment.id}-L-${Date.now()}`,
      timelineEnd: splitTime,
      sourceStart: leftSourceStart,
      sourceEnd: leftSourceEnd,
      transitionOut: undefined // 左侧片段不需要出场转场
    };

    const rightSegment: MediaSegment = {
      ...segment,
      id: `${segment.id}-R-${Date.now()}`,
      timelineStart: splitTime,
      sourceStart: rightSourceStart,
      sourceEnd: rightSourceEnd,
      transitionIn: undefined // 右侧片段不需要入场转场
    };

    return { left: leftSegment, right: rightSegment };
  }

  /**
   * 计算变换矩阵
   * 返回 CSS transform matrix() 格式的参数
   */
  static calculateTransformMatrix(transform: MediaTransform, containerWidth: number, containerHeight: number, elementWidth: number, elementHeight: number): TransformMatrix {
    const { x, y, scale, rotation, flipX, flipY } = transform;

    // 中心点位置（像素）
    const centerX = (x / 100) * containerWidth;
    const centerY = (y / 100) * containerHeight;

    // 元素尺寸
    const halfW = (elementWidth * scale) / 2;
    const halfH = (elementHeight * scale) / 2;

    // 翻转
    const scaleX = flipX ? -scale : scale;
    const scaleY = flipY ? -scale : scale;

    // 旋转（弧度）
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    // 计算变换矩阵
    // 顺序：平移到中心 -> 旋转 -> 缩放 -> 翻转 -> 平移到目标位置
    const a = cos * scaleX;
    const b = sin * scaleX;
    const c = -sin * scaleY;
    const d = cos * scaleY;
    const e = centerX - halfW * cos + halfH * sin;
    const f = centerY - halfW * sin - halfH * cos;

    return { a, b, c, d, e, f };
  }

  /**
   * 将变换矩阵转换为 CSS transform 字符串
   */
  static matrixToCSS(matrix: TransformMatrix): string {
    return `matrix(${matrix.a.toFixed(6)}, ${matrix.b.toFixed(6)}, ${matrix.c.toFixed(6)}, ${matrix.d.toFixed(6)}, ${matrix.e.toFixed(2)}, ${matrix.f.toFixed(2)})`;
  }

  /**
   * 计算完整的 CSS 样式
   */
  static calculateTransformCSS(transform: MediaTransform, containerWidth: number, containerHeight: number, elementWidth: number, elementHeight: number): React.CSSProperties {
    const matrix = MediaSequence.calculateTransformMatrix(transform, containerWidth, containerHeight, elementWidth, elementHeight);

    return {
      transform: MediaSequence.matrixToCSS(matrix),
      opacity: transform.opacity,
      transformOrigin: 'center center'
    };
  }

  /**
   * 创建默认片段
   */
  static createSegment(sourceId: string, timelineStart: number, timelineEnd: number, options?: Partial<MediaSegment>): MediaSegment {
    return {
      id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      sourceId,
      timelineStart,
      timelineEnd,
      playbackRate: 1.0,
      muted: false,
      volume: 1.0,
      transform: { ...DEFAULT_TRANSFORM },
      ...options
    };
  }

  /**
   * 创建默认轨道
   */
  static createTrack(label: string, zIndex: number, options?: Partial<MediaTrackData>): MediaTrackData {
    return {
      id: `media-track-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      label,
      segments: [],
      zIndex,
      visible: true,
      locked: false,
      ...options
    };
  }

  /**
   * 移动片段到新位置
   */
  static moveSegment(segments: MediaSegment[], segmentId: string, newTimelineStart: number): MediaSegment[] {
    return segments.map((s) => {
      if (s.id !== segmentId) return s;
      const duration = s.timelineEnd - s.timelineStart;
      return {
        ...s,
        timelineStart: newTimelineStart,
        timelineEnd: newTimelineStart + duration
      };
    });
  }

  /**
   * 调整片段边缘
   */
  static resizeSegment(segments: MediaSegment[], segmentId: string, edge: 'start' | 'end', newTime: number): MediaSegment[] {
    return segments.map((s) => {
      if (s.id !== segmentId) return s;

      if (edge === 'start') {
        if (newTime >= s.timelineEnd) return s;
        const ratio = (s.timelineEnd - newTime) / (s.timelineEnd - s.timelineStart);

        let newSourceStart = s.sourceStart;
        let newSourceEnd = s.sourceEnd;
        if (s.sourceStart !== undefined && s.sourceEnd !== undefined) {
          const sourceDuration = s.sourceEnd - s.sourceStart;
          newSourceStart = s.sourceEnd - sourceDuration * ratio;
        }

        return {
          ...s,
          timelineStart: newTime,
          sourceStart: newSourceStart,
          sourceEnd: newSourceEnd
        };
      } else {
        if (newTime <= s.timelineStart) return s;
        const ratio = (newTime - s.timelineStart) / (s.timelineEnd - s.timelineStart);

        let newSourceEnd = s.sourceEnd;
        if (s.sourceStart !== undefined && s.sourceEnd !== undefined) {
          const sourceDuration = s.sourceEnd - s.sourceStart;
          newSourceEnd = s.sourceStart + sourceDuration * ratio;
        }

        return {
          ...s,
          timelineEnd: newTime,
          sourceEnd: newSourceEnd
        };
      }
    });
  }

  /**
   * 更新片段变换
   */
  static updateTransform(segments: MediaSegment[], segmentId: string, transformPatch: Partial<MediaTransform>): MediaSegment[] {
    return segments.map((s) => {
      if (s.id !== segmentId) return s;
      return {
        ...s,
        transform: { ...s.transform, ...transformPatch }
      };
    });
  }

  /**
   * 软删除片段
   */
  static deleteSegment(segments: MediaSegment[], segmentId: string): MediaSegment[] {
    return segments.map((s) => (s.id === segmentId ? { ...s, deleted: true } : s));
  }

  /**
   * 恢复片段
   */
  static restoreSegment(segments: MediaSegment[], segmentId: string): MediaSegment[] {
    return segments.map((s) => (s.id === segmentId ? { ...s, deleted: false } : s));
  }
}
