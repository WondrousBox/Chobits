/**
 * AIAssistant 组装层
 * - 职责：拼装 UI（VideoSprite、MessageBubble、指示器）与行为 hooks（初始化、拖动、穿透、行走、文件拖拽）。
 * - 约束：不在此文件内编写复杂业务逻辑/IPC 调用，逻辑统一下沉到 hooks/services。
 */
import React, { useRef } from 'react'
import VideoSprite from './VideoSprite'
import Messages, { MessageBubble } from './messages'
import Dropzone from '../common/Dropzone'
import { ASSISTANT_HEIGHT, ASSISTANT_WIDTH, SHOW_PADDING_DEBUG } from './constants'
import useAssistantInit from './hooks/useAssistantInit'
import useClickThrough from './hooks/useClickThrough'
import useDragMove from './hooks/useDragMove'
import useWalkAnimation from './hooks/useWalkAnimation'
import useFileDrop from './hooks/useFileDrop'
import DragProgressIndicator from './ui/DragProgressIndicator'
import StatusIndicator from './ui/StatusIndicator'
import PaddingDebugOverlay from './ui/PaddingDebugOverlay'

export const AIAssistant: React.FC = () => {
  const { padding: paddingState, screenSize, messageState, setMessageState } = useAssistantInit()

  const containerRef = useRef<HTMLDivElement>(null)
  const { setClickThrough } = useClickThrough(containerRef, [])
  const { animateMoveWindow, stopWalking, isWalking } = useWalkAnimation()
  const { bind: dragBind, isDragging, isDragReady, dragProgress } = useDragMove(containerRef, {
    screenSize,
    padding: paddingState,
    onHoldStart: () => setMessageState('hold'),
    onDragStateChange: (dragging) => {
      if (dragging) setClickThrough(false)
    }
  })
  const { isFileDragOver, handleDragEnter, handleDragLeave, handleDropFiles } = useFileDrop(stopWalking, setClickThrough)

  // 点击交互
  const handleClick = () => {
    stopWalking()
    setMessageState('click')
  }

  // keep dev vector probe to preserve previous behavior
  React.useEffect(() => {
    // window.YUA.ffmpeg.playSprite()
    window.YUA.vector.insertVectors({
      items: [{
        id: 'doc-1',
        content: '你好，世界',
        metadata: { lang: 'zh' },
        embedding: new Array(384).fill(0).map((_, i) => Math.sin(i))
      }],
      dim: 384,
    }).then((_res: any) => { console.log('inserted', _res) })

    window.YUA.vector.searchVectors({
      embedding: new Array(384).fill(0),
      k: 5,
      dim: 384,
    }).then((_res: any) => { console.log(_res) })
  }, [])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    window.YUA.window.openMenuWindow()
  }

  React.useEffect(() => {
    const onMenuCommand = (_: any, action: string) => {
      if (action === 'toggle-walk') {
        stopWalking()
      } else if (action === 'walk-once') {
        ; (async () => {
          stopWalking()
          const size = screenSize
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
      onMouseDown={dragBind.onMouseDown}
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
      {SHOW_PADDING_DEBUG && <PaddingDebugOverlay padding={paddingState} />}
      <MessageBubble state={messageState} />
      <Dropzone
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDropFiles={handleDropFiles}
        customDropzoneInside={<div className="flex items-center justify-center absolute top-2 left-1/2 -translate-x-1/2 p-1 rounded-md bg-primary text-primary-foreground text-xs whitespace-nowrap z-10">{Messages.t('drag')}</div>}
      >
        <VideoSprite />
      </Dropzone>

      <DragProgressIndicator progress={dragProgress} />

      <StatusIndicator isDragging={isDragging} isWalking={isWalking} />
    </div>
  )
}
