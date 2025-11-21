import React from 'react';
import { TbEdit, TbLayoutGrid, TbLayoutList, TbX } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { MasonryLayoutGroup, ResourceItem } from '@/types';

import ResourceGalleryItem from './ResourceGalleryItem';
import ResourceListItem from './ResourceListItem';

interface ResourceGroupProps {
  group: MasonryLayoutGroup;
  resources: ResourceItem[];
  selectedItems: Set<string>;
  onItemClick: (e: React.MouseEvent, item: ResourceItem) => void;
  onToggleFavorite?: (id: string) => void;
  onToggleVisibility?: (id: string) => void;
  onPreview?: (item: ResourceItem, index: number, list: ResourceItem[]) => void;
  onDeleteGroup?: (groupId: string) => void;
  onEditGroup?: (groupId: string) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, item: ResourceItem, selectedIds: string[]) => void;
}

export const ResourceGroup: React.FC<ResourceGroupProps> = ({
  group,
  resources,
  selectedItems,
  onItemClick,
  onToggleFavorite,
  onToggleVisibility,
  onPreview,
  onDeleteGroup,
  onEditGroup,
  draggable,
  onDragStart
}) => {
  const isGrid = group.layout === 'grid';
  const isList = group.layout === 'list';

  return (
    <div className="border rounded-lg p-4 bg-card/50 space-y-3">
      {/* 分组标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-foreground">{group.name || '未命名分组'}</h3>
          <span className="text-xs text-muted-foreground">{isGrid ? <TbLayoutGrid className="w-3 h-3 inline" /> : <TbLayoutList className="w-3 h-3 inline" />}</span>
        </div>
        <div className="flex items-center gap-1">
          {onEditGroup && (
            <Button
              size="icon"
              variant="ghost"
              className="w-6 h-6"
              onClick={(e) => {
                e.stopPropagation();
                onEditGroup(group.id);
              }}
            >
              <TbEdit className="w-4 h-4" />
            </Button>
          )}
          {onDeleteGroup && (
            <Button
              size="icon"
              variant="ghost"
              className="w-6 h-6"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteGroup(group.id);
              }}
            >
              <TbX className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* 分组内容：根据布局类型渲染 */}
      {isGrid && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {resources.map((item, idx) => (
            <ResourceGalleryItem
              key={item.id}
              item={item}
              selected={selectedItems.has(item.id)}
              onClick={onItemClick}
              onToggleFavorite={onToggleFavorite}
              onToggleVisibility={onToggleVisibility}
              onPreview={() => onPreview?.(item, idx, resources)}
              draggable={draggable}
              onDragStart={(e) => {
                const ids = selectedItems.has(item.id) && selectedItems.size > 0 ? Array.from(selectedItems) : [item.id];
                onDragStart?.(e, item, ids);
              }}
            />
          ))}
        </div>
      )}

      {isList && (
        <div className="space-y-2">
          {resources.map((item, idx) => (
            <ResourceListItem
              key={item.id}
              item={item}
              selected={selectedItems.has(item.id)}
              onClick={onItemClick}
              onToggleFavorite={onToggleFavorite}
              onToggleVisibility={onToggleVisibility}
              onPreview={() => onPreview?.(item, idx, resources)}
              draggable={draggable}
              onDragStart={(e) => {
                const ids = selectedItems.has(item.id) && selectedItems.size > 0 ? Array.from(selectedItems) : [item.id];
                onDragStart?.(e, item, ids);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
