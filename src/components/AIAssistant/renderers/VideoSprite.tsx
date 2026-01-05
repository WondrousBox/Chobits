import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import { DEFAULT_ASSISTANT_PADDING } from '../constants';
import { useSpritePlayer } from '../context/SpritePlayerContext';
import { resolveSpriteSrc } from '../utils/resource';

/**
 * Animation playback phase for three-phase animations:
 * - 'intro': Playing the intro segment (0 ~ loopStartMs)
 * - 'loop': Playing the looping segment (loopStartMs ~ loopEndMs)
 * - 'outro': Playing the outro segment (loopEndMs ~ end)
 * - 'idle': Not actively playing, will loop intro or full video
 */
type AnimationPhase = 'intro' | 'loop' | 'outro' | 'idle';

export default function VideoSprite({ walkDirection }: { walkDirection?: 'left' | 'right' | null }): JSX.Element | null {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { current, isPlaying } = useSpritePlayer();
  // Use ref instead of state to avoid cascading re-renders from effect
  const phaseRef = useRef<AnimationPhase>('idle');
  const prevIsPlayingRef = useRef(false);
  const prevAnimIdRef = useRef<string | null>(null);

  // Determine if this animation has segment loop config (three-phase mode)
  const hasSegmentLoop = current?.loopStartMs != null && current?.loopEndMs != null;

  // Reset video state when animation changes (sync effect to avoid flicker)
  const currentAnimId = current?.meta.id ?? null;
  useLayoutEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    // Skip if animation hasn't changed
    if (prevAnimIdRef.current === currentAnimId) return;
    prevAnimIdRef.current = currentAnimId;

    // Reset to idle phase and restart video
    phaseRef.current = 'idle';
    v.currentTime = 0;
    v.play();
  }, [currentAnimId]);

  // Handle isPlaying state transitions for three-phase animations
  useLayoutEffect(() => {
    const v = videoRef.current;
    if (!v || !hasSegmentLoop) return;

    const wasPlaying = prevIsPlayingRef.current;
    prevIsPlayingRef.current = isPlaying;

    if (isPlaying && !wasPlaying) {
      // Animation just started: play from beginning (intro phase)
      v.currentTime = 0;
      v.play();
      phaseRef.current = 'intro';
    } else if (!isPlaying && wasPlaying && phaseRef.current === 'loop') {
      // Animation just stopped: jump to outro phase
      const loopEndSec = (current?.loopEndMs ?? v.duration * 1000) / 1000;
      v.currentTime = loopEndSec;
      v.play();
      phaseRef.current = 'outro';
    }
  }, [isPlaying, hasSegmentLoop, current?.loopEndMs]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    // Ensure autoplay resumes after programmatic seeks on some browsers
    const onCanPlay = (): void => {
      v.play();
    };
    v.addEventListener('canplay', onCanPlay);
    return () => {
      v.removeEventListener('canplay', onCanPlay);
    };
  }, []);

  const handleTimeUpdate = (): void => {
    const v = videoRef.current;
    if (!v) return;
    const duration = v.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;

    const loopStartMs = current?.loopStartMs;
    const loopEndMs = current?.loopEndMs;
    const currentTimeMs = v.currentTime * 1000;
    const durationMs = duration * 1000;
    const phase = phaseRef.current;

    // Calculate effective loop boundaries (in ms)
    const effectiveStart = loopStartMs ?? 0;
    const effectiveEnd = loopEndMs ?? durationMs;
    const hasCustomLoop = loopStartMs != null || loopEndMs != null;

    // Handle three-phase animation (when both loopStartMs and loopEndMs are set)
    if (loopStartMs != null && loopEndMs != null) {
      if (phase === 'intro' && currentTimeMs >= loopStartMs) {
        // Intro finished, enter loop phase
        phaseRef.current = 'loop';
      } else if (phase === 'loop' && currentTimeMs >= loopEndMs - 50) {
        // Loop segment ended, jump back to loop start
        v.currentTime = loopStartMs / 1000;
        v.play();
      } else if (phase === 'outro' && currentTimeMs >= durationMs - 50) {
        // Outro finished, reset to idle
        phaseRef.current = 'idle';
        v.currentTime = 0;
        v.play();
      } else if (phase === 'idle') {
        // Not actively playing: loop the intro segment (0 ~ loopStartMs)
        if (currentTimeMs >= loopStartMs - 50) {
          v.currentTime = 0;
          v.play();
        }
      }
      return;
    }

    // Handle simple loop (only loopStartMs or only loopEndMs specified)
    if (hasCustomLoop) {
      if (currentTimeMs >= effectiveEnd - 50) {
        v.currentTime = effectiveStart / 1000;
        v.play();
      }
    }
    // If no custom loop config, native loop attribute handles it
  };

  const computed = useMemo(() => {
    const anim = current;
    if (!anim) {
      return;
    }
    const { url, type } = resolveSpriteSrc(anim.source);
    return {
      srcUrl: url,
      type: type || 'video/webm',
      width: anim.width ?? 180,
      height: anim.height ?? 240,
      padding: anim.padding ?? DEFAULT_ASSISTANT_PADDING,
      autoplay: anim.autoplay ?? true,
      muted: anim.muted ?? true,
      playsInline: anim.playsInline ?? true,
      loopStartMs: anim.loopStartMs,
      loopEndMs: anim.loopEndMs
    };
  }, [current]);

  // 当动画切换时，动态设置窗口大小
  useEffect(() => {
    if (!computed) return;

    const setSize = async (): Promise<void> => {
      try {
        const result = await window.YUA.window.setAssistantSize({
          width: computed.width,
          height: computed.height,
          padding: computed.padding
        });
        if (!result.success) {
          console.error('Failed to set assistant size:', result.error);
        }
      } catch (error) {
        console.error('Failed to set assistant size:', error);
      }
    };

    setSize();
  }, [computed]);

  // 判断是否需要翻转：当行走动画且向右移动时需要翻转
  const shouldFlip = computed && current?.meta.eventType === 'walk' && walkDirection === 'right';

  // 如果没有自定义循环配置，使用原生 loop 属性
  const useNativeLoop = computed && computed.loopStartMs == null && computed.loopEndMs == null;

  return computed ? (
    <video
      ref={videoRef}
      style={{
        width: computed.width ?? 180,
        height: computed.height ?? 240,
        userSelect: 'none',
        transform: shouldFlip ? 'scaleX(-1)' : 'none',
        transformOrigin: 'center center'
      }}
      autoPlay={computed.autoplay ?? true}
      muted={computed.muted ?? true}
      playsInline={computed.playsInline ?? true}
      loop={useNativeLoop}
      onTimeUpdate={handleTimeUpdate}
      src={computed.srcUrl}
      onError={(e) => {
        // 简单错误日志，便于排查路径/权限问题
        console.warn('Sprite video failed to load', computed.srcUrl, e);
      }}
    ></video>
  ) : null;
}
