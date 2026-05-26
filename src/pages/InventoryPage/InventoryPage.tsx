import { AppEvent } from '@packages/event/events';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { TbChevronLeft, TbHome, TbPackages } from 'react-icons/tb';
import { toast } from 'sonner';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import Dropzone from '@/components/common/Dropzone';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import EditRssSettingsDialog from '@/pages/ResourcePage/components/EditRssSettingsDialog';
import { UIFolder } from '@/pages/ResourcePage/components/FolderSidebar';
import RenameFolderDialog from '@/pages/ResourcePage/components/layout/RenameFolderDialog';
import { useFolderOperations } from '@/pages/ResourcePage/hooks/useFolderOperations';
import { useResourceData } from '@/pages/ResourcePage/hooks/useResourceData';
import { useResourceFilter } from '@/pages/ResourcePage/hooks/useResourceFilter';
import { useResourceOperations } from '@/pages/ResourcePage/hooks/useResourceOperations';
import { useResourceUpload } from '@/pages/ResourcePage/hooks/useResourceUpload';
import { ResourceItem } from '@/pages/ResourcePage/types';
import { getLinkedResourceSyncIssue, getLinkedResourceSyncIssueDescription } from '@/pages/ResourcePage/utils/linkedResourceSync';

import InventoryGrid from './components/InventoryGrid';

const TITLE_BAR_HEIGHT = 36;

