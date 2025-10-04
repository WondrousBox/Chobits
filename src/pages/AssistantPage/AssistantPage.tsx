import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import React, { useEffect, useRef, useState, useCallback } from 'react'
import { TbDotsVertical, TbSend, TbX } from 'react-icons/tb';

const actions = ['新对话', '总结文件', '生成代码', '提取要点', '翻译', '重写优化']
type CommandItem = { key: string; title: string; hint?: string; ext?: string }
const commandPalette: CommandItem[] = [
  { key: 'new', title: '新对话', hint: '开始一个空白对话' },
  { key: 'summarize', title: '总结当前资源', hint: '对最近导入的文件生成摘要' },
  { key: 'code', title: '生成代码', hint: '根据描述输出代码片段' },
  { key: 'optimize', title: '优化文本', hint: '润色或改写所选文本' },
  { key: 'translate', title: '翻译', hint: '翻译到指定语言' },
  { key: 'search', title: '检索', hint: '对向量库执行语义检索' },
]

const AssistantPage: React.FC = () => {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [query, setQuery] = useState('')
  const [isCommandMode, setIsCommandMode] = useState(false)
  const [commandFilter, setCommandFilter] = useState('')
  const [commandIndex, setCommandIndex] = useState(0)
  const [recentContext, setRecentContext] = useState<{ clipboard?: string; resources: Array<{ id: string; title: string }> }>({ resources: [] })
  const [opening, setOpening] = useState(true)
  const [closing, setClosing] = useState(false)

  // 自动聚焦
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 10) }, [])

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

  // ESC 关闭
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); return }
      if (isCommandMode) {
        if (e.key === 'ArrowDown') { e.preventDefault(); setCommandIndex(i => Math.min(filteredCommands.length - 1, i + 1)); return }
        if (e.key === 'ArrowUp') { e.preventDefault(); setCommandIndex(i => Math.max(0, i - 1)); return }
        if (e.key === 'Enter') { e.preventDefault(); pickCommand(filteredCommands[commandIndex]); return }
        if (e.key === 'Tab') { e.preventDefault(); pickCommand(filteredCommands[commandIndex]); return }
      } else {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); return }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close, isCommandMode, commandIndex])

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

  const filteredCommands = isCommandMode ? commandPalette.filter(c => {
    if (!commandFilter) return true
    return c.title.includes(commandFilter) || c.key.includes(commandFilter)
  }) : []

  const enterCommandMode = () => {
    setIsCommandMode(true); setCommandFilter(''); setCommandIndex(0)
  }
  const leaveCommandMode = () => { setIsCommandMode(false); setCommandFilter(''); setCommandIndex(0) }

  const pickCommand = (cmd?: CommandItem) => {
    if (!cmd) return
    // 将命令转换为结构化提示占位（后续可替换）
    setQuery(prev => prev.replace(/^\/[^\s]*?$/, `/${cmd.key} `))
    leaveCommandMode()
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const send = () => {
    if (isCommandMode) { pickCommand(filteredCommands[commandIndex]); return }
    if (!query.trim()) return
    console.log('SEND:', query)
    // 新增：发送文本时同时作为资源写入（类型 text）
    ;(async () => {
      try {
        const id = (crypto as any)?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
        const now = Date.now()
        await window.YUA.resource.addResource({
          resource: {
            id,
            type: 'text',
            title: query.slice(0, 40),
            contentText: query,
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
    })()
    setQuery('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  // 监听输入内容识别命令模式
  const onChangeText = (v: string) => {
    setQuery(v)
    const slashMatch = v.match(/^\/(\S*)$/)
    if (slashMatch) {
      if (!isCommandMode) enterCommandMode()
      setCommandFilter(slashMatch[1])
    } else if (isCommandMode) {
      const still = v.match(/^\/(\S*)$/)
      if (!still) leaveCommandMode()
    }
  }

  return (
    <div className="w-full h-full font-sans pointer-events-auto select-none relative">
      <div className="drag-region flex items-center justify-between w-full h-10">
        <div className='flex items-center gap-1'>
          <div className='w-6 h-6 leading-6 text-center rounded-full bg-background text-foreground'><TbDotsVertical /></div>
          <div className='rounded-full bg-background text-foreground py-1 px-2 text-xs'> 按 ESC 关闭</div>
        </div>
        <Button className='rounded-full no-drag' size={"icon"} variant={"outline"} onClick={close} >
          <TbX />
        </Button>
      </div>
      {/* 居中浮层 */}
      <div className={`w-full max-h-[82vh] flex flex-col rounded-3xl overflow-hidden transition-all duration-180 ${opening ? 'opacity-0 scale-95' : closing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
        {/* 顶部条 */}

        {/* 输入区 */}
        <div className="drag-region space-y-2 py-4">
          <div className="flex items-start gap-3 relative no-drag">
            <div className="flex-1 relative">
              <Textarea
                ref={inputRef}
                value={query}
                onChange={e => onChangeText(e.target.value)}
                placeholder='输入问题，如：总结最近导入的 PDF...'
                className="resize-none max-h-[220px] box-border bg-background text-foreground mx-1 pb-12"
                style={{ width: 'calc(100% - 0.5rem)' }}
                onInput={e => {
                  const el = e.currentTarget; el.style.height = 'auto'; el.style.height = Math.min(220, el.scrollHeight) + 'px'
                }}
              />
              {isCommandMode && (
                <div className="absolute z-20 left-0 top-full mt-2 w-full rounded-2xl overflow-hidden border border-white/15 backdrop-blur-xl bg-[rgba(32,38,52,0.72)] shadow-xl">
                  <div className="max-h-72 overflow-auto py-2">
                    {filteredCommands.length === 0 && (
                      <div className="px-4 py-3 text-sm text-white/50">无匹配命令</div>
                    )}
                    {filteredCommands.map((c, i) => (
                      <button
                        key={c.key}
                        onMouseDown={e => { e.preventDefault(); pickCommand(c) }}
                        onMouseEnter={() => setCommandIndex(i)}
                        className={`w-full text-left px-4 py-2.5 flex flex-col gap-1 transition-colors ${i === commandIndex ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/10'}`}
                      >
                        <span className="text-[13px] font-medium">/{c.key} <span className="ml-2 opacity-70 font-normal">{c.title}</span></span>
                        {c.hint && <span className="text-[11px] leading-snug opacity-60">{c.hint}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

          <div className="absolute w-full bottom-2 left-4 text-xs text-muted-foreground">
            <span>{isCommandMode ? '输入命令关键字，↑↓ 选择，Enter 确认' : '输入 / 进入命令模式，Enter 发送， Shift+Enter 换行'}</span>
          </div>
            <Button
              variant={"outline"}
              onClick={send}
              disabled={!query.trim()}
              className="absolute right-2 bottom-2 bg-gradient-to-r from-indigo-500 to-cyan-400 text-white hover:brightness-110 active:scale-95 transition-all">发送 <TbSend />
            </Button>
          </div>
        </div>
        <div className="drag-region space-y-2 bg-background p-4 rounded-md mb-4">
          <div className="text-xs">常用功能</div>
          <div className="no-drag flex flex-wrap gap-2">
            {actions.map(a => (
              <Button size="sm" variant={"outline"} key={a}>{a}</Button>
            ))}
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-6 py-5 space-y-6 text-sm text-white/90 custom-scroll border bg-background">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">提示</h3>
            <div className="text-[13px] leading-relaxed text-white/60">
              这里会集成：上下文选择、资源引用、历史对话、工作区检索、插件工具、向量检索结果 等内容。当前为 UI 骨架，可继续扩展。
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">自动上下文</h3>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3">
              <div className="text-[12px] font-medium text-white/70">最近剪贴板</div>
              <div className="text-[12px] text-white/55 break-words whitespace-pre-wrap min-h-[20px] max-h-32 overflow-auto">
                {recentContext.clipboard ? recentContext.clipboard : <span className="opacity-40">(空)</span>}
              </div>
              <div className="text-[12px] font-medium text-white/70 pt-1">最近资源</div>
              <ul className="text-[12px] text-white/60 list-disc pl-5 space-y-1 max-h-40 overflow-auto">
                {recentContext.resources.length === 0 && <li className="opacity-40 list-none pl-0">(暂无数据占位)</li>}
                {recentContext.resources.map(r => <li key={r.id}>{r.title}</li>)}
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default AssistantPage
