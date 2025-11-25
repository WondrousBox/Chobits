import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbFilter, TbGrid3X3, TbHeart, TbList, TbRefresh, TbRobot, TbSearch, TbSettings, TbTrash, TbX } from 'react-icons/tb';
import { toast } from 'sonner';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import Dropzone from '@/components/common/Dropzone';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from '@/components/ui/sidebar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { AppEvent } from '../../../electron/main/handlers/events';
import DefaultEmptyFolder from './components/DefaultEmptyFolder';
import ExplorerFreeLayout from './components/ExplorerFreeLayout';
import ExplorerGrid from './components/ExplorerGrid';
import ExplorerList from './components/ExplorerList';
import FolderSidebar, { type UIFolder } from './components/FolderSidebar';
import WorkspaceSwitcher from './components/WorkspaceSwitcher';
import { useFolderOperations } from './hooks/useFolderOperations';
import { useResourceData } from './hooks/useResourceData';
import { useResourceFilter } from './hooks/useResourceFilter';
import { useResourceOperations } from './hooks/useResourceOperations';
import { useViewMode } from './hooks/useViewMode';
import { addResourcesFromSelectedFiles } from './services/resourceService';
import { SelectedResourceFileType, SortField, SortOrder, ViewMode } from './types';
import { ALL_TAG_VALUE, typeOptions } from './utils/constants';

