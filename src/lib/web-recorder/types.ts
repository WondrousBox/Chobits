/**
 * Web Recorder Type Definitions
 */

export interface RecorderConfig {
  /** Sampling bits, default 16 */
  sampleBits?: 8 | 16;
  /** Sampling rate, default to browser's sample rate */
  sampleRate?: 8000 | 11025 | 16000 | 22050 | 24000 | 44100 | 48000;
  /** Number of channels, default 1 */
  numChannels?: 1 | 2;
  /** Specific microphone device ID */
  deviceId?: string;
}

export interface ProgressPayload {
  /** Recording duration in seconds */
  duration: number;
  /** File size in bytes */
  fileSize: number;
  /** Raw audio data */
  data: Float32Array;
  /** Volume percentage (0-100) */
  vol: number;
}

export interface DataPayload {
  /** 16-bit PCM data */
  data: Int16Array;
}

export interface Float32DataPayload {
  /** 16kHz Float32 data */
  data: Float32Array;
}

export type RecorderState = 'inactive' | 'recording' | 'paused';

export interface WaveDataPayload {
  type: 'wave';
  channelData: [Float32Array];
}

export interface ProcessDataPayload {
  type: 'process';
  channelData: [Float32Array];
}

export type AudioWorkletMessage = WaveDataPayload | ProcessDataPayload;

export interface TranscodeWorkerInput {
  audioData: Float32Array;
  sampleRate: number;
}

export interface TranscodeWorkerOutput {
  type: 'to16kHz' | 'to16BitPCM' | 'init';
  output: Float32Array | Uint8Array | string;
}
