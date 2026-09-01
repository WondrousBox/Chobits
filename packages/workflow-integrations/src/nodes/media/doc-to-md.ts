import fs from 'node:fs';
import path from 'node:path';

import type { NodeHandler } from '@chobits/workflow';

// NOTE: Real implementation for doc/docx -> md might use mammoth or office parser libs.
// Here we stub basic txt/pdf passthrough for demonstration.
export const DocToMarkdownNode: NodeHandler = {
  spec: {
    id: 'doc/to-markdown',
    label: '文档转 Markdown',
    category: 'Document',
    description: '提取文档文本并转换为 Markdown (示例实现)',
    inputs: [{ key: 'file', label: '文档路径', type: ['file', 'string'], required: true }],
    outputs: [{ key: 'markdown', label: 'Markdown 内容', type: 'string' }]
  },
  execution: { group: 'resource-io' },
  async run({ input }) {
    const p = String(input.file || '');
    if (!p) throw new Error('缺少文档路径');
    if (!fs.existsSync(p)) throw new Error(`文档不存在: ${p}`);
    const ext = path.extname(p).toLowerCase();
    let content = '';
    if (ext === '.txt' || ext === '.md') content = fs.readFileSync(p, 'utf8');
    else if (ext === '.pdf') content = '[PDF 提取待实现]\n';
    else if (ext === '.doc' || ext === '.docx') content = '[DOCX 提取待实现]\n';
    else content = '[未知格式]\n';
    // naive transform
    const md = content.replace(/\r\n/g, '\n');
    return { markdown: md };
  }
};
