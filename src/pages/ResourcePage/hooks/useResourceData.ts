import { useCallback, useEffect, useState } from 'react';

import { type UIFolder } from '../components/FolderSidebar';
import { ResourceItem } from '../types';

export const useResourceData = (
  wsFilter?: string,
  tagFilter?: string
): {
  list: ResourceItem[];
  setList: React.Dispatch<React.SetStateAction<ResourceItem[]>>;
  tags: Array<{ tag: string; count: number }>;
  folders: UIFolder[];
  setFolders: React.Dispatch<React.SetStateAction<UIFolder[]>>;
  foldersLoading: boolean;
  load: () => Promise<void>;
  loadTags: (workspaceId?: string) => Promise<void>;
  loadFolders: (workspaceId?: string) => Promise<void>;
} => {
  const [list, setList] = useState<ResourceItem[]>([]);
  const [tags, setTags] = useState<Array<{ tag: string; count: number }>>([]);
  const [folders, setFolders] = useState<UIFolder[]>([]);
  const [foldersLoading, setFoldersLoading] = useState<boolean>(true); // 标记文件夹是否正在加载
  const folderAPI: any = window.YUA?.folder;

  const load = useCallback(async (): Promise<void> => {
    try {
      let rows: any[] = [];
      if (tagFilter) {
        rows = await window.YUA.resource['listResourcesByTag']({ tag: tagFilter, workspaceId: wsFilter || undefined, includeDeleted: false, limit: 1000, offset: 0 });
      } else {
        // 如果已选定工作空间，只查询该工作空间的资源
        rows = await window.YUA.resource['resource:list'](wsFilter ? { workspaceId: wsFilter } : undefined);
      }
      console.log('load resources', rows);
      // 截图资源仅出现在「截图」文件夹内，不在此过滤（按 folderId 筛选时自然只会在打开截图文件夹时看到）
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
        setFoldersLoading(true);
        const wsId = workspaceId || wsFilter || undefined;
        const rows = await folderAPI['folder.list']({ workspaceId: wsId, deletedAt: 0 });
        setFolders(
          (rows || []).map((r: any) => ({
            id: r.id,
            name: r.name,
            parentId: r.parentId || null,
            workspaceId: r.workspaceId,
            originType: r.originType,
            linkedMountId: r.linkedMountId ?? null,
            relativePath: r.relativePath ?? null,
            metadata: r.metadata ?? null,
            rank: r.rank
          }))
        );
      } catch (e) {
        console.warn('load folders failed', e);
      } finally {
        setFoldersLoading(false);
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

  // 监听主进程的资源变更事件：新增后自动刷新列表/标签/文件夹计数
  useEffect(() => {
    const onResourceChanged = (): void => {
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

  // 初始化默认工作空间 - 这个逻辑需要在主组件中处理，因为需要 setWsFilter

  return {
    list,
    setList,
    tags,
    folders,
    setFolders,
    foldersLoading,
    load,
    loadTags,
    loadFolders
  };
};
