import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { TbArrowBackUp, TbCheck, TbSquare, TbTrash, TbX } from 'react-icons/tb';
import DragAbleTitle from '@/components/common/DragAbleTitle';

type TrashItem = {
  id: string;
  entityType: 'document' | 'resource' | 'conversation';
  entityId: string;
  title?: string | null;
  summary?: string | null;
  deletedAt?: number | null;
};

const RecycleBinPage: React.FC = () => {
  const [items, setItems] = useState<TrashItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const load = async () => {
    setLoading(true)
    try {
      const rows = await window.YUA.trash['trash:list']({ filter: {}, limit: 500, offset: 0 })
      setItems(rows as any)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(items.map(i => i.id)))
  const clearSel = () => setSelected(new Set())

  const restore = async () => {
    if (!selected.size) return
    await window.YUA.trash['trash:restore']({ recycleIds: Array.from(selected) })
    await load()
    clearSel()
  }

  const purge = async () => {
    if (!selected.size) return
    if (!confirm('彻底删除所选项目？该操作不可恢复。')) return
    await window.YUA.trash['trash:purge']({ recycleIds: Array.from(selected) })
    await load()
    clearSel()
  }

  const empty = async () => {
    if (!confirm('清空回收站？该操作不可恢复。')) return
    await window.YUA.trash['trash:empty']({ filter: {} })
    await load()
    clearSel()
  }

  return (
    <div className='bg-background'>
      <DragAbleTitle
        title={<div className='flex items-center gap-2'><TbTrash size={20} />回收站</div>}
        actions={
          <div className='flex items-center gap-2'>
            <Button size={'sm'} variant={'ghost'} onClick={selectAll}>全选</Button>
            {selected.size > 0 && <Button size={'sm'} variant={'ghost'} onClick={clearSel}><TbX />清空选择</Button>}
            {
              selected.size > 0 && <Button size={'sm'} variant={'ghost'} onClick={restore} disabled={!selected.size}>
                <TbArrowBackUp />恢复
              </Button>
            }
            {
              selected.size > 0 && <Button size={'sm'} variant={'ghost'} onClick={purge} disabled={!selected.size}>
                <TbTrash /> 彻底删除
              </Button>
            }
            <Button size={'sm'} variant={'destructive'} onClick={empty}><TbTrash />清空回收站</Button>
          </div>
        }
      />

      <div className='overflow-auto bg-muted' style={{ height: 'calc(100vh - 36px)' }}>
        {loading && <div className='p-5 text-center'>加载中...</div>}
        {!loading && items.length === 0 && <div className='p-5 text-center'>暂无数据</div>}
        {!loading && items.map(item => (
          <div
            key={item.id}
            onClick={() => toggleSelect(item.id)}
            className={`flex items-start p-2 m-2 rounded-md gap-2 cursor-pointer ${selected.has(item.id) ? 'bg-primary/20' : 'bg-background'}`}
          >
            {selected.has(item.id) ? <TbCheck className='text-primary' size={20} /> : <TbSquare size={20} />}
            <div className='flex-1'>
              <div>{item.title || item.entityId}</div>
              <div className='text-xs text-muted-foreground'>{item.summary || ''}</div>
            </div>
            <div className='text-xs whitespace-nowrap'>
              {item.deletedAt ? new Date(item.deletedAt).toLocaleString() : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default RecycleBinPage
