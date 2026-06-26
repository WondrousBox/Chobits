import { ipcMain } from 'electron';

import { ocrService } from './service';
import { OcrModelMissingError, type OcrRecognizeImageRequest } from './types';

function serializeError(error: unknown): { error: string; code?: string; data?: Record<string, unknown> } {
  if (error instanceof OcrModelMissingError) {
    return {
      error: error.message,
      code: error.code,
      data: {
        modelName: error.modelName,
        resourceId: error.resourceId,
        missingFiles: error.missingFiles
      }
    };
  }
  return {
    error: error instanceof Error ? error.message : String(error)
  };
}

export function initOcrHandlers(): void {
  ipcMain.handle('ocr:listModels', async () => {
    try {
      return { ok: true, data: ocrService.listModels() };
    } catch (error) {
      return { ok: false, ...serializeError(error) };
    }
  });

  ipcMain.handle('ocr:recognizeImage', async (_event, payload?: OcrRecognizeImageRequest) => {
    try {
      if (!payload || !payload.imagePath) {
        return { ok: false, error: '缺少图片路径', code: 'OCR_IMAGE_PATH_REQUIRED' };
      }
      return { ok: true, data: await ocrService.recognizeImage(payload) };
    } catch (error) {
      return { ok: false, ...serializeError(error) };
    }
  });

  ipcMain.handle('ocr:destroyRuntime', async () => {
    try {
      await ocrService.destroy();
      return { ok: true };
    } catch (error) {
      return { ok: false, ...serializeError(error) };
    }
  });
}
