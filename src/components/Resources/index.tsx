import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '../ui/button'
import { ScrollArea } from '../ui/scroll-area'

interface ResourceItem {
  id: string
  title?: string
  type: string
  filePath?: string
  url?: string
  createdAt?: number
}

const Resources: React.FC = () => {
  const [list, setList] = useState<ResourceItem[]>([])
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    const v = localStorage.getItem('resources:viewMode') as 'card' | 'list' | null
    return v === 'list' || v === 'card' ? v : 'card'
  })

  const load = async () => {
    try {
      const rows = await (window as any).YUA.resource['listResource']()
      setList(rows || [])
    } catch (e) { console.warn('load resources failed', e) }
  }

  useEffect(() => { load() }, [])
  useEffect(() => { localStorage.setItem('resources:viewMode', viewMode) }, [viewMode])

  const handleDelete = async (id: string) => {
    try {
      await window.YUA.resource.deleteResource({ id })
      setList(prev => prev.filter(i => i.id !== id))
    } catch (e) { console.warn('delete resource failed', e) }
  }

  const Title = ({ item }: { item: ResourceItem }) => (
    <span>{item.title || item.filePath || item.url || item.id}</span>
  )

  const Meta = ({ item }: { item: ResourceItem }) => (
    <div className='text-sm text-muted-foreground'>
      类型: {item.type} · 创建时间: {item.createdAt ? new Date(item.createdAt).toLocaleString() : '-'}
    </div>
  )

  return (
    <ScrollArea className='p-4 text-foreground bg-background h-full'>
      <div className='flex items-center justify-between mb-3'>
        <div className='text-xl'>📚 资源管理</div>
        <div className='flex items-center gap-2'>
          <Button
            variant={viewMode === 'card' ? 'default' : 'secondary'}
            size={'sm'}
            onClick={() => setViewMode('card')}
          >
            卡片
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'secondary'}
            size={'sm'}
            onClick={() => setViewMode('list')}
          >
            列表
          </Button>
        </div>
      </div>
      <div className='mb-3'>共 {list.length} 个资源</div>

      {viewMode === 'card' ? (
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>
          {list.map(item => (
            <div key={item.id} className='border border-border rounded p-3 flex flex-col gap-2'>
              <div className='font-medium truncate'><Title item={item} /></div>
              <Meta item={item} />
              <div className='mt-auto flex items-center justify-end'>
                <Button variant={'destructive'} size={'sm'} onClick={() => handleDelete(item.id)}>删除</Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className='divide-y divide-border border border-border rounded'>
          {list.map(item => (
            <div key={item.id} className='p-3 flex items-center justify-between'>
              <div className='min-w-0'>
                <div className='font-medium truncate'><Title item={item} /></div>
                <Meta item={item} />
              </div>
              <div className='flex items-center gap-2 shrink-0'>
                <Button variant={'destructive'} size={'sm'} onClick={() => handleDelete(item.id)}>删除</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </ScrollArea>
  )
}

export default Resources
