import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ClipSegment } from '../types';
import { ClipSequence } from '../utils';

interface ClipOrderedPlayerCallbacks {
  /** 获取源媒体当前时间（秒） */
  getSourceTime: () => number;
  /** 跳转到源媒体的指定时间 */
  seekSource: (time: number) => void;
  /** 设置源媒体播放速率 */
  setPlaybackRate: (rate: number) => void;
  /** 获取当前播放速率 */
  getPlaybackRate: () => number;
  /** 暂停源媒体 */
  pause: () => void;
  /** 源媒体是否暂停中 */
  isPaused: () => boolean;
}

interface UseClipOrderedPlaybackOptions {
  /** 剪辑片段列表 */
  clips: ClipSegment[];
  /** 是否启用乱序播放模式 */
  enabled: boolean;
  /** 播放器回调接口 */
  callbacks: ClipOrderedPlayerCallbacks | null;
}

interface UseClipOrderedPlaybackReturn {
  /** 剪辑序列实例 */
  sequence: ClipSequence;
  /** 当前虚拟播放时间 */
  virtualTime: number;
  /** 虚拟播放总时长（按 order 顺序，考虑速率） */
  virtualDuration: number;
  /** 当前正在播放的片段 ID */
  activeClipId: string | null;
  /** 当前片段在播放序列中的索引 */
  activeClipIndex: number;
  /** 在虚拟时间轴上 seek */
  seekVirtualTime: (virtualTime: number) => void;
  /** 是否到达播放序列末尾 */
  isAtEnd: boolean;
}

/**
 * useClipOrderedPlayback - 乱序播放调度 Hook
 *
 * 核心职责：
 * 1. 按 order 字段决定的顺序播放片段（而非源时间顺序）
 * 2. 在片段边界自动跳转到下一个片段（按 order）
 * 3. 建立虚拟播放时间和源媒体时间的映射
 * 4. 根据片段速率调整播放器速率
 */
export function useClipOrderedPlayback({ clips, enabled, callbacks }: UseClipOrderedPlaybackOptions): UseClipOrderedPlaybackReturn {
  const [virtualTime, setVirtualTime] = useState(0);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [activeClipIndex, setActiveClipIndex] = useState(-1);
  const [isAtEnd, setIsAtEnd] = useState(false);

  const animFrameRef = useRef<number>();
  const lastClipIdRef = useRef<string | null>(null);
  const callbacksRef = useRef(callbacks);
  const sequenceRef = useRef<ClipSequence | null>(null);

  const sequence = useMemo(() => new ClipSequence(clips), [clips]);

  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => {
    sequenceRef.current = sequence;
  }, [sequence]);

  useEffect(() => {
    if (!enabled || !callbacks) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
      return;
    }

    const loop = (): void => {
      const cbs = callbacksRef.current;
      const seq = sequenceRef.current;
      if (!cbs || !seq) {
        animFrameRef.current = requestAnimationFrame(loop);
        return;
      }

      const sourceTime = cbs.getSourceTime();
      const orderedClips = seq.getOrderedClips();

      // 找到当前源时间所在的片段
      let currentClipInfo = null;
      for (const info of orderedClips) {
        if (sourceTime >= info.clip.sourceStart && sourceTime < info.clip.sourceEnd) {
          currentClipInfo = info;
          break;
        }
      }

      if (currentClipInfo) {
        // 在某个片段内
        const sourceOffset = sourceTime - currentClipInfo.clip.sourceStart;
        const progress = currentClipInfo.sourceDuration > 0 ? sourceOffset / currentClipInfo.sourceDuration : 0;
        const virtualOffset = progress * currentClipInfo.virtualDuration;
        const newVirtualTime = currentClipInfo.virtualStart + virtualOffset;

        setVirtualTime(newVirtualTime);
        setActiveClipId(currentClipInfo.clip.id);
        setActiveClipIndex(orderedClips.indexOf(currentClipInfo));

        // 片段变化时调整 playbackRate
        if (currentClipInfo.clip.id !== lastClipIdRef.current) {
          lastClipIdRef.current = currentClipInfo.clip.id;
          const targetRate = currentClipInfo.clip.playbackRate || 1.0;
          if (Math.abs(cbs.getPlaybackRate() - targetRate) > 0.01) {
            cbs.setPlaybackRate(targetRate);
          }
        }

        setIsAtEnd(false);
      } else {
        // 不在任何片段内，需要跳转到下一个片段
        const nextClip = seq.getNextOrderedClip(sourceTime);

        if (nextClip) {
          // 跳转到下一个片段的起始位置
          cbs.seekSource(nextClip.clip.sourceStart);
          cbs.setPlaybackRate(nextClip.clip.playbackRate || 1.0);
          lastClipIdRef.current = nextClip.clip.id;
        } else {
          // 已经播放完所有片段
          setIsAtEnd(true);
          setVirtualTime(seq.virtualDuration);
          if (!cbs.isPaused()) {
            cbs.pause();
          }
        }
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [enabled, callbacks, sequence]);

  // 在虚拟时间轴上 seek
  const seekVirtualTime = useCallback((targetVirtualTime: number) => {
    const cbs = callbacksRef.current;
    const seq = sequenceRef.current;
    if (!cbs || !seq) return;

    const mapping = seq.virtualTimeToSource(targetVirtualTime);
    if (mapping) {
      cbs.seekSource(mapping.sourceTime);
      cbs.setPlaybackRate(mapping.playbackRate);
      lastClipIdRef.current = mapping.clipId;
      setVirtualTime(targetVirtualTime);
      setActiveClipId(mapping.clipId);
      setActiveClipIndex(mapping.clipIndex);
      setIsAtEnd(false);
    }
  }, []);

  return {
    sequence,
    virtualTime,
    virtualDuration: sequence.virtualDuration,
    activeClipId,
    activeClipIndex,
    seekVirtualTime,
    isAtEnd
  };
}
