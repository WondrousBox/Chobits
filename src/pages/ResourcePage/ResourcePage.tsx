import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TbFilter, TbGrid3X3, TbHeart, TbLayout2, TbList, TbRefresh, TbRobot, TbSearch, TbTrash, TbX } from 'react-icons/tb';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from '@/components/ui/sidebar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DefaultEmptyFolder from '@/pages/ResourcePage/components/DefaultEmptyFolder';
import { SortField, SortOrder, ViewMode } from '@/types';

import ExplorerFreeLayout from './components/ExplorerFreeLayout';
import ExplorerGrid from './components/ExplorerGrid';
import ExplorerList from './components/ExplorerList';
import FolderSidebar, { type UIFolder } from './components/FolderSidebar';
import { useFolderOperations } from './hooks/useFolderOperations';
import { useResourceData } from './hooks/useResourceData';
import { useResourceFilter } from './hooks/useResourceFilter';
import { useResourceOperations } from './hooks/useResourceOperations';
import { useViewMode } from './hooks/useViewMode';
import { ALL_TAG_VALUE, typeOptions } from './utils/constants';

const ResourcePage: React.FC = () => {
  // 当前页面不再提供空间切换，始终使用"当前选中的默认空间"进行筛选
  const [wsFilter, setWsFilter] = useState<string | undefined>(undefined);
  const [tagFilter, setTagFilter] = useState<string>(''); // '' means all
  const [typeFilter, setTypeFilter] = useState<string>(''); // empty means all types
  const [favoriteFilter, setFavoriteFilter] = useState<boolean>(false); // false means all, true means favorites only
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('collectedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [folderFilter, setFolderFilter] = useState<string>(''); // '' 表示全部
  const folderRestoredRef = useRef<string>(''); // 记录已恢复的工作空间ID
  const folderAPI: any = window.YUA?.folder;

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

  // 初始化默认工作空间
  useEffect(() => {
    let mounted = true;
    (async () => {
      const ws = await window.YUA.workspace['workspace:list']({ filter: { deletedAt: 0 }, limit: 100, offset: 0 });
      if (mounted) {
        try {
          const defaultId = Array.isArray(ws) ? ws.find((w: any) => w.isDefault === 1)?.id : undefined;
          if (!wsFilter && defaultId) setWsFilter(defaultId);
          if (defaultId) {
            // 预加载当前默认空间的文件夹与标签
            loadFolders(defaultId);
            loadTags(defaultId);
          }
        } catch {
          /* noop */
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [loadFolders, loadTags, wsFilter]);

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
    if (!wsFilter) return [] as UIFolder[];
    const parent = (folderFilter || null) as string | null;
    return folders.filter((f) => f.workspaceId === wsFilter && (f.parentId || null) === parent);
  }, [folders, wsFilter, folderFilter]);

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
                  <TabsTrigger value="free" className="flex-1 gap-1">
                    <TbLayout2 />
                  </TabsTrigger>
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
            <SidebarMenu className="pl-0">
              {typeOptions
                .filter(({ key }) => key === '' || visibleTypes.has(key))
                .map(({ key, label, icon: Icon }) => (
                  <SidebarMenuItem
                    className="pl-0 list-none h-8"
                    key={key || 'all'}
                    onClick={() => {
                      if (key === '') {
                        // 点击"全部"时，取消收藏筛选
                        setFavoriteFilter(false);
                        setTypeFilter('');
                      } else {
                        // 点击其他类型时，只设置类型筛选，不与收藏筛选冲突
                        setTypeFilter((prev) => (prev === key ? '' : key));
                      }
                    }}
                  >
                    <SidebarMenuButton isActive={typeFilter === key && !(favoriteFilter && key === '')} variant={typeFilter === key && !(favoriteFilter && key === '') ? 'outline' : 'default'}>
                      <Icon />
                      {label}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}

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
                      if (typeFilter === '') {
                        setTypeFilter('');
                      }
                    }
                  }}
                >
                  <SidebarMenuButton
                    variant={favoriteFilter ? 'outline' : 'default'}
                    className={`h-8 transition-colors ${favoriteFilter ? 'bg-red-500 hover:bg-red-600 text-white' : 'hover:text-red-500 hover:bg-red-50'}`}
                  >
                    <TbHeart className={`${favoriteFilter ? 'fill-current' : ''}`} />
                    只显示收藏
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
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
          <div className="w-full h-full overflow-y-auto">
            {childFolders.length === 0 && filtered.length === 0 ? null : viewMode === 'grid' ? (
              <ExplorerGrid
                items={filtered}
                folders={childFolders}
                counts={folderCounts}
                onOpenFolder={(id) => {
                  setFolderFilter(id);
                  saveCurrentFolder(id);
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
          </div>

          {/* 底部路径与统计栏（固定在右侧列表底部） */}
          <div className="px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 text-muted-foreground flex-wrap">
              <span
                className={`cursor-pointer hover:underline ${folderFilter ? 'text-primary' : 'text-foreground'} `}
                onClick={() => {
                  setFolderFilter('');
                  saveCurrentFolder('');
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
