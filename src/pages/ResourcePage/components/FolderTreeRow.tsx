import React from 'react';
import { TbChevronDown, TbChevronRight, TbDots, TbEyeOff, TbFolder, TbFolderOpen, TbFolderPlus, TbPencil, TbRefresh, TbTrash } from 'react-icons/tb';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { SidebarMenuAction, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import {
  getIgnoreLinkedMissingDirectoryErrorMessage,
  getIgnoreLinkedMissingDirectorySuccessMessage,
  getLinkedFolderIssueBadge,
  getLinkedFolderState,
  getLinkedFolderStateDescription,
  getLinkedRootIssueBadge,
  getLinkedRootState,
  getLinkedRootStateDescription,
  getReconnectLinkedMissingDirectoryErrorMessage,
  getReconnectLinkedMissingDirectorySuccessMessage,
  getRecreateLinkedMissingDirectoryErrorMessage,
  getRecreateLinkedMissingDirectorySuccessMessage,
  ignoreLinkedMissingDirectory,
  isLinkedFolderMissing,
  reconnectLinkedMissingDirectory,
  recreateLinkedMissingDirectory
} from '../utils/linkedFolderState';

export type UIFolder = {
  id: string;
  name: string;
  parentId?: string | null;
  workspaceId?: string;
  originType?: 'workspace' | 'linked';
  linkedMountId?: string | null;
  relativePath?: string | null;
  metadata?: string | null;
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
  siblings,
  onRescanLinkedFolder,
  onUnlinkLinkedFolder
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
  draggingFolderId?: string | null;
  setDraggingFolderId?: (id: string | null) => void;
  parentMap?: Map<string, string | null>;
  index?: number;
  siblings?: UIFolder[];
  onRescanLinkedFolder?: (folderId: string) => Promise<void>;
  onUnlinkLinkedFolder?: (folderId: string) => Promise<void>;
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
  const shortcutCreate = isMac ? 'Cmd+Shift+N' : 'Ctrl+Shift+N';
  const shortcutRename = 'F2';
  const shortcutDelete = 'Delete';
  const isLinkedFolder = node.originType === 'linked';
  const isLinkedRoot = isLinkedFolder && (node.relativePath || '') === '';
  const linkedRootState = getLinkedRootState(node);
  const linkedRootIssueBadge = getLinkedRootIssueBadge(linkedRootState);
  const linkedRootIssueDescription = getLinkedRootStateDescription(linkedRootState);
  const linkedFolderState = getLinkedFolderState(node);
  const linkedFolderIssueBadge = getLinkedFolderIssueBadge(linkedFolderState);
  const linkedFolderIssueDescription = getLinkedFolderStateDescription(linkedFolderState);
  const canRecreateLinkedFolder = isLinkedFolderMissing(linkedFolderState);
  void onRename;

  React.useEffect(() => {
    setNameDraft(node.name);
  }, [node.name]);

  React.useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      try {
        inputRef.current.select();
      } catch {
        /* ignore */
      }
    }
  }, [isEditing]);

  const commitRename = async (): Promise<void> => {
    if (!isEditing) return;
    if (isLinkedRoot) {
      setInlineEditId?.(null);
      toast.error('关联根目录不能重命名');
      return;
    }
    const newName = nameDraft.trim();
    const oldName = node.name;
    setInlineEditId?.(null);
    if (!newName || newName === oldName) return;
    try {
      if (onInlineRename) {
        await onInlineRename(node.id, newName);
      } else {
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

  const handleOpenLocation = React.useCallback(async () => {
    try {
      const folderApi: any = (window as any).YUA?.folder;
      if (!folderApi?.['folder.getResolvedPath']) return;
      const resolved = await folderApi['folder.getResolvedPath']({ id: node.id });
      const folderPath: string | undefined = resolved?.success ? resolved.path : undefined;
      if (!folderPath) return;
      const result = await (window as any).YUA?.file['file:openPath'](folderPath);
      if (!result?.ok) {
        toast.error('打开目录失败', { description: result?.error || 'unknown' });
      }
    } catch (err) {
      console.warn('open folder path failed', err);
    }
  }, [node.id]);

  const handleRecreateLinkedMissingDirectory = React.useCallback(async () => {
    try {
      const result = await recreateLinkedMissingDirectory(node.id);
      if (!result?.success) {
        toast.error('重建目录失败', { description: getRecreateLinkedMissingDirectoryErrorMessage(result?.error) });
        return;
      }

      toast.success('已在原位置重建目录', { description: getRecreateLinkedMissingDirectorySuccessMessage(result) });
    } catch (error: any) {
      toast.error('重建目录失败', { description: error?.message || String(error) });
    }
  }, [node.id]);

  const handleReconnectLinkedMissingDirectory = React.useCallback(async () => {
    try {
      const result = await reconnectLinkedMissingDirectory(node.id);
      if (result?.canceled) return;
      if (!result?.success) {
        toast.error('重连目录失败', { description: getReconnectLinkedMissingDirectoryErrorMessage(result?.error) });
        return;
      }

      toast.success('已重连缺失目录', { description: getReconnectLinkedMissingDirectorySuccessMessage(result) });
    } catch (error: any) {
      toast.error('重连目录失败', { description: error?.message || String(error) });
    }
  }, [node.id]);

  const handleIgnoreLinkedMissingDirectory = React.useCallback(async () => {
    try {
      const result = await ignoreLinkedMissingDirectory(node.id);
      if (!result?.success) {
        toast.error('忽略目录失败', { description: getIgnoreLinkedMissingDirectoryErrorMessage(result?.error) });
        return;
      }

      toast.success('已忽略缺失目录', { description: getIgnoreLinkedMissingDirectorySuccessMessage(result) });
      if (selectedId === node.id) {
        onSelect(node.parentId || '');
      }
    } catch (error: any) {
      toast.error('忽略目录失败', { description: error?.message || String(error) });
    }
  }, [node.id, node.parentId, onSelect, selectedId]);

  const commonDnD = {
    onDragOver: (e: React.DragEvent) => {
      const types = Array.from((e.dataTransfer?.types as any) || []);
      const draggingFolder = draggingFolderId || (types.includes('application/x-folder-id') ? null : null);
      if (draggingFolder) {
        const invalid = draggingFolder === node.id || isAncestor(draggingFolder, node.id);
        setOverInvalid(invalid);
        if (!invalid) {
          e.preventDefault();
          e.stopPropagation();
          setOver(true);
          e.dataTransfer.dropEffect = 'move';

          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const y = e.clientY - rect.top;
          const h = rect.height;
          if (y < h * 0.25) setDropPos('top');
          else if (y > h * 0.75) setDropPos('bottom');
          else setDropPos('middle');
        } else {
          setOver(false);
          e.dataTransfer.dropEffect = 'none';
          setTipOpen(true);
        }
        return;
      }

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
        const fid = e.dataTransfer.getData('application/x-folder-id');
        if (fid) {
          if (fid !== node.id && !isAncestor(fid, node.id)) {
            let targetParentId: string | null = node.id;
            let prevRank: number | undefined;
            let nextRank: number | undefined;

            if (currentDropPos !== 'middle') {
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
                toast.error('Folder move failed', { description: 'A folder with the same name already exists in the target location.' });
              } else if (msg === 'linked-root-readonly') {
                toast.error('Linked root folders cannot be moved');
              } else if (msg === 'cross-origin-folder-move-not-supported') {
                toast.error('Cannot move folders between linked and workspace storage');
              } else if (msg === 'cross-linked-mount-folder-move-not-supported') {
                toast.error('Cannot move folders across linked mounts');
              } else {
                toast.error('Folder move failed');
              }
            }
          } else {
            setTipOpen(true);
            setTimeout(() => setTipOpen(false), 1200);
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
        if (Array.isArray(ids) && ids.length && onDropResources) onDropResources(node.id, ids);
      } catch {
        /* ignore */
      }
    }
  } as const;

  const menuButton = (
    <SidebarMenuButton
      isActive={isActive}
      className={`${over ? (overInvalid ? 'ring-1 ring-destructive/60 bg-destructive/10' : dropPos === 'middle' ? 'ring-1 ring-primary/50 bg-primary/5' : '') : ''}`}
      onClick={() => {
        if (isEditing) return;
        onSelect(node.id);
        if (hasChildren && !expanded) onToggleExpand(node.id);
      }}
      style={{ paddingLeft: 8 + depth * 12 }}
      draggable={!isEditing && !isLinkedRoot}
      onDragStart={(e) => {
        if (isLinkedRoot) return;
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
        <span className="truncate flex items-center gap-2 min-w-0">
          <span className="truncate">{node.name}</span>
          {isLinkedRoot ? (
            <Badge variant="outline" className="h-4 px-1.5 py-0 text-[10px] shrink-0 text-amber-700 border-amber-300/60">
              Linked
            </Badge>
          ) : null}
          {isLinkedRoot && linkedRootIssueBadge ? (
            <Badge variant="outline" className={`h-4 px-1.5 py-0 text-[10px] shrink-0 ${linkedRootIssueBadge.className}`} title={linkedRootIssueDescription}>
              {linkedRootIssueBadge.label}
            </Badge>
          ) : null}
          {!isLinkedRoot && linkedFolderIssueBadge ? (
            <Badge variant="outline" className={`h-4 px-1.5 py-0 text-[10px] shrink-0 ${linkedFolderIssueBadge.className}`} title={linkedFolderIssueDescription}>
              {linkedFolderIssueBadge.label}
            </Badge>
          ) : null}
        </span>
      )}
    </SidebarMenuButton>
  );

  return (
    <>
      <SidebarMenuItem className="pl-0 list-none group relative">
        {over && !overInvalid && dropPos === 'top' && <div className="absolute top-0 right-0 h-0.5 bg-primary z-50 pointer-events-none" style={{ left: 8 + depth * 12 }} />}
        {over && !overInvalid && dropPos === 'bottom' && <div className="absolute bottom-0 right-0 h-0.5 bg-primary z-50 pointer-events-none" style={{ left: 8 + depth * 12 }} />}
        <Tooltip open={overInvalid || tipOpen}>
          <TooltipTrigger asChild>{menuButton}</TooltipTrigger>
          <TooltipContent side="right">Cannot move a folder into itself or its descendants.</TooltipContent>
        </Tooltip>
        {count > 0 && <SidebarMenuBadge className="group-hover:opacity-0 opacity-100">{count}</SidebarMenuBadge>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild className="group-hover:opacity-100 opacity-0">
            <SidebarMenuAction onClick={(e) => e.stopPropagation()}>
              <TbDots />
            </SidebarMenuAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={4} onClick={(e) => e.stopPropagation()}>
            {isLinkedRoot && linkedRootIssueDescription ? (
              <>
                <DropdownMenuItem disabled className="h-auto whitespace-normal py-2 text-xs leading-relaxed opacity-100">
                  {linkedRootIssueDescription}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            {!isLinkedRoot && linkedFolderIssueDescription ? (
              <>
                <DropdownMenuItem disabled className="h-auto whitespace-normal py-2 text-xs leading-relaxed opacity-100">
                  {linkedFolderIssueDescription}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            {canRecreateLinkedFolder ? (
              <>
                <DropdownMenuItem
                  onClick={async (e) => {
                    e.stopPropagation();
                    await handleReconnectLinkedMissingDirectory();
                  }}
                >
                  <TbFolderOpen className="mr-2" /> 选择新路径重连
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async (e) => {
                    e.stopPropagation();
                    await handleRecreateLinkedMissingDirectory();
                  }}
                >
                  <TbFolderPlus className="mr-2" /> 在原位置重建目录
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async (e) => {
                    e.stopPropagation();
                    await handleIgnoreLinkedMissingDirectory();
                  }}
                >
                  <TbEyeOff className="mr-2" /> 忽略缺失目录
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  const newId = await onCreate(node.id);
                  if (newId) {
                    setInlineEditId?.(newId);
                    if (!expanded) onToggleExpand(node.id);
                    onSelect(newId);
                  }
                } catch {
                  /* ignore */
                }
              }}
            >
              <TbFolderPlus className="mr-2" /> New folder
              <span className="ml-auto text-xs text-muted-foreground">{shortcutCreate}</span>
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={async (e) => {
                e.stopPropagation();
                await handleOpenLocation();
              }}
            >
              <TbFolderOpen className="mr-2" /> Open location
            </DropdownMenuItem>

            {isLinkedRoot ? (
              <>
                <DropdownMenuItem
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!onRescanLinkedFolder) return;
                    await onRescanLinkedFolder(node.id);
                  }}
                >
                  <TbRefresh className="mr-2" /> Rescan
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!onUnlinkLinkedFolder) return;
                    await onUnlinkLinkedFolder(node.id);
                  }}
                >
                  <TbTrash className="mr-2" /> Unlink
                </DropdownMenuItem>
              </>
            ) : (
              <>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    setInlineEditId?.(node.id);
                    onSelect(node.id);
                  }}
                >
                  <TbPencil className="mr-2" /> Rename
                  <span className="ml-auto text-xs text-muted-foreground">{shortcutRename}</span>
                </DropdownMenuItem>
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(node.id);
                    }}
                  >
                    <TbTrash className="mr-2" /> Delete
                    <span className="ml-auto text-xs text-muted-foreground">{shortcutDelete}</span>
                  </DropdownMenuItem>
                </>
              </>
            )}
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
            onRescanLinkedFolder={onRescanLinkedFolder}
            onUnlinkLinkedFolder={onUnlinkLinkedFolder}
          />
        ))}
    </>
  );
};

export default FolderTreeRow;
