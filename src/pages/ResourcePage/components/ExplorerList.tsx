import React, { useState } from 'react';
import { TbFolderFilled, TbFolderOpen, TbPencil, TbTrash } from 'react-icons/tb';
import { toast } from 'sonner';

import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ResourceItem } from '@/types';

import type { UIFolder } from './FolderSidebar';
import ResourceListItem from './ResourceListItem';

// Inline folder row for list view
const ListFolderRow: React.FC<{
  folder: UIFolder;
  count?: number;
  folderParentMap: Map<string, string | null>;
  onOpen?: () => void;
  onDropResources?: (ids: string[]) => void;
  onMoveFolder?: (id: string, newParentId: string | null) => void | Promise<void>;
  onRename?: () => void;
  onDelete?: () => void;
  onOpenLocation?: () => void;
}> = ({ folder, count, folderParentMap, onOpen, onDropResources, onMoveFolder, onRename, onDelete, onOpenLocation }) => {
  const [over, setOver] = useState(false);
  const [overInvalid, setOverInvalid] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const isWin = (window as any).YUA?.isWindows;
  const revealLabel = isWin ? '在资源管理器中显示' : '在 Finder 中显示';

  const isAncestor = (ancestorId: string, descendantId: string): boolean => {
    let cur: string | null | undefined = descendantId;
    const guard = new Set<string>();
    while (cur) {
      if (cur === ancestorId) return true;
      if (guard.has(cur)) break;
      guard.add(cur);
      cur = folderParentMap.get(cur) ?? null;
    }
    return false;
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <TooltipProvider delayDuration={0}>
          <Tooltip open={overInvalid || tipOpen}>
            <TooltipTrigger asChild>
              {(() => {
                const rowStateClass = over ? (overInvalid ? 'ring-1 ring-destructive bg-destructive/10' : 'bg-muted/50 border-primary/30') : 'hover:bg-muted/50 hover:border-primary/30';
                return (
                  <div
                    className={'group relative flex items-center gap-4 p-2 rounded-lg border transition-all cursor-pointer select-none ' + rowStateClass}
                    onClick={() => onOpen?.()}
                    onContextMenu={(e) => e.stopPropagation()}
                    draggable
                    onDragStart={(e) => {
                      try {
                        e.dataTransfer.setData('application/x-folder-id', folder.id);
                        e.dataTransfer.effectAllowed = 'move';
                      } catch {
                        /* noop */
                      }
                    }}
                    onDragOver={(e) => {
                      const types = Array.from((e.dataTransfer?.types as any) || []);
                      const maybeFolder = types.includes('application/x-folder-id');
                      if (maybeFolder) {
                        // we cannot read the id here reliably, but if from same doc works
                        try {
                          const fid = e.dataTransfer.getData('application/x-folder-id');
                          const invalid = fid === folder.id || isAncestor(fid, folder.id);
                          setOverInvalid(invalid);
                          if (!invalid) {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            setOver(true);
                          } else {
                            setOver(false);
                            e.dataTransfer.dropEffect = 'none';
                          }
                        } catch {
                          // fallback allow default resource drop
                          e.preventDefault();
                          setOver(true);
                          setOverInvalid(false);
                        }
                        return;
                      }
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setOver(true);
                      setOverInvalid(false);
                    }}
                    onDragLeave={() => {
                      setOver(false);
                      setOverInvalid(false);
                      setTipOpen(false);
                    }}
                    onDrop={async (e) => {
                      setOver(false);
                      setOverInvalid(false);
                      setTipOpen(false);
                      try {
                        const fid = e.dataTransfer.getData('application/x-folder-id');
                        if (fid) {
                          if (fid !== folder.id && !isAncestor(fid, folder.id)) {
                            // move folder
                            const targetPid = folder.id;
                            try {
                              if (onMoveFolder) await onMoveFolder(fid, targetPid);
                            } catch (err) {
                              const msg = String((err as any)?.message || err || '');
                              const isUnique = /UNIQUE|constraint/i.test(msg);
                              if (isUnique) {
                                toast.error('移动文件夹失败', { description: '目标文件夹内已存在同名文件夹' });
                              } else {
                                toast.error('移动文件夹失败');
                              }
                            }
                          } else {
                            setTipOpen(true);
                            setTimeout(() => setTipOpen(false), 1200);
                          }
                          return;
                        }
                      } catch {
                        /* ignore folder move */
                      }
                      try {
                        const raw = e.dataTransfer.getData('application/x-resource-ids');
                        if (!raw) return;
                        const ids: string[] = JSON.parse(raw);
                        if (Array.isArray(ids) && ids.length) onDropResources?.(ids);
                      } catch {
                        /* ignore */
                      }
                    }}
                  >
                    <div className="relative flex-shrink-0 w-16 h-16 rounded-md overflow-hidden bg-muted flex items-center justify-center text-3xl text-muted-foreground">
                      <TbFolderFilled />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="mb-1">
                        <h3 className="font-medium text-sm truncate mb-1 flex items-center gap-2">
                          <span className="truncate">{folder.name}</span>
                          {typeof count === 'number' && <span className="inline-flex items-center justify-center bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded-full">{count}</span>}
                        </h3>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </TooltipTrigger>
            <TooltipContent side="top">不能移动到自己的子文件夹中</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[200px]" onClick={(e) => e.stopPropagation()}>
        <ContextMenuItem onSelect={() => onOpen?.()}>打开</ContextMenuItem>
        <ContextMenuItem className="flex items-center gap-2" onSelect={() => onOpenLocation?.()}>
          <TbFolderOpen /> {revealLabel}
        </ContextMenuItem>
        <ContextMenuItem className="flex items-center gap-2" onSelect={() => onRename?.()}>
          <TbPencil /> 重命名
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="flex items-center gap-2 text-destructive" onSelect={() => onDelete?.()}>
          <TbTrash /> 删除
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};

export interface ExplorerListProps {
  items: ResourceItem[];
  folders?: UIFolder[];
  counts?: Record<string, number>;
  folderParentMap: Map<string, string | null>;
  selectedItems: Set<string>;
  onItemClick: (e: React.MouseEvent, item: ResourceItem) => void;
  onToggleFavorite?: (id: string) => void;
  onToggleVisibility?: (id: string) => void;
  onOpenFolder?: (id: string) => void;
  onDropResourcesToFolder?: (folderId: string, ids: string[]) => void;
  onRenameFolder?: (id: string) => void;
  onDeleteFolder?: (id: string) => void;
  onOpenFolderLocation?: (id: string) => void;
  onMoveFolder?: (id: string, newParentId: string | null) => void | Promise<void>;
}

export const ExplorerList: React.FC<ExplorerListProps> = ({
  items,
  folders = [],
  counts = {},
  folderParentMap,
  selectedItems,
  onItemClick,
  onToggleFavorite,
  onToggleVisibility,
  onOpenFolder,
  onDropResourcesToFolder,
  onRenameFolder,
  onDeleteFolder,
  onOpenFolderLocation,
  onMoveFolder
}) => {
  return (
    <div className="space-y-2">
      {/* 先渲染子文件夹列表条目 */}
      {folders.map((f) => (
        <ListFolderRow
          key={`folder-row-${f.id}`}
          folder={f}
          count={counts[f.id]}
          folderParentMap={folderParentMap}
          onOpen={() => onOpenFolder?.(f.id)}
          onDropResources={(ids: string[]) => onDropResourcesToFolder?.(f.id, ids)}
          onMoveFolder={onMoveFolder}
          onRename={() => onRenameFolder?.(f.id)}
          onDelete={() => onDeleteFolder?.(f.id)}
          onOpenLocation={() => onOpenFolderLocation?.(f.id)}
        />
      ))}

      {/* 再渲染资源列表条目 */}
      {items.map((item, idx) => (
        <ResourceListItem
          key={item.id}
          item={item}
          selected={selectedItems.has(item.id)}
          onClick={onItemClick}
          onToggleFavorite={onToggleFavorite}
          onToggleVisibility={onToggleVisibility}
          onPreview={() => {
            const current = items[idx];
            if (!current) return;
            window.YUA.window['window:open']('resourcePreview', {
              current,
              list: items,
              index: idx
            });
          }}
          draggable
          onDragStart={(e) => {
            const ids = selectedItems.has(item.id) && selectedItems.size > 0 ? Array.from(selectedItems) : [item.id];
            try {
              e.dataTransfer.setData('application/x-resource-ids', JSON.stringify(ids));
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.dropEffect = 'move';
            } catch {
              /* ignore */
            }
          }}
        />
      ))}
    </div>
  );
};

export default ExplorerList;
