import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbFolderFilled, TbFolderOpen, TbFolderPlus, TbLine, TbPencil, TbTrash } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { runWorkflow } from '@/lib/workflow-runner';

import { ResourceItem } from '../types';
import type { UIFolder } from './FolderSidebar';
import ResourceListItem from './ResourceListItem';

// 拖拽框选相关类型
type Point = { x: number; y: number };
type Rect = { left: number; top: number; right: number; bottom: number };

function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(a.left > b.right || a.right < b.left || a.top > b.bottom || a.bottom < b.top);
}

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
  folderId?: string;
  workspaceId?: string;
  onItemClick: (e: React.MouseEvent, item: ResourceItem) => void;
  onToggleFavorite?: (id: string) => void;
  onToggleVisibility?: (id: string) => void;
  onOpenFolder?: (id: string) => void;
  onDropResourcesToFolder?: (folderId: string, ids: string[]) => void;
  onRenameFolder?: (id: string) => void;
  onDeleteFolder?: (id: string) => void;
  onOpenFolderLocation?: (id: string) => void;
  onMoveFolder?: (id: string, newParentId: string | null) => void | Promise<void>;
  onPreview?: (item: ResourceItem) => void;
  onDelete?: (id: string) => void;
  onDeleteMany?: (ids: string[]) => void;
  onFolderCreated?: () => void | Promise<void>;
  setSelectedItems?: (items: Set<string>) => void;
}

