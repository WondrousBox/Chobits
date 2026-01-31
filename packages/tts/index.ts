/**
 * TTS 模块导出
 */

// 基础类型
export { silenceAudio } from './common';
export * from './types';

// Edge TTS
export { default as EdgeTTS, type EdgeTTSOptions } from './edge';

// 批量TTS服务
export {
  type BatchTTSCompleteEvent,
  type BatchTTSConfig,
  type BatchTTSEmitter,
  type BatchTTSErrorEvent,
  type BatchTTSEvent,
  type BatchTTSHistory,
  type BatchTTSProgressEvent,
  type BatchTTSRequest,
  type BatchTTSResult,
  BatchTTSService,
  configureFfmpegPath,
  type SegmentInfo,
  type TTSItem,
  type TTSItemResult
} from './batch-tts-service';
