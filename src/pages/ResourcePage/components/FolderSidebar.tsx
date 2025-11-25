import React, { useCallback } from 'react';
import { TbHome, TbPlus } from 'react-icons/tb';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { SidebarGroup, SidebarGroupAction, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';

import FolderTreeRow from './FolderTreeRow';

export type UIFolder = {
  id: string;
  name: string;
  parentId?: string | null;
  workspaceId?: string;
  children?: UIFolder[];
};

function buildTree(flat: UIFolder[]): UIFolder[] {
  const map = new Map<string, UIFolder>();
  const roots: UIFolder[] = [];
  flat.forEach((f) => map.set(f.id, { ...f, children: [] }));
  map.forEach((node) => {
    const pid = node.parentId || null;
    if (pid && map.has(pid)) {
      map.get(pid)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

interface FolderSidebarProps {
  folders: UIFolder[];
  selectedId?: string;
  onSelect: (id: string | '') => void;
  onCreate: (parentId?: string | null) => Promise<string | void>;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onDropResources?: (folderId: string | null, ids: string[]) => void;
  onMoveFolder?: (id: string, newParentId: string | null) => Promise<void> | void;
  counts?: Record<string, number>;
  allCount?: number;
  onInlineRename?: (id: string, name: string) => Promise<void>;
  workspaceId?: string;
}

const FolderSidebar = ({
  folders,
  selectedId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onDropResources,
  onMoveFolder,
  counts,
  allCount,
  onInlineRename,
  workspaceId
}: FolderSidebarProps): React.ReactElement => {
  const tree = React.useMemo(() => buildTree(folders), [folders]);
  const wsId = workspaceId || 'default';
  const expandedKey = `resource-folder-expanded-${wsId}`;

  // 从 localStorage 加载展开状态
  const loadExpandedIds = useCallback((): Set<string> => {
    try {
      const stored = localStorage.getItem(expandedKey);
      if (stored) {
        const ids = JSON.parse(stored) as string[];
        return new Set(ids);
      }
    } catch (err) {
      console.warn('load expanded ids failed', err);
    }
    return new Set();
  }, [expandedKey]);

  // 保存展开状态到 localStorage
  const saveExpandedIds = useCallback(
    (ids: Set<string>) => {
      try {
        const array = Array.from(ids);
        localStorage.setItem(expandedKey, JSON.stringify(array));
      } catch (err) {
        console.warn('save expanded ids failed', err);
      }
    },
    [expandedKey]
  );

  // 管理展开/收起的节点集合
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
  const initializedRef = React.useRef(false);

  React.useEffect(() => {
    if (initializedRef.current) return;
    // 先尝试从 localStorage 加载
    const stored = loadExpandedIds();
    if (stored.size > 0) {
      // 验证存储的 ID 是否仍然存在于当前文件夹树中
      const validIds = new Set<string>();
      const allFolderIds = new Set(folders.map((f) => f.id));
      for (const id of stored) {
        if (allFolderIds.has(id)) {
          validIds.add(id);
        }
      }
      setExpandedIds(validIds);
      initializedRef.current = true;
      return;
    }
    // 如果没有存储的状态，默认展开所有有子节点的项
    const ids: string[] = [];
    const walk = (nodes: UIFolder[]): void => {
      for (const n of nodes) {
        if ((n.children || []).length > 0) ids.push(n.id);
        if (n.children && n.children.length) walk(n.children);
      }
    };
    walk(tree);
    setExpandedIds(new Set(ids));
    initializedRef.current = true;
  }, [tree, loadExpandedIds, folders]);

  // 当 expandedIds 改变时保存到 localStorage
  React.useEffect(() => {
    if (!initializedRef.current) return;
    saveExpandedIds(expandedIds);
  }, [expandedIds, saveExpandedIds]);

  // 构建父子映射，便于根据选中项展开祖先链路
  const parentMap = React.useMemo(() => {
    const map = new Map<string, string | null>();
    for (const f of folders) {
      map.set(f.id, f.parentId ?? null);
    }
    return map;
  }, [folders]);

  // Track dragging folder id across rows for validation on dragover
  const [draggingFolderId, setDraggingFolderId] = React.useState<string | null>(null);

  // 当外部选择变化时，自动展开到该文件夹所在层级
  React.useEffect(() => {
    if (!selectedId) return; // 全部
    // 计算从选中节点到根的路径
    const path: string[] = [];
    let cur: string | null | undefined = selectedId;
    const guard = new Set<string>(); // 防止意外环
    while (cur) {
      if (guard.has(cur)) break;
      guard.add(cur);
      path.push(cur);
      cur = parentMap.get(cur) ?? null;
    }
    if (path.length === 0) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      // 展开所有祖先（除了叶子本身也无妨）
      for (const id of path) next.add(id);
      return next;
    });
  }, [selectedId, parentMap]);

  const toggleExpand = React.useCallback(
    (id: string) => {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        // 立即保存到 localStorage
        saveExpandedIds(next);
        return next;
      });
    },
    [saveExpandedIds]
  );

  const isExpanded = React.useCallback((id: string) => expandedIds.has(id), [expandedIds]);
  const [inlineEditId, setInlineEditId] = React.useState<string | null>(null);
  const [rootOver, setRootOver] = React.useState<boolean>(false);
  // F2 重命名：当按下 F2 时，展开所选文件夹的祖先并进入内联编辑
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      // 忽略在输入框/文本域/可编辑区域内的按键
      const t = e.target as HTMLElement | null;
      const tag = (t?.tagName || '').toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || (t?.isContentEditable ?? false);
      if (isTyping) return;

      if (e.key === 'F2') {
        if (inlineEditId) return; // 已在编辑中
        const id = selectedId || '';
        if (!id) return; // “全部”状态不重命名
        e.preventDefault();

        // 展开祖先链，确保可见
        const path: string[] = [];
        let cur: string | null | undefined = id;
        const guard = new Set<string>();
        while (cur) {
          if (guard.has(cur)) break;
          guard.add(cur);
          path.push(cur);
          cur = parentMap.get(cur) ?? null;
        }
        if (path.length) {
          setExpandedIds((prev) => {
            const next = new Set(prev);
            for (const pid of path) next.add(pid);
            return next;
          });
        }
        setInlineEditId(id);
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true } as any);
  }, [selectedId, inlineEditId, parentMap]);

  const handleCreate = React.useCallback(
    async (parentId?: string | null): Promise<void> => {
      try {
        const newId = await onCreate(parentId);
        if (newId) {
          if (parentId) {
            setExpandedIds((prev) => new Set(prev).add(parentId));
          }
          setInlineEditId(newId);
          onSelect(newId);
        }
      } catch (e) {
        console.warn('create folder failed', e);
      }
    },
    [onCreate, onSelect]
  );

  // 快捷键：Ctrl/Cmd+Shift+N 新建（内联重命名），Delete 删除当前选中
  React.useEffect(() => {
    const onKeyDown = async (e: KeyboardEvent): Promise<void> => {
      const t = e.target as HTMLElement | null;
      const tag = (t?.tagName || '').toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || (t?.isContentEditable ?? false);
      if (isTyping) return;

      const isCreateShortcut = (e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'N' || e.key === 'n');
      if (isCreateShortcut) {
        e.preventDefault();
        // 在当前选中作为父级下新建；若未选中则顶层
        const parentId = selectedId || null;
        await handleCreate(parentId);
        return;
      }

      if (e.key === 'Delete') {
        if (inlineEditId) return; // 编辑中不触发删除
        const id = selectedId || '';
        if (!id) return; // “全部”不删除
        e.preventDefault();
        onDelete(id);
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true } as any);
  }, [handleCreate, onDelete, selectedId, inlineEditId]);
  return (
    <>
      <SidebarGroup className="box-border">
        <SidebarGroupLabel>文件夹</SidebarGroupLabel>
        <SidebarGroupAction asChild>
          <Button size="icon" variant={'ghost'} className="w-8 h-8 top-2" onClick={() => handleCreate()}>
            <TbPlus />
          </Button>
        </SidebarGroupAction>
        <SidebarGroupContent>
          <SidebarMenu className="pl-0">
            {tree.length > 0 && (
              <SidebarMenuItem className="pl-0 list-none">
                <SidebarMenuButton
                  isActive={!selectedId}
                  className={`${rootOver ? 'ring-1 ring-primary/50 bg-primary/5' : ''}`}
                  onClick={() => onSelect('')}
                  onDragOver={(e) => {
                    // Accept resources always; accept folders to move to root
                    const types = Array.from((e.dataTransfer?.types as any) || []);
                    const isFolderDragging = !!draggingFolderId || types.includes('application/x-folder-id');
                    const isResourceDragging = types.includes('application/x-resource-ids');
                    if (isFolderDragging || isResourceDragging) {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setRootOver(true);
                    }
                  }}
                  onDragLeave={() => setRootOver(false)}
                  onDrop={async (e) => {
                    setRootOver(false);
                    try {
                      // folder -> root
                      const fid = e.dataTransfer.getData('application/x-folder-id');
                      if (fid) {
                        try {
                          await onMoveFolder?.(fid, null);
                        } catch (err) {
                          const msg = String((err as any)?.message || err || '');
                          const isUnique = /UNIQUE|constraint/i.test(msg);
                          if (isUnique) {
                            toast.error('移动文件夹失败', { description: '目标文件夹内已存在同名文件夹' });
                          } else {
                            toast.error('移动文件夹失败');
                          }
                        }
                        return;
                      }
                    } catch {
                      /* ignore */
                    }
                    try {
                      const raw = e.dataTransfer.getData('application/x-resource-ids');
                      if (!raw) return;
                      const ids: string[] = JSON.parse(raw);
                      if (Array.isArray(ids) && ids.length && onDropResources) onDropResources(null, ids);
                    } catch {
                      /* ignore */
                    }
                  }}
                >
                  <TbHome /> 工作空间
                </SidebarMenuButton>
                <SidebarMenuBadge>{allCount ?? 0}</SidebarMenuBadge>
              </SidebarMenuItem>
            )}

            {tree.map((node) => (
              <FolderTreeRow
                key={node.id}
                node={node}
                depth={0}
                selectedId={selectedId}
                onSelect={(id) => onSelect(id)}
                onRename={onRename}
                onDelete={onDelete}
                onCreate={handleCreate}
                onDropResources={(fid, ids) => onDropResources?.(fid, ids)}
                onMoveFolder={(id, newPid) => onMoveFolder?.(id, newPid)}
                counts={counts}
                expanded={isExpanded(node.id)}
                isExpanded={isExpanded}
                onToggleExpand={toggleExpand}
                inlineEditId={inlineEditId}
                setInlineEditId={setInlineEditId}
                onInlineRename={onInlineRename}
                draggingFolderId={draggingFolderId}
                setDraggingFolderId={setDraggingFolderId}
                parentMap={parentMap}
              />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {tree.length === 0 && (
        <div className="h-full flex items-center justify-center text-xs text-muted-foreground whitespace-nowrap">
          暂无文件夹，点击 <TbPlus className="mx-2" /> 创建
        </div>
      )}
    </>
  );
};

export default FolderSidebar;
