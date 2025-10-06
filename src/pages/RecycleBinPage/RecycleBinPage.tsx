import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'

type TrashItem = {
  id: string;
  entityType: 'document' | 'resource';
  entityId: string;
  title?: string | null;
  summary?: string | null;
  deletedAt?: number | null;
};

const RecycleBinPage: React.FC = () => {
  const [items, setItems] = useState<TrashItem[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [tab, setTab] = useState<'all' | 'resource' | 'document'>('all')

  const filtered = useMemo(() => {
    if (tab === 'all') return items
    return items.filter(i => i.entityType === tab)
  }, [items, tab])

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

  const selectAll = () => setSelected(new Set(filtered.map(i => i.id)))
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
    <div className='p-4 text-foreground bg-background'>
      <div className='text-xl mb-3'>🗑️ 回收站</div>
      <div className='flex items-center justify-between gap-2 mb-3'>
        <div className='flex items-center gap-1.5'>
          <Button size={'sm'} variant={tab==='all' ? 'default' : 'outline'} onClick={() => setTab('all')}>全部</Button>
          <Button size={'sm'} variant={tab==='resource' ? 'default' : 'outline'} onClick={() => setTab('resource')}>资源</Button>
          <Button size={'sm'} variant={tab==='document' ? 'default' : 'outline'} onClick={() => setTab('document')}>文档</Button>
        </div>
        <div className='flex items-center gap-1.5'>
          <Button size={'sm'} variant={'outline'} onClick={selectAll}>全选</Button>
          <Button size={'sm'} variant={'outline'} onClick={clearSel}>清空选择</Button>
          <Button size={'sm'} onClick={restore} disabled={!selected.size}>恢复</Button>
          <Button size={'sm'} variant={'destructive'} onClick={purge} disabled={!selected.size}>彻底删除</Button>
          <Button size={'sm'} variant={'destructive'} onClick={empty}>清空回收站</Button>
        </div>
      </div>
      <div className='max-h-[60vh] overflow-auto border rounded-lg'>
        {loading && <div className='p-5 text-center text-gray-400'>加载中...</div>}
        {!loading && filtered.length === 0 && <div className='p-5 text-center text-gray-400'>暂无数据</div>}
        {!loading && filtered.map(item => (
          <div
            key={item.id}
            onClick={() => toggleSelect(item.id)}
            className={`flex items-start p-2 gap-2.5 border-b border-neutral-800 cursor-pointer ${selected.has(item.id) ? 'bg-gray-800' : ''}`}
          >
            <div className='w-7'>{item.entityType === 'resource' ? '📚' : '📄'}</div>
            <div className='flex-1'>
              <div className='font-semibold text-gray-200'>{item.title || item.entityId}</div>
              <div className='text-xs text-gray-400 mt-0.5'>{item.summary || ''}</div>
            </div>
            <div className='text-xs text-gray-500 whitespace-nowrap'>
              {item.deletedAt ? new Date(item.deletedAt).toLocaleString() : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default RecycleBinPage
