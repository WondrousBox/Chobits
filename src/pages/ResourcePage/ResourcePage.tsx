import React, { useEffect, useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import ResourceList from '@/pages/ResourcePage/components/ResourceList'
import { ResourceItem } from '@/types'

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
    <div className='flex items-center justify-between bg-background text-foreground h-10 p-2'>
      <div>资源管理 <span className='text-xs text-muted-foreground ml-2'>共 {list.length} 个资源</span> </div>
      <Tabs value={viewMode}>
        <TabsList>
          <TabsTrigger value="card" onClick={() => setViewMode('card')}>卡片</TabsTrigger>
          <TabsTrigger value="list" onClick={() => setViewMode('list')}>列表</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
    <div className='px-2 text-foreground h-full w-full bg-muted box-border overflow-y-auto' style={{ height: 'calc(100% - 48px)' }}>
      <ResourceList
        items={list}
        onDelete={handleDelete}
        variant={viewMode}
      />
    </div>
  </>
  )
}

export default ResourcePage
