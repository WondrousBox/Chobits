import type { SpritePlayCommand } from '@packages/sprite-core/types';

import { type AnimationPhase, isTimedPlaybackActive, resolveSegmentPlaybackStep } from './video-playback';

type SpritePlayback = SpritePlayCommand['playback'];
type SpritePlaybackSession = SpritePlayCommand['playbackSession'];

export interface VideoSpriteElementLike {
  currentTime: number;
  duration: number;
  play(): void | Promise<void>;
  pause(): void;
}

function hasCatchHandler(value: unknown): value is Promise<void> {
  return !!value && typeof (value as Promise<void>).catch === 'function';
}

export interface VideoSpriteDriverOptions {
  now?: () => number;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
  onAnimationComplete?: (animId: string, phase: 'outro' | 'full', playId?: string) => void;
}

export class VideoSpriteDriver {
  private phase: AnimationPhase = 'idle';
  private prevAnimId: string | null = null;
  private prevIsPlaying = false;
  private sessionActive: boolean | null = null;
  private sessionTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
  private completedLoopCount = 0;
  private readonly now: () => number;
  private readonly scheduleTimeout: typeof globalThis.setTimeout;
  private readonly cancelTimeout: typeof globalThis.clearTimeout;
  private readonly onAnimationComplete?: VideoSpriteDriverOptions['onAnimationComplete'];

