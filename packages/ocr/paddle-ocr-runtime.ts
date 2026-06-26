import fs from 'node:fs';
import path from 'node:path';

import type { FlattenedPaddleOcrResult, PaddleOcrResult, ProcessingEngine, RecognitionStrategy } from 'ppu-paddle-ocr';
import { PaddleOcrService } from 'ppu-paddle-ocr';

import type { PluginResourceManager } from '../plugins';
import { DEFAULT_PADDLE_OCR_MODEL, normalizePaddleOcrModelName, PADDLE_OCR_MODEL_SPECS, PADDLE_OCR_PLUGIN_ID, resolvePaddleOcrModelFiles } from './paddle-ocr-models';
import { OcrModelMissingError } from './types';

export type PaddleOcrRuntimeOptions = {
  model?: string;
  strategy?: RecognitionStrategy;
  processingEngine?: ProcessingEngine;
  maxSideLength?: number;
  noCache?: boolean;
  flatten?: boolean;
  executionProviders?: string[];
  verbose?: boolean;
};

export type ResolvedPaddleOcrModel = {
  modelName: string;
  modelDir: string;
  displayName: string;
  detectionPath: string;
  recognitionPath: string;
  dictionaryPath: string;
};

type RuntimeCacheEntry = {
  service: PaddleOcrService;
  model: ResolvedPaddleOcrModel;
};

const serviceCache = new Map<string, RuntimeCacheEntry>();

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function parsePositiveNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

function normalizeStrategy(value: unknown): RecognitionStrategy {
  return value === 'per-line' || value === 'cross-line' || value === 'per-box' ? value : 'per-box';
}

function normalizeProcessingEngine(value: unknown): ProcessingEngine {
  return value === 'canvas-native' ? 'canvas-native' : 'opencv';
}

function normalizeExecutionProviders(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map(String)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return ['cpu'];
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(arrayBuffer).set(buffer);
  return arrayBuffer;
}

export function resolvePaddleOcrModel(pluginResourceManager: PluginResourceManager | undefined, modelNameInput?: string): ResolvedPaddleOcrModel {
  if (!pluginResourceManager) {
    throw new Error('Paddle OCR 模型管理器不可用');
  }

  const modelName = normalizePaddleOcrModelName(modelNameInput || DEFAULT_PADDLE_OCR_MODEL);
  const spec = PADDLE_OCR_MODEL_SPECS[modelName];
  const modelDir = pluginResourceManager.getModelPath(PADDLE_OCR_PLUGIN_ID, modelName);
  const files = resolvePaddleOcrModelFiles(modelDir, spec);

  const missingFiles = [
    ['detection', files.detection],
    ['recognition', files.recognition],
    ['dictionary', files.charactersDictionary]
  ]
    .filter(([, filePath]) => !fileExists(filePath))
    .map(([, filePath]) => filePath);

  if (missingFiles.length > 0) {
    throw new OcrModelMissingError(spec.name, spec.resourceId, spec.displayName, missingFiles);
  }

  return {
    modelName,
    modelDir,
    displayName: spec.displayName,
    detectionPath: files.detection,
    recognitionPath: files.recognition,
    dictionaryPath: files.charactersDictionary
  };
}

async function getService(pluginResourceManager: PluginResourceManager, options: PaddleOcrRuntimeOptions): Promise<RuntimeCacheEntry> {
  const model = resolvePaddleOcrModel(pluginResourceManager, options.model);
  const strategy = normalizeStrategy(options.strategy);
  const processingEngine = normalizeProcessingEngine(options.processingEngine);
  const maxSideLength = parsePositiveNumber(options.maxSideLength);
  const executionProviders = normalizeExecutionProviders(options.executionProviders);
  const cacheKey = JSON.stringify({
    model: model.modelName,
    strategy,
    processingEngine,
    maxSideLength,
    executionProviders
  });

  const cached = serviceCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const service = new PaddleOcrService({
    model: {
      detection: model.detectionPath,
      recognition: model.recognitionPath,
      charactersDictionary: model.dictionaryPath
    },
    detection: {
      ...(maxSideLength ? { maxSideLength } : {})
    },
    recognition: {
      charactersDictionary: [],
      strategy
    },
    processing: {
      engine: processingEngine
    },
    session: {
      executionProviders
    },
    debugging: {
      verbose: Boolean(options.verbose),
      debug: false
    }
  });

  await service.initialize();

  const entry = { service, model };
  serviceCache.set(cacheKey, entry);
  return entry;
}

export async function recognizeWithPaddleOcr(
  imagePath: string,
  pluginResourceManager: PluginResourceManager | undefined,
  options: PaddleOcrRuntimeOptions = {}
): Promise<{ text: string; results: unknown; confidence?: number; model: ResolvedPaddleOcrModel }> {
  if (!pluginResourceManager) {
    throw new Error('Paddle OCR 模型管理器不可用');
  }
  if (!imagePath) {
    throw new Error('缺少图片路径');
  }
  if (!fileExists(imagePath)) {
    throw new Error(`图片不存在: ${imagePath}`);
  }

  const { service, model } = await getService(pluginResourceManager, options);
  const imageBuffer = await fs.promises.readFile(path.resolve(imagePath));
  const imageArrayBuffer = toArrayBuffer(imageBuffer);
  const flatten = options.flatten !== false;

  if (flatten) {
    const result = (await service.recognize(imageArrayBuffer, {
      flatten: true,
      noCache: Boolean(options.noCache),
      strategy: normalizeStrategy(options.strategy)
    })) as FlattenedPaddleOcrResult;
    return {
      text: result.text || '',
      results: result.results || [],
      confidence: result.confidence,
      model
    };
  }

  const result = (await service.recognize(imageArrayBuffer, {
    flatten: false,
    noCache: Boolean(options.noCache),
    strategy: normalizeStrategy(options.strategy)
  })) as PaddleOcrResult;

  return {
    text: result.text || '',
    results: result,
    confidence: result.confidence,
    model
  };
}

export async function destroyPaddleOcrServices(): Promise<void> {
  const entries = [...serviceCache.values()];
  serviceCache.clear();
  await Promise.all(entries.map((entry) => entry.service.destroy().catch(() => undefined)));
}
