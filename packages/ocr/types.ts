import type { ProcessingEngine, RecognitionStrategy } from 'ppu-paddle-ocr';

export type OcrEngine = 'paddle';

export type OcrRecognizeImageRequest = {
  imagePath: string;
  engine?: OcrEngine;
  model?: string;
  strategy?: RecognitionStrategy;
  processingEngine?: ProcessingEngine;
  maxSideLength?: number;
  noCache?: boolean;
  flatten?: boolean;
  executionProviders?: string[];
  verbose?: boolean;
};

export type OcrRecognizeImageResult = {
  engine: OcrEngine;
  text: string;
  results: unknown;
  confidence?: number;
  modelName: string;
  modelDisplayName: string;
};

export type OcrModelInfo = {
  engine: OcrEngine;
  name: string;
  resourceId: string;
  displayName: string;
  description: string;
  installed: boolean;
  missingFiles: string[];
};

export class OcrModelMissingError extends Error {
  readonly code = 'OCR_MODEL_MISSING';
  readonly modelName: string;
  readonly resourceId: string;
  readonly missingFiles: string[];

  constructor(modelName: string, resourceId: string, displayName: string, missingFiles: string[]) {
    super(`OCR 模型未安装或不完整: ${displayName}`);
    this.name = 'OcrModelMissingError';
    this.modelName = modelName;
    this.resourceId = resourceId;
    this.missingFiles = missingFiles;
  }
}
