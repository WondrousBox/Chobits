import path from 'node:path';

import { ResourcesRepo } from '../../common/db';
import { NodeHandler } from '../types';

export const ResourceLoadNode: NodeHandler = {
  spec: {
    id: 'resource/load',
    label: '加载资源',
    category: 'Resource',
    description: '根据资源 ID 加载资源并输出资源元信息',
    backgroundColor: '#3b82f6',
    icon: 'TbFileDownload',
    inputs: [{ key: 'resourceId', label: '资源 ID', type: 'string', required: true }],
    outputs: [
      { key: 'resource', label: '资源对象', type: 'resource', description: '完整资源对象' },
      { key: 'resourceId', label: '资源 ID', type: 'string', description: '资源唯一标识' },
      { key: 'path', label: '文件路径', type: 'string', description: '资源本地文件路径' },
      { key: 'name', label: '文件名', type: 'string', description: '资源文件名' },
      { key: 'ext', label: '扩展名', type: 'string', description: '资源扩展名' },
      { key: 'mime', label: 'MIME 类型', type: 'string', description: '资源 MIME 类型' },
      { key: 'kind', label: '资源类型', type: 'string', description: '资源类型（image/video/audio/text等）' },
      { key: 'contentText', label: '内容文本', type: 'string', description: '资源文本内容' }
    ]
  },
  async run({ input }) {
    const resourceId = String(input.resourceId || '').trim();
    if (!resourceId) throw new Error('缺少资源 ID');

    const resource = await ResourcesRepo.getById(resourceId);
    if (!resource) throw new Error(`未找到 ID 为 ${resourceId} 的资源`);

    const ext = resource.filePath ? path.extname(resource.filePath).toLowerCase() : '';

    return {
      resource,
      resourceId: resource.id,
      path: resource.filePath,
      name: resource.title,
      ext,
      mime: resource.mimeType,
      kind: resource.type,
      contentText: resource.contentText
    };
  }
};
