import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

import { FoldersRepo, ResourcesRepo } from '../../../electron/main/db/repositories';
import { NodeHandler } from '../types';

dayjs.extend(isoWeek);

/**
 * 收集文件夹文本节点
 * - 获取指定文件夹内所有以"年-月-日"格式命名的子文件夹
 * - 根据时间模式（本周、本日、本月）筛选文件夹
 * - 收集这些文件夹内所有资源的描述文本和内容文本
 */
export const CollectFolderTextsNode: NodeHandler = {
  spec: {
    id: 'resource/collect-folder-texts',
    label: '收集文件夹文本',
    category: 'Resource',
    description: '收集指定时间范围内以"年-月-日"格式命名的文件夹内所有资源的描述和内容文本',
    backgroundColor: '#3b82f6',
    icon: 'TbFolderOpen',
    inputs: [
      {
        key: 'folderId',
        label: '文件夹 ID',
        type: 'string',
        required: false,
        description: '要搜索的文件夹ID（为空时从上下文获取）'
      }
    ],
    config: [
      {
        key: 'timeMode',
        label: '时间模式',
        type: 'string',
        required: true,
        default: 'today',
        description: '选择要收集的时间范围',
        inputType: 'select',
        options: [
          { value: 'today', label: '本日' },
          { value: 'week', label: '本周' },
          { value: 'month', label: '本月' }
        ]
      }
    ],
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
  async run({ input, config, ctx, emit }) {
    const timeMode = String(config?.timeMode || 'today');
    const folderId = input.folderId ? String(input.folderId) : ctx.folderId;
    const workspaceId = ctx.workspaceId;

    if (!workspaceId) {
      throw new Error('工作流执行上下文缺少工作空间 ID (workspaceId)');
    }

    emit('node:progress', { progress: 10, message: '正在查找符合条件的文件夹...' });

    // 获取所有文件夹
    const allFolders = await FoldersRepo.list(
      {
        workspaceId,
        deletedAt: 0
      } as any,
      10000,
      0
    );

    // 匹配"年-月-日"格式的正则表达式 (YYYY-MM-DD)
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    // 如果指定了 folderId，需要递归查找该文件夹下的所有子文件夹
    let candidateFolders = allFolders;
    if (folderId) {
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

      const descendantIds = new Set([folderId, ...getDescendants(folderId)]);
      candidateFolders = allFolders.filter((f) => descendantIds.has(f.id));
    }

    // 筛选出符合日期格式的文件夹
    const dateFolders = candidateFolders.filter((folder) => {
      if (!folder.name) return false;
      return datePattern.test(folder.name);
    });

    emit('node:progress', { progress: 30, message: '正在根据时间模式筛选文件夹...' });

    // 根据时间模式筛选文件夹
    const now = dayjs();
    let targetFolders: typeof dateFolders = [];

    switch (timeMode) {
      case 'today': {
        const today = now.format('YYYY-MM-DD');
        targetFolders = dateFolders.filter((f) => f.name === today);
        break;
      }
      case 'week': {
        const weekStart = now.startOf('isoWeek').startOf('day');
        const weekEnd = now.endOf('isoWeek').endOf('day');
        targetFolders = dateFolders.filter((f) => {
          if (!f.name) return false;
          const folderDate = dayjs(f.name, 'YYYY-MM-DD').startOf('day');
          if (!folderDate.isValid()) return false;
          const folderTime = folderDate.valueOf();
          return folderTime >= weekStart.valueOf() && folderTime <= weekEnd.valueOf();
        });
        break;
      }
      case 'month': {
        const monthStart = now.startOf('month').startOf('day');
        const monthEnd = now.endOf('month').endOf('day');
        targetFolders = dateFolders.filter((f) => {
          if (!f.name) return false;
          const folderDate = dayjs(f.name, 'YYYY-MM-DD').startOf('day');
          if (!folderDate.isValid()) return false;
          const folderTime = folderDate.valueOf();
          return folderTime >= monthStart.valueOf() && folderTime <= monthEnd.valueOf();
        });
        break;
      }
      default:
        throw new Error(`未知的时间模式: ${timeMode}`);
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
