import type { SpritePlayCommand } from '@packages/sprite-core/types';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

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
  trigger: SpritePlayCommand['trigger'];
  sessionMode: SpritePlayCommand['sessionMode'];
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

function isVideoReadyForPresentation(video: HTMLVideoElement | null, presentation: VideoPresentation): boolean {
  if (!video) return false;
  const readyState = Number(video.readyState);
  if (!Number.isFinite(readyState) || readyState < 2) return false;

  const expectedSrc = presentation.computed.srcUrl;
  const attrSrc = video.getAttribute('src') ?? '';
  const currentSrc = video.currentSrc || video.src || '';
  return attrSrc === expectedSrc || currentSrc === expectedSrc;
}

export default function VideoSprite({ walkDirection, onFirstFrame }: { walkDirection?: 'left' | 'right' | null; onFirstFrame?: () => void }): JSX.Element | null {
  const frontVideoRef = useRef<HTMLVideoElement | null>(null);
  const backVideoRef = useRef<HTMLVideoElement | null>(null);
  const { currentAnimation, spriteState } = useSpriteState();
  const [activeSlot, setActiveSlot] = useState<VideoSlot>('front');
  const activeSlotRef = useRef<VideoSlot>('front');
  const [slotPresentations, setSlotPresentations] = useState<Record<VideoSlot, VideoPresentation | null>>({ front: null, back: null });
  const slotPresentationsRef = useRef<Record<VideoSlot, VideoPresentation | null>>({ front: null, back: null });
  const [activePresentation, setActivePresentation] = useState<VideoPresentation | null>(null);
  const pendingSwitchRef = useRef<{ slot: VideoSlot; key: string } | null>(null);
  const firstFrameReportedRef = useRef(false);
  const onFirstFrameRef = useRef(onFirstFrame);
  const [driver] = useState(
    () =>
      new VideoSpriteDriver({
        onAnimationComplete: (animationId, phase, playId) => {
          console.info('[SpriteVideo] animation complete -> ipc', { animationId, phase, playId });
          if (playId) {
            window.YUA.sprite.animComplete(animationId, phase, playId);
            return;
          }
          window.YUA.sprite.animComplete(animationId, phase);
        }
      })
  );

  useEffect(() => {
    onFirstFrameRef.current = onFirstFrame;
  }, [onFirstFrame]);

  const reportFirstFrame = useCallback((): void => {
    if (firstFrameReportedRef.current) return;
    firstFrameReportedRef.current = true;
    onFirstFrameRef.current?.();
  }, []);

  const desiredPresentation = useMemo<VideoPresentation | null>(() => {
    const source = currentAnimation?.source;
    if (!source) return null;

    const playback = currentAnimation?.playback;
    const { url, type } = resolveSpriteSrc(source as any);
    return {
      key: [currentAnimation?.animationId ?? '', currentAnimation?.playId ?? '', url].join('|'),
      animId: currentAnimation?.animationId ?? null,
      playId: currentAnimation?.playId ?? null,
      trigger: currentAnimation?.trigger,
      sessionMode: currentAnimation?.sessionMode,
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
    console.info('[SpriteVideo] queue slot switch', {
      from: activeSlot,
      to: nextSlot,
      currentAnimationId: activePresentation.animId,
      nextAnimationId: desiredPresentation.animId,
      nextPlayId: desiredPresentation.playId,
      src: desiredPresentation.computed.srcUrl
    });
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
  const activeIsIdleSegmentLoop = activeHasSegmentLoop && activePresentation?.sessionMode === 'state-bound' && activePresentation?.trigger === 'idle';
  const activeTimedSessionActive = activePlaybackSession?.mode === 'timed' ? isTimedPlaybackActive(activePlaybackSession) : null;
  const activeIsPlaying = activeTimedSessionActive ?? (activeIsIdleSegmentLoop || spriteState !== 'idle');

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
    console.info('[SpriteVideo] switch to ready slot', {
      from: previousSlot,
      to: slot,
      animationId: presentation.animId,
      playId: presentation.playId,
      src: presentation.computed.srcUrl
    });
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
    console.info('[SpriteVideo] slot ready', {
      slot,
      animationId: presentation.animId,
      playId: presentation.playId,
      readyState: video?.readyState,
      src: presentation.computed.srcUrl
    });
    try {
      void video?.play()?.catch?.(() => undefined);
    } catch {
      // Browser autoplay can race during hidden prebuffering; the driver retries after the swap.
    }

    let switched = false;
    const completeSwitch = (): void => {
      if (switched) return;
      switched = true;
      if (pendingSwitchRef.current?.slot === slot && pendingSwitchRef.current.key === presentation.key) {
        switchToReadySlot(slot, presentation);
      }
    };

    if (video && typeof (video as any).requestVideoFrameCallback === 'function') {
      try {
        (video as any).requestVideoFrameCallback(completeSwitch);
      } catch {
        // Fall through to the animation-frame fallback below.
      }
    }
    requestAnimationFrame(completeSwitch);
  };

  useLayoutEffect(() => {
    const pending = pendingSwitchRef.current;
    if (!pending) return;

    const presentation = slotPresentations[pending.slot];
    if (!presentation || presentation.key !== pending.key) return;

    const video = getVideoForSlot(pending.slot);
    if (!isVideoReadyForPresentation(video, presentation)) return;

    console.info('[SpriteVideo] pending slot already has current data', {
      slot: pending.slot,
      animationId: presentation.animId,
      playId: presentation.playId,
      readyState: video?.readyState,
      src: presentation.computed.srcUrl
    });
    switchToReadySlot(pending.slot, presentation);
  }, [slotPresentations]);

  const handleCanPlay = (slot: VideoSlot): void => {
    handleSlotReady(slot);
    if (slot !== activeSlot || !activePresentation) return;
    if (isVideoReadyForPresentation(getVideoForSlot(slot), activePresentation)) {
      reportFirstFrame();
    }
    driver.handleCanPlay(getVideoForSlot(slot));
  };

  const handleLoadedData = (slot: VideoSlot): void => {
    handleSlotReady(slot);
    if (slot !== activeSlot || !activePresentation) return;
    if (isVideoReadyForPresentation(getVideoForSlot(slot), activePresentation)) {
      reportFirstFrame();
    }
  };

  const handleTimeUpdate = (slot: VideoSlot): void => {
    if (slot !== activeSlot || !activePresentation) return;
    driver.handleTimeUpdate({
      video: getVideoForSlot(slot),
      animId: activePresentation.animId,
      playId: activePresentation.playId,
      playback: activePlayback,
      fallbackIsPlaying: activeIsPlaying
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
    const slotUsesNativeLoop = isActive && slotComputed && slotComputed.loop === true && slotComputed.loopCount == null && slotComputed.loopStartMs == null && slotComputed.loopEndMs == null;

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
        onLoadedData={() => handleLoadedData(slot)}
        onCanPlay={() => handleCanPlay(slot)}
        onTimeUpdate={() => handleTimeUpdate(slot)}
        onEnded={() => handleEnded(slot)}
        src={presentation?.computed.srcUrl ?? ''}
        onError={(e) => {
          if (presentation?.computed.srcUrl) {
            console.warn('[SpriteVideo] failed to load', presentation.computed.srcUrl, e);
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
