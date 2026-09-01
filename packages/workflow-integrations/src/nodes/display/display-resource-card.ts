import type { NodeHandler } from '@chobits/workflow';

// 资源卡片展示节点：用于在节点中展示资源的核心信息和缩略图
export const DisplayResourceCardNode: NodeHandler = {
  spec: {
    id: 'ui/display-resource-card',
    label: '资源卡片展示',
    category: 'Display',
    description: '展示资源的标题、缩略图等信息，便于在工作流中浏览结果',
    backgroundColor: '#f7b947',
    icon: 'TbSquare',
    inputs: [{ key: 'resource', label: '资源对象', type: 'resource', required: true, description: '来自资源系统的 Resource 对象' }],
    outputs: [
      { key: 'resource', label: '资源对象', type: 'resource' },
      { key: 'resourceId', label: '资源 ID', type: 'string' },
      { key: 'title', label: '标题', type: 'string' },
      { key: 'description', label: '描述', type: 'string' },
      { key: 'filePath', label: '文件路径', type: ['file', 'string'] },
      { key: 'thumbnailPath', label: '缩略图路径', type: ['file', 'string'] },
      { key: 'type', label: '类型', type: 'string' },
      { key: 'status', label: '状态', type: 'string' }
    ]
  },
  async run({ input }) {
    const res = input.resource || {};
    if (!res) throw new Error('缺少资源对象');

    const resourceId = String(res.id || res.resourceId || '');
    const title = String(res.title || '');
    const description = String(res.description || '');
    const filePath = res.filePath ? String(res.filePath) : '';
    const thumbnailPath = res.thumbnailPath ? String(res.thumbnailPath) : '';
    const type = String(res.type || '');
    const status = String(res.status || '');

    const normalized = { resource: res, resourceId, title, description, filePath, thumbnailPath, type, status };
    return normalized as any;
  }
};
