import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { NodeHandler } from '../types';

export const OCRNode: NodeHandler = {
  spec: {
    id: 'image/ocr',
    label: '文字识别 (OCR)',
    category: 'Image',
    description: '基于 Tesseract 的图片文字识别',
    requires: ['plugin:tesseract'],
    inputs: [
      { key: 'image', label: '图片路径', type: ['file', 'string'], required: true },
      { key: 'lang', label: '语言', type: 'string', required: false, description: '如 eng, chi_sim' }
    ],
    outputs: [{ key: 'text', label: '识别文本', type: 'string' }]
  },
  async run({ input, ctx }) {
    const src = String(input.image || '');
    if (!src) throw new Error('缺少图片路径');
    if (!fs.existsSync(src)) throw new Error(`图片不存在: ${src}`);
    const outBase = path.join(ctx.tmpDir, 'ocr-' + path.basename(src).replace(/\W+/g, ''));
    const args = [src, outBase];
    if (input.lang) args.push('-l', String(input.lang));

    await new Promise<void>((resolve, reject) => {
      const child = spawn('tesseract', args);
      child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('tesseract failed: ' + code))));
      child.on('error', (e) => reject(e));
    });
    const txt = fs.readFileSync(outBase + '.txt', 'utf8');
    return { text: txt };
  }
};
