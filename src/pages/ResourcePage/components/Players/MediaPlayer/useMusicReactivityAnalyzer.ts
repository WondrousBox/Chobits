import { estimateMediaMusicFeatures } from '@packages/audio-reactivity/analysis/media-feature-estimator';
import { MUSIC_REACTIVITY_SPECTRUM_BAND_COUNT, type MusicReactivitySpectrumFrame } from '@packages/audio-reactivity/types';
import { type RefObject, useCallback, useEffect, useRef } from 'react';

type MediaElement = HTMLAudioElement | HTMLVideoElement;

interface AnalyzerState {
  media: MediaElement;
  audioContext: AudioContext;
  analyser: AnalyserNode;
  source: MediaElementAudioSourceNode;
  timeData: Uint8Array<ArrayBuffer>;
  frequencyData: Uint8Array<ArrayBuffer>;
  previousFrequencyData: Uint8Array<ArrayBuffer>;
  lastSentAt: number;
  lastSpectrumSentAt: number;
  disposed: boolean;
  refCount: number;
  releaseTimerId: number | null;
  debugId: number;
  lastFeatureLogAt: number;
  sentCount: number;
}

const FFT_SIZE = 2048;
const SEND_INTERVAL_MS = 500;
const SPECTRUM_FRAME_INTERVAL_MS = 40;
const ANALYZER_RELEASE_DELAY_MS = 3000;
const FEATURE_LOG_INTERVAL_MS = 3000;
const LOG_PREFIX = '[MusicReactivity][MediaPlayer]';
const analyzerByMedia = new WeakMap<MediaElement, AnalyzerState>();
let nextAnalyzerDebugId = 1;

function computeSpectrumBands(frequencyData: Uint8Array, bandCount: number): number[] {
  const bands = new Array<number>(bandCount).fill(0);
  const binCount = frequencyData.length;
  if (binCount === 0) return bands;
  // Log-distributed buckets from low to high frequency for a musical look.
  const minBin = 1;
  const maxBin = binCount;
  const logMin = Math.log(minBin);
  const logMax = Math.log(maxBin);
  for (let i = 0; i < bandCount; i += 1) {
    const startLog = logMin + ((logMax - logMin) * i) / bandCount;
    const endLog = logMin + ((logMax - logMin) * (i + 1)) / bandCount;
    const start = Math.max(0, Math.min(binCount - 1, Math.floor(Math.exp(startLog))));
    const end = Math.max(start + 1, Math.min(binCount, Math.ceil(Math.exp(endLog))));
    let peak = 0;
    for (let j = start; j < end; j += 1) {
      const value = frequencyData[j];
      if (value > peak) peak = value;
    }
    bands[i] = peak / 255;
  }
  return bands;
}

function getAudioContextConstructor(): typeof AudioContext | undefined {
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

function computeFeatures(state: AnalyzerState): {
  energy: number;
  energyDb: number;
  onsetStrength: number;
  musicProbability: number;
} {
  state.analyser.getByteTimeDomainData(state.timeData);
  state.analyser.getByteFrequencyData(state.frequencyData);

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
      lastSpectrumSentAt: 0,
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

export function useMusicReactivityAnalyzer(
  mediaRef: RefObject<MediaElement | null>,
  active: boolean,
  mediaKind: 'audio' | 'video',
  onSpectrumFrame?: (frame: MusicReactivitySpectrumFrame) => void
): () => Promise<void> {
  const stateRef = useRef<AnalyzerState | null>(null);
  const activeRef = useRef(active);
  const onSpectrumFrameRef = useRef(onSpectrumFrame);
  const timerRef = useRef<number | null>(null);

  const resumeAudioContext = useCallback(async (): Promise<void> => {
    const state = stateRef.current;
    if (!state || state.disposed || state.audioContext.state !== 'suspended') return;

    try {
      await state.audioContext.resume();
    } catch (error) {
      console.warn('[MediaPlayer] music reactivity audio context resume failed:', error);
    }
  }, []);

  useEffect(() => {
    activeRef.current = active;
    console.info(LOG_PREFIX, 'active changed', { active, mediaKind });
    if (!active) {
      void window.YUA.musicReactivity.reset('media-inactive');
    }
  }, [active, mediaKind]);

  useEffect(() => {
    onSpectrumFrameRef.current = onSpectrumFrame;
  }, [onSpectrumFrame]);

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
      const mediaActive = activeRef.current && !media.paused && !media.ended;

      if (mediaActive && now - state.lastSpectrumSentAt >= SPECTRUM_FRAME_INTERVAL_MS) {
        state.lastSpectrumSentAt = now;
        void resumeAudioContext();
        state.analyser.getByteFrequencyData(state.frequencyData);
        const bands = computeSpectrumBands(state.frequencyData, MUSIC_REACTIVITY_SPECTRUM_BAND_COUNT);
        let sumSquares = 0;
        for (const value of bands) sumSquares += value * value;
        const energy = Math.sqrt(sumSquares / Math.max(1, bands.length));
        const frame: MusicReactivitySpectrumFrame = {
          timestampMs: now,
          source: 'app-media',
          bands,
          energy
        };
        onSpectrumFrameRef.current?.(frame);
        window.YUA.musicReactivity.sendSpectrumFrame(frame);
      }

      if (mediaActive && now - state.lastSentAt >= SEND_INTERVAL_MS) {
        state.lastSentAt = now;
        const features = computeFeatures(state);
        state.sentCount += 1;
        logFeatureSnapshot(state, now, features);
        void window.YUA.musicReactivity.ingestAnalysis({
          source: 'app-media',
          timestampMs: now,
          ...features
        });
      }
      timerRef.current = window.setTimeout(tick, SPECTRUM_FRAME_INTERVAL_MS);
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
  }, [mediaKind, mediaRef, resumeAudioContext]);

  return resumeAudioContext;
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
