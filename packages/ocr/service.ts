import fs from 'node:fs';

import { type PluginResourceManager, pluginResourceManager } from '../plugins';
import { PADDLE_OCR_MODEL_SPECS, PADDLE_OCR_PLUGIN_ID, resolvePaddleOcrModelFiles } from './paddle-ocr-models';
import { destroyPaddleOcrServices, recognizeWithPaddleOcr } from './paddle-ocr-runtime';
import type { OcrModelInfo, OcrRecognizeImageRequest, OcrRecognizeImageResult } from './types';

export type OcrServiceDeps = {
  pluginResourceManager?: PluginResourceManager;
};

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export class OcrService {
  constructor(private deps: OcrServiceDeps = {}) {}

  setPluginResourceManager(manager: PluginResourceManager): void {
    this.deps.pluginResourceManager = manager;
  }

  private getPluginResourceManager(): PluginResourceManager {
    if (!this.deps.pluginResourceManager) {
      throw new Error('OCR 模型管理器不可用');
    }
    return this.deps.pluginResourceManager;
  }

  listModels(): OcrModelInfo[] {
    const manager = this.getPluginResourceManager();
    return Object.values(PADDLE_OCR_MODEL_SPECS).map((spec) => {
      const modelDir = manager.getModelPath(PADDLE_OCR_PLUGIN_ID, spec.name);
      const files = resolvePaddleOcrModelFiles(modelDir, spec);
      const missingFiles = Object.values(files).filter((filePath) => !fileExists(filePath));
      return {
        engine: 'paddle',
        name: spec.name,
        resourceId: spec.resourceId,
        displayName: spec.displayName,
        description: spec.description,
        installed: missingFiles.length === 0,
        missingFiles
      };
    });
  }

  async recognizeImage(request: OcrRecognizeImageRequest): Promise<OcrRecognizeImageResult> {
    const engine = request.engine || 'paddle';
    if (engine !== 'paddle') {
      throw new Error(`不支持的 OCR 引擎: ${engine}`);
    }

    const result = await recognizeWithPaddleOcr(request.imagePath, this.getPluginResourceManager(), {
      model: request.model,
      strategy: request.strategy,
      processingEngine: request.processingEngine,
      maxSideLength: request.maxSideLength,
      noCache: request.noCache,
      flatten: request.flatten,
      executionProviders: request.executionProviders,
      verbose: request.verbose
    });

    return {
      engine,
      text: result.text,
      results: result.results,
      confidence: result.confidence,
      modelName: result.model.modelName,
      modelDisplayName: result.model.displayName
    };
  }

  async destroy(): Promise<void> {
    await destroyPaddleOcrServices();
  }
}

export function createOcrService(deps: OcrServiceDeps = {}): OcrService {
  return new OcrService(deps);
}

export const ocrService = createOcrService({ pluginResourceManager });
