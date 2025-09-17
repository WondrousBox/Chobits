import React, { useEffect, useMemo, useState } from 'react'
import { ResourceItem } from '@/types'
import ExplorerGrid from './components/ExplorerGrid'

const ResourcePage: React.FC = () => {
  const [list, setList] = useState<ResourceItem[]>([])
  const [viewMode, setViewMode] = useState<'card' | 'list' | 'explorer'>('explorer')
  const [workspaces, setWorkspaces] = useState<any[]>([])
  const [wsFilter, setWsFilter] = useState<string>('') // empty means all

  const load = async () => {
    try {
      const rows = await (window as any).YUA.resource['listResource']()
      setList(rows || [])
    } catch (e) { console.warn('load resources failed', e) }
  }

  useEffect(() => { load() }, [])

  useEffect(()=>{
    let mounted = true
    ;(async()=>{
      const ws = await (window as any).YUA.workspace['workspace:list']({ filter: { deletedAt: 0 }, limit: 100, offset: 0 })
      if (mounted) setWorkspaces(ws || [])
    })()
    return ()=>{ mounted = false }
  },[])

  const filtered = useMemo(()=>{
    if (!wsFilter) return list
    return list.filter((r:any)=> r.workspaceId === wsFilter)
  },[list, wsFilter])

  const handleDelete = async (id: string) => {
    try {
      await window.YUA.resource.deleteResource({ id })
      setList(prev => prev.filter(i => i.id !== id))
    } catch (e) { console.warn('delete resource failed', e) }
  }

  return (<>
    <div className='flex items-center justify-between bg-background text-foreground p-4'>
      <div>资源管理 <span className='text-xs text-muted-foreground ml-2'>共 {filtered.length}/{list.length} 个资源</span> </div>
      <div className='flex items-center gap-2'>
        <label className='text-sm opacity-80'>工作空间</label>
        <select className='bg-transparent border px-2 py-1 rounded' value={wsFilter} onChange={e=>setWsFilter(e.target.value)}>
          <option value=''>全部</option>
          {workspaces.map(w=> <option key={w.id} value={w.id}>{w.name}{w.isDefault===1?'（默认）':''}</option>)}
        </select>
      </div>
    </div>
    <div className='px-2 text-foreground h-full w-full bg-muted box-border overflow-y-auto' style={{ height: 'calc(100% - 48px)' }}>
      <ExplorerGrid
        items={filtered}
        onDelete={handleDelete}
      />
    </div>
  </>
  )
}

export default ResourcePage
