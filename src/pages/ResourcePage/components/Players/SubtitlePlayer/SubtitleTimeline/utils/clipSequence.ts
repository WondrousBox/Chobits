import type { ClipSegment } from '../types';

/**
 * 剪辑时间映射结果
 */
export interface ClipTimeMapping {
  /** 对应的源媒体时间（秒） */
  sourceTime: number;
  /** 所在剪辑片段的 ID */
  clipId: string;
  /** 所在片段的播放速率 */
  playbackRate: number;
  /** 该片段在播放序列中的索引 */
  clipIndex: number;
  /** 当前在该片段内的播放进度 (0~1) */
  progress: number;
}

/**
 * 剪辑片段在播放序列中的信息（含计算好的时间偏移）
 */
export interface ClipPlaybackInfo {
  clip: ClipSegment;
  /** 该片段在播放序列中的起始时间（秒） */
  playStart: number;
  /** 该片段在播放序列中的结束时间（秒） */
  playEnd: number;
  /** 该片段的播放时长（考虑变速后） */
  playDuration: number;
  /** 该片段在源媒体中的时长 */
  sourceDuration: number;
}

/**
 * ClipSequence — 剪辑序列引擎
 *
 * 纯逻辑类，负责：
 * 1. 维护有序的剪辑片段列表（EDL - Edit Decision List）
 * 2. 源时间 ↔ 播放时间 的双向映射
 * 3. 在指定时间点切割片段
 * 4. 片段排序
 * 5. 计算总时长
 *
 * 设计原则：
 * - 不可变操作：所有修改操作返回新的 ClipSegment[]，不修改原数据
 * - 纯函数 + 类方法，无 React 依赖
 */
export class ClipSequence {
  /** 按 order 排序的剪辑片段 */
  private readonly clips: ClipSegment[];

  /** 预计算的播放信息缓存 */
  private readonly playbackInfos: ClipPlaybackInfo[];

  /** 播放总时长 */
  public readonly totalDuration: number;

  constructor(clips: ClipSegment[]) {
    // 只保留未禁用的片段参与播放，但缓存所有片段
    this.clips = [...clips].sort((a, b) => a.order - b.order);

    // 预计算播放信息
    let elapsed = 0;
    this.playbackInfos = this.clips
      .filter((c) => !c.disabled)
      .map((clip) => {
        const sourceDuration = clip.sourceEnd - clip.sourceStart;
        const playDuration = sourceDuration / clip.playbackRate;
        const info: ClipPlaybackInfo = {
          clip,
          playStart: elapsed,
          playEnd: elapsed + playDuration,
          playDuration,
          sourceDuration
        };
        elapsed += playDuration;
        return info;
      });

    this.totalDuration = elapsed;
  }

  /**
   * 获取所有剪辑片段（含禁用的）
   */
  getAllClips(): ClipSegment[] {
    return this.clips;
  }

  /**
   * 获取活跃的（未禁用的）剪辑片段播放信息
   */
  getPlaybackInfos(): ClipPlaybackInfo[] {
    return this.playbackInfos;
  }

  /**
   * 播放时间 → 源时间映射
   *
   * @param playTime 播放序列中的时间（秒）
   * @returns 映射结果，或 null（到达末尾/无片段）
   */
  playTimeToSource(playTime: number): ClipTimeMapping | null {
    if (this.playbackInfos.length === 0) return null;

    // 二分查找 playTime 所在的片段
    let left = 0;
    let right = this.playbackInfos.length - 1;

    while (left <= right) {
      const mid = (left + right) >>> 1;
      const info = this.playbackInfos[mid];

      if (playTime < info.playStart) {
        right = mid - 1;
      } else if (playTime >= info.playEnd) {
        left = mid + 1;
      } else {
        // 命中
        const offsetInPlay = playTime - info.playStart;
        const offsetInSource = offsetInPlay * info.clip.playbackRate;
        const progress = info.playDuration > 0 ? offsetInPlay / info.playDuration : 0;

        return {
          sourceTime: info.clip.sourceStart + offsetInSource,
          clipId: info.clip.id,
          playbackRate: info.clip.playbackRate,
          clipIndex: mid,
          progress
        };
      }
    }

    // playTime 超出范围
    if (playTime >= this.totalDuration && this.playbackInfos.length > 0) {
      const last = this.playbackInfos[this.playbackInfos.length - 1];
      return {
        sourceTime: last.clip.sourceEnd,
        clipId: last.clip.id,
        playbackRate: last.clip.playbackRate,
        clipIndex: this.playbackInfos.length - 1,
        progress: 1
      };
    }

    return null;
  }

