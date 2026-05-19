import type { SpritePlayCommand } from '@packages/sprite-core/types';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useSpriteState } from '../context/hooks';
import { resolveSpriteSrc } from '../utils/resource';
import { isTimedPlaybackActive } from './video-playback';
import { VideoSpriteDriver } from './video-sprite-driver';

type VideoSlot = 'front' | 'back';

interface VideoComputed {
  srcUrl: string;
  type: string;
  width: number;
  height: number;
  padding: number;
  loop: boolean;
  loopCount?: number;
  autoIdle: boolean;
  loopStartMs?: number;
  loopEndMs?: number;
}

interface VideoPresentation {
  key: string;
  animId: string | null;
  playId: string | null;
  playback: SpritePlayCommand['playback'];
  playbackSession: SpritePlayCommand['playbackSession'];
  computed: VideoComputed;
}

function getInactiveSlot(slot: VideoSlot): VideoSlot {
  return slot === 'front' ? 'back' : 'front';
}

function getFiniteLoopCount(loopCount: unknown): number | undefined {
  return typeof loopCount === 'number' && Number.isFinite(loopCount) && loopCount > 0 ? Math.floor(loopCount) : undefined;
}

export default function VideoSprite({ walkDirection }: { walkDirection?: 'left' | 'right' | null }): JSX.Element | null {
  const frontVideoRef = useRef<HTMLVideoElement | null>(null);
  const backVideoRef = useRef<HTMLVideoElement | null>(null);
  const { currentAnimation, spriteState } = useSpriteState();
  const [activeSlot, setActiveSlot] = useState<VideoSlot>('front');
  const activeSlotRef = useRef<VideoSlot>('front');
  const [slotPresentations, setSlotPresentations] = useState<Record<VideoSlot, VideoPresentation | null>>({ front: null, back: null });
  const slotPresentationsRef = useRef<Record<VideoSlot, VideoPresentation | null>>({ front: null, back: null });
  const [activePresentation, setActivePresentation] = useState<VideoPresentation | null>(null);
  const pendingSwitchRef = useRef<{ slot: VideoSlot; key: string } | null>(null);
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

  const desiredPresentation = useMemo<VideoPresentation | null>(() => {
    const source = currentAnimation?.source;
    if (!source) return null;

    const playback = currentAnimation?.playback;
    const { url, type } = resolveSpriteSrc(source as any);
    return {
      key: [currentAnimation?.animationId ?? '', currentAnimation?.playId ?? '', url].join('|'),
      animId: currentAnimation?.animationId ?? null,
      playId: currentAnimation?.playId ?? null,
      playback,
      playbackSession: currentAnimation?.playbackSession,
      computed: {
        srcUrl: url,
        type: type || 'video/webm',
        width: playback?.width ?? 180,
        height: playback?.height ?? 240,
        padding: playback?.padding ?? 100,
        loop: playback?.loop ?? false,
        loopCount: getFiniteLoopCount(playback?.loopCount),
        autoIdle: playback?.autoIdle ?? true,
        loopStartMs: playback?.loopStartMs,
        loopEndMs: playback?.loopEndMs
      }
    };
  }, [currentAnimation]);

  const getVideoForSlot = (slot: VideoSlot): HTMLVideoElement | null => (slot === 'front' ? frontVideoRef.current : backVideoRef.current);

  useEffect(() => {
    activeSlotRef.current = activeSlot;
  }, [activeSlot]);

  useEffect(() => {
    slotPresentationsRef.current = slotPresentations;
  }, [slotPresentations]);

  useLayoutEffect(() => {
    if (!desiredPresentation) {
      pendingSwitchRef.current = null;
      setActivePresentation(null);
      setSlotPresentations({ front: null, back: null });
      return;
    }

    if (!activePresentation) {
      pendingSwitchRef.current = null;
      setActiveSlot('front');
      setActivePresentation(desiredPresentation);
      setSlotPresentations({ front: desiredPresentation, back: null });
      return;
    }

    if (desiredPresentation.key === activePresentation.key) {
      setActivePresentation(desiredPresentation);
      setSlotPresentations((prev) => ({ ...prev, [activeSlot]: desiredPresentation }));
      return;
    }

    const nextSlot = getInactiveSlot(activeSlot);
    pendingSwitchRef.current = { slot: nextSlot, key: desiredPresentation.key };
    setSlotPresentations((prev) => ({ ...prev, [nextSlot]: desiredPresentation }));
  }, [activePresentation, activeSlot, desiredPresentation]);

  useEffect(() => {
    return () => {
      driver.dispose();
    };
  }, [driver]);

  const activePlayback = activePresentation?.playback;
  const activePlaybackSession = activePresentation?.playbackSession;
  const activeHasSegmentLoop = activePlayback?.loopStartMs != null && activePlayback?.loopEndMs != null;
  const activeTimedSessionActive = activePlaybackSession?.mode === 'timed' ? isTimedPlaybackActive(activePlaybackSession) : null;
  const activeSegmentLoopActive = activeHasSegmentLoop && activePlayback?.loop === true;
  const activeIsPlaying = activeTimedSessionActive ?? (activeSegmentLoopActive ? true : spriteState !== 'idle');

  useEffect(() => {
    if (!activePresentation) return;
    driver.syncPlaybackSession({
      video: getVideoForSlot(activeSlot),
      hasSegmentLoop: activeHasSegmentLoop,
      playback: activePlayback,
      playbackSession: activePlaybackSession
    });
    return () => {
      driver.clearPlaybackSessionTimer();
    };
  }, [activePresentation?.key, activeSlot, driver, activeHasSegmentLoop, activePlayback, activePlaybackSession]);

  useLayoutEffect(() => {
    if (!activePresentation) return;
    driver.resetForAnimation({
      video: getVideoForSlot(activeSlot),
      animId: activePresentation.animId,
      hasSegmentLoop: activeHasSegmentLoop,
      playbackSession: activePlaybackSession
    });
  }, [activePresentation?.key, activeSlot, driver, activeHasSegmentLoop, activePlaybackSession, activeTimedSessionActive]);

  useLayoutEffect(() => {
    if (!activePresentation) return;
    driver.syncPlayingState({
      video: getVideoForSlot(activeSlot),
      isPlaying: activeIsPlaying,
      hasSegmentLoop: activeHasSegmentLoop,
      playback: activePlayback
    });
  }, [activePresentation?.key, activeSlot, driver, activeHasSegmentLoop, activeIsPlaying, activePlayback]);

  const switchToReadySlot = (slot: VideoSlot, presentation: VideoPresentation): void => {
    const previousSlot = activeSlotRef.current;
    pendingSwitchRef.current = null;
    setActiveSlot(slot);
    setActivePresentation(presentation);
    setSlotPresentations((prev) => ({ ...prev, [slot]: presentation }));

    const previousVideo = getVideoForSlot(previousSlot);
    if (previousVideo && previousSlot !== slot) {
      requestAnimationFrame(() => previousVideo.pause());
    }
  };

  const handleSlotReady = (slot: VideoSlot): void => {
    const pending = pendingSwitchRef.current;
    if (!pending || pending.slot !== slot) return;

    const presentation = slotPresentationsRef.current[slot];
    if (!presentation || presentation.key !== pending.key) return;

    const video = getVideoForSlot(slot);
    try {
      void video?.play()?.catch?.(() => undefined);
    } catch {
      // Browser autoplay can race during hidden prebuffering; the driver retries after the swap.
    }

    const requestFrame =
      video && typeof (video as any).requestVideoFrameCallback === 'function' ? (cb: () => void) => (video as any).requestVideoFrameCallback(cb) : requestAnimationFrame;
    requestFrame(() => {
      if (pendingSwitchRef.current?.slot === slot && pendingSwitchRef.current.key === presentation.key) {
        switchToReadySlot(slot, presentation);
      }
    });
  };

  const handleCanPlay = (slot: VideoSlot): void => {
    handleSlotReady(slot);
    if (slot !== activeSlot || !activePresentation) return;
    driver.handleCanPlay(getVideoForSlot(slot));
  };

  const handleTimeUpdate = (slot: VideoSlot): void => {
    if (slot !== activeSlot || !activePresentation) return;
    driver.handleTimeUpdate({
      video: getVideoForSlot(slot),
      animId: activePresentation.animId,
      playId: activePresentation.playId,
      playback: activePlayback,
      fallbackIsPlaying: activeSegmentLoopActive ? true : spriteState !== 'idle'
    });
  };

  const handleEnded = (slot: VideoSlot): void => {
    if (slot !== activeSlot || !activePresentation) return;
    driver.handleEnded({
      video: getVideoForSlot(slot),
      animId: activePresentation.animId,
      playId: activePresentation.playId,
      playback: activePlayback
    });
  };

  const shouldFlip = walkDirection === 'right' && spriteState === 'walking';
  const activeComputed = activePresentation?.computed;

  const renderVideo = (slot: VideoSlot): JSX.Element => {
    const presentation = slotPresentations[slot];
    const slotComputed = presentation?.computed ?? activeComputed;
    const isActive = slot === activeSlot && !!activePresentation;
    const slotUsesNativeLoop =
      isActive && slotComputed && slotComputed.loop === true && slotComputed.loopCount == null && slotComputed.loopStartMs == null && slotComputed.loopEndMs == null;

    return (
      <video
        ref={slot === 'front' ? frontVideoRef : backVideoRef}
        data-sprite-video-slot={slot}
        data-active={isActive ? 'true' : 'false'}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: slotComputed?.width ?? activeComputed?.width ?? 180,
          height: slotComputed?.height ?? activeComputed?.height ?? 240,
          userSelect: 'none',
          opacity: isActive ? 1 : 0,
          pointerEvents: 'none',
          transition: 'opacity 60ms linear'
        }}
        autoPlay
        muted
        playsInline
        loop={slotUsesNativeLoop}
        onLoadedData={() => handleSlotReady(slot)}
        onCanPlay={() => handleCanPlay(slot)}
        onTimeUpdate={() => handleTimeUpdate(slot)}
        onEnded={() => handleEnded(slot)}
        src={presentation?.computed.srcUrl ?? ''}
        onError={(e) => {
          if (presentation?.computed.srcUrl) {
            console.warn('Sprite video failed to load', presentation.computed.srcUrl, e);
          }
        }}
      ></video>
    );
  };

  return activeComputed ? (
    <div
      style={{
        position: 'relative',
        width: activeComputed.width ?? 180,
        height: activeComputed.height ?? 240,
        userSelect: 'none',
        transform: shouldFlip ? 'scaleX(-1)' : 'none',
        transformOrigin: 'center center'
      }}
    >
      {renderVideo('front')}
      {renderVideo('back')}
    </div>
  ) : null;
}
