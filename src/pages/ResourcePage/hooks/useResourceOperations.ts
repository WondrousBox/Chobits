import { useCallback } from 'react';

import { ResourceItem } from '../types';

export const useResourceOperations = (
  list: ResourceItem[],
  setList: React.Dispatch<React.SetStateAction<ResourceItem[]>>,
  favoriteFilter: boolean,
  setFavoriteFilter: (value: boolean) => void,
  selectedItems: Set<string>,
  setSelectedItems: React.Dispatch<React.SetStateAction<Set<string>>>
) => {
  const handleDelete = useCallback(
    async (id: string): Promise<void> => {
      try {
        // 查找资源，检查是否是 RSS 类型
        const item = list.find((i) => i.id === id);

        if (item?.type === 'rss') {
          // RSS 资源使用专用删除方法，同时删除关联的 feed 记录
          await window.YUA.rss.delete({ id, hardDelete: true, deleteDownloadedResources: false });
        } else {
          await window.YUA.resource.deleteResource({ id });
        }

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
    },
    [list, favoriteFilter, setList, setFavoriteFilter]
  );

  const handleDeleteMany = useCallback(
    async (ids: string[]): Promise<void> => {
      try {
        // 分离 RSS 资源和普通资源
        const rssIds: string[] = [];
        const normalIds: string[] = [];

        ids.forEach((id) => {
          const item = list.find((i) => i.id === id);
          if (item?.type === 'rss') {
            rssIds.push(id);
          } else {
            normalIds.push(id);
          }
        });

        // 删除普通资源
        if (normalIds.length > 0) {
          await window.YUA.resource.deleteResources({ ids: normalIds });
        }

        // 逐个删除 RSS 资源（同时删除关联的 feed 记录）
        for (const id of rssIds) {
          await window.YUA.rss.delete({ id, hardDelete: true, deleteDownloadedResources: false });
        }

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
    },
    [list, favoriteFilter, setList, setFavoriteFilter, setSelectedItems]
  );

  const handleItemClick = useCallback(
    (e: React.MouseEvent, item: ResourceItem): void => {
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
    },
    [setSelectedItems]
  );

  const handleToggleFavorite = useCallback(
    async (id: string): Promise<void> => {
      try {
        const item = list.find((i) => i.id === id);
        if (item) {
          const newFavorite = item.favorite === 1 ? 0 : 1;
          await window.YUA.resource['resource:update']({ id, patch: { favorite: newFavorite } });
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
    },
    [list, favoriteFilter, setList, setFavoriteFilter]
  );

  const handleToggleVisibility = useCallback(
    async (id: string): Promise<void> => {
      try {
        const item = list.find((i) => i.id === id);
        if (item) {
          const newVisibility = item.visibility === 'public' ? 'private' : 'public';
          await window.YUA.resource['resource:update']({ id, patch: { visibility: newVisibility } });
          setList((prev) => prev.map((i) => (i.id === id ? { ...i, visibility: newVisibility } : i)));
        }
      } catch (e) {
        console.warn('toggle visibility failed', e);
      }
    },
    [list, setList]
  );

  return {
    handleDelete,
    handleDeleteMany,
    handleItemClick,
    handleToggleFavorite,
    handleToggleVisibility
  };
};
