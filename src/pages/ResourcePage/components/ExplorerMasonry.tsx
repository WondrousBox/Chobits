import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, pointerWithin, rectIntersection, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext } from '@dnd-kit/sortable';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TbLayoutGrid } from 'react-icons/tb';
import Masonry from 'react-masonry-css';

import { MasonryLayoutConfig, MasonryLayoutItem, ResourceItem } from '@/types';

import {
  addResourcesToGroup,
  createDefaultLayoutConfig,
  createGroup,
  getResourceLayout,
  isResourceInGroup,
  loadMasonryLayout,
  removeResourcesFromGroup,
  renameGroup,
  saveMasonryLayout,
  setGroupLayout,
  setResourceFullWidth,
  updateGroupOrder,
  updateResourceOrder
} from '../utils/masonryLayout';
import { AddToGroupDialog } from './AddToGroupDialog';
import FullWidthTextResource from './FullWidthTextResource';
import { MasonryContextMenu } from './MasonryContextMenu';
import ResourceGalleryItem from './ResourceGalleryItem';
import { ResourceGroup } from './ResourceGroup';
import { SortableMasonryItem } from './SortableMasonryItem';

export interface ExplorerMasonryProps {
  items: ResourceItem[];
  folderId?: string;
  selectedItems: Set<string>;
  onItemClick: (e: React.MouseEvent, item: ResourceItem) => void;
  onToggleFavorite?: (id: string) => void;
  onToggleVisibility?: (id: string) => void;
  onPreview?: (item: ResourceItem, index: number, list: ResourceItem[]) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, item: ResourceItem, selectedIds: string[]) => void;
}