const ResourcePage: React.FC = () => {
  // 当前页面不再提供空间切换，始终使用"当前选中的默认空间"进行筛选
  const [wsFilter, setWsFilter] = useState<string | undefined>(undefined);
  const [tagFilter, setTagFilter] = useState<string>(''); // '' means all
  const [typeFilter, setTypeFilter] = useState<string[]>([]); // empty means all types
  const [favoriteFilter, setFavoriteFilter] = useState<boolean>(false); // false means all, true means favorites only
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('collectedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [folderFilter, setFolderFilter] = useState<string>(''); // '' 表示全部
  const folderRestoredRef = useRef<string>(''); // 记录已恢复的工作空间ID
  const folderAPI: any = window.YUA?.folder;

  const [workspaces, setWorkspaces] = useState<any[]>([]);

  const [uploadProgress, setUploadProgress] = useState<{
    visible: boolean;
    current: number;
    total: number;
    percent: number;
  }>({ visible: false, current: 0, total: 0, percent: 0 });

  // 使用自定义 hooks
  const { list, setList, tags, folders, setFolders, load, loadTags, loadFolders } = useResourceData(wsFilter, tagFilter);

  const currentFolderResourceIds = useMemo(() => {
    if (!folderFilter) return [] as string[];
    return list.filter((r) => (r as any).folderId === folderFilter).map((r) => r.id);
  }, [list, folderFilter]);

  const { viewMode, handleViewModeChange } = useViewMode(folderFilter, currentFolderResourceIds);

  const { filtered } = useResourceFilter({
    list,
    wsFilter,
    tagFilter,
    folderFilter,
    typeFilter,
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

  const {
    renameOpen,
    setRenameOpen,
    renameId,
    renameName,
    setRenameName,
    handleMoveFolder,
    handleOpenFolderLocation,
    handleRenameFolder,
    handleDeleteFolder,
    handleMoveResourcesToFolder,
    handleRenameConfirm
  } = useFolderOperations(folders, wsFilter, folderFilter, setFolderFilter, list, load, loadFolders);

  const onDropFiles = useCallback(
    async (files: SelectedResourceFileType[]) => {
      if (!files || files.length === 0) return;
      setUploadProgress({ visible: true, current: 0, total: files.length, percent: 0 });
      try {
        await addResourcesFromSelectedFiles(
          files,
          {
            folderId: folderFilter || undefined,
            workspaceId: wsFilter || undefined
          },
          (current, total, percent) => {
            setUploadProgress({ visible: true, current: current + 1, total, percent });
          }
        );
        toast.success('已添加拖拽的文件');
        await load();
        await loadFolders(wsFilter || undefined);
      } catch (err) {
        console.error('处理拖拽失败', err);
        toast.error('添加失败');
      } finally {
        setUploadProgress((prev) => ({ ...prev, visible: false }));
      }
    },
    [folderFilter, wsFilter, load, loadFolders]
  );

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

  const visibleTypes = useMemo(() => {
    if (!wsFilter) return new Set<string>();
    const rows = list.filter((r: any) => r.workspaceId === wsFilter);
    const set = new Set<string>();
    for (const r of rows) {
      if (r?.type) set.add(r.type);
    }
    return set;
  }, [list, wsFilter]);

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
    if (typeFilter.length > 0) return [] as UIFolder[];
    if (!wsFilter) return [] as UIFolder[];
    const parent = (folderFilter || null) as string | null;
    return folders.filter((f) => f.workspaceId === wsFilter && (f.parentId || null) === parent);
  }, [folders, wsFilter, folderFilter, favoriteFilter, typeFilter]);

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
        title={
          <span className="flex items-center gap-4">
            <span>📚 资源库</span>
          </span>
        }
        center={
          <div className="relative no-drag">
            <TbSearch className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input placeholder="搜索资源..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 h-8 w-80" />
          </div>
        }
        actions={
          <>
            <div className="flex items-center gap-2">
              <Tabs value={viewMode} onValueChange={(value) => handleViewModeChange(value as ViewMode)}>
                <TabsList className="w-full">
                  <TabsTrigger value="grid" className="flex-1 gap-1">
                    <TbGrid3X3 />
                  </TabsTrigger>
                  <TabsTrigger value="list" className="flex-1 gap-1">
                    <TbList />
                  </TabsTrigger>
                  {/* <TabsTrigger value="free" className="flex-1 gap-1">
                    <TbLayout2 />
                  </TabsTrigger> */}
                </TabsList>
              </Tabs>
              {/* 资源数量统计移至底部路径栏 */}
              <Button
                size="icon"
                className="w-8 h-8 shrink-0"
                variant="ghost"
                onClick={() => {
                  load();
                  loadTags();
                }}
              >
                <TbRefresh />
              </Button>

              <Button size="icon" className="w-8 h-8 shrink-0" variant="ghost">
                <TbRobot />
              </Button>
              {/* 综合筛选弹出层 */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="icon" className="w-8 h-8 shrink-0" variant="ghost">
                    <TbFilter />
                  </Button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="end" className="w-80 p-3 space-y-4">
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">资源类型</div>
                    <div className="grid grid-cols-3 gap-2">
                      {typeOptions
                        .filter(({ key }) => key === '' || visibleTypes.has(key))
                        .map(({ key, label, icon: Icon }) => {
                          const isAll = key === '';
                          const isSelected = isAll ? typeFilter.length === 0 : typeFilter.includes(key);
                          return (
                            <Button
                              key={key || 'all'}
                              variant={isSelected ? 'default' : 'outline'}
                              size="sm"
                              className="h-8 justify-start px-2"
                              onClick={() => {
                                if (isAll) {
                                  setTypeFilter([]);
                                  setFavoriteFilter(false);
                                } else {
                                  const next = typeFilter.includes(key) ? typeFilter.filter((k) => k !== key) : [...typeFilter, key];
                                  setTypeFilter(next);
                                  if (next.length > 0) {
                                    setFolderFilter('');
                                    setFavoriteFilter(false);
                                  }
                                }
                              }}
                            >
                              <Icon className="mr-2 h-4 w-4" />
                              {label}
                            </Button>
                          );
                        })}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">标签筛选</div>
                    <Select
                      value={tagFilter === '' ? ALL_TAG_VALUE : tagFilter}
                      onValueChange={(v) => {
                        const next = v === ALL_TAG_VALUE ? '' : v;
                        setTagFilter(next);
                        setTimeout(() => load(), 0);
                      }}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="全部标签" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem key="__all" value={ALL_TAG_VALUE}>
                          全部标签
                        </SelectItem>
                        {tags.map((t) => (
                          <SelectItem key={t.tag} value={t.tag}>
                            {t.tag}（{t.count}）
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">资源排序</div>
                    <Select
                      value={`${sortField}-${sortOrder}`}
                      onValueChange={(value) => {
                        const [field, order] = value.split('-') as [SortField, SortOrder];
                        setSortField(field);
                        setSortOrder(order);
                      }}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="collectedAt-desc">收集时间 ↓</SelectItem>
                        <SelectItem value="collectedAt-asc">收集时间 ↑</SelectItem>
                        <SelectItem value="title-asc">标题 A-Z</SelectItem>
                        <SelectItem value="title-desc">标题 Z-A</SelectItem>
                        <SelectItem value="sizeBytes-desc">文件大小 ↓</SelectItem>
                        <SelectItem value="sizeBytes-asc">文件大小 ↑</SelectItem>
                        <SelectItem value="rating-desc">评分 ↓</SelectItem>
                        <SelectItem value="rating-asc">评分 ↑</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </>
        }
      />

      {/* 主内容区域 */}
      <SidebarProvider style={{ height: 'calc(100% - 36px)', minHeight: 'unset' }}>
        <Sidebar collapsible="none" className="h-full w-80 bg-sidebar">
          <SidebarHeader>
            <WorkspaceSwitcher workspaces={workspaces} currentWorkspaceId={wsFilter} />
            <SidebarMenu className="pl-0">
              {/* 收藏筛选按钮 - 只在存在收藏内容时显示 */}
              {hasFavorites && (
                <SidebarMenuItem
                  key={'favorite'}
                  onClick={() => {
                    if (favoriteFilter) {
                      // 如果当前是收藏模式，点击后取消收藏筛选
                      setFavoriteFilter(false);
                    } else {
                      // 如果当前不是收藏模式，点击后进入收藏模式
                      // 如果当前选择的是"全部"类型，则取消类型筛选
                      setFavoriteFilter(true);
                      setFolderFilter(''); // 取消文件夹选中状态
                      if (typeFilter.length === 0) {
                        setTypeFilter([]);
                      }
                    }
                  }}
                >
                  <SidebarMenuButton
                    variant={favoriteFilter ? 'outline' : 'default'}
                    className={`h-8 transition-colors ${favoriteFilter ? 'bg-red-500 hover:bg-red-600 text-white' : 'hover:text-red-500 hover:bg-red-50'}`}
                  >
                    <TbHeart className={`${favoriteFilter ? 'fill-current' : ''}`} />
                    星标
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem key={'tasks'}>
                <SidebarMenuButton>
                  <TbFilter />
                  任务
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem
                key={'settings'}
                onClick={() => {
                  window.YUA.window['window:open']('settings');
                }}
              >
                <SidebarMenuButton>
                  <TbSettings />
                  设置
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarHeader>
          {/* 左侧文件夹 */}
          <SidebarContent>
            <FolderSidebar
              folders={folders}
              selectedId={folderFilter || undefined}
              onSelect={(id) => {
                const folderId = id as string;
                setFolderFilter(folderId);
                saveCurrentFolder(folderId);
                setFavoriteFilter(false);
                setTypeFilter([]);
              }}
              counts={folderCounts}
              allCount={allCount}
              workspaceId={wsFilter}
              onDropResources={async (folderId, ids) => {
                await handleMoveResourcesToFolder(folderId, ids);
              }}
              onMoveFolder={handleMoveFolder}
              onCreate={async (parentId) => {
                try {
                  const d = new Date();
                  const name = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                  const wsId = wsFilter || undefined;
                  const res = await folderAPI['folder.create']({ name, parentId: parentId ?? (folderFilter || null), workspaceId: wsId });
                  if ((res as any)?.success) {
                    await loadFolders(wsId);
                    return (res as any)?.data?.id;
                  }
                  return undefined;
                } catch (e) {
                  console.warn('create folder failed', e);
                  return undefined;
                }
              }}
              onInlineRename={async (id, name) => {
                try {
                  const wsId = wsFilter || undefined;
                  const r = await folderAPI['folder.rename']({ id, name });
                  if ((r as any)?.success) {
                    await loadFolders(wsId);
                  }
                } catch (e) {
                  console.warn('inline rename folder failed', e);
                }
              }}
              onRename={handleRenameFolder}
              onDelete={handleDeleteFolder}
            />
          </SidebarContent>
          <SidebarFooter>
            <Button className="w-full" variant="ghost" onClick={() => window.YUA.window['window:open']('recycle')}>
              <TbTrash />
              回收站
            </Button>
          </SidebarFooter>
        </Sidebar>
        {/* 资源展示区域 */}
        <div className="w-full h-full" style={{ height: 'calc(100% - 36px)' }}>
          <Dropzone
            className="w-full h-full overflow-y-auto relative"
            onDropFiles={onDropFiles}
            customDropzoneInside={<div className="px-5 py-3 rounded-lg border-2 border-dashed border-primary/60 bg-primary/5 text-primary text-sm font-medium">释放鼠标即可添加文件…</div>}
          >
            {uploadProgress.visible && (
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-40 bg-background/95 backdrop-blur border shadow-lg rounded-lg p-4 w-80 flex flex-col gap-2">
                <div className="flex justify-between text-sm font-medium">
                  <span>
                    正在上传 ({uploadProgress.current}/{uploadProgress.total})
                  </span>
                  <span>{Math.round(uploadProgress.percent)}%</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full bg-primary" style={{ width: `${uploadProgress.percent}%` }} />
                </div>
              </div>
            )}

            {childFolders.length === 0 && filtered.length === 0 ? null : viewMode === 'grid' ? (
              <ExplorerGrid
                items={filtered}
                folders={childFolders}
                counts={folderCounts}
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
                onDelete={handleDelete}
                onDeleteMany={handleDeleteMany}
                onToggleFavorite={handleToggleFavorite}
                onToggleVisibility={handleToggleVisibility}
              />
            ) : viewMode === 'list' ? (
              <ExplorerList
                items={filtered}
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
                items={filtered}
                folderId={folderFilter || undefined}
                selectedItems={selectedItems}
                onItemClick={handleItemClick}
                onToggleFavorite={handleToggleFavorite}
                onToggleVisibility={handleToggleVisibility}
                onPreview={(item, index) => {
                  window.YUA.window['window:open']('resourcePreview', {
                    current: item,
                    list: filtered,
                    index
                  });
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
            {childFolders.length === 0 && filtered.length === 0 ? (
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

          {/* 底部路径与统计栏（固定在右侧列表底部） */}
          <div className="px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 text-muted-foreground flex-wrap">
              <span
                className={`cursor-pointer hover:underline ${folderFilter ? 'text-primary' : 'text-foreground'} `}
                onClick={() => {
                  setFolderFilter('');
                  saveCurrentFolder('');
                  setFavoriteFilter(false);
                  setTypeFilter([]);
                }}
              >
                全部
              </span>
              {currentFolderPath.map((f) => (
                <React.Fragment key={f.id}>
                  <span className="mx-1 text-muted-foreground">/</span>
                  <span
                    className="cursor-pointer hover:underline text-foreground"
                    onClick={() => {
                      setFolderFilter(f.id);
                      saveCurrentFolder(f.id);
                      setFavoriteFilter(false);
                      setTypeFilter([]);
                    }}
                  >
                    {f.name}
                  </span>
                </React.Fragment>
              ))}
            </div>
            {/* 选中项操作栏（保留位置，排序与视图模式已移入 Popover） */}
            {selectedItems.size > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-primary">已选择 {selectedItems.size} 个项目</span>
                  <TbTrash onClick={() => handleDeleteMany(Array.from(selectedItems))} />
                  <TbX onClick={() => setSelectedItems(new Set())} />
                </div>
              </div>
            )}
            <div className="text-muted-foreground whitespace-nowrap">
              <span>
                共 {filtered.length}/{list.length} 个资源
              </span>
            </div>
          </div>
        </div>
      </SidebarProvider>

      {/* 重命名文件夹模态框 */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>重命名文件夹</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input value={renameName} onChange={(e) => setRenameName(e.target.value)} placeholder="输入新名称" />
          </div>
          <DialogFooter>
            <Button size="sm" variant="outline" onClick={() => setRenameOpen(false)}>
              取消
            </Button>
            <Button size="sm" onClick={handleRenameConfirm}>
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ResourcePage;
