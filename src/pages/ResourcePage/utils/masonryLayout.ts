import type { MasonryLayoutConfig, MasonryLayoutGroup, MasonryLayoutItem, ResourceItem, ViewMode } from '@/types';

const folderAPI: any = window.YUA?.folder;

/**
 * 加载文件夹的瀑布流布局配置
 */
export async function loadMasonryLayout(folderId: string): Promise<MasonryLayoutConfig | null> {
  if (!folderId || !folderAPI) return null;
  try {
    const result = await folderAPI['folder.getMasonryLayout']({ folderId });
    if (result?.success && result.data) {
      return result.data as MasonryLayoutConfig;
    }
    return null;
  } catch (e) {
    console.warn('load masonry layout failed', e);
    return null;
  }
}

/**
 * 保存文件夹的瀑布流布局配置
 */
export async function saveMasonryLayout(folderId: string, layout: MasonryLayoutConfig): Promise<boolean> {
  if (!folderId || !folderAPI || !layout) return false;
  try {
    const result = await folderAPI['folder.saveMasonryLayout']({ folderId, layout });
    return result?.success === true;
  } catch (e) {
    console.warn('save masonry layout failed', e);
    return false;
  }
}

/**
 * 创建默认的布局配置
 */
export function createDefaultLayoutConfig(resourceIds: string[], viewMode: ViewMode = 'grid'): MasonryLayoutConfig {
  return {
    version: '1.0.0',
    viewMode,
    items: resourceIds.map((id, index) => ({
      resourceId: id,
      fullWidth: false,
      order: index
    })),
    groups: []
  };
}

/**
 * 根据布局配置获取资源的布局信息
 */
export function getResourceLayout(
  item: MasonryLayoutItem,
  groups?: MasonryLayoutGroup[]
): {
  fullWidth: boolean;
  groupId?: string;
  group?: MasonryLayoutGroup;
} {
  const group = item.groupId ? groups?.find((g) => g.id === item.groupId) : undefined;
  return {
    fullWidth: item.fullWidth || false,
    groupId: item.groupId,
    group
  };
}

/**
 * 检查资源是否属于某个分组
 */
export function isResourceInGroup(resourceId: string, groups?: MasonryLayoutGroup[]): MasonryLayoutGroup | undefined {
  return groups?.find((g) => g.resourceIds.includes(resourceId));
}

/**
 * 设置资源全宽
 */
export function setResourceFullWidth(config: MasonryLayoutConfig, resourceId: string, fullWidth: boolean): MasonryLayoutConfig {
  return {
    ...config,
    items: config.items.map((item) => (item.resourceId === resourceId ? { ...item, fullWidth } : item))
  };
}

/**
 * 创建新分组
 */
