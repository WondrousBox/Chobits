import React from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { TbFolder, TbFolderOpen, TbPencil, TbTrash, TbPlus, TbDots, TbChevronRight, TbChevronDown, TbFolderPlus } from 'react-icons/tb';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar';
import { Input } from '@/components/ui/input';

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

const TreeRow: React.FC<{
  node: UIFolder;
  depth: number;
  selectedId?: string;
  onSelect: (id: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: (parentId?: string | null) => Promise<string | void>;
  onDropResources?: (folderId: string, ids: string[]) => void;
  counts?: Record<string, number>;
  expanded: boolean;
  isExpanded: (id: string) => boolean;
  onToggleExpand: (id: string) => void;
  inlineEditId?: string | null;
  setInlineEditId?: (id: string | null) => void;
  onInlineRename?: (id: string, name: string) => Promise<void>;
}> = ({ node, depth, selectedId, onSelect, onRename, onDelete, onCreate, onDropResources, counts, expanded, isExpanded, onToggleExpand, inlineEditId, setInlineEditId, onInlineRename }) => {
  const isActive = selectedId === node.id;
  const [over, setOver] = React.useState(false);
  // const count = counts?.[node.id] ?? 0;
  const hasChildren = (node.children || []).length > 0;
  const folderIconEl = hasChildren && expanded ? <TbFolderOpen /> : <TbFolder />;
  const isEditing = inlineEditId === node.id;
  const [nameDraft, setNameDraft] = React.useState(node.name);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const isMac = (window as any).YUA?.isMac;
  const shortcutCreate = isMac ? '⌘⇧N' : 'Ctrl+Shift+N';
  const shortcutRename = 'F2';
  const shortcutDelete = 'Delete';

  React.useEffect(() => {
    setNameDraft(node.name);
  }, [node.name]);

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      // focus and select all
      inputRef.current.focus();
      try {
        inputRef.current.select();
      } catch {
        /* ignore select error */
      }
    }
  }, [isEditing]);

  const commitRename = async (): Promise<void> => {
    if (!isEditing) return;
    const newName = nameDraft.trim();
    const oldName = node.name;
    setInlineEditId?.(null);
    if (!newName || newName === oldName) return;
    try {
      if (onInlineRename) {
        await onInlineRename(node.id, newName);
      } else {
        // fallback: call API directly
        await (window as any).YUA?.folder['folder.rename']({ id: node.id, name: newName });
      }
    } catch (e) {
      console.warn('inline rename failed', e);
    }
  };

  const commonDnD = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setOver(true);
      e.dataTransfer.dropEffect = 'move';
    },
    onDragLeave: () => setOver(false),
    onDrop: (e: React.DragEvent) => {
      setOver(false);
      try {
        const raw = e.dataTransfer.getData('application/x-resource-ids');
        if (!raw) return;
        const ids: string[] = JSON.parse(raw);
        if (Array.isArray(ids) && ids.length && onDropResources) onDropResources(node.id, ids);
      } catch {
        /* ignore */
      }
    }
  } as const;

  const MenuButton = (
    <SidebarMenuButton isActive={isActive} className={`${over ? 'ring-1 ring-primary/50 bg-primary/5' : ''}`} onClick={() => onSelect(node.id)} style={{ paddingLeft: 8 + depth * 12 }} {...commonDnD}>
      {hasChildren ? (
        <span
          className="shrink-0 w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand(node.id);
          }}
        >
          {expanded ? <TbChevronDown /> : <TbChevronRight />}
        </span>
      ) : (
        <span className="shrink-0 w-4 h-4" />
      )}
      {folderIconEl}
      {isEditing ? (
        <Input
          ref={inputRef}
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            else if (e.key === 'Escape') setInlineEditId?.(null);
          }}
          onBlur={() => commitRename()}
          autoFocus
          className="outline-none border-0 pl-0 h-7"
        />
      ) : (
        <span className="truncate">{node.name}</span>
      )}
    </SidebarMenuButton>
  );

  return (
    <>
      <SidebarMenuItem className="pl-0 list-none">
        {MenuButton}
        {/* {count > 0 && <SidebarMenuBadge>{count}</SidebarMenuBadge>} */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuAction onClick={(e) => e.stopPropagation()}>
              <TbDots />
            </SidebarMenuAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4} onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem
              onClick={async (e) => {
                e.stopPropagation();
                // 在当前文件夹下新建子文件夹
                try {
                  const newId = await onCreate(node.id);
                  if (newId) {
                    setInlineEditId?.(newId);
                    // 展开当前节点以确保可见
                    if (!expanded) onToggleExpand(node.id);
                    onSelect(newId);
                  }
                } catch {
                  /* ignore */
                }
              }}
            >
              <TbFolderPlus /> 新建文件夹
              <span className="ml-auto text-xs text-muted-foreground">{shortcutCreate}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const ws = await (window as any).YUA?.workspace['workspace:getDefault']();
                  const isWin = (window as any).YUA?.isWindows;
                  const sep = isWin ? '\\' : '/';
                  const base: string = ws?.rootPath || '';
                  if (!base) return;
                  const needsSep = base.endsWith(sep) ? '' : sep;
                  const folderPath = `${base}${needsSep}resources${sep}folders${sep}${node.id}`;
                  await (window as any).YUA?.file['file:openPath'](folderPath);
                } catch (err) {
                  console.warn('open folder path failed', err);
                }
              }}
            >
              <TbFolderOpen /> 打开所在位置
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                // 切换为内联重命名：选中并进入编辑态
                setInlineEditId?.(node.id);
                onSelect(node.id);
              }}
            >
              <TbPencil /> 重命名
              <span className="ml-auto text-xs text-muted-foreground">{shortcutRename}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(node.id);
              }}
            >
              <TbTrash /> 删除
              <span className="ml-auto text-xs text-muted-foreground">{shortcutDelete}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>

      {expanded &&
        (node.children || []).map((child) => (
          <TreeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
            onRename={onRename}
            onDelete={onDelete}
            onCreate={onCreate}
            onDropResources={onDropResources}
            counts={counts}
            expanded={isExpanded(child.id)}
            isExpanded={isExpanded}
            onToggleExpand={onToggleExpand}
            inlineEditId={inlineEditId}
            setInlineEditId={setInlineEditId}
            onInlineRename={onInlineRename}
          />
        ))}
    </>
  );
};

