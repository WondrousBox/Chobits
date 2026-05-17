import type { SpriteManager } from '@packages/sprite-core/manager';

import {
  MUSIC_REACTIVITY_THRESHOLDS,
  type MusicReactivityAnalysisInput,
  type MusicReactivityCaptureSource,
  type MusicReactivityPreferences,
  type MusicReactivitySnapshot,
  type MusicReactivityState,
  normalizeMusicReactivityPreferences
} from './types';

export interface MusicReactivityServiceOptions {
  getSpriteManager: () => SpriteManager | null;
  preferences?: Partial<MusicReactivityPreferences>;
  onSnapshot?: (snapshot: MusicReactivitySnapshot) => void;
}

const LOG_PREFIX = '[MusicReactivity]';
const SIGNAL_LOG_INTERVAL_MS = 3000;
const FILTER_LOG_INTERVAL_MS = 3000;
const DISABLED_LOG_INTERVAL_MS = 5000;
const DANCE_TRIGGER_DURATION_MS = 8000;
const DANCE_RETRIGGER_GRACE_MS = 500;
const DANCE_IDLE_RETRIGGER_MIN_MS = 1200;
const MUSIC_DANCE_PLAY_ID_PREFIX = 'music-dance-';

export class MusicReactivityService {
  private readonly getSpriteManager: () => SpriteManager | null;
  private readonly onSnapshot?: (snapshot: MusicReactivitySnapshot) => void;
  private preferences: MusicReactivityPreferences;
  private state: MusicReactivityState = 'idle';
  private source: MusicReactivityCaptureSource | 'none' = 'none';
  private candidateSinceMs: number | null = null;
  private belowSinceMs: number | null = null;
  private cooldownUntilMs = 0;
  private lastTriggerAtMs = 0;
  private snapshot: MusicReactivitySnapshot;
  private lastSignalLogAtMs = 0;
  private lastFilteredLogAtMs = 0;
  private lastDisabledLogAtMs = 0;
  private lastDanceRefreshWaitingLogAtMs = 0;
  private lastDanceStartedPlayback = false;

  constructor(options: MusicReactivityServiceOptions) {
    this.getSpriteManager = options.getSpriteManager;
    this.onSnapshot = options.onSnapshot;
    this.preferences = normalizeMusicReactivityPreferences(options.preferences);
    this.snapshot = this.createSnapshot(Date.now(), {});
    this.log('service initialized', this.preferenceLogDetails());
  }

  getPreferences(): MusicReactivityPreferences {
    return { ...this.preferences };
  }

  updatePreferences(patch: Partial<MusicReactivityPreferences>): MusicReactivityPreferences {
    const previousPreferences = this.preferences;
    const previousSource = this.preferences.source;
    this.preferences = normalizeMusicReactivityPreferences({
      ...this.preferences,
      ...patch
    });
    this.log('preferences updated', {
      from: this.preferenceLogDetails(previousPreferences),
      to: this.preferenceLogDetails()
    });

    if (!this.preferences.enabled) {
      this.reset('disabled');
    } else if (previousSource !== this.preferences.source) {
      this.reset('source-updated');
    } else {
      this.emitSnapshot(this.createSnapshot(Date.now(), { reason: 'preferences-updated' }));
    }

    return this.getPreferences();
  }

  getSnapshot(): MusicReactivitySnapshot {
    return { ...this.snapshot };
  }

