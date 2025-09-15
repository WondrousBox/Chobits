import React, { useEffect, useMemo, useState } from 'react';
import Modal from '../update/Modal';
import './recycle.css';

type TrashItem = {
  id: string;
  entityType: 'document' | 'resource';
  entityId: string;
  title?: string | null;
  summary?: string | null;
  deletedAt?: number | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

const RecycleBin: React.FC<Props> = ({ open, onClose }) => {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'all' | 'resource' | 'document'>('all');

  const filtered = useMemo(() => {
    if (tab === 'all') return items;
    return items.filter(i => i.entityType === tab);
  }, [items, tab]);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await window.YUA.trash['trash:list']({ filter: {}, limit: 500, offset: 0 });
      setItems(rows as any);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(filtered.map(i => i.id)));
  const clearSel = () => setSelected(new Set());

  const restore = async () => {
    if (!selected.size) return;
    await window.YUA.trash['trash:restore']({ recycleIds: Array.from(selected) });
    await load();
    clearSel();
  };

  const purge = async () => {
    if (!selected.size) return;
    if (!confirm('彻底删除所选项目？该操作不可恢复。')) return;
    await window.YUA.trash['trash:purge']({ recycleIds: Array.from(selected) });
    await load();
    clearSel();
  };

  const empty = async () => {
    if (!confirm('清空回收站？该操作不可恢复。')) return;
    await window.YUA.trash['trash:empty']({ filter: {} });
    await load();
    clearSel();
  };

  return (
    <Modal open={open} onCancel={onClose} title={'回收站'} footer={null} width={720}>
      <div className='recycle-toolbar'>
        <div className='left'>
          <button onClick={() => setTab('all')} className={tab==='all'?'active':''}>全部</button>
          <button onClick={() => setTab('resource')} className={tab==='resource'?'active':''}>资源</button>
          <button onClick={() => setTab('document')} className={tab==='document'?'active':''}>文档</button>
        </div>
        <div className='right'>
          <button onClick={selectAll}>全选</button>
          <button onClick={clearSel}>清空选择</button>
          <button onClick={restore} disabled={!selected.size}>恢复</button>
          <button onClick={purge} disabled={!selected.size} className='danger'>彻底删除</button>
          <button onClick={empty} className='danger'>清空回收站</button>
        </div>
      </div>
      <div className='recycle-list'>
        {loading && <div className='empty'>加载中...</div>}
        {!loading && filtered.length === 0 && <div className='empty'>暂无数据</div>}
        {!loading && filtered.map(item => (
          <div className={`recycle-item ${selected.has(item.id)?'selected':''}`} key={item.id} onClick={() => toggleSelect(item.id)}>
            <div className='type'>{item.entityType === 'resource' ? '📚' : '📄'}</div>
            <div className='body'>
              <div className='title'>{item.title || item.entityId}</div>
              <div className='summary'>{item.summary || ''}</div>
            </div>
            <div className='meta'>{item.deletedAt ? new Date(item.deletedAt).toLocaleString() : ''}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
};

export default RecycleBin;
