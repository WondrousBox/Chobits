import { useEffect, useMemo, useRef } from 'react';

import { useSpritePlayer } from './context/SpritePlayerContext';
import { resolveSpriteSrc } from './utils/resource';

export default function VideoSprite(): JSX.Element | null {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { current } = useSpritePlayer();

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
    const d = v.duration;
    if (!Number.isFinite(d) || d <= 0) return;

    const loopStrategy = current?.loopStrategy ?? 'early';
    const cutoffSeconds = current?.cutoffSeconds;
    if (loopStrategy === 'early') {
      const remaining = d - v.currentTime;
      const cutoffBase = d > 1 ? 1 : Math.max(0.05, Math.min(0.2, d * 0.2));
      const cutoff = Number.isFinite(cutoffSeconds || NaN) ? Math.max(0.01, Math.min(d * 0.9, cutoffSeconds as number)) : cutoffBase;
      if (remaining <= cutoff + 1e-3) {
        v.currentTime = 0;
        v.play();
      }
    }
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
      autoplay: anim.autoplay ?? true,
      muted: anim.muted ?? true,
      playsInline: anim.playsInline ?? true,
      loopStrategy: anim.loopStrategy ?? 'early',
      cutoffSeconds: anim.cutoffSeconds
    };
  }, [current]);

  return computed ? (
    <video
      ref={videoRef}
      style={{ width: computed.width ?? 180, height: computed.height ?? 240, userSelect: 'none' }}
      autoPlay={computed.autoplay ?? true}
      muted={computed.muted ?? true}
      playsInline={computed.playsInline ?? true}
      loop={computed.loopStrategy === 'native'}
      onTimeUpdate={handleTimeUpdate}
      src={computed.srcUrl}
      onError={(e) => {
        // 简单错误日志，便于排查路径/权限问题
        console.warn('Sprite video failed to load', computed.srcUrl, e);
      }}
    ></video>
  ) : null;
}