const InventoryPage: React.FC = () => {
  const [wsFilter, setWsFilter] = useState<string | undefined>(undefined);
  const [folderFilter, setFolderFilter] = useState<string>('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [favoriteFilter, setFavoriteFilter] = useState(false);
  const [rssSettingsOpen, setRssSettingsOpen] = useState(false);
  const [rssSettingsItem, setRssSettingsItem] = useState<ResourceItem | null>(null);

  const { list, setList, folders, load, loadFolders, loadTags } = useResourceData(wsFilter, '');

  const { uploadProgress, onDropFiles } = useResourceUpload({
    folderFilter,
    wsFilter,
    folders,
    load,
    loadFolders
  });

  const { filtered } = useResourceFilter({
    list,
    wsFilter,
    tagFilter: '',
    folderFilter,
    favoriteFilter,
    searchQuery: '',
    sortField: 'collectedAt',
    sortOrder: 'desc'
  });

  const { handleDelete, handleDeleteMany, handleToggleFavorite, handleToggleVisibility } = useResourceOperations(list, setList, favoriteFilter, setFavoriteFilter, selectedItems, setSelectedItems);

  const { renameOpen, setRenameOpen, renameName, setRenameName, handleMoveFolder, handleOpenFolderLocation, handleRenameFolder, handleDeleteFolder, handleMoveResourcesToFolder, handleRenameConfirm } =
    useFolderOperations(folders, wsFilter, folderFilter, setFolderFilter, list, load, loadFolders);

  const loadDefaultWorkspace = useCallback(async () => {
    try {
      const workspaces = await window.YUA.workspace['workspace:list']({ filter: { deletedAt: 0 }, limit: 100, offset: 0 });
      if (!Array.isArray(workspaces)) return;
      const defaultId = workspaces.find((workspace) => workspace.isDefault === 1)?.id || workspaces[0]?.id;
      if (defaultId) {
        setWsFilter(defaultId);
      }
    } catch (error) {
      console.error('load inventory workspace failed', error);
    }
  }, []);

  useEffect(() => {
    loadDefaultWorkspace();
  }, [loadDefaultWorkspace]);

  useEffect(() => {
    if (!window.YUA?.events?.on) return;
    const unsubscribe = window.YUA.events.on((payload) => {
      switch (payload.type) {
        case AppEvent.RESOURCE_CREATED:
        case AppEvent.RESOURCE_UPDATED:
        case AppEvent.RESOURCE_DELETED:
        case AppEvent.RESOURCE_MOVED:
        case AppEvent.RESOURCE_BATCH_DELETED:
        case AppEvent.RESOURCE_BATCH_MOVED:
          void load();
          void loadTags(wsFilter);
          break;
        case AppEvent.FOLDER_CREATED:
        case AppEvent.FOLDER_UPDATED:
        case AppEvent.FOLDER_DELETED:
        case AppEvent.FOLDER_MOVED:
          void loadFolders(wsFilter);
          break;
        case AppEvent.LINKED_DIRECTORY_SYNCED:
          void load();
          void loadFolders(wsFilter);
          void loadTags(wsFilter);
          break;
        case AppEvent.WORKSPACE_CREATED:
        case AppEvent.WORKSPACE_UPDATED:
        case AppEvent.WORKSPACE_DELETED:
          void loadDefaultWorkspace();
          break;
      }
    });
    return unsubscribe;
  }, [load, loadDefaultWorkspace, loadFolders, loadTags, wsFilter]);

  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!wsFilter) return counts;
    for (const resource of list as any[]) {
      if (resource.workspaceId !== wsFilter) continue;
      const folderId = resource.folderId;
      if (folderId) counts[folderId] = (counts[folderId] || 0) + 1;
    }
    return counts;
  }, [list, wsFilter]);

  const childFolders = useMemo(() => {
    if (!wsFilter) return [] as UIFolder[];
    const parentId = (folderFilter || null) as string | null;
    return folders.filter((folder) => folder.workspaceId === wsFilter && (folder.parentId || null) === parentId);
  }, [folderFilter, folders, wsFilter]);

  const folderById = useMemo(() => {
    const map = new Map<string, UIFolder>();
    folders.forEach((folder) => map.set(folder.id, folder));
    return map;
  }, [folders]);

  const currentFolderPath = useMemo(() => {
    if (!folderFilter) return [] as UIFolder[];
    const parts: UIFolder[] = [];
    let current: UIFolder | null | undefined = folderById.get(folderFilter);
    const seen = new Set<string>();

    while (current) {
      if (seen.has(current.id)) break;
      seen.add(current.id);
      parts.push(current);
      current = current.parentId ? folderById.get(current.parentId) : null;
    }

    return parts.reverse();
  }, [folderById, folderFilter]);

  const totalCount = useMemo(() => {
    if (!wsFilter) return 0;
    return list.filter((resource) => resource.workspaceId === wsFilter).length;
  }, [list, wsFilter]);

  const visibleCount = childFolders.length + filtered.length;
  const hasContent = visibleCount > 0;
  const parentFolderId = currentFolderPath.length > 1 ? currentFolderPath[currentFolderPath.length - 2].id : '';

  const openFolder = useCallback((id: string) => {
    setSelectedItems(new Set());
    setFavoriteFilter(false);
    setFolderFilter(id);
  }, []);

  const openRoot = useCallback(() => {
    setSelectedItems(new Set());
    setFavoriteFilter(false);
    setFolderFilter('');
  }, []);

  const openParent = useCallback(() => {
    setSelectedItems(new Set());
    setFavoriteFilter(false);
    setFolderFilter(parentFolderId);
  }, [parentFolderId]);

  const refreshInventory = useCallback(async () => {
    await Promise.all([load(), loadFolders(wsFilter), loadTags(wsFilter)]);
  }, [load, loadFolders, loadTags, wsFilter]);

  const handleOpenRssSettings = useCallback((item: ResourceItem) => {
    setRssSettingsItem(item);
    setRssSettingsOpen(true);
  }, []);

  const handlePreview = useCallback(
    (item: ResourceItem) => {
      const syncIssue = getLinkedResourceSyncIssue(item);
      if (syncIssue) {
        toast.error('无法预览关联资源', {
          description: getLinkedResourceSyncIssueDescription(syncIssue)
        });
        return;
      }

      const index = filtered.findIndex((entry) => entry.id === item.id);
      window.YUA.window['window:open'](
        'resourcePreview',
        {
          current: item,
          list: filtered,
          index: index >= 0 ? index : 0
        },
        {
          sameDisplayAsSender: true
        }
      );
    },
    [filtered]
  );

  return (
    <div className="h-full bg-background text-foreground">
      <DragAbleTitle
        title={
          <div className="flex h-9 min-w-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="no-drag w-8 h-8" onClick={folderFilter ? openParent : openRoot}>
                  {folderFilter ? <TbChevronLeft /> : <TbHome />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{folderFilter ? '返回上级' : '全部'}</TooltipContent>
            </Tooltip>

            <button className="no-drag truncate rounded px-1 text-sm text-muted-foreground transition-colors hover:text-foreground" type="button" onClick={openRoot}>
              全部
            </button>

            {currentFolderPath.map((folder) => (
              <React.Fragment key={folder.id}>
                <span className="text-muted-foreground/60">/</span>
                <button className="no-drag truncate rounded px-1 text-sm font-medium transition-colors hover:text-primary" type="button" onClick={() => openFolder(folder.id)}>
                  {folder.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        }
      />

      <main className="relative overflow-hidden" style={{ height: `calc(100% - ${TITLE_BAR_HEIGHT}px)` }}>
        <Dropzone
          className="h-full overflow-y-auto"
          onDropFiles={onDropFiles}
          customDropzoneInside={<div className="rounded-lg border-2 border-dashed border-primary/60 bg-primary/5 px-5 py-3 text-sm font-medium text-primary">放入背包</div>}
        >
          {uploadProgress.visible ? (
            <div className="absolute left-1/2 top-4 z-40 flex w-80 -translate-x-1/2 flex-col gap-2 rounded-lg border bg-background/95 p-4 shadow-lg backdrop-blur">
              <div className="flex justify-between text-sm font-medium">
                <span>
                  正在放入背包 ({uploadProgress.current}/{uploadProgress.total})
                </span>
                <span>{Math.round(uploadProgress.percent)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-secondary">
                <div className="h-full bg-primary" style={{ width: `${uploadProgress.percent}%` }} />
              </div>
            </div>
          ) : null}

          {hasContent ? (
            <InventoryGrid
              items={filtered}
              folders={childFolders}
              counts={folderCounts}
              folderId={folderFilter || undefined}
              workspaceId={wsFilter}
              selectedItems={selectedItems}
              setSelectedItems={setSelectedItems}
              totalCount={totalCount}
              onOpenFolder={openFolder}
              onDropResourcesToFolder={(folderId, ids) => handleMoveResourcesToFolder(folderId, ids)}
              onMoveFolder={handleMoveFolder}
              onRenameFolder={handleRenameFolder}
              onDeleteFolder={handleDeleteFolder}
              onOpenFolderLocation={handleOpenFolderLocation}
              onFolderCreated={refreshInventory}
              onDelete={handleDelete}
              onDeleteMany={handleDeleteMany}
              onToggleFavorite={handleToggleFavorite}
              onToggleVisibility={handleToggleVisibility}
              onPreview={handlePreview}
              onOpenRssSettings={handleOpenRssSettings}
              onRefreshRss={() => void refreshInventory()}
              onOpenRssFeed={() => undefined}
            />
          ) : (
            <div className="flex min-h-full flex-col items-center justify-center text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <TbPackages />
              </div>
              <div className="text-base font-medium">背包是空的</div>
              <div className="mt-1 max-w-sm text-sm text-muted-foreground">把文件拖进来，或者从资源库继续收集道具。</div>
            </div>
          )}
        </Dropzone>
      </main>

      <RenameFolderDialog renameOpen={renameOpen} setRenameOpen={setRenameOpen} renameName={renameName} setRenameName={setRenameName} handleRenameConfirm={handleRenameConfirm} />
      <EditRssSettingsDialog open={rssSettingsOpen} onOpenChange={setRssSettingsOpen} item={rssSettingsItem} onSuccess={refreshInventory} />
    </div>
  );
};

export default InventoryPage;
