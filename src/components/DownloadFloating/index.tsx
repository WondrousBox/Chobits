import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { TbX, TbPlayerPause, TbDownload, TbCheck, TbAlertCircle, TbClock, TbChevronDown, TbChevronUp } from 'react-icons/tb';

interface DownloadTask {
  id: string;
  url: string;
  filename?: string;
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  progress: {
    percent?: number;
    totalSize?: string;
    downloadSpeed?: string;
    eta?: string;
    statusText?: string;
  };
  error?: string;
  videoInfo?: any;
}

const DownloadFloating: React.FC = () => {
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.log('[DownloadFloating] 组件已挂载，开始监听事件');

    // 监听下载任务进度
    const handleTaskProgress = (_: any, task: DownloadTask): void => {
      console.log('[DownloadFloating] 收到任务进度:', task.id, task.progress);
      setTasks((prev) => {
        const updated = prev.map((t) => (t.id === task.id ? task : t));
        return updated;
      });
    };

    // 监听任务开始
    const handleTaskStarted = (_: any, task: DownloadTask): void => {
      console.log('[DownloadFloating] 收到任务开始:', task.id);
      setTasks((prev) => {
        const exists = prev.find((t) => t.id === task.id);
        if (!exists) {
          return [...prev, task];
        }
        return prev.map((t) => (t.id === task.id ? task : t));
      });
    };

    // 监听任务完成
    const handleTaskCompleted = (_: any, task: DownloadTask): void => {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      // 下载完成后直接关闭悬浮窗以避免遮挡界面
      window.YUA.window['window:close']('downloadFloating');
    };

    // 监听任务失败
    const handleTaskFailed = (_: any, task: DownloadTask): void => {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    };

    // 监听窗口数据
    const handleWindowData = (_: any, data: any): void => {
      if (data && data.task) {
        setTasks([data.task]);
      }
    };

    // 注册事件监听器
    window.ipcRenderer?.on('video-downloader:task-progress', handleTaskProgress);
    window.ipcRenderer?.on('video-downloader:task-started', handleTaskStarted);
    window.ipcRenderer?.on('video-downloader:task-completed', handleTaskCompleted);
    window.ipcRenderer?.on('video-downloader:task-failed', handleTaskFailed);
    window.ipcRenderer?.on('on:window:open:ready', handleWindowData);

    return () => {
      window.ipcRenderer?.off('video-downloader:task-progress', handleTaskProgress);
      window.ipcRenderer?.off('video-downloader:task-started', handleTaskStarted);
      window.ipcRenderer?.off('video-downloader:task-completed', handleTaskCompleted);
      window.ipcRenderer?.off('video-downloader:task-failed', handleTaskFailed);
      window.ipcRenderer?.off('on:window:open:ready', handleWindowData);
    };
  }, []);

  const handleCancel = (taskId: string): void => {
    window.ipcRenderer?.invoke('video-downloader:cancel', taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const handleCollapse = (): void => {
    setIsCollapsed(!isCollapsed);
  };

  const getStatusIcon = (status: string): React.ReactNode => {
    switch (status) {
      case 'downloading':
        return <TbDownload className="w-4 h-4 text-blue-500 animate-pulse" />;
      case 'completed':
        return <TbCheck className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <TbAlertCircle className="w-4 h-4 text-red-500" />;
      case 'cancelled':
        return <TbX className="w-4 h-4 text-gray-500" />;
      case 'queued':
        return <TbClock className="w-4 h-4 text-yellow-500" />;
      default:
        return <TbDownload className="w-4 h-4 text-blue-500" />;
    }
  };

  const getStatusText = (task: DownloadTask): string => {
    if (task.status === 'downloading' && task.progress.statusText) {
      return task.progress.statusText;
    }
    switch (task.status) {
      case 'queued':
        return '等待中...';
      case 'downloading':
        return '下载中...';
      case 'completed':
        return '下载完成';
      case 'failed':
        return '下载失败';
      case 'cancelled':
        return '已取消';
      default:
        return '未知状态';
    }
  };

  if (tasks.length === 0) {
    return null;
  }

  const currentTask = tasks[0]; // 显示第一个任务

  return (
    <div ref={containerRef} className="w-full h-full bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100/50 cursor-pointer">
        <div className="flex items-center gap-3">
          {getStatusIcon(currentTask.status)}
          <span className="text-sm font-semibold text-gray-800">下载进度</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={handleCollapse}>
            {isCollapsed ? <TbChevronDown className="w-4 h-4" /> : <TbChevronUp className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="p-4">
          <div className="mb-3">
            <div className="text-sm font-medium text-gray-900 mb-1 truncate" title={currentTask.filename || currentTask.url}>
              {currentTask.filename || currentTask.videoInfo?.title || '未知文件'}
            </div>
            <div className="text-xs text-gray-500 flex items-center gap-1">
              {getStatusIcon(currentTask.status)}
              {getStatusText(currentTask)}
            </div>
          </div>

          {currentTask.status === 'downloading' && currentTask.progress.percent !== undefined && (
            <div className="mb-3">
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 rounded-full transition-all duration-500 ease-out relative"
                  style={{ width: `${currentTask.progress.percent}%` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse"></div>
                </div>
              </div>
              <div className="flex justify-between items-center text-xs text-gray-600">
                <span className="font-medium">{currentTask.progress.percent.toFixed(1)}%</span>
                <div className="flex items-center gap-2">
                  {currentTask.progress.downloadSpeed && (
                    <span className="flex items-center gap-1">
                      <TbDownload className="w-3 h-3" />
                      {currentTask.progress.downloadSpeed}
                    </span>
                  )}
                  {currentTask.progress.eta && (
                    <span className="flex items-center gap-1">
                      <TbClock className="w-3 h-3" />
                      {currentTask.progress.eta}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {currentTask.status === 'failed' && currentTask.error && (
            <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-3 flex items-start gap-2">
              <TbAlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>错误: {currentTask.error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2">
            {currentTask.status === 'downloading' && (
              <Button variant="outline" size="sm" onClick={() => handleCancel(currentTask.id)} className="text-xs px-3 py-1.5 h-8 hover:bg-red-50 hover:border-red-200 hover:text-red-600">
                <TbPlayerPause className="w-3 h-3 mr-1" />
                取消
              </Button>
            )}
            {currentTask.status === 'completed' && (
              <Button variant="outline" size="sm" className="text-xs px-3 py-1.5 h-8 hover:bg-green-50 hover:border-green-200 hover:text-green-600">
                <TbCheck className="w-3 h-3 mr-1" />
                关闭
              </Button>
            )}
            {currentTask.status === 'failed' && (
              <Button variant="outline" size="sm" onClick={() => handleCancel(currentTask.id)} className="text-xs px-3 py-1.5 h-8 hover:bg-gray-50">
                <TbX className="w-3 h-3 mr-1" />
                关闭
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default DownloadFloating;
