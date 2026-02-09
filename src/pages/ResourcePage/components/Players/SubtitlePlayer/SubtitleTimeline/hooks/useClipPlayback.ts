import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ClipSegment } from '../types';
import { ClipSequence } from '../utils';

interface ClipPlayerCallbacks {
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

interface UseClipPlaybackOptions {
  /** 剪辑片段列表 */
  clips: ClipSegment[];
  /** 是否启用剪辑播放模式 */
  enabled: boolean;
  /** 播放器回调接口 */
  callbacks: ClipPlayerCallbacks | null;
}

interface UseClipPlaybackReturn {
  /** 剪辑序列实例 */
  sequence: ClipSequence;
  /** 当前播放时间（剪辑序列时间，非源时间） */
  clipCurrentTime: number;
  /** 剪辑序列总时长 */
  clipDuration: number;
  /** 当前正在播放的片段 ID */
  activeClipId: string | null;
  /** 在剪辑序列的某个时间点 seek */
  seekClipTime: (clipTime: number) => void;
  /** 是否到达剪辑序列末尾 */
  isAtEnd: boolean;
}

/**
 * useClipPlayback - 剪辑播放调度 Hook
 *
 * 核心职责：
 * 1. 根据剪辑序列控制源媒体的 seek 和 playbackRate
 * 2. 在片段边界自动跳转到下一个片段
 * 3. 映射源媒体时间到剪辑序列时间
 * 4. 在序列末尾自动暂停
 */
export function useClipPlayback({ clips, enabled, callbacks }: UseClipPlaybackOptions): UseClipPlaybackReturn {
  const [clipCurrentTime, setClipCurrentTime] = useState(0);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [isAtEnd, setIsAtEnd] = useState(false);
  const animFrameRef = useRef<number>();
  const lastClipIdRef = useRef<string | null>(null);
  const callbacksRef = useRef(callbacks);
  const sequenceRef = useRef<ClipSequence | null>(null);

  // 构建 ClipSequence
  const sequence = useMemo(() => new ClipSequence(clips), [clips]);

  // 同步 refs（在 effect 中赋值以满足 lint 规则）
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  useEffect(() => {
    sequenceRef.current = sequence;
  }, [sequence]);

  // 调度循环
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
      const playTime = seq.sourceToPlayTime(sourceTime);

      if (playTime !== null) {
        setClipCurrentTime(playTime);

        const mapping = seq.playTimeToSource(playTime);
        if (mapping) {
          setActiveClipId(mapping.clipId);

          // 片段变化时调整 playbackRate
          if (mapping.clipId !== lastClipIdRef.current) {
            lastClipIdRef.current = mapping.clipId;
            if (cbs.getPlaybackRate() !== mapping.playbackRate) {
              cbs.setPlaybackRate(mapping.playbackRate);
            }
          }
        }

        setIsAtEnd(false);
      } else {
        // 源时间不在任何剪辑片段中 — 需要跳转
        const infos = seq.getPlaybackInfos();
        let jumped = false;

        for (const info of infos) {
          if (sourceTime < info.clip.sourceStart) {
            cbs.seekSource(info.clip.sourceStart);
            cbs.setPlaybackRate(info.clip.playbackRate);
            jumped = true;
            break;
          }
          if (sourceTime >= info.clip.sourceStart && sourceTime < info.clip.sourceEnd) {
            jumped = true;
            break;
          }
        }

        if (!jumped) {
          // 到达末尾
          setIsAtEnd(true);
          setClipCurrentTime(seq.totalDuration);
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
  }, [enabled, callbacks]);

  // 在剪辑序列时间上 seek
  const seekClipTime = useCallback((targetClipTime: number) => {
    const cbs = callbacksRef.current;
    const seq = sequenceRef.current;
    if (!cbs || !seq) return;

    const mapping = seq.playTimeToSource(targetClipTime);
    if (mapping) {
      cbs.seekSource(mapping.sourceTime);
      cbs.setPlaybackRate(mapping.playbackRate);
      lastClipIdRef.current = mapping.clipId;
      setClipCurrentTime(targetClipTime);
      setActiveClipId(mapping.clipId);
      setIsAtEnd(false);
    }
  }, []);

  return {
    sequence,
    clipCurrentTime,
    clipDuration: sequence.totalDuration,
    activeClipId,
    seekClipTime,
    isAtEnd
  };
}
