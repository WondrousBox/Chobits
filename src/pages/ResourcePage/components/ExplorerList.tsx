import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbArrowDown, TbArrowUp, TbCalendar, TbChevronRight, TbEyeOff, TbFile, TbFolderFilled, TbFolderOpen, TbFolderPlus, TbLine, TbPencil, TbStack2, TbTrash, TbTypography } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { runWorkflow } from '@/lib/workflow-runner';

import { ResourceItem, SortField, SortOrder } from '../types';
import {
  getIgnoreLinkedMissingDirectoryErrorMessage,
  getIgnoreLinkedMissingDirectorySuccessMessage,
  getLinkedFolderIssueBadge,
  getLinkedFolderState,
  getLinkedFolderStateDescription,
  getReconnectLinkedMissingDirectoryErrorMessage,
  getReconnectLinkedMissingDirectorySuccessMessage,
  getRecreateLinkedMissingDirectoryErrorMessage,
  getRecreateLinkedMissingDirectorySuccessMessage,
  ignoreLinkedMissingDirectory,
  isLinkedFolderMissing,
  reconnectLinkedMissingDirectory,
  recreateLinkedMissingDirectory
} from '../utils/linkedFolderState';
import {
  getLinkedResourceDiskInfo,
  getLinkedResourceSyncIssue,
  getLinkedResourceSyncIssueDescription,
  getResolveLinkedResourceConflictErrorMessage,
  type LinkedResourceDiskInfo,
  openContainingFolderForResource,
  rescanLinkedResourceRoot,
  resolveLinkedResourceConflict
} from '../utils/linkedResourceSync';
import type { UIFolder } from './FolderSidebar';
import ResourceListItem from './ResourceListItem';

// 拖拽框选相关类型
type Point = { x: number; y: number };
type Rect = { left: number; top: number; right: number; bottom: number };

function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(a.left > b.right || a.right < b.left || a.top > b.bottom || a.bottom < b.top);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// 表头组件
interface TableHeaderProps {
  sortField: SortField;
  sortOrder: SortOrder;
  onSort: (field: SortField) => void;
}

const TableHeader: React.FC<TableHeaderProps> = ({ sortField, sortOrder, onSort }) => {
  // 渲染排序图标
  const renderSortIcon = (field: SortField): React.ReactNode => {
    if (sortField !== field) return null;
    return sortOrder === 'asc' ? <TbArrowUp className="w-3 h-3" /> : <TbArrowDown className="w-3 h-3" />;
  };

  return (
    <div className="flex items-center h-8 border-b border-border/50 text-xs text-muted-foreground sticky top-0 z-10 bg-background">
      {/* 名称列 */}
      <div className="flex-1 min-w-0 h-full flex items-center border-r border-border/30 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => onSort('title')}>
        <div className="flex items-center gap-1.5 px-2">
          <TbTypography className="w-3.5 h-3.5 text-muted-foreground/70" />
          <span>名称</span>
          {renderSortIcon('title')}
        </div>
      </div>

      {/* 类型列 */}
      <div className="w-24 shrink-0 h-full flex items-center border-r border-border/30 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => onSort('type')}>
        <div className="flex items-center gap-1.5 px-2">
          <TbFile className="w-3.5 h-3.5 text-muted-foreground/70" />
          <span>类型</span>
          {renderSortIcon('type')}
        </div>
      </div>

      {/* 大小列 */}
      <div className="w-20 shrink-0 h-full flex items-center border-r border-border/30 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => onSort('sizeBytes')}>
        <div className="flex items-center gap-1.5 px-2">
          <TbStack2 className="w-3.5 h-3.5 text-muted-foreground/70" />
          <span>大小</span>
          {renderSortIcon('sizeBytes')}
        </div>
      </div>

      {/* 时间列 */}
      <div className="w-28 shrink-0 h-full flex items-center border-r border-border/30 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => onSort('collectedAt')}>
        <div className="flex items-center gap-1.5 px-2">
          <TbCalendar className="w-3.5 h-3.5 text-muted-foreground/70" />
          <span>收集时间</span>
          {renderSortIcon('collectedAt')}
        </div>
      </div>

      {/* 右侧空白列 - 保留空间用于对齐 */}
      <div className="w-8 shrink-0 h-full" />
    </div>
  );
};

