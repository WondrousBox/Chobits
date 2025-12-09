import { FoldersRepo, ResourcesRepo } from '../../../electron/main/db/repositories';
import { NodeHandler } from '../types';

/**
 * 收集文件夹文本节点
 * - 获取指定文件夹及其子文件夹内所有资源的描述和内容文本
 */
export const CollectFolderTextsNode: NodeHandler = {
  spec: {
    id: 'resource/collect-folder-texts',
    label: '收集文件夹文本',
    category: 'Resource',
    description: '收集指定文件夹及其子文件夹内所有资源的描述和内容文本',
    backgroundColor: '#3b82f6',
    icon: 'TbFolderOpen',
    inputs: [
      {
        key: 'workspaceId',
        label: '工作空间 ID',
        type: 'string',
        required: false,
        description: '工作空间ID（为空时从上下文获取）'
      },
      {
        key: 'folderId',
        label: '文件夹 ID',
        type: 'string',
        required: false,
        description: '要搜索的文件夹ID（为空时从上下文获取）'
      }
    ],
    config: [],
    outputs: [
      {
        key: 'texts',
        label: '收集的文本',
        type: 'string',
        description: '所有资源的描述和内容文本合并后的结果'
      },
      {
        key: 'count',
        label: '资源数量',
        type: 'number',
        description: '收集到的资源数量'
      }
    ]
  },
  async run({ input, ctx, emit }) {
    const folderId = input.folderId ? String(input.folderId) : ctx.folderId;
    const workspaceId = input.workspaceId ? String(input.workspaceId) : ctx.workspaceId;

    if (!workspaceId) {
      throw new Error('工作流执行上下文缺少工作空间 ID (workspaceId)');
    }

    emit('node:progress', { progress: 10, message: '正在查找文件夹...' });

    let targetFolders: any[] = [];

    if (folderId) {
      // 如果指定了 folderId，只查询该文件夹及其子文件夹
      // 先获取整个 workspace 下的所有文件夹（用于构建树结构）
      const allFolders = await FoldersRepo.list(
        {
          workspaceId,
          deletedAt: 0
        } as any,
        10000,
        0
      );

      // 构建文件夹树，找到指定文件夹下的所有子文件夹（递归）
      const getDescendants = (parentId: string | null): string[] => {
        const descendants: string[] = [];
        for (const folder of allFolders) {
          // 正确处理 null 值：folder.parentId 可能是 null，需要严格比较
          const folderParentId = folder.parentId ?? null;
          if (folderParentId === parentId) {
            descendants.push(folder.id);
            descendants.push(...getDescendants(folder.id));
          }
        }
        return descendants;
      };

      // 获取指定文件夹及其所有子文件夹的 ID
      const descendantIds = new Set([folderId, ...getDescendants(folderId)]);

      // 只保留指定文件夹及其子文件夹
      targetFolders = allFolders.filter((f) => descendantIds.has(f.id));
    } else {
      // 如果没有指定 folderId，查询整个工作空间下的所有文件夹
      targetFolders = await FoldersRepo.list(
        {
          workspaceId,
          deletedAt: 0
        } as any,
        10000,
        0
      );
    }

    if (targetFolders.length === 0) {
      emit('node:progress', { progress: 100, message: '未找到符合条件的文件夹' });
      return {
        texts: '',
        count: 0
      };
    }

    emit('node:progress', { progress: 50, message: `正在收集 ${targetFolders.length} 个文件夹内的资源...` });

    // 获取这些文件夹内的所有资源
    const folderIds = targetFolders.map((f) => f.id);
    const allResources: any[] = [];

    // 分批查询资源（避免一次性查询过多）
    for (const fid of folderIds) {
      const resources = await ResourcesRepo.list(
        {
          folderId: fid,
          deletedAt: 0
        } as any,
        10000,
        0
      );
      allResources.push(...resources);
    }

    emit('node:progress', { progress: 80, message: `正在提取 ${allResources.length} 个资源的文本内容...` });

    // 收集所有资源的描述和内容文本
    const texts: string[] = [];

    for (const resource of allResources) {
      if (resource.description) {
        texts.push(`[描述] ${resource.description}`);
      }
      if (resource.contentText) {
        texts.push(`[内容] ${resource.contentText}`);
      }
    }

    const combinedText = texts.join('\n\n');

    emit('node:progress', { progress: 100, message: '完成' });

    return {
      texts: combinedText,
      count: allResources.length
    };
  }
};
