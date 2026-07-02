import { debounce } from 'lodash-es';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbAlertTriangle, TbChevronLeft, TbEyeOff, TbFolderOpen, TbFolderPlus, TbHome, TbPlayerPlay, TbTrash, TbX } from 'react-icons/tb';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import { toast } from 'sonner';

import Dropzone from '@/components/common/Dropzone';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { runWorkflow } from '@/lib/workflow-runner';
import { BroadcastChannelManager, CHANNEL_NAMES, type PreferencesMessage } from '@/utils/broadcastChannels';

import { ResourceItem, ViewMode } from '../../types';
import {
  getIgnoreLinkedMissingDirectoryErrorMessage,
  getIgnoreLinkedMissingDirectorySuccessMessage,
  getLinkedFolderState,
  getReconnectLinkedMissingDirectoryErrorMessage,
  getReconnectLinkedMissingDirectorySuccessMessage,
  getRecreateLinkedMissingDirectoryErrorMessage,
  getRecreateLinkedMissingDirectorySuccessMessage,
  ignoreLinkedMissingDirectory,
  isLinkedFolderMissing,
  reconnectLinkedMissingDirectory,
  recreateLinkedMissingDirectory
} from '../../utils/linkedFolderState';
import { getLinkedResourceSyncIssue, getLinkedResourceSyncIssueDescription } from '../../utils/linkedResourceSync';
import { mergeVideoWithSubtitles } from '../../utils/subtitleUtils';
import AIChatSidebar from '../AIChatSidebar';
import DefaultEmptyFolder from '../DefaultEmptyFolder';
import ExplorerFreeLayout from '../ExplorerFreeLayout';
import ExplorerGrid from '../ExplorerGrid';
import ExplorerList from '../ExplorerList';
import { UIFolder } from '../FolderSidebar';
import ResourcePreviewPanel from '../ResourcePreviewPanel';

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
  folders: UIFolder[];
  folderParentMap: Map<string, string | null>;
  selectedItems: Set<string>;
  folderFilter: string;
  wsFilter: string | undefined;
  setFolderFilter: (id: string) => void;
  saveCurrentFolder: (id: string) => void;
  setFavoriteFilter: (fav: boolean) => void;
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
  setSelectedItems: (items: Set<string>) => void;
  list: any[];
  isCollapseMode: boolean;
  // 面包屑导航
  currentFolderPath: UIFolder[];
  // RSS 相关
  onOpenRssSettings?: (item: ResourceItem) => void;
  onRefreshRss?: () => void;
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
  folders,
  folderParentMap,
  selectedItems,
  folderFilter,
  wsFilter,
  setFolderFilter,
  saveCurrentFolder,
  setFavoriteFilter,
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
  setSelectedItems,
  list,
  isCollapseMode,
  // 面包屑导航
  currentFolderPath,
  // RSS 相关
  onOpenRssSettings,
  onRefreshRss
}) => {
  // 预览模式配置: 'window' 表示弹窗，'panel' 表示右侧面板
  const [previewMode, setPreviewMode] = useState<'window' | 'panel'>('window');

  // AI 侧边对话栏状态
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [missingRepairOpen, setMissingRepairOpen] = useState(false);
  const [bulkRepairProgress, setBulkRepairProgress] = useState<{ total: number; done: number; action: string } | null>(null);

  // 工作流列表（提升到父组件，避免 SelectionActionBar 每次挂载时重新加载）
  const [workflows, setWorkflows] = useState<any[]>([]);
  useEffect(() => {
    window.ipcRenderer
      .invoke('wf:listDefinitions')
      .then((defs: any[]) => {
        setWorkflows(defs || []);
      })
      .catch(() => { });
  }, []);

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

  const missingLinkedFolders = useMemo(() => {
    return (folders || []).filter((folder) => folder.workspaceId === wsFilter && isLinkedFolderMissing(getLinkedFolderState(folder)));
  }, [folders, wsFilter]);

  const refreshAfterFolderRepair = useCallback(async (): Promise<void> => {
    await load();
    await loadFolders(wsFilter || undefined);
  }, [load, loadFolders, wsFilter]);

  const handleReconnectMissingFolder = useCallback(
    async (folderId: string): Promise<void> => {
      const result = await reconnectLinkedMissingDirectory(folderId);
      if (result?.canceled) return;
      if (!result?.success) {
        toast.error('重连目录失败', { description: getReconnectLinkedMissingDirectoryErrorMessage(result?.error) });
        return;
      }
      toast.success('已重连缺失目录', { description: getReconnectLinkedMissingDirectorySuccessMessage(result) });
      await refreshAfterFolderRepair();
    },
    [refreshAfterFolderRepair]
  );

  const handleRecreateMissingFolder = useCallback(
    async (folderId: string): Promise<void> => {
      const result = await recreateLinkedMissingDirectory(folderId);
      if (!result?.success) {
        toast.error('重建目录失败', { description: getRecreateLinkedMissingDirectoryErrorMessage(result?.error) });
        return;
      }
      toast.success('已在原位置重建目录', { description: getRecreateLinkedMissingDirectorySuccessMessage(result) });
      await refreshAfterFolderRepair();
    },
    [refreshAfterFolderRepair]
  );

  const handleIgnoreMissingFolder = useCallback(
    async (folderId: string): Promise<void> => {
      const result = await ignoreLinkedMissingDirectory(folderId);
      if (!result?.success) {
        toast.error('忽略目录失败', { description: getIgnoreLinkedMissingDirectoryErrorMessage(result?.error) });
        return;
      }
      toast.success('已忽略缺失目录', { description: getIgnoreLinkedMissingDirectorySuccessMessage(result) });
      await refreshAfterFolderRepair();
    },
    [refreshAfterFolderRepair]
  );

  const handleBulkRecreateMissingFolders = useCallback(async (): Promise<void> => {
    let repaired = 0;
    setBulkRepairProgress({ total: missingLinkedFolders.length, done: 0, action: 'recreate' });
    for (const folder of missingLinkedFolders) {
      const result = await recreateLinkedMissingDirectory(folder.id);
      if (result?.success) repaired += 1;
      setBulkRepairProgress((prev) => (prev ? { ...prev, done: (prev.done || 0) + 1 } : null));
    }
    setBulkRepairProgress(null);
    await refreshAfterFolderRepair();
    toast.success('批量重建完成', { description: `已处理 ${repaired}/${missingLinkedFolders.length} 个缺失目录。` });
  }, [missingLinkedFolders, refreshAfterFolderRepair]);

  const handleBulkIgnoreMissingFolders = useCallback(async (): Promise<void> => {
    let repaired = 0;
    setBulkRepairProgress({ total: missingLinkedFolders.length, done: 0, action: 'ignore' });
    for (const folder of missingLinkedFolders) {
      const result = await ignoreLinkedMissingDirectory(folder.id);
      if (result?.success) repaired += 1;
      setBulkRepairProgress((prev) => (prev ? { ...prev, done: (prev.done || 0) + 1 } : null));
    }
    setBulkRepairProgress(null);
    await refreshAfterFolderRepair();
    toast.success('批量忽略完成', { description: `已处理 ${repaired}/${missingLinkedFolders.length} 个缺失目录。` });
  }, [missingLinkedFolders, refreshAfterFolderRepair]);

  // 新增资源高亮：在当前工作区/文件夹内，记录「最近出现」的资源 ID，并在短时间内高亮显示
  const [recentlyAddedIds, setRecentlyAddedIds] = useState<Set<string>>(new Set());
  const previousIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const highlightTimeoutsRef = useRef<Map<string, number>>(new Map());

  // 当工作区 / 文件夹 / 视图模式 / 折叠模式切换时，重置高亮状态，避免误把视图切换当成「新资源」
  useEffect(() => {
    initializedRef.current = false;
    previousIdsRef.current = new Set();
    window.setTimeout(() => setRecentlyAddedIds(new Set()), 0);
    highlightTimeoutsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    highlightTimeoutsRef.current.clear();
  }, [folderFilter, wsFilter, viewMode, isCollapseMode]);

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
  const handlePreview = useCallback(
    (item: ResourceItem) => {
      const syncIssue = getLinkedResourceSyncIssue(item);
      if (syncIssue) {
        toast.error('无法预览关联资源', {
          description: getLinkedResourceSyncIssueDescription(syncIssue)
        });
        return;
      }

      if (previewMode === 'panel') {
        setPreviewResource(item);
        return;
      }

      const index = mergedItems.findIndex((entry) => entry.id === item.id);
      window.YUA.window['window:open'](
        'resourcePreview',
        {
          current: item,
          list: mergedItems,
          index: index >= 0 ? index : 0
        },
        {
          sameDisplayAsSender: true
        }
      );
    },
    [mergedItems, previewMode]
  );

  // 关闭预览面板
  const handleClosePreview = useCallback(() => {
    setPreviewResource(null);
  }, []);

  // 切换预览的资源
  const handlePreviewResourceChange = useCallback((newResource: ResourceItem) => {
    const syncIssue = getLinkedResourceSyncIssue(newResource);
    if (syncIssue) {
      toast.error('无法预览关联资源', {
        description: getLinkedResourceSyncIssueDescription(syncIssue)
      });
      return;
    }
    setPreviewResource(newResource);
  }, []);

  // 渲染资源列表内容
  const renderResourceList = (): React.ReactNode => (
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
          totalCount={list.length}
          onOpenFolder={(id) => {
            setFolderFilter(id);
            saveCurrentFolder(id);
            setFavoriteFilter(false);
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
          onPreview={handlePreview}
          onOpenRssSettings={onOpenRssSettings}
          onRefreshRss={onRefreshRss}
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
          totalCount={list.length}
          onItemClick={handleItemClick}
          onOpenFolder={(id) => {
            setFolderFilter(id);
            saveCurrentFolder(id);
            setFavoriteFilter(false);
          }}
          onDropResourcesToFolder={(fid, ids) => handleMoveResourcesToFolder(fid, ids)}
          onMoveFolder={handleMoveFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onOpenFolderLocation={handleOpenFolderLocation}
          onPreview={handlePreview}
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
          onPreview={(item) => handlePreview(item)}
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

  // 多选操作栏显示条件：选中超过 1 个
  const showSelectionBar = selectedItems.size > 1;

  return (
    <div className="w-full h-full flex flex-col relative">
      {/* 面包屑导航 - 绝对定位到标题栏区域 */}
      <div className="absolute top-[-36px] left-0 right-0 h-9 flex items-center justify-between px-3 text-sm text-muted-foreground pointer-events-none">
        {/* 左侧：面包屑导航 */}
        <div className="pointer-events-auto flex items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {/* 回退按钮 - 只在有上级目录时显示 */}
          {
            <Button
              variant={'ghost'}
              size={'icon'}
              className="w-8 h-8"
              onClick={() => {
                // 返回上一级：如果有多级路径，返回倒数第二个；否则返回根目录
                const parentId = currentFolderPath.length > 1 ? currentFolderPath[currentFolderPath.length - 2].id : '';
                setFolderFilter(parentId);
                saveCurrentFolder(parentId);
                setFavoriteFilter(false);
              }}
            >
              {folderFilter ? <TbChevronLeft /> : <TbHome />}
            </Button>
          }
          <span
            className={`cursor-pointer hover:underline ${folderFilter ? 'text-muted-foreground' : 'text-foreground font-medium'}`}
            onClick={() => {
              setFolderFilter('');
              saveCurrentFolder('');
              setFavoriteFilter(false);
            }}
          >
            全部
          </span>
          {currentFolderPath.map((f) => (
            <React.Fragment key={f.id}>
              <span className="mx-2 text-muted-foreground">/</span>
              <span
                className="cursor-pointer hover:underline text-foreground font-medium"
                onClick={() => {
                  setFolderFilter(f.id);
                  saveCurrentFolder(f.id);
                  setFavoriteFilter(false);
                }}
              >
                {f.name}
              </span>
            </React.Fragment>
          ))}
        </div>

        {/* 右侧：功能按钮 */}
        <div className="pointer-events-auto flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {missingLinkedFolders.length > 0 ? (
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-amber-700" onClick={() => setMissingRepairOpen(true)}>
              <TbAlertTriangle className="h-4 w-4" />
              <span className="text-xs">{missingLinkedFolders.length}</span>
            </Button>
          ) : null}
          {/* AI 助手按钮 */}
          {/* <button className={`p-1.5 rounded transition-colors ${aiChatOpen ? 'bg-muted text-primary' : 'hover:bg-muted'}`} onClick={() => setAiChatOpen((prev) => !prev)} title="AI 助手">
            <TbSparkles className="w-4 h-4" />
          </button> */}
          {/* 自动化任务按钮 */}
          {/* <button
            className="p-1.5 rounded hover:bg-muted transition-colors"
            onClick={() => {
              toast.info('自动化任务功能即将上线');
            }}
          >
            <TbBolt className="w-4 h-4" />
          </button> */}
        </div>
      </div>

      <Dialog open={missingRepairOpen} onOpenChange={(open) => { if (!bulkRepairProgress) setMissingRepairOpen(open); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>缺失关联目录</DialogTitle>
          </DialogHeader>
          {bulkRepairProgress ? (
            <div className="space-y-3 py-2">
              <div className="text-sm text-muted-foreground">
                正在{bulkRepairProgress.action === 'recreate' ? '重建' : '忽略'}... {bulkRepairProgress.done}/{bulkRepairProgress.total}
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-200"
                  style={{ width: `${(bulkRepairProgress.done / bulkRepairProgress.total) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-muted-foreground">共 {missingLinkedFolders.length} 个目录需要处理</div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleBulkRecreateMissingFolders}>
                    <TbFolderPlus className="h-4 w-4" /> 全部重建
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleBulkIgnoreMissingFolders}>
                    <TbEyeOff className="h-4 w-4" /> 全部忽略
                  </Button>
                </div>
              </div>
              <div className="max-h-[50vh] overflow-auto rounded-md border">
                {missingLinkedFolders.map((folder) => (
                  <div key={folder.id} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{folder.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{folder.relativePath || folder.id}</div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="选择新路径重连" onClick={() => handleReconnectMissingFolder(folder.id)}>
                        <TbFolderOpen className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="在原位置重建目录" onClick={() => handleRecreateMissingFolder(folder.id)}>
                        <TbFolderPlus className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" title="忽略缺失目录" onClick={() => handleIgnoreMissingFolder(folder.id)}>
                        <TbEyeOff className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex-1 overflow-hidden border-t">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* 主内容区（资源列表 + 预览面板） */}
          <ResizablePanel defaultSize={aiChatOpen ? 70 : 100} minSize={40}>
            <div className="h-full flex flex-col relative">
              {/* 多选操作栏（悬浮在底部） */}
              {showSelectionBar && (
                <SelectionActionBar selectedItems={selectedItems} setSelectedItems={setSelectedItems} handleDeleteMany={handleDeleteMany} filtered={mergedItems} workflows={workflows} />
              )}

              {/* 资源列表 + 预览面板 */}
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
                        <ResourcePreviewPanel
                          key={previewResource.id}
                          resource={previewResource}
                          resourceList={mergedItems}
                          onClose={handleClosePreview}
                          onResourceChange={handlePreviewResourceChange}
                        />
                      </ResizablePanel>
                    </>
                  )}
                </ResizablePanelGroup>
              </div>
            </div>
          </ResizablePanel>

          {/* AI 侧边对话栏（可拖拽调整宽度） */}
          {aiChatOpen && (
            <>
              <ResizableHandle className="hover:bg-primary" withHandle />
              <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
                <AIChatSidebar onClose={() => setAiChatOpen(false)} workspaceId={wsFilter || undefined} />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

// 多选操作栏组件
interface SelectionActionBarProps {
  selectedItems: Set<string>;
  setSelectedItems: (items: Set<string>) => void;
  handleDeleteMany: (ids: string[]) => void;
  filtered: ResourceItem[];
  workflows: any[];
}

const SelectionActionBar: React.FC<SelectionActionBarProps> = ({ selectedItems, setSelectedItems, handleDeleteMany, filtered, workflows }) => {
  // 获取选中的资源列表
  const selectedResources = useMemo(() => {
    return filtered.filter((item) => selectedItems.has(item.id));
  }, [filtered, selectedItems]);

  // 推断资源的类型
  const getResourceKind = useCallback((item: ResourceItem): 'image' | 'video' | 'audio' | 'document' | 'other' => {
    if (typeof item?.type === 'string' && item.type) {
      const t = item.type.toLowerCase();
      if (t === 'image' || t === 'video' || t === 'audio' || t === 'document' || t === 'other') return t as any;
    }
    const filePath: string = item?.filePath || '';
    const ext = (filePath.split('.').pop() || '').toLowerCase();
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) return 'image';
    if (['mp4', 'webm', 'mov', 'mkv', 'ogv'].includes(ext)) return 'video';
    if (['mp3', 'wav', 'm4a', 'flac', 'opus', 'ogg'].includes(ext)) return 'audio';
    if (['pdf', 'doc', 'docx', 'md', 'txt', 'rtf'].includes(ext)) return 'document';
    return 'other';
  }, []);

  // 检查选中的资源是否都是同一类型
  const selectedResourceKind = useMemo(() => {
    if (selectedResources.length === 0) return null;
    const firstKind = getResourceKind(selectedResources[0]);
    const allSameKind = selectedResources.every((item) => getResourceKind(item) === firstKind);
    return allSameKind ? firstKind : null;
  }, [selectedResources, getResourceKind]);

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

  // 过滤出可用的工作流（基于选中资源的类型）
  const availableWorkflows = useMemo(() => {
    if (!selectedResourceKind) return [];
    return workflows.filter((wf) => {
      if (wf.id === 'blank') return false;
      const inputMode = getWorkflowInputMode(wf);
      if (inputMode !== 'resource') return false;
      const kinds = getWorkflowResourceKinds(wf);
      if (!kinds || kinds.length === 0 || kinds.includes('any')) return true;
      return kinds.includes(selectedResourceKind);
    });
  }, [workflows, selectedResourceKind, getWorkflowInputMode, getWorkflowResourceKinds]);

  // 执行工作流（对选中的资源逐个执行）
  const handleRunWorkflow = useCallback(
    async (wf: any) => {
      if (selectedResources.length === 0) return;

      // 对每个选中的资源执行工作流
      for (const item of selectedResources) {
        await runWorkflow({
          defId: wf.id,
          input: { resource: item, resourceId: item.id },
          metadata: {
            resourceId: item.id,
            resourceName: item.title || 'Unknown',
            thumbnailPath: item.thumbnailPath,
            workspaceId: item.workspaceId
          },
          onSuccess: () => { }
        });
      }
      toast.success(`已开始对 ${selectedResources.length} 个资源执行工作流: ${wf.name}`);
    },
    [selectedResources]
  );

  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-4 z-50">
      <div className="flex items-center gap-3 px-4 py-2 bg-primary text-primary-foreground rounded-lg shadow-lg">
        <span className="text-sm font-medium whitespace-nowrap">已选择 {selectedItems.size} 个项目</span>
        <div className="w-px h-4 bg-primary-foreground/30" />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
          onClick={() => handleDeleteMany(Array.from(selectedItems))}
        >
          <TbTrash className="w-4 h-4 mr-1" />
          删除
        </Button>
        {/* 工作流执行按钮（仅当选中相同类型资源时显示） */}
        {availableWorkflows.length > 0 && (
          <>
            <div className="w-px h-4 bg-primary-foreground/30" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground">
                  <TbPlayerPlay className="w-4 h-4 mr-1" />
                  执行任务
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="min-w-[10rem]">
                {availableWorkflows.map((wf) => (
                  <DropdownMenuItem key={wf.id} onClick={() => handleRunWorkflow(wf)}>
                    {wf.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground" onClick={() => setSelectedItems(new Set())}>
          <TbX className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

export default ResourceContent;
