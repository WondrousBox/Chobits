import { estimateMediaMusicFeatures } from '@packages/audio-reactivity/analysis/media-feature-estimator';
import { type RefObject, useEffect, useRef } from 'react';

type MediaElement = HTMLAudioElement | HTMLVideoElement;

interface AnalyzerState {
  media: MediaElement;
  audioContext: AudioContext;
  analyser: AnalyserNode;
  source: MediaElementAudioSourceNode;
  timeData: Uint8Array;
  frequencyData: Uint8Array;
  previousFrequencyData: Uint8Array;
  lastSentAt: number;
  disposed: boolean;
  refCount: number;
  releaseTimerId: number | null;
  debugId: number;
  lastFeatureLogAt: number;
  sentCount: number;
}

const FFT_SIZE = 2048;
const SEND_INTERVAL_MS = 500;
const ANALYZER_RELEASE_DELAY_MS = 3000;
const FEATURE_LOG_INTERVAL_MS = 3000;
const LOG_PREFIX = '[MusicReactivity][MediaPlayer]';
const analyzerByMedia = new WeakMap<MediaElement, AnalyzerState>();
let nextAnalyzerDebugId = 1;

function getAudioContextConstructor(): typeof AudioContext | undefined {
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

function computeFeatures(state: AnalyzerState): {
  energy: number;
  energyDb: number;
  onsetStrength: number;
  musicProbability: number;
} {
  state.analyser.getByteTimeDomainData(state.timeData as Uint8Array<ArrayBuffer>);
  state.analyser.getByteFrequencyData(state.frequencyData as Uint8Array<ArrayBuffer>);

  const features = estimateMediaMusicFeatures({
    timeData: state.timeData,
    frequencyData: state.frequencyData,
    previousFrequencyData: state.previousFrequencyData
  });
  state.previousFrequencyData.set(state.frequencyData);

  return {
    energy: features.energy,
    energyDb: features.energyDb,
    onsetStrength: features.onsetStrength,
    musicProbability: features.musicProbability
  };
}

function disposeAnalyzer(state: AnalyzerState): void {
  state.disposed = true;
  analyzerByMedia.delete(state.media);
  state.source.disconnect();
  state.analyser.disconnect();
  void state.audioContext.close();
  logAnalyzer('disposed analyzer', state);
}

function acquireAnalyzer(media: MediaElement): AnalyzerState | null {
  const existing = analyzerByMedia.get(media);
  if (existing && !existing.disposed) {
    existing.refCount += 1;
    if (existing.releaseTimerId !== null) {
      window.clearTimeout(existing.releaseTimerId);
      existing.releaseTimerId = null;
    }
    logAnalyzer('reused analyzer', existing);
    return existing;
  }

  const AudioContextCtor = getAudioContextConstructor();
  if (!AudioContextCtor) {
    console.info(LOG_PREFIX, 'Web Audio API unavailable');
    return null;
  }

  try {
    const audioContext = new AudioContextCtor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0.72;

    const source = audioContext.createMediaElementSource(media);
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    const state: AnalyzerState = {
      media,
      audioContext,
      analyser,
      source,
      timeData: new Uint8Array(analyser.fftSize),
      frequencyData: new Uint8Array(analyser.frequencyBinCount),
      previousFrequencyData: new Uint8Array(analyser.frequencyBinCount),
      lastSentAt: 0,
      disposed: false,
      refCount: 1,
      releaseTimerId: null,
      debugId: nextAnalyzerDebugId,
      lastFeatureLogAt: 0,
      sentCount: 0
    };
    nextAnalyzerDebugId += 1;
    analyzerByMedia.set(media, state);
    logAnalyzer('created analyzer', state);
    return state;
  } catch (error) {
    console.warn('[MediaPlayer] music reactivity analyzer setup failed:', error);
    return null;
  }
}

function releaseAnalyzer(state: AnalyzerState): void {
  state.refCount = Math.max(0, state.refCount - 1);
  if (state.refCount > 0 || state.releaseTimerId !== null) return;

  state.releaseTimerId = window.setTimeout(() => {
    state.releaseTimerId = null;
    if (state.refCount > 0 || state.disposed) return;
    disposeAnalyzer(state);
    void window.YUA.musicReactivity.reset('media-analyzer-disposed');
  }, ANALYZER_RELEASE_DELAY_MS);
}

export function useMusicReactivityAnalyzer(mediaRef: RefObject<MediaElement | null>, active: boolean, mediaKind: 'audio' | 'video'): void {
  const stateRef = useRef<AnalyzerState | null>(null);
  const activeRef = useRef(active);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    activeRef.current = active;
    console.info(LOG_PREFIX, 'active changed', { active, mediaKind });
    if (!active) {
      void window.YUA.musicReactivity.reset('media-inactive');
    }
  }, [active, mediaKind]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (stateRef.current) {
        releaseAnalyzer(stateRef.current);
        stateRef.current = null;
      }
      void window.YUA.musicReactivity.reset('media-analyzer-disposed');
    };
  }, []);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) {
      console.info(LOG_PREFIX, 'media element not ready', { mediaKind });
      return;
    }
    if (stateRef.current?.media === media) {
      logAnalyzer('already attached to media element', stateRef.current);
      return;
    }

    if (stateRef.current) {
      releaseAnalyzer(stateRef.current);
    }
    stateRef.current = null;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const state = acquireAnalyzer(media);
    if (!state) return;
    stateRef.current = state;
    logAnalyzer('attached analyzer loop', state, { mediaKind });

    const tick = (): void => {
      if (state.disposed) return;
      const now = Date.now();
      if (activeRef.current && !media.paused && !media.ended && now - state.lastSentAt >= SEND_INTERVAL_MS) {
        state.lastSentAt = now;
        if (state.audioContext.state === 'suspended') {
          void state.audioContext.resume().catch(() => undefined);
        }
        const features = computeFeatures(state);
        state.sentCount += 1;
        logFeatureSnapshot(state, now, features);
        void window.YUA.musicReactivity.ingestAnalysis({
          source: 'app-media',
          timestampMs: now,
          ...features
        });
      }
      timerRef.current = window.setTimeout(tick, 100);
    };

    tick();

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (stateRef.current?.media === media) {
        releaseAnalyzer(stateRef.current);
        stateRef.current = null;
        void window.YUA.musicReactivity.reset('media-analyzer-disposed');
      }
    };
  }, [mediaKind, mediaRef]);
}

function logAnalyzer(message: string, state: AnalyzerState, details: Record<string, unknown> = {}): void {
  console.info(LOG_PREFIX, message, {
    analyzerId: state.debugId,
    refCount: state.refCount,
    audioContextState: state.audioContext.state,
    mediaPaused: state.media.paused,
    mediaEnded: state.media.ended,
    currentTime: Math.round(state.media.currentTime * 1000) / 1000,
    ...details
  });
}

function logFeatureSnapshot(
  state: AnalyzerState,
  now: number,
  features: {
    energy: number;
    energyDb: number;
    onsetStrength: number;
    musicProbability: number;
  }
): void {
  if (now - state.lastFeatureLogAt < FEATURE_LOG_INTERVAL_MS && state.sentCount !== 1) return;
  state.lastFeatureLogAt = now;
  console.info(LOG_PREFIX, 'sent analysis snapshot', {
    analyzerId: state.debugId,
    sentCount: state.sentCount,
    energyDb: round(features.energyDb),
    musicProbability: round(features.musicProbability),
    onsetStrength: round(features.onsetStrength)
  });
}

function round(value?: number): number | string {
  if (!Number.isFinite(value)) return '-';
  return Math.round(value! * 1000) / 1000;
}
