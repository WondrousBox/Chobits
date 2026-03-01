/**
 * Web Recorder Module
 *
 * A web-based audio recording library using AudioWorklet + Web Worker architecture.
 *
 * @example
 * ```typescript
 * import { WebRecorder } from '@/lib/web-recorder';
 *
 * const recorder = new WebRecorder({ sampleRate: 16000 });
 *
 * recorder.onprogress = (payload) => {
 *   console.log('Duration:', payload.duration, 'Vol:', payload.vol);
 * };
 *
 * recorder.onFloat32Data = (payload) => {
 *   console.log('Got 16kHz data:', payload.data.length);
 * };
 *
 * recorder.onData = (payload) => {
 *   console.log('Got 16-bit PCM:', payload.data.length);
 * };
 *
 * await recorder.start();
 * // Record for 5 seconds
 * await new Promise(r => setTimeout(r, 5000));
 * await recorder.stop();
 *
 * // Get WAV blob
 * const wavBlob = recorder.getWAVBlob();
 * ```
 */

// Main class
export { WebRecorder, default as WebRecorderDefault } from './recorder';

// Types
export type {
  AudioWorkletMessage,
  DataPayload,
  Float32DataPayload,
  ProcessDataPayload,
  ProgressPayload,
  RecorderConfig,
  RecorderState,
  TranscodeWorkerInput,
  TranscodeWorkerOutput,
  WaveDataPayload
} from './types';

// Utilities
export { compress, encodePCM, encodeWAV, isLittleEndian, to16BitPCM, to16kHz, toInt16Array } from './utils/audio-transform';
