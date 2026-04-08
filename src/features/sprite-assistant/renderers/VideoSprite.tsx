import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';

import { useSpriteState } from '../context/hooks';
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
  const { currentAnimation, spriteState } = useSpriteState();

  // 从 currentAnimation 的 sprite:play 指令提取播放参数
  const animId = currentAnimation?.animationId ?? null;
  const source = currentAnimation?.source;
  const playback = currentAnimation?.playback;

  // Use ref instead of state to avoid cascading re-renders
  const phaseRef = useRef<AnimationPhase>('idle');
  const prevAnimIdRef = useRef<string | null>(null);

  // 判断是否为三段式动画
  const hasSegmentLoop = playback?.loopStartMs != null && playback?.loopEndMs != null;

  // 判断是否正在活跃播放（非 idle 状态时视为 playing）
  const isPlaying = spriteState !== 'idle';

  const prevIsPlayingRef = useRef(false);

  // Reset video state when animation changes
  useLayoutEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (prevAnimIdRef.current === animId) return;
    prevAnimIdRef.current = animId;

    phaseRef.current = 'idle';
    v.currentTime = 0;
    v.play();
  }, [animId]);

  // Handle isPlaying transitions for three-phase animations
  useLayoutEffect(() => {
    const v = videoRef.current;
    if (!v || !hasSegmentLoop) return;

    const wasPlaying = prevIsPlayingRef.current;
    prevIsPlayingRef.current = isPlaying;

    if (isPlaying && !wasPlaying) {
      v.currentTime = 0;
      v.play();
      phaseRef.current = 'intro';
    } else if (!isPlaying && wasPlaying && phaseRef.current === 'loop') {
      const loopEndSec = (playback?.loopEndMs ?? v.duration * 1000) / 1000;
      v.currentTime = loopEndSec;
      v.play();
      phaseRef.current = 'outro';
    }
  }, [isPlaying, hasSegmentLoop, playback?.loopEndMs]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
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

    const loopStartMs = playback?.loopStartMs;
    const loopEndMs = playback?.loopEndMs;
    const currentTimeMs = v.currentTime * 1000;
    const durationMs = duration * 1000;
    const phase = phaseRef.current;

    const effectiveStart = loopStartMs ?? 0;
    const effectiveEnd = loopEndMs ?? durationMs;
    const hasCustomLoop = loopStartMs != null || loopEndMs != null;

    const shouldLoop = hasCustomLoop
      ? playback?.loop !== false
      : (playback?.loop ?? false);

    // Handle three-phase animation
    if (loopStartMs != null && loopEndMs != null) {
      if (phase === 'intro' && currentTimeMs >= loopStartMs) {
        phaseRef.current = 'loop';
      } else if (phase === 'loop' && currentTimeMs >= loopEndMs - 50) {
        if (shouldLoop) {
          v.currentTime = loopStartMs / 1000;
          v.play();
        } else {
          v.currentTime = loopEndMs / 1000;
          phaseRef.current = 'outro';
        }
      } else if (phase === 'outro' && currentTimeMs >= durationMs - 50) {
        if (shouldLoop && isPlaying) {
          phaseRef.current = 'idle';
          v.currentTime = 0;
          v.play();
        } else {
          phaseRef.current = 'idle';
          v.pause();
          const autoIdle = playback?.autoIdle ?? true;
          if (autoIdle && animId) {
            // 上报动画完成
            window.YUA.sprite.animComplete(animId, 'outro');
          }
        }
      } else if (phase === 'idle') {
        if (shouldLoop && isPlaying && currentTimeMs >= loopStartMs - 50) {
          v.currentTime = 0;
          v.play();
        }
      }
      return;
    }

    // Handle simple loop
    if (hasCustomLoop) {
      if (currentTimeMs >= effectiveEnd - 50) {
        if (shouldLoop) {
          v.currentTime = effectiveStart / 1000;
          v.play();
        } else {
          v.pause();
          if (animId) {
            window.YUA.sprite.animComplete(animId, 'full');
          }
        }
      }
      return;
    }
  };

  const computed = useMemo(() => {
    if (!source) return undefined;
    const { url, type } = resolveSpriteSrc(source as any);
    return {
      srcUrl: url,
      type: type || 'video/webm',
      width: playback?.width ?? 180,
      height: playback?.height ?? 240,
      padding: playback?.padding ?? 100,
      loop: playback?.loop ?? false,
      autoIdle: playback?.autoIdle ?? true,
      loopStartMs: playback?.loopStartMs,
      loopEndMs: playback?.loopEndMs
    };
  }, [source, playback]);

  // 判断是否需要翻转：行走中且向右移动
  const shouldFlip = walkDirection === 'right' && spriteState === 'walking';

  // 是否使用原生 loop 属性
  const useNativeLoop = computed && computed.loop === true && computed.loopStartMs == null && computed.loopEndMs == null;

  // 处理视频播放完成
  const handleEnded = (): void => {
    if (!computed) return;
    const hasCustomLoop = computed.loopStartMs != null || computed.loopEndMs != null;
    const shouldLoop = hasCustomLoop ? computed.loop !== false : (computed.loop ?? false);
    if (shouldLoop) return;
    if (animId) {
      window.YUA.sprite.animComplete(animId, 'full');
    }
  };

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
      autoPlay
      muted
      playsInline
      loop={useNativeLoop}
      onTimeUpdate={handleTimeUpdate}
      onEnded={handleEnded}
      src={computed.srcUrl}
      onError={(e) => {
        console.warn('Sprite video failed to load', computed.srcUrl, e);
      }}
    ></video>
  ) : null;
}
