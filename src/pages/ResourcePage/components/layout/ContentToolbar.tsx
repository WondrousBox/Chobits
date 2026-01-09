import React from 'react';
import { TbFilter, TbGrid3X3, TbList, TbRefresh, TbRobot, TbSearch, TbStack2 } from 'react-icons/tb';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { SortField, SortOrder, ViewMode } from '../../types';
import { ALL_TAG_VALUE } from '../../utils/constants';
import { AutomationRulesDialog } from '../automation/AutomationRulesDialog';

interface ContentToolbarProps {
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
  folderFilter: string;
  setFolderFilter: (folder: string) => void;
  wsFilter?: string;
  tagFilter: string;
  setTagFilter: (tag: string) => void;
  tags: any[];
  sortField: SortField;
  setSortField: (field: SortField) => void;
  sortOrder: SortOrder;
  setSortOrder: (order: SortOrder) => void;
  isCollapseMode: boolean;
  setIsCollapseMode: (mode: boolean) => void;
  showCollapseSuggestion: boolean;
  setShowCollapseSuggestion: (show: boolean) => void;
}

const ContentToolbar: React.FC<ContentToolbarProps> = ({
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
  folderFilter,
  setFolderFilter,
  wsFilter,
  tagFilter,
  setTagFilter,
  tags,
  sortField,
  setSortField,
  sortOrder,
  setSortOrder,
  isCollapseMode,
  setIsCollapseMode,
  showCollapseSuggestion,
  setShowCollapseSuggestion
}) => {
  const [showAutomationRules, setShowAutomationRules] = React.useState(false);

  return (
    <div className="flex items-center justify-between px-3 py-2 border-b bg-background">
      {/* 左侧：类型筛选 tabs */}
      <div className="flex items-center gap-2">
        <Tabs
          value={typeFilter.length === 0 ? 'all' : typeFilter.length === 1 ? typeFilter[0] : 'multiple'}
          onValueChange={(value) => {
            if (value === 'all') {
              setTypeFilter([]);
              setFavoriteFilter(false);
            } else if (value !== 'multiple') {
              setTypeFilter([value]);
              setFolderFilter('');
              setFavoriteFilter(false);
            }
          }}
        >
          <TabsList className="h-8">
            <TabsTrigger value="all" className="h-7 px-3 text-xs flex-none">
              全部
            </TabsTrigger>
            {typeOptions
              .filter(({ key }) => key !== '' && visibleTypes.has(key))
              .map(({ key, label }) => (
                <TabsTrigger key={key} value={key} className="h-7 px-3 text-xs flex-none">
                  {label}
                </TabsTrigger>
              ))}
          </TabsList>
        </Tabs>
      </div>

      {/* 右侧：搜索框 + 工具按钮 */}
      <div className="flex items-center gap-2">
        {/* 搜索框 */}
        <div className="relative">
          <TbSearch className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="搜索..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 w-48"
          />
        </div>

        {/* 视图切换 */}
        <Tabs className="h-8" value={viewMode} onValueChange={(value) => handleViewModeChange(value as ViewMode)}>
          <TabsList className="h-8">
            <TabsTrigger value="grid" className="h-7 px-2">
              <TbGrid3X3 className="w-4 h-4" />
            </TabsTrigger>
            <TabsTrigger value="list" className="h-7 px-2">
              <TbList className="w-4 h-4" />
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* 折叠模式 */}
        <Popover open={showCollapseSuggestion} onOpenChange={setShowCollapseSuggestion}>
          <PopoverAnchor asChild>
            <div className="relative">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    className="w-8 h-8 shrink-0"
                    variant={isCollapseMode ? 'default' : 'ghost'}
                    onClick={() => setIsCollapseMode(!isCollapseMode)}
                  >
                    <TbStack2 />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>自动合并文件展示</TooltipContent>
              </Tooltip>
              {showCollapseSuggestion && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3 pointer-events-none">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                </span>
              )}
            </div>
          </PopoverAnchor>
          <PopoverContent side="bottom" align="end" className="w-64 p-3" onOpenAutoFocus={(e) => e.preventDefault()}>
            <div className="space-y-2">
              <h4 className="font-medium leading-none">发现视频字幕</h4>
              <p className="text-sm text-muted-foreground">
                检测到存在同名的视频和字幕文件，是否开启"收起同名资源"模式？
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  onClick={() => {
                    setIsCollapseMode(true);
                    setShowCollapseSuggestion(false);
                  }}
                >
                  开启
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* 刷新按钮 */}
        <Tooltip>
          <TooltipTrigger asChild>
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
          </TooltipTrigger>
          <TooltipContent>刷新</TooltipContent>
        </Tooltip>

        {/* 自动化规则 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              className="w-8 h-8 shrink-0"
              variant="ghost"
              onClick={() => setShowAutomationRules(true)}
            >
              <TbRobot />
            </Button>
          </TooltipTrigger>
          <TooltipContent>自动化规则</TooltipContent>
        </Tooltip>
        <AutomationRulesDialog
          open={showAutomationRules}
          onOpenChange={setShowAutomationRules}
          currentWorkspaceId={wsFilter}
          currentFolderId={folderFilter}
        />

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
    </div>
  );
};

export default ContentToolbar;
