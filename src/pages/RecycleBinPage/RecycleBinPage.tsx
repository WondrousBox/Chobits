import React, { useEffect, useMemo, useState } from 'react';
import { TbArrowBackUp, TbCheck, TbFile, TbFileText, TbFolder, TbMessageCircle, TbSquare, TbTrash, TbX } from 'react-icons/tb';
import { toast } from 'sonner';

import DragAbleTitle from '@/components/common/DragAbleTitle';
import { Button } from '@/components/ui/button';

type TrashItem = {
  id: string;
  entityType: 'document' | 'resource' | 'conversation' | 'folder';
  entityId: string;
  title?: string | null;
  summary?: string | null;
  deletedAt?: number | null;
};

const TypeIcon = ({ type }: { type: TrashItem['entityType'] }): React.ReactElement => {
  if (type === 'document') {
    return <TbFileText size={20} className="shrink-0" />;
  }
  if (type === 'conversation') {
    return <TbMessageCircle size={20} className="shrink-0" />;
  }
  if (type === 'folder') {
    return <TbFolder size={20} className="shrink-0" />;
  }
  return <TbFile size={20} className="shrink-0" />;
};

const RecycleBinPage: React.FC = () => {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const hasItems = useMemo(() => items.length > 0, [items]);

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const rows = await window.YUA.trash['trash:list']({ filter: {}, limit: 500, offset: 0 });
      setItems(rows as any);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleSelect = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = (): void => setSelected(new Set(items.map((i) => i.id)));
  const clearSel = (): void => setSelected(new Set());

  const restore = async (): Promise<void> => {
    if (!selected.size) return;
    await window.YUA.trash['trash:restore']({ recycleIds: Array.from(selected) });
    await load();
    clearSel();
  };

  const purge = async (): Promise<void> => {
    if (!selected.size) return;
    try {
      const res = await window.YUA.trash['trash:purge']({ recycleIds: Array.from(selected) });
      if ((res as any)?.deleted > 0) {
        toast.success(`已彻底删除 ${(res as any)?.deleted ?? 0} 项`);
      } else {
        toast.info('没有可删除的项目，可能已被删除或类型暂不支持');
      }
      await load();
      clearSel();
    } catch (e: any) {
      toast.error('彻底删除失败', { description: e?.message || String(e) });
    }
  };

  const empty = async (): Promise<void> => {
    if (!confirm('清空回收站？该操作不可恢复。')) return;
    await window.YUA.trash['trash:empty']({ filter: {} });
    await load();
    clearSel();
  };

  return (
    <div className="bg-background">
      <DragAbleTitle
        title={<div className="flex items-center gap-2">🗑️ 回收站</div>}
        actions={
          <div className="flex items-center gap-2">
            {hasItems && (
              <Button size={'sm'} variant={'ghost'} onClick={selectAll}>
                全选
              </Button>
            )}
            {selected.size > 0 && (
              <Button size={'sm'} variant={'ghost'} onClick={clearSel}>
                <TbX />
                清空选择
              </Button>
            )}
            {selected.size > 0 && (
              <Button size={'sm'} variant={'ghost'} onClick={restore} disabled={!selected.size}>
                <TbArrowBackUp />
                恢复
              </Button>
            )}
            {selected.size > 0 && (
              <Button size={'sm'} variant={'ghost'} onClick={purge} disabled={!selected.size}>
                <TbTrash /> 彻底删除
              </Button>
            )}
            {hasItems && (
              <Button size={'sm'} variant={'destructive'} onClick={empty}>
                <TbTrash />
                清空回收站
              </Button>
            )}
          </div>
        }
      />

      <div className="overflow-auto bg-muted" style={{ height: 'calc(100vh - 36px)' }}>
        {loading && <div className="p-5 text-center">加载中...</div>}
        {!loading && items.length === 0 && <div className="p-5 text-center">暂无数据</div>}
        {!loading &&
          items.map((item) => (
            <div
              key={item.id}
              onClick={() => toggleSelect(item.id)}
              className={`flex items-start p-2 m-2 rounded-md gap-2 cursor-pointer ${selected.has(item.id) ? 'bg-primary/20' : 'bg-background'}`}
            >
              {selected.has(item.id) ? <TbCheck className="text-primary shrink-0" size={20} /> : <TbSquare className="shrink-0" size={20} />}
              <TypeIcon type={item.entityType} />
              <div className="flex-1">
                <div>{item.title || item.entityId}</div>
                <div className="text-xs text-muted-foreground">{item.summary || ''}</div>
              </div>
              <div className="text-xs whitespace-nowrap">{item.deletedAt ? new Date(item.deletedAt).toLocaleString() : ''}</div>
            </div>
          ))}
      </div>
    </div>
  );
};

export default RecycleBinPage;
