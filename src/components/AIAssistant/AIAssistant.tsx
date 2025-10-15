import React, { useState, useEffect, useRef, useCallback } from 'react'
import { bezierQ, clamp, lerp } from '@/utils/helpers'
import VideoSprite from './VideoSprite'
import Messages, { MessageBubble } from './messages'
import type { MessageCategory } from "./messages"
import Dropzone from '../common/Dropzone'
import { SelectedResourceFileType } from '@/types'

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

// Debug overlay toggle for padding boundary
const showPaddingDebug = false // debug overlay toggle
export const AIAssistant: React.FC = () => {
  // Remove fixed PADDING; derive everything from paddingState
  const [paddingState, setPadding] = useState(ASSISTANT_PADDING)
  const [screenSize, setScreenSize] = useState<{ width: number; height: number }>({ width: 1920, height: 1080 })
  const [isDragging, setIsDragging] = useState(false)
  const [isWalking, setIsWalking] = useState(false)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [messageState, setMessageState] = useState<MessageCategory>('welcome')
  const [isFileDragOver, setIsFileDragOver] = useState(false)
  const [isDragReady, setIsDragReady] = useState(false)
  const [dragProgress, setDragProgress] = useState(0)
  const dragCounterRef = useRef(0)
  const dragTimerRef = useRef<NodeJS.Timeout | null>(null)
  const dragStartTimeRef = useRef<number>(0)

  const containerRef = useRef<HTMLDivElement>(null)
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

  // Track last mouse position so we can compute inside state without requiring movement
  const lastMousePosRef = useRef<{ clientX: number; clientY: number } | null>(null)

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

  useEffect(() => {
    // window.YUA.ffmpeg.playSprite()

    // 插入（使用 384 维，匹配默认后端设置）
    window.YUA.vector.insertVectors({
      items: [{
        id: 'doc-1',
        content: '你好，世界',
        metadata: { lang: 'zh' },
        embedding: new Array(384).fill(0).map((_, i) => Math.sin(i)) // 示例
      }],
      dim: 384,
    }).then((_res: any) => {
      console.log('inserted', _res)
    })

    window.YUA.vector.searchVectors({
      embedding: new Array(384).fill(0),
      k: 5,
      dim: 384,
    }).then((_res: any) => {
      console.log(_res)
    });
  }, [])

  // 启动问候 + 工作空间检查
  useEffect(() => {
    let mounted = true
      ; (async () => {
        try {
          // 初始欢迎
          setMessageState('welcome')
          // 短暂停顿后显示“检查系统中”
          await new Promise(r => setTimeout(r, 600))
          if (!mounted) return
          setMessageState('loading')
          // 查询是否存在未删除的工作空间
          const list = await window.YUA.workspace['workspace:list']({ filter: { deletedAt: 0 } as any, limit: 1, offset: 0 })
          if (!mounted) return
          if (!Array.isArray(list) || list.length === 0) {
            // 未创建空间：提示并打开设置窗口
            setMessageState('configure')
            // 稍等片刻再弹窗，避免打断动画
            setTimeout(() => { try { window.YUA.window.openWindow("workspaceWizard") } catch { } }, 800)
          }
        } catch {
          // 忽略错误，保持现有状态
        }
      })()
    return () => { mounted = false }
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

  // 根据文件扩展名推断资源类型
  type ResourceType = 'image' | 'video' | 'audio' | 'text' | 'link' | 'file' | 'document' | 'other'
  const getResourceTypeFromFilename = (fileName: string): ResourceType => {
    const ext = (fileName.split('.').pop() || '').toLowerCase()
    if (!ext) return 'file'
    const imageExt = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp'])
    const videoExt = new Set(['mp4', 'webm', 'mov', 'avi', 'mkv', 'flv', 'mpeg', 'mpg', 'm4v'])
    const audioExt = new Set(['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'opus'])
    const documentExt = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'md', 'markdown'])
    const textExt = new Set(['txt', 'csv', 'json', 'yaml', 'yml', 'xml', 'html', 'css', 'js', 'ts', 'jsx', 'tsx'])

    if (imageExt.has(ext)) return 'image'
    if (videoExt.has(ext)) return 'video'
    if (audioExt.has(ext)) return 'audio'
    if (documentExt.has(ext)) return 'document'
    if (textExt.has(ext)) return 'text'
    return 'file'
  }

  // 鼠标事件处理（拖动时移动窗口）
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()

    // 清除之前的定时器
    if (dragTimerRef.current) {
      clearInterval(dragTimerRef.current)
      dragTimerRef.current = null
    }

    // 重置拖拽状态
    setIsDragReady(false)
    setDragProgress(0)
    dragStartTimeRef.current = Date.now()

    stopWalking()
    setClickThrough(false)
    setDragOffset({ x: e.clientX, y: e.clientY })

    // 开始拖拽准备定时器
    dragTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - dragStartTimeRef.current
      const progress = Math.min(elapsed / 250, 1) // 1秒
      setDragProgress(progress)

      if (progress >= 1) {

        // 设置消息状态
        setMessageState('hold')
        setIsDragReady(true)
        setIsDragging(true)
        if (dragTimerRef.current) {
          clearInterval(dragTimerRef.current)
          dragTimerRef.current = null
        }
      }
    }, 16) // 约60fps更新
  }

  const handleMouseUp = useCallback((e?: MouseEvent) => {
    // 清除拖拽定时器
    if (dragTimerRef.current) {
      clearInterval(dragTimerRef.current)
      dragTimerRef.current = null
    }

    // 重置拖拽状态
    setIsDragging(false)
    setIsDragReady(false)
    setDragProgress(0)

    // Ensure click-through reflects current pointer position even if no mousemove fires
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect && e) {
      const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom
      setClickThrough(!inside)
    } else if (rect && lastMousePosRef.current) {
      const { clientX, clientY } = lastMousePosRef.current
      const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
      setClickThrough(!inside)
    } else {
      // Safe default: not click-through after interaction end
      setClickThrough(false)
    }
  }, [setClickThrough])

  const handleMouseMove = useCallback(async (e: MouseEvent) => {
    if (!isDragging || !isDragReady) return
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
  }, [isDragging, isDragReady, dragOffset, screenSize, paddingState])

  // 全局鼠标事件监听
  useEffect(() => {
    if (isDragging || dragProgress > 0) {
      const up = (e: MouseEvent) => handleMouseUp(e)
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', up)

      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', up)
      }
    }
  }, [isDragging, dragProgress, handleMouseMove, handleMouseUp])

  // 根据鼠标是否在助手区域内自动切换点击穿透（仅在未拖拽时）
  useEffect(() => {
    let lastInside = false

    // Initialize from current mouse position if available; avoid forcing click-through true
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect && lastMousePosRef.current) {
      const { clientX, clientY } = lastMousePosRef.current
      const inside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
      lastInside = inside
      setClickThrough(!inside)
    } else {
      // Safer default to ensure UI stays interactive until first move
      setClickThrough(false)
    }

    const onMove = (e: MouseEvent) => {
      lastMousePosRef.current = { clientX: e.clientX, clientY: e.clientY }
      const rect = containerRef.current?.getBoundingClientRect()
      const inside = !!rect && e.clientX >= (rect!.left) && e.clientX <= (rect!.right) && e.clientY >= (rect!.top) && e.clientY <= (rect!.bottom)
      if (!isDragging && !dragProgress && inside !== lastInside) {
        lastInside = inside
        setClickThrough(!inside)
      }
    }

    document.addEventListener('mousemove', onMove)
    return () => {
      document.removeEventListener('mousemove', onMove)
      setClickThrough(false)
    }
  }, [isDragging, dragProgress, setClickThrough])

  // 点击交互
  const handleClick = () => {
    stopWalking()
    setMessageState('click')
  }

  // 文件拖拽处理
  const isFilesDrag = (e: React.DragEvent) => Array.from(e.dataTransfer?.types || []).includes('Files')

  const handleDragEnter = (e: React.DragEvent<HTMLElement>) => {
    if (!isFilesDrag(e)) return
    e.preventDefault();
    e.stopPropagation()
    dragCounterRef.current++
    setIsFileDragOver(true)
    stopWalking()
    setClickThrough(false)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
    if (!isFilesDrag(e)) return
    e.preventDefault();
    e.stopPropagation()
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1)
    if (dragCounterRef.current === 0) {
      setIsFileDragOver(false)
    }
  }

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation()
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

    console.log(items);


    if (details.length === 0 && files.length) {
      details.push(...files.map((f: File) => `文件“${f.name}”`))
      files.forEach((f: File) => fileListForIPC.push({ name: f.name, path: (f as any).path || '', isDirectory: false }))
    }

    setMessageState('drop')
    if (details.length === 1) {
      const singleName = files[0]?.name || details[0].replace(/^文件“|文件夹“|”$/g, '')
    } else if (details.length > 1) {
      const names = files.map(f => f.name)
    }

    // 打开/更新文件列表窗口
    if (fileListForIPC.length) {
      window.YUA.window.openFileListWindow(fileListForIPC)
    }

    console.log(fileListForIPC);


    // 新增：将拖拽文件作为资源写入数据库（仅新增，不弹出管理）
    (async () => {
      try {
        for (const f of fileListForIPC) {
          if (f.isDirectory) continue
          const id = (crypto as any).randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
          const now = Date.now()
          const resource = {
            id,
            type: getResourceTypeFromFilename(f.name),
            title: f.name,
            filePath: f.path,
            sizeBytes: undefined as number | undefined,
            collectedAt: now,
            createdAt: now,
            updatedAt: now,
            status: 'new' as const,
          }
          try {
            await window.YUA.resource.addResource({ resource })
          } catch (e) {
            console.warn('addResource failed', e)
          }
        }
      } catch (e) { console.warn('batch resource add failed', e) }
    })()
  }

  const handleDropFiles = (files: SelectedResourceFileType[]) => {
    console.log(files);
    dragCounterRef.current = 0
    setIsFileDragOver(false)
    setClickThrough(false)
    stopWalking();



    // 新增：将拖拽文件作为资源写入数据库（仅新增，不弹出管理）
    (async () => {
      try {
        for (const f of files) {
          const now = Date.now();
          const safeName = f.name || (f.path ? (f.path.split(/[/\\]/).pop() || '') : '');
          let finalFilePath: string | undefined = f.path;
          let fileHash: string | undefined;
          // 如果有 File 对象（来自拖拽），优先通过 IPC 上传保存，避免直接引用原路径（可用于未来 web 来源）
          if (f.file && typeof f.file.arrayBuffer === 'function') {
            try {
              const data = await f.file.arrayBuffer();
              const uploaded = await (window as any).YUA?.resource?.uploadResourceFile?.({ fileName: safeName, data });
              if (uploaded?.duplicate) {
                console.info(`文件已存在且内容相同，跳过上传: ${safeName}`);
                // 可以在这里显示 UI 提示（后续如需）
                continue; // 跳过资源写入
              }
              if (uploaded?.success && uploaded.filePath) {
                finalFilePath = uploaded.filePath;
                fileHash = uploaded.hash;
              }
            } catch (e) {
              console.warn('uploadResourceFile failed, fallback to original path', e);
            }
          }
          const resource = {
            type: getResourceTypeFromFilename(safeName),
            title: safeName,
            filePath: finalFilePath,
            sizeBytes: f.size,
            collectedAt: now,
            createdAt: now,
            updatedAt: now,
            status: 'new' as const,
            ...(fileHash ? { metadata: JSON.stringify({ hashSha256: fileHash }) } : {}),
          };
          try {
            await window.YUA.resource.addResource({ resource });
          } catch (e) {
            console.warn('addResource failed', e);
          }
        }
      } catch (e) { console.warn('batch resource add failed', e); }
    })();
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
      }
    }
    window.ipcRenderer?.on('menu-command', onMenuCommand)
    return () => { window.ipcRenderer?.off('menu-command', onMenuCommand as any) }
  }, [animateMoveWindow, screenSize, stopWalking, paddingState])

  const walkEnabledRef = useRef(false)

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (dragTimerRef.current) {
        clearInterval(dragTimerRef.current)
        dragTimerRef.current = null
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={`
        fixed w-[180px] h-[220px] select-none z-[9999] 
        transition-transform duration-300 ease-in-out
        top-[100px] left-[100px] pointer-events-auto
        ${isDragReady ? 'cursor-grabbing' : dragProgress > 0 ? '' : 'cursor-grab'}
        ${isFileDragOver ? 'outline-2 outline-dashed outline-indigo-500/60 outline-offset-[6px] shadow-[0_0_0_6px_rgba(99,102,241,0.15)_inset,0_12px_35px_rgba(99,102,241,0.25)]' : ''}
        ${dragProgress > 0 ? 'opacity-70' : ''}
      `}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
      onClick={handleClick}
      onDoubleClick={async () => {
        try {
          const cfg = await window.YUA.model['model:getConfig']();
          if (!cfg?.rootDir) {
            // 未配置模型目录，先打开模型管理窗口让用户设置
            await window.YUA.window.openWindow('modelManager' as any);
          } else {
            await window.YUA.window.openWindow('assistant' as any);
          }
        } catch {
          // 回退原行为
          try { await window.YUA.window.openWindow('assistant' as any); } catch { }
        }
      }}
    // onDrop={handleDrop}
    >
      {showPaddingDebug && (
        <div style={{ position: 'absolute', left: -paddingState, top: -paddingState, width: ASSISTANT_WIDTH + paddingState * 2, height: ASSISTANT_HEIGHT + paddingState * 2, pointerEvents: 'none', boxSizing: 'border-box', border: '1px dashed rgba(0,255,120,0.45)', backdropFilter: 'none' }}>
          <div style={{ position: 'absolute', left: paddingState, top: paddingState, width: ASSISTANT_WIDTH, height: ASSISTANT_HEIGHT, border: '1px solid rgba(255,80,0,0.5)', boxSizing: 'border-box' }} />
          <div style={{ position: 'absolute', left: 0, top: 0, fontSize: 10, background: 'rgba(0,0,0,0.55)', color: '#0f0', padding: '2px 4px', fontFamily: 'monospace' }}>
            padding={paddingState}
          </div>
        </div>
      )}
      <MessageBubble state={messageState} />
      <Dropzone
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDropFiles={handleDropFiles}
        customDropzoneInside={<div className="flex items-center justify-center absolute top-2 left-1/2 -translate-x-1/2 p-1 rounded-md bg-primary text-primary-foreground text-xs whitespace-nowrap z-10">{Messages.t('drag')}</div>}
      >
        <VideoSprite />
      </Dropzone>

      {/* 拖拽进度指示器 */}
      {dragProgress > 0 && dragProgress < 1 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-16 h-16 rounded-full border-4 border-blue-500/30 flex items-center justify-center">
            <div
              className="w-12 h-12 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"
              style={{
                animationDuration: '2s',
                animationTimingFunction: 'linear',
                animationIterationCount: 'infinite'
              }}
            />
          </div>
        </div>
      )}

      {/* 状态指示器 */}
      <div className="absolute top-0 right-[10px] w-[30px] h-[30px] bg-white/90 border-2 border-indigo-500 rounded-full flex items-center justify-center text-sm shadow-[0_2px_10px_rgba(0,0,0,0.1)]">
        {isDragging ? '🫴' : isWalking ? '🚶‍♀️' : '😊'}
      </div>
    </div>
  )
}
