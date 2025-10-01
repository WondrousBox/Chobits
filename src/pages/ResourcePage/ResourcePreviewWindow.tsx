import React, { useEffect, useState, useRef, useCallback } from 'react'
import { makeResSrc, isImageFile, isVideoFile, isAudioFile } from '@/lib/resourceProtocol'
import type { ResourceItem } from '@/types'

interface PreviewData extends ResourceItem {}

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
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)

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
      // 重置媒体
      try { if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0 } } catch {}
      try { if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0 } } catch {}
      // 轻微延迟后自动播放
      setTimeout(()=> {
        try { videoRef.current?.play()?.catch(()=>{}) } catch {}
        try { audioRef.current?.play()?.catch(()=>{}) } catch {}
      }, 60)
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
        } catch {}
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

  // 加载文本类资源内容（如果是本地文件，尝试 fetch(makeResSrc()) 简单读取）

  useEffect(()=> {
    if (!data) { setTextContent(''); return }
    if (data.type === 'text' || data.type === 'document' || data.type === 'file') {
      // 优先使用 contentText
      if ((data as any).contentText) {
        setTextContent((data as any).contentText || '')
        return
      }
      // 简单读取：如果是纯文本扩展名（.txt .md .log .json）尝试通过 fetch(makeResSrc())
      if (data.filePath) {
        const lower = data.filePath.toLowerCase()
        if (/(\.txt|\.md|\.log|\.json|\.csv|\.ts|\.js|\.tsx|\.jsx|\.py|\.go|\.rs|\.java|\.c|\.cpp|\.yml|\.yaml|\.toml|\.ini)$/i.test(lower)) {
          const src = makeResSrc(data.filePath)
          setLoadingText(true)
          fetch(src)
            .then(r => r.text())
            .then(t => setTextContent(t.slice(0, 20000)))
            .catch(()=> setTextContent('（无法加载文本内容）'))
            .finally(()=> setLoadingText(false))
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
  useEffect(()=> {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeWindow()
      }
      if (e.key === ' ' || e.code === 'Space') {
        if (audioRef.current) {
          e.preventDefault()
          if (audioRef.current.paused) audioRef.current.play().catch(()=>{}); else audioRef.current.pause()
        } else if (videoRef.current) {
          e.preventDefault()
          if (videoRef.current.paused) videoRef.current.play().catch(()=>{}); else videoRef.current.pause()
        }
      }
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && (audioRef.current || videoRef.current)) {
        const media = audioRef.current || videoRef.current
        if (media) {
          e.preventDefault()
          const delta = e.key === 'ArrowLeft' ? -5 : 5
          try { media.currentTime = Math.max(0, Math.min(media.duration || Infinity, media.currentTime + delta)) } catch {}
        }
      }
      if (e.key === 'PageUp') { e.preventDefault(); go(-1) }
      if (e.key === 'PageDown') { e.preventDefault(); go(1) }
      if ((e.key === 'ArrowLeft' && !audioRef.current && !videoRef.current) && list.length) { go(-1) }
      if ((e.key === 'ArrowRight' && !audioRef.current && !videoRef.current) && list.length) { go(1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, list.length])

  const closeWindow = () => {
    // @ts-ignore
    window.ipcRenderer?.invoke('window-close-self')
  }

  if (!data) {
    return (
      <div className='w-full h-full flex items-center justify-center bg-background text-muted-foreground text-sm'>等待资源数据...</div>
    )
  }

  const title = data.title || data.filePath || data.url || data.id
  const fileSrc = data.filePath ? makeResSrc(data.filePath) : data.url

  return (
    <div className='w-full h-full flex flex-col bg-background text-foreground overflow-hidden'>
      {/* Header */}
      <div className='flex items-center justify-between px-3 h-10 shrink-0 border-b bg-muted/40 backdrop-blur-sm select-none gap-3'>
        <div className='flex items-center gap-2 min-w-0 flex-1'>
          {list.length > 0 && (
            <>
              <button onClick={()=> go(-1)} disabled={!list.length} className='px-2 py-1 text-[11px] rounded-md bg-accent/60 hover:bg-accent disabled:opacity-40'>上一条</button>
              <button onClick={()=> go(1)} disabled={!list.length} className='px-2 py-1 text-[11px] rounded-md bg-accent/60 hover:bg-accent disabled:opacity-40'>下一条</button>
              <span className='text-[10px] text-muted-foreground'>{index >=0 ? index + 1 : '-'} / {list.length || '-'}</span>
            </>
          )}
          <div className='text-xs font-medium truncate' title={title}>{title}</div>
        </div>
        <div className='flex items-center gap-2'>
          <button onClick={closeWindow} className='px-2 py-1 text-[11px] rounded-md bg-destructive/80 text-destructive-foreground hover:bg-destructive transition-colors'>关闭</button>
        </div>
      </div>
      {/* Content */}
      <div className='flex-1 relative flex items-center justify-center p-2 bg-neutral-950/5'>
        {isImageFile(data.filePath) && fileSrc && (
          <img src={fileSrc} alt={title} className='max-w-full max-h-full object-contain rounded-md shadow' />
        )}
        {isVideoFile(data.filePath) && fileSrc && (
          <video ref={videoRef} src={fileSrc} controls autoPlay className='max-w-full max-h-full rounded-md shadow bg-black' />
        )}
        {isAudioFile(data.filePath) && fileSrc && (
          <div className='w-full max-w-xl flex flex-col items-stretch gap-3'>
            <audio ref={audioRef} src={fileSrc} controls autoPlay className='w-full' />
            <div className='text-[11px] text-muted-foreground px-1'>音频预览 - {title}</div>
          </div>
        )}
        {!isImageFile(data.filePath) && !isVideoFile(data.filePath) && !isAudioFile(data.filePath) && (
          <div className='text-xs text-muted-foreground max-w-[80%] break-words'>
            <div className='mb-2 font-medium'>资源类型: {data.type}</div>
            { (data.type === 'text' || textContent) && (
              <div className='w-full max-h-[70vh] overflow-auto rounded border bg-background/70 p-2 text-left whitespace-pre-wrap font-mono text-[11px] leading-relaxed shadow-inner'>
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