  ingestAnalysis(input: MusicReactivityAnalysisInput): MusicReactivitySnapshot {
    const now = this.resolveTimestamp(input.timestampMs);
    const previousState = this.state;

    if (!this.preferences.enabled) {
      if (now - this.lastDisabledLogAtMs >= DISABLED_LOG_INTERVAL_MS) {
        this.lastDisabledLogAtMs = now;
        this.log('analysis ignored: disabled', this.inputLogDetails(input));
      }
      return this.reset('disabled', input);
    }

    const incomingSource = input.source ?? this.source;
    if (!this.acceptsSource(incomingSource)) {
      const snapshot = this.emitSnapshot(this.createSnapshot(now, input, `source-filtered:${this.preferences.source}`));
      if (now - this.lastFilteredLogAtMs >= FILTER_LOG_INTERVAL_MS) {
        this.lastFilteredLogAtMs = now;
        this.log('analysis ignored: source filtered', {
          preferredSource: this.preferences.source,
          incomingSource,
          ...this.snapshotLogDetails(snapshot)
        });
      }
      return snapshot;
    }

    this.source = incomingSource;

    const thresholds = MUSIC_REACTIVITY_THRESHOLDS[this.preferences.sensitivity];
    const musicProbability = this.clamp01(input.musicProbability ?? 0);
    const energyDb = Number.isFinite(input.energyDb) ? input.energyDb! : -Infinity;
    const hasMusicSignal = musicProbability >= thresholds.enterProbability && energyDb >= thresholds.minEnergyDb;
    const hasExitSignal = musicProbability <= thresholds.exitProbability || energyDb < thresholds.minEnergyDb;

    if (now < this.cooldownUntilMs) {
      this.state = 'cooldown';
      this.candidateSinceMs = null;
      this.belowSinceMs = null;
      const snapshot = this.emitSnapshot(this.createSnapshot(now, input, 'cooldown'));
      this.logStateTransition(previousState, snapshot);
      this.logSignalSnapshot(now, snapshot, thresholds, hasMusicSignal, hasExitSignal);
      return snapshot;
    }

    if (this.state === 'dancing') {
      if (hasExitSignal) {
        this.belowSinceMs ??= now;
        if (now - this.belowSinceMs >= thresholds.exitMs) {
          this.state = 'cooldown';
          this.cooldownUntilMs = now + thresholds.cooldownMs;
          this.candidateSinceMs = null;
          this.belowSinceMs = null;
          this.triggerStop();
        }
      } else {
        this.belowSinceMs = null;
        this.maybeRetriggerDance(now, input, hasMusicSignal);
      }

      const snapshot = this.emitSnapshot(this.createSnapshot(now, input));
      this.logStateTransition(previousState, snapshot);
      this.logSignalSnapshot(now, snapshot, thresholds, hasMusicSignal, hasExitSignal);
      return snapshot;
    }

    if (hasMusicSignal) {
      this.candidateSinceMs ??= now;
      this.belowSinceMs = null;
      this.state = 'candidate';

      if (now - this.candidateSinceMs >= thresholds.enterMs) {
        this.state = 'dancing';
        this.candidateSinceMs = null;
        this.belowSinceMs = null;
        this.triggerDance(input, now);
      }
    } else if (this.state === 'candidate' && !hasExitSignal) {
      this.belowSinceMs = null;
      this.state = 'candidate';

      if (this.candidateSinceMs !== null && now - this.candidateSinceMs >= thresholds.enterMs) {
        this.state = 'dancing';
        this.candidateSinceMs = null;
        this.belowSinceMs = null;
        this.triggerDance(input, now);
      }
    } else {
      this.state = 'idle';
      this.candidateSinceMs = null;
      this.belowSinceMs = null;
    }

    const snapshot = this.emitSnapshot(this.createSnapshot(now, input));
    this.logStateTransition(previousState, snapshot);
    this.logSignalSnapshot(now, snapshot, thresholds, hasMusicSignal, hasExitSignal);
    return snapshot;
  }

  triggerDanceForTest(): MusicReactivitySnapshot {
    const now = Date.now();
    this.state = 'dancing';
    this.source = 'manual';
    const input: MusicReactivityAnalysisInput = {
      source: 'manual',
      timestampMs: now,
      energy: 0.8,
      energyDb: -18,
      onsetStrength: 0.8,
      musicProbability: 1,
      beatConfidence: 0.8,
      bpm: 120,
      beatTick: true,
      reason: 'manual-test'
    };
    this.triggerDance(input, now);
    const snapshot = this.emitSnapshot(this.createSnapshot(now, input, 'manual-test'));
    this.log('manual test snapshot emitted', this.snapshotLogDetails(snapshot));
    return snapshot;
  }

