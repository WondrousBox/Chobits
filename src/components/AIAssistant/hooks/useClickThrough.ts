/**
 * useClickThrough
 * - 负责：根据鼠标是否在容器内，自动切换窗口点击穿透；提供 setClickThrough 显式设置。
 * - 输入：containerRef（用于判断鼠标是否在内）
 * - 返回：{ setClickThrough }
 */
import { useCallback, useEffect, useRef } from 'react'

export function useClickThrough(containerRef: React.RefObject<HTMLElement>, deps: any[] = []) {
  const clickThroughRef = useRef<boolean>(false)
  const lastMousePosRef = useRef<{ clientX: number; clientY: number } | null>(null)

  const setClickThrough = useCallback(async (enable: boolean) => {
    if (clickThroughRef.current === enable) return
    clickThroughRef.current = enable
    try { await window.YUA.window.setClickThrough(enable) } catch { }
  }, [])

  useEffect(() => {
    let lastInside = false
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect && lastMousePosRef.current) {
      const { clientX, clientY } = lastMousePosRef.current
      const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
      lastInside = inside
      setClickThrough(!inside)
    } else {
      setClickThrough(false)
    }

    const onMove = (e: MouseEvent) => {
      lastMousePosRef.current = { clientX: e.clientX, clientY: e.clientY }
      const rect = containerRef.current?.getBoundingClientRect()
      const inside = !!rect && e.clientX >= (rect!.left) && e.clientX <= (rect!.right) && e.clientY >= (rect!.top) && e.clientY <= (rect!.bottom)
      if (inside !== lastInside) {
        lastInside = inside
        setClickThrough(!inside)
      }
    }

    document.addEventListener('mousemove', onMove)
    return () => {
      document.removeEventListener('mousemove', onMove)
      setClickThrough(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { setClickThrough }
}

export default useClickThrough
