import React, { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { TbX, TbPlayerPause, TbPlayerPlay, TbDownload } from 'react-icons/tb'

interface DownloadTask {
  id: string
  url: string
  filename?: string
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled'
  progress: {
    percent?: number
    totalSize?: string
    downloadSpeed?: string
    eta?: string
    statusText?: string
  }
  error?: string
  videoInfo?: any
}

const DownloadFloating: React.FC = () => {
  const [tasks, setTasks] = useState<DownloadTask[]>([])
  const [isVisible, setIsVisible] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    console.log('[DownloadFloating] 组件已挂载，开始监听事件')
    
    // 监听下载任务进度
    const handleTaskProgress = (_: any, task: DownloadTask) => {
      console.log('[DownloadFloating] 收到任务进度:', task.id, task.progress)
      setTasks(prev => {
        const updated = prev.map(t => t.id === task.id ? task : t)
        return updated
      })
    }

    // 监听任务开始
    const handleTaskStarted = (_: any, task: DownloadTask) => {
      console.log('[DownloadFloating] 收到任务开始:', task.id)
      setTasks(prev => {
        const exists = prev.find(t => t.id === task.id)
        if (!exists) {
          return [...prev, task]
        }
        return prev.map(t => t.id === task.id ? task : t)
      })
      setIsVisible(true)
    }

    // 监听任务完成
    const handleTaskCompleted = (_: any, task: DownloadTask) => {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t))
      // 3秒后自动隐藏
      setTimeout(() => {
        setTasks(prev => {
          const filtered = prev.filter(t => t.id !== task.id)
          if (filtered.length === 0) {
            setIsVisible(false)
          }
          return filtered
        })
      }, 3000)
    }

    // 监听任务失败
    const handleTaskFailed = (_: any, task: DownloadTask) => {
      setTasks(prev => prev.map(t => t.id === task.id ? task : t))
    }

    // 监听窗口数据
    const handleWindowData = (_: any, data: any) => {
      if (data && data.task) {
        setTasks([data.task])
        setIsVisible(true)
      }
    }

    // 注册事件监听器
    window.ipcRenderer?.on('video-downloader:task-progress', handleTaskProgress)
    window.ipcRenderer?.on('video-downloader:task-started', handleTaskStarted)
    window.ipcRenderer?.on('video-downloader:task-completed', handleTaskCompleted)
    window.ipcRenderer?.on('video-downloader:task-failed', handleTaskFailed)
    window.ipcRenderer?.on('openWindowReadyData', handleWindowData)

    return () => {
      window.ipcRenderer?.off('video-downloader:task-progress', handleTaskProgress)
      window.ipcRenderer?.off('video-downloader:task-started', handleTaskStarted)
      window.ipcRenderer?.off('video-downloader:task-completed', handleTaskCompleted)
      window.ipcRenderer?.off('video-downloader:task-failed', handleTaskFailed)
      window.ipcRenderer?.off('openWindowReadyData', handleWindowData)
    }
  }, [])

  const handleCancel = (taskId: string) => {
    window.ipcRenderer?.invoke('video-downloader:cancel', taskId)
    setTasks(prev => prev.filter(t => t.id !== taskId))
    if (tasks.length === 1) {
      setIsVisible(false)
    }
  }

  const handleClose = () => {
    setIsVisible(false)
    // 关闭窗口
    window.ipcRenderer?.send('download-floating:close')
  }

  const handleCollapse = () => {
    setIsCollapsed(!isCollapsed)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'downloading':
        return <TbDownload className="animate-spin" />
      case 'completed':
        return <div className="w-2 h-2 bg-green-500 rounded-full" />
      case 'failed':
        return <div className="w-2 h-2 bg-red-500 rounded-full" />
      case 'cancelled':
        return <div className="w-2 h-2 bg-gray-500 rounded-full" />
      default:
        return <div className="w-2 h-2 bg-blue-500 rounded-full" />
    }
  }

  const getStatusText = (task: DownloadTask) => {
    if (task.status === 'downloading' && task.progress.statusText) {
      return task.progress.statusText
    }
    switch (task.status) {
      case 'queued':
        return '等待中...'
      case 'downloading':
        return '下载中...'
      case 'completed':
        return '下载完成'
      case 'failed':
        return '下载失败'
      case 'cancelled':
        return '已取消'
      default:
        return '未知状态'
    }
  }

  if (!isVisible || tasks.length === 0) {
    return null
  }

  const currentTask = tasks[0] // 显示第一个任务

  return (
    <div 
      ref={containerRef}
      className={`fixed top-5 right-5 w-80 bg-white/95 backdrop-blur-md rounded-xl shadow-lg border border-white/20 z-[10000] transition-all duration-300 ease-in-out select-none hover:shadow-xl hover:-translate-y-0.5 ${isCollapsed ? 'h-10' : ''}`}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-black/5 cursor-pointer">
        <div className="flex items-center gap-2">
          {getStatusIcon(currentTask.status)}
          <span className="text-sm font-medium">下载进度</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="w-6 h-6 p-0"
            onClick={handleCollapse}
          >
            {isCollapsed ? '▼' : '▲'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-6 h-6 p-0"
            onClick={handleClose}
          >
            <TbX className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-3">
          <div className="mb-2">
            <div className="text-xs font-medium text-gray-800 mb-1 truncate" title={currentTask.filename || currentTask.url}>
              {currentTask.filename || currentTask.videoInfo?.title || '未知文件'}
            </div>
            <div className="text-xs text-gray-500">
              {getStatusText(currentTask)}
            </div>
          </div>

          {currentTask.status === 'downloading' && currentTask.progress.percent !== undefined && (
            <div className="mb-2">
              <div className="w-full h-1 bg-black/10 rounded-sm overflow-hidden mb-1">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-blue-700 rounded-sm transition-all duration-300 ease-out"
                  style={{ width: `${currentTask.progress.percent}%` }}
                />
              </div>
              <div className="text-xs text-gray-500 text-center">
                {currentTask.progress.percent.toFixed(1)}%
                {currentTask.progress.downloadSpeed && ` • ${currentTask.progress.downloadSpeed}`}
                {currentTask.progress.eta && ` • ${currentTask.progress.eta}`}
              </div>
            </div>
          )}

          {currentTask.status === 'failed' && currentTask.error && (
            <div className="text-xs text-red-600 bg-red-50 px-2 py-1.5 rounded-md mb-2">
              错误: {currentTask.error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            {currentTask.status === 'downloading' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCancel(currentTask.id)}
                className="text-xs"
              >
                <TbPlayerPause className="w-3 h-3 mr-1" />
                取消
              </Button>
            )}
            {currentTask.status === 'completed' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCancel(currentTask.id)}
                className="text-xs"
              >
                关闭
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default DownloadFloating