  reset(reason = 'reset', input: MusicReactivityAnalysisInput = {}): MusicReactivitySnapshot {
    const now = this.resolveTimestamp(input.timestampMs);
    const previousState = this.state;
    this.state = 'idle';
    this.source = input.source ?? 'none';
    this.candidateSinceMs = null;
    this.belowSinceMs = null;
    this.cooldownUntilMs = 0;
    this.lastDanceStartedPlayback = false;
    const snapshot = this.emitSnapshot(this.createSnapshot(now, input, reason));
    this.logStateTransition(previousState, snapshot);
    if (reason !== 'media-inactive' || previousState !== 'idle') {
      this.log('state reset', {
        reason,
        ...this.snapshotLogDetails(snapshot)
      });
    }
    return snapshot;
  }

  private maybeRetriggerDance(now: number, input: MusicReactivityAnalysisInput, hasMusicSignal: boolean): void {
    if (!hasMusicSignal) return;
    const manager = this.getSpriteManager();
    if (!manager) {
      this.log('dance refresh skipped: sprite manager unavailable', this.inputLogDetails(input));
      return;
    }

    const currentAnimation = manager.getCurrentAnimation();
    if (currentAnimation?.playId?.startsWith(MUSIC_DANCE_PLAY_ID_PREFIX)) {
      return;
    }

    const minRetriggerMs = this.lastDanceStartedPlayback ? DANCE_IDLE_RETRIGGER_MIN_MS : DANCE_TRIGGER_DURATION_MS + DANCE_RETRIGGER_GRACE_MS;
    if (now - this.lastTriggerAtMs < minRetriggerMs) return;

    if (!manager.isIdlePresentationActive()) {
      if (now - this.lastDanceRefreshWaitingLogAtMs >= SIGNAL_LOG_INTERVAL_MS) {
        this.lastDanceRefreshWaitingLogAtMs = now;
        this.log('dance refresh waiting for idle presentation', {
          currentAnimationId: currentAnimation?.animationId,
          currentTrigger: currentAnimation?.trigger,
          currentPlayId: currentAnimation?.playId,
          currentSessionMode: currentAnimation?.sessionMode,
          spriteState: manager.getState(),
          spriteSubState: manager.getSubState(),
          ...this.inputLogDetails(input)
        });
      }
      return;
    }

    this.log('dance refresh dispatched after idle presentation', {
      previousTriggerAgeMs: now - this.lastTriggerAtMs,
      ...this.inputLogDetails(input)
    });
    this.triggerDance(input, now);
  }

  private triggerDance(input: MusicReactivityAnalysisInput, timestampMs = Date.now()): void {
    const trigger = this.preferences.danceTrigger.trim();
    if (!trigger) {
      this.log('dance trigger skipped: empty trigger');
      return;
    }

    const manager = this.getSpriteManager();
    if (!manager) {
      this.log('dance trigger skipped: sprite manager unavailable', {
        trigger,
        ...this.inputLogDetails(input)
      });
      return;
    }

    const playId = `${MUSIC_DANCE_PLAY_ID_PREFIX}${Date.now()}`;
    manager.trigger(trigger, {
      silent: true,
      durationMs: DANCE_TRIGGER_DURATION_MS,
      playId,
      priority: 20,
      ctx: {
        music: {
          bpm: input.bpm,
          beatConfidence: input.beatConfidence,
          energy: input.energy,
          energyDb: input.energyDb,
          musicProbability: input.musicProbability,
          onsetStrength: input.onsetStrength
        }
      }
    });
    const currentAnimation = manager.getCurrentAnimation();
    this.lastDanceStartedPlayback = currentAnimation?.playId === playId;
    this.lastTriggerAtMs = timestampMs;
    this.log('dance trigger dispatched', {
      trigger,
      playId,
      playbackAccepted: this.lastDanceStartedPlayback,
      ...this.inputLogDetails(input)
    });
  }

  private triggerStop(): void {
    const trigger = this.preferences.stopTrigger?.trim();
    if (!trigger) {
      this.log('stop trigger skipped: empty trigger');
      return;
    }

    const manager = this.getSpriteManager();
    if (!manager) {
      this.log('stop trigger skipped: sprite manager unavailable', { trigger });
      return;
    }

    manager.trigger(trigger, {
      silent: true,
      durationMs: 1800,
      priority: 10
    });
    this.log('stop trigger dispatched', { trigger });
  }

