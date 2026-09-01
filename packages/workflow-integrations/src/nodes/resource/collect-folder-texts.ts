import { defineNode } from '@chobits/workflow/sdk';

import { WORKFLOW_RESOURCE_READ, type WorkflowIntegrationDataRecord } from '../../capabilities/resources';

export const CollectFolderTextsNode = defineNode({
  spec: {
    id: 'resource/collect-folder-texts',
    label: '收集文件夹文本',
    category: 'Resource',
    description: '收集指定文件夹及其子文件夹内所有资源的描述和内容文本',
    backgroundColor: '#3b82f6',
    icon: 'TbFolderOpen',
    inputs: [
      { key: 'workspaceId', label: '工作空间 ID', type: 'string', required: false, description: '工作空间ID（为空时从上下文获取）' },
      { key: 'folderId', label: '文件夹 ID', type: 'string', required: false, description: '要搜索的文件夹ID（为空时从上下文获取）' }
    ],
    config: [],
    outputs: [
      { key: 'texts', label: '收集的文本', type: 'string', description: '所有资源的描述和内容文本合并后的结果' },
      { key: 'count', label: '资源数量', type: 'number', description: '收集到的资源数量' }
    ]
  },
  requiredCapabilities: [WORKFLOW_RESOURCE_READ],
  execution: { group: 'resource-io' },
  async run({ input, ctx, emit, capabilities }) {
    const folderId = input.folderId ? String(input.folderId) : ctx.folderId;
    const workspaceId = input.workspaceId ? String(input.workspaceId) : ctx.workspaceId;
    if (!workspaceId) throw new Error('工作流执行上下文缺少工作空间 ID (workspaceId)');

    const readers = capabilities.require(WORKFLOW_RESOURCE_READ);
    emit('node:progress', { progress: 10, message: '正在查找文件夹...' });
    const allFolders = await readers.folders.list({ workspaceId, deletedAt: 0 }, 10000, 0);
    let targetFolders: WorkflowIntegrationDataRecord[];

    if (folderId) {
      const visited = new Set<string>([folderId]);
      const descendantIds: string[] = [];
      const collectDescendants = (parentId: string): void => {
        for (const folder of allFolders) {
          const id = String(folder.id || '');
          if (!id || visited.has(id) || (folder.parentId ?? null) !== parentId) continue;
          visited.add(id);
          descendantIds.push(id);
          collectDescendants(id);
        }
      };
      collectDescendants(folderId);
      const selectedIds = new Set([folderId, ...descendantIds]);
      targetFolders = allFolders.filter((folder) => selectedIds.has(String(folder.id)));
    } else {
      targetFolders = allFolders;
    }

    if (targetFolders.length === 0) {
      emit('node:progress', { progress: 100, message: '未找到符合条件的文件夹' });
      return { texts: '', count: 0 };
    }

    emit('node:progress', { progress: 50, message: `正在收集 ${targetFolders.length} 个文件夹内的资源...` });
    const allResources: WorkflowIntegrationDataRecord[] = [];
    for (const folder of targetFolders) {
      const resources = await readers.resources.list({ folderId: folder.id, deletedAt: 0 }, 10000, 0);
      allResources.push(...resources);
    }

    emit('node:progress', { progress: 80, message: `正在提取 ${allResources.length} 个资源的文本内容...` });
    const texts: string[] = [];
    for (const resource of allResources) {
      if (resource.description) texts.push(`[描述] ${resource.description}`);
      if (resource.contentText) texts.push(`[内容] ${resource.contentText}`);
    }
    emit('node:progress', { progress: 100, message: '完成' });
    return { texts: texts.join('\n\n'), count: allResources.length };
  }
});