const FolderSidebar: React.FC<{
  folders: UIFolder[];
  selectedId?: string;
  onSelect: (id: string | '') => void;
  onCreate: (parentId?: string | null) => Promise<string | void>;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onDropResources?: (folderId: string | null, ids: string[]) => void;
  counts?: Record<string, number>;
  allCount?: number;
  onInlineRename?: (id: string, name: string) => Promise<void>;
}> = ({ folders, selectedId, onSelect, onCreate, onRename, onDelete, onDropResources, counts, allCount, onInlineRename }) => {
  const tree = React.useMemo(() => buildTree(folders), [folders]);

  // 管理展开/收起的节点集合，默认首次加载时展开所有有子节点的项
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
  const initializedRef = React.useRef(false);

  React.useEffect(() => {
    if (initializedRef.current) return;
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
  }, [tree]);

  // 构建父子映射，便于根据选中项展开祖先链路
  const parentMap = React.useMemo(() => {
    const map = new Map<string, string | null>();
    for (const f of folders) {
      map.set(f.id, f.parentId ?? null);
    }
    return map;
  }, [folders]);

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

  const toggleExpand = React.useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isExpanded = React.useCallback((id: string) => expandedIds.has(id), [expandedIds]);
  const [inlineEditId, setInlineEditId] = React.useState<string | null>(null);
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
    <Sidebar collapsible="none" className="h-full w-80 bg-sidebar">
      <SidebarContent>
        <SidebarGroup className="box-border">
          <SidebarGroupLabel>文件夹</SidebarGroupLabel>
          <SidebarGroupAction asChild>
            <Button size="icon" variant={'ghost'} className="w-8 h-8" onClick={() => handleCreate()}>
              <TbPlus />
            </Button>
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu className="pl-0">
              {tree.length > 0 && (
                <SidebarMenuItem className="pl-0 list-none">
                  <SidebarMenuButton
                    isActive={!selectedId}
                    onClick={() => onSelect('')}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => {
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
                    全部
                  </SidebarMenuButton>
                  <SidebarMenuBadge>{allCount ?? 0}</SidebarMenuBadge>
                </SidebarMenuItem>
              )}

              {tree.map((node) => (
                <TreeRow
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedId={selectedId}
                  onSelect={(id) => onSelect(id)}
                  onRename={onRename}
                  onDelete={onDelete}
                  onCreate={handleCreate}
                  onDropResources={(fid, ids) => onDropResources?.(fid, ids)}
                  counts={counts}
                  expanded={isExpanded(node.id)}
                  isExpanded={isExpanded}
                  onToggleExpand={toggleExpand}
                  inlineEditId={inlineEditId}
                  setInlineEditId={setInlineEditId}
                  onInlineRename={onInlineRename}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {tree.length === 0 && (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground border-t border-sidebar-border">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <TbFolder />
                </EmptyMedia>
                <EmptyDescription>暂无文件夹</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant={'outline'} size={'sm'} onClick={() => handleCreate()}>
                  <TbPlus />
                  创建
                </Button>
              </EmptyContent>
            </Empty>
          </div>
        )}
      </SidebarContent>
    </Sidebar>
  );
};

export default FolderSidebar;
