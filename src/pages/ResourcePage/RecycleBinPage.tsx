import React, { useEffect, useMemo, useState } from 'react';
import { TbArrowBackUp, TbFile, TbFileText, TbFolder, TbMessageCircle, TbTrash } from 'react-icons/tb';
import { toast } from 'sonner';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import PageToolbar from '@/components/common/PageToolbar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

type TrashItem = {
  id: string;
  entityType: 'document' | 'resource' | 'conversation' | 'folder';
  entityId: string;
  title?: string | null;
  summary?: string | null;
  deletedAt?: number | null;
};

// 类型图标组件
const TypeIcon = ({ type }: { type: TrashItem['entityType'] }): React.ReactElement => {
  const iconClass = 'shrink-0 text-muted-foreground';
  switch (type) {
    case 'document':
      return <TbFileText size={16} className={iconClass} />;
    case 'conversation':
      return <TbMessageCircle size={16} className={iconClass} />;
    case 'folder':
      return <TbFolder size={16} className={iconClass} />;
    default:
      return <TbFile size={16} className={iconClass} />;
  }
};

// 类型标签组件
const TypeBadge = ({ type }: { type: TrashItem['entityType'] }): React.ReactElement => {
  const labels: Record<TrashItem['entityType'], string> = {
    document: '文档',
    resource: '资源',
    conversation: '对话',
    folder: '文件夹'
  };
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground">
      {labels[type] || type}
    </span>
  );
};