export const ExplorerMasonry: React.FC<ExplorerMasonryProps> = ({ items, folderId, selectedItems, onItemClick, onToggleFavorite, onToggleVisibility, onPreview, draggable, onDragStart }) => {
  const [layoutConfig, setLayoutConfig] = useState<MasonryLayoutConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addToGroupOpen, setAddToGroupOpen] = useState(false);
  const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);

  // 自定义碰撞检测算法：优先检测 Droppable (pointerWithin)，如果没检测到则使用 rectIntersection 进行排序检测
  const customCollisionDetection = useCallback((args: any) => {
    // 首先尝试使用 pointerWithin 检测（对合并操作更友好，因为它检测指针是否在元素内）
    const pointerCollisions = pointerWithin(args);

    // 过滤出 droppable 的 collisions
    const droppableCollisions = pointerCollisions.filter((collision: any) => String(collision.id).startsWith('droppable-'));

    // 如果检测到了 droppable 碰撞，优先返回这些（实现合并/加入分组）
    if (droppableCollisions.length > 0) {
      return droppableCollisions;
    }

    // 否则回退到 rectIntersection 用于排序（这种算法比 closestCenter 在 Masonry 布局中通常更稳定）
    return rectIntersection(args);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    })
  );

  // 加载布局配置
  useEffect(() => {
    const loadLayout = async () => {
      if (!folderId) {
        const defaultConfig = createDefaultLayoutConfig(items.map((i) => i.id));
        setLayoutConfig(defaultConfig);
        setLoading(false);
        return;
      }

      setLoading(true);
      const config = await loadMasonryLayout(folderId);
      if (config) {
        setLayoutConfig(config);
      } else {
        const defaultConfig = createDefaultLayoutConfig(items.map((i) => i.id));
        setLayoutConfig(defaultConfig);
      }
      setLoading(false);
    };

    loadLayout();
  }, [folderId, items]);

  // 保存布局配置
  const saveLayout = useCallback(
    async (config: MasonryLayoutConfig) => {
      if (!folderId) return;
      await saveMasonryLayout(folderId, config);
      setLayoutConfig(config);
    },
    [folderId]
  );

  // 根据布局配置组织资源
  const organizedResources = useMemo(() => {
    if (!layoutConfig) return { standalone: items, groups: [] };

    const itemMap = new Map<string, ResourceItem>();
    items.forEach((item) => itemMap.set(item.id, item));

    const layoutItemMap = new Map<string, MasonryLayoutItem>();
    layoutConfig.items.forEach((item) => layoutItemMap.set(item.resourceId, item));

    const standalone: Array<{ item: ResourceItem; layout: MasonryLayoutItem }> = [];
    const groupMap = new Map<string, Array<{ item: ResourceItem; layout: MasonryLayoutItem }>>();

    // 处理分组资源
    layoutConfig.groups?.forEach((group) => {
      const groupItems: Array<{ item: ResourceItem; layout: MasonryLayoutItem }> = [];
      group.resourceIds.forEach((resourceId) => {
        const item = itemMap.get(resourceId);
        const layout = layoutItemMap.get(resourceId);
        if (item && layout) {
          groupItems.push({ item, layout });
        }
      });
      if (groupItems.length > 0) {
        groupMap.set(group.id, groupItems);
      }
    });

    // 处理独立资源
    layoutConfig.items.forEach((layoutItem) => {
      const item = itemMap.get(layoutItem.resourceId);
      if (!item) return;

      const inGroup = isResourceInGroup(layoutItem.resourceId, layoutConfig.groups);
      if (!inGroup) {
        standalone.push({ item, layout: layoutItem });
      }
    });

    // 按 order 排序
    standalone.sort((a, b) => (a.layout.order || 0) - (b.layout.order || 0));
    const groups = Array.from(groupMap.entries())
      .map(([groupId, groupItems]) => {
        const group = layoutConfig.groups?.find((g) => g.id === groupId);
        if (!group) return null;
        groupItems.sort((a, b) => (a.layout.order || 0) - (b.layout.order || 0));
        return {
          group,
          items: groupItems.map((gi) => gi.item)
        };
      })
      .filter((g): g is { group: MasonryLayoutGroup; items: ResourceItem[] } => g !== null)
      .sort((a, b) => (a.group.order || 0) - (b.group.order || 0));

    return { standalone, groups };
  }, [items, layoutConfig]);

  // 拖拽开始
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  // 拖拽结束
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || !layoutConfig) {
      setActiveId(null);
      return;
    }

    const activeId = active.id as string;
    let overId = over.id as string;

    // 处理合并/加入分组逻辑 (Droppable)
    if (overId.startsWith('droppable-')) {
      overId = overId.replace('droppable-', '');

      // 如果是拖拽资源
      if (activeId.startsWith('resource-')) {
        const activeResourceId = activeId.replace('resource-', '');

        // 1. 拖拽资源到分组 -> 加入分组
        if (overId.startsWith('group-')) {
          const targetGroupId = overId.replace('group-', '');
          const updatedConfig = addResourcesToGroup(layoutConfig, targetGroupId, [activeResourceId]);
          saveLayout(updatedConfig);
          setActiveId(null);
          return;
        }

        // 2. 拖拽资源到另一个资源 -> 创建新分组
        if (overId.startsWith('resource-')) {
          const targetResourceId = overId.replace('resource-', '');
          // 只有当目标是不同的资源时才创建分组
          if (activeResourceId !== targetResourceId) {
            const updatedConfig = createGroup(layoutConfig, [activeResourceId, targetResourceId]);
            saveLayout(updatedConfig);
            setActiveId(null);
            return;
          }
        }
      }
    }

    // 以下是原有的排序逻辑 (Sortable)

    // 如果是资源排序
    if (activeId.startsWith('resource-') && overId.startsWith('resource-')) {
      const activeResourceId = activeId.replace('resource-', '');
      const overResourceId = overId.replace('resource-', '');

      const standaloneIds = organizedResources.standalone.map(({ item }) => item.id);
      const activeIndex = standaloneIds.indexOf(activeResourceId);
      const overIndex = standaloneIds.indexOf(overResourceId);

      if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
        const newOrder = arrayMove(standaloneIds, activeIndex, overIndex);
        const updatedConfig = updateResourceOrder(layoutConfig, newOrder);
        saveLayout(updatedConfig);
      }
    }

    // 如果是分组排序
    if (activeId.startsWith('group-') && overId.startsWith('group-')) {
      const activeGroupId = activeId.replace('group-', '');
      const overGroupId = overId.replace('group-', '');

      const groupIds = organizedResources.groups.map(({ group }) => group.id);
      const activeIndex = groupIds.indexOf(activeGroupId);
      const overIndex = groupIds.indexOf(overGroupId);

      if (activeIndex !== -1 && overIndex !== -1 && activeIndex !== overIndex) {
        const newOrder = arrayMove(groupIds, activeIndex, overIndex);
        const updatedConfig = updateGroupOrder(layoutConfig, newOrder);
        saveLayout(updatedConfig);
      }
    }

    setActiveId(null);
  };

  // 设置全宽
  const handleSetFullWidth = useCallback(
    (resourceId: string, fullWidth: boolean) => {
      if (!layoutConfig) return;
      const updatedConfig = setResourceFullWidth(layoutConfig, resourceId, fullWidth);
      saveLayout(updatedConfig);
    },
    [layoutConfig, saveLayout]
  );

  // 创建分组
  const handleCreateGroup = useCallback(
    (resourceIds: string[]) => {
      if (!layoutConfig || resourceIds.length === 0) return;
      const updatedConfig = createGroup(layoutConfig, resourceIds);
      saveLayout(updatedConfig);
    },
    [layoutConfig, saveLayout]
  );

  // 打开添加到分组对话框
  const handleOpenAddToGroup = useCallback((resourceIds: string[]) => {
    setSelectedForGroup(resourceIds);
    setAddToGroupOpen(true);
  }, []);

  // 添加到分组
  const handleAddToGroup = useCallback(
    (groupId: string) => {
      if (!layoutConfig || selectedForGroup.length === 0) return;
      const updatedConfig = addResourcesToGroup(layoutConfig, groupId, selectedForGroup);
      saveLayout(updatedConfig);
      setAddToGroupOpen(false);
      setSelectedForGroup([]);
    },
    [layoutConfig, saveLayout, selectedForGroup]
  );

  // 从分组移除
  const handleRemoveFromGroup = useCallback(
    (groupId: string, resourceIds: string[]) => {
      if (!layoutConfig || resourceIds.length === 0) return;
      const updatedConfig = removeResourcesFromGroup(layoutConfig, groupId, resourceIds);
      saveLayout(updatedConfig);
    },
    [layoutConfig, saveLayout]
  );

  const handleRenameGroupInline = useCallback(
    (groupId: string, name: string) => {
      if (!layoutConfig) return;
      const updatedConfig = renameGroup(layoutConfig, groupId, name);
      saveLayout(updatedConfig);
    },
    [layoutConfig, saveLayout]
  );

  const handleGroupLayoutQuickChange = useCallback(
    (groupId: string, layout: 'grid' | 'list') => {
      if (!layoutConfig) return;
      const updatedConfig = setGroupLayout(layoutConfig, groupId, layout);
      saveLayout(updatedConfig);
    },
    [layoutConfig, saveLayout]
  );

  // 删除分组
  const handleDeleteGroup = useCallback(
    async (groupId: string) => {
      if (!layoutConfig) return;
      const updatedGroups = layoutConfig.groups?.filter((g) => g.id !== groupId) || [];
      const updatedItems = layoutConfig.items.map((item) => {
        if (item.groupId === groupId) {
          const { groupId: _, ...rest } = item;
          return rest;
        }
        return item;
      });
      const updatedConfig: MasonryLayoutConfig = {
        ...layoutConfig,
        groups: updatedGroups,
        items: updatedItems
      };
      await saveLayout(updatedConfig);
    },
    [layoutConfig, saveLayout]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">加载布局配置中...</p>
      </div>
    );
  }

  const breakpointColumnsObj = {
    default: 4,
    1400: 3,
    1100: 2,
    700: 1
  };

  const standaloneIds = organizedResources.standalone.map(({ item }) => `resource-${item.id}`);
  const groupIds = organizedResources.groups.map(({ group }) => `group-${group.id}`);

  return (
    <div className="w-full">
      <DndContext sensors={sensors} collisionDetection={customCollisionDetection} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <SortableContext items={[...standaloneIds, ...groupIds]}>
          <Masonry breakpointCols={breakpointColumnsObj} className="masonry-grid" columnClassName="masonry-grid_column">
            {/* 渲染独立资源 */}
            {organizedResources.standalone.map(({ item, layout }) => {
              const { fullWidth } = getResourceLayout(layout, layoutConfig?.groups);
              const itemId = `resource-${item.id}`;

              // 全宽文本资源
              if (fullWidth && item.type === 'text') {
                return (
                  <div key={item.id} className="masonry-item masonry-item-fullwidth">
                    <SortableMasonryItem id={itemId} item={item}>
                      <MasonryContextMenu
                        item={item}
                        selectedItems={selectedItems}
                        isFullWidth={fullWidth}
                        onSetFullWidth={(fw) => handleSetFullWidth(item.id, fw)}
                        onCreateGroup={(ids) => handleCreateGroup(ids)}
                        onAddToGroup={(ids) => handleOpenAddToGroup(ids)}
                      >
                        <FullWidthTextResource
                          item={item}
                          onPreview={() => {
                            const index = items.findIndex((i) => i.id === item.id);
                            onPreview?.(item, index, items);
                          }}
                        />
                      </MasonryContextMenu>
                    </SortableMasonryItem>
                  </div>
                );
              }

              // 全宽其他资源
              if (fullWidth) {
                return (
                  <div key={item.id} className="masonry-item masonry-item-fullwidth">
                    <SortableMasonryItem id={itemId} item={item}>
                      <MasonryContextMenu
                        item={item}
                        selectedItems={selectedItems}
                        isFullWidth={fullWidth}
                        onSetFullWidth={(fw) => handleSetFullWidth(item.id, fw)}
                        onCreateGroup={(ids) => handleCreateGroup(ids)}
                        onAddToGroup={(ids) => handleOpenAddToGroup(ids)}
                      >
                        <ResourceGalleryItem
                          item={item}
                          selected={selectedItems.has(item.id)}
                          onClick={onItemClick}
                          onToggleFavorite={onToggleFavorite}
                          onToggleVisibility={onToggleVisibility}
                          onPreview={() => {
                            const index = items.findIndex((i) => i.id === item.id);
                            onPreview?.(item, index, items);
                          }}
                          draggable={draggable}
                          onDragStart={(e) => {
                            const ids = selectedItems.has(item.id) && selectedItems.size > 0 ? Array.from(selectedItems) : [item.id];
                            onDragStart?.(e, item, ids);
                          }}
                        />
                      </MasonryContextMenu>
                    </SortableMasonryItem>
                  </div>
                );
              }

              // 普通瀑布流资源
              return (
                <div key={item.id} className="masonry-item">
                  <SortableMasonryItem id={itemId} item={item}>
                    <MasonryContextMenu
                      item={item}
                      selectedItems={selectedItems}
                      isFullWidth={fullWidth}
                      onSetFullWidth={(fw) => handleSetFullWidth(item.id, fw)}
                      onCreateGroup={(ids) => handleCreateGroup(ids)}
                      onAddToGroup={(ids) => handleOpenAddToGroup(ids)}
                    >
                      <ResourceGalleryItem
                        item={item}
                        selected={selectedItems.has(item.id)}
                        onClick={onItemClick}
                        onToggleFavorite={onToggleFavorite}
                        onToggleVisibility={onToggleVisibility}
                        onPreview={() => {
                          const index = items.findIndex((i) => i.id === item.id);
                          onPreview?.(item, index, items);
                        }}
                        draggable={draggable}
                        onDragStart={(e) => {
                          const ids = selectedItems.has(item.id) && selectedItems.size > 0 ? Array.from(selectedItems) : [item.id];
                          onDragStart?.(e, item, ids);
                        }}
                      />
                    </MasonryContextMenu>
                  </SortableMasonryItem>
                </div>
              );
            })}

            {/* 渲染分组资源 */}
            {organizedResources.groups.map(({ group, items: groupItems }) => {
              const groupId = `group-${group.id}`;
              return (
                <div key={group.id} className="masonry-item masonry-item-fullwidth">
                  <SortableMasonryItem id={groupId} item={groupItems[0] || ({} as ResourceItem)}>
                    <ResourceGroup
                      group={group}
                      resources={groupItems}
                      selectedItems={selectedItems}
                      onItemClick={onItemClick}
                      onToggleFavorite={onToggleFavorite}
                      onToggleVisibility={onToggleVisibility}
                      onPreview={(item, index) => {
                        const globalIndex = items.findIndex((i) => i.id === item.id);
                        onPreview?.(item, globalIndex, items);
                      }}
                      draggable={draggable}
                      onDragStart={onDragStart}
                      onRenameGroup={handleRenameGroupInline}
                      onEditGroupLayout={handleGroupLayoutQuickChange}
                      onDeleteGroup={handleDeleteGroup}
                    />
                  </SortableMasonryItem>
                </div>
              );
            })}
          </Masonry>
        </SortableContext>

        <DragOverlay>
          {activeId ? (
            <div className="opacity-50">
              <TbLayoutGrid className="w-8 h-8" />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* 添加到分组对话框 */}
      <AddToGroupDialog open={addToGroupOpen} onOpenChange={setAddToGroupOpen} groups={layoutConfig?.groups || []} onAdd={handleAddToGroup} />

      <style>{`
        .masonry-grid {
          display: flex;
          width: auto;
          gap: 1rem;
        }
        .masonry-grid_column {
          background-clip: padding-box;
        }
        .masonry-item {
          margin-bottom: 1rem;
        }
        .masonry-item-fullwidth {
          width: 100% !important;
        }
      `}</style>
    </div>
  );
};

export default ExplorerMasonry;
