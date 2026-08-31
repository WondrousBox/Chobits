/**
 * lip-sync-source.ts
 *
 * 为 Live2D lip-sync 提供统一的音量包络（RMS）读取。
 * 支持两条语音链路：
 * 1. 缓存合成：HTMLAudioElement（useSpriteSpeak）
 * 2. 实时流式：Web Audio API（PcmStreamPlayer）
 *
 * 内部统一使用 AnalyserNode 计算 RMS，并做 attack/release 平滑。
 */

interface LipSyncSourceState {
  analyser: AnalyserNode | null;
  dataArray: Uint8Array<ArrayBuffer> | null;
  smoothedRms: number;
  lastUpdateTime: number;
  attack: number;
  release: number;
}

const state: LipSyncSourceState = {
  analyser: null,
  dataArray: null,
  smoothedRms: 0,
  lastUpdateTime: 0,
  attack: 0.35,
  release: 0.12
};

// 媒体元素链路复用同一个 AudioContext（模块级单例），避免每次播放都新建实例造成泄漏
let mediaContext: AudioContext | null = null;
let mediaAnalyser: AnalyserNode | null = null;
// 同一元素在同一 context 上只能 createMediaElementSource 一次，做缓存复用
const mediaElementSources = new WeakMap<HTMLAudioElement, MediaElementAudioSourceNode>();

/**
 * 为 HTMLAudioElement 挂载分析器。
 * MediaElementSource 会同时接到 destination，不改变原播放行为。
 */
export function attachMediaElement(audio: HTMLAudioElement): void {
  try {
    if (!mediaContext || mediaContext.state === 'closed') {
      mediaContext = new AudioContext();
    }
    if (mediaContext.state === 'suspended') {
      void mediaContext.resume();
    }
    const ctx = mediaContext;

    let source = mediaElementSources.get(audio);
    if (!source) {
      source = ctx.createMediaElementSource(audio);
      mediaElementSources.set(audio, source);
    }

    // 断开旧的媒体分析器与 source 的历史连接，避免旧节点一直挂在 destination 上
    mediaAnalyser?.disconnect();
    try {
      source.disconnect();
    } catch {
      // 无连接时忽略
    }

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.5;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    mediaAnalyser = analyser;

    state.analyser = analyser;
    state.dataArray = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    state.smoothedRms = 0;
    state.lastUpdateTime = performance.now();
  } catch (e) {
    console.warn('[LipSyncSource] attachMediaElement failed', e);
  }
}

/**
 * 在现有 AudioContext 的输出链上并联分析器。
 * 通常接在 GainNode 之后、destination 之前。
 */
export function attachAudioContext(ctx: AudioContext, node: AudioNode): void {
  try {
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.5;
    node.connect(analyser);
    // 注意：不接到 destination，避免重复出声；仅用于分析

    state.analyser = analyser;
    state.dataArray = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
    state.smoothedRms = 0;
    state.lastUpdateTime = performance.now();
  } catch (e) {
    console.warn('[LipSyncSource] attachAudioContext failed', e);
  }
}

/**
 * 分离当前分析器（音频元素替换或流结束时调用）。
 */
export function detachLipSyncSource(): void {
  if (state.analyser) {
    try {
      state.analyser.disconnect();
    } catch {
      // ignore
    }
    if (state.analyser === mediaAnalyser) {
      mediaAnalyser = null;
    }
  }
  state.analyser = null;
  state.dataArray = null;
  state.smoothedRms = 0;
}

/**
 * 读取当前平滑后的 RMS 值（0-1）。无活动时返回 0。
 */
export function getCurrentRMS(): number {
  if (!state.analyser || !state.dataArray) return 0;

  const now = performance.now();
  const delta = Math.min(100, now - state.lastUpdateTime) / 1000; // 秒，封顶 100ms
  state.lastUpdateTime = now;

  state.analyser.getByteTimeDomainData(state.dataArray);

  let sum = 0;
  for (let i = 0; i < state.dataArray.length; i++) {
    const v = (state.dataArray[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / state.dataArray.length);

  // attack / release 平滑
  const coeff = rms > state.smoothedRms ? state.attack : state.release;
  state.smoothedRms += (rms - state.smoothedRms) * Math.min(1, coeff * delta * 60);

  return Math.max(0, Math.min(1, state.smoothedRms));
}