export const ExplorerList: React.FC<ExplorerListProps> = ({
  items,
  folders = [],
  counts = {},
  folderParentMap,
  selectedItems,
  folderId,
  workspaceId,
  onItemClick,
  onToggleFavorite,
  onToggleVisibility,
  onOpenFolder,
  onDropResourcesToFolder,
  onRenameFolder,
  onDeleteFolder,
  onOpenFolderLocation,
  onMoveFolder,
  onPreview,
  onDelete,
  onDeleteMany,
  onFolderCreated,
  setSelectedItems
}) => {
  const isWin = (window as any).YUA?.isWindows;
  const revealLabel = isWin ? '在资源管理器中显示' : '在 Finder 中显示';

  // 拖拽框选相关
  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragEnd, setDragEnd] = useState<Point | null>(null);
  const isDragging = dragStart && dragEnd;

  // 重命名对话框状态
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);

  // 用于 Shift 点选的锚点索引
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);

  // 构建 id 到索引的映射
  const idToIndex = useMemo(() => {
    const m = new Map<string, number>();
    items.forEach((it, idx) => m.set(it.id, idx));
    return m;
  }, [items]);

  // 范围选择辅助函数
  const setSelectionToRange = useCallback(
    (startIdx: number, endIdx: number, additive = false) => {
      if (!setSelectedItems) return;
      const [lo, hi] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
      const newSel = new Set(additive ? Array.from(selectedItems) : []);
      for (let i = lo; i <= hi; i++) {
        if (items[i]) newSel.add(items[i].id);
      }
      setSelectedItems(newSel);
    },
    [items, selectedItems, setSelectedItems]
  );

  // 更新元素引用（用于框选检测）
  const updateItemRef = useCallback(
    (id: string) => (el: HTMLDivElement | null) => {
      if (el) itemRefs.current.set(id, el);
      else itemRefs.current.delete(id);
    },
    []
  );

  // 清除选择
  const clearSelection = useCallback(() => {
    if (setSelectedItems) {
      setSelectedItems(new Set());
    }
  }, [setSelectedItems]);

  // 计算选择框矩形
  const selectionRect: Rect | null = useMemo(() => {
    if (!dragStart || !dragEnd) return null;
    const left = Math.min(dragStart.x, dragEnd.x);
    const top = Math.min(dragStart.y, dragEnd.y);
    const right = Math.max(dragStart.x, dragEnd.x);
    const bottom = Math.max(dragStart.y, dragEnd.y);
    return { left, top, right, bottom };
  }, [dragStart, dragEnd]);

  // 拖拽框选：鼠标按下
  const handleBackgroundPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      // 如果点击在列表项或文件夹上，不启动框选
      const isOnItem = target.closest('[data-explorer-item], [data-list-folder-row]');
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

  // 拖拽框选：鼠标移动
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

      const base = e.metaKey || e.ctrlKey ? new Set(selectedItems) : new Set<string>();
      itemRefs.current.forEach((el, id) => {
        const r = el.getBoundingClientRect();
        if (rectsIntersect(selRect, { left: r.left, top: r.top, right: r.right, bottom: r.bottom })) base.add(id);
      });
      if (setSelectedItems) {
        setSelectedItems(base);
      }
    },
    [dragStart, selectedItems, setSelectedItems]
  );

  // 拖拽框选：鼠标释放
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

  // 增强的点击处理：支持 Shift 范围选择和 Cmd/Ctrl 多选
  const handleEnhancedItemClick = useCallback(
    (e: React.MouseEvent, item: ResourceItem) => {
      const index = idToIndex.get(item.id) ?? -1;
      if (index < 0) return;

      if (e.shiftKey && anchorIndex !== null && setSelectedItems) {
        // Shift + 点击：范围选择
        e.preventDefault();
        setSelectionToRange(anchorIndex, index, e.metaKey || e.ctrlKey);
      } else if (e.metaKey || e.ctrlKey) {
        // Cmd/Ctrl + 点击：切换单项选择
        if (setSelectedItems) {
          const next = new Set(selectedItems);
          if (next.has(item.id)) {
            next.delete(item.id);
          } else {
            next.add(item.id);
          }
          setSelectedItems(next);
          setAnchorIndex(index);
        }
      } else {
        // 普通点击：单选
        if (setSelectedItems) {
          setSelectedItems(new Set([item.id]));
          setAnchorIndex(index);
        }
        // 调用原始的 onItemClick（如果需要其他处理）
        onItemClick(e, item);
      }
    },
    [idToIndex, anchorIndex, selectedItems, setSelectedItems, setSelectionToRange, onItemClick]
  );

  // 键盘事件处理
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Cmd/Ctrl + A：全选
      if (e.key === 'a' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (setSelectedItems) {
          setSelectedItems(new Set(items.map((i) => i.id)));
        }
        return;
      }

      // Escape：取消选择
      if (e.key === 'Escape') {
        if (setSelectedItems) {
          setSelectedItems(new Set());
        }
        return;
      }

      // Delete/Backspace：删除选中项
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedItems.size > 0) {
          const ids = Array.from(selectedItems);
          if (onDeleteMany) {
            onDeleteMany(ids);
          } else if (onDelete) {
            ids.forEach((id) => onDelete(id));
          }
        }
        return;
      }
    },
    [items, selectedItems, setSelectedItems, onDelete, onDeleteMany]
  );

  // 工作流列表
  const [workflows, setWorkflows] = useState<any[]>([]);
  useEffect(() => {
    window.ipcRenderer
      .invoke('wf:listDefinitions')
      .then((defs: any[]) => {
        setWorkflows(defs || []);
      })
      .catch(() => {});
  }, []);

  // 获取第一个选中的资源
  const firstSelectedId = selectedItems.size > 0 ? Array.from(selectedItems)[0] : undefined;
  const firstSelectedItem = useMemo(() => (firstSelectedId ? items.find((i) => i.id === firstSelectedId) : undefined), [items, firstSelectedId]);
  const canRevealSelected = !!firstSelectedItem?.filePath;

  // 获取工作流的开始节点输入模式
  const getWorkflowInputMode = useCallback((wf: any): 'resource' | 'text' | 'url' | 'file' | 'folder' => {
    if (!wf?.nodes) return 'resource';
    const startNode = wf.nodes.find((n: any) => n.id === 'start' || n.type === 'core/start');
    if (!startNode) return 'resource';
    return (startNode.config?.inputMode as 'resource' | 'text' | 'url' | 'file' | 'folder') || 'resource';
  }, []);

  // 获取工作流在开始节点上声明的适用资源类型
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

  // 推断资源的类型
  const getResourceKind = useCallback((item: any): 'image' | 'video' | 'audio' | 'document' | 'other' => {
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

  // 右键菜单处理：如果点击的项目不在选中列表中，则选中该项目
  const handleContextMenu = (e: React.MouseEvent, item: ResourceItem) => {
    if (!selectedItems.has(item.id)) {
      onItemClick(e, item);
    }
  };

  // 删除选中的资源
  const handleDeleteSelected = () => {
    const ids = Array.from(selectedItems);
    if (ids.length === 0) return;
    if (onDeleteMany) {
      onDeleteMany(ids);
    } else if (onDelete) {
      ids.forEach((id) => onDelete(id));
    }
  };

  // 在 Finder 中显示
  const handleRevealSelected = async () => {
    if (!firstSelectedId) return;
    await window.YUA.resource.revealResource({ id: firstSelectedId });
  };

  // 打开当前文件夹
  const handleRevealCurrentFolder = useCallback(async () => {
    try {
      const ws = await (window as any).YUA?.workspace['workspace:getDefault']();
      const sep = isWin ? '\\' : '/';
      const base: string = ws?.rootPath || '';
      if (!base) return;
      const needsSep = base.endsWith(sep) ? '' : sep;
      const folderPath = folderId ? `${base}${needsSep}resources${sep}folders${sep}${folderId}` : `${base}${needsSep}resources`;
      await (window as any).YUA?.file['file:openPath'](folderPath);
    } catch (err) {
      console.warn('open current folder path failed', err);
    }
  }, [folderId, isWin]);

  // 创建子文件夹
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

  // 重命名确认
  const handleRenameConfirm = useCallback(() => {
    const id = renamingId || firstSelectedId;
    const val = renameValue.trim();
    if (!id || !val) {
      setRenameDialogOpen(false);
      return;
    }
    window.YUA.resource.renameResource({ id, newName: val, renameFile: true });
    setRenameDialogOpen(false);
  }, [renamingId, firstSelectedId, renameValue]);

  // 全选
  const handleSelectAll = useCallback(() => {
    if (setSelectedItems) {
      setSelectedItems(new Set(items.map((i) => i.id)));
    }
  }, [items, setSelectedItems]);

  // 取消选择
  const handleClearSelection = useCallback(() => {
    if (setSelectedItems) {
      setSelectedItems(new Set());
    }
  }, [setSelectedItems]);

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={containerRef}
            className="relative space-y-2 px-2 box-border w-full min-h-full outline-none"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onPointerDown={handleBackgroundPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
          >
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
              <div
                key={item.id}
                ref={updateItemRef(item.id)}
                data-explorer-item
                data-id={item.id}
                onContextMenu={(e) => handleContextMenu(e, item)}
              >
                <ResourceListItem
                  item={item}
                  selected={selectedItems.has(item.id)}
                  onClick={handleEnhancedItemClick}
                  onToggleFavorite={onToggleFavorite}
                  onToggleVisibility={onToggleVisibility}
                  onPreview={() => {
                    const current = items[idx];
                    if (!current) return;
                    if (onPreview) {
                      onPreview(current);
                    } else {
                      window.YUA.window['window:open'](
                        'resourcePreview',
                        { current, list: items, index: idx },
                        { sameDisplayAsSender: true }
                      );
                    }
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
              </div>
            ))}

            {/* 拖拽框选的选择框 */}
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
          {selectedItems.size > 0 ? (
            <>
              <div className="px-2 py-1.5 text-sm text-muted-foreground">已选择 {selectedItems.size} 项</div>
              <ContextMenuSeparator />
              {canRevealSelected && (
                <>
                  <ContextMenuItem onSelect={handleRevealSelected}>
                    <TbFolderOpen className="mr-2" /> {revealLabel}
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                </>
              )}

              {/* 执行任务 */}
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <TbLine className="mr-2" /> 执行任务
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-48">
                  {(() => {
                    const visibleWorkflows = workflows.filter((wf) => {
                      if (wf.id === 'blank') return false;
                      const inputMode = getWorkflowInputMode(wf);
                      if (inputMode !== 'resource') return false;
                      if (!firstSelectedId) return false;
                      const item = items.find((i) => i.id === firstSelectedId);
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
                                if (!firstSelectedId) return;
                                const item = items.find((i) => i.id === firstSelectedId);
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
                                await runWorkflow({
                                  defId: wf.id,
                                  input: {},
                                  metadata: { workspaceId, folderId },
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

              {/* 重命名 */}
              <ContextMenuItem
                onSelect={() => {
                  if (!firstSelectedId) return;
                  const item = items.find((i) => i.id === firstSelectedId);
                  setRenameValue(item?.title || item?.filePath || item?.url || '');
                  setRenamingId(firstSelectedId);
                  setRenameDialogOpen(true);
                }}
              >
                重命名…
              </ContextMenuItem>
              <ContextMenuSeparator />

              {/* 删除 */}
              <ContextMenuItem className="flex items-center gap-2 text-destructive" onSelect={handleDeleteSelected}>
                <TbTrash /> 删除
              </ContextMenuItem>
              <ContextMenuSeparator />

              {/* 全选/取消选择 */}
              <ContextMenuItem onSelect={handleSelectAll}>全选</ContextMenuItem>
              <ContextMenuItem onSelect={handleClearSelection}>取消选择</ContextMenuItem>
            </>
          ) : (
            <>
              {/* 未选中时的菜单 */}
              <ContextMenuItem onSelect={handleRevealCurrentFolder}>
                <TbFolderOpen className="mr-2" /> {revealLabel}
              </ContextMenuItem>
              <ContextMenuSeparator />

              {/* 执行任务（不需要资源的工作流） */}
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <TbLine className="mr-2" /> 执行任务
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="w-48">
                  {(() => {
                    const visibleWorkflows = workflows.filter((wf) => {
                      if (wf.id === 'blank') return false;
                      return !workflowRequiresResource(wf);
                    });

                    return visibleWorkflows.length > 0 ? (
                      visibleWorkflows.map((wf) => (
                        <ContextMenuItem
                          key={wf.id}
                          onSelect={async () => {
                            await runWorkflow({
                              defId: wf.id,
                              input: {},
                              metadata: { workspaceId, folderId },
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
                      ))
                    ) : (
                      <ContextMenuItem disabled>无可用工作流</ContextMenuItem>
                    );
                  })()}
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSeparator />

              {/* 新建文件夹 */}
              <ContextMenuItem onSelect={handleCreateSubfolder}>
                <TbFolderPlus className="mr-2" /> 新建文件夹
              </ContextMenuItem>
              <ContextMenuSeparator />

              {/* 全选 */}
              <ContextMenuItem onSelect={handleSelectAll}>全选</ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* 重命名对话框 */}
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
    </>
  );
};

export default ExplorerList;