  private createSnapshot(timestampMs: number, input: MusicReactivityAnalysisInput, reason = input.reason): MusicReactivitySnapshot {
    return {
      running: this.preferences.enabled,
      source: input.source ?? this.source,
      timestampMs,
      energy: this.clamp01(input.energy ?? 0),
      energyDb: Number.isFinite(input.energyDb) ? input.energyDb! : -Infinity,
      onsetStrength: this.clamp01(input.onsetStrength ?? 0),
      musicProbability: this.clamp01(input.musicProbability ?? 0),
      speechProbability: input.speechProbability === undefined ? undefined : this.clamp01(input.speechProbability),
      beatConfidence: input.beatConfidence === undefined ? undefined : this.clamp01(input.beatConfidence),
      bpm: Number.isFinite(input.bpm) ? input.bpm : undefined,
      beatTick: input.beatTick,
      state: this.state,
      reason
    };
  }

  private emitSnapshot(snapshot: MusicReactivitySnapshot): MusicReactivitySnapshot {
    this.snapshot = snapshot;
    this.onSnapshot?.(this.getSnapshot());
    return this.getSnapshot();
  }

  private resolveTimestamp(timestampMs?: number): number {
    return Number.isFinite(timestampMs) && timestampMs! > 0 ? timestampMs! : Date.now();
  }

  private acceptsSource(source: MusicReactivityCaptureSource | 'none'): boolean {
    if (source === 'none') return false;
    if (this.preferences.source === source) return true;
    if (this.preferences.source !== 'auto') return false;

    return source === 'manual' || source === 'app-media' || source === 'system-loopback';
  }

  private logSignalSnapshot(
    now: number,
    snapshot: MusicReactivitySnapshot,
    thresholds: (typeof MUSIC_REACTIVITY_THRESHOLDS)[MusicReactivityPreferences['sensitivity']],
    hasMusicSignal: boolean,
    hasExitSignal: boolean
  ): void {
    if (now - this.lastSignalLogAtMs < SIGNAL_LOG_INTERVAL_MS) return;
    this.lastSignalLogAtMs = now;
    this.log('analysis snapshot', {
      ...this.snapshotLogDetails(snapshot),
      enterProbability: thresholds.enterProbability,
      exitProbability: thresholds.exitProbability,
      minEnergyDb: thresholds.minEnergyDb,
      hasMusicSignal,
      hasExitSignal
    });
  }

  private logStateTransition(previousState: MusicReactivityState, snapshot: MusicReactivitySnapshot): void {
    if (previousState === snapshot.state) return;
    this.log('state changed', {
      from: previousState,
      to: snapshot.state,
      ...this.snapshotLogDetails(snapshot)
    });
  }

  private preferenceLogDetails(preferences: MusicReactivityPreferences = this.preferences): Record<string, unknown> {
    return {
      enabled: preferences.enabled,
      source: preferences.source,
      sensitivity: preferences.sensitivity,
      danceTrigger: preferences.danceTrigger,
      stopTrigger: preferences.stopTrigger
    };
  }

  private inputLogDetails(input: MusicReactivityAnalysisInput): Record<string, unknown> {
    return {
      source: input.source,
      energyDb: this.round(input.energyDb),
      musicProbability: this.round(input.musicProbability),
      onsetStrength: this.round(input.onsetStrength),
      bpm: this.round(input.bpm),
      reason: input.reason
    };
  }

  private snapshotLogDetails(snapshot: MusicReactivitySnapshot): Record<string, unknown> {
    return {
      running: snapshot.running,
      state: snapshot.state,
      source: snapshot.source,
      energyDb: this.round(snapshot.energyDb),
      musicProbability: this.round(snapshot.musicProbability),
      onsetStrength: this.round(snapshot.onsetStrength),
      bpm: this.round(snapshot.bpm),
      reason: snapshot.reason
    };
  }

  private round(value?: number): number | string {
    if (!Number.isFinite(value)) return '-';
    return Math.round(value! * 1000) / 1000;
  }

  private log(message: string, details?: Record<string, unknown>): void {
    if (typeof process !== 'undefined' && process.env.VITEST) return;
    console.info(LOG_PREFIX, message, details ?? {});
  }

  private clamp01(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, Math.min(1, value));
  }
}
