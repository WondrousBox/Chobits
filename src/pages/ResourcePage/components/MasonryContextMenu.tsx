import React from 'react';
import { TbLayoutGrid, TbLayoutList, TbMaximize, TbMinimize, TbPlus, TbX } from 'react-icons/tb';

import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { ResourceItem } from '@/types';

interface MasonryContextMenuProps {
  item?: ResourceItem;
  selectedItems: Set<string>;
  isFullWidth?: boolean;
  inGroup?: boolean;
  onSetFullWidth?: (fullWidth: boolean) => void;
  onCreateGroup?: (resourceIds: string[]) => void;
  onAddToGroup?: (resourceIds: string[]) => void;
  onRemoveFromGroup?: (resourceIds: string[]) => void;
  children: React.ReactNode;
}

export const MasonryContextMenu: React.FC<MasonryContextMenuProps> = ({
  item,
  selectedItems,
  isFullWidth,
  inGroup,
  onSetFullWidth,
  onCreateGroup,
  onAddToGroup: onAddToGroupProp,
  onRemoveFromGroup,
  children
}) => {
  const resourceIds = item ? (selectedItems.has(item.id) && selectedItems.size > 0 ? Array.from(selectedItems) : [item.id]) : Array.from(selectedItems);
  const hasSelection = resourceIds.length > 0;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div style={{ width: '100%', height: '100%' }}>{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[200px]">
        {item && (
          <>
            <ContextMenuItem
              onSelect={() => {
                if (onSetFullWidth) {
                  onSetFullWidth(!isFullWidth);
                }
              }}
            >
              {isFullWidth ? (
                <>
                  <TbMinimize className="mr-2 w-4 h-4" />
                  取消全宽
                </>
              ) : (
                <>
                  <TbMaximize className="mr-2 w-4 h-4" />
                  设置为全宽
                </>
              )}
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}

        {hasSelection && (
          <>
            {!inGroup && (
              <ContextMenuItem
                onSelect={() => {
                  if (onCreateGroup) {
                    onCreateGroup(resourceIds);
                  }
                }}
              >
                <TbPlus className="mr-2 w-4 h-4" />
                创建分组
              </ContextMenuItem>
            )}

            {!inGroup && onAddToGroupProp && (
              <ContextMenuItem
                onSelect={() => {
                  onAddToGroupProp(resourceIds);
                }}
              >
                <TbPlus className="mr-2 w-4 h-4" />
                添加到分组
              </ContextMenuItem>
            )}

            {inGroup && (
              <ContextMenuItem
                onSelect={() => {
                  if (onRemoveFromGroup) {
                    onRemoveFromGroup(resourceIds);
                  }
                }}
              >
                <TbX className="mr-2 w-4 h-4" />
                从分组中移除
              </ContextMenuItem>
            )}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
};
