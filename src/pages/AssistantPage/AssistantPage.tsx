import { Button } from '@/components/ui/button';
import React, { useEffect, useState, useCallback } from 'react'
import { TbDotsVertical, TbX, TbDownload, TbWorld, TbLoader2 } from 'react-icons/tb';
import ChatInput from '@/components/AIAssistant/ChatInput';

type CommandItem = { key: string; title: string; hint?: string; ext?: string }

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
const commandPalette: CommandItem[] = [
  { key: 'new', title: '新对话', hint: '开始一个空白对话' },
  { key: 'summarize', title: '总结当前资源', hint: '对最近导入的文件生成摘要' },
  { key: 'code', title: '生成代码', hint: '根据描述输出代码片段' },
  { key: 'optimize', title: '优化文本', hint: '润色或改写所选文本' },
  { key: 'translate', title: '翻译', hint: '翻译到指定语言' },
  { key: 'search', title: '检索', hint: '对向量库执行语义检索' },
]

const AssistantPage: React.FC = () => {
  const [query, setQuery] = useState('')
  // 指令由 ChatInput 内部处理
  const [recentContext, setRecentContext] = useState<{ clipboard?: string; resources: Array<{ id: string; title: string }> }>({ resources: [] })
  const [opening, setOpening] = useState(true)
  const [closing, setClosing] = useState(false)
  const [showVideoButton, setShowVideoButton] = useState(false)
  const [showWebButton, setShowWebButton] = useState(false)
  const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false)
  const [isAnalyzingWeb, setIsAnalyzingWeb] = useState(false)

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

  // 自动收集上下文：最近资源 + 剪贴板
  useEffect(() => {
    let aborted = false
      ; (async () => {
        try {
          // 最近资源：示例调用（真实实现可添加 API 排序条件）
          let resources: any[] = []
          try {
            // 假设存在获取资源列表的 API（此处为占位，需按后端接口替换）
            // resources = await window.YUA.resource.listRecent({ limit: 5 })
          } catch { }
          // 剪贴板
          let clip: string | undefined
          try { clip = await navigator.clipboard.readText(); if (clip && clip.length > 160) clip = clip.slice(0, 157) + '…' } catch { }
          if (!aborted) setRecentContext({ clipboard: clip, resources: resources.slice(0, 5).map(r => ({ id: r.id, title: r.title })) })
        } catch { }
      })()
    return () => { aborted = true }
  }, [])

  const pickCommand = (cmd?: CommandItem) => { /* ChatInput will handle insertion; keep for optional side-effects */ }

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

  return (
    <div className="w-full h-full font-sans pointer-events-auto select-none relative">
      <div className="drag-region flex items-center justify-between w-full mb-2">
        <div className='flex items-center gap-1'>
          <div className='w-6 h-6 flex items-center justify-center rounded-full bg-background text-foreground'>
            <TbDotsVertical />
          </div>
          <div className='rounded-full bg-background text-foreground py-1 px-2 text-xs'> 按 ESC 关闭</div>
        </div>
        <Button className='rounded-full no-drag' size={"icon"} variant={"outline"} onClick={close} >
          <TbX />
        </Button>
      </div>
      {/* 居中浮层 */}
      <div className={`w-full max-h-[82vh] flex flex-col overflow-hidden transition-all duration-180 ${opening ? 'opacity-0 scale-95' : closing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
        {/* 顶部条 */}

        {/* 输入区（统一使用 ChatInput，内置指令匹配） */}
        <div className="drag-region space-y-2">
          <div className="flex items-start gap-3 relative no-drag">
            <div className="flex-1 relative">
              <ChatInput
                value={query}
                onChange={onChangeText}
                placeholder="输入问题，如：总结最近导入的 PDF..."
                autoFocus
                onStart={send}
                commands={commandPalette}
                onCommandPick={pickCommand}
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
                        className="bg-gradient-to-r from-red-500 to-pink-500 text-white hover:brightness-110 active:scale-95 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                        {isAnalyzingVideo ? (
                          <>
                            <TbLoader2 className="animate-spin" />
                            分析中...
                          </>
                        ) : (
                          <>
                            <TbDownload />
                            下载视频
                          </>
                        )}
                      </Button>
                    )}
                    {showWebButton && (
                      <Button
                        variant={"outline"}
                        onClick={handleAnalyzeWeb}
                        disabled={isAnalyzingWeb}
                        className="bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:brightness-110 active:scale-95 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                        {isAnalyzingWeb ? (
                          <>
                            <TbLoader2 className="animate-spin" />
                            分析中...
                          </>
                        ) : (
                          <>
                            <TbWorld />
                            分析网页
                          </>
                        )}
                      </Button>
                    )}
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
