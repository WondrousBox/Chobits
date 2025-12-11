import React from 'react';
import { TbChevronDown, TbChevronRight, TbDots, TbFolder, TbFolderOpen, TbFolderPlus, TbPencil, TbTrash } from 'react-icons/tb';
import { toast } from 'sonner';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { SidebarMenuAction, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export type UIFolder = {
  id: string;
  name: string;
  parentId?: string | null;
  workspaceId?: string;
  children?: UIFolder[];
  rank?: number;
};

const FolderTreeRow = ({
  node,
  depth,
  selectedId,
  onSelect,
  onRename,
  onDelete,
  onCreate,
  onDropResources,
  onMoveFolder,
  counts,
  expanded,
  isExpanded,
  onToggleExpand,
  inlineEditId,
  setInlineEditId,
  onInlineRename,
  draggingFolderId,
  setDraggingFolderId,
  parentMap,
  index,
  siblings
}: {
  node: UIFolder;
  depth: number;
  selectedId?: string;
  onSelect: (id: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onCreate: (parentId?: string | null) => Promise<string | void>;
  onDropResources?: (folderId: string, ids: string[]) => void;
  onMoveFolder?: (id: string, newParentId: string | null, prevRank?: number, nextRank?: number) => Promise<void> | void;
  counts?: Record<string, number>;
  expanded: boolean;
  isExpanded: (id: string) => boolean;
  onToggleExpand: (id: string) => void;
  inlineEditId?: string | null;
  setInlineEditId?: (id: string | null) => void;
  onInlineRename?: (id: string, name: string) => Promise<void>;
  // drag & drop helpers
  draggingFolderId?: string | null;
  setDraggingFolderId?: (id: string | null) => void;
  parentMap?: Map<string, string | null>;
  index?: number;
  siblings?: UIFolder[];
}): React.ReactElement => {
  const isActive = selectedId === node.id;
  const [over, setOver] = React.useState(false);
  const [overInvalid, setOverInvalid] = React.useState(false);
  const [dropPos, setDropPos] = React.useState<'top' | 'middle' | 'bottom'>('middle');
  const [tipOpen, setTipOpen] = React.useState(false);
  const count = counts?.[node.id] ?? 0;
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

  const commonDnD = {
    onDragOver: (e: React.DragEvent) => {
      const types = Array.from((e.dataTransfer?.types as any) || []);
      const draggingFolder = draggingFolderId || (types.includes('application/x-folder-id') ? null : null);
      // When dragging a folder, validate target
      if (draggingFolder) {
        const invalid = draggingFolder === node.id || isAncestor(draggingFolder, node.id);
        setOverInvalid(invalid);
        if (!invalid) {
          e.preventDefault();
          e.stopPropagation();
          setOver(true);
          e.dataTransfer.dropEffect = 'move';

          // Calculate position
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const y = e.clientY - rect.top;
          const h = rect.height;
          if (y < h * 0.25) setDropPos('top');
          else if (y > h * 0.75) setDropPos('bottom');
          else setDropPos('middle');
        } else {
          // disallow drop
          setOver(false);
          e.dataTransfer.dropEffect = 'none';
          setTipOpen(true);
        }
        return;
      }
      // dragging resources by default allowed
      e.preventDefault();
      e.stopPropagation();
      setOver(true);
      setOverInvalid(false);
      setDropPos('middle');
      e.dataTransfer.dropEffect = 'move';
    },
    onDragLeave: () => {
      setOver(false);
      setOverInvalid(false);
      setTipOpen(false);
      setDropPos('middle');
    },
    onDrop: async (e: React.DragEvent) => {
      e.stopPropagation();
      setOver(false);
      setOverInvalid(false);
      setTipOpen(false);
      const currentDropPos = dropPos;
      setDropPos('middle');

      try {
        // 1) folder -> folder move
        const fid = e.dataTransfer.getData('application/x-folder-id');
        if (fid) {
          if (fid !== node.id && !isAncestor(fid, node.id)) {
            let targetParentId: string | null = node.id;
            let prevRank: number | undefined;
            let nextRank: number | undefined;

            if (currentDropPos === 'middle') {
              targetParentId = node.id;
            } else {
              targetParentId = node.parentId ?? null;
              if (Array.isArray(siblings) && typeof index === 'number') {
                if (currentDropPos === 'top') {
                  const prevNode = siblings[index - 1];
                  prevRank = prevNode?.rank;
                  nextRank = node.rank;
                } else {
                  const nextNode = siblings[index + 1];
                  prevRank = node.rank;
                  nextRank = nextNode?.rank;
                }
              }
            }

            try {
              if (onMoveFolder) await onMoveFolder(fid, targetParentId, prevRank, nextRank);
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
            // invalid drop feedback
            setTipOpen(true);
            setTimeout(() => setTipOpen(false), 1200);
          }
          return;
        }
      } catch {
        /* ignore folder move */
      }
      try {
        // 2) resources -> folder
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
    <SidebarMenuButton
      isActive={isActive}
      className={`${over ? (overInvalid ? 'ring-1 ring-destructive/60 bg-destructive/10' : dropPos === 'middle' ? 'ring-1 ring-primary/50 bg-primary/5' : '') : ''}`}
      onClick={() => {
        if (isEditing) return;
        onSelect(node.id);
        if (hasChildren) onToggleExpand(node.id);
      }}
      style={{ paddingLeft: 8 + depth * 12 }}
      draggable={!isEditing}
      onDragStart={(e) => {
        // begin dragging current folder
        try {
          e.dataTransfer.setData('application/x-folder-id', node.id);
          e.dataTransfer.effectAllowed = 'move';
        } catch {
          /* noop */
        }
        setDraggingFolderId?.(node.id);
      }}
      onDragEnd={() => setDraggingFolderId?.(null)}
      {...commonDnD}
    >
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
      <SidebarMenuItem className="pl-0 list-none group relative">
        {over && !overInvalid && dropPos === 'top' && <div className="absolute top-0 right-0 h-0.5 bg-primary z-50 pointer-events-none" style={{ left: 8 + depth * 12 }} />}
        {over && !overInvalid && dropPos === 'bottom' && <div className="absolute bottom-0 right-0 h-0.5 bg-primary z-50 pointer-events-none" style={{ left: 8 + depth * 12 }} />}
        <Tooltip open={overInvalid || tipOpen}>
          <TooltipTrigger asChild>{MenuButton}</TooltipTrigger>
          <TooltipContent side="right">不能移动到自己的子文件夹中</TooltipContent>
        </Tooltip>
        {count > 0 && <SidebarMenuBadge className="group-hover:opacity-0 opacity-100">{count}</SidebarMenuBadge>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild className="group-hover:opacity-100 opacity-0">
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
        (node.children || []).map((child, idx) => (
          <FolderTreeRow
            key={child.id}
            node={child}
            index={idx}
            siblings={node.children}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
            onRename={onRename}
            onDelete={onDelete}
            onCreate={onCreate}
            onDropResources={onDropResources}
            onMoveFolder={onMoveFolder}
            counts={counts}
            expanded={isExpanded(child.id)}
            isExpanded={isExpanded}
            onToggleExpand={onToggleExpand}
            inlineEditId={inlineEditId}
            setInlineEditId={setInlineEditId}
            onInlineRename={onInlineRename}
            draggingFolderId={draggingFolderId}
            setDraggingFolderId={setDraggingFolderId}
            parentMap={parentMap}
          />
        ))}
    </>
  );
};

export default FolderTreeRow;
