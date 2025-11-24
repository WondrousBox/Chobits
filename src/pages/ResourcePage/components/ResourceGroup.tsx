import React from 'react';
import { TbLayoutGrid, TbLayoutList, TbX } from 'react-icons/tb';

import { InlineEditableText } from '@/components/common/InlineEditableText';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { MasonryLayoutGroup, ResourceItem } from '../types';
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
  onEditGroupLayout?: (groupId: string, layout: 'grid' | 'list') => void;
  onRenameGroup?: (groupId: string, name: string) => void;
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
  onEditGroupLayout,
  onRenameGroup,
  draggable,
  onDragStart
}) => {
  return (
    <div className="border border-solid border-border rounded-lg  h-full w-full box-border p-2 relative group/item hover:border-primary overflow-y-auto">
      {/* 分组标题栏 */}
      <div className="flex items-center justify-between absolute top-0 left-0 right-0 z-50 opacity-0 group-hover/item:opacity-100 focus-within:opacity-100 transition-opacity px-2 py-1 bg-background/80 backdrop-blur rounded-t-lg">
        <InlineEditableText
          value={group.name || ''}
          placeholder="未命名分组"
          className="text-sm font-medium"
          inputClassName="h-7 text-sm"
          onCommit={(name) => {
            const safeName = name.trim() || '未命名分组';
            if (safeName !== (group.name || '未命名分组')) {
              onRenameGroup?.(group.id, safeName);
            }
          }}
        />
        <div className="flex items-center gap-1">
          <Tabs value={group.layout} onValueChange={(value) => onEditGroupLayout?.(group.id, value as 'grid' | 'list')}>
            <TabsList className="h-8 gap-1 rounded-md border bg-background/60 backdrop-blur px-1">
              <TabsTrigger value="grid" className="w-8 h-8 p-0 data-[state=active]:bg-primary/10">
                <TbLayoutGrid className="w-4 h-4" />
              </TabsTrigger>
              <TabsTrigger value="list" className="w-8 h-8 p-0 data-[state=active]:bg-primary/10">
                <TbLayoutList className="w-4 h-4" />
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {onDeleteGroup && (
            <Button
              size="icon"
              variant="ghost"
              className="w-8 h-8"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteGroup(group.id);
              }}
            >
              <TbX />
            </Button>
          )}
        </div>
      </div>

      {/* 分组内容：根据布局类型渲染 */}
      {group.layout === 'grid' && (
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

      {group.layout === 'list' && (
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
