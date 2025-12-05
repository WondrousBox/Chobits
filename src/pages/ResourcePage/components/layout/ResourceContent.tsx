import React, { useMemo } from 'react';

import Dropzone from '@/components/common/Dropzone';

import { ViewMode } from '../../types';
import { mergeVideoWithSubtitles } from '../../utils/subtitleUtils';
import DefaultEmptyFolder from '../DefaultEmptyFolder';
import ExplorerFreeLayout from '../ExplorerFreeLayout';
import ExplorerGrid from '../ExplorerGrid';
import ExplorerList from '../ExplorerList';
import { UIFolder } from '../FolderSidebar';
import ResourceFooter from './ResourceFooter';

interface ResourceContentProps {
  uploadProgress: any;
  onDropFiles: any;
  importProgress: any;
  workflowProgress: {
    visible: boolean;
    progress: number;
    message: string;
    workflowName?: string;
  };
  childFolders: UIFolder[];
  filtered: any[];
  viewMode: ViewMode;
  folderCounts: Record<string, number>;
  folderParentMap: Map<string, string | null>;
  selectedItems: Set<string>;
  folderFilter: string;
  wsFilter: string | undefined;
  setFolderFilter: (id: string) => void;
  saveCurrentFolder: (id: string) => void;
  setFavoriteFilter: (fav: boolean) => void;
  setTypeFilter: (types: string[]) => void;
  handleMoveResourcesToFolder: any;
  handleMoveFolder: any;
  handleRenameFolder: any;
  handleDeleteFolder: any;
  handleOpenFolderLocation: any;
  handleDelete: any;
  handleDeleteMany: any;
  handleToggleFavorite: any;
  handleToggleVisibility: any;
  handleItemClick: any;
  load: any;
  loadFolders: any;
  currentFolderPath: UIFolder[];
  setSelectedItems: (items: Set<string>) => void;
  list: any[];
  isCollapseMode: boolean;
}

