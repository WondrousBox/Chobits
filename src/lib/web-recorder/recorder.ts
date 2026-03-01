/**
 * Web Recorder
 *
 * A web-based audio recorder using AudioWorklet + Web Worker architecture.
 * Provides real-time audio streaming with multiple output formats.
 */

import type { AudioWorkletMessage, DataPayload, Float32DataPayload, ProgressPayload, RecorderConfig, RecorderState, TranscodeWorkerOutput } from './types';
import { compress, encodePCM, encodeWAV, isLittleEndian } from './utils/audio-transform';
// Import transcode worker using Vite's worker import syntax
import TranscodeWorker from './workers/transcode-worker?worker';

/**
 * Create AudioWorklet URL from inline code
 * This avoids the need for separate file loading and works in both dev and production
 */
function createAudioWorkletUrl(): string {
  const workletCode = `
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.bufferSize = 4096;
    this.counter = 0;
  }

  process(inputs) {
    const input = inputs[0];

    if (input.length > 0) {
      const channelData = input[0];

      // Accumulate samples
      for (let i = 0; i < channelData.length; i++) {
        this.buffer.push(channelData[i]);
      }

      // When buffer reaches bufferSize, send to main thread
      if (this.buffer.length >= this.bufferSize) {
        this.port.postMessage({
          type: 'process',
          channelData: [this.buffer.slice(0, this.bufferSize)]
        });
        this.buffer = this.buffer.slice(this.bufferSize);
      }

      // Send wave data every 16 process calls for visualization
      this.counter++;
      if (this.counter % 16 === 0) {
        this.port.postMessage({
          type: 'wave',
          channelData: [channelData]
        });
      }
    }

    return true;
  }
}

registerProcessor('audio-worklet', AudioProcessor);
`;

  const blob = new Blob([workletCode], { type: 'application/javascript' });
  return URL.createObjectURL(blob);
}

// Create the worklet URL once
const audioWorkletUrl = createAudioWorkletUrl();

/**
 * Web Recorder class
 *
 * Provides audio recording functionality with:
 * - Real-time audio streaming via callbacks
 * - 16kHz Float32 output (for ASR)
 * - 16-bit PCM output (for saving/transmission)
 * - Volume and duration tracking
 */
export class WebRecorder {
  private context: AudioContext | null = null;
  private config: Required<RecorderConfig>;
  private analyser: AnalyserNode | null = null;
  private size = 0;
  private lBuffer: Float32Array[] = [];
  private rBuffer: Float32Array[] = [];
  private inputSampleRate: number;
  private outputSampleRate: number;
  private outputSampleBits: 8 | 16;
  private source: MediaStreamAudioSourceNode | null = null;
  private recorderProcessor: AudioWorkletNode | null = null;
  private transcodeWorker: Worker | null = null;
  private stream: MediaStream | null = null;
  private littleEndian: boolean;
  private fileSize = 0;
  private duration = 0;
  private needRecord = true;
  private state: RecorderState = 'inactive';

  // Callbacks
  public onprogress: ((payload: ProgressPayload) => void) | null = null;
  public onData: ((payload: DataPayload) => void) | null = null;
  public onFloat32Data: ((payload: Float32DataPayload) => void) | null = null;

  /**
   * Create a WebRecorder instance
   * @param options - Recorder configuration options
   */
  constructor(options: RecorderConfig = {}) {
    // Create temporary AudioContext to get input sample rate
    const tempContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.inputSampleRate = tempContext.sampleRate;
    tempContext.close();

    // Set default config
    this.config = {
      sampleBits: [8, 16].includes(options.sampleBits as number) ? (options.sampleBits as 8 | 16) : 16,
      sampleRate: [8000, 11025, 16000, 22050, 24000, 44100, 48000].includes(options.sampleRate as number)
        ? (options.sampleRate as 8000 | 11025 | 16000 | 22050 | 24000 | 44100 | 48000)
        : (this.inputSampleRate as 8000 | 11025 | 16000 | 22050 | 24000 | 44100 | 48000),
      numChannels: [1, 2].includes(options.numChannels as number) ? (options.numChannels as 1 | 2) : 1,
      deviceId: options.deviceId || ''
    };

    this.outputSampleRate = this.config.sampleRate;
    this.outputSampleBits = this.config.sampleBits;
    this.littleEndian = isLittleEndian();

    // Initialize getUserMedia compatibility
    this.initUserMedia();
  }

