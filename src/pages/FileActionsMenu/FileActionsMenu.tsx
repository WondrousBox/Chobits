import React, { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

type FileInfo = { name: string; path?: string; mime?: string }

type ActionItem = {
  id: string
  label: string
  icon: string
  run: () => Promise<void> | void
}

function extOf(name?: string) { return (name?.split('.').pop() || '').toLowerCase() }
function guessKind(file: FileInfo) {
  const ext = extOf(file.name)
  const mime = (file.mime || '').toLowerCase()
  if (/docx?/.test(ext) || /word/.test(mime)) return 'doc'
  if (/(mp3|wav|m4a|flac|aac|ogg)$/i.test(ext) || /^audio\//.test(mime)) return 'audio'
  if (/(mp4|mov|mkv|webm|avi)$/i.test(ext) || /^video\//.test(mime)) return 'video'
  if (/(png|jpg|jpeg|webp|gif|bmp|tiff)$/i.test(ext) || /^image\//.test(mime)) return 'image'
  if (ext === 'pdf' || /pdf/.test(mime)) return 'pdf'
  return 'other'
}

const FileActionsMenu: React.FC = () => {
  const [files, setFiles] = useState<FileInfo[]>([])
  const primary = files[0]
  alert(primary)
  const kind = primary ? guessKind(primary) : 'other'

  useEffect(() => {
    // 接收主进程传来的文件数据
    const handler = (_: any, payload: any) => {
      try {
        if (payload?.files && Array.isArray(payload.files)) {
          setFiles(payload.files as FileInfo[])
        }
      } catch {}
    }
  window.ipcRenderer?.on('openWindowReadyData', handler)
    // 主动请求一次（若已经存在缓存）
    ;(async () => {
      try {
        const data = await window.YUA.window.getWindowPayload('fileActionsMenu' as any)
        if (data?.files) setFiles(data.files)
      } catch {}
    })()
    return () => { try { window.ipcRenderer?.off('openWindowReadyData', handler as any) } catch {} }
  }, [])

  const actions = useMemo<ActionItem[]>(() => {
    const list: ActionItem[] = []
    const closeAfter = async (fn: () => Promise<void> | void) => {
      try { await fn() } finally { try { await window.YUA.window.closeWindow('fileActionsMenu' as any) } catch {} }
    }
    const summarizeDoc = () => closeAfter(async () => {
      // 资源已添加，打开助手窗口继续处理
      try { await window.YUA.window.openWindow('assistant' as any) } catch {}
    })
    const makeCards = () => closeAfter(async () => { try { await window.YUA.window.openWindow('assistant' as any) } catch {} })
    const transcribeAudio = () => closeAfter(async () => { try { /* TODO: 调用转写 */ } catch {} })
    const convertAudio = () => closeAfter(async () => { try { /* TODO: ffmpeg 转码 */ } catch {} })
    const transcodeVideo = () => closeAfter(async () => { try { /* TODO: ffmpeg 转码 */ } catch {} })
    const extractKeyframes = () => closeAfter(async () => { try { /* TODO: 关键帧提取 */ } catch {} })
    const analyzeImage = () => closeAfter(async () => { try { await window.YUA.window.openWindow('assistant' as any) } catch {} })
    const parsePdf = () => closeAfter(async () => { try { await window.YUA.window.openWindow('assistant' as any) } catch {} })

    if (kind === 'doc') {
      list.push({ id: 'doc-sum', label: '总结文档', icon: '📝', run: summarizeDoc })
      list.push({ id: 'doc-cards', label: '生成阅读卡片', icon: '🗂️', run: makeCards })
  // no explicit import action; resources are already added
    } else if (kind === 'audio') {
      list.push({ id: 'audio-stt', label: '识别文字（转写）', icon: '🗣️', run: transcribeAudio })
      list.push({ id: 'audio-transcode', label: '转码/压缩', icon: '🎛️', run: convertAudio })
  // already added
    } else if (kind === 'video') {
      list.push({ id: 'video-transcode', label: '转码/压缩', icon: '🎬', run: transcodeVideo })
      list.push({ id: 'video-keyframes', label: '提取关键帧', icon: '🖼️', run: extractKeyframes })
  // already added
    } else if (kind === 'image') {
      list.push({ id: 'image-analyze', label: '图像理解', icon: '🧠', run: analyzeImage })
  // already added
    } else if (kind === 'pdf') {
      list.push({ id: 'pdf-parse', label: '解析/总结 PDF', icon: '📄', run: parsePdf })
  // already added
    } else {
  // generic: already added
    }
    return list
  }, [files, kind])

  console.log(actions);
  alert(kind);
  

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 pointer-events-auto z-[10000] bg-transparent"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={() => window.YUA.window.closeWindow('fileActionsMenu' as any)}
      >
        <div className="relative w-full h-full">
          <div className="absolute inset-0" />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] rounded-3xl border border-white/15 backdrop-blur-xl bg-[rgba(20,22,30,0.78)] shadow-2xl p-6 text-white select-none" onClick={e => e.stopPropagation()}>
            <div className="text-sm opacity-80 mb-3">已添加到资源库 · 选择下一步操作</div>
            {primary && (
              <div className="mb-5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-lg">{files.length > 1 ? '📦' : '📄'}</div>
                <div className="flex-1 min-w-0">
                  <div className="truncate text-[13px] font-medium">{files.length > 1 ? `${files.length} 个文件` : primary.name}</div>
                  {primary.path && <div className="truncate text-[11px] opacity-60">{primary.path}</div>}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              {actions.map(a => (
                <button key={a.id} className="group rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 active:scale-[0.99] transition-all p-4 text-left flex items-center gap-3" onClick={() => a.run()}>
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-xl">{a.icon}</div>
                  <div className="flex-1">
                    <div className="text-[13px] font-medium">{a.label}</div>
                    {/* 可加提示 */}
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button className="text-xs opacity-70 hover:opacity-100" onClick={() => window.YUA.window.closeWindow('fileActionsMenu' as any)}>取消</button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

export default FileActionsMenu
