import React, { useEffect, useState, useCallback } from 'react'
import type { SpriteAnimation } from '@/types/sprite'
import { Button } from '@/components/ui/button'
import { makeResSrc } from '@/lib/resourceProtocol'
import { TbPlayerPlay } from 'react-icons/tb'

function baseName(p: string) {
  const parts = p.replace(/\\/g, '/').split('/')
  const last = parts[parts.length - 1] || ''
  return last
}

// 小型预览组件：只有在 hover 时才真正挂载 <video>，离开时卸载，避免同时占用大量资源
// 精灵预览：静止首帧，hover 播放循环
function SpritePreview({ src, type, width, height }: { src: string; type: string; width: number; height: number }) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null)

  // 初始：停在首帧
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.pause()
    try { v.currentTime = 0 } catch { }
  }, [src])

  const handleEnter = useCallback(() => {
    const v = videoRef.current
    if (v) {
      v.loop = true
      v.play().catch(() => { })
    }
  }, [])

  const handleLeave = useCallback(() => {
    const v = videoRef.current
    if (v) {
      v.pause()
      try { v.currentTime = 0 } catch { }
    }
  }, [])

  return (
    <div
      className='group relative inline-block rounded-md overflow-hidden select-none transition hover:ring-2 hover:ring-primary/70 hover:shadow-md ring-offset-1'
      style={{ width, height }}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      aria-label='鼠标悬停预览'
    >
      <video
        ref={videoRef}
        width={width}
        height={height}
        muted
        playsInline
        // 不自动播放，只有 hover / always 时才 play()
        preload='metadata'
        className='h-full w-full object-cover bg-muted pointer-events-none'
      >
        <source src={src} type={type} />
      </video>
      <div className='pointer-events-none absolute bottom-1 right-1 rounded bg-black/55 px-1.5 py-[2px] text-[10px] leading-none text-white opacity-0 group-hover:opacity-100 transition-opacity'>
        <TbPlayerPlay className='w-4 h-4' />
      </div>
    </div>
  )
}

export default function SpriteManager() {
  const [list, setList] = useState<SpriteAnimation[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState(false)
  // 去除“设为当前”功能后不再需要状态上下文

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
    <div className='h-full'>
      <div className='flex justify-between items-center px-2'>
        <div className='text-sm text-muted-foreground'>已注册动画：{list.length}</div>
        <div className='flex gap-2'>
          <Button size='sm' onClick={refresh} disabled={loading}>刷新</Button>
          <Button size='sm' onClick={onImport} disabled={adding}>{adding ? '导入中…' : '导入视频'}</Button>
        </div>
      </div>

  {/* 防止窗口增高时 Grid 行被平均拉伸：content-start(items-start) 让多余空间留在容器底部 */}
  <div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 overflow-y-auto content-start items-start' style={{ height: 'calc(100% - 32px)' }}>
        {list.map(item => {
          const src = item.source?.localPath ? makeResSrc(item.source.localPath) : (item.source?.src || '')
          const type = item.source?.type || 'video/webm'
          return (
            <div key={item.meta.id} className='bg-card border border-border rounded-lg p-3 flex gap-3'>
              <div className='shrink-0'>
                {src ? (
                  <SpritePreview src={src} type={type} width={120} height={140} />
                ) : (
                  <div className='w-[120px] h-[140px] rounded-md bg-muted' />
                )}
              </div>
              <div className='flex-1 min-w-0 flex flex-col gap-2'>
                <div className='font-medium text-foreground truncate'>{item.meta.title || item.meta.id}</div>
                <div className='text-xs text-muted-foreground truncate'>{item.meta.id}</div>
                <div className='text-xs text-muted-foreground truncate'>{item.width}x{item.height} · {item.source?.type}</div>
                <div className='mt-auto flex gap-2'>
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
