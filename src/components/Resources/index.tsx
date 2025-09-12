import React, { useEffect, useState } from 'react'

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

  return (
    <div className='p-4 text-foreground bg-background'>
      <div className='text-xl mb-3'>📚 资源管理</div>
      <div className='mb-3'>共 {list.length} 个资源</div>
      <div className='space-y-2'>
        {list.map(item => (
          <div key={item.id} className='border border-border rounded p-3 flex items-center justify-between'>
            <div className='truncate'>
              <div className='font-medium truncate'>{item.title || item.filePath || item.url || item.id}</div>
              <div className='text-sm text-muted-foreground'>类型: {item.type} · 创建时间: {item.createdAt ? new Date(item.createdAt).toLocaleString() : '-'}</div>
            </div>
            <div className='flex items-center gap-2'>
              <button className='px-3 py-1 border rounded' onClick={() => handleDelete(item.id)}>删除</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default Resources
