import { Button } from '@/components/ui/button';
import React, { useEffect, useState, useCallback, useRef } from 'react'
import { TbX, TbDownload, TbWorld, TbLoader2, TbMicrophone } from 'react-icons/tb';
import ChatInput from '@/components/AIAssistant/ChatInput';

// URL检测函数
const isVideoUrl = (url: string): boolean => {
  const videoPatterns = [
    /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/,
    /^https?:\/\/(www\.)?bilibili\.com\/video\/.+/,
    /^https?:\/\/(www\.)?bilibili\.com\/bangumi\/play\/.+/,
    /^https?:\/\/(www\.)?vimeo\.com\/.+/,
    /^https?:\/\/(www\.)?dailymotion\.com\/video\/.+/,
    /^https?:\/\/(www\.)?twitch\.tv\/videos\/.+/,
    /^https?:\/\/(www\.)?tiktok\.com\/@.+\/video\/.+/,
    /^https?:\/\/(www\.)?douyin\.com\/video\/.+/,
    /^https?:\/\/(www\.)?iqiyi\.com\/v_.+/,
    /^https?:\/\/(www\.)?youku\.com\/v_show\/.+/,
    /^https?:\/\/(www\.)?tencent\.com\/video\/.+/,
  ]
  return videoPatterns.some(pattern => pattern.test(url))
}

