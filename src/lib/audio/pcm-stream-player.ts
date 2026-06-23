export type PcmSampleFormat = 's16le' | 'f32le' | string;

export interface PcmStreamPlayerOptions {
  sampleRate: number;
  channels: number;
  sampleFormat?: PcmSampleFormat;
  volume?: number;
  startBufferMs?: number;
  fadeInMs?: number;
  fadeOutMs?: number;
}

function getAudioContextCtor(): typeof AudioContext | undefined {
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
}

function toArrayBuffer(chunk: ArrayBuffer | Uint8Array | Buffer): ArrayBuffer {
  if (chunk instanceof ArrayBuffer) return chunk;
  const view = chunk as Uint8Array;
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}

function decodeS16le(view: DataView): Float32Array {
  const samples = Math.floor(view.byteLength / 2);
  const out = new Float32Array(samples);
  for (let index = 0; index < samples; index += 1) {
    out[index] = Math.max(-1, Math.min(1, view.getInt16(index * 2, true) / 32768));
  }
  return out;
}

function decodeF32le(view: DataView): Float32Array {
  const samples = Math.floor(view.byteLength / 4);
  const out = new Float32Array(samples);
  for (let index = 0; index < samples; index += 1) {
    out[index] = Math.max(-1, Math.min(1, view.getFloat32(index * 4, true)));
  }
  return out;
}

function decodePcm(chunk: ArrayBuffer | Uint8Array | Buffer, sampleFormat: PcmSampleFormat): Float32Array {
  const buffer = toArrayBuffer(chunk);
  const view = new DataView(buffer);
  const format = String(sampleFormat || 's16le').toLowerCase();
  if (format === 'f32le' || format === 'float32le') {
    return decodeF32le(view);
  }
  return decodeS16le(view);
}

function deinterleave(samples: Float32Array, channels: number): Float32Array[] {
  const safeChannels = Math.max(1, Math.min(2, Math.round(channels || 1)));
  const frames = Math.floor(samples.length / safeChannels);
  const out = Array.from({ length: safeChannels }, () => new Float32Array(frames));
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < safeChannels; channel += 1) {
      out[channel][frame] = samples[frame * safeChannels + channel] || 0;
    }
  }
  return out;
}

function resampleChannel(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (!input.length || fromRate === toRate) return input;
  const ratio = toRate / fromRate;
  const outputLength = Math.max(1, Math.round(input.length * ratio));
  const output = new Float32Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index / ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(input.length - 1, left + 1);
    const amount = sourceIndex - left;
    output[index] = input[left] * (1 - amount) + input[right] * amount;
  }
  return output;
}

export class PcmStreamPlayer {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private started = false;
  private options: Required<Pick<PcmStreamPlayerOptions, 'sampleRate' | 'channels' | 'sampleFormat' | 'volume' | 'startBufferMs' | 'fadeInMs' | 'fadeOutMs'>>;

  constructor(options: PcmStreamPlayerOptions) {
    this.options = {
      sampleRate: options.sampleRate,
      channels: options.channels,
      sampleFormat: options.sampleFormat || 's16le',
      volume: options.volume ?? 1,
      startBufferMs: options.startBufferMs ?? 160,
      fadeInMs: options.fadeInMs ?? 12,
      fadeOutMs: options.fadeOutMs ?? 32
    };
  }

  async start(): Promise<void> {
    if (this.started) return;
    const Ctor = getAudioContextCtor();
    if (!Ctor) {
      throw new Error('AudioContext is not available');
    }
    this.context = new Ctor();
    this.gain = this.context.createGain();
    this.gain.gain.value = Math.max(0, Math.min(1, this.options.volume));
    this.gain.connect(this.context.destination);
    if (this.context.state === 'suspended') {
      await this.context.resume().catch(() => undefined);
    }
    this.nextStartTime = this.context.currentTime + this.options.startBufferMs / 1000;
    this.started = true;
  }

  append(chunk: ArrayBuffer | Uint8Array | Buffer): void {
    if (!this.context || !this.gain || !this.started) return;
    const decoded = decodePcm(chunk, this.options.sampleFormat);
    if (!decoded.length) return;

    const sourceChannels = deinterleave(decoded, this.options.channels);
    const outputChannels = sourceChannels.map((channel) => resampleChannel(channel, this.options.sampleRate, this.context!.sampleRate));
    const frameCount = Math.max(1, outputChannels[0]?.length || 0);
    const audioBuffer = this.context.createBuffer(outputChannels.length, frameCount, this.context.sampleRate);
    outputChannels.forEach((channel, index) => {
      audioBuffer.copyToChannel(new Float32Array(channel), index);
    });

    const source = this.context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.gain);
    source.onended = () => {
      this.sources.delete(source);
    };

    const now = this.context.currentTime;
    const startAt = Math.max(this.nextStartTime, now + 0.01);
    source.start(startAt);
    this.sources.add(source);
    this.nextStartTime = startAt + audioBuffer.duration;
  }

  setVolume(volume: number): void {
    this.options.volume = Math.max(0, Math.min(1, volume));
    if (this.gain && this.context) {
      this.gain.gain.setTargetAtTime(this.options.volume, this.context.currentTime, 0.01);
    }
  }

  getBufferedMs(): number {
    if (!this.context) return 0;
    return Math.max(0, this.nextStartTime - this.context.currentTime) * 1000;
  }

  end(): void {
    const context = this.context;
    const gain = this.gain;
    if (!context || !gain) {
      this.cancel();
      return;
    }
    const stopAt = Math.max(context.currentTime, this.nextStartTime);
    const fadeOutSeconds = Math.max(0, this.options.fadeOutMs / 1000);
    if (fadeOutSeconds > 0) {
      gain.gain.setTargetAtTime(0, Math.max(context.currentTime, stopAt - fadeOutSeconds), fadeOutSeconds / 4);
    }
    window.setTimeout(() => this.cancel(), Math.max(0, (stopAt - context.currentTime + fadeOutSeconds) * 1000 + 50));
  }

  cancel(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        //
      }
    }
    this.sources.clear();
    this.gain?.disconnect();
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.gain = null;
    this.started = false;
    this.nextStartTime = 0;
  }
}
