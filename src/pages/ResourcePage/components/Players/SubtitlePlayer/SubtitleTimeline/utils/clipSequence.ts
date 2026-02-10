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
 * 剪辑片段在轨道上的布局信息
 *
 * 以**源时间轴**为基准布局：每个片段在轨道上的位置 = sourceStart / sourceEnd。
 * 这样剪辑轨道和字幕/TTS 轨道共享同一条时间轴，不会错位。
 */
export interface ClipPlaybackInfo {
  clip: ClipSegment;
  /** 该片段在源时间轴上的起始时间（= clip.sourceStart） */
  playStart: number;
  /** 该片段在源时间轴上的结束时间（= clip.sourceEnd） */
  playEnd: number;
  /** 该片段在源时间轴上的时长 */
  playDuration: number;
  /** 该片段在源媒体中的时长 */
  sourceDuration: number;
}

/**
 * 需要跳过的时间区间（已删除的片段对应的源时间范围）
 */
export interface SkipRegion {
  /** 区间起始（源时间，秒） */
  start: number;
  /** 区间结束（源时间，秒） */
  end: number;
  /** 删除后应跳转到的目标时间（源时间，秒） */
  skipTo: number;
}

/**
 * ClipSequence — 剪辑序列引擎（源时间布局版本）
 *
 * 核心设计：
 * - 片段在轨道上按**源时间**位置布局，与字幕/TTS 轨道对齐
 * - 删除操作为**软删除**（设置 deleted 标记），片段保留在原位显示为空白
 * - 播放器播放到删除区域时自动跳过
 *
 * 设计原则：
 * - 不可变操作：所有修改操作返回新的 ClipSegment[]，不修改原数据
 * - 纯函数 + 类方法，无 React 依赖
 */
export class ClipSequence {
  /** 按 sourceStart 排序的所有剪辑片段（含已删除的） */
  private readonly clips: ClipSegment[];

  /** 活跃片段（未删除 & 未禁用）的播放信息 */
  private readonly activeInfos: ClipPlaybackInfo[];

  /** 所有片段（含已删除的）的播放信息 */
  private readonly allInfos: ClipPlaybackInfo[];

  /** 需要跳过的区域列表 */
  private readonly skipRegions: SkipRegion[];

  /** 源时间轴总时长（= 最后一个片段的 sourceEnd） */
  public readonly totalDuration: number;

  /** 活跃（可播放）区域的总时长 */
  public readonly activeDuration: number;

  constructor(clips: ClipSegment[]) {
    this.clips = [...clips].sort((a, b) => a.sourceStart - b.sourceStart);

    // 所有片段的信息
    this.allInfos = this.clips.map((clip) => {
      const dur = clip.sourceEnd - clip.sourceStart;
      return {
        clip,
        playStart: clip.sourceStart,
        playEnd: clip.sourceEnd,
        playDuration: dur,
        sourceDuration: dur
      };
    });

    // 活跃片段
    this.activeInfos = this.allInfos.filter(
      (info) => !info.clip.deleted && !info.clip.disabled
    );

    // 总时长
    this.totalDuration =
      this.clips.length > 0
        ? Math.max(...this.clips.map((c) => c.sourceEnd))
        : 0;

    // 活跃时长
    this.activeDuration = this.activeInfos.reduce(
      (sum, info) => sum + info.sourceDuration,
      0
    );

    // 计算跳过区域
    this.skipRegions = this.buildSkipRegions();
  }

  /**
   * 构建需要跳过的区域列表
   */
  private buildSkipRegions(): SkipRegion[] {
    const regions: SkipRegion[] = [];
    const sorted = [...this.clips].sort(
      (a, b) => a.sourceStart - b.sourceStart
    );

    for (const clip of sorted) {
      if (!clip.deleted) continue;

      // 找到此删除区间之后最近的活跃片段
      let target = this.totalDuration; // 默认跳到末尾
      for (const active of this.activeInfos) {
        if (active.clip.sourceStart >= clip.sourceEnd) {
          target = active.clip.sourceStart;
          break;
        }
      }

      regions.push({
        start: clip.sourceStart,
        end: clip.sourceEnd,
        skipTo: target
      });
    }

    return regions;
  }

  /**
   * 获取所有剪辑片段（含已删除的）
   */
  getAllClips(): ClipSegment[] {
    return this.clips;
  }

  /**
   * 获取所有片段的播放信息（含已删除的，用于轨道渲染）
   */
  getAllPlaybackInfos(): ClipPlaybackInfo[] {
    return this.allInfos;
  }

  /**
   * 获取活跃的（未删除且未禁用的）剪辑片段播放信息
   */
  getPlaybackInfos(): ClipPlaybackInfo[] {
    return this.activeInfos;
  }

  /**
   * 获取跳过区域列表
   */
  getSkipRegions(): SkipRegion[] {
    return this.skipRegions;
  }

  /**
   * 检查源时间是否在需要跳过的区域内
   * @returns 如果需要跳过，返回应该跳转到的时间；否则返回 null
   */
  getSkipTarget(sourceTime: number): number | null {
    for (const region of this.skipRegions) {
      if (sourceTime >= region.start && sourceTime < region.end) {
        return region.skipTo;
      }
    }
    return null;
  }