const isWebUrl = (text: string): boolean => {
  const urlPattern = /^https?:\/\/[^\s]+$/
  return urlPattern.test(text.trim())
}
const AssistantPage: React.FC = () => {
  const [query, setQuery] = useState('')
  const [phIndex, setPhIndex] = useState(() => Math.floor(Math.random() * 7))
  const [opening, setOpening] = useState(true)
  const [closing, setClosing] = useState(false)
  const [showVideoButton, setShowVideoButton] = useState(false)
  const [showWebButton, setShowWebButton] = useState(false)
  const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false)
  const [isAnalyzingWeb, setIsAnalyzingWeb] = useState(false)
  const contentRootRef = useRef<HTMLDivElement | null>(null)
  const inputBlockRef = useRef<HTMLDivElement | null>(null)

  const placeholders = [
    '输入问题，如：总结最近导入的 PDF...',
    '粘贴一段文字，让我帮你提炼要点',
    '帮我把这段中文翻译成英文',
    '写一个 TypeScript 函数组件示例',
    '下载这个视频并提取字幕（粘贴 URL: https://example.com/video/xxx）',
    '分析这个网页并输出摘要（粘贴 URL: https://example.com/）',
    '检索资源库中关于「会议纪要」的内容',
  ]

  // 自动聚焦由 ChatInput 控制

  // 进场动画结束标记
  useEffect(() => {
    const t = setTimeout(() => setOpening(false), 180)
    return () => clearTimeout(t)
  }, [])

  const reallyClose = () => { try { window.YUA.window.closeWindow('assistant') } catch { } }
  const close = useCallback(() => {
    if (closing) return
    setClosing(true)
    setTimeout(() => reallyClose(), 160) // 与动画时长匹配
  }, [closing])

  // ESC 关闭（仅全局监听 ESC）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  // 已移除自动上下文收集逻辑（剪贴板/最近资源）

  const send = async (content: string) => {
    if (!content.trim()) return
    try {
      const id = (crypto as any)?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const now = Date.now()
      await window.YUA.resource.addResource({
        resource: {
          id,
          type: 'text',
          title: content.slice(0, 40),
          contentText: content,
          collectedAt: now,
          createdAt: now,
          updatedAt: now,
          status: 'new'
        } as any
      })
      console.debug('[resource] text saved as resource', id)
    } catch (e) {
      console.warn('[resource] save text failed', e)
    }
  }

  const handleDownloadVideo = async () => {
    console.log('下载视频:', query)
    setIsAnalyzingVideo(true)
    try {
      // 获取视频信息
      const infoResult = await (window.YUA as any).videoDownloader.getVideoInfo(query)
      if (!infoResult.success) {
        console.error('获取视频信息失败:', infoResult.error)
        return
      }

      const videoInfo = infoResult.data
      console.log('视频信息:', videoInfo)

      // 开始下载
      const downloadResult = await (window.YUA as any).videoDownloader.downloadVideo({
        url: query,
        filename: videoInfo.filename || `${videoInfo.title}.${videoInfo.ext}`
      })

      if (downloadResult.success) {
        console.log('下载任务已创建:', downloadResult.data.taskId)

        // 下载任务已创建，进度将由主进程直接处理
        console.log('下载任务已创建，进度将在主窗口任务栏中显示')

        // 关闭当前助手窗口
        setTimeout(() => {
          close()
        }, 500) // 延迟500ms让用户看到成功反馈

      } else {
        console.error('创建下载任务失败:', downloadResult.error)
      }
    } catch (error) {
      console.error('下载视频时出错:', error)
    } finally {
      setIsAnalyzingVideo(false)
    }
  }

  const handleAnalyzeWeb = async () => {
    console.log('分析网页:', query)
    setIsAnalyzingWeb(true)
    try {
      // 这里可以实现网页分析逻辑
      // 例如：获取网页内容、提取关键信息等
      console.log('网页分析功能待实现')
      // 模拟分析过程
      await new Promise(resolve => setTimeout(resolve, 2000))
    } catch (error) {
      console.error('分析网页时出错:', error)
    } finally {
      setIsAnalyzingWeb(false)
    }
  }

  // 监听输入内容识别命令模式和URL
  const onChangeText = (v: string) => {
    setQuery(v)
    // 检测URL并设置按钮状态
    const trimmedQuery = v.trim()
    if (isWebUrl(trimmedQuery)) {
      if (isVideoUrl(trimmedQuery)) {
        setShowVideoButton(true)
        setShowWebButton(false)
      } else {
        setShowVideoButton(false)
        setShowWebButton(true)
      }
    } else {
      setShowVideoButton(false)
      setShowWebButton(false)
    }
  }

  // 轮换占位文案：仅在输入为空时，每 2 秒切换一次
  useEffect(() => {
    const isEmpty = !query.trim()
    if (!isEmpty) return
    const t = setInterval(() => {
      setPhIndex((i) => (i + 1) % placeholders.length)
    }, 3000)
    return () => clearInterval(t)
  }, [query, placeholders.length])

  // 根据内容高度动态调整窗口大小（含首次渲染）
  useEffect(() => {
    let disposed = false
    let debounceTimer: number | null = null

    const adjustWindowSize = async () => {
      try {
        // 避免频繁调用：简单防抖
        if (debounceTimer) window.clearTimeout(debounceTimer)
        debounceTimer = window.setTimeout(async () => {
          if (disposed) return
          const html = document.documentElement
          // 以“输入区”的可视底部作为目标高度（再加少量边距）
          const blockEl = inputBlockRef.current
          const blockRect = blockEl?.getBoundingClientRect()
          const extraMargin = 12 // 覆盖 ChatInput 自身的 my-2 以及底部安全边距
          const contentHeight = Math.ceil((blockRect?.bottom ?? window.innerHeight) + extraMargin)
          // 宽度保持不变，使用当前窗口宽度
          const currentWidth = window.innerWidth || html.clientWidth

          // 获取屏幕工作区限制
          let maxW = Number.POSITIVE_INFINITY
          let maxH = Number.POSITIVE_INFINITY
          try {
            const screen = await window.YUA.window.getScreenSize()
            maxW = screen.width
            maxH = screen.height
          } catch { }

          const minW = 360
          const minH = 100
          const desiredWidth = Math.max(minW, Math.min(currentWidth, maxW))
          // 给一点安全边距，避免阴影裁切
          const padding = 0
          const desiredHeight = Math.max(minH, Math.min(contentHeight + padding, maxH))

          // assistant 窗口不需要在每次调整时居中，避免跳动
          await window.YUA.window.setWindowSize('assistant', desiredWidth, desiredHeight)
        }, 90)
      } catch { }
    }

    // 首次渲染后调整一次
    adjustWindowSize()

    // 监听内容尺寸变化
    const target = inputBlockRef.current || contentRootRef.current || document.body
    const ro = new ResizeObserver(() => adjustWindowSize())
    try { ro.observe(target) } catch { /* noop */ }

    // 监听窗口尺寸变化（例如开发者工具导致布局变化）
    const onWinResize = () => adjustWindowSize()
    window.addEventListener('resize', onWinResize)

    return () => {
      disposed = true
      if (debounceTimer) window.clearTimeout(debounceTimer)
      try { ro.disconnect() } catch { }
      window.removeEventListener('resize', onWinResize)
    }
  }, [])

  return (
    <div ref={contentRootRef} className="w-full h-full font-sans pointer-events-auto select-none relative drag-region">
      {/* 居中浮层 */}
      <div className={`w-full flex flex-col overflow-hidden transition-all duration-180 ${opening ? 'opacity-0 scale-95' : closing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
        <Button className='rounded-full no-drag absolute top-2 right-2 z-10' size={"icon"} variant={"ghost"} onClick={close} >
          <TbX />
        </Button>

        {/* 输入区（统一使用 ChatInput，内置指令匹配） */}
        <div className="drag-region space-y-2">
          <div ref={inputBlockRef} className="flex items-start gap-3 relative no-drag">
            <div className="flex-1 relative">
              <ChatInput
                value={query}
                onChange={onChangeText}
                placeholder={placeholders[phIndex % placeholders.length]}
                autoFocus
                onStart={send}
                footerLeft={(
                  <></>
                )}
                footerRightExtra={(
                  <>
                    {showVideoButton && (
                      <Button
                        variant={"outline"}
                        onClick={handleDownloadVideo}
                        disabled={isAnalyzingVideo}
                        size={"icon"}
                        className="no-drag rounded-full bg-gradient-to-r from-red-500 to-pink-500 text-white hover:brightness-110 active:scale-95 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                        {
                          isAnalyzingVideo ? <TbLoader2 className="animate-spin" /> : <TbDownload />
                        }
                      </Button>
                    )}
                    {showWebButton && (
                      <Button
                        variant={"outline"}
                        onClick={handleAnalyzeWeb}
                        disabled={isAnalyzingWeb}
                        size={"icon"}
                        className="no-drag rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:brightness-110 active:scale-95 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                        {
                          isAnalyzingWeb ? <TbLoader2 className="animate-spin" /> : <TbWorld />
                        }
                      </Button>
                    )}

                      <Button
                        variant={"outline"}
                        size={"icon"}
                        className="no-drag rounded-full bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:brightness-110 active:scale-95 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                        <TbMicrophone />
                      </Button>
                  </>
                )}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AssistantPage
