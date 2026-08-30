/**
 * TTS 模块导出
 */

// 基础类型
export { silenceAudio, stripEmoji } from './common';
export * from './types';

// Edge TTS
export { default as EdgeTTS, type EdgeTTSOptions } from './edge';
