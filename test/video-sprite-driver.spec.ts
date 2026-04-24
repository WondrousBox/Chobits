import { afterEach, describe, expect, it, vi } from 'vitest';

import { VideoSpriteDriver, type VideoSpriteElementLike } from '../src/features/sprite-assistant/renderers/video-sprite-driver';

function createVideo(overrides?: Partial<VideoSpriteElementLike> & { duration?: number; currentTime?: number }): VideoSpriteElementLike & {
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
} {
  return {
    currentTime: overrides?.currentTime ?? 0,
    duration: overrides?.duration ?? 1.5,
    play: vi.fn(),
    pause: vi.fn(),
    ...overrides
  };
}

describe('video sprite driver', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('replays the current video when canplay fires', () => {
    const video = createVideo();
    const driver = new VideoSpriteDriver();

    driver.handleCanPlay(video);

    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it('expires a timed segmented session into outro after loop becomes active', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-21T12:00:00.000Z'));

    const video = createVideo({ duration: 1.5 });
    const driver = new VideoSpriteDriver();
    const playback = {
      loop: true,
      loopStartMs: 300,
      loopEndMs: 900
    };
    const playbackSession = {
      mode: 'timed' as const,
      startedAtMs: Date.now(),
      activeDurationMs: 800
    };

    driver.resetForAnimation({
      video,
      animId: 'thinking',
      hasSegmentLoop: true,
      playbackSession
    });
    driver.syncPlaybackSession({
      video,
      hasSegmentLoop: true,
      playback,
      playbackSession
    });

    video.currentTime = 0.32;
    driver.handleTimeUpdate({
      video,
      animId: 'thinking',
      playback,
      fallbackIsPlaying: true
    });

    expect(driver.getPhase()).toBe('loop');

    vi.advanceTimersByTime(800);

    expect(driver.getSessionActive()).toBe(false);
    expect(driver.getPhase()).toBe('outro');
    expect(video.currentTime).toBeCloseTo(0.9);
    expect(video.play).toHaveBeenCalled();
  });

  it('loops bounded playback back to the effective start when custom loop is enabled', () => {
    const video = createVideo({ duration: 1.2, currentTime: 0.91 });
    const driver = new VideoSpriteDriver();

    driver.handleTimeUpdate({
      video,
      animId: 'loading-loop',
      playback: {
        loop: true,
        loopEndMs: 900
      },
      fallbackIsPlaying: true
    });

    expect(video.currentTime).toBeCloseTo(0);
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(video.pause).not.toHaveBeenCalled();
  });

  it('reports full completion for bounded non-loop playback and on ended', () => {
    const onAnimationComplete = vi.fn();
    const video = createVideo({ duration: 1.2, currentTime: 0.91 });
    const driver = new VideoSpriteDriver({ onAnimationComplete });

    driver.handleTimeUpdate({
      video,
      animId: 'success-once',
      playback: {
        loop: false,
        loopEndMs: 900
      },
      fallbackIsPlaying: true
    });

    expect(video.pause).toHaveBeenCalledTimes(1);
    expect(onAnimationComplete).toHaveBeenCalledWith('success-once', 'full');

    onAnimationComplete.mockClear();
    driver.handleEnded({
      animId: 'success-ended',
      playback: { loop: false }
    });
    driver.handleEnded({
      animId: 'skip-looping',
      playback: { loop: true }
    });

    expect(onAnimationComplete).toHaveBeenCalledTimes(1);
    expect(onAnimationComplete).toHaveBeenCalledWith('success-ended', 'full');
  });
});