  /**
   * 源时间 → 播放时间映射
   *
   * 注意：如果同一个源时间段被引用了多次（比如复制后的片段），
   * 此方法返回第一个匹配的播放时间。
   *
   * @param sourceTime 源媒体中的时间（秒）
   * @returns 播放序列中的时间（秒），或 null（不在任何片段中）
   */
  sourceToPlayTime(sourceTime: number): number | null {
    for (const info of this.playbackInfos) {
      if (sourceTime >= info.clip.sourceStart && sourceTime < info.clip.sourceEnd) {
        const offsetInSource = sourceTime - info.clip.sourceStart;
        const offsetInPlay = offsetInSource / info.clip.playbackRate;
        return info.playStart + offsetInPlay;
      }
    }
    return null;
  }

  /**
   * 获取播放时间对应的下一个片段起始播放时间
   * 用于在片段间自动跳转
   */
  getNextClipPlayStart(currentPlayTime: number): number | null {
    for (const info of this.playbackInfos) {
      if (info.playStart > currentPlayTime) {
        return info.playStart;
      }
    }
    return null;
  }

  // ========== 静态工具方法（返回新的 clips 数组，不修改原数组） ==========

  /**
   * 在指定的源时间点切割片段
   *
   * @param clips 当前的片段列表
   * @param cutTime 切割的源时间点（秒）
   * @returns 切割后的新片段列表
   */
  static cutAtTime(clips: ClipSegment[], cutTime: number): ClipSegment[] {
    const sorted = [...clips].sort((a, b) => a.order - b.order);
    const result: ClipSegment[] = [];

    for (const clip of sorted) {
      // 切割点在片段内部（且不在边缘）
      if (cutTime > clip.sourceStart + 0.05 && cutTime < clip.sourceEnd - 0.05) {
        // 分成两段
        const leftClip: ClipSegment = {
          ...clip,
          id: `${clip.id}-L-${Date.now()}`,
          sourceEnd: cutTime,
          label: clip.label ? `${clip.label} (前)` : undefined
        };
        const rightClip: ClipSegment = {
          ...clip,
          id: `${clip.id}-R-${Date.now()}`,
          sourceStart: cutTime,
          order: clip.order + 0.5, // 临时 order，后面会重新编号
          label: clip.label ? `${clip.label} (后)` : undefined
        };
        result.push(leftClip, rightClip);
      } else {
        result.push({ ...clip });
      }
    }

    // 重新编号 order
    return ClipSequence.reorder(result);
  }

  /**
   * 从源媒体时长创建初始的单一片段（代表整个未剪辑的媒体）
   */
  static createInitial(sourceDuration: number): ClipSegment[] {
    return [
      {
        id: `clip-initial-${Date.now()}`,
        sourceStart: 0,
        sourceEnd: sourceDuration,
        order: 0,
        playbackRate: 1.0
      }
    ];
  }

  /**
   * 删除指定片段
   */
  static deleteClip(clips: ClipSegment[], clipId: string): ClipSegment[] {
    const filtered = clips.filter((c) => c.id !== clipId);
    return ClipSequence.reorder(filtered);
  }

  /**
   * 按给定的 ID 列表重新排序
   */
  static reorderByIds(clips: ClipSegment[], orderedIds: string[]): ClipSegment[] {
    const clipMap = new Map(clips.map((c) => [c.id, c]));
    const result: ClipSegment[] = [];

    orderedIds.forEach((id, index) => {
      const clip = clipMap.get(id);
      if (clip) {
        result.push({ ...clip, order: index });
      }
    });

    // 添加不在 orderedIds 中的片段（保持原有顺序追加到末尾）
    const orderedSet = new Set(orderedIds);
    let nextOrder = result.length;
    for (const clip of clips) {
      if (!orderedSet.has(clip.id)) {
        result.push({ ...clip, order: nextOrder++ });
      }
    }

    return result;
  }

  /**
   * 修改片段播放速率
   */
  static changeSpeed(clips: ClipSegment[], clipId: string, playbackRate: number): ClipSegment[] {
    return clips.map((c) => (c.id === clipId ? { ...c, playbackRate: Math.max(0.1, Math.min(10, playbackRate)) } : c));
  }

  /**
   * 切换片段启用/禁用
   */
  static toggleDisabled(clips: ClipSegment[], clipId: string): ClipSegment[] {
    return clips.map((c) => (c.id === clipId ? { ...c, disabled: !c.disabled } : c));
  }

  /**
   * 修改片段标签
   */
  static changeLabel(clips: ClipSegment[], clipId: string, label: string): ClipSegment[] {
    return clips.map((c) => (c.id === clipId ? { ...c, label } : c));
  }

  /**
   * 重新编号 order（按当前排序顺序，从 0 开始连续编号）
   */
  static reorder(clips: ClipSegment[]): ClipSegment[] {
    return [...clips].sort((a, b) => a.order - b.order).map((c, i) => ({ ...c, order: i }));
  }
}
