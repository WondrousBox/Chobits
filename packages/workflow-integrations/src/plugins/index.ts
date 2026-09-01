export { FastWhisperPlugin } from './fast-whisper';
export { FfmpegPlugin } from './ffmpeg';
export { FunASRPlugin } from './funasr';
export { PaddleOcrPlugin } from './paddle-ocr';
export { ParakeetPlugin } from './parakeet';
export { TesseractPlugin } from './tesseract';
export { WhisperPlugin } from './whisper';

import { FastWhisperPlugin } from './fast-whisper';
import { FfmpegPlugin } from './ffmpeg';
import { FunASRPlugin } from './funasr';
import { PaddleOcrPlugin } from './paddle-ocr';
import { ParakeetPlugin } from './parakeet';
import { TesseractPlugin } from './tesseract';
import { WhisperPlugin } from './whisper';

export const workflowIntegrationPlugins = [FfmpegPlugin, FunASRPlugin, FastWhisperPlugin, ParakeetPlugin, PaddleOcrPlugin, TesseractPlugin, WhisperPlugin] as const;
