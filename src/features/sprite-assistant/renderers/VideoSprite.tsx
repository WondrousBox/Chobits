import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useSpriteState } from '../context/hooks';
import { resolveSpriteSrc } from '../utils/resource';
import { isTimedPlaybackActive } from './video-playback';
import { VideoSpriteDriver } from './video-sprite-driver';

export default function VideoSprite({ walkDirection }: { walkDirection?: 'left' | 'right' | null }): JSX.Element | null {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { currentAnimation, spriteState } = useSpriteState();
  const [driver] = useState(
    () =>
      new VideoSpriteDriver({
        onAnimationComplete: (animationId, phase, playId) => {
          if (playId) {
            window.YUA.sprite.animComplete(animationId, phase, playId);
            return;
          }
          window.YUA.sprite.animComplete(animationId, phase);
        }
      })
  );

  // 从 currentAnimation 的 sprite:play 指令提取播放参数
  const animId = currentAnimation?.animationId ?? null;
  const playId = currentAnimation?.playId ?? null;
  const source = currentAnimation?.source;
  const playback = currentAnimation?.playback;
  const playbackSession = currentAnimation?.playbackSession;

  // 判断是否为三段式动画
  const hasSegmentLoop = playback?.loopStartMs != null && playback?.loopEndMs != null;
  const timedSessionActive = playbackSession?.mode === 'timed' ? isTimedPlaybackActive(playbackSession) : null;
  const segmentLoopActive = hasSegmentLoop && playback?.loop === true;

  // 判断是否正在活跃播放：优先使用播放命令自身的 timed session，再回退到 runtime state
  const isPlaying = timedSessionActive ?? (segmentLoopActive ? true : spriteState !== 'idle');

  useEffect(() => {
    driver.syncPlaybackSession({
      video: videoRef.current,
      hasSegmentLoop,
      playback,
      playbackSession
    });
    return () => {
      driver.clearPlaybackSessionTimer();
    };
  }, [animId, driver, hasSegmentLoop, playback, playbackSession]);

  // Reset video state when animation changes
  useLayoutEffect(() => {
    driver.resetForAnimation({
      video: videoRef.current,
      animId,
      hasSegmentLoop,
      playbackSession
    });
  }, [animId, driver, hasSegmentLoop, playbackSession, timedSessionActive]);

  // Handle isPlaying transitions for three-phase animations
  useLayoutEffect(() => {
    driver.syncPlayingState({
      video: videoRef.current,
      isPlaying,
      hasSegmentLoop,
      playback
    });
  }, [driver, hasSegmentLoop, isPlaying, playback]);

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

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onCanPlay = (): void => {
      driver.handleCanPlay(v);
    };
    v.addEventListener('canplay', onCanPlay);
    return () => {
      v.removeEventListener('canplay', onCanPlay);
    };
  }, [computed?.srcUrl, driver]);

  useEffect(() => {
    return () => {
      driver.dispose();
    };
  }, [driver]);

  const handleTimeUpdate = (): void => {
    driver.handleTimeUpdate({
      video: videoRef.current,
      animId,
      playId,
      playback,
      fallbackIsPlaying: segmentLoopActive ? true : spriteState !== 'idle'
    });
  };

  // 判断是否需要翻转：行走中且向右移动
  const shouldFlip = walkDirection === 'right' && spriteState === 'walking';

  // 是否使用原生 loop 属性
  const useNativeLoop = computed && computed.loop === true && computed.loopStartMs == null && computed.loopEndMs == null;

  // 处理视频播放完成
  const handleEnded = (): void => {
    driver.handleEnded({
      animId,
      playId,
      playback
    });
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
