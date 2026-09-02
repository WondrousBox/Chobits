/**
 * useSpriteSpeak Hook
 *
 * 在渲染进程中监听语音合成播放事件，
 * 通过 HTML5 Audio API 播放合成的音频文件。
 *
 * 特性：
 * - 同一时间只播放一个音频，新音频会自动停止前一个
 * - 使用播放序列号防止竞态条件
 * - 正确清理事件监听器，防止内存泄漏
 *
 * 使用方式：在 SpriteApp 组件中调用 useSpriteSpeak() 即可。
 */

import { useCallback, useEffect, useRef } from 'react';

import { attachMediaElement, detachLipSyncSource } from '@/lib/audio/lip-sync-source';
import { makeResSrc } from '@/lib/resource-protocol';

/**
 * 监听 SpriteManager 的 speak 事件并播放音频
 */
export function useSpriteSpeak(): { stop: () => void } {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** 播放序列号，用于防止竞态条件 */
  const playIdRef = useRef(0);

  /** 停止当前正在播放的音频 */
  const stop = useCallback(() => {
    detachLipSyncSource();
    if (audioRef.current) {
      const audio = audioRef.current;
      audioRef.current = null; // 先清空 ref，防止回调中的操作

      // 移除所有事件监听器
      audio.onended = null;
      audio.onerror = null;
      audio.oncanplaythrough = null;
      audio.onloadeddata = null;

      // 停止播放并清理
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
      audio.load(); // 强制重置音频元素
    }
  }, []);

  /** 播放音频文件 */
  const play = useCallback(
    (audioPath: string, volume: number) => {
      // 递增播放序列号
      const currentPlayId = ++playIdRef.current;

      // 停止上一个音频
      stop();

      try {
        // 将绝对路径转为 res:// 协议 URL
        const src = makeResSrc(audioPath);
        const audio = new Audio();
        // res:// 相对页面源是跨域的；lip-sync 的 createMediaElementSource 会接管元素输出，
        // 若资源未以 CORS 方式加载会被 Chromium 置为静音，因此必须设置 crossOrigin
        audio.crossOrigin = 'anonymous';
        audio.src = src;
        audio.volume = Math.max(0, Math.min(1, volume));
        audio.preload = 'auto';

        // 使用 on* 属性而非 addEventListener，便于清理
        audio.onended = () => {
          // 只有当前音频没有被替换时才清理
          if (playIdRef.current === currentPlayId) {
            audioRef.current = null;
          }
        };

        audio.onerror = (e) => {
          console.error('[useSpriteSpeak] Audio playback error:', e);
          if (playIdRef.current === currentPlayId) {
            audioRef.current = null;
          }
        };

        // 设置当前音频（必须在 play() 之前设置）
        audioRef.current = audio;
        attachMediaElement(audio);

        audio.play().catch((err) => {
          console.error('[useSpriteSpeak] Failed to play audio:', err);
          // 只有当前音频没有被替换时才清理
          if (playIdRef.current === currentPlayId) {
            audioRef.current = null;
          }
        });
      } catch (err) {
        console.error('[useSpriteSpeak] Error creating Audio:', err);
      }
    },
    [stop]
  );

  // 订阅 sprite:speak 事件
  useEffect(() => {
    const sprite = window.chobits?.sprite;
    if (!sprite?.onSpeak) {
      console.warn('[useSpriteSpeak] sprite.onSpeak not available');
      return;
    }

    const cleanup = sprite.onSpeak((payload) => {
      if (payload?.audioPath) {
        play(payload.audioPath, payload.volume ?? 1);
      }
    });

    return () => {
      stop();
      cleanup?.();
    };
  }, [play, stop]);

  return { stop };
}
