import { AppEvent } from '@packages/event/events';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { toast } from 'sonner';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SidebarProvider } from '@/components/ui/sidebar';
import ChatPage from '@/pages/ChatPage/ChatPage';
import SettingsPage, { SettingsCategory } from '@/pages/SettingsPage/SettingsPage';

import EditRssSettingsDialog from './components/EditRssSettingsDialog';
import { UIFolder } from './components/FolderSidebar';
import ContentToolbar from './components/layout/ContentToolbar';
import RenameFolderDialog from './components/layout/RenameFolderDialog';
import ResourceContent from './components/layout/ResourceContent';
import ResourceHeader from './components/layout/ResourceHeader';
import ResourceSidebar from './components/layout/ResourceSidebar';
import TaskList from './components/TaskList';
import { useFolderImport } from './hooks/useFolderImport';
import { useFolderOperations } from './hooks/useFolderOperations';
import { useResourceData } from './hooks/useResourceData';
import { useResourceFilter } from './hooks/useResourceFilter';
import { useResourceOperations } from './hooks/useResourceOperations';
import { useResourceUpload } from './hooks/useResourceUpload';
import { useViewMode } from './hooks/useViewMode';
import { useWorkflowProgress } from './hooks/useWorkflowProgress';
import RecycleBinPage from './RecycleBinPage';
import ResourcePreviewWindow from './ResourcePreviewWindow';
import RssFeedPage from './RssFeedPage';
import { ResourceItem, SelectedResourceFileType, SortField, SortOrder } from './types';
import { mergeVideoWithSubtitles } from './utils/subtitleUtils';
import WorkflowPage from './WorkflowPage';

