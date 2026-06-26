import path from 'node:path';

export const PADDLE_OCR_PLUGIN_ID = 'plugin:paddle-ocr';
export const DEFAULT_PADDLE_OCR_MODEL = 'ppocr-v6-small';

export type PaddleOcrModelName = 'ppocr-v6-small' | 'ppocr-v6-tiny' | 'ppocr-v6-medium';

export type PaddleOcrModelFiles = {
  detection: string;
  recognition: string;
  charactersDictionary: string;
};

export type PaddleOcrModelSpec = {
  name: PaddleOcrModelName;
  resourceId: string;
  displayName: string;
  description: string;
  files: PaddleOcrModelFiles;
};

export const PADDLE_OCR_MODEL_SPECS: Record<PaddleOcrModelName, PaddleOcrModelSpec> = {
  'ppocr-v6-small': {
    name: 'ppocr-v6-small',
    resourceId: 'ppocr-v6-small',
    displayName: 'PP-OCRv6 Small',
    description: '默认多语言 OCR 模型，平衡速度和准确率',
    files: {
      detection: 'detection/PP-OCRv6_small_det.ort',
      recognition: 'recognition/PP-OCRv6_small_rec.ort',
      charactersDictionary: 'dict/ppocrv6_dict.txt'
    }
  },
  'ppocr-v6-tiny': {
    name: 'ppocr-v6-tiny',
    resourceId: 'ppocr-v6-tiny',
    displayName: 'PP-OCRv6 Tiny',
    description: '更快的多语言 OCR 模型，适合低资源设备',
    files: {
      detection: 'detection/PP-OCRv6_tiny_det.ort',
      recognition: 'recognition/PP-OCRv6_tiny_rec.ort',
      charactersDictionary: 'dict/ppocrv6_tiny_dict.txt'
    }
  },
  'ppocr-v6-medium': {
    name: 'ppocr-v6-medium',
    resourceId: 'ppocr-v6-medium',
    displayName: 'PP-OCRv6 Medium',
    description: '更高准确率的多语言 OCR 模型，初始化和推理更重',
    files: {
      detection: 'detection/PP-OCRv6_medium_det.ort',
      recognition: 'recognition/PP-OCRv6_medium_rec.ort',
      charactersDictionary: 'dict/ppocrv6_dict.txt'
    }
  }
};

export function normalizePaddleOcrModelName(value: unknown): PaddleOcrModelName {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_PADDLE_OCR_MODEL;
  return raw in PADDLE_OCR_MODEL_SPECS ? (raw as PaddleOcrModelName) : DEFAULT_PADDLE_OCR_MODEL;
}

export function resolvePaddleOcrModelFiles(modelDir: string, spec: PaddleOcrModelSpec): PaddleOcrModelFiles {
  return {
    detection: path.join(modelDir, spec.files.detection),
    recognition: path.join(modelDir, spec.files.recognition),
    charactersDictionary: path.join(modelDir, spec.files.charactersDictionary)
  };
}