  /**
   * 源时间 → 片段映射（在活跃片段中查找）
   */
  playTimeToSource(sourceTime: number): ClipTimeMapping | null {
    for (let i = 0; i < this.activeInfos.length; i++) {
      const info = this.activeInfos[i];
      if (sourceTime >= info.playStart && sourceTime < info.playEnd) {
        const offset = sourceTime - info.playStart;
        const prog =
          info.playDuration > 0 ? offset / info.playDuration : 0;
        return {
          sourceTime,
          clipId: info.clip.id,
          playbackRate: info.clip.playbackRate,
          clipIndex: i,
          progress: prog
        };
      }
    }

    // 恰好在末尾
    if (this.activeInfos.length > 0 && sourceTime >= this.totalDuration) {
      const last = this.activeInfos[this.activeInfos.length - 1];
      return {
        sourceTime: last.clip.sourceEnd,
        clipId: last.clip.id,
        playbackRate: last.clip.playbackRate,
        clipIndex: this.activeInfos.length - 1,
        progress: 1
      };
    }

    return null;
  }

  /**
   * 源时间 → 播放时间映射
   * 在源时间布局下，播放时间 = 源时间（对于活跃片段）
   */
  sourceToPlayTime(sourceTime: number): number | null {
    for (const info of this.activeInfos) {
      if (
        sourceTime >= info.clip.sourceStart &&
        sourceTime < info.clip.sourceEnd
      ) {
        return sourceTime;
      }
    }
    return null;
  }

  /**
   * 获取下一个活跃片段的起始时间
   */
  getNextClipPlayStart(currentSourceTime: number): number | null {
    for (const info of this.activeInfos) {
      if (info.playStart > currentSourceTime) {
        return info.playStart;
      }
    }
    return null;
  }

  // ========== 静态工具方法 ==========

  /**
   * 在指定的源时间点切割片段
   */
  static cutAtTime(
    clips: ClipSegment[],
    cutTime: number
  ): ClipSegment[] {
    const sorted = [...clips].sort(
      (a, b) => a.sourceStart - b.sourceStart
    );
    const result: ClipSegment[] = [];

    for (const clip of sorted) {
      if (
        !clip.deleted &&
        cutTime > clip.sourceStart + 0.05 &&
        cutTime < clip.sourceEnd - 0.05
      ) {
        const leftClip: ClipSegment = {
          ...clip,
          id: clip.id + '-L-' + Date.now(),
          sourceEnd: cutTime,
          label: clip.label ? clip.label + ' (前)' : undefined
        };
        const rightClip: ClipSegment = {
          ...clip,
          id: clip.id + '-R-' + Date.now(),
          sourceStart: cutTime,
          order: clip.order + 0.5,
          label: clip.label ? clip.label + ' (后)' : undefined
        };
        result.push(leftClip, rightClip);
      } else {
        result.push({ ...clip });
      }
    }

    return ClipSequence.reorder(result);
  }

  /**
   * 从源媒体时长创建初始的单一片段
   */
  static createInitial(dur: number): ClipSegment[] {
    return [
      {
        id: 'clip-initial-' + Date.now(),
        sourceStart: 0,
        sourceEnd: dur,
        order: 0,
        playbackRate: 1.0
      }
    ];
  }

  /**
   * 软删除指定片段（标记为 deleted，保留在原位作为空白占位）
   */
  static deleteClip(
    clips: ClipSegment[],
    clipId: string
  ): ClipSegment[] {
    return clips.map((c) =>
      c.id === clipId ? { ...c, deleted: true } : c
    );
  }

  /**
   * 恢复已删除的片段
   */
  static restoreClip(
    clips: ClipSegment[],
    clipId: string
  ): ClipSegment[] {
    return clips.map((c) =>
      c.id === clipId ? { ...c, deleted: false } : c
    );
  }

  /**
   * 按给定的 ID 列表重新排序
   */
  static reorderByIds(
    clips: ClipSegment[],
    orderedIds: string[]
  ): ClipSegment[] {
    const clipMap = new Map(clips.map((c) => [c.id, c]));
    const result: ClipSegment[] = [];

    orderedIds.forEach((id, index) => {
      const clip = clipMap.get(id);
      if (clip) {
        result.push({ ...clip, order: index });
      }
    });

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
  static changeSpeed(
    clips: ClipSegment[],
    clipId: string,
    playbackRate: number
  ): ClipSegment[] {
    return clips.map((c) =>
      c.id === clipId
        ? { ...c, playbackRate: Math.max(0.1, Math.min(10, playbackRate)) }
        : c
    );
  }

  /**
   * 切换片段启用/禁用
   */
  static toggleDisabled(
    clips: ClipSegment[],
    clipId: string
  ): ClipSegment[] {
    return clips.map((c) =>
      c.id === clipId ? { ...c, disabled: !c.disabled } : c
    );
  }

  /**
   * 修改片段标签
   */
  static changeLabel(
    clips: ClipSegment[],
    clipId: string,
    label: string
  ): ClipSegment[] {
    return clips.map((c) =>
      c.id === clipId ? { ...c, label } : c
    );
  }

  /**
   * 重新编号 order
   */
  static reorder(clips: ClipSegment[]): ClipSegment[] {
    return [...clips]
      .sort((a, b) => a.order - b.order)
      .map((c, i) => ({ ...c, order: i }));
  }
}
