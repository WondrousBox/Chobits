import fs from 'node:fs';

import { Plugin } from '../types';

export const TesseractPlugin: Plugin = {
  id: 'plugin:tesseract',
  label: 'Tesseract OCR',
  description: 'Provides OCR capability via tesseract-ocr',
  capabilities: ['ocr'],
  installHint: 'Download tesseract from https://github.com/UB-Mannheim/tesseract/wiki',
  async isInstalled(ctx) {
    if (!ctx.pluginResourceManager) {
      return false;
    }
    const cands = ctx.pluginResourceManager.getEnginePath('plugin:tesseract', 'tesseract');
    return fs.existsSync(cands);
  },
  async prepare() {
    // nothing
  }
};
