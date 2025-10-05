import React, { useEffect, useState, useRef, useCallback } from 'react'
import { makeResSrc, isImageFile, isVideoFile, isAudioFile } from '@/lib/resourceProtocol'
import type { ResourceItem } from '@/types'
import { Button } from '@/components/ui/button'
import DragAbleTitle from '@/components/common/DragAbleTitle'
import { MediaPlayer } from '@/components/MediaPlayer'

interface PreviewData extends ResourceItem { }

interface IncomingPayload {
  current: PreviewData
  list?: PreviewData[]
  index?: number
}

const ResourcePreviewWindow: React.FC = () => {
  const [data, setData] = useState<PreviewData | null>(null)
  const [list, setList] = useState<PreviewData[]>([])
  const [index, setIndex] = useState<number>(-1)
  const [textContent, setTextContent] = useState<string>('')
  const [loadingText, setLoadingText] = useState(false)

  const go = useCallback((dir: 1 | -1) => {
    setIndex(prev => {
      if (!list.length) return prev
      let next = prev + dir
      if (next < 0) next = list.length - 1
      if (next >= list.length) next = 0
      const target = list[next]
      if (target) {
        setData(target)
      }
      return next
    })
  }, [list])

  // 监听资源数据推送
  useEffect(() => {
    const handler = (_e: any, payload: IncomingPayload | PreviewData) => {
      console.log(payload);

      if ((payload as any).current) {
        const p = payload as IncomingPayload
        setData(p.current)
        setList(p.list || [])
        setIndex(typeof p.index === 'number' ? p.index : (p.list ? p.list.findIndex(r => r.id === p.current.id) : -1))
      } else {
        setData(payload as PreviewData)
        setList([])
        setIndex(-1)
      }
    }
    // @ts-ignore
    window.ipcRenderer?.on('openWindowReadyData', handler)
    // 如果 120ms 后仍未接收到数据，主动拉取缓存（避免 race）
    const timer = setTimeout(async () => {
      if (!data) {
        try {
          // @ts-ignore
          const cached = await window.YUA.window.getWindowPayload('resourcePreview')
          if (cached && !data) {
            // 模拟事件处理逻辑
            handler(null, cached)
          }
        } catch { }
      }
    }, 120)

    console.log(
      "ResourcePreviewWindow mounted with data: "
    );

    window.YUA.window.openWindowReady('resourcePreview')
    return () => {
      // @ts-ignore
      window.ipcRenderer?.off('openWindowReadyData', handler)
      clearTimeout(timer)
    }
  }, [])

  // 加载文本类资源内容（通过主进程读取文件内容）

  useEffect(() => {
    if (!data) { setTextContent(''); return }
    if (data.type === 'text' || data.type === 'document' || data.type === 'file') {
      // 优先使用 contentText
      if ((data as any).contentText) {
        setTextContent((data as any).contentText || '')
        return
      }
      // 通过主进程读取文件内容
      if (data.filePath) {
        const lower = data.filePath.toLowerCase()
        if (/(\.txt|\.md|\.log|\.json|\.csv|\.ts|\.js|\.tsx|\.jsx|\.py|\.go|\.rs|\.java|\.c|\.cpp|\.yml|\.yaml|\.toml|\.ini)$/i.test(lower)) {
          setLoadingText(true)
          window.YUA.file['file:readContent'](data.filePath, 20000)
            .then((result: any) => {
              if (result.success) {
                let content = result.content || ''
                if (result.truncated) {
                  content += `\n\n...（文件已截取，原始大小: ${Math.round(result.originalSize / 1024)}KB）`
                }
                setTextContent(content)
              } else {
                setTextContent('（无法加载文本内容）')
              }
            })
            .catch(() => setTextContent('（无法加载文本内容）'))
            .finally(() => setLoadingText(false))
          return
        }
      }
      setTextContent('（暂无提取文本）')
    } else {
      setTextContent('')
    }
  }, [data])

  // END: resource subscription

  // 键盘快捷键
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        try { window.YUA.window?.closeWindow('resourcePreview'); } catch { }
      }
      if (e.key === 'PageUp') { e.preventDefault(); go(-1) }
      if (e.key === 'PageDown') { e.preventDefault(); go(1) }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && list.length) { 
        e.preventDefault()
        go(e.key === 'ArrowLeft' ? -1 : 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, list.length])

  if (!data) {
    return (
      <div className='w-full h-full flex items-center justify-center bg-background text-muted-foreground text-sm'>等待资源数据...</div>
    )
  }

  const title = data.title || data.filePath || data.url || data.id
  const fileSrc = data.filePath ? makeResSrc(data.filePath) : data.url

  return (
    <div className='w-full h-full bg-background text-foreground overflow-hidden'>
      {/* Header */}
      <DragAbleTitle
        title={<div className='text-xs font-medium truncate'>{title}</div>}
        actions={
          <>
            <div className='flex items-center gap-2 min-w-0 flex-1'>
              {
                list.length > 0 && (
                  <>
                    <Button onClick={() => go(-1)} disabled={!list.length}>上一条</Button>
                    <Button onClick={() => go(1)} disabled={!list.length}>下一条</Button>
                    <span className='text-[10px] text-muted-foreground'>{index >= 0 ? index + 1 : '-'} / {list.length || '-'}</span>
                  </>
                )
              }
            </div>
          </>
        }
      />
      {/* Content */}
      <div className='h-full relative flex items-center justify-center overflow-hidden' style={{ height: 'calc(100% - 36px)' }}>
        {isImageFile(data.filePath) && fileSrc && (
          <img src={fileSrc} alt={title} className='max-w-full max-h-full object-contain rounded-md shadow' />
        )}
        {isVideoFile(data.filePath) && fileSrc && (
          <MediaPlayer
            src={fileSrc}
            type="video"
            title={title}
            autoPlay={true}
            className="w-full h-full"
          />
        )}
        {isAudioFile(data.filePath) && fileSrc && (
          <MediaPlayer
            src={fileSrc}
            type="audio"
            title={title}
            autoPlay={true}
            className="w-full max-w-xl"
          />
        )}
        {!isImageFile(data.filePath) && !isVideoFile(data.filePath) && !isAudioFile(data.filePath) && (
          <div className='w-full h-full text-xs text-muted-foreground break-words'>
            {(data.type === 'text' || textContent) && (
              <div className='w-full h-full box-border select-text overflow-auto rounded border px-2 text-left whitespace-pre-wrap font-mono text-xs leading-relaxed shadow-inner'>
                {loadingText ? '加载中…' : (textContent || '（无文本内容）')}
              </div>
            )}
            {!(data.type === 'text') && !textContent && fileSrc && (
              <div className='text-[11px] break-all'>来源: {fileSrc}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ResourcePreviewWindow
