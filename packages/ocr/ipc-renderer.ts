import { ipcRenderer } from 'electron';

import type { OcrModelInfo, OcrRecognizeImageRequest, OcrRecognizeImageResult } from './types';

export type OcrIpcResponse<T = void> = {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
};

export const ocrIpcRenderer = {
  listModels: (): Promise<OcrIpcResponse<OcrModelInfo[]>> => ipcRenderer.invoke('ocr:listModels'),
  recognizeImage: (payload: OcrRecognizeImageRequest): Promise<OcrIpcResponse<OcrRecognizeImageResult>> => ipcRenderer.invoke('ocr:recognizeImage', payload),
  destroyRuntime: (): Promise<OcrIpcResponse> => ipcRenderer.invoke('ocr:destroyRuntime')
};

export type OcrIpcRendererType = typeof ocrIpcRenderer;