const ResourceContent: React.FC<ResourceContentProps> = ({
  uploadProgress,
  onDropFiles,
  importProgress,
  workflowProgress,
  childFolders,
  filtered,
  viewMode,
  folderCounts,
  folderParentMap,
  selectedItems,
  folderFilter,
  wsFilter,
  setFolderFilter,
  saveCurrentFolder,
  setFavoriteFilter,
  setTypeFilter,
  handleMoveResourcesToFolder,
  handleMoveFolder,
  handleRenameFolder,
  handleDeleteFolder,
  handleOpenFolderLocation,
  handleDelete,
  handleDeleteMany,
  handleToggleFavorite,
  handleToggleVisibility,
  handleItemClick,
  load,
  loadFolders,
  currentFolderPath,
  setSelectedItems,
  list,
  isCollapseMode
}) => {
  // 合并视频和字幕文件
  const mergedItems = useMemo(() => {
    if (isCollapseMode) {
      return mergeVideoWithSubtitles(filtered);
    }
    return filtered;
  }, [filtered, isCollapseMode]);

  return (
    <div className="w-full h-full" style={{ height: 'calc(100% - 36px)' }}>
      <Dropzone
        className="w-full h-full overflow-y-auto relative"
        onDropFiles={onDropFiles}
        customDropzoneInside={<div className="px-5 py-3 rounded-lg border-2 border-dashed border-primary/60 bg-primary/5 text-primary text-sm font-medium">释放鼠标即可添加文件…</div>}
      >
        {(uploadProgress.visible || importProgress.visible || workflowProgress.visible) && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-40 bg-background/95 backdrop-blur border shadow-lg rounded-lg p-4 w-80 flex flex-col gap-2">
            <div className="flex justify-between text-sm font-medium">
              <span>
                {workflowProgress.visible
                  ? `${workflowProgress.workflowName || '工作流'}: ${workflowProgress.message}`
                  : importProgress.visible
                    ? importProgress.message
                    : `正在上传 (${uploadProgress.current}/${uploadProgress.total})`}
              </span>
              <span>{Math.round(workflowProgress.visible ? workflowProgress.progress : importProgress.visible ? importProgress.percent : uploadProgress.percent)}%</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary"
                style={{
                  width: `${workflowProgress.visible ? workflowProgress.progress : importProgress.visible ? importProgress.percent : uploadProgress.percent}%`
                }}
              />
            </div>
          </div>
        )}

        {childFolders.length === 0 && mergedItems.length === 0 ? null : viewMode === 'grid' ? (
          <ExplorerGrid
            items={mergedItems}
            folders={childFolders}
            counts={folderCounts}
            folderId={folderFilter || undefined}
            workspaceId={wsFilter}
            onOpenFolder={(id) => {
              setFolderFilter(id);
              saveCurrentFolder(id);
              setFavoriteFilter(false);
              setTypeFilter([]);
            }}
            onDropResourcesToFolder={(fid, ids) => handleMoveResourcesToFolder(fid, ids)}
            onMoveFolder={handleMoveFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            onOpenFolderLocation={handleOpenFolderLocation}
            onFolderCreated={async () => {
              await load();
              await loadFolders(wsFilter || undefined);
            }}
            onDelete={handleDelete}
            onDeleteMany={handleDeleteMany}
            onToggleFavorite={handleToggleFavorite}
            onToggleVisibility={handleToggleVisibility}
          />
        ) : viewMode === 'list' ? (
          <ExplorerList
            items={mergedItems}
            folders={childFolders}
            counts={folderCounts}
            folderParentMap={folderParentMap}
            selectedItems={selectedItems}
            onItemClick={handleItemClick}
            onToggleFavorite={handleToggleFavorite}
            onToggleVisibility={handleToggleVisibility}
            onOpenFolder={(id) => {
              setFolderFilter(id);
              saveCurrentFolder(id);
              setFavoriteFilter(false);
              setTypeFilter([]);
            }}
            onDropResourcesToFolder={(fid, ids) => handleMoveResourcesToFolder(fid, ids)}
            onMoveFolder={handleMoveFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            onOpenFolderLocation={handleOpenFolderLocation}
          />
        ) : viewMode === 'free' ? (
          <ExplorerFreeLayout
            items={mergedItems}
            folderId={folderFilter || undefined}
            selectedItems={selectedItems}
            onItemClick={handleItemClick}
            onToggleFavorite={handleToggleFavorite}
            onToggleVisibility={handleToggleVisibility}
            onPreview={(item, index) => {
              window.YUA.window['window:open'](
                'resourcePreview',
                {
                  current: item,
                  list: mergedItems,
                  index
                },
                {
                  sameDisplayAsSender: true
                }
              );
            }}
            draggable
            onDragStart={(e, item, ids) => {
              try {
                e.dataTransfer.setData('application/x-resource-ids', JSON.stringify(ids));
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.dropEffect = 'move';
              } catch {
                /* ignore */
              }
            }}
          />
        ) : null}
        {childFolders.length === 0 && mergedItems.length === 0 ? (
          <DefaultEmptyFolder
            folderId={folderFilter || undefined}
            workspaceId={wsFilter || undefined}
            onDone={async () => {
              await load();
              await loadFolders(wsFilter || undefined);
            }}
          />
        ) : null}
      </Dropzone>

      <ResourceFooter
        folderFilter={folderFilter}
        setFolderFilter={setFolderFilter}
        saveCurrentFolder={saveCurrentFolder}
        setFavoriteFilter={setFavoriteFilter}
        setTypeFilter={setTypeFilter}
        currentFolderPath={currentFolderPath}
        selectedItems={selectedItems}
        handleDeleteMany={handleDeleteMany}
        setSelectedItems={setSelectedItems}
        filtered={mergedItems}
        list={list}
      />
    </div>
  );
};

export default ResourceContent;
