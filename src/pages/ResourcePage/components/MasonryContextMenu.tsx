import React from 'react';
import { TbMaximize, TbMinimize, TbPlus, TbTransfer, TbX } from 'react-icons/tb';

import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu';
import { MasonryLayoutGroup, ResourceItem } from '@/types';

interface MasonryContextMenuProps {
  item?: ResourceItem;
  selectedItems: Set<string>;
  isFullWidth?: boolean;
  inGroup?: boolean;
  onSetFullWidth?: (fullWidth: boolean) => void;
  onCreateGroup?: (resourceIds: string[]) => void;
  groups?: MasonryLayoutGroup[];
  onAddToGroup?: (groupId: string, resourceIds: string[]) => void;
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
  groups,
  onAddToGroup,
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

            {!inGroup && onAddToGroup && (
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <TbTransfer className="mr-2 w-4 h-4" />
                  移动到分组
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="min-w-[220px]">
                  {groups && groups.length > 0 ? (
                    groups.map((group) => (
                      <ContextMenuItem
                        key={group.id}
                        onSelect={() => {
                          onAddToGroup(group.id, resourceIds);
                        }}
                      >
                        {group.name || '未命名分组'}
                      </ContextMenuItem>
                    ))
                  ) : (
                    <ContextMenuItem disabled>暂无可用分组</ContextMenuItem>
                  )}
                </ContextMenuSubContent>
              </ContextMenuSub>
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
