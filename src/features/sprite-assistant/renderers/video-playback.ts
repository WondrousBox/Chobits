export type AnimationPhase = 'intro' | 'loop' | 'outro' | 'idle';

export interface SegmentPlaybackDecision {
  nextPhase?: AnimationPhase;
  seekToMs?: number;
  shouldPause?: boolean;
  shouldPlay?: boolean;
  completePhase?: 'outro' | 'full';
}

export function resolveSegmentPlaybackStep(input: {
  phase: AnimationPhase;
  currentTimeMs: number;
  durationMs: number;
  loopStartMs: number;
  loopEndMs: number;
  isPlaying: boolean;
  shouldLoop: boolean;
}): SegmentPlaybackDecision | null {
  const { phase, currentTimeMs, durationMs, loopStartMs, loopEndMs, isPlaying, shouldLoop } = input;

  if (phase === 'intro' && currentTimeMs >= loopStartMs) {
    if (isPlaying) {
      return { nextPhase: 'loop' };
    }

    return {
      nextPhase: 'outro',
      seekToMs: loopEndMs,
      shouldPlay: true
    };
  }

  if (phase === 'loop' && currentTimeMs >= loopEndMs - 50) {
    if (shouldLoop && isPlaying) {
      return {
        nextPhase: 'loop',
        seekToMs: loopStartMs,
        shouldPlay: true
      };
    }

    return {
      nextPhase: 'outro',
      seekToMs: loopEndMs,
      shouldPlay: true
    };
  }

  if (phase === 'outro' && currentTimeMs >= durationMs - 50) {
    if (shouldLoop && isPlaying) {
      return {
        nextPhase: 'idle',
        seekToMs: 0,
        shouldPlay: true
      };
    }

    return {
      nextPhase: 'idle',
      shouldPause: true,
      completePhase: 'outro'
    };
  }

  if (phase === 'idle' && shouldLoop && isPlaying && currentTimeMs >= loopStartMs - 50) {
    return {
      seekToMs: 0,
      shouldPlay: true
    };
  }

  return null;
}

export function isTimedPlaybackActive(session: { startedAtMs: number; activeDurationMs: number } | undefined, now = Date.now()): boolean | null {
  if (!session) return null;
  return now - session.startedAtMs < session.activeDurationMs;
}