  constructor(options: VideoSpriteDriverOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.scheduleTimeout = options.setTimeout ?? globalThis.setTimeout.bind(globalThis);
    this.cancelTimeout = options.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);
    this.onAnimationComplete = options.onAnimationComplete;
  }

  getPhase(): AnimationPhase {
    return this.phase;
  }

  getSessionActive(): boolean | null {
    return this.sessionActive;
  }

  clearPlaybackSessionTimer(): void {
    if (this.sessionTimer != null) {
      this.cancelTimeout(this.sessionTimer);
      this.sessionTimer = null;
    }
  }

  dispose(): void {
    this.clearPlaybackSessionTimer();
  }

  syncPlaybackSession(input: { video: VideoSpriteElementLike | null; hasSegmentLoop: boolean; playback?: SpritePlayback; playbackSession?: SpritePlaybackSession }): void {
    this.clearPlaybackSessionTimer();

    if (input.playbackSession?.mode !== 'timed') {
      this.sessionActive = null;
      return;
    }

    const active = isTimedPlaybackActive(input.playbackSession, this.now());
    this.sessionActive = active;
    if (!active) return;

    const remainingMs = Math.max(0, input.playbackSession.activeDurationMs - (this.now() - input.playbackSession.startedAtMs));
    this.sessionTimer = this.scheduleTimeout(() => {
      this.sessionActive = false;
      const video = input.video;
      if (!video || !input.hasSegmentLoop || this.phase !== 'loop') return;
      const loopEndSec = (input.playback?.loopEndMs ?? video.duration * 1000) / 1000;
      video.currentTime = loopEndSec;
      this.requestPlay(video);
      this.phase = 'outro';
    }, remainingMs);
  }

  resetForAnimation(input: { video: VideoSpriteElementLike | null; animId: string | null; hasSegmentLoop: boolean; playbackSession?: SpritePlaybackSession }): void {
    const video = input.video;
    if (!video) return;
    if (this.prevAnimId === input.animId) return;

    this.prevAnimId = input.animId;
    this.completedLoopCount = 0;
    this.sessionActive = input.playbackSession?.mode === 'timed' ? isTimedPlaybackActive(input.playbackSession, this.now()) : null;
    this.phase = input.hasSegmentLoop ? 'intro' : 'idle';
    video.currentTime = 0;
    this.requestPlay(video);
  }

  syncPlayingState(input: { video: VideoSpriteElementLike | null; isPlaying: boolean; hasSegmentLoop: boolean; playback?: SpritePlayback }): void {
    const wasPlaying = this.prevIsPlaying;
    this.prevIsPlaying = input.isPlaying;

    const video = input.video;
    if (!video || !input.hasSegmentLoop) return;

    if (input.isPlaying && !wasPlaying) {
      video.currentTime = 0;
      this.requestPlay(video);
      this.phase = 'intro';
      return;
    }

    if (!input.isPlaying && wasPlaying && this.phase === 'loop') {
      const loopEndSec = (input.playback?.loopEndMs ?? video.duration * 1000) / 1000;
      video.currentTime = loopEndSec;
      this.requestPlay(video);
      this.phase = 'outro';
    }
  }

  handleCanPlay(video: VideoSpriteElementLike | null): void {
    this.requestPlay(video);
  }

  handleTimeUpdate(input: { video: VideoSpriteElementLike | null; animId: string | null; playId?: string | null; playback?: SpritePlayback; fallbackIsPlaying: boolean }): void {
    const video = input.video;
    if (!video) return;

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;

    const loopStartMs = input.playback?.loopStartMs;
    const loopEndMs = input.playback?.loopEndMs;
    const currentTimeMs = video.currentTime * 1000;
    const durationMs = duration * 1000;

    const effectiveStart = loopStartMs ?? 0;
    const effectiveEnd = loopEndMs ?? durationMs;
    const hasSegmentLoop = loopStartMs != null && loopEndMs != null;
    const hasCustomLoop = loopStartMs != null || loopEndMs != null;
    const activePlayback = this.sessionActive ?? input.fallbackIsPlaying;
    const finiteLoopCount = this.getFiniteLoopCount(input.playback);
    const shouldLoop = finiteLoopCount != null ? true : hasSegmentLoop ? true : hasCustomLoop ? input.playback?.loop !== false : (input.playback?.loop ?? false);

    if (loopStartMs != null && loopEndMs != null) {
      const shouldExitFiniteSegmentLoop = this.phase === 'loop' && currentTimeMs >= loopEndMs - 50 && finiteLoopCount != null && this.completedLoopCount + 1 >= finiteLoopCount;
      const shouldContinueSegmentLoop = finiteLoopCount != null && this.completedLoopCount >= finiteLoopCount ? false : shouldExitFiniteSegmentLoop ? false : shouldLoop;
      const decision = resolveSegmentPlaybackStep({
        phase: this.phase,
        currentTimeMs,
        durationMs,
        loopStartMs,
        loopEndMs,
        isPlaying: activePlayback,
        shouldLoop: shouldContinueSegmentLoop
      });

      if (!decision) return;

      if (decision.nextPhase) {
        this.phase = decision.nextPhase;
      }
      if (shouldExitFiniteSegmentLoop && decision.nextPhase === 'outro') {
        this.completedLoopCount += 1;
      }
      if (this.phase === 'loop' && decision.seekToMs === loopStartMs) {
        this.completedLoopCount += 1;
      }
      if (decision.seekToMs != null) {
        video.currentTime = decision.seekToMs / 1000;
      }
      if (decision.shouldPause) {
        video.pause();
      }
      if (decision.shouldPlay) {
        this.requestPlay(video);
      }
      if (decision.completePhase && input.animId) {
        this.notifyAnimationComplete(input.animId, decision.completePhase, input.playId);
      }
      return;
    }

    if (!hasCustomLoop) {
      if (currentTimeMs < durationMs - 50) return;

      if (shouldLoop) {
        if (finiteLoopCount == null) return;

        this.completedLoopCount += 1;
        if (this.completedLoopCount < finiteLoopCount) {
          video.currentTime = 0;
          this.requestPlay(video);
          return;
        }
      }

      video.pause();
      if (input.animId) {
        this.notifyAnimationComplete(input.animId, 'full', input.playId);
      }
      return;
    }

    if (currentTimeMs >= effectiveEnd - 50) {
      if (shouldLoop) {
        this.completedLoopCount += 1;
        if (finiteLoopCount != null && this.completedLoopCount >= finiteLoopCount) {
          video.pause();
          if (input.animId) {
            this.notifyAnimationComplete(input.animId, 'full', input.playId);
          }
          return;
        }
        video.currentTime = effectiveStart / 1000;
        this.requestPlay(video);
        return;
      }

      video.pause();
      if (input.animId) {
        this.notifyAnimationComplete(input.animId, 'full', input.playId);
      }
    }
  }

  handleEnded(input: { video?: VideoSpriteElementLike | null; animId: string | null; playId?: string | null; playback?: SpritePlayback }): void {
    const hasSegmentLoop = input.playback?.loopStartMs != null && input.playback?.loopEndMs != null;
    const hasCustomLoop = input.playback?.loopStartMs != null || input.playback?.loopEndMs != null;
    const finiteLoopCount = this.getFiniteLoopCount(input.playback);
    const shouldLoop = finiteLoopCount != null ? true : hasSegmentLoop ? true : hasCustomLoop ? input.playback?.loop !== false : (input.playback?.loop ?? false);
    if (!input.animId) return;
    if (shouldLoop) {
      if (finiteLoopCount == null) return;
      this.completedLoopCount += 1;
      if (this.completedLoopCount < finiteLoopCount) {
        const video = input.video;
        if (video) {
          video.currentTime = (input.playback?.loopStartMs ?? 0) / 1000;
          this.requestPlay(video);
        }
        return;
      }
    }
    this.notifyAnimationComplete(input.animId, 'full', input.playId);
  }

  private getFiniteLoopCount(playback?: SpritePlayback): number | undefined {
    const loopCount = playback?.loopCount;
    if (typeof loopCount !== 'number' || !Number.isFinite(loopCount)) return undefined;
    const normalized = Math.floor(loopCount);
    return normalized > 0 ? normalized : undefined;
  }

  private notifyAnimationComplete(animId: string, phase: 'outro' | 'full', playId?: string | null): void {
    if (playId) {
      this.onAnimationComplete?.(animId, phase, playId);
      return;
    }
    this.onAnimationComplete?.(animId, phase);
  }

  private requestPlay(video: VideoSpriteElementLike | null): void {
    if (!video) return;
    try {
      const result = video.play();
      if (hasCatchHandler(result)) {
        void result.catch(() => {
          // Browser may reject play() when silent background video is paused to save power.
        });
      }
    } catch {
      // Treat synchronous play() failures the same as rejected play promises.
    }
  }
}
