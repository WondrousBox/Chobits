import fs from 'node:fs';
import path from 'node:path';

import { NodeHandler } from '../types';

// 音视频展示节点：用于在工作流节点中预览音频或视频
export const DisplayMediaNode: NodeHandler = {
  spec: {
    id: 'ui/display-media',
    label: '音视频展示',
    category: 'Display',
    description: '展示上游节点输出的音频或视频文件',
    inputs: [{ key: 'media', label: '媒体文件', type: ['file', 'string'], required: true, description: '本地音频/视频文件路径' }],
    config: [
      {
        key: 'autoPlay',
        label: '自动播放',
        type: 'boolean',
        required: false,
        default: false,
        description: '用于前端渲染时的自动播放建议'
      }
    ],
    outputs: [
      { key: 'media', label: '媒体文件', type: ['file', 'string'] },
      { key: 'ext', label: '扩展名', type: 'string' }
    ]
  },
  async run({ input }) {
    const raw = input.media;
    if (!raw) throw new Error('缺少媒体文件');
    const media = String(raw);
    if (!fs.existsSync(media)) throw new Error(`媒体文件不存在: ${media}`);
    const ext = path.extname(media).toLowerCase();
    return { media, ext };
  }
};
