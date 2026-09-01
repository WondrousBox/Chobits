export * from './ai/index';
export * from './core/index';
export * from './display/index';
export * from './media/index';
export * from './ocr/index';
export * from './rendering/index';
export * from './resource/index';

import { AiChatNode } from './ai/ai-chat';
import { AiPromptOptimizerNode } from './ai/ai-prompt-optimizer';
import { ImageGenerateNode } from './ai/image-generate';
import { ImageUnderstandNode } from './ai/image-understand';
import { MusicGenerateNode } from './ai/music-generate';
import { StartNode } from './core/start';
import { DisplayImageNode } from './display/display-image';
import { DisplayMediaNode } from './display/display-media';
import { DisplayResourceCardNode } from './display/display-resource-card';
import { DisplayTextNode } from './display/display-text';
import { DocToMarkdownNode } from './media/doc-to-md';
import { ExtractKeyframesNode } from './media/extract-keyframes';
import { TranscodeNode } from './media/transcode';
import { TranscodeAdvancedNode } from './media/transcode-advanced';
import { TranscribeFastWhisperNode } from './media/transcribe-fast-whisper';
import { TranscribeFunASRNode } from './media/transcribe-funasr';
import { TranscribeParakeetNode } from './media/transcribe-parakeet';
import { TranscribeWhisperNode } from './media/transcribe-whisper';
import { OCRNode } from './ocr/ocr';
import { PaddleOCRNode } from './ocr/paddle-ocr';
import { GenerateLearningCardNode } from './rendering/generate-learning-card';
import { TextToImageNode } from './rendering/text-to-image';
import { CollectFolderTextsNode } from './resource/collect-folder-texts';
import { ResourceCreateNode } from './resource/resource-create';
import { ResourceLoadNode } from './resource/resource-load';
import { ResourceUpdateNode } from './resource/resource-update';

export const workflowIntegrationResourceReadNodes = [ResourceLoadNode, CollectFolderTextsNode] as const;

export const workflowIntegrationNodes = [
  StartNode,
  ResourceLoadNode,
  ResourceCreateNode,
  ResourceUpdateNode,
  CollectFolderTextsNode,
  AiChatNode,
  AiPromptOptimizerNode,
  ImageUnderstandNode,
  ImageGenerateNode,
  MusicGenerateNode,
  DocToMarkdownNode,
  ExtractKeyframesNode,
  TranscodeNode,
  TranscodeAdvancedNode,
  TranscribeWhisperNode,
  TranscribeFastWhisperNode,
  TranscribeParakeetNode,
  TranscribeFunASRNode,
  OCRNode,
  PaddleOCRNode,
  TextToImageNode,
  GenerateLearningCardNode,
  DisplayTextNode,
  DisplayImageNode,
  DisplayMediaNode,
  DisplayResourceCardNode
] as const;
