import React, { useState, useEffect, useRef, useCallback } from 'react'
import './AIAssistant.css'

// Constants to match Electron window sizing
const PADDING = 100
const ASSISTANT_WIDTH = 180
const ASSISTANT_HEIGHT = 220
const WINDOW_WIDTH = ASSISTANT_WIDTH + PADDING * 2 // 380
const WINDOW_HEIGHT = ASSISTANT_HEIGHT + PADDING * 2 // 420
let WALK_SPEED = 500
let FPS_LIMIT = 30
let FRAME_INTERVAL = 1000 / FPS_LIMIT
let MOVEMENT_MODE: 'stepped' | 'smooth' = 'stepped'
let STEP_GRID = 12
let PATH_CURVE_FACTOR = 0.15

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
  // 文件拖拽
  const [isFileDragOver, setIsFileDragOver] = useState(false)
  const dragCounterRef = useRef(0)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const messageTimeoutRef = useRef<NodeJS.Timeout>()
  // which hand is being grabbed and hand positions
  const [dragSide, setDragSide] = useState<'left' | 'right' | null>(null)
  const [handLeft, setHandLeft] = useState<Position>({ x: 40, y: 120 })
  const [handRight, setHandRight] = useState<Position>({ x: 140, y: 120 })

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

  // 拦截窗口级默认拖拽行为，防止 Electron 导航到文件
  useEffect(() => {
    const prevent = (e: DragEvent) => { e.preventDefault() }
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
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
    setClickThrough(false)
    setDragOffset({ x: e.clientX, y: e.clientY })
    // decide which hand to grab based on click x relative to center, and snap that hand to pointer
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      const centerX = rect.left + rect.width / 2
      const localX = clamp(e.clientX - rect.left, 0, rect.width)
      const localY = clamp(e.clientY - rect.top, 0, rect.height)
      const side: 'left' | 'right' = e.clientX < centerX ? 'left' : 'right'
      setDragSide(side)
      if (side === 'left') setHandLeft({ x: localX, y: localY })
      else setHandRight({ x: localX, y: localY })
    } else {
      setDragSide('right')
    }
  }

  const handleMouseUp = useCallback((e?: MouseEvent) => {
    setIsDragging(false)
    setDragSide(null)
    setHandLeft({ x: 40, y: 120 })
    setHandRight({ x: 140, y: 120 })
    // 仅在用户开启自动行走时恢复
    if (walkEnabledRef.current) {
      setTimeout(() => { startWalking() }, 1500)
    }
  }, [startWalking])

  const handleMouseMove = useCallback(async (e: MouseEvent) => {
    if (!isDragging) return

    // Move window
    const winX = e.screenX - dragOffset.x
    const winY = e.screenY - dragOffset.y
    const boundedWinX = Math.max(0, Math.min(winX, screenSize.width - WINDOW_WIDTH))
    const boundedWinY = Math.max(0, Math.min(winY, screenSize.height - WINDOW_HEIGHT))

    const now = performance.now()
    if (!lastIpcSendRef.current || now - lastIpcSendRef.current >= FRAME_INTERVAL) {
      lastIpcSendRef.current = now
      await window.YUA.window.moveWindow(Math.round(boundedWinX), Math.round(boundedWinY))
    }

    // Update grabbed hand to follow the mouse within component coordinates
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      const localX = clamp(e.clientX - rect.left, 0, rect.width)
      const localY = clamp(e.clientY - rect.top, 0, rect.height)
      if (dragSide === 'left') setHandLeft({ x: localX, y: localY })
      if (dragSide === 'right') setHandRight({ x: localX, y: localY })
    }

    // Keep body position padding
    setPosition({ x: PADDING, y: PADDING })
  }, [isDragging, dragOffset, screenSize, dragSide])

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

  // 点击交互
  const handleClick = () => {
    stopWalking()
    setMessage('你好！有什么可以帮助你的吗？ 😊')
    setShowMessage(true)
    if (messageTimeoutRef.current) { clearTimeout(messageTimeoutRef.current) }
    messageTimeoutRef.current = setTimeout(() => {
      setShowMessage(false)
      if (walkEnabledRef.current) startWalking()
    }, 5000)
  }

  // 文件拖拽处理
  const isFilesDrag = (e: React.DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files')

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isFilesDrag(e)) return
    e.preventDefault(); e.stopPropagation()
    dragCounterRef.current++
    setIsFileDragOver(true)
    stopWalking()
    setClickThrough(false)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isFilesDrag(e)) return
    e.preventDefault(); e.stopPropagation()
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!isFilesDrag(e)) return
    e.preventDefault(); e.stopPropagation()
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) {
      setIsFileDragOver(false)
      if (walkEnabledRef.current) setTimeout(() => startWalking(), 1500)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation()
    dragCounterRef.current = 0
    setIsFileDragOver(false)
    setClickThrough(false)
    stopWalking()

    const items = Array.from(e.dataTransfer?.items || [])
    const files = Array.from(e.dataTransfer?.files || [])
    const details: string[] = []
    const fileListForIPC: Array<{ name: string; path: string; isDirectory: boolean }> = []

    items.forEach((item) => {
      if (item.kind === 'file') {
        const anyItem = item as any
        let entry: any
        try { entry = anyItem.webkitGetAsEntry?.() } catch {}
        if (entry?.isDirectory) {
          details.push(`文件夹“${entry.name}”`)
          fileListForIPC.push({ name: entry.name, path: '', isDirectory: true })
        } else {
          const f = item.getAsFile()
          if (f) {
            details.push(`文件“${f.name}”`)
            fileListForIPC.push({ name: f.name, path: (f as any).path || '', isDirectory: false })
          }
        }
      }
    })

    if (details.length === 0 && files.length) {
      details.push(...files.map(f => `文件“${f.name}”`))
      files.forEach(f => fileListForIPC.push({ name: f.name, path: (f as any).path || '', isDirectory: false }))
    }

    if (details.length === 1) {
      setMessage(`我收到了${details[0]} ✅`)
    } else if (details.length > 1) {
      const preview = details.slice(0, 3).join('、')
      setMessage(`我收到了 ${details.length} 个项目：${preview}${details.length > 3 ? ' 等' : ''} ✅`)
    } else {
      setMessage('收到了一些内容，但我没识别到文件名 🤔')
    }
    setShowMessage(true)
    if (messageTimeoutRef.current) clearTimeout(messageTimeoutRef.current)
    messageTimeoutRef.current = setTimeout(() => setShowMessage(false), 6000)

    // 打开/更新文件列表窗口
    if (fileListForIPC.length) {
      window.YUA.window.openFileListWindow(fileListForIPC)
    }
  }

  // Shoulder anchor points (approx) in container coordinates
  const SHOULDER_Y = 100
  const SHOULDER_LEFT_X = 50
  const SHOULDER_RIGHT_X = 130

  // Compute line vars from anchor to hand
  const dxL = handLeft.x - SHOULDER_LEFT_X
  const dyL = handLeft.y - SHOULDER_Y
  const lenL = Math.hypot(dxL, dyL)
  const degL = Math.atan2(dyL, dxL) * 180 / Math.PI

  const dxR = handRight.x - SHOULDER_RIGHT_X
  const dyR = handRight.y - SHOULDER_Y
  const lenR = Math.hypot(dxR, dyR)
  const degR = Math.atan2(dyR, dxR) * 180 / Math.PI

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    window.YUA.window.openMenuWindow()
  }

  useEffect(() => {
    const onMenuCommand = (_: any, action: string) => {
      if (action === 'toggle-walk') {
        if (autoWalkRef.current) { walkEnabledRef.current = false; stopWalking() } else { walkEnabledRef.current = true; startWalking() }
      } else if (action === 'walk-once') {
        ;(async () => {
          stopWalking()
          const size = screenSize
          const maxX = Math.max(0, size.width - WINDOW_WIDTH)
          const maxY = Math.max(0, size.height - WINDOW_HEIGHT)
          await animateMoveWindow(Math.random() * maxX, Math.random() * maxY)
          // 单次走完如果之前开启了自动行走则恢复
          if (walkEnabledRef.current) startWalking()
        })()
      }
    }
    window.ipcRenderer?.on('menu-command', onMenuCommand)
    return () => { window.ipcRenderer?.off('menu-command', onMenuCommand as any) }
  }, [animateMoveWindow, screenSize, startWalking, stopWalking])

  // 监听移动配置更新
  useEffect(() => {
    const handler = (_: any, cfg: any) => {
      WALK_SPEED = cfg.walkSpeed
      FPS_LIMIT = cfg.fpsLimit
      FRAME_INTERVAL = 1000 / FPS_LIMIT
      MOVEMENT_MODE = cfg.movementMode
      STEP_GRID = cfg.stepGrid
      PATH_CURVE_FACTOR = cfg.pathCurveFactor
      setFootDuration(footDurationFromSpeed(WALK_SPEED))
    }
    window.ipcRenderer?.on('movement-config-updated', handler)
    // 初始化获取一次
    window.YUA.window.getMovementConfig().then(cfg => handler(null, cfg))
    return () => { window.ipcRenderer?.off('movement-config-updated', handler as any) }
  }, [])

  const walkEnabledRef = useRef(false)
  const [footDuration, setFootDuration] = useState(footDurationFromSpeed(WALK_SPEED))

  return (
    <div 
      ref={containerRef}
      className={`ai-assistant-container ${isWalking ? 'walking' : ''} ${isDragging ? 'dragging' : ''} ${isFileDragOver ? 'drag-over' : ''}`}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      onClick={handleClick}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ 
        left: position.x, 
        top: position.y, 
        ['--foot-duration' as any]: footDuration,
        // optional arm vars kept for compatibility
        ['--arm-left-rot' as any]: isDragging ? (dragSide === 'left' ? '-75deg' : '60deg') : '20deg',
        ['--arm-right-rot' as any]: isDragging ? (dragSide === 'right' ? '75deg' : '-60deg') : '-20deg',
        ['--arm-left-len' as any]: isDragging ? (dragSide === 'left' ? '1.35' : '1.05') : '1',
        ['--arm-right-len' as any]: isDragging ? (dragSide === 'right' ? '1.35' : '1.05') : '1',
        // round hand positions
        ['--hand-left-x' as any]: `${handLeft.x}px`,
        ['--hand-left-y' as any]: `${handLeft.y}px`,
        ['--hand-right-x' as any]: `${handRight.x}px`,
        ['--hand-right-y' as any]: `${handRight.y}px`,
        // stretchy arm line vars (used only visually when dragging)
        ['--left-line-x' as any]: `${SHOULDER_LEFT_X}px`,
        ['--left-line-y' as any]: `${SHOULDER_Y}px`,
        ['--left-line-len' as any]: `${lenL}px`,
        ['--left-line-rot' as any]: `${degL}deg`,
        ['--right-line-x' as any]: `${SHOULDER_RIGHT_X}px`,
        ['--right-line-y' as any]: `${SHOULDER_Y}px`,
        ['--right-line-len' as any]: `${lenR}px`,
        ['--right-line-rot' as any]: `${degR}deg`,
      }}
    >
      {/* 消息气泡 */}
      {showMessage && (
        <div className="message-bubble">
          {message}
        </div>
      )}
      
      {/* 拖拽提示 */}
      {isFileDragOver && (
        <div className="drop-hint">把文件拖给我吧 ⤓</div>
      )}
      
      {/* AI助手角色 */}
      <div className="ai-character">
        <div className="character-body">
          {/* 移除矩形手臂，改为圆形手掌 */}
          <div className="character-face">
            <div className="eyes">
              <div className="eye left"></div>
              <div className="eye right"></div>
            </div>
            <div className="mouth"></div>
          </div>
        </div>

        {/* Arm stretchy lines (under hands) */}
        <div className="arm-lines">
          <div className="arm-line left" />
          <div className="arm-line right" />
        </div>

        {/* 圆形双手（像双脚一样） */}
        <div className="hands">
          <div className="hand left"></div>
          <div className="hand right"></div>
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
