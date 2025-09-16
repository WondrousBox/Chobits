import React, { useEffect, useState } from 'react'
import { ResourceItem } from '@/types'
import ExplorerGrid from './components/ExplorerGrid'

const ResourcePage: React.FC = () => {
  const [list, setList] = useState<ResourceItem[]>([])
  const [viewMode, setViewMode] = useState<'card' | 'list' | 'explorer'>('explorer')

  const load = async () => {
    try {
      const rows = await (window as any).YUA.resource['listResource']()
      setList(rows || [])
    } catch (e) { console.warn('load resources failed', e) }
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id: string) => {
    try {
      await window.YUA.resource.deleteResource({ id })
      setList(prev => prev.filter(i => i.id !== id))
    } catch (e) { console.warn('delete resource failed', e) }
  }

  return (<>
    <div className='flex items-center justify-between bg-background text-foreground p-4'>
      <div>资源管理 <span className='text-xs text-muted-foreground ml-2'>共 {list.length} 个资源</span> </div>
    </div>
    <div className='px-2 text-foreground h-full w-full bg-muted box-border overflow-y-auto' style={{ height: 'calc(100% - 48px)' }}>
      <ExplorerGrid
        items={list}
        onDelete={handleDelete}
      />
    </div>
  </>
  )
}

export default ResourcePage