export function createGroup(config: MasonryLayoutConfig, resourceIds: string[], name?: string, layout: 'grid' | 'list' = 'grid'): MasonryLayoutConfig {
  const groupId = `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const newGroup: MasonryLayoutGroup = {
    id: groupId,
    name: name || '新分组',
    resourceIds,
    layout,
    order: (config.groups?.length || 0) + 1
  };

  // 更新资源的分组ID
  const updatedItems = config.items.map((item) => {
    if (resourceIds.includes(item.resourceId)) {
      return { ...item, groupId };
    }
    return item;
  });

  return {
    ...config,
    items: updatedItems,
    groups: [...(config.groups || []), newGroup]
  };
}

/**
 * 将资源添加到分组
 */
export function addResourcesToGroup(config: MasonryLayoutConfig, groupId: string, resourceIds: string[]): MasonryLayoutConfig {
  const group = config.groups?.find((g) => g.id === groupId);
  if (!group) return config;

  const updatedGroup = {
    ...group,
    resourceIds: [...new Set([...group.resourceIds, ...resourceIds])]
  };

  const updatedItems = config.items.map((item) => {
    if (resourceIds.includes(item.resourceId)) {
      return { ...item, groupId };
    }
    return item;
  });

  return {
    ...config,
    items: updatedItems,
    groups: config.groups?.map((g) => (g.id === groupId ? updatedGroup : g)) || []
  };
}

/**
 * 从分组中移除资源
 */
export function removeResourcesFromGroup(config: MasonryLayoutConfig, groupId: string, resourceIds: string[]): MasonryLayoutConfig {
  const group = config.groups?.find((g) => g.id === groupId);
  if (!group) return config;

  const updatedGroup = {
    ...group,
    resourceIds: group.resourceIds.filter((id) => !resourceIds.includes(id))
  };

  const updatedItems = config.items.map((item) => {
    if (resourceIds.includes(item.resourceId) && item.groupId === groupId) {
      const { groupId: _, ...rest } = item;
      return rest;
    }
    return item;
  });

  // 如果分组为空，删除分组
  const updatedGroups = updatedGroup.resourceIds.length > 0 ? config.groups?.map((g) => (g.id === groupId ? updatedGroup : g)) : config.groups?.filter((g) => g.id !== groupId);

  return {
    ...config,
    items: updatedItems,
    groups: updatedGroups || []
  };
}

/**
 * 重命名分组
 */
export function renameGroup(config: MasonryLayoutConfig, groupId: string, name: string): MasonryLayoutConfig {
  return {
    ...config,
    groups: config.groups?.map((g) => (g.id === groupId ? { ...g, name } : g)) || []
  };
}

/**
 * 设置分组布局
 */
export function setGroupLayout(config: MasonryLayoutConfig, groupId: string, layout: 'grid' | 'list'): MasonryLayoutConfig {
  return {
    ...config,
    groups: config.groups?.map((g) => (g.id === groupId ? { ...g, layout } : g)) || []
  };
}

/**
 * 更新资源顺序
 */
export function updateResourceOrder(config: MasonryLayoutConfig, resourceIds: string[]): MasonryLayoutConfig {
  const orderMap = new Map<string, number>();
  resourceIds.forEach((id, index) => orderMap.set(id, index));

  return {
    ...config,
    items: config.items.map((item) => ({
      ...item,
      order: orderMap.get(item.resourceId) ?? item.order ?? 0
    }))
  };
}

/**
 * 更新分组顺序
 */
export function updateGroupOrder(config: MasonryLayoutConfig, groupIds: string[]): MasonryLayoutConfig {
  const orderMap = new Map<string, number>();
  groupIds.forEach((id, index) => orderMap.set(id, index));

  return {
    ...config,
    groups:
      config.groups?.map((g) => ({
        ...g,
        order: orderMap.get(g.id) ?? g.order ?? 0
      })) || []
  };
}

export function syncLayoutConfigWithResources(
  config: MasonryLayoutConfig,
  resources: ResourceItem[]
): {
  config: MasonryLayoutConfig;
  addedResourceIds: string[];
  removedResourceIds: string[];
  removedGroupIds: string[];
  changed: boolean;
} {
  const resourceIdSet = new Set(resources.map((r) => r.id));
  const updatedItems: MasonryLayoutItem[] = [];
  const addedResourceIds: string[] = [];
  const removedResourceIds: string[] = [];

  let maxOrder = 0;

  config.items.forEach((item) => {
    if (!resourceIdSet.has(item.resourceId)) {
      removedResourceIds.push(item.resourceId);
      return;
    }
    updatedItems.push(item);
    if (item.order !== undefined) {
      maxOrder = Math.max(maxOrder, item.order);
    }
  });

  const existingIds = new Set(updatedItems.map((item) => item.resourceId));
  let nextOrder = maxOrder + 1;

  resources.forEach((resource) => {
    if (existingIds.has(resource.id)) return;
    addedResourceIds.push(resource.id);
    existingIds.add(resource.id);
    updatedItems.push({
      resourceId: resource.id,
      fullWidth: resource.type === 'text',
      order: nextOrder++
    });
  });

  const updatedGroups: MasonryLayoutGroup[] = [];
  const removedGroupIds: string[] = [];

  (config.groups || []).forEach((group) => {
    const filteredIds = group.resourceIds.filter((id) => resourceIdSet.has(id));
    if (filteredIds.length === 0) {
      removedGroupIds.push(group.id);
      return;
    }
    if (filteredIds.length === group.resourceIds.length) {
      updatedGroups.push(group);
    } else {
      updatedGroups.push({
        ...group,
        resourceIds: filteredIds
      });
    }
  });

  const changed = addedResourceIds.length > 0 || removedResourceIds.length > 0 || removedGroupIds.length > 0;

  if (!changed) {
    return {
      config,
      addedResourceIds,
      removedResourceIds,
      removedGroupIds,
      changed: false
    };
  }

  return {
    config: {
      ...config,
      items: updatedItems,
      groups: updatedGroups
    },
    addedResourceIds,
    removedResourceIds,
    removedGroupIds,
    changed: true
  };
}
