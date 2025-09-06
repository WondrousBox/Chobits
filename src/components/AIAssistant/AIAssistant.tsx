import React, { useState, useEffect, useRef, useCallback } from 'react'
import './AIAssistant.css'
import { VideoSpriteManager } from '../../lib/VideoSpriteManager'

// Constants to match Electron window sizing (intrinsic assistant size only)
const ASSISTANT_WIDTH = 180
const ASSISTANT_HEIGHT = 220
let WALK_SPEED = 500
let FPS_LIMIT = 30
let FRAME_INTERVAL = 1000 / FPS_LIMIT
let MOVEMENT_MODE: 'stepped' | 'smooth' = 'stepped'
let STEP_GRID = 12
let PATH_CURVE_FACTOR = 0.15
let ASSISTANT_PADDING = 100 // runtime dynamic padding (state mirror below)

// Helpers
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const bezierQ = (p0: number, p1: number, p2: number, t: number) => (1 - t) ** 2 * p0 + 2 * (1 - t) * t * p1 + t ** 2 * p2

export const AIAssistant: React.FC = () => {
  // Remove fixed PADDING; derive everything from paddingState
  const [paddingState, setPadding] = useState(ASSISTANT_PADDING)
  const [screenSize, setScreenSize] = useState<{ width: number; height: number }>({ width: 1920, height: 1080 })
  const [isDragging, setIsDragging] = useState(false)
  const [isWalking, setIsWalking] = useState(false)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [message, setMessage] = useState('你好！我是你的AI助手 ✨')
  const [showMessage, setShowMessage] = useState(true)
  const [isFileDragOver, setIsFileDragOver] = useState(false)
  // Debug overlay toggle for padding boundary
  const [showPaddingDebug, setShowPaddingDebug] = useState(false)
  const dragCounterRef = useRef(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const messageTimeoutRef = useRef<NodeJS.Timeout>()
  // Removed dragSide / handLeft / handRight states (unused in UI)

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
    try { await window.YUA.window.setClickThrough(enable) } catch { }
  }, [])

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  useEffect(() => {
    window.YUA.ffmpeg.playSprite()
  }, [])

  // 获取屏幕尺寸并定位初始窗口
  useEffect(() => {
    const getScreenInfo = async () => {
      try {
        const size = await window.YUA.window.getScreenSize()
        setScreenSize(size)
        const cfg = await window.YUA.window.getMovementConfig()
        ASSISTANT_PADDING = cfg.assistantPadding
        setPadding(ASSISTANT_PADDING)
        const winWidth = ASSISTANT_WIDTH + ASSISTANT_PADDING * 2
        const winHeight = ASSISTANT_HEIGHT + ASSISTANT_PADDING * 2
        const winX = Math.max(0, size.width - winWidth - 20)
        const winY = Math.max(0, size.height - winHeight - 40)
        await window.YUA.window.moveWindow(winX, winY)
      } catch (error) { console.error('Failed to get screen info:', error) }
    }

    getScreenInfo()
  }, [])

  // Toggle debug overlay with Ctrl+Shift+P (or Cmd+Shift+P on mac)
  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyP') {
        setShowPaddingDebug((v: boolean) => !v)
      }
    }
    window.addEventListener('keydown', keyHandler)
    return () => window.removeEventListener('keydown', keyHandler)
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
  }

  const handleMouseUp = useCallback((e?: MouseEvent) => {
    setIsDragging(false)
  }, [])

  const handleMouseMove = useCallback(async (e: MouseEvent) => {
    if (!isDragging) return
    const winX = e.screenX - dragOffset.x
    const winY = e.screenY - dragOffset.y
    // Constrain so inner assistant rectangle remains fully visible
    const minWinX = -paddingState
    const maxWinX = screenSize.width - ASSISTANT_WIDTH - paddingState
    const minWinY = -paddingState
    const maxWinY = screenSize.height - ASSISTANT_HEIGHT - paddingState
    const boundedWinX = clamp(winX, minWinX, maxWinX)
    const boundedWinY = clamp(winY, minWinY, maxWinY)

    const now = performance.now()
    if (!lastIpcSendRef.current || now - lastIpcSendRef.current >= FRAME_INTERVAL) {
      lastIpcSendRef.current = now
      await window.YUA.window.moveWindow(Math.round(boundedWinX), Math.round(boundedWinY))
    }
  }, [isDragging, dragOffset, screenSize, paddingState])

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
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation()
    dragCounterRef.current = 0
    setIsFileDragOver(false)
    setClickThrough(false)
    stopWalking()

    const items = Array.from(e.dataTransfer?.items || []) as DataTransferItem[]
    const files = Array.from(e.dataTransfer?.files || []) as File[]
    const details: string[] = []
    const fileListForIPC: Array<{ name: string; path: string; isDirectory: boolean }> = []

    items.forEach((item: DataTransferItem) => {
      if (item.kind === 'file') {
        const anyItem = item as any
        let entry: any
        try { entry = anyItem.webkitGetAsEntry?.() } catch { }
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
      details.push(...files.map((f: File) => `文件“${f.name}”`))
      files.forEach((f: File) => fileListForIPC.push({ name: f.name, path: (f as any).path || '', isDirectory: false }))
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

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    window.YUA.window.openMenuWindow()
  }

  useEffect(() => {
    const onMenuCommand = (_: any, action: string) => {
      if (action === 'toggle-walk') {
        if (autoWalkRef.current) { walkEnabledRef.current = false; stopWalking() }
      } else if (action === 'walk-once') {
        ; (async () => {
          stopWalking()
          const size = screenSize
          // Bounds ensuring inner assistant stays fully in screen
          const minX = -paddingState
          const maxX = size.width - ASSISTANT_WIDTH - paddingState
          const minY = -paddingState
          const maxY = size.height - ASSISTANT_HEIGHT - paddingState
          const targetX = Math.random() * (maxX - minX) + minX
          const targetY = Math.random() * (maxY - minY) + minY
          await animateMoveWindow(targetX, targetY)
        })()
      } else if (action === 'toggle-padding-debug') {
        setShowPaddingDebug((v: boolean) => !v)
      }
    }
    window.ipcRenderer?.on('menu-command', onMenuCommand)
    return () => { window.ipcRenderer?.off('menu-command', onMenuCommand as any) }
  }, [animateMoveWindow, screenSize, stopWalking, paddingState])

  const walkEnabledRef = useRef(false)

  useEffect(() => {
    // 初始化视频精灵 Canvas
    const canvas = document.getElementById('video-sprite-layer') as HTMLCanvasElement | null
    if (canvas) {
      const mgr = VideoSpriteManager.get()
      mgr.attachCanvas(canvas, 180, 180) // 与助手尺寸接近，可根据需要调整
      mgr.setFPS(30)
      // 预加载 idle 源
      mgr.loadSource({ id: 'idle', url: '/idle.webm', preload: true, muted: true, loop: true }).then(() => {
        try { mgr.createSprite({ sourceId: 'idle', x: 90, y: 90, anchorX: 0.5, anchorY: 0.5, width: 180, height: 180, autoplay: true, fadeInMs: 600 }) } catch { }
      })
    }
  }, [])

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
    >
      {showPaddingDebug && (
        <div style={{ position: 'absolute', left: -paddingState, top: -paddingState, width: ASSISTANT_WIDTH + paddingState * 2, height: ASSISTANT_HEIGHT + paddingState * 2, pointerEvents: 'none', boxSizing: 'border-box', border: '1px dashed rgba(0,255,120,0.45)', backdropFilter: 'none' }}>
          <div style={{ position: 'absolute', left: paddingState, top: paddingState, width: ASSISTANT_WIDTH, height: ASSISTANT_HEIGHT, border: '1px solid rgba(255,80,0,0.5)', boxSizing: 'border-box' }} />
          <div style={{ position: 'absolute', left: 0, top: 0, fontSize: 10, background: 'rgba(0,0,0,0.55)', color: '#0f0', padding: '2px 4px', fontFamily: 'monospace' }}>
            padding={paddingState}
          </div>
        </div>
      )}
      {/* 消息气泡 */}
      {showMessage && (
        <div className="message-bubble">
          {message}
        </div>
      )}

      {/* 原来单独的 video 替换为统一精灵 Canvas */}
      <canvas id="video-sprite-layer" style={{ position: 'absolute', left: 0, top: 0, width: 180, height: 180, pointerEvents: 'none' }} />

      {/* 拖拽提示 */}
      {isFileDragOver && (
        <div className="drop-hint">把文件拖给我吧 ⤓</div>
      )}

      {/* 状态指示器 */}
      <div className="status-indicator">
        {isDragging ? '🫴' : isWalking ? '🚶‍♀️' : '😊'}
      </div>
    </div>
  )
}
