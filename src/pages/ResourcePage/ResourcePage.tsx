import React, { useEffect, useMemo, useState } from 'react'
import { ResourceItem } from '@/types'
import ExplorerGrid from './components/ExplorerGrid'
import { ScrollArea } from '@radix-ui/react-scroll-area'

const ResourcePage: React.FC = () => {
  const [list, setList] = useState<ResourceItem[]>([])
  const [viewMode, setViewMode] = useState<'card' | 'list' | 'explorer'>('explorer')
  const [workspaces, setWorkspaces] = useState<any[]>([])
  const [wsFilter, setWsFilter] = useState<string>('') // empty means all
  const [typeFilter, setTypeFilter] = useState<string>('') // empty means all types

  const load = async () => {
    try {
      const rows = await (window as any).YUA.resource['listResource']()
      setList(rows || [])
    } catch (e) { console.warn('load resources failed', e) }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    let mounted = true
      ; (async () => {
        const ws = await (window as any).YUA.workspace['workspace:list']({ filter: { deletedAt: 0 }, limit: 100, offset: 0 })
        if (mounted) setWorkspaces(ws || [])
      })()
    return () => { mounted = false }
  }, [])

  const typeOptions = useMemo(() => {
    const set = new Set<string>()
    list.forEach(i => { if (i.type) set.add(i.type) })
    return Array.from(set.values()).sort()
  }, [list])

  const filtered = useMemo(() => {
    return list.filter((r: any) => {
      if (wsFilter && r.workspaceId !== wsFilter) return false
      if (typeFilter && r.type !== typeFilter) return false
      return true
    })
  }, [list, wsFilter, typeFilter])

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
        <select className='bg-transparent border px-2 py-1 rounded' value={wsFilter} onChange={e => setWsFilter(e.target.value)}>
          <option value=''>全部</option>
          {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}{w.isDefault === 1 ? '（默认）' : ''}</option>)}
        </select>
      </div>
    </div>
    <div className='px-2 text-foreground h-full w-full bg-muted box-border overflow-y-auto' style={{ height: 'calc(100% - 48px)' }}>
      <div className='flex h-full gap-2'>
        <div className='w-36 h-full border-r pr-2 flex flex-col text-sm pt-2'>
          <div className='font-medium mb-2 px-2'>分类</div>
          <button
            className={`text-left px-2 py-1 rounded hover:bg-accent hover:text-accent-foreground transition ${typeFilter === '' ? 'bg-accent text-accent-foreground' : ''}`}
            onClick={() => setTypeFilter('')}
          >全部 ({list.length})</button>
          <div className='flex-1 overflow-y-auto mt-1 space-y-0.5'>
            {typeOptions.map(t => (
              <button
                key={t}
                className={`w-full text-left px-2 py-1 rounded hover:bg-accent hover:text-accent-foreground truncate transition ${typeFilter === t ? 'bg-accent text-accent-foreground' : ''}`}
                onClick={() => setTypeFilter(t)}
                title={t}
              >{t} ({list.filter(i => i.type === t).length})</button>
            ))}
          </div>
        </div>
        <div className='flex-1 h-full overflow-y-auto'>
          <ExplorerGrid
            items={filtered}
            onDelete={handleDelete}
          />
        </div>
      </div>

    </div>
  </>
  )
}

export default ResourcePage