  /**
   * Get current recorder state
   */
  getState(): RecorderState {
    return this.state;
  }

  /**
   * Start recording
   */
  async start(): Promise<void> {
    if (this.context) {
      await this.destroy();
    }

    await this.initRecorder();

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: this.config.deviceId || undefined,
          channelCount: 1,
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: true
        }
      });

      if (this.context) {
        this.source = this.context.createMediaStreamSource(this.stream);

        if (this.source && this.context && this.analyser && this.recorderProcessor) {
          this.source.connect(this.analyser);
          this.analyser.connect(this.recorderProcessor);
          this.recorderProcessor.connect(this.context.destination);
          this.state = 'recording';
        }
      }
    } catch (error) {
      console.error('Failed to start recording:', error);
      throw error;
    }
  }

  /**
   * Pause recording
   */
  pause(): void {
    this.needRecord = false;
    this.state = 'paused';
  }

  /**
   * Resume recording
   */
  resume(): void {
    this.needRecord = true;
    this.state = 'recording';
  }

  /**
   * Stop recording
   */
  stop(): void {
    this.source?.disconnect();
    this.recorderProcessor?.disconnect();
    this.analyser?.disconnect();
    this.needRecord = true;
    this.state = 'inactive';
  }

  /**
   * Destroy recorder and release all resources
   */
  async destroy(): Promise<void> {
    this.clearRecordStatus();
    this.stopStream();
    await this.closeAudioContext();

    if (this.transcodeWorker) {
      this.transcodeWorker.terminate();
      this.transcodeWorker = null;
    }

    this.state = 'inactive';
  }

  /**
   * Get all recorded audio data
   */
  getData(): { left: Float32Array; right: Float32Array } {
    return this.flat();
  }

  /**
   * Get WAV file as Blob
   */
  getWAVBlob(): Blob {
    const { left, right } = this.getData();
    const compressedData = compress({ left, right }, this.inputSampleRate, this.outputSampleRate);
    const pcmData = encodePCM(compressedData, this.outputSampleBits, this.littleEndian);
    const wavData = encodeWAV(pcmData, this.inputSampleRate, this.outputSampleRate, this.config.numChannels, this.outputSampleBits, this.littleEndian);

    // Convert DataView to ArrayBuffer for Blob compatibility
    const arrayBuffer = wavData.buffer.slice(wavData.byteOffset, wavData.byteOffset + wavData.byteLength) as ArrayBuffer;
    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }

  /**
   * Get WAV file as Object URL
   */
  getWAVUrl(): string {
    const blob = this.getWAVBlob();
    return URL.createObjectURL(blob);
  }

  /**
   * Initialize recorder
   */
  private async initRecorder(): Promise<void> {
    this.clearRecordStatus();

    const context = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = 2048;

    // Load AudioWorklet module
    await context.audioWorklet.addModule(audioWorkletUrl, { credentials: 'omit' });

    // Create AudioWorkletNode
    this.recorderProcessor = new AudioWorkletNode(context, 'audio-worklet');

    // Handle messages from AudioWorklet
    this.recorderProcessor.port.onmessage = (e: MessageEvent<AudioWorkletMessage>) => {
      if (!this.needRecord) {
        return;
      }

      if (e.data.type === 'process') {
        this.handleProcessData(e.data.channelData[0]);
      }
    };

    // Create transcode worker
    this.transcodeWorker = new TranscodeWorker();

    this.context = context;

    return new Promise((resolve, reject) => {
      if (this.transcodeWorker) {
        this.transcodeWorker.onmessage = (event: MessageEvent<TranscodeWorkerOutput>) => {
          if (event.data.type === 'init') {
            resolve();
          } else if (event.data.type === 'to16BitPCM') {
            const output = event.data.output as Uint8Array;
            this.onData?.({ data: new Int16Array(output.buffer) });
          } else if (event.data.type === 'to16kHz') {
            this.onFloat32Data?.({ data: event.data.output as Float32Array });
          }
        };

        this.transcodeWorker.onerror = (error) => {
          reject(error);
        };
      } else {
        reject(new Error('Failed to create transcode worker'));
      }
    });
  }

  /**
   * Handle process data from AudioWorklet
   */
  private handleProcessData(lData: Float32Array): void {
    this.lBuffer.push(new Float32Array(lData));
    this.size += lData.length;

    // Calculate file size
    this.fileSize = Math.floor(this.size / Math.max(this.inputSampleRate / this.outputSampleRate, 1)) * (this.outputSampleBits / 8);

    // Calculate volume percentage (iterate manually to avoid downlevelIteration)
    let maxVal = 0;
    for (let i = 0; i < lData.length; i++) {
      if (lData[i] > maxVal) {
        maxVal = lData[i];
      }
    }
    const vol = maxVal * 100;

    // Calculate duration
    this.duration += 4096 / this.inputSampleRate;

    // Trigger onprogress callback
    this.onprogress?.({
      duration: this.duration,
      fileSize: this.fileSize,
      data: lData,
      vol
    });

    // Send to transcode worker
    this.transcodeWorker?.postMessage({
      audioData: lData,
      sampleRate: this.context?.sampleRate
    });
  }

  /**
   * Clear recording status
   */
  private clearRecordStatus(): void {
    this.lBuffer.length = 0;
    this.rBuffer.length = 0;
    this.size = 0;
    this.fileSize = 0;
    this.duration = 0;
    this.source = null;
  }

  /**
   * Flatten buffer arrays to single Float32Array
   */
  private flat(): { left: Float32Array; right: Float32Array } {
    let lData: Float32Array;
    let rData = new Float32Array(0);

    if (this.config.numChannels === 1) {
      lData = new Float32Array(this.size);
    } else {
      lData = new Float32Array(this.size / 2);
      rData = new Float32Array(this.size / 2);
    }

    let offset = 0;
    for (const chunk of this.lBuffer) {
      lData.set(chunk, offset);
      offset += chunk.length;
    }

    offset = 0;
    for (const chunk of this.rBuffer) {
      rData.set(chunk, offset);
      offset += chunk.length;
    }

    return { left: lData, right: rData };
  }

  /**
   * Stop media stream
   */
  private stopStream(): void {
    if (this.stream && this.stream.getTracks) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
  }

  /**
   * Close AudioContext
   */
  private closeAudioContext(): Promise<void> {
    if (this.context && this.context.close && this.context.state !== 'closed') {
      return this.context.close();
    }
    return Promise.resolve();
  }

  /**
   * Initialize getUserMedia compatibility
   */
  private initUserMedia(): void {
    if (navigator.mediaDevices === undefined) {
      (navigator as any).mediaDevices = {};
    }

    if (navigator.mediaDevices.getUserMedia === undefined) {
      navigator.mediaDevices.getUserMedia = (constraints: MediaStreamConstraints) => {
        const getUserMedia = (navigator as any).getUserMedia || (navigator as any).webkitGetUserMedia || (navigator as any).mozGetUserMedia;

        if (!getUserMedia) {
          return Promise.reject(new Error('Browser does not support getUserMedia'));
        }

        return new Promise((resolve, reject) => {
          getUserMedia.call(navigator, constraints, resolve, reject);
        });
      };
    }
  }

  /**
   * Request microphone permission
   */
  static async requestPermission(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  }

  /**
   * Check if microphone permission is granted
   */
  static async checkPermission(): Promise<boolean> {
    try {
      const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return permission.state === 'granted';
    } catch {
      // Fallback for browsers that don't support permission query
      return false;
    }
  }

  /**
   * Get available audio input devices
   */
  static async getAudioDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((device) => device.kind === 'audioinput');
  }
}

export default WebRecorder;