// 格式化删除时间
const formatDeletedTime = (timestamp?: number | null): string => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  } else if (diffDays === 1) {
    return `昨天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  } else if (diffDays < 7) {
    return `${diffDays} 天前`;
  } else {
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  }
};

// 回收站列表项组件（提取到顶层以避免每次渲染时重新创建组件）
interface TrashItemRowProps {
  item: TrashItem;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}

const TrashItemRow: React.FC<TrashItemRowProps> = ({ item, isSelected, onToggleSelect }) => {
  return (
    <div
      className={`p-3 border rounded-lg transition-colors cursor-pointer ${
        isSelected ? 'bg-primary/10 border-primary/30' : 'bg-card hover:bg-accent/50'
      }`}
      onClick={() => onToggleSelect(item.id)}
    >
      <div className="flex items-start gap-3">
        {/* 复选框 */}
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(item.id)}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5"
        />

        {/* 类型图标 */}
        <div className="flex-shrink-0 w-8 h-8 rounded bg-muted flex items-center justify-center">
          <TypeIcon type={item.entityType} />
        </div>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{item.title || item.entityId}</span>
            <TypeBadge type={item.entityType} />
          </div>
          {item.summary && <div className="text-xs text-muted-foreground truncate mt-0.5">{item.summary}</div>}
        </div>

        {/* 删除时间 */}
        <div className="text-xs text-muted-foreground whitespace-nowrap">{formatDeletedTime(item.deletedAt)}</div>
      </div>
    </div>
  );
};

interface RecycleBinPageProps {
  /** 是否隐藏标题栏（嵌入 ResourcePage 时使用） */
  hideTitleBar?: boolean;
}

const RecycleBinPage: React.FC<RecycleBinPageProps> = ({ hideTitleBar = false }) => {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [filter, setFilter] = useState('');

  // 过滤列表
  const filteredItems = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return items;
    return items.filter((item) => {
      const title = item.title?.toLowerCase() || '';
      const summary = item.summary?.toLowerCase() || '';
      return title.includes(f) || summary.includes(f) || item.entityId.toLowerCase().includes(f);
    });
  }, [items, filter]);

  const hasItems = useMemo(() => filteredItems.length > 0, [filteredItems]);
  const selectedCount = selected.size;
  const isAllSelected = hasItems && selectedCount === filteredItems.length;

  // 加载回收站数据
  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const rows = await window.YUA.trash['trash:list']({ filter: {}, limit: 500, offset: 0 });
      setItems(rows as TrashItem[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // 选择操作
  const handleToggleSelect = React.useCallback((id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = (): void => {
    if (isAllSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const clearSelection = (): void => setSelected(new Set());

  // 恢复选中项
  const restore = async (): Promise<void> => {
    if (!selectedCount) return;
    try {
      await window.YUA.trash['trash:restore']({ recycleIds: Array.from(selected) });
      toast.success(`已恢复 ${selectedCount} 项`);
      await load();
      clearSelection();
    } catch (e: any) {
      toast.error('恢复失败', { description: e?.message || String(e) });
    }
  };

  // 彻底删除选中项
  const purge = async (): Promise<void> => {
    if (!selectedCount) return;
    try {
      const res = await window.YUA.trash['trash:purge']({ recycleIds: Array.from(selected) });
      if ((res as any)?.deleted > 0) {
        toast.success(`已彻底删除 ${(res as any)?.deleted ?? 0} 项`);
      } else {
        toast.info('没有可删除的项目');
      }
      await load();
      clearSelection();
    } catch (e: any) {
      toast.error('删除失败', { description: e?.message || String(e) });
    }
  };

  // 清空回收站
  const handleConfirmEmpty = async (): Promise<void> => {
    setConfirmOpen(false);
    try {
      await window.YUA.trash['trash:empty']({ filter: {} });
      toast.success('回收站已清空');
      await load();
      clearSelection();
    } catch (e: any) {
      toast.error('清空失败', { description: e?.message || String(e) });
    }
  };

  // 操作按钮区域
  const actionButtons = (
    <div className="flex items-center gap-1">
      {selectedCount > 0 && (
        <>
          <Button size="sm" variant="ghost" onClick={restore} title="恢复选中项">
            <TbArrowBackUp className="mr-1" />
            恢复
          </Button>
          <Button size="sm" variant="ghost" onClick={purge} className="text-destructive hover:text-destructive" title="彻底删除选中项">
            <TbTrash className="mr-1" />
            删除
          </Button>
        </>
      )}
      {hasItems && (
        <Button size="sm" variant="ghost" onClick={() => setConfirmOpen(true)} className="text-destructive hover:text-destructive" title="清空回收站">
          清空全部
        </Button>
      )}
    </div>
  );

  // 统计信息元素
  const statsElement = (
    <div className="flex items-center gap-2">
      <Checkbox checked={isAllSelected} onCheckedChange={toggleSelectAll} />
      <span className="text-xs text-muted-foreground">
        {selectedCount > 0 ? `已选择 ${selectedCount} 项` : `共 ${filteredItems.length} 项`}
      </span>
    </div>
  );

  // 列表内容
  const listContent = (
    <div className="px-2 py-2 space-y-2">
      {loading && <div className="text-center text-muted-foreground py-8">加载中...</div>}
      {!loading && filteredItems.length === 0 && (
        <div className="text-center text-muted-foreground py-8">
          <TbTrash className="mx-auto mb-2 text-3xl opacity-50" />
          <div>{filter ? '无匹配结果' : '回收站是空的'}</div>
        </div>
      )}
      {!loading && filteredItems.map((item) => (
        <TrashItemRow
          key={item.id}
          item={item}
          isSelected={selected.has(item.id)}
          onToggleSelect={handleToggleSelect}
        />
      ))}
    </div>
  );

  // 确认清空对话框
  const confirmDialog = (
    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DialogContent className="w-80">
        <DialogHeader>
          <DialogTitle>清空回收站</DialogTitle>
          <DialogDescription>确定要清空回收站吗？所有 {items.length} 个项目将被永久删除，此操作无法撤销。</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmOpen(false)}>
            取消
          </Button>
          <Button variant="destructive" onClick={handleConfirmEmpty}>
            确认清空
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // 嵌入模式：与 TaskList 保持一致的布局
  if (hideTitleBar) {
    return (
      <div className="w-full h-full flex flex-col">
        {/* 工具栏 */}
        <PageToolbar
          icon={<TbTrash className="w-4 h-4" />}
          title="回收站"
          leftExtra={statsElement}
          searchPlaceholder="搜索名称/描述"
          searchValue={filter}
          onSearchChange={setFilter}
          actions={actionButtons}
        />

        {/* 列表内容 */}
        <ScrollArea className="flex-1 bg-muted">
          {listContent}
        </ScrollArea>
        {confirmDialog}
      </div>
    );
  }

  // 独立页面模式
  return (
    <div className="h-full w-full flex flex-col bg-background">
      {/* 顶部标题栏 */}
      <div className="border-b">
        <DragAbleTitle showBack title={<span />} />
      </div>

      {/* 工具栏 */}
      <PageToolbar
        icon={<TbTrash className="w-4 h-4" />}
        title="回收站"
        leftExtra={statsElement}
        searchPlaceholder="搜索名称/描述"
        searchValue={filter}
        onSearchChange={setFilter}
        actions={actionButtons}
      />

      {/* 列表内容 */}
      <ScrollArea className="flex-1 bg-muted">
        {listContent}
      </ScrollArea>
      {confirmDialog}
    </div>
  );
};

export default RecycleBinPage;
