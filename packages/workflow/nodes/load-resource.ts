import fs from 'node:fs';
import path from 'node:path';

import { NodeHandler } from '../types';

function detectType(ext: string): 'image' | 'video' | 'audio' | 'document' | 'other' {
  const e = ext.toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(e)) return 'image';
  if (['.mp4', '.webm', '.mov', '.mkv', '.ogv'].includes(e)) return 'video';
  if (['.mp3', '.wav', '.m4a', '.flac', '.opus', '.ogg'].includes(e)) return 'audio';
  if (['.pdf', '.doc', '.docx', '.md', '.txt', '.rtf'].includes(e)) return 'document';
  return 'other';
}

export const LoadResourceNode: NodeHandler = {
  spec: {
    id: 'resource/load',
    label: '加载资源',
    category: 'Resource',
    description: '根据路径加载资源并输出资源元信息',
    inputs: [{ key: 'resource', label: '资源', type: 'any', required: true }],
    outputs: [
      { key: 'resourceId', label: '资源 ID', type: 'string' },
      { key: 'path', label: '路径', type: 'file' },
      { key: 'name', label: '文件名', type: 'string' },
      { key: 'ext', label: '扩展名', type: 'string' },
      { key: 'mime', label: 'MIME', type: 'string' },
      { key: 'kind', label: '类型', type: 'string' }
    ]
  },
  async run({ input }) {
    if (!input.resource) throw new Error('缺少资源');

    let resourceId = '';
    let inputFilePath = '';
    if (typeof input.resource === 'string') {
      inputFilePath = String(input.resource || '');
    } else if (typeof input.resource === 'object' && 'filePath' in input.resource) {
      inputFilePath = String(input.resource.filePath || '');
      if ('id' in input.resource && input.resource.id) {
        resourceId = String((input.resource as any).id || '');
      } else if ('resourceId' in input.resource && input.resource.resourceId) {
        resourceId = String((input.resource as any).resourceId || '');
      }
    }
    if (!inputFilePath) throw new Error('缺少资源路径');
    if (!fs.existsSync(inputFilePath)) throw new Error(`资源不存在: ${inputFilePath}`);
    const name = path.basename(inputFilePath);
    const ext = path.extname(inputFilePath).toLowerCase();
    const kind = detectType(ext);
    const m = guessMime(ext) || 'application/octet-stream';
    return { resourceId, path: inputFilePath, name, ext, mime: m, kind };
  }
};

function guessMime(ext: string): string | undefined {
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.svg':
      return 'image/svg+xml';
    case '.bmp':
      return 'image/bmp';
    case '.ico':
      return 'image/x-icon';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.ogg':
      return 'video/ogg';
    case '.mov':
      return 'video/quicktime';
    case '.mkv':
      return 'video/x-matroska';
    case '.mp3':
      return 'audio/mpeg';
    case '.wav':
      return 'audio/wav';
    case '.m4a':
      return 'audio/mp4';
    case '.flac':
      return 'audio/flac';
    case '.opus':
      return 'audio/ogg';
    case '.ogv':
      return 'video/ogg';
    case '.txt':
      return 'text/plain; charset=utf-8';
    case '.json':
      return 'application/json';
    case '.pdf':
      return 'application/pdf';
    default:
      return undefined;
  }
}
