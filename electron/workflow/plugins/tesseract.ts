import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { Plugin } from '../types';

function existsInPath(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(process.platform === 'win32' ? 'where' : 'which', [cmd]);
    child.on('exit', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

function getBinaryCandidates(resourcesDir: string): string[] {
  const plat = process.platform;
  const base = path.join(resourcesDir, 'tesseract');
  const list: string[] = [];
  if (plat === 'darwin') list.push(path.join(base, 'darwin', 'tesseract'));
  else if (plat === 'linux') list.push(path.join(base, 'linux', 'tesseract'));
  else if (plat === 'win32') list.push(path.join(base, 'win32', 'tesseract.exe'));
  return list;
}

export const TesseractPlugin: Plugin = {
  id: 'plugin:tesseract',
  label: 'Tesseract OCR',
  description: 'Provides OCR capability via tesseract-ocr',
  capabilities: ['ocr'],
  installHint:
    process.platform === 'darwin'
      ? 'brew install tesseract'
      : process.platform === 'win32'
        ? 'Download tesseract from https://github.com/UB-Mannheim/tesseract/wiki'
        : 'sudo apt-get install tesseract-ocr',
  async isInstalled(ctx) {
    const cands = getBinaryCandidates(ctx.resourcesDir);
    for (const p of cands) if (fs.existsSync(p)) return true;
    return await existsInPath('tesseract');
  },
  async prepare() {
    // nothing
  }
};
