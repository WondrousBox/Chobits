import { useMemo } from 'react';

import { ResourceItem, SortField, SortOrder } from '../types';

interface UseResourceFilterParams {
  list: ResourceItem[];
  wsFilter?: string;
  tagFilter: string;
  folderFilter: string;
  favoriteFilter: boolean;
  searchQuery: string;
  sortField: SortField;
  sortOrder: SortOrder;
}

export const useResourceFilter = ({ list, wsFilter, tagFilter, folderFilter, favoriteFilter, searchQuery, sortField, sortOrder }: UseResourceFilterParams) => {
  const filtered = useMemo(() => {
    if (!wsFilter) return [] as any[];
    // 过滤掉 translation、summary、mindmap 和笔记类型的资源（不在文件夹中显示）
    let filtered = list.filter((r: any) => {
      if (r.workspaceId !== wsFilter) return false;
      if (r.type === 'translation' || r.type === 'summary' || r.type === 'mindmap') return false;
      // 笔记资源现在使用独立类型 note，直接过滤掉
      if (r.type === 'note') return false;
      return true;
    });

    // 标签过滤（当后端按标签查询时，这里也保持二次防御）
    if (tagFilter) {
      filtered = filtered.filter((r: any) => (r.tags || '').includes(tagFilter));
    }

    // 文件夹过滤：当选择具体文件夹时，仅展示该文件夹内资源；当选择"全部"时，仅展示未归属任何文件夹的顶层资源
    // 如果开启了收藏筛选，则忽略文件夹限制，展示所有符合条件的资源
    if (!favoriteFilter) {
      if (folderFilter) {
        filtered = filtered.filter((r: any) => (r as any).folderId === folderFilter);
      } else {
        filtered = filtered.filter((r: any) => !(r as any).folderId);
      }
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
  }, [list, wsFilter, favoriteFilter, searchQuery, sortField, sortOrder, folderFilter, tagFilter]);

  return { filtered };
};
