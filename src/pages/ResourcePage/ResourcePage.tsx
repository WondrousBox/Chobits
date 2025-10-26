import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ResourceItem, ViewMode, SortField, SortOrder } from '@/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ExplorerGrid from './components/ExplorerGrid';
import ResourceListItem from './components/ResourceListItem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TbHome, TbPhoto, TbVideo, TbMusic, TbFileText, TbLink, TbFile, TbFileDescription, TbDots, TbList, TbSearch, TbGrid3X3, TbPlus, TbRefresh, TbHeart } from 'react-icons/tb';
import DragAbleTitle from '@/components/common/DragAbleTitle';
import FolderSidebar, { type UIFolder } from './components/FolderSidebar';

const ResourcePage: React.FC = () => {
  const [list, setList] = useState<ResourceItem[]>([]);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [wsFilter, setWsFilter] = useState<string>(''); // empty means all
  const [tags, setTags] = useState<Array<{ tag: string; count: number }>>([]);
  const [tagFilter, setTagFilter] = useState<string>(''); // '' means all
  const [typeFilter, setTypeFilter] = useState<string>(''); // empty means all types
  const [favoriteFilter, setFavoriteFilter] = useState<boolean>(false); // false means all, true means favorites only
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<SortField>('collectedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [folders, setFolders] = useState<UIFolder[]>([]);
  const [folderFilter, setFolderFilter] = useState<string>(''); // '' 表示全部
  const folderAPI: any = (window as any).YUA?.folder;
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameId, setRenameId] = useState<string>('');
  const [renameName, setRenameName] = useState<string>('');
  // Radix Select: SelectItem value cannot be an empty string
  const ALL_TAG_VALUE = '__all__';

  const typeOptions: { key: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { key: '', label: '全部', icon: TbHome },
    { key: 'image', label: '图片', icon: TbPhoto },
    { key: 'video', label: '视频', icon: TbVideo },
    { key: 'audio', label: '音频', icon: TbMusic },
    { key: 'text', label: '文本', icon: TbFileText },
    { key: 'link', label: '链接', icon: TbLink },
    { key: 'file', label: '文件', icon: TbFile },
    { key: 'document', label: '文档', icon: TbFileDescription },
    { key: 'other', label: '其他', icon: TbDots }
  ];

  const visibleTypes = useMemo(() => {
    const rows = list.filter((r: any) => !wsFilter || r.workspaceId === wsFilter);
    const set = new Set<string>();
    for (const r of rows) {
      if (r?.type) set.add(r.type);
    }
    return set;
  }, [list, wsFilter]);

  const hasFavorites = useMemo(() => {
    const rows = list.filter((r: any) => !wsFilter || r.workspaceId === wsFilter);
    return rows.some((r: any) => r.favorite === 1);
  }, [list, wsFilter]);

  const load = useCallback(async (): Promise<void> => {
    try {
      let rows: any[] = [];
      if (tagFilter) {
        rows = await window.YUA.resource['listResourcesByTag']({ tag: tagFilter, workspaceId: wsFilter || undefined, includeDeleted: false, limit: 1000, offset: 0 });
      } else {
        rows = await window.YUA.resource['resource:list']();
      }
      setList(rows || []);
    } catch (e) {
      console.warn('load resources failed', e);
    }
  }, [tagFilter, wsFilter]);

  const loadTags = useCallback(
    async (workspaceId?: string): Promise<void> => {
      try {
        const wsId = workspaceId || wsFilter || undefined;
        const rows = await window.YUA.resource['tags:listAll']({ workspaceId: wsId, scope: 'workspace' });
        setTags(rows || []);
      } catch (e) {
        console.warn('load tags failed', e);
      }
    },
    [wsFilter]
  );

  const loadFolders = useCallback(
    async (workspaceId?: string): Promise<void> => {
      try {
        const wsId = workspaceId || wsFilter || undefined;
        const rows = await folderAPI['folder.list']({ workspaceId: wsId, deletedAt: 0 });
        setFolders((rows || []).map((r: any) => ({ id: r.id, name: r.name, parentId: r.parentId || null })));
      } catch (e) {
        console.warn('load folders failed', e);
      }
    },
    [folderAPI, wsFilter]
  );

  useEffect(() => {
    load();
    loadFolders();
    loadTags();
  }, [load, loadFolders, loadTags]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const ws = await window.YUA.workspace['workspace:list']({ filter: { deletedAt: 0 }, limit: 100, offset: 0 });
      if (mounted) {
        setWorkspaces(ws || []);
        try {
          const defaultId = Array.isArray(ws) ? ws.find((w: any) => w.isDefault === 1)?.id : undefined;
          if (!wsFilter && defaultId) setWsFilter(defaultId);
          if (defaultId) {
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

  const filtered = useMemo(() => {
    let filtered = list.filter((r: any) => !wsFilter || r.workspaceId === wsFilter);
    // 标签过滤（当后端按标签查询时，这里也保持二次防御）
    if (tagFilter) {
      filtered = filtered.filter((r: any) => (r.tags || '').includes(tagFilter));
    }
    if (folderFilter) filtered = filtered.filter((r: any) => (r as any).folderId === folderFilter);

    // 类型过滤
    if (typeFilter) {
      filtered = filtered.filter((r: any) => r.type === typeFilter);
    }

    // 收藏过滤
    if (favoriteFilter) {
      filtered = filtered.filter((r: any) => r.favorite === 1);
    }

    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r: any) =>
          r.title?.toLowerCase().includes(query) ||
          r.description?.toLowerCase().includes(query) ||
          r.authorName?.toLowerCase().includes(query) ||
          r.sourceName?.toLowerCase().includes(query) ||
          r.domain?.toLowerCase().includes(query) ||
          r.tags?.toLowerCase().includes(query)
      );
    }

    // 排序
    filtered.sort((a: any, b: any) => {
      let aValue = a[sortField];
      let bValue = b[sortField];

      // 处理时间字段
      if (sortField === 'collectedAt' || sortField === 'createdAt') {
        aValue = aValue || 0;
        bValue = bValue || 0;
      }

      // 处理字符串字段
      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = (bValue || '').toLowerCase();
      }

      if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return filtered;
  }, [list, wsFilter, typeFilter, favoriteFilter, searchQuery, sortField, sortOrder, folderFilter, tagFilter]);

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await window.YUA.resource.deleteResource({ id });
      setList((prev) => prev.filter((i) => i.id !== id));

      // 如果当前在收藏模式下，且删除后没有收藏内容了，自动切换到非收藏模式
      if (favoriteFilter) {
        const remainingFavorites = list.filter((i) => i.id !== id && i.favorite === 1);
        if (remainingFavorites.length === 0) {
          setFavoriteFilter(false);
        }
      }
    } catch (e) {
      console.warn('delete resource failed', e);
    }
  };

  const handleDeleteMany = async (ids: string[]): Promise<void> => {
    try {
      await window.YUA.resource.deleteResources({ ids });
      setList((prev) => prev.filter((i) => !ids.includes(i.id)));
      setSelectedItems(new Set());

      // 如果当前在收藏模式下，且删除后没有收藏内容了，自动切换到非收藏模式
      if (favoriteFilter) {
        const remainingFavorites = list.filter((i) => !ids.includes(i.id) && i.favorite === 1);
        if (remainingFavorites.length === 0) {
          setFavoriteFilter(false);
        }
      }
    } catch (e) {
      console.warn('delete many failed', e);
    }
  };

  const handleItemClick = (e: React.MouseEvent, item: ResourceItem): void => {
    if (e.ctrlKey || e.metaKey) {
      // 多选模式
      setSelectedItems((prev) => {
        const newSet = new Set(prev);
        if (newSet.has(item.id)) {
          newSet.delete(item.id);
        } else {
          newSet.add(item.id);
        }
        return newSet;
      });
    } else {
      // 单选模式
      setSelectedItems(new Set([item.id]));
    }
  };

  const handleToggleFavorite = async (id: string): Promise<void> => {
    try {
      const item = list.find((i) => i.id === id);
      if (item) {
        const newFavorite = item.favorite === 1 ? 0 : 1;
        await window.YUA.resource.updateResource({ id, patch: { favorite: newFavorite } });
        setList((prev) => prev.map((i) => (i.id === id ? { ...i, favorite: newFavorite } : i)));

        // 如果当前在收藏模式下，且取消收藏后没有收藏内容了，自动切换到非收藏模式
        if (favoriteFilter && newFavorite === 0) {
          const remainingFavorites = list.filter((i) => i.id !== id && i.favorite === 1);
          if (remainingFavorites.length === 0) {
            setFavoriteFilter(false);
          }
        }
      }
    } catch (e) {
      console.warn('toggle favorite failed', e);
    }
  };

  const handleToggleVisibility = async (id: string): Promise<void> => {
    try {
      const item = list.find((i) => i.id === id);
      if (item) {
        const newVisibility = item.visibility === 'public' ? 'private' : 'public';
        await window.YUA.resource.updateResource({ id, patch: { visibility: newVisibility } });
        setList((prev) => prev.map((i) => (i.id === id ? { ...i, visibility: newVisibility } : i)));
      }
    } catch (e) {
      console.warn('toggle visibility failed', e);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <DragAbleTitle
        title={
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold">资源库</h1>
            <span className="text-sm text-muted-foreground">
              共 {filtered.length}/{list.length} 个资源
            </span>
          </div>
        }
        actions={
          <>
            <div className="flex items-center gap-2">
              <Button size="icon" className="w-8 h-8" onClick={() => window.YUA.window.openWindow('assistant')}>
                <TbPlus />
              </Button>
              <Button
                size="icon"
                className="w-8 h-8"
                variant="ghost"
                onClick={() => {
                  load();
                  loadTags();
                }}
              >
                <TbRefresh />
              </Button>

              {/* 搜索框 */}
              <div className="relative">
                <TbSearch className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input placeholder="搜索资源..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 h-8 w-40" />
              </div>

              {/* 工作空间选择器 */}
              <Select value={wsFilter} onValueChange={setWsFilter}>
                <SelectTrigger className="w-40 h-8">
                  <SelectValue placeholder="工作空间" />
                </SelectTrigger>
                <SelectContent>
                  {workspaces.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}
                      {w.isDefault === 1 ? '（默认）' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* 标签筛选器 */}
              <Select
                value={tagFilter === '' ? ALL_TAG_VALUE : tagFilter}
                onValueChange={(v) => {
                  const next = v === ALL_TAG_VALUE ? '' : v;
                  setTagFilter(next);
                  // 切换标签时重新加载
                  setTimeout(() => load(), 0);
                }}
              >
                <SelectTrigger className="w-56 h-8">
                  <SelectValue placeholder="标签（全部）" />
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
          </>
        }
      />

      {/* 类型过滤器 */}
      <div className="flex items-center justify-between gap-2 p-2 border-b bg-muted/30">
        <div className="flex items-center gap-1">
          {typeOptions
            .filter(({ key }) => key === '' || visibleTypes.has(key))
            .map(({ key, label, icon: Icon }) => (
              <Button
                key={key || 'all'}
                variant={typeFilter === key && !(favoriteFilter && key === '') ? 'default' : 'outline'}
                size="sm"
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
                className="h-8"
              >
                <Icon />
                {label}
              </Button>
            ))}

          <Select
            value={`${sortField}-${sortOrder}`}
            onValueChange={(value) => {
              const [field, order] = value.split('-') as [SortField, SortOrder];
              setSortField(field);
              setSortOrder(order);
            }}
          >
            <SelectTrigger className="w-40 h-8">
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

        {/* 选中项操作栏 */}
        {selectedItems.size > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-primary">已选择 {selectedItems.size} 个项目</span>
            <div className="flex items-center gap-2">
              <Button variant="destructive" size="sm" onClick={() => handleDeleteMany(Array.from(selectedItems))}>
                删除选中
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSelectedItems(new Set())}>
                取消选择
              </Button>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* 收藏筛选按钮 - 只在存在收藏内容时显示 */}
          {hasFavorites && (
            <Button
              variant={favoriteFilter ? 'default' : 'outline'}
              size="sm"
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
              className={`h-8 transition-colors ${favoriteFilter ? 'bg-red-500 hover:bg-red-600 text-white' : 'hover:text-red-500 hover:bg-red-50'}`}
            >
              <TbHeart className={`w-4 h-4 ${favoriteFilter ? 'fill-current' : ''}`} />
              收藏
            </Button>
          )}
          <div className="flex border rounded-md">
            <Button className="w-8 h-8" variant={viewMode === 'grid' ? 'default' : 'ghost'} size="icon" onClick={() => setViewMode('grid')}>
              <TbGrid3X3 />
            </Button>
            <Button className="w-8 h-8" variant={viewMode === 'list' ? 'default' : 'ghost'} size="icon" onClick={() => setViewMode('list')}>
              <TbList />
            </Button>
          </div>
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="flex-1 overflow-hidden flex">
        {/* 左侧文件夹 */}
        <FolderSidebar
          folders={folders}
          selectedId={folderFilter || undefined}
          onSelect={(id) => setFolderFilter(id as string)}
          onCreate={async () => {
            try {
              const d = new Date();
              const name = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
              const wsId = wsFilter || undefined;
              const res = await folderAPI['folder.create']({ name, parentId: folderFilter || null, workspaceId: wsId });
              if ((res as any)?.success) {
                await loadFolders(wsId);
              }
            } catch (e) {
              console.warn('create folder failed', e);
            }
          }}
          onRename={async (id) => {
            try {
              const f = folders.find((f) => f.id === id);
              setRenameId(id);
              setRenameName(f?.name || '');
              setRenameOpen(true);
            } catch (e) {
              console.warn('open rename modal failed', e);
            }
          }}
          onDelete={async (id) => {
            try {
              if (!confirm('删除该文件夹？（不影响已存在的资源文件）')) return;
              const r = await folderAPI['folder.softDelete']({ ids: [id] });
              if ((r as any)?.success) {
                if (folderFilter === id) setFolderFilter('');
                await loadFolders(wsFilter || undefined);
              }
            } catch (e) {
              console.warn('delete folder failed', e);
            }
          }}
        />
        {/* 资源展示区域 */}
        <div className="h-full overflow-auto flex-1">
          {viewMode === 'grid' ? (
            <ExplorerGrid items={filtered} onDelete={handleDelete} onDeleteMany={handleDeleteMany} onToggleFavorite={handleToggleFavorite} onToggleVisibility={handleToggleVisibility} />
          ) : (
            <div className="space-y-2">
              {filtered.map((item) => (
                <ResourceListItem
                  key={item.id}
                  item={item}
                  selected={selectedItems.has(item.id)}
                  onClick={handleItemClick}
                  onToggleFavorite={handleToggleFavorite}
                  onToggleVisibility={handleToggleVisibility}
                />
              ))}
              {filtered.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <div className="text-4xl mb-4">📦</div>
                  <div>没有找到资源</div>
                  <div className="text-sm mt-2">尝试调整筛选条件或添加新资源</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

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
            <Button
              size="sm"
              onClick={async () => {
                try {
                  const name = renameName.trim();
                  if (!renameId || !name) {
                    setRenameOpen(false);
                    return;
                  }
                  const r = await folderAPI['folder.rename']({ id: renameId, name });
                  if ((r as any)?.success) await loadFolders(wsFilter || undefined);
                } catch (e) {
                  console.warn('rename folder failed', e);
                } finally {
                  setRenameOpen(false);
                  setRenameId('');
                  setRenameName('');
                }
              }}
            >
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ResourcePage;
