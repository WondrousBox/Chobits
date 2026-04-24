import { describe, expect, it } from 'vitest';

import { isTimedPlaybackActive, resolveSegmentPlaybackStep } from '../src/features/sprite-assistant/renderers/video-playback';

describe('video playback helpers', () => {
  it('computes timed playback activity from playback session', () => {
    expect(isTimedPlaybackActive(undefined, 1000)).toBeNull();
    expect(
      isTimedPlaybackActive(
        {
          startedAtMs: 1000,
          activeDurationMs: 800
        },
        1500
      )
    ).toBe(true);
    expect(
      isTimedPlaybackActive(
        {
          startedAtMs: 1000,
          activeDurationMs: 800
        },
        1800
      )
    ).toBe(false);
  });

  it('keeps segmented playback in loop when still active', () => {
    expect(
      resolveSegmentPlaybackStep({
        phase: 'intro',
        currentTimeMs: 320,
        durationMs: 1500,
        loopStartMs: 300,
        loopEndMs: 900,
        isPlaying: true,
        shouldLoop: true
      })
    ).toEqual({
      nextPhase: 'loop'
    });
  });

  it('jumps from intro to outro once timed playback is no longer active', () => {
    expect(
      resolveSegmentPlaybackStep({
        phase: 'intro',
        currentTimeMs: 320,
        durationMs: 1500,
        loopStartMs: 300,
        loopEndMs: 900,
        isPlaying: false,
        shouldLoop: true
      })
    ).toEqual({
      nextPhase: 'outro',
      seekToMs: 900,
      shouldPlay: true
    });
  });

  it('reports completion when outro reaches the end', () => {
    expect(
      resolveSegmentPlaybackStep({
        phase: 'outro',
        currentTimeMs: 1460,
        durationMs: 1500,
        loopStartMs: 300,
        loopEndMs: 900,
        isPlaying: false,
        shouldLoop: true
      })
    ).toEqual({
      nextPhase: 'idle',
      shouldPause: true,
      completePhase: 'outro'
    });
  });
});
