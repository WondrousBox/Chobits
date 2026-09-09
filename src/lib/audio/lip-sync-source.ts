interface LipSyncState {
  analyser: AnalyserNode | null;
  samples: Uint8Array<ArrayBuffer> | null;
  smoothedRms: number;
  lastUpdateTime: number;
}

const state: LipSyncState = {
  analyser: null,
  samples: null,
  smoothedRms: 0,
  lastUpdateTime: 0
};

let mediaContext: AudioContext | null = null;
let mediaAnalyser: AnalyserNode | null = null;
const mediaSources = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();

function setActiveAnalyser(analyser: AnalyserNode): void {
  state.analyser = analyser;
  state.samples = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
  state.smoothedRms = 0;
  state.lastUpdateTime = performance.now();
}

export function attachMediaElement(audio: HTMLAudioElement): void {
  try {
    const AudioContextCtor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    if (!mediaContext || mediaContext.state === 'closed') mediaContext = new AudioContextCtor();
    if (mediaContext.state === 'suspended') void mediaContext.resume();

    let source = mediaSources.get(audio);
    if (!source) {
      source = mediaContext.createMediaElementSource(audio);
      mediaSources.set(audio, source);
    }

    mediaAnalyser?.disconnect();
    try {
      source.disconnect();
    } catch {
      // A new source has no connections yet.
    }

    const analyser = mediaContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.5;
    source.connect(analyser);
    analyser.connect(mediaContext.destination);
    mediaAnalyser = analyser;
    setActiveAnalyser(analyser);
  } catch (error) {
    console.warn('[LipSyncSource] Failed to attach media element', error);
  }
}

export function attachAudioContext(context: AudioContext, node: AudioNode): void {
  try {
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.5;
    node.connect(analyser);
    setActiveAnalyser(analyser);
  } catch (error) {
    console.warn('[LipSyncSource] Failed to attach audio context', error);
  }
}

export function detachLipSyncSource(): void {
  try {
    state.analyser?.disconnect();
  } catch {
    // Already disconnected.
  }
  if (state.analyser === mediaAnalyser) mediaAnalyser = null;
  state.analyser = null;
  state.samples = null;
  state.smoothedRms = 0;
}

export function getCurrentRMS(): number {
  if (!state.analyser || !state.samples) return 0;

  const now = performance.now();
  const deltaSeconds = Math.min(100, now - state.lastUpdateTime) / 1000;
  state.lastUpdateTime = now;
  state.analyser.getByteTimeDomainData(state.samples);

  let sum = 0;
  for (const sample of state.samples) {
    const normalized = (sample - 128) / 128;
    sum += normalized * normalized;
  }
  const rms = Math.sqrt(sum / state.samples.length);
  const smoothing = rms > state.smoothedRms ? 0.35 : 0.12;
  state.smoothedRms += (rms - state.smoothedRms) * Math.min(1, smoothing * deltaSeconds * 60);
  return Math.max(0, Math.min(1, state.smoothedRms));
}
