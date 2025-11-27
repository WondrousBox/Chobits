import React from 'react';
import { TbFilter, TbGrid3X3, TbList, TbRefresh, TbRobot, TbSearch } from 'react-icons/tb';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { SortField, SortOrder, ViewMode } from '../../types';
import { ALL_TAG_VALUE } from '../../utils/constants';

interface ResourceHeaderProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  viewMode: ViewMode;
  handleViewModeChange: (mode: ViewMode) => void;
  load: () => void;
  loadTags: () => void;
  typeOptions: any[];
  visibleTypes: Set<string>;
  typeFilter: string[];
  setTypeFilter: (types: string[]) => void;
  setFavoriteFilter: (fav: boolean) => void;
  setFolderFilter: (folder: string) => void;
  tagFilter: string;
  setTagFilter: (tag: string) => void;
  tags: any[];
  sortField: SortField;
  setSortField: (field: SortField) => void;
  sortOrder: SortOrder;
  setSortOrder: (order: SortOrder) => void;
}

const ResourceHeader: React.FC<ResourceHeaderProps> = ({
  searchQuery,
  setSearchQuery,
  viewMode,
  handleViewModeChange,
  load,
  loadTags,
  typeOptions,
  visibleTypes,
  typeFilter,
  setTypeFilter,
  setFavoriteFilter,
  setFolderFilter,
  tagFilter,
  setTagFilter,
  tags,
  sortField,
  setSortField,
  sortOrder,
  setSortOrder
}) => {
  return (
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
              </TabsList>
            </Tabs>
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
  );
};

export default ResourceHeader;
