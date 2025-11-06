import React from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { TbFolder, TbFolderOpen, TbPencil, TbTrash, TbPlus, TbDots, TbChevronRight, TbChevronDown } from 'react-icons/tb';
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
  SidebarMenuItem,
  SidebarProvider
} from '@/components/ui/sidebar';

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
  onDropResources?: (folderId: string, ids: string[]) => void;
  counts?: Record<string, number>;
  expanded: boolean;
  isExpanded: (id: string) => boolean;
  onToggleExpand: (id: string) => void;
}> = ({ node, depth, selectedId, onSelect, onRename, onDelete, onDropResources, counts, expanded, isExpanded, onToggleExpand }) => {
  const isActive = selectedId === node.id;
  const [over, setOver] = React.useState(false);
  const count = counts?.[node.id] ?? 0;
  const hasChildren = (node.children || []).length > 0;
  const folderIconEl = hasChildren && expanded ? <TbFolderOpen /> : <TbFolder />;

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
      <span className="truncate">{node.name}</span>
    </SidebarMenuButton>
  );

  return (
    <>
      <SidebarMenuItem className="pl-0 list-none">
        {MenuButton}
        {count > 0 && <SidebarMenuBadge>{count}</SidebarMenuBadge>}
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
              <TbFolderOpen /> 打开文件夹
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onRename(node.id);
              }}
            >
              <TbPencil /> 重命名
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
            onDropResources={onDropResources}
            counts={counts}
            expanded={isExpanded(child.id)}
            isExpanded={isExpanded}
            onToggleExpand={onToggleExpand}
          />
        ))}
    </>
  );
};

const FolderSidebar: React.FC<{
  folders: UIFolder[];
  selectedId?: string;
  onSelect: (id: string | '') => void;
  onCreate: () => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onDropResources?: (folderId: string | null, ids: string[]) => void;
  counts?: Record<string, number>;
  allCount?: number;
}> = ({ folders, selectedId, onSelect, onCreate, onRename, onDelete, onDropResources, counts, allCount }) => {
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

  const toggleExpand = React.useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const isExpanded = React.useCallback((id: string) => expandedIds.has(id), [expandedIds]);
  return (
    <Sidebar collapsible="none" className="h-full w-80 bg-sidebar">
      <SidebarContent>
        <SidebarGroup className="box-border">
          <SidebarGroupLabel>文件夹</SidebarGroupLabel>
          <SidebarGroupAction asChild>
            <Button size="icon" className="w-8 h-8" onClick={onCreate}>
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
                  onDropResources={(fid, ids) => onDropResources?.(fid, ids)}
                  counts={counts}
                  expanded={isExpanded(node.id)}
                  isExpanded={isExpanded}
                  onToggleExpand={toggleExpand}
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
                <Button variant={'outline'} size={'sm'} onClick={onCreate}>
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
