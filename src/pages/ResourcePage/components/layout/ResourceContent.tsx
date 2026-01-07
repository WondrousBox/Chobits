import { debounce } from 'lodash-es';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ImperativePanelHandle } from 'react-resizable-panels';

import Dropzone from '@/components/common/Dropzone';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { BroadcastChannelManager, CHANNEL_NAMES, type PreferencesMessage } from '@/utils/broadcastChannels';

import { ResourceItem, ViewMode } from '../../types';
import { mergeVideoWithSubtitles } from '../../utils/subtitleUtils';
import DefaultEmptyFolder from '../DefaultEmptyFolder';
import ExplorerFreeLayout from '../ExplorerFreeLayout';
import ExplorerGrid from '../ExplorerGrid';
import ExplorerList from '../ExplorerList';
import { UIFolder } from '../FolderSidebar';
import ResourcePreviewPanel from '../ResourcePreviewPanel';
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
  // 预览模式配置: 'window' 表示弹窗，'panel' 表示右侧面板
  const [previewMode, setPreviewMode] = useState<'window' | 'panel'>('window');

  // 预览面板状态
  const [previewResource, setPreviewResource] = useState<ResourceItem | null>(null);

  // 预览面板尺寸（从 localStorage 读取缓存）
  const PREVIEW_PANEL_SIZE_KEY = 'resource-preview-panel-size';
  const [previewPanelSize, setPreviewPanelSize] = useState<number>(() => {
    const cached = localStorage.getItem(PREVIEW_PANEL_SIZE_KEY);
    return cached ? Number(cached) : 40;
  });

  // 用于控制面板大小的 ref
  const mainPanelRef = useRef<ImperativePanelHandle>(null);
  const previewPanelRef = useRef<ImperativePanelHandle>(null);

  // 加载预览模式配置
  useEffect(() => {
    const loadPreviewMode = async (): Promise<void> => {
      try {
        const result = await window.YUA.preferences['preferences:getPreviewMode']();
        if (result.ok && result.previewMode) {
          setPreviewMode(result.previewMode);
        }
      } catch (error) {
        console.warn('加载预览模式配置失败:', error);
      }
    };
    loadPreviewMode();

    // 使用 BroadcastChannel 监听跨窗口的配置变化
    const channel = BroadcastChannelManager.acquire(CHANNEL_NAMES.PREFERENCES);
    const handleMessage = (event: MessageEvent<PreferencesMessage>): void => {
      if (event.data?.type === 'previewModeChanged' && event.data?.previewMode) {
        setPreviewMode(event.data.previewMode);
      }
    };
    channel.addEventListener('message', handleMessage);

    return () => {
      channel.removeEventListener('message', handleMessage);
      BroadcastChannelManager.release(CHANNEL_NAMES.PREFERENCES);
    };
  }, []);

  // 当预览面板打开/关闭时，调整主面板大小
  useEffect(() => {
    if (mainPanelRef.current) {
      // 预览面板打开时，使用缓存的尺寸；关闭时恢复到 100%
      mainPanelRef.current.resize(previewResource ? 100 - previewPanelSize : 100);
    }
  }, [previewResource, previewPanelSize]);

  // 防抖保存预览面板尺寸到 localStorage（避免频繁写入）
  const debouncedSaveToStorage = useMemo(
    () =>
      debounce((size: number) => {
        localStorage.setItem(PREVIEW_PANEL_SIZE_KEY, String(size));
      }, 300),
    []
  );

  // 保存预览面板尺寸
  const handlePanelResize = useCallback(
    (sizes: number[]) => {
      if (sizes.length === 2) {
        const newPreviewSize = sizes[1];
        setPreviewPanelSize(newPreviewSize);
        debouncedSaveToStorage(newPreviewSize);
      }
    },
    [debouncedSaveToStorage]
  );

  // 组件卸载时清理 debounce
  useEffect(() => {
    return () => {
      debouncedSaveToStorage.cancel();
    };
  }, [debouncedSaveToStorage]);

  // 合并视频和字幕文件
  const mergedItems = useMemo(() => {
    if (isCollapseMode) {
      return mergeVideoWithSubtitles(filtered);
    }
    return filtered;
  }, [filtered, isCollapseMode]);

  // 新增资源高亮：在当前工作区/文件夹内，记录「最近出现」的资源 ID，并在短时间内高亮显示
  const [recentlyAddedIds, setRecentlyAddedIds] = useState<Set<string>>(new Set());
  const previousIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const highlightTimeoutsRef = useRef<Map<string, number>>(new Map());

  // 当工作区 / 文件夹切换时，重置高亮状态，避免误把视图切换当成「新资源」
  useEffect(() => {
    initializedRef.current = false;
    previousIdsRef.current = new Set();
    setRecentlyAddedIds(new Set());
    highlightTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    highlightTimeoutsRef.current.clear();
  }, [folderFilter, wsFilter, viewMode]);

  useEffect(() => {
    const currentIds = new Set<string>((mergedItems as any[]).map((item) => item.id));

    // 首次初始化：只记录当前已有的 ID，不触发高亮
    if (!initializedRef.current) {
      previousIdsRef.current = currentIds;
      initializedRef.current = true;
      return;
    }

    const previousIds = previousIdsRef.current;
    previousIdsRef.current = currentIds;

    const newlyAdded: string[] = [];
    currentIds.forEach((id) => {
      if (!previousIds.has(id)) {
        newlyAdded.push(id);
      }
    });

    if (newlyAdded.length === 0) return;

    const HIGHLIGHT_DURATION = 8000; // 高亮时长（毫秒）

    newlyAdded.forEach((id) => {
      setRecentlyAddedIds((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });

      // 在一段时间后自动移除高亮
      const timeoutId = window.setTimeout(() => {
        setRecentlyAddedIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        highlightTimeoutsRef.current.delete(id);
      }, HIGHLIGHT_DURATION);

      // 记录 timer，便于视图切换时清理
      const oldTimeout = highlightTimeoutsRef.current.get(id);
      if (oldTimeout) {
        window.clearTimeout(oldTimeout);
      }
      highlightTimeoutsRef.current.set(id, timeoutId);
    });
  }, [mergedItems]);

  // 处理预览资源
  const handlePreview = useCallback((item: ResourceItem) => {
    setPreviewResource(item);
  }, []);

  // 关闭预览面板
  const handleClosePreview = useCallback(() => {
    setPreviewResource(null);
  }, []);

  // 切换预览的资源
  const handlePreviewResourceChange = useCallback((newResource: ResourceItem) => {
    setPreviewResource(newResource);
  }, []);

  // 渲染资源列表内容
  const renderResourceList = () => (
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
          selectedItems={selectedItems}
          setSelectedItems={setSelectedItems}
          highlightedIds={recentlyAddedIds}
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
          onPreview={previewMode === 'window' ? undefined : handlePreview}
        />
      ) : viewMode === 'list' ? (
        <ExplorerList
          items={mergedItems}
          folders={childFolders}
          counts={folderCounts}
          folderParentMap={folderParentMap}
          selectedItems={selectedItems}
          folderId={folderFilter || undefined}
          workspaceId={wsFilter}
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
          onPreview={previewMode === 'window' ? undefined : handlePreview}
          onDelete={handleDelete}
          onDeleteMany={handleDeleteMany}
          onFolderCreated={async () => {
            await load();
            await loadFolders(wsFilter || undefined);
          }}
          setSelectedItems={setSelectedItems}
          highlightedIds={recentlyAddedIds}
        />
      ) : viewMode === 'free' ? (
        <ExplorerFreeLayout
          items={mergedItems}
          folderId={folderFilter || undefined}
          selectedItems={selectedItems}
          onItemClick={handleItemClick}
          onToggleFavorite={handleToggleFavorite}
          onToggleVisibility={handleToggleVisibility}
          onPreview={previewMode === 'window' ? undefined : (item) => handlePreview(item)}
          draggable
          onDragStart={(e, _item, ids) => {
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
  );

  return (
    <div className="w-full h-full flex flex-col" style={{ height: 'calc(100% - 36px)' }}>
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full" onLayout={handlePanelResize}>
          {/* 资源列表区域 */}
          <ResizablePanel ref={mainPanelRef} defaultSize={previewResource ? 100 - previewPanelSize : 100} minSize={30}>
            {renderResourceList()}
          </ResizablePanel>

          {/* 预览面板 */}
          {previewResource && (
            <>
              <ResizableHandle className="hover:bg-primary" withHandle />
              <ResizablePanel ref={previewPanelRef} defaultSize={previewPanelSize} minSize={20}>
                <ResourcePreviewPanel resource={previewResource} resourceList={mergedItems} onClose={handleClosePreview} onResourceChange={handlePreviewResourceChange} />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>

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