const ResourcePage: React.FC = () => {
  // 当前页面不再提供空间切换，始终使用"当前选中的默认空间"进行筛选
  const [wsFilter, setWsFilter] = useState<string | undefined>(undefined);
  const [tagFilter, setTagFilter] = useState<string>(''); // '' means all
  const [favoriteFilter, setFavoriteFilter] = useState<boolean>(false); // false means all, true means favorites only
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('collectedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [folderFilter, setFolderFilter] = useState<string>(''); // '' 表示全部
  const folderRestoredRef = useRef<string>(''); // 记录已恢复的工作空间ID
  const folderAPI: any = window.YUA?.folder;

  const [isCollapseMode, setIsCollapseMode] = useState<boolean>(false);
  const [showCollapseSuggestion, setShowCollapseSuggestion] = useState<boolean>(false);
  const [checkMergePending, setCheckMergePending] = useState<boolean>(false);
  const prevUploadVisibleRef = useRef<boolean>(false);

  const [workspaces, setWorkspaces] = useState<any[]>([]);
  // 设置对话框状态：null 表示关闭，字符串表示打开并指定默认分类
  const [settingsModalCategory, setSettingsModalCategory] = useState<SettingsCategory | null>(null);

  // RSS 设置对话框状态
  const [rssSettingsOpen, setRssSettingsOpen] = useState(false);
  const [rssSettingsItem, setRssSettingsItem] = useState<ResourceItem | null>(null);

  // 使用自定义 hooks
  const { list, setList, tags, folders, foldersLoading, load, loadTags, loadFolders } = useResourceData(wsFilter, tagFilter);

  const { uploadProgress, onDropFiles } = useResourceUpload({
    folderFilter,
    wsFilter,
    folders,
    load,
    loadFolders
  });

  const { importProgress } = useFolderImport({
    folderFilter,
    wsFilter,
    load,
    loadFolders
  });

  const workflowProgress = useWorkflowProgress();

  const { viewMode, handleViewModeChange } = useViewMode(folderFilter);

  const { filtered } = useResourceFilter({
    list,
    wsFilter,
    tagFilter,
    folderFilter,
    favoriteFilter,
    searchQuery,
    sortField,
    sortOrder
  });

  const { handleDelete, handleDeleteMany, handleItemClick, handleToggleFavorite, handleToggleVisibility } = useResourceOperations(
    list,
    setList,
    favoriteFilter,
    setFavoriteFilter,
    selectedItems,
    setSelectedItems
  );

  const { renameOpen, setRenameOpen, renameName, setRenameName, handleMoveFolder, handleOpenFolderLocation, handleRenameFolder, handleDeleteFolder, handleMoveResourcesToFolder, handleRenameConfirm } =
    useFolderOperations(folders, wsFilter, folderFilter, setFolderFilter, list, load, loadFolders);

  // RSS 订阅设置处理
  const handleOpenRssSettings = useCallback((item: ResourceItem) => {
    setRssSettingsItem(item);
    setRssSettingsOpen(true);
  }, []);

  // RSS 刷新后重新加载数据
  const handleRefreshRss = useCallback(async () => {
    await load();
  }, [load]);

  // localStorage key for current folder
  const getCurrentFolderKey = useCallback(() => {
    const wsId = wsFilter || 'default';
    return `resource-current-folder-${wsId}`;
  }, [wsFilter]);

  // 从 localStorage 加载当前文件夹
  const loadCurrentFolder = useCallback((): string => {
    if (typeof window === 'undefined') return '';
    try {
      const key = getCurrentFolderKey();
      const stored = window.localStorage?.getItem(key);
      return stored || '';
    } catch (err) {
      console.warn('load current folder failed', err);
      return '';
    }
  }, [getCurrentFolderKey]);

  // 加载工作空间列表
  const loadWorkspaces = useCallback(async () => {
    console.log('loadWorkspaces');
    try {
      const ws = await window.YUA.workspace['workspace:list']({ filter: { deletedAt: 0 }, limit: 100, offset: 0 });
      if (Array.isArray(ws)) {
        setWorkspaces(ws);
        // 如果当前没有选中的工作空间，则选中默认的或第一个
        const defaultId = ws.find((w) => w.isDefault === 1)?.id || ws[0]?.id;
        if (wsFilter !== defaultId && defaultId) {
          setWsFilter(defaultId);
        }
      }
    } catch (e) {
      console.error('load workspaces failed', e);
    }
  }, [wsFilter]);

  // 保存当前文件夹到 localStorage
  const saveCurrentFolder = useCallback(
    (folderId: string) => {
      if (typeof window === 'undefined') return;
      try {
        const key = getCurrentFolderKey();
        window.localStorage?.setItem(key, folderId);
      } catch (err) {
        console.warn('save current folder failed', err);
      }
    },
    [getCurrentFolderKey]
  );

  const hasFavorites = useMemo(() => {
    if (!wsFilter) return false;
    const rows = list.filter((r: any) => r.workspaceId === wsFilter);
    return rows.some((r: any) => r.favorite === 1);
  }, [list, wsFilter]);

  // 初始化加载工作空间
  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  // 当选中工作空间变化时，加载对应数据
  useEffect(() => {
    if (wsFilter) {
      loadFolders(wsFilter);
      loadTags(wsFilter);
    }
  }, [wsFilter, loadFolders, loadTags]);

  // 当工作空间切换时，重置恢复标记
  useEffect(() => {
    folderRestoredRef.current = '';
  }, [wsFilter]);

  // 当文件夹加载完成后，恢复当前文件夹（每个工作空间只恢复一次）
  useEffect(() => {
    if (!wsFilter || folders.length === 0) return;
    // 如果已经为当前工作空间恢复过，则不再恢复
    if (folderRestoredRef.current === wsFilter) return;
    const savedFolder = loadCurrentFolder();
    if (savedFolder) {
      // 验证文件夹是否仍然存在
      const folderExists = folders.some((f) => f.id === savedFolder);
      if (folderExists) {
        setFolderFilter(savedFolder);
      } else {
        // 如果保存的文件夹不存在，清除保存的状态
        saveCurrentFolder('');
      }
    }
    folderRestoredRef.current = wsFilter;
  }, [wsFilter, folders, loadCurrentFolder, saveCurrentFolder]);

  // 监听上传进度，上传完成后检查是否需要合并
  useEffect(() => {
    const prev = prevUploadVisibleRef.current;
    const curr = uploadProgress.visible;
    if (prev && !curr) {
      // 上传完成
      setCheckMergePending(true);
    }
    prevUploadVisibleRef.current = curr;
  }, [uploadProgress.visible]);

  // 检查是否需要合并
  useEffect(() => {
    if (checkMergePending) {
      // 只有在未开启收起模式时才检查
      if (!isCollapseMode) {
        const merged = mergeVideoWithSubtitles(list);
        // 如果合并后的数量少于原数量，说明有可合并的项
        if (merged.length < list.length) {
          setShowCollapseSuggestion(true);
        }
      }
      setCheckMergePending(false);
    }
  }, [checkMergePending, list, isCollapseMode]);

  // 监听应用事件
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
          load();
          loadTags(wsFilter);
          break;
        case AppEvent.FOLDER_CREATED:
        case AppEvent.FOLDER_UPDATED:
        case AppEvent.FOLDER_DELETED:
        case AppEvent.FOLDER_MOVED:
          loadFolders(wsFilter);
          break;
        case AppEvent.WORKSPACE_UPDATED:
        case AppEvent.WORKSPACE_CREATED:
        case AppEvent.WORKSPACE_DELETED:
          loadWorkspaces();
          break;
      }
    });
    return unsubscribe;
  }, [load, loadTags, loadFolders, loadWorkspaces, wsFilter]);

  // 监听粘贴事件
  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent): Promise<void> => {
      // 如果当前焦点在输入框中，不处理粘贴事件
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      const items = event.clipboardData?.items;
      if (!items) return;

      const files: SelectedResourceFileType[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            // Electron environment: File object has 'path' property
            // For pasted images from web, path might be empty, but we still want to upload them
            const path = (file as any).path || '';
            files.push({
              path: path,
              name: file.name,
              size: file.size,
              type: 'file',
              file: file
            });
          }
        }
      }

      if (files.length > 0) {
        event.preventDefault();
        await onDropFiles(files);
        toast.success(`Detected ${files.length} files from clipboard`);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [onDropFiles]);

  // 计算各文件夹资源数量（按当前默认空间；不受类型/标签筛选影响）
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!wsFilter) return counts;
    for (const r of list as any[]) {
      if ((r as any).workspaceId !== wsFilter) continue;
      const fid = (r as any).folderId;
      if (fid) counts[fid] = (counts[fid] || 0) + 1;
    }
    return counts;
  }, [list, wsFilter]);

  // 构建父子映射，供列表/网格中的文件夹拖拽校验
  const folderParentMap = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const f of folders) map.set(f.id, f.parentId ?? null);
    return map;
  }, [folders]);

  // 当前文件夹下的直接子文件夹
  const childFolders = useMemo(() => {
    if (favoriteFilter) return [] as UIFolder[];
    if (!wsFilter) return [] as UIFolder[];
    const parent = (folderFilter || null) as string | null;
    return folders.filter((f) => f.workspaceId === wsFilter && (f.parentId || null) === parent);
  }, [folders, wsFilter, folderFilter, favoriteFilter]);

  const allCount = useMemo(() => {
    if (!wsFilter) return 0;
    // “全部”计数应显示顶层（未归属任何文件夹）的资源数量，避免造成展示范围的错觉
    return (list as any[]).filter((r: any) => r.workspaceId === wsFilter && !(r as any).folderId).length;
  }, [list, wsFilter]);

  // 计算当前文件夹的路径（用于底部路径展示）
  const folderById = useMemo(() => {
    const m = new Map<string, UIFolder>();
    folders.forEach((f) => m.set(f.id, f));
    return m;
  }, [folders]);

  const currentFolderPath = useMemo((): UIFolder[] => {
    if (!wsFilter) return [];
    if (!folderFilter) return [];
    const parts: UIFolder[] = [];
    let cur: UIFolder | undefined | null = folderById.get(folderFilter);
    const guard = new Set<string>();
    while (cur) {
      if (guard.has(cur.id)) break;
      guard.add(cur.id);
      parts.push(cur);
      const pid: string | null = cur.parentId ?? null;
      if (!pid) break;
      cur = folderById.get(pid) || null;
    }
    return parts.reverse();
  }, [folderById, folderFilter, wsFilter]);

  return (
    <div className="h-full bg-background">
      <DragAbleTitle
        title={<span />}
        actions={
          <ContentToolbar
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            viewMode={viewMode}
            handleViewModeChange={handleViewModeChange}
            load={load}
            loadTags={() => loadTags(wsFilter)}
            folderFilter={folderFilter}
            wsFilter={wsFilter}
            tagFilter={tagFilter}
            setTagFilter={setTagFilter}
            tags={tags}
            sortField={sortField}
            setSortField={setSortField}
            sortOrder={sortOrder}
            setSortOrder={setSortOrder}
            isCollapseMode={isCollapseMode}
            setIsCollapseMode={setIsCollapseMode}
            showCollapseSuggestion={showCollapseSuggestion}
            setShowCollapseSuggestion={setShowCollapseSuggestion}
          />
        }
      />

      <SidebarProvider style={{ height: 'calc(100% - 36px)', minHeight: 'unset' }}>
        <ResourceSidebar
          workspaces={workspaces}
          wsFilter={wsFilter}
          hasFavorites={hasFavorites}
          favoriteFilter={favoriteFilter}
          setFavoriteFilter={setFavoriteFilter}
          setFolderFilter={setFolderFilter}
          folders={folders}
          foldersLoading={foldersLoading}
          folderFilter={folderFilter}
          saveCurrentFolder={saveCurrentFolder}
          folderCounts={folderCounts}
          allCount={allCount}
          handleMoveResourcesToFolder={handleMoveResourcesToFolder}
          handleMoveFolder={handleMoveFolder}
          loadFolders={loadFolders}
          handleRenameFolder={handleRenameFolder}
          handleDeleteFolder={handleDeleteFolder}
          folderAPI={folderAPI}
          onOpenSettings={(category) => setSettingsModalCategory((category as SettingsCategory) || 'preferences')}
        />

        <Routes>
          {/* 默认重定向到首页 */}
          <Route path="" element={<Navigate to="home" replace />} />
          <Route path="home" element={<ChatPage hideTitleBar />} />
          <Route path="tasks" element={<TaskList workspaceId={wsFilter} />} />
          <Route path="workflows" element={<WorkflowPage />} />
          <Route path="recycle" element={<RecycleBinPage hideTitleBar />} />
          <Route path="preview/:resourceId" element={<ResourcePreviewWindow />} />
          <Route path="rss/:resourceId" element={<RssFeedPage />} />
          {/* 资源浏览路由 */}
          <Route
            path="browse/*"
            element={
              <ResourceContent
                uploadProgress={uploadProgress}
                onDropFiles={onDropFiles}
                importProgress={importProgress}
                workflowProgress={workflowProgress}
                childFolders={childFolders}
                filtered={filtered}
                viewMode={viewMode}
                folderCounts={folderCounts}
                folderParentMap={folderParentMap}
                selectedItems={selectedItems}
                folderFilter={folderFilter}
                wsFilter={wsFilter}
                setFolderFilter={setFolderFilter}
                saveCurrentFolder={saveCurrentFolder}
                setFavoriteFilter={setFavoriteFilter}
                handleMoveResourcesToFolder={handleMoveResourcesToFolder}
                handleMoveFolder={handleMoveFolder}
                handleRenameFolder={handleRenameFolder}
                handleDeleteFolder={handleDeleteFolder}
                handleOpenFolderLocation={handleOpenFolderLocation}
                handleDelete={handleDelete}
                handleDeleteMany={handleDeleteMany}
                handleToggleFavorite={handleToggleFavorite}
                handleToggleVisibility={handleToggleVisibility}
                handleItemClick={handleItemClick}
                load={load}
                loadFolders={loadFolders}
                setSelectedItems={setSelectedItems}
                list={list}
                isCollapseMode={isCollapseMode}
                // 面包屑导航
                currentFolderPath={currentFolderPath}
                // RSS 相关
                onOpenRssSettings={handleOpenRssSettings}
                onRefreshRss={handleRefreshRss}
              />
            }
          />
        </Routes>
      </SidebarProvider>

      <RenameFolderDialog renameOpen={renameOpen} setRenameOpen={setRenameOpen} renameName={renameName} setRenameName={setRenameName} handleRenameConfirm={handleRenameConfirm} />

      <EditRssSettingsDialog open={rssSettingsOpen} onOpenChange={setRssSettingsOpen} item={rssSettingsItem} onSuccess={load} />

      <Dialog open={settingsModalCategory !== null} onOpenChange={(open) => !open && setSettingsModalCategory(null)}>
        <DialogHeader className="hidden">
          <DialogTitle></DialogTitle>
          <DialogDescription></DialogDescription>
        </DialogHeader>
        <DialogContent className="w-[90vw] p-0 overflow-hidden" style={{ maxWidth: 1152 }}>
          <div className="w-full h-[80vh]">
            <SettingsPage hideTitleBar defaultCategory={settingsModalCategory || undefined} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ResourcePage;
