/**
 * useDragMove
 * - 负责：长按进入拖拽，拖动时移动 Electron 窗口并保持助手可见；含 30fps IPC 节流。
 * - 输入：{ screenSize, padding, onHoldStart?, onDragStateChange? }
 * - 返回：{ bind: { onMouseDown }, isDragging, isDragReady, dragProgress }
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { clamp } from '@/utils/helpers'
import { ASSISTANT_HEIGHT, ASSISTANT_WIDTH, FRAME_INTERVAL } from '../constants'

export function useDragMove(
  containerRef: React.RefObject<HTMLElement>,
  options: {
    screenSize: { width: number; height: number }
    padding: number
    onHoldStart?: () => void
    onDragStateChange?: (dragging: boolean) => void
  }
) {
  const { screenSize, padding, onHoldStart, onDragStateChange } = options
  const [isDragging, setIsDragging] = useState(false)
  const [isDragReady, setIsDragReady] = useState(false)
  const dragTimerRef = useRef<NodeJS.Timeout | null>(null)
  const dragStartTimeRef = useRef<number>(0)
  const dragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const lastIpcSendRef = useRef(0)

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    if (dragTimerRef.current) { clearInterval(dragTimerRef.current); dragTimerRef.current = null }
    setIsDragReady(false)
    dragStartTimeRef.current = Date.now()
    dragOffset.current = { x: e.clientX, y: e.clientY }

    dragTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - dragStartTimeRef.current
      const progress = Math.min(elapsed / 250, 1)
      if (progress >= 1) {
        onHoldStart?.()
        setIsDragReady(true)
        setIsDragging(true)
        onDragStateChange?.(true)
        if (dragTimerRef.current) { clearInterval(dragTimerRef.current); dragTimerRef.current = null }
      }
    }, 16)
  }

  const handleMouseUp = useCallback(() => {
    if (dragTimerRef.current) { clearInterval(dragTimerRef.current); dragTimerRef.current = null }
    setIsDragging(false)
    onDragStateChange?.(false)
    setIsDragReady(false)
  }, [onDragStateChange])

  const handleMouseMove = useCallback(async (e: MouseEvent) => {
    if (!isDragging || !isDragReady) return
    const winX = e.screenX - dragOffset.current.x
    const winY = e.screenY - dragOffset.current.y
    const minWinX = -padding
    const maxWinX = screenSize.width - ASSISTANT_WIDTH - padding
    const minWinY = -padding
    const maxWinY = screenSize.height - ASSISTANT_HEIGHT - padding
    const boundedWinX = clamp(winX, minWinX, maxWinX)
    const boundedWinY = clamp(winY, minWinY, maxWinY)

    const now = performance.now()
    if (!lastIpcSendRef.current || now - lastIpcSendRef.current >= FRAME_INTERVAL) {
      lastIpcSendRef.current = now
      await window.YUA.window.moveWindow(Math.round(boundedWinX), Math.round(boundedWinY))
    }
  }, [isDragging, isDragReady, padding, screenSize.height, screenSize.width])

  // global listeners during dragging
  useEffect(() => {
    if (isDragging) {
      const up = (e: MouseEvent) => handleMouseUp()
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', up)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', up)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  useEffect(() => () => { if (dragTimerRef.current) { clearInterval(dragTimerRef.current); dragTimerRef.current = null } }, [])

  return { bind: { onMouseDown: handleMouseDown }, isDragging, isDragReady }
}

export default useDragMove
