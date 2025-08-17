import React, { useState, useEffect, useRef, useCallback } from 'react'
import './AIAssistant.css'

interface Position {
  x: number
  y: number
}

interface ScreenSize {
  width: number
  height: number
}

export const AIAssistant: React.FC = () => {
  const [position, setPosition] = useState<Position>({ x: 100, y: 100 })
  const [screenSize, setScreenSize] = useState<ScreenSize>({ width: 1920, height: 1080 })
  const [isDragging, setIsDragging] = useState(false)
  const [isWalking, setIsWalking] = useState(false)
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 })
  const [message, setMessage] = useState('你好！我是你的AI助手 ✨')
  const [showMessage, setShowMessage] = useState(true)
  
  const containerRef = useRef<HTMLDivElement>(null)
  const walkingIntervalRef = useRef<NodeJS.Timeout>()
  const messageTimeoutRef = useRef<NodeJS.Timeout>()

  // 获取屏幕尺寸
  useEffect(() => {
    const getScreenInfo = async () => {
      try {
        const size = await window.YUA.window.getScreenSize()
        setScreenSize(size)
        
        // 初始位置设置在屏幕右下角
        const initialX = size.width - 220
        const initialY = size.height - 270
        setPosition({ x: initialX, y: initialY })
        await window.YUA.window.moveWindow(initialX, initialY)
      } catch (error) {
        console.error('Failed to get screen info:', error)
      }
    }
    
    getScreenInfo()
  }, [])

  // 随机移动逻辑
  const startWalking = useCallback(() => {
    if (walkingIntervalRef.current) return
    
    setIsWalking(true)
    walkingIntervalRef.current = setInterval(async () => {
      const newX = Math.random() * (screenSize.width - 200)
      const newY = Math.random() * (screenSize.height - 250)
      
      setPosition({ x: newX, y: newY })
      await window.YUA.window.moveWindow(newX, newY)
      
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
      
      if (messageTimeoutRef.current) {
        clearTimeout(messageTimeoutRef.current)
      }
      messageTimeoutRef.current = setTimeout(() => {
        setShowMessage(false)
      }, 3000)
      
    }, 5000 + Math.random() * 5000) // 5-10秒随机间隔
  }, [screenSize])

  const stopWalking = useCallback(() => {
    if (walkingIntervalRef.current) {
      clearInterval(walkingIntervalRef.current)
      walkingIntervalRef.current = undefined
    }
    setIsWalking(false)
  }, [])

  // 鼠标事件处理
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    stopWalking()
    
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      })
    }
  }

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
    // 停止拖拽后，过一会儿继续走动
    setTimeout(() => {
      startWalking()
    }, 3000)
  }, [startWalking])

  const handleMouseMove = useCallback(async (e: MouseEvent) => {
    if (!isDragging) return
    
    const newX = e.screenX - dragOffset.x
    const newY = e.screenY - dragOffset.y
    
    // 边界检查
    const clampedX = Math.max(0, Math.min(newX, screenSize.width - 200))
    const clampedY = Math.max(0, Math.min(newY, screenSize.height - 250))
    
    setPosition({ x: clampedX, y: clampedY })
    await window.YUA.window.moveWindow(clampedX, clampedY)
  }, [isDragging, dragOffset, screenSize])

  // 全局鼠标事件监听
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, handleMouseMove, handleMouseUp])

  // 开始自动走动
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
