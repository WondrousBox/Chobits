import React, { useState, useEffect, useRef, useCallback } from 'react'
import './AIAssistant.css'

// Constants to match Electron window sizing
const PADDING = 100
const ASSISTANT_WIDTH = 180
const ASSISTANT_HEIGHT = 220
const WINDOW_WIDTH = ASSISTANT_WIDTH + PADDING * 2 // 380
const WINDOW_HEIGHT = ASSISTANT_HEIGHT + PADDING * 2 // 420
const WALK_SPEED = 500 // pixels per second
// Movement tuning
const FPS_LIMIT = 30
const FRAME_INTERVAL = 1000 / FPS_LIMIT
const MOVEMENT_MODE: 'stepped' | 'smooth' = 'stepped'
const STEP_GRID = 12 // stepping granularity in px
const PATH_CURVE_FACTOR = 0.15 // curve strength relative to distance

// Helpers
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const bezierQ = (p0: number, p1: number, p2: number, t: number) => (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t ** 2 * p2
const footDurationFromSpeed = (speed: number) => {
  const MIN = 0.35, MAX = 0.9
  const norm = clamp(speed / 800, 0, 1)
  const sec = MAX - (MAX - MIN) * norm
  return `${sec.toFixed(2)}s`
}
const FOOT_DURATION = footDurationFromSpeed(WALK_SPEED)

interface Position {
  x: number
  y: number
}

interface ScreenSize {
  width: number
  height: number
}

export const AIAssistant: React.FC = () => {
  const [position, setPosition] = useState<Position>({ x: PADDING, y: PADDING })
  const [screenSize, setScreenSize] = useState<ScreenSize>({ width: 1920, height: 1080 })
  const [isDragging, setIsDragging] = useState(false)
  const [isWalking, setIsWalking] = useState(false)
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 })
  const [message, setMessage] = useState('你好！我是你的AI助手 ✨')
  const [showMessage, setShowMessage] = useState(true)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const messageTimeoutRef = useRef<NodeJS.Timeout>()

  // auto-walk loop & animation control
  const autoWalkRef = useRef(false)
  const animationFrameRef = useRef<number>()
  const cancelAnimRef = useRef({ cancelled: false })
  const lastIpcSendRef = useRef(0)

  // click-through state
  const clickThroughRef = useRef<boolean>(false)
  const setClickThrough = useCallback(async (enable: boolean) => {
    if (clickThroughRef.current === enable) return
    clickThroughRef.current = enable
    try { await window.YUA.window.setClickThrough(enable) } catch {}
  }, [])

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  // 获取屏幕尺寸并定位初始窗口
  useEffect(() => {
    const getScreenInfo = async () => {
      try {
        const size = await window.YUA.window.getScreenSize()
        setScreenSize(size)
        
        const winX = Math.max(0, size.width - WINDOW_WIDTH - 20)
        const winY = Math.max(0, size.height - WINDOW_HEIGHT - 40)
        await window.YUA.window.moveWindow(winX, winY)
        setPosition({ x: PADDING, y: PADDING })
      } catch (error) {
        console.error('Failed to get screen info:', error)
      }
    }
    
    getScreenInfo()
  }, [])

  // 动画移动窗口：曲线多段路径 + 30fps 节流 + 可选离散步进
  const animateMoveWindow = useCallback(async (targetX: number, targetY: number) => {
    cancelAnimRef.current = { cancelled: false }

    const [sx, sy] = await window.YUA.window.getWindowPosition()
    const startX = sx, startY = sy
    const dx = targetX - startX
    const dy = targetY - startY
    const totalDist = Math.hypot(dx, dy)
    if (totalDist < 1) return

    // 生成二次贝塞尔控制点（在中点法线方向偏移）
    const mx = (startX + targetX) / 2
    const my = (startY + targetY) / 2
    const nx = -dy / (totalDist || 1)
    const ny = dx / (totalDist || 1)
    const curve = totalDist * PATH_CURVE_FACTOR * (Math.random() * 0.6 + 0.4) * (Math.random() < 0.5 ? -1 : 1)
    const cx = mx + nx * curve
    const cy = my + ny * curve

    // 预采样路径点（按距离等分）
    const samples = Math.max(20, Math.ceil(totalDist / STEP_GRID))
    const points: Array<{ x: number; y: number; d: number }> = []
    let last = { x: startX, y: startY }
    let acc = 0
    for (let i = 1; i <= samples; i++) {
      const t = i / samples
      const x = bezierQ(startX, cx, targetX, t)
      const y = bezierQ(startY, cy, targetY, t)
      const seg = Math.hypot(x - last.x, y - last.y)
      acc += seg
      points.push({ x, y, d: acc })
      last = { x, y }
    }

    // 逐帧推进：按速度推进路径进度
    const duration = acc / WALK_SPEED * 1000
    return new Promise<void>((resolve) => {
      let lastT = performance.now()
      let progressed = 0 // 已行进的距离
      lastIpcSendRef.current = 0

      const step = (now: number) => {
        if (cancelAnimRef.current.cancelled) {
          resolve(); return
        }
        const dt = now - lastT
        lastT = now
        progressed = clamp(progressed + (WALK_SPEED * dt) / 1000, 0, acc)

        // 在 points 中找到当前位置
        let idx = 0
        while (idx < points.length && points[idx].d < progressed) idx++
        const prevD = idx === 0 ? 0 : points[idx - 1].d
        const prevX = idx === 0 ? startX : points[idx - 1].x
        const prevY = idx === 0 ? startY : points[idx - 1].y
        const cur = points[Math.min(idx, points.length - 1)]
        const segLen = Math.max(1e-6, cur.d - prevD)
        const segT = clamp((progressed - prevD) / segLen, 0, 1)

        let x = lerp(prevX, cur.x, segT)
        let y = lerp(prevY, cur.y, segT)

        // 离散步进（可选）
        if (MOVEMENT_MODE === 'stepped') {
          x = Math.round(x / STEP_GRID) * STEP_GRID
          y = Math.round(y / STEP_GRID) * STEP_GRID
        }

        // 30fps 节流 IPC
        if (lastIpcSendRef.current === 0 || now - lastIpcSendRef.current >= FRAME_INTERVAL || progressed >= acc) {
          lastIpcSendRef.current = now
          window.YUA.window.moveWindow(Math.round(x), Math.round(y))
        }

        if (progressed < acc) {
          animationFrameRef.current = requestAnimationFrame(step)
        } else {
          resolve()
        }
      }

      animationFrameRef.current = requestAnimationFrame(step)
    })
  }, [])

  // 自动走动循环（随机目标，逐步移动）
  const startWalking = useCallback(() => {
    if (autoWalkRef.current) return
    autoWalkRef.current = true

    const loop = async () => {
      while (autoWalkRef.current) {
        // 目标窗口位置（在屏幕边界内）
        const maxX = Math.max(0, screenSize.width - WINDOW_WIDTH)
        const maxY = Math.max(0, screenSize.height - WINDOW_HEIGHT)
        const targetX = Math.random() * maxX
        const targetY = Math.random() * maxY

        setIsWalking(true)
        await animateMoveWindow(targetX, targetY)
        setIsWalking(false)

        // 随机显示消息
        const messages = [
          '我在四处走走 🚶‍♀️',
          '看看有什么有趣的 👀',
          '要和我聊天吗？ 💬',
          '我在这里等你哦 😊',
          '点击我和我互动吧！ 🎉'
        ]
        setMessage(messages[Math.floor(Math.random() * messages.length)])
        setShowMessage(true)
        if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current)
        messageTimeoutRef.current = setTimeout(() => setShowMessage(false), 3000)

        // 休息 3-7 秒
        const pause = 3000 + Math.random() * 4000
        await sleep(pause)
      }
    }

    loop()
  }, [screenSize, animateMoveWindow])

  const cancelAnimation = useCallback(() => {
    cancelAnimRef.current.cancelled = true
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
  }, [])

  const stopWalking = useCallback(() => {
    autoWalkRef.current = false
    cancelAnimation()
    setIsWalking(false)
  }, [cancelAnimation])

  // 鼠标事件处理（拖动时移动窗口）
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    stopWalking()
    // 确保拖拽期间不穿透
    setClickThrough(false)
    // 记录指针相对窗口左上角的偏移
    setDragOffset({ x: e.clientX, y: e.clientY })
  }

  const handleMouseUp = useCallback((e?: MouseEvent) => {
    setIsDragging(false)
    // 停止拖拽后，过一会儿继续走动
    setTimeout(() => {
      startWalking()
    }, 3000)
  }, [startWalking])

  const handleMouseMove = useCallback(async (e: MouseEvent) => {
    if (!isDragging) return

    // 通过屏幕坐标 - 初始偏移 来移动窗口
    const winX = e.screenX - dragOffset.x
    const winY = e.screenY - dragOffset.y

    // 屏幕边界限制
    const boundedWinX = Math.max(0, Math.min(winX, screenSize.width - WINDOW_WIDTH))
    const boundedWinY = Math.max(0, Math.min(winY, screenSize.height - WINDOW_HEIGHT))

    // 拖拽移动也做 30fps 节流
    const now = performance.now()
    if (!lastIpcSendRef.current || now - lastIpcSendRef.current >= FRAME_INTERVAL) {
      lastIpcSendRef.current = now
      await window.YUA.window.moveWindow(Math.round(boundedWinX), Math.round(boundedWinY))
    }

    // 助手在窗口内部始终保持 100px 偏移
    setPosition({ x: PADDING, y: PADDING })
  }, [isDragging, dragOffset, screenSize])

  // 全局鼠标事件监听
  useEffect(() => {
    if (isDragging) {
      const up = (e: MouseEvent) => handleMouseUp(e)
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', up)
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', up)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // 根据鼠标是否在助手区域内自动切换点击穿透（仅在未拖拽时）
  useEffect(() => {
    let lastInside = false
    // 初始设为可穿透，鼠标一进入助手区域会自动关闭穿透
    setClickThrough(true)

    const onMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      const inside = !!rect && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom
      if (!isDragging && inside !== lastInside) {
        lastInside = inside
        setClickThrough(!inside)
      }
    }

    document.addEventListener('mousemove', onMove)
    return () => {
      document.removeEventListener('mousemove', onMove)
      setClickThrough(false)
    }
  }, [isDragging, setClickThrough])

  // 启动自动走动
  useEffect(() => {
    const timer = setTimeout(() => {
      startWalking()
    }, 3000)
    
    return () => {
      clearTimeout(timer)
      stopWalking()
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current)
      }
    }
  }, [startWalking, stopWalking])

  // 点击交互
  const handleClick = () => {
    stopWalking()
    setMessage('你好！有什么可以帮助你的吗？ 😊')
    setShowMessage(true)
    
    if (messageTimeoutRef.current) {
      clearTimeout(messageTimeoutRef.current)
    }
    messageTimeoutRef.current = setTimeout(() => {
      setShowMessage(false)
      startWalking()
    }, 5000)
  }

  return (
    <div 
      ref={containerRef}
      className={`ai-assistant-container ${isWalking ? 'walking' : ''} ${isDragging ? 'dragging' : ''}`}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      style={{ left: position.x, top: position.y, ['--foot-duration' as any]: FOOT_DURATION }}
    >
      {/* 消息气泡 */}
      {showMessage && (
        <div className="message-bubble">
          {message}
        </div>
      )}
      
      {/* AI助手角色 */}
      <div className="ai-character">
        <div className="character-body">
          <div className="character-face">
            <div className="eyes">
              <div className="eye left"></div>
              <div className="eye right"></div>
            </div>
            <div className="mouth"></div>
          </div>
        </div>
        
        {/* 脚步动画 */}
        <div className="character-feet">
          <div className="foot left"></div>
          <div className="foot right"></div>
        </div>
      </div>
      
      {/* 状态指示器 */}
      <div className="status-indicator">
        {isDragging ? '🫴' : isWalking ? '🚶‍♀️' : '😊'}
      </div>
    </div>
  )
}