// Notion 风格的文件夹行组件
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
  onReconnectMissingFolder?: () => void | Promise<void>;
  onRecreateMissingFolder?: () => void | Promise<void>;
  onIgnoreMissingFolder?: () => void | Promise<void>;
}> = ({ folder, count, folderParentMap, onOpen, onDropResources, onMoveFolder, onRename, onDelete, onOpenLocation, onReconnectMissingFolder, onRecreateMissingFolder, onIgnoreMissingFolder }) => {
  const [over, setOver] = useState(false);
  const [overInvalid, setOverInvalid] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const isWin = (window as any).YUA?.isWindows;
  const revealLabel = isWin ? '在资源管理器中显示' : '在 Finder 中显示';
  const linkedFolderState = getLinkedFolderState(folder);
  const linkedFolderIssueBadge = getLinkedFolderIssueBadge(linkedFolderState);
  const linkedFolderIssueDescription = getLinkedFolderStateDescription(linkedFolderState);
  const canRecreateLinkedFolder = isLinkedFolderMissing(linkedFolderState);

  // 检查是否为祖先文件夹（防止循环移动）
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
            <div
              data-list-folder-row
              className={cn(
                // Notion 风格表格行
                'group relative flex items-center h-[33px] border-b border-border/20 transition-colors duration-75 cursor-pointer select-none',
                // 拖拽悬停状态
                over && !overInvalid && 'bg-primary/10',
                over && overInvalid && 'bg-destructive/10',
                // 默认 hover 效果
                !over && 'hover:bg-muted/50'
              )}
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
              {/* 文件夹名称 */}
              <div className="flex-1 min-w-0 h-full flex items-center px-2 border-r border-border/20 gap-2">
                <TbFolderFilled className="w-4 h-4 text-primary/70 shrink-0" />
                <span className="text-sm truncate">{folder.name}</span>
                {linkedFolderIssueBadge ? (
                  <span className={`inline-flex h-5 shrink-0 items-center rounded border px-1.5 text-[10px] ${linkedFolderIssueBadge.className}`} title={linkedFolderIssueDescription}>
                    {linkedFolderIssueBadge.label}
                  </span>
                ) : null}
              </div>

              {/* 类型列 - 显示"文件夹" */}
              <div className="w-24 shrink-0 h-full flex items-center px-2 border-r border-border/20">
                <span className="text-xs text-muted-foreground">文件夹</span>
              </div>

              {/* 大小列 - 显示子项数量 */}
              <div className="w-20 shrink-0 h-full flex items-center px-2 border-r border-border/20">
                <span className="text-xs text-muted-foreground">{typeof count === 'number' ? `${count} 项` : '-'}</span>
              </div>

              {/* 时间列 - 显示箭头图标 */}
              <div className="w-28 shrink-0 h-full flex items-center px-2 border-r border-border/20 justify-end">
                <TbChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>

              {/* 右侧空白列 - 对齐表头的添加列按钮 */}
              <div className="w-8 shrink-0" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">不能移动到自己的子文件夹中</TooltipContent>
        </Tooltip>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-[200px]" onClick={(e) => e.stopPropagation()}>
        {linkedFolderIssueDescription ? (
          <>
            <ContextMenuItem disabled className="h-auto whitespace-normal py-2 text-xs leading-relaxed opacity-100">
              {linkedFolderIssueDescription}
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : null}
        {canRecreateLinkedFolder ? (
          <>
            <ContextMenuItem className="flex items-center gap-2" onSelect={() => onReconnectMissingFolder?.()}>
              <TbFolderOpen /> 选择新路径重连
            </ContextMenuItem>
            <ContextMenuItem className="flex items-center gap-2" onSelect={() => onRecreateMissingFolder?.()}>
              <TbFolderPlus /> 在原位置重建目录
            </ContextMenuItem>
            <ContextMenuItem className="flex items-center gap-2" onSelect={() => onIgnoreMissingFolder?.()}>
              <TbEyeOff /> 忽略缺失目录
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        ) : null}
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

// 底部统计信息组件
const StatsRow: React.FC<{
  filteredCount: number;
  totalCount: number;
}> = ({ filteredCount, totalCount }) => {
  return (
    <div className="flex items-center h-[33px] text-xs text-muted-foreground justify-end px-4">
      <span>
        共 {filteredCount}/{totalCount} 个资源
      </span>
    </div>
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
  sortField?: SortField;
  sortOrder?: SortOrder;
  onSort?: (field: SortField, order: SortOrder) => void;
  onItemClick: (e: React.MouseEvent, item: ResourceItem) => void;
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
  /** 最近新增资源的 ID 集合，用于高亮显示 */
  highlightedIds?: Set<string>;
  /** 所有资源的总数（用于统计显示） */
  totalCount?: number;
}

export const ExplorerList: React.FC<ExplorerListProps> = ({
  items,
  folders = [],
  counts = {},
  folderParentMap,
  selectedItems,
  folderId,
  workspaceId,
  sortField = 'collectedAt',
  sortOrder = 'desc',
  onSort,
  onItemClick,
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
  setSelectedItems,
  highlightedIds,
  totalCount = 0
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

  // 排序处理
  const handleSort = useCallback(
    (field: SortField) => {
      if (!onSort) return;
      // 如果点击当前排序字段，切换排序顺序
      if (field === sortField) {
        onSort(field, sortOrder === 'asc' ? 'desc' : 'asc');
      } else {
        // 否则按新字段降序排序
        onSort(field, 'desc');
      }
    },
    [sortField, sortOrder, onSort]
  );

  // 工作流列表
  const [workflows, setWorkflows] = useState<any[]>([]);
  useEffect(() => {
    window.ipcRenderer
      .invoke('wf:listDefinitions', { workspaceId })
      .then((defs: any[]) => {
        setWorkflows(defs || []);
      })
      .catch(() => { });
  }, [workspaceId]);

  // 获取第一个选中的资源
  const firstSelectedId = selectedItems.size > 0 ? Array.from(selectedItems)[0] : undefined;
  const firstSelectedItem = useMemo(() => (firstSelectedId ? items.find((i) => i.id === firstSelectedId) : undefined), [items, firstSelectedId]);
  const selectedSyncIssue = getLinkedResourceSyncIssue(firstSelectedItem);
  const canRepairSelected = selectedItems.size === 1 && !!selectedSyncIssue;
  const canRevealSelected = !!firstSelectedItem?.filePath && !canRepairSelected;

  const [conflictDiffInfo, setConflictDiffInfo] = useState<LinkedResourceDiskInfo | null>(null);
  const [conflictDiffOpen, setConflictDiffOpen] = useState(false);

  const handleViewConflictDiff = useCallback(async () => {
    if (!firstSelectedItem) return;
    const result = await getLinkedResourceDiskInfo(firstSelectedItem);
    if (result.success && result.data) {
      setConflictDiffInfo(result.data);
      setConflictDiffOpen(true);
    } else {
      toast.error('无法获取文件差异信息');
    }
  }, [firstSelectedItem]);

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
  const handleContextMenu = (e: React.MouseEvent, item: ResourceItem): void => {
    if (!selectedItems.has(item.id)) {
      onItemClick(e, item);
    }
  };

  // 删除选中的资源
  const handleDeleteSelected = (): void => {
    const ids = Array.from(selectedItems);
    if (ids.length === 0) return;
    if (onDeleteMany) {
      onDeleteMany(ids);
    } else if (onDelete) {
      ids.forEach((id) => onDelete(id));
    }
  };

  // 在 Finder 中显示
  const handleRevealSelected = async (): Promise<void> => {
    if (!firstSelectedId) return;
    await window.YUA.resource.revealResource({ id: firstSelectedId });
  };

  const handleRescanSelectedLinkedResource = useCallback(async () => {
    if (!firstSelectedItem) return;
    try {
      const result = await rescanLinkedResourceRoot(firstSelectedItem);
      if (!result.success) {
        toast.error('重新扫描失败', { description: result.error || 'unknown' });
        return;
      }
      toast.success('已重新扫描关联目录', {
        description: `已检查 ${result.resourceCount ?? 0} 个文件`
      });
      await onFolderCreated?.();
    } catch (error: any) {
      toast.error('重新扫描失败', { description: error?.message || String(error) });
    }
  }, [firstSelectedItem, onFolderCreated]);

  const handleOpenSelectedContainingFolder = useCallback(async () => {
    if (!firstSelectedItem) return;
    try {
      const result = await openContainingFolderForResource(firstSelectedItem);
      if (!result.success) {
        toast.error('打开所在目录失败', { description: result.error || 'unknown' });
      }
    } catch (error: any) {
      toast.error('打开所在目录失败', { description: error?.message || String(error) });
    }
  }, [firstSelectedItem]);

  const handleResolveSelectedConflict = useCallback(
    async (action: 'accept-disk' | 'copy-disk-snapshot') => {
      if (!firstSelectedItem) return;
      try {
        const result = await resolveLinkedResourceConflict(firstSelectedItem, action);
        if (!result?.success) {
          toast.error('处理冲突失败', { description: getResolveLinkedResourceConflictErrorMessage(result?.error) });
          return;
        }
        toast.success(action === 'accept-disk' ? '已采用磁盘版本' : '已另存磁盘副本', {
          description: action === 'accept-disk' ? '关联资源已恢复为已同步状态。' : '磁盘当前版本已复制到工作区，原关联资源已确认磁盘版本。'
        });
        await onFolderCreated?.();
      } catch (error: any) {
        toast.error('处理冲突失败', { description: error?.message || String(error) });
      }
    },
    [firstSelectedItem, onFolderCreated]
  );

  const handleRecreateLinkedMissingFolder = useCallback(
    async (targetFolderId: string) => {
      try {
        const result = await recreateLinkedMissingDirectory(targetFolderId);
        if (!result?.success) {
          toast.error('重建目录失败', { description: getRecreateLinkedMissingDirectoryErrorMessage(result?.error) });
          return;
        }
        toast.success('已在原位置重建目录', { description: getRecreateLinkedMissingDirectorySuccessMessage(result) });
        await onFolderCreated?.();
      } catch (error: any) {
        toast.error('重建目录失败', { description: error?.message || String(error) });
      }
    },
    [onFolderCreated]
  );

  const handleReconnectLinkedMissingFolder = useCallback(
    async (targetFolderId: string) => {
      try {
        const result = await reconnectLinkedMissingDirectory(targetFolderId);
        if (result?.canceled) return;
        if (!result?.success) {
          toast.error('重连目录失败', { description: getReconnectLinkedMissingDirectoryErrorMessage(result?.error) });
          return;
        }
        toast.success('已重连缺失目录', { description: getReconnectLinkedMissingDirectorySuccessMessage(result) });
        await onFolderCreated?.();
      } catch (error: any) {
        toast.error('重连目录失败', { description: error?.message || String(error) });
      }
    },
    [onFolderCreated]
  );

  const handleIgnoreLinkedMissingFolder = useCallback(
    async (targetFolderId: string) => {
      try {
        const result = await ignoreLinkedMissingDirectory(targetFolderId);
        if (!result?.success) {
          toast.error('忽略目录失败', { description: getIgnoreLinkedMissingDirectoryErrorMessage(result?.error) });
          return;
        }
        toast.success('已忽略缺失目录', { description: getIgnoreLinkedMissingDirectorySuccessMessage(result) });
        await onFolderCreated?.();
      } catch (error: any) {
        toast.error('忽略目录失败', { description: error?.message || String(error) });
      }
    },
    [onFolderCreated]
  );

  // 打开当前文件夹
  const handleRevealCurrentFolder = useCallback(async () => {
    try {
      const folderApi: any = (window as any).YUA?.folder;
      if (!folderApi?.['folder.getResolvedPath']) return;
      const resolved = await folderApi['folder.getResolvedPath']({ id: folderId ?? null, workspaceId: workspaceId || undefined });
      const folderPath: string | undefined = resolved?.success ? resolved.path : undefined;
      if (!folderPath) return;
      await (window as any).YUA?.file['file:openPath'](folderPath);
    } catch (err) {
      console.warn('open current folder path failed', err);
    }
  }, [folderId, workspaceId]);

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
  const handleRenameConfirm = useCallback(async () => {
    const id = renamingId || firstSelectedId;
    const val = renameValue.trim();
    if (!id || !val) {
      setRenameDialogOpen(false);
      return;
    }
    try {
      const result = await window.YUA.resource.renameResource({ id, newName: val, renameFile: true });
      if (!result?.success) {
        toast.error('重命名失败', { description: result?.error || 'unknown' });
        return;
      }
      toast.success('已重命名');
    } catch (error: any) {
      toast.error('重命名失败', { description: error?.message || String(error) });
    } finally {
      setRenameDialogOpen(false);
    }
  }, [renamingId, firstSelectedId, renameValue]);

  // 全选
  const handleSelectAll = useCallback(() => {
    if (setSelectedItems) {
      setSelectedItems(new Set(items.map((i) => i.id)));
    }
  }, [items, setSelectedItems]);

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={containerRef}
            className="relative flex flex-col w-full min-h-full outline-none"
            tabIndex={0}
            onKeyDown={handleKeyDown}
            onPointerDown={handleBackgroundPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
          >
            {/* 表头 */}
            <TableHeader sortField={sortField} sortOrder={sortOrder} onSort={handleSort} />

            {/* 列表内容 */}
            <div className="flex-1">
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
                  onReconnectMissingFolder={() => handleReconnectLinkedMissingFolder(f.id)}
                  onRecreateMissingFolder={() => handleRecreateLinkedMissingFolder(f.id)}
                  onIgnoreMissingFolder={() => handleIgnoreLinkedMissingFolder(f.id)}
                />
              ))}

              {/* 再渲染资源列表条目 */}
              {items.map((item, idx) => (
                <div key={item.id} ref={updateItemRef(item.id)} data-explorer-item data-id={item.id} onContextMenu={(e) => handleContextMenu(e, item)}>
                  <ResourceListItem
                    item={item}
                    selected={selectedItems.has(item.id)}
                    isNew={!!highlightedIds?.has(item.id)}
                    onClick={handleEnhancedItemClick}
                    onPreview={() => {
                      const current = items[idx];
                      if (!current) return;
                      if (onPreview) {
                        onPreview(current);
                      } else {
                        window.YUA.window['window:open']('resourcePreview', { current, list: items, index: idx }, { sameDisplayAsSender: true });
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

              {/* 底部统计信息 */}
              <StatsRow filteredCount={items.length} totalCount={totalCount} />
            </div>

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
              {canRepairSelected && (
                <>
                  <div className="px-2 pb-1 text-xs text-muted-foreground">{getLinkedResourceSyncIssueDescription(selectedSyncIssue)}</div>
                  {selectedSyncIssue === 'conflict' ? (
                    <>
                      <ContextMenuItem onSelect={handleViewConflictDiff}>查看差异</ContextMenuItem>
                      <ContextMenuItem onSelect={() => handleResolveSelectedConflict('accept-disk')}>采用磁盘版本</ContextMenuItem>
                      <ContextMenuItem onSelect={() => handleResolveSelectedConflict('copy-disk-snapshot')}>另存磁盘副本并确认</ContextMenuItem>
                    </>
                  ) : null}
                  <ContextMenuItem onSelect={handleRescanSelectedLinkedResource}>重新扫描关联目录</ContextMenuItem>
                  <ContextMenuItem onSelect={handleOpenSelectedContainingFolder}>打开所在目录</ContextMenuItem>
                  <ContextMenuSeparator />
                </>
              )}
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
              <ContextMenuItem onSelect={clearSelection}>取消选择</ContextMenuItem>
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

      <Dialog open={conflictDiffOpen} onOpenChange={setConflictDiffOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>文件冲突差异</DialogTitle>
          </DialogHeader>
          {conflictDiffInfo && (
            <div className="space-y-3 text-sm">
              <div className="truncate text-xs text-muted-foreground">{conflictDiffInfo.db.filePath}</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border p-3 space-y-2">
                  <div className="font-medium text-muted-foreground">数据库快照</div>
                  <div>大小: {conflictDiffInfo.db.sizeBytes != null ? formatBytes(conflictDiffInfo.db.sizeBytes) : '未知'}</div>
                  <div>修改时间: {conflictDiffInfo.db.mtimeMs ? new Date(conflictDiffInfo.db.mtimeMs).toLocaleString() : '未知'}</div>
                </div>
                <div className="rounded-md border p-3 space-y-2 border-amber-500/50">
                  <div className="font-medium text-amber-600">当前磁盘</div>
                  {conflictDiffInfo.disk.exists ? (
                    <>
                      <div>大小: {conflictDiffInfo.disk.sizeBytes != null ? formatBytes(conflictDiffInfo.disk.sizeBytes) : '未知'}</div>
                      <div>修改时间: {conflictDiffInfo.disk.mtimeMs ? new Date(conflictDiffInfo.disk.mtimeMs).toLocaleString() : '未知'}</div>
                    </>
                  ) : (
                    <div className="text-destructive">文件不存在</div>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setConflictDiffOpen(false)}>关闭</Button>
            <Button size="sm" onClick={() => { setConflictDiffOpen(false); handleResolveSelectedConflict('accept-disk'); }}>采用磁盘版本</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ExplorerList;
