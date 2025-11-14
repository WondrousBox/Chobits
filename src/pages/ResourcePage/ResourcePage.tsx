import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  TbDots,
  TbFile,
  TbFileDescription,
  TbFilter,
  TbFolderFilled,
  TbFolderOpen,
  TbGrid3X3,
  TbHeart,
  TbHome,
  TbLetterT,
  TbLink,
  TbList,
  TbMusic,
  TbPencil,
  TbPhoto,
  TbRefresh,
  TbRobot,
  TbSearch,
  TbTrash,
  TbVideo,
  TbX
} from 'react-icons/tb';
import { toast } from 'sonner';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ResourceItem, SortField, SortOrder, ViewMode } from '@/types';

import ExplorerGrid from './components/ExplorerGrid';
import FolderSidebar, { type UIFolder } from './components/FolderSidebar';
import ResourceListItem from './components/ResourceListItem';

const ResourcePage: React.FC = () => {
  const [list, setList] = useState<ResourceItem[]>([]);
  // 当前页面不再提供空间切换，始终使用“当前选中的默认空间”进行筛选
  const [wsFilter, setWsFilter] = useState<string | undefined>(undefined);
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
  const folderAPI: any = window.YUA?.folder;
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
    { key: 'text', label: '文本', icon: TbLetterT },
    { key: 'link', label: '链接', icon: TbLink },
    { key: 'file', label: '文件', icon: TbFile },
    { key: 'document', label: '文档', icon: TbFileDescription },
    { key: 'other', label: '其他', icon: TbDots }
  ];

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
        setFolders((rows || []).map((r: any) => ({ id: r.id, name: r.name, parentId: r.parentId || null, workspaceId: r.workspaceId })));
      } catch (e) {
        console.warn('load folders failed', e);
      }
    },
    [folderAPI, wsFilter]
  );

  // 在拿到默认空间后再加载数据，避免展示其它空间的数据
  useEffect(() => {
    if (!wsFilter) return;
    load();
    loadFolders();
    loadTags();
  }, [wsFilter, load, loadFolders, loadTags]);

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

  // 监听主进程的资源变更事件：新增后自动刷新列表/标签/文件夹计数
  useEffect(() => {
    const onResourceChanged = (): void => {
      // 简单刷新，保持与当前筛选一致
      load();
      loadTags();
      loadFolders();
    };
    try {
      window.ipcRenderer.on('resource:inserted', onResourceChanged);
      window.ipcRenderer.on('resource:changed', onResourceChanged);
    } catch {
      /* ignore */
    }
    return () => {
      try {
        window.ipcRenderer.off('resource:inserted', onResourceChanged);
        window.ipcRenderer.off('resource:changed', onResourceChanged);
      } catch {
        /* ignore */
      }
    };
  }, [load, loadTags, loadFolders]);

  const filtered = useMemo(() => {
    if (!wsFilter) return [] as any[];
    let filtered = list.filter((r: any) => r.workspaceId === wsFilter);
    // 标签过滤（当后端按标签查询时，这里也保持二次防御）
    if (tagFilter) {
      filtered = filtered.filter((r: any) => (r.tags || '').includes(tagFilter));
    }
    // 文件夹过滤：当选择具体文件夹时，仅展示该文件夹内资源；当选择“全部”时，仅展示未归属任何文件夹的顶层资源
    if (folderFilter) {
      filtered = filtered.filter((r: any) => (r as any).folderId === folderFilter);
    } else {
      filtered = filtered.filter((r: any) => !(r as any).folderId);
    }

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

  // 移动文件夹（供侧边栏、网格与列表复用）
  const handleMoveFolder = useCallback(
    async (id: string, newParentId: string | null) => {
      const cur = folders.find((f) => f.id === id);
      if (!cur) return;
      const targetPid = newParentId ?? null;
      const curPid = cur.parentId ?? null;
      if (curPid === targetPid) return;
      // 如果主进程执行失败（例如 UNIQUE 约束），invoke 会 reject，让上层捕获并提示
      const r = await folderAPI['folder.move']({ id, parentId: targetPid });
      if (!(r as any)?.success) {
        throw new Error('folder-move-failed');
      }
      await loadFolders(wsFilter || undefined);
    },
    [folders, folderAPI, loadFolders, wsFilter]
  );

  // 打开文件夹所在位置
  const handleOpenFolderLocation = useCallback(async (id: string) => {
    try {
      const ws = await (window as any).YUA?.workspace['workspace:getDefault']();
      const isWin = (window as any).YUA?.isWindows;
      const sep = isWin ? '\\' : '/';
      const base: string = ws?.rootPath || '';
      if (!base) return;
      const needsSep = base.endsWith(sep) ? '' : sep;
      const folderPath = `${base}${needsSep}resources${sep}folders${sep}${id}`;
      await (window as any).YUA?.file['file:openPath'](folderPath);
    } catch (err) {
      console.warn('open folder path failed', err);
    }
  }, []);

  // 弹出重命名窗口
  const handleRenameFolder = useCallback(
    (id: string) => {
      const f = folders.find((f) => f.id === id);
      setRenameId(id);
      setRenameName(f?.name || '');
      setRenameOpen(true);
    },
    [folders]
  );

  // 删除文件夹（含撤回能力）
  const handleDeleteFolder = useCallback(
    async (id: string) => {
      try {
        const r = await folderAPI['folder.softDelete']({ ids: [id] });
        if ((r as any)?.success) {
          if (folderFilter === id) setFolderFilter('');
          await loadFolders(wsFilter || undefined);
          toast.success('文件夹已删除', {
            description: '已移动到回收站',
            action: {
              label: '撤回',
              onClick: async () => {
                try {
                  const rr = await folderAPI['folder.restore']({ ids: [id] });
                  if ((rr as any)?.success) {
                    toast.success('已撤回删除');
                    await loadFolders(wsFilter || undefined);
                  } else {
                    toast.error('撤回失败');
                  }
                } catch (err) {
                  toast.error('撤回失败', { description: String((err as any)?.message || err) });
                }
              }
            }
          });
        }
      } catch (e) {
        console.warn('delete folder failed', e);
        toast.error('删除文件夹失败', { description: String((e as any)?.message || e) });
      }
    },
    [folderAPI, folderFilter, loadFolders, wsFilter]
  );

  // 通用：将资源移动到指定文件夹，并在成功后切换到该文件夹视图
  const handleMoveResourcesToFolder = useCallback(
    async (folderId: string | null, ids: string[]) => {
      try {
        if (!ids?.length) return;
        // 阻止跨工作空间：若目标文件夹存在，则检查其 workspaceId 与当前 ws 一致
        if (folderId) {
          try {
            const folder = await folderAPI['folder.get']({ id: folderId });
            if (folder && folder.workspaceId && wsFilter && folder.workspaceId !== wsFilter) {
              toast.error('无法跨工作空间移动到该文件夹');
              return;
            }
          } catch {
            /* ignore get error */
          }
        }

        // 记录撤回需要的“原始 folderId”映射
        const prevMap = new Map<string, string | null>();
        for (const id of ids) {
          const item: any = list.find((i) => i.id === id);
          prevMap.set(id, item?.folderId ?? null);
        }

        // 使用主进程批量 API
        const res = await window.YUA.resource['resource:moveToFolder']({ ids, folderId: folderId || null, workspaceId: wsFilter });
        if (!res?.success) {
          const invalidCount = Array.isArray((res as any)?.invalid) ? (res as any).invalid.length : 0;
          if (invalidCount > 0) {
            toast.error(`有 ${invalidCount} 个资源不属于当前空间，已阻止移动`);
          } else {
            toast.error('移动失败');
          }
          return;
        }
        // 刷新列表与文件夹（计数徽标）
        await Promise.all([load(), loadFolders(wsFilter)]);
        // 不再自动切换到目标文件夹：保持当前视图，避免跳变带来的困惑

        // 成功提示 + 撤回
        const folderName = folderId ? folders.find((f) => f.id === folderId)?.name || '目标文件夹' : '（移出文件夹）';
        const movedCount = (res as any)?.moved ?? ids.length;
        toast.success(`已移动到 ${folderId ? folderName : '全部'}`, {
          description: `共 ${movedCount} 个资源`,
          action: {
            label: '撤回',
            onClick: async () => {
              try {
                // 将资源按“原始 folderId”分组后分别调用批量接口
                const groups = new Map<string, string[]>();
                for (const [rid, prevFid] of prevMap.entries()) {
                  const key = prevFid || '__null__';
                  const arr = groups.get(key) || [];
                  arr.push(rid);
                  groups.set(key, arr);
                }
                for (const [key, groupIds] of groups.entries()) {
                  const backId = key === '__null__' ? null : key;
                  await window.YUA.resource['resource:moveToFolder']({ ids: groupIds, folderId: backId, workspaceId: wsFilter });
                }
                await Promise.all([load(), loadFolders(wsFilter)]);
                toast.success('已撤回移动');
              } catch (err) {
                toast.error('撤回失败', { description: String((err as any)?.message || err) });
              }
            }
          }
        });
      } catch (e) {
        console.warn('move resources to folder failed', e);
      }
    },
    [folderAPI, wsFilter, list, load, loadFolders, folders]
  );

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
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">展示模式</div>
                    <div className="flex gap-2">
                      <Button className="flex-1 h-8" variant={viewMode === 'grid' ? 'default' : 'outline'} onClick={() => setViewMode('grid')}>
                        <TbGrid3X3 className="mr-1" /> 网格
                      </Button>
                      <Button className="flex-1 h-8" variant={viewMode === 'list' ? 'default' : 'outline'} onClick={() => setViewMode('list')}>
                        <TbList className="mr-1" /> 列表
                      </Button>
                    </div>
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
              onSelect={(id) => setFolderFilter(id as string)}
              counts={folderCounts}
              allCount={allCount}
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
                  const r = await folderAPI['folder.softDelete']({ ids: [id] });
                  if ((r as any)?.success) {
                    if (folderFilter === id) setFolderFilter('');
                    await loadFolders(wsFilter || undefined);
                    toast.success('文件夹已删除', {
                      description: '已移动到回收站',
                      action: {
                        label: '撤回',
                        onClick: async () => {
                          try {
                            const rr = await folderAPI['folder.restore']({ ids: [id] });
                            if ((rr as any)?.success) {
                              toast.success('已撤回删除');
                              await loadFolders(wsFilter || undefined);
                            } else {
                              toast.error('撤回失败');
                            }
                          } catch (err) {
                            toast.error('撤回失败', { description: String((err as any)?.message || err) });
                          }
                        }
                      }
                    });
                  }
                } catch (e) {
                  console.warn('delete folder failed', e);
                  toast.error('删除文件夹失败', { description: String((e as any)?.message || e) });
                }
              }}
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
            {viewMode === 'grid' ? (
              <ExplorerGrid
                items={filtered}
                folders={childFolders}
                counts={folderCounts}
                onOpenFolder={(id) => setFolderFilter(id)}
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
            ) : (
              <div className="space-y-2">
                {/* 先渲染子文件夹列表条目 */}
                {childFolders.map((f) => {
                  const ListFolderRow: React.FC = () => {
                    const [over, setOver] = React.useState(false);
                    const [overInvalid, setOverInvalid] = React.useState(false);
                    const [tipOpen, setTipOpen] = React.useState(false);
                    const isAncestor = (ancestorId: string, descendantId: string): boolean => {
                      let cur: string | null | undefined = descendantId;
                      const guard = new Set<string>();
                      while (cur) {
                        if (cur === ancestorId) return true;
                        if (guard.has(cur)) break;
                        guard.add(cur);
                        cur = folderParentMap.get(cur) ?? null;
                      }
                      return false;
                    };
                    return (
                      <ContextMenu>
                        <ContextMenuTrigger asChild>
                          <TooltipProvider delayDuration={0}>
                            <Tooltip open={overInvalid || tipOpen}>
                              <TooltipTrigger asChild>
                                {(() => {
                                  const rowStateClass = over
                                    ? overInvalid
                                      ? 'ring-1 ring-destructive bg-destructive/10'
                                      : 'bg-muted/50 border-primary/30'
                                    : 'hover:bg-muted/50 hover:border-primary/30';
                                  return (
                                    <div
                                      className={'group relative flex items-center gap-4 p-2 rounded-lg border transition-all cursor-pointer select-none ' + rowStateClass}
                                      onClick={() => setFolderFilter(f.id)}
                                      onContextMenu={(e) => e.stopPropagation()}
                                      draggable
                                      onDragStart={(e) => {
                                        try {
                                          e.dataTransfer.setData('application/x-folder-id', f.id);
                                          e.dataTransfer.effectAllowed = 'move';
                                        } catch {
                                          /* noop */
                                        }
                                      }}
                                      onDragOver={(e) => {
                                        const types = Array.from((e.dataTransfer?.types as any) || []);
                                        const maybeFolder = types.includes('application/x-folder-id');
                                        if (maybeFolder) {
                                          // we cannot read the id here reliably, but if from same doc works
                                          try {
                                            const fid = e.dataTransfer.getData('application/x-folder-id');
                                            const invalid = fid === f.id || isAncestor(fid, f.id);
                                            setOverInvalid(invalid);
                                            if (!invalid) {
                                              e.preventDefault();
                                              e.dataTransfer.dropEffect = 'move';
                                              setOver(true);
                                            } else {
                                              setOver(false);
                                              e.dataTransfer.dropEffect = 'none';
                                            }
                                          } catch {
                                            // fallback allow default resource drop
                                            e.preventDefault();
                                            setOver(true);
                                            setOverInvalid(false);
                                          }
                                          return;
                                        }
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = 'move';
                                        setOver(true);
                                        setOverInvalid(false);
                                      }}
                                      onDragLeave={() => {
                                        setOver(false);
                                        setOverInvalid(false);
                                        setTipOpen(false);
                                      }}
                                      onDrop={async (e) => {
                                        setOver(false);
                                        setOverInvalid(false);
                                        setTipOpen(false);
                                        try {
                                          const fid = e.dataTransfer.getData('application/x-folder-id');
                                          if (fid) {
                                            if (fid !== f.id && !isAncestor(fid, f.id)) {
                                              // move folder
                                              const targetPid = f.id;
                                              try {
                                                await handleMoveFolder(fid, targetPid);
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
                                              setTipOpen(true);
                                              setTimeout(() => setTipOpen(false), 1200);
                                            }
                                            return;
                                          }
                                        } catch {
                                          /* ignore folder move */
                                        }
                                        try {
                                          const raw = e.dataTransfer.getData('application/x-resource-ids');
                                          if (!raw) return;
                                          const ids: string[] = JSON.parse(raw);
                                          if (Array.isArray(ids) && ids.length) handleMoveResourcesToFolder(f.id, ids);
                                        } catch {
                                          /* ignore */
                                        }
                                      }}
                                    >
                                      <div className="relative flex-shrink-0 w-16 h-16 rounded-md overflow-hidden bg-muted flex items-center justify-center text-3xl text-muted-foreground">
                                        <TbFolderFilled />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="mb-1">
                                          <h3 className="font-medium text-sm truncate mb-1 flex items-center gap-2">
                                            <span className="truncate">{f.name}</span>
                                            <span className="inline-flex items-center justify-center bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded-full">{folderCounts[f.id] ?? 0}</span>
                                          </h3>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </TooltipTrigger>
                              <TooltipContent side="top">不能移动到自己的子文件夹中</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="min-w-[200px]" onClick={(e) => e.stopPropagation()}>
                          <ContextMenuItem onSelect={() => setFolderFilter(f.id)}>打开</ContextMenuItem>
                          <ContextMenuItem className="flex items-center gap-2" onSelect={() => handleOpenFolderLocation(f.id)}>
                            <TbFolderOpen /> {(window as any).YUA?.isWindows ? '在资源管理器中显示' : '在 Finder 中显示'}
                          </ContextMenuItem>
                          <ContextMenuItem className="flex items-center gap-2" onSelect={() => handleRenameFolder(f.id)}>
                            <TbPencil /> 重命名
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem className="flex items-center gap-2 text-destructive" onSelect={() => handleDeleteFolder(f.id)}>
                            <TbTrash /> 删除
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    );
                  };
                  return <ListFolderRow key={`folder-row-${f.id}`} />;
                })}

                {/* 再渲染资源列表条目 */}
                {filtered.map((item, idx) => (
                  <ResourceListItem
                    key={item.id}
                    item={item}
                    selected={selectedItems.has(item.id)}
                    onClick={handleItemClick}
                    onToggleFavorite={handleToggleFavorite}
                    onToggleVisibility={handleToggleVisibility}
                    onPreview={() => {
                      const current = filtered[idx];
                      if (!current) return;
                      window.YUA.window['window:open']('resourcePreview', {
                        current,
                        list: filtered,
                        index: idx
                      });
                    }}
                    draggable
                    onDragStart={(e) => {
                      const ids = selectedItems.has(item.id) && selectedItems.size > 0 ? Array.from(selectedItems) : [item.id];
                      try {
                        e.dataTransfer.setData('application/x-resource-ids', JSON.stringify(ids));
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.dropEffect = 'move';
                      } catch {
                        /* ignore */
                      }
                    }}
                  />
                ))}
                {childFolders.length === 0 && filtered.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <div className="text-4xl mb-4">📦</div>
                    <div>没有找到资源</div>
                    <div className="text-sm mt-2">尝试调整筛选条件或添加新资源</div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 底部路径与统计栏（固定在右侧列表底部） */}
          <div className="px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 text-muted-foreground flex-wrap">
              <span className={`cursor-pointer hover:underline ${folderFilter ? 'text-primary' : 'text-foreground'} `} onClick={() => setFolderFilter('')}>
                全部
              </span>
              {currentFolderPath.map((f) => (
                <React.Fragment key={f.id}>
                  <span className="mx-1 text-muted-foreground">/</span>
                  <span className="cursor-pointer hover:underline text-foreground" onClick={() => setFolderFilter(f.id)}>
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
