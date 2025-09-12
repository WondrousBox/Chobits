import React, { useEffect, useRef, useState } from 'react'
import Messages from '.'
import type { MessageCategory, MessageContext } from './types'
import { cn } from '@/lib/utils'

export interface MessageBubbleProps {
  autoHideMs?: number // 0 or undefined to keep visible
  className?: string
  state?: MessageCategory
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  autoHideMs = 6000,
  className,
  state
}) => {
  const [visible, setVisible] = useState(false)
  const [content, setContent] = useState('')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [bubble, setBubble] = useState<{ category: MessageCategory; ctx?: MessageContext; text?: string }>({ category: 'welcome' })

  const { category, ctx, text } = bubble

  useEffect(() => {
    if (state) {
      setBubble({ category: state })
    }
    // setBubble({ category: 'drop', ctx: { count: 1, singleName } })
    // setBubble({ category: 'drop', ctx: { count: details.length, names } })
  }, [state])

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    const computed = category === 'custom' ? (text ?? '') : Messages.t(category as MessageCategory, ctx)
    if (!computed) {
      setVisible(false)
      return
    }

    setContent(computed)
    setVisible(true)

    if (autoHideMs && autoHideMs > 0) {
      timerRef.current = setTimeout(() => setVisible(false), autoHideMs)
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
    // stringify ctx to retrigger when deep-changed, but keep it small
  }, [category, text, autoHideMs, JSON.stringify(ctx)])

  if (!visible) return null

  return (
    <div
      className={cn(
        // position & placement
        'absolute -top-[60px] left-1/2 -translate-x-1/2 transform',
        // visuals
        'bg-white/95 backdrop-blur-md border-2 border-indigo-500/30 rounded-[20px] shadow-lg',
        // spacing & typography
        'px-4 py-2 text-xs text-gray-700',
        // layout behavior
        'max-w-[200px] whitespace-normal break-words text-center',
        // tail triangle (::after)
        "after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:transform after:border-8 after:border-transparent after:border-t-white/95",
        className
      )}
    >
      {content}
    </div>
  )
}

export default MessageBubble
