import React, { useEffect, useMemo, useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TbTrash } from 'react-icons/tb'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'

interface ResourceItem {
  id: string
  title?: string
  type: string
  filePath?: string
  url?: string
  createdAt?: number
}

const ResourcePage: React.FC = () => {
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

  return (<>
    <div className='flex items-center justify-between bg-background text-foreground h-10 px-2'>
      <div>资源管理 <span className='text-xs text-muted-foreground ml-2'>共 {list.length} 个资源</span> </div>
      <Tabs value={viewMode}>
        <TabsList>
          <TabsTrigger value="card" onClick={() => setViewMode('card')}>卡片</TabsTrigger>
          <TabsTrigger value="list" onClick={() => setViewMode('list')}>列表</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
    <div className='px-2 text-foreground h-full w-full bg-muted box-border overflow-y-auto' style={{ height: 'calc(100% - 40px)' }}>
      {viewMode === 'card' ? (
        <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'>
          {list.map(item => (
            <div key={item.id} className='border border-border rounded p-3 flex flex-col gap-2'>
              <div className='font-medium truncate'>{item.title || item.filePath || item.url || item.id}</div>
              <div className='text-sm text-muted-foreground'>
                类型: {item.type} · 创建时间: {item.createdAt ? new Date(item.createdAt).toLocaleString() : '-'}
              </div>
              <div className='mt-auto flex items-center justify-end'>
                <Button variant={'destructive'} size={'sm'} onClick={() => handleDelete(item.id)}><TbTrash />删除</Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        list.map(item => (
          <div key={item.id} className='p-2 flex items-center justify-between'>
            <div className='min-w-0'>
              <div className='font-medium truncate'>{item.title || item.filePath || item.url || item.id}</div>
              <div className='text-sm text-muted-foreground'>
                类型: {item.type} · 创建时间: {item.createdAt ? new Date(item.createdAt).toLocaleString() : '-'}
              </div>
            </div>
            <div className='flex items-center gap-2 shrink-0'>
              <Button variant={'destructive'} size={'sm'} onClick={() => handleDelete(item.id)}><TbTrash />删除</Button>
            </div>
          </div>
        ))
      )}
    </div>
  </>
  )
}

export default ResourcePage
