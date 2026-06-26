import fs from 'node:fs';

import { normalizePaddleOcrModelName, PADDLE_OCR_MODEL_SPECS, PADDLE_OCR_PLUGIN_ID, resolvePaddleOcrModelFiles } from '../../ocr/paddle-ocr-models';
import type { MissingModel, Plugin } from '../types';

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export const PaddleOcrPlugin: Plugin = {
  id: PADDLE_OCR_PLUGIN_ID,
  label: 'Paddle OCR',
  description: '基于 ppu-paddle-ocr 与 ONNX Runtime 的本地 OCR 引擎',
  capabilities: ['ocr'],
  installHint: '通过插件资源管理器下载 Paddle OCR 模型',

  async isInstalled() {
    try {
      await import('ppu-paddle-ocr');
      return true;
    } catch {
      return false;
    }
  },

  async checkRequiredModels(ctx, nodeConfig): Promise<MissingModel[]> {
    const modelName = normalizePaddleOcrModelName(nodeConfig?.model);
    const spec = PADDLE_OCR_MODEL_SPECS[modelName];
    if (!ctx.pluginResourceManager) {
      return [
        {
          pluginId: PADDLE_OCR_PLUGIN_ID,
          modelName,
          resourceId: spec.resourceId,
          displayName: spec.displayName
        }
      ];
    }

    const modelDir = ctx.pluginResourceManager.getModelPath(PADDLE_OCR_PLUGIN_ID, modelName);
    const files = resolvePaddleOcrModelFiles(modelDir, spec);
    const installed = fileExists(files.detection) && fileExists(files.recognition) && fileExists(files.charactersDictionary);

    return installed
      ? []
      : [
          {
            pluginId: PADDLE_OCR_PLUGIN_ID,
            modelName,
            resourceId: spec.resourceId,
            displayName: spec.displayName
          }
        ];
  }
};
