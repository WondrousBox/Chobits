import React, { useEffect, useMemo, useState } from 'react'
import type { SpriteAnimation } from '@/types/sprite'
import { Button } from '@/components/ui/button'
import { useSpritePlayer } from '@/context/SpritePlayerContext'
import { makeResSrc } from '@/lib/resourceProtocol'

function baseName(p: string) {
  const parts = p.replace(/\\/g, '/').split('/')
  const last = parts[parts.length - 1] || ''
  return last
}

export default function SpriteManager() {
  const [list, setList] = useState<SpriteAnimation[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  const { currentId, setCurrent } = useSpritePlayer()

  const refresh = async () => {
    setLoading(true)
    try {
      const items = await window.YUA.sprite.list()
      setList(items || [])
    } catch (e) {
      console.warn('sprite:list failed', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const onImport = async () => {
    try {
      setAdding(true)
      const pick = await window.YUA.file['file:pickFile']({
        filters: [
          { name: 'Videos', extensions: ['webm', 'mp4', 'mov', 'mkv', 'ogg', 'ogv'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        multi: false,
      })
      if (pick.canceled || !pick.path) return
  const title = baseName(pick.path)
  const id = 'sprite-' + Math.random().toString(36).slice(2, 10)
  await window.YUA.sprite.register({ filePath: pick.path, meta: { id, title } })
      await refresh()
    } catch (e) {
      console.warn('sprite:register failed', e)
    } finally {
      setAdding(false)
    }
  }

  const onRemove = async (id: string) => {
    try {
      await window.YUA.sprite.remove(id, true)
      await refresh()
    } catch (e) {
      console.warn('sprite:remove failed', e)
    }
  }

  return (
    <div className='space-y-4 p-2'>
      <div className='flex justify-between items-center'>
        <div className='text-sm text-muted-foreground'>已注册动画：{list.length}</div>
        <div className='flex gap-2'>
          <Button size='sm' onClick={refresh} disabled={loading}>刷新</Button>
          <Button size='sm' onClick={onImport} disabled={adding}>{adding ? '导入中…' : '导入视频'}</Button>
        </div>
      </div>

      <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'>
        {list.map(item => {
          const isCurrent = item.meta.id === currentId
          const src = item.source?.localPath ? makeResSrc(item.source.localPath) : (item.source?.src || '')
          const type = item.source?.type || 'video/webm'
          return (
            <div key={item.meta.id} className='bg-card border border-border rounded-lg p-3 flex gap-3'>
              <div className='shrink-0'>
                {src ? (
                  <video width={120} height={140} muted playsInline autoPlay loop className='rounded-md bg-muted'>
                    <source src={src} type={type} />
                  </video>
                ) : (
                  <div className='w-[120px] h-[140px] rounded-md bg-muted' />
                )}
              </div>
              <div className='flex-1 min-w-0 flex flex-col gap-2'>
                <div className='font-medium text-foreground truncate'>{item.meta.title || item.meta.id}</div>
                <div className='text-xs text-muted-foreground truncate'>{item.meta.id}</div>
                <div className='text-xs text-muted-foreground truncate'>{item.width}x{item.height} · {item.source?.type}</div>
                <div className='mt-auto flex gap-2'>
                  {!isCurrent && (
                    <Button size='sm' variant='outline' onClick={() => setCurrent(item.meta.id)}>设为当前</Button>
                  )}
                  <Button size='sm' variant='destructive' onClick={() => onRemove(item.meta.id)}>删除</Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
