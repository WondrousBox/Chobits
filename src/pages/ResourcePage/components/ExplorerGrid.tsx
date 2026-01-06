import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbFolderFilled, TbFolderOpen, TbFolderPlus, TbLine, TbPencil, TbTrash } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { runWorkflow } from '@/lib/workflow-runner';

import { useResourceTaskStatus } from '../hooks/useResourceTaskStatus';
import { ResourceItem } from '../types';
import { ResourceItemWithSubtitles } from '../utils/subtitleUtils';
import type { UIFolder } from './FolderSidebar';
import ResourceGalleryItem from './ResourceGalleryItem';
// Inline folder tile for grid view to avoid cross-file resolution issues
const GridFolderTile: React.FC<{
  folder: UIFolder;
  count?: number;
  onOpen?: () => void;
  onDropResources?: (ids: string[]) => void;
  onMoveFolder?: (id: string, newParentId: string | null) => void | Promise<void>;
  parentMap?: Map<string, string | null>;
  draggingFolderId?: string | null;
  setDraggingFolderId?: (id: string | null) => void;
  onRename?: () => void;
  onDelete?: () => void;
  onOpenLocation?: () => void;
}> = ({ folder, count, onOpen, onDropResources, onMoveFolder, parentMap, draggingFolderId, setDraggingFolderId, onRename, onDelete, onOpenLocation }) => {
  const [over, setOver] = React.useState(false);
  const [overInvalid, setOverInvalid] = React.useState(false);
  const [tipOpen, setTipOpen] = React.useState(false);
  const isWin = (window as any).YUA?.isWindows;
  const revealLabel = isWin ? '在资源管理器中显示' : '在 Finder 中显示';
  const isAncestor = React.useCallback(
    (ancestorId: string, descendantId: string): boolean => {
      if (!parentMap) return false;
      let cur: string | null | undefined = descendantId;
      const guard = new Set<string>();
      while (cur) {
        if (cur === ancestorId) return true;
        if (guard.has(cur)) break;
        guard.add(cur);
        cur = parentMap.get(cur) ?? null;
      }
      return false;
    },
    [parentMap]
  );
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Tooltip open={overInvalid || tipOpen}>
          <TooltipTrigger asChild>
            <div
              data-explorer-folder
              onContextMenu={(e) => e.stopPropagation()}
              className={`group relative aspect-video w-full overflow-hidden rounded-md border bg-card text-card-foreground shadow-sm transition-all cursor-pointer select-none ${over
                  ? overInvalid
                    ? 'ring-2 ring-destructive border-destructive/50 bg-destructive/10'
                    : 'ring-2 ring-primary border-primary/50 bg-primary/5'
                  : 'hover:shadow-md hover:border-primary/30'
                } bg-gradient-to-br from-background to-muted flex items-center justify-center`}
              onClick={() => onOpen?.()}
              draggable
              onDragStart={(e: any) => {
                try {
                  e.dataTransfer.setData('application/x-folder-id', folder.id);
                  e.dataTransfer.effectAllowed = 'move';
                } catch {
                  /* noop */
                }
                setDraggingFolderId?.(folder.id);
              }}
              onDragEnd={() => setDraggingFolderId?.(null)}
              onDragOver={(e) => {
                const types = Array.from((e.dataTransfer?.types as any) || []);
                const dragging = draggingFolderId || (types.includes('application/x-folder-id') ? null : null);
                if (dragging) {
                  const invalid = dragging === folder.id || isAncestor(dragging, folder.id);
                  setOverInvalid(invalid);
                  if (!invalid) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    setOver(true);
                  } else {
                    setOver(false);
                    e.dataTransfer.dropEffect = 'none';
                  }
                  return;
                }
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setOver(true);
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
                      try {
                        if (onMoveFolder) await onMoveFolder(fid, folder.id);
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
              <div className="text-center relative">
                <div className="text-5xl text-muted-foreground/80 mb-2">
                  <TbFolderFilled />
                </div>
                <div className="text-sm font-medium truncate max-w-[90%] mx-auto">{folder.name}</div>
                {typeof count === 'number' && <span className="absolute top-1 right-1 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full shadow">{count}</span>}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">不能移动到自己的子文件夹中</TooltipContent>
        </Tooltip>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[200px]" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <ContextMenuItem onSelect={onOpen}>打开</ContextMenuItem>
        <ContextMenuItem
          className="flex items-center gap-2"
          onSelect={() => {
            onOpenLocation?.();
          }}
        >
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

export interface ExplorerGridProps {
  items: ResourceItem[] | ResourceItemWithSubtitles[];
  folders?: UIFolder[];
  counts?: Record<string, number>;
  // 当前资源所在的文件夹/工作区，用于从空白处创建新文件夹
  folderId?: string;
  workspaceId?: string;
  /** 选中的资源 ID 集合（受控模式） */
  selectedItems?: Set<string>;
  /** 更新选中状态的回调（受控模式） */
  setSelectedItems?: (items: Set<string>) => void;
  onDelete?: (id: string) => void;
  onDeleteMany?: (ids: string[]) => void;
  onToggleFavorite?: (id: string) => void;
  onToggleVisibility?: (id: string) => void;
  onOpenFolder?: (id: string) => void;
  onDropResourcesToFolder?: (folderId: string, ids: string[]) => void;
  onRenameFolder?: (id: string) => void;
  onDeleteFolder?: (id: string) => void;
  onOpenFolderLocation?: (id: string) => void;
  onMoveFolder?: (id: string, newParentId: string | null) => void | Promise<void>;
  onFolderCreated?: () => void | Promise<void>;
  /** 预览资源回调（用于在侧边面板预览） */
  onPreview?: (item: ResourceItem) => void;
}

type Point = { x: number; y: number };
type Rect = { left: number; top: number; right: number; bottom: number };

function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(a.left > b.right || a.right < b.left || a.top > b.bottom || a.bottom < b.top);
}

export const ExplorerGrid: React.FC<ExplorerGridProps> = ({
  items,
  folders,
  counts,
  folderId,
  workspaceId,
  selectedItems: selectedItemsProp,
  setSelectedItems: setSelectedItemsProp,
  onDelete,
  onDeleteMany,
  onToggleFavorite,
  onToggleVisibility,
  onOpenFolder,
  onDropResourcesToFolder,
  onRenameFolder,
  onDeleteFolder,
  onOpenFolderLocation,
  onMoveFolder,
  onFolderCreated,
  onPreview
}) => {
  const taskStatuses = useResourceTaskStatus();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // 内部选择状态（用于非受控模式）
  const [internalSelected, setInternalSelected] = useState<Set<string>>(new Set());
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);

  // 使用受控模式（如果提供了 props）或非受控模式
  const selected = selectedItemsProp ?? internalSelected;
  const setSelected = setSelectedItemsProp ?? setInternalSelected;

  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragEnd, setDragEnd] = useState<Point | null>(null);
  const isDragging = dragStart && dragEnd;

  // items 已经在 ResourceContent 中合并过了，这里直接使用
  const mergedItems = items as ResourceItemWithSubtitles[];

  const idToIndex = useMemo(() => {
    const m = new Map<string, number>();
    mergedItems.forEach((it, idx) => m.set(it.id, idx));
    return m;
  }, [mergedItems]);

  const selectionRect: Rect | null = useMemo(() => {
    if (!dragStart || !dragEnd) return null;
    const left = Math.min(dragStart.x, dragEnd.x);
    const top = Math.min(dragStart.y, dragEnd.y);
    const right = Math.max(dragStart.x, dragEnd.x);
    const bottom = Math.max(dragStart.y, dragEnd.y);
    return { left, top, right, bottom };
  }, [dragStart, dragEnd]);

  const updateItemRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) itemRefs.current.set(id, el);
      else itemRefs.current.delete(id);
    },
    []
  );

  const clearSelection = useCallback(() => setSelected(new Set()), [setSelected]);

  const setSelectionToRange = useCallback(
    (startIdx: number, endIdx: number, additive = false) => {
      const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
      const newSel = new Set(additive ? Array.from(selected) : []);
      for (let i = lo; i <= hi; i++) newSel.add(mergedItems[i].id);
      setSelected(newSel);
    },
    [mergedItems, selected, setSelected]
  );

  const handleItemClick = useCallback(
    (e: React.MouseEvent, id: string, index: number) => {
      e.stopPropagation();
      if (e.shiftKey && anchorIndex !== null) {
        setSelectionToRange(anchorIndex, index, e.metaKey || e.ctrlKey);
      } else if (e.metaKey || e.ctrlKey) {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelected(next);
        setAnchorIndex(index);
      } else {
        setSelected(new Set([id]));
        setAnchorIndex(index);
      }
    },
    [anchorIndex, selected, setSelected, setSelectionToRange]
  );

  const handleBackgroundPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      // Treat both resource items and folder tiles as interactive items to avoid starting rubberband selection on them
      const isOnItem = target.closest('[data-explorer-item], [data-explorer-folder]');
      if (isOnItem) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setDragStart({ x, y });
      setDragEnd({ x, y });
      if (!(e.metaKey || e.ctrlKey)) clearSelection();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [clearSelection]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStart) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setDragEnd({ x, y });

      const selRect = {
        left: Math.min(dragStart.x, x) + rect.left,
        top: Math.min(dragStart.y, y) + rect.top,
        right: Math.max(dragStart.x, x) + rect.left,
        bottom: Math.max(dragStart.y, y) + rect.top
      };

      const base = e.metaKey || e.ctrlKey ? new Set(selected) : new Set<string>();
      itemRefs.current.forEach((el, id) => {
        const r = el.getBoundingClientRect();
        if (rectsIntersect(selRect, { left: r.left, top: r.top, right: r.right, bottom: r.bottom })) base.add(id);
      });
      setSelected(base);
    },
    [dragStart, selected, setSelected]
  );

  const endDrag = useCallback(
    (e?: React.PointerEvent) => {
      if (dragStart) {
        setDragStart(null);
        setDragEnd(null);
        if (e) (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      }
    },
    [dragStart]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const itemEl = target.closest('[data-explorer-item]') as HTMLElement | null;
      if (!itemEl) return;
      const id = itemEl.dataset.id!;
      if (!selected.has(id)) {
        setSelected(new Set([id]));
        const idx = idToIndex.get(id) ?? null;
        setAnchorIndex(idx);
      }
    },
    [selected, setSelected, idToIndex]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSelected(new Set(mergedItems.map((i) => i.id)));
      }
      if (e.key === 'Escape') {
        clearSelection();
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected.size > 0) {
          const ids = Array.from(selected);
          if (onDeleteMany) onDeleteMany(ids);
          else ids.forEach((id) => onDelete?.(id));
        }
      }
    },
    [mergedItems, selected, setSelected, onDelete, onDeleteMany, clearSelection]
  );

  useEffect(() => {
    // If items change (e.g., deleted), drop selections that no longer exist
    const idSet = new Set(mergedItems.map((i) => i.id));
    // Defer setState to avoid synchronous state update warning in effects
    const t = setTimeout(() => {
      const filteredSelection = new Set(Array.from(selected).filter((id) => idSet.has(id)));
      if (filteredSelection.size !== selected.size) {
        setSelected(filteredSelection);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [mergedItems, selected, setSelected]);

  const selectedCount = selected.size;
  const firstSelected = selectedCount > 0 ? Array.from(selected)[0] : undefined;
  const firstSelectedItem = useMemo(() => (firstSelected ? mergedItems.find((i) => i.id === firstSelected) : undefined), [mergedItems, firstSelected]);
  const canRevealSelected = !!firstSelectedItem?.filePath;
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const handleRenameConfirm = useCallback(() => {
    const id = renamingId || firstSelected;
    const val = renameValue.trim();
    if (!id || !val) {
      setRenameDialogOpen(false);
      return;
    }
    window.YUA.resource.renameResource({ id, newName: val, renameFile: true });
    setRenameDialogOpen(false);
  }, [renamingId, firstSelected, renameValue]);

  const handleRevealCurrentFolder = useCallback(async () => {
    try {
      const ws = await (window as any).YUA?.workspace['workspace:getDefault']();
      const isWin = (window as any).YUA?.isWindows;
      const sep = isWin ? '\\' : '/';
      const base: string = ws?.rootPath || '';
      if (!base) return;
      const needsSep = base.endsWith(sep) ? '' : sep;
      // 没有 folderId 时，打开 resources 根目录；有 folderId 时，打开对应子目录
      const folderPath = folderId ? `${base}${needsSep}resources${sep}folders${sep}${folderId}` : `${base}${needsSep}resources`;
      await (window as any).YUA?.file['file:openPath'](folderPath);
    } catch (err) {
      console.warn('open current folder path failed', err);
    }
  }, [folderId]);

  const handleCreateSubfolder = useCallback(async () => {
    try {
      const d = new Date();
      const name = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const folderApi: any = (window as any).YUA?.folder;
      if (!folderApi || typeof folderApi['folder.create'] !== 'function') {
        toast.error('无法创建文件夹：缺少接口');
        return;
      }
      const res = await folderApi['folder.create']({ name, parentId: folderId ?? null, workspaceId: workspaceId || undefined });
      if ((res as any)?.success) {
        toast.success('文件夹已创建');
        if (onFolderCreated) {
          await onFolderCreated();
        }
      } else {
        toast.error('创建文件夹失败');
      }
    } catch (err) {
      console.error('create folder failed', err);
      toast.error('创建文件夹失败');
    }
  }, [folderId, workspaceId, onFolderCreated]);

  // Folder DnD helpers
  const parentMap = useMemo(() => {
    const map = new Map<string, string | null>();
    (folders || []).forEach((f) => map.set(f.id, f.parentId ?? null));
    return map;
  }, [folders]);
  const [draggingFolderId, setDraggingFolderId] = useState<string | null>(null);

  const [workflows, setWorkflows] = useState<any[]>([]);
  useEffect(() => {
    window.ipcRenderer
      .invoke('wf:listDefinitions')
      .then((defs: any[]) => {
        setWorkflows(defs || []);
      })
      .catch(() => { });
  }, []);

  // 获取工作流的开始节点输入模式
  const getWorkflowInputMode = useCallback((wf: any): 'resource' | 'text' | 'url' | 'file' | 'folder' => {
    if (!wf?.nodes) return 'resource';
    const startNode = wf.nodes.find((n: any) => n.id === 'start' || n.type === 'core/start');
    if (!startNode) return 'resource';
    return (startNode.config?.inputMode as 'resource' | 'text' | 'url' | 'file' | 'folder') || 'resource';
  }, []);

  // 获取工作流在开始节点上声明的适用资源类型（resourceKinds）
  const getWorkflowResourceKinds = useCallback((wf: any): string[] => {
    if (!wf?.nodes) return ['any'];
    const startNode = wf.nodes.find((n: any) => n.id === 'start' || n.type === 'core/start');
    if (!startNode || !startNode.config) return ['any'];
    const kinds = (startNode.config as any).resourceKinds;
    if (Array.isArray(kinds) && kinds.length > 0) {
      return kinds;
    }
    return ['any'];
  }, []);

  // 推断资源的类型（与 Start 节点的 detectType 对齐）
  const getResourceKind = useCallback((item: any): 'image' | 'video' | 'audio' | 'document' | 'other' => {
    // 优先使用资源记录自身的类型字段（如果有）
    if (typeof item?.type === 'string' && item.type) {
      const t = item.type.toLowerCase();
      if (t === 'image' || t === 'video' || t === 'audio' || t === 'document' || t === 'other') return t;
    }

    const filePath: string = item?.filePath || item?.path || '';
    const ext = (filePath.split('.').pop() || '').toLowerCase();

    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
    if (['mp4', 'webm', 'mov', 'mkv', 'ogv'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'm4a', 'flac', 'opus', 'ogg'].includes(ext)) return 'audio';
    if (['pdf', 'doc', 'docx', 'md', 'txt', 'rtf'].includes(ext)) return 'document';
    return 'other';
  }, []);

  // 检查工作流是否需要资源输入
  const workflowRequiresResource = useCallback(
    (wf: any): boolean => {
      const mode = getWorkflowInputMode(wf);
      return mode === 'resource';
    },
    [getWorkflowInputMode]
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          ref={containerRef}
          className="relative grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2 p-2 outline-none min-h-full content-start box-border"
          tabIndex={0}
          onPointerDown={handleBackgroundPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onKeyDown={handleKeyDown}
          onContextMenu={handleContextMenu}
        >
          {/* 先渲染子文件夹 */}
          {(folders || []).map((f) => (
            <GridFolderTile
              key={`folder-${f.id}`}
              folder={f}
              count={counts?.[f.id]}
              onOpen={() => onOpenFolder?.(f.id)}
              onDropResources={(ids: string[]) => onDropResourcesToFolder?.(f.id, ids)}
              onMoveFolder={(id, newPid) => onMoveFolder?.(id, newPid)}
              parentMap={parentMap}
              draggingFolderId={draggingFolderId}
              setDraggingFolderId={setDraggingFolderId}
              onRename={() => onRenameFolder?.(f.id)}
              onDelete={() => onDeleteFolder?.(f.id)}
              onOpenLocation={() => onOpenFolderLocation?.(f.id)}
            />
          ))}

          {/* 再渲染资源项 */}
          {mergedItems.map((item, idx) => {
            const isSelected = selected.has(item.id);
            return (
              <div key={item.id} className="aspect-video w-full">
                <ResourceGalleryItem
                  item={item}
                  selected={isSelected}
                  innerRef={updateItemRef(item.id)}
                  onClick={(e) => handleItemClick(e, item.id, idx)}
                  onToggleFavorite={onToggleFavorite}
                  onToggleVisibility={onToggleVisibility}
                  taskStatus={taskStatuses[item.id]}
                  onPreview={() => {
                    const current = mergedItems[idx];
                    if (!current) return;
                    // 使用父组件传入的 onPreview 回调（侧边面板预览）
                    if (onPreview) {
                      onPreview(current);
                    } else {
                      // 如果没有传入回调，则使用独立窗口预览（后备方案）
                      window.YUA.window['window:open'](
                        'resourcePreview',
                        {
                          current,
                          list: mergedItems,
                          index: idx
                        },
                        {
                          sameDisplayAsSender: true
                        }
                      );
                    }
                  }}
                  draggable
                  onDragStart={(e: React.DragEvent) => {
                    // 如果当前 item 已在多选中，则拖拽这些被选中的；否则仅拖该项
                    const ids = selected.has(item.id) && selected.size > 0 ? Array.from(selected) : [item.id];
                    try {
                      e.dataTransfer.setData('application/x-resource-ids', JSON.stringify(ids));
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.dropEffect = 'move';
                    } catch {
                      /* ignore */
                    }
                  }}
                  fillContainer
                />
              </div>
            );
          })}

          {isDragging && selectionRect && (
            <div
              className="absolute pointer-events-none border-2 border-primary/60 bg-primary/10 rounded"
              style={{
                left: selectionRect.left,
                top: selectionRect.top,
                width: selectionRect.right - selectionRect.left,
                height: selectionRect.bottom - selectionRect.top
              }}
            />
          )}
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="min-w-[220px]">
        {selectedCount > 0 ? (
          <>
            <div className="px-2 py-1.5 text-sm text-muted-foreground">已选择 {selectedCount} 项</div>
            <ContextMenuSeparator />
            {canRevealSelected && (
              <>
                <ContextMenuItem
                  onSelect={async () => {
                    if (!firstSelected) return;
                    await window.YUA.resource.revealResource({ id: firstSelected });
                  }}
                >
                  {(window as any).YUA?.isWindows ? '在资源管理器中显示' : '在 Finder 中显示'}
                </ContextMenuItem>
                <ContextMenuSeparator />
              </>
            )}

            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <TbLine className="mr-2" /> 执行任务
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                {(() => {
                  // 选中资源时，根据资源类型 + start.resourceKinds 过滤可用工作流
                  // 同时过滤掉空白工作流
                  // 只显示输入模式为 resource 的工作流
                  const visibleWorkflows = workflows.filter((wf) => {
                    // 过滤空白工作流
                    if (wf.id === 'blank') return false;
                    const inputMode = getWorkflowInputMode(wf);
                    // 只保留 resource 模式的工作流
                    if (inputMode !== 'resource') return false;
                    if (!firstSelected) return false;
                    const item = mergedItems.find((i) => i.id === firstSelected);
                    if (!item) return false;
                    const kind = getResourceKind(item);
                    const kinds = getWorkflowResourceKinds(wf);
                    if (!kinds || kinds.length === 0 || kinds.includes('any')) return true;
                    return kinds.includes(kind);
                  });

                  return visibleWorkflows.length > 0 ? (
                    visibleWorkflows.map((wf) => {
                      const inputMode = getWorkflowInputMode(wf);
                      return (
                        <ContextMenuItem
                          key={wf.id}
                          onSelect={async () => {
                            if (inputMode === 'resource') {
                              // 资源模式需要选中资源
                              if (!firstSelected) return;
                              const item = mergedItems.find((i) => i.id === firstSelected);
                              if (item) {
                                await runWorkflow({
                                  defId: wf.id,
                                  input: { resource: item, resourceId: item.id },
                                  metadata: {
                                    resourceId: item.id,
                                    resourceName: item.title || 'Unknown',
                                    thumbnailPath: item.thumbnailPath,
                                    workspaceId: item.workspaceId
                                  },
                                  onSuccess: () => {
                                    toast.success(`已开始执行工作流: ${wf.name}`);
                                  }
                                });
                              }
                            } else {
                              // 其他模式（text/url/file）不需要资源，直接执行
                              // 引擎会自动检测并弹出输入窗口
                              await runWorkflow({
                                defId: wf.id,
                                input: {},
                                metadata: {
                                  workspaceId,
                                  folderId
                                },
                                onSuccess: () => {
                                  toast.success(`已开始执行工作流: ${wf.name}`);
                                }
                              });
                            }
                          }}
                        >
                          <div className="flex items-center gap-2">
                            {wf.icon ? <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center" dangerouslySetInnerHTML={{ __html: wf.icon }} /> : null}
                            <span>{wf.name}</span>
                          </div>
                        </ContextMenuItem>
                      );
                    })
                  ) : (
                    <ContextMenuItem disabled>无可用工作流</ContextMenuItem>
                  );
                })()}
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={() => {
                if (!firstSelected) return;
                const item = mergedItems.find((i) => i.id === firstSelected);
                setRenameValue(item?.title || item?.filePath || item?.url || '');
                setRenamingId(firstSelected);
                setRenameDialogOpen(true);
              }}
            >
              重命名…
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="flex items-center gap-2 text-destructive"
              onSelect={() => {
                const ids = Array.from(selected);
                if (ids.length === 0) return;
                // 优先使用父组件传递的删除函数，确保本地状态同步更新
                if (onDeleteMany) {
                  onDeleteMany(ids);
                } else if (onDelete) {
                  ids.forEach((id) => onDelete(id));
                } else if (window?.YUA?.resource?.deleteResources) {
                  // 如果没有传递删除函数，则直接调用主进程 API（不推荐）
                  window.YUA.resource.deleteResources({ ids });
                }
              }}
            >
              <TbTrash /> 删除
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => setSelected(new Set(mergedItems.map((i) => i.id)))}>全选</ContextMenuItem>
            <ContextMenuItem onSelect={() => clearSelection()}>取消选择</ContextMenuItem>
          </>
        ) : (
          <>
            <ContextMenuItem
              onSelect={async () => {
                await handleRevealCurrentFolder();
              }}
            >
              {(window as any).YUA?.isWindows ? '在资源管理器中显示' : '在 Finder 中显示'}
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <TbLine className="mr-2" /> 执行任务
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                {(() => {
                  // 只显示不需要资源的工作流，并过滤掉空白工作流
                  const visibleWorkflows = workflows.filter((wf) => {
                    // 过滤空白工作流
                    if (wf.id === 'blank') return false;
                    // 只显示不需要资源的工作流
                    return !workflowRequiresResource(wf);
                  });

                  return visibleWorkflows.length > 0 ? (
                    visibleWorkflows.map((wf) => {
                      return (
                        <ContextMenuItem
                          key={wf.id}
                          onSelect={async () => {
                            // 其他模式（text/url/file）不需要资源，直接执行
                            // 引擎会自动检测并弹出输入窗口
                            await runWorkflow({
                              defId: wf.id,
                              input: {},
                              metadata: {
                                workspaceId,
                                folderId
                              },
                              onSuccess: () => {
                                toast.success(`已开始执行工作流: ${wf.name}`);
                              }
                            });
                          }}
                        >
                          <div className="flex items-center gap-2">
                            {wf.icon ? <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center" dangerouslySetInnerHTML={{ __html: wf.icon }} /> : null}
                            <span>{wf.name}</span>
                          </div>
                        </ContextMenuItem>
                      );
                    })
                  ) : (
                    <ContextMenuItem disabled>无可用工作流</ContextMenuItem>
                  );
                })()}
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuSeparator />
            <ContextMenuItem
              onSelect={async () => {
                await handleCreateSubfolder();
              }}
            >
              <TbFolderPlus className="mr-2" /> 新建文件夹
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => setSelected(new Set(mergedItems.map((i) => i.id)))}>全选</ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>重命名资源</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleRenameConfirm();
                }
              }}
              placeholder="输入新名称"
            />
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" className="w-20" onClick={() => setRenameDialogOpen(false)}>
              取消
            </Button>
            <Button size="sm" className="w-20" onClick={handleRenameConfirm} disabled={!renameValue.trim()}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ContextMenu>
  );
};

export default ExplorerGrid;
