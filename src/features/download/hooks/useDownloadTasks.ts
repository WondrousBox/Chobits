import { useCallback, useEffect, useRef, useState } from 'react';

export interface DownloadProgress {
  percent?: number;
  totalSize?: string;
  downloadSpeed?: string;
  eta?: string;
  statusText?: string;
}

export interface DownloadTask {
  id: string;
  url: string;
  filename?: string;
  folderId?: string;
  parentResourceId?: string;
  metadata?: Record<string, unknown>;
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  progress: DownloadProgress;
  error?: string;
  videoInfo?: {
    title?: string;
    thumbnail?: string;
    duration?: number;
    [key: string]: any;
  };
}

export interface UseDownloadTasksOptions {
  /** Whether to auto-close window on all tasks completed (for floating window mode) */
  autoCloseOnComplete?: boolean;
  /** Delay in ms before auto-closing (default: 3000) */
  autoCloseDelay?: number;
  /** Callback when all tasks complete */
  onAllComplete?: () => void;
}

export function useDownloadTasks(options: UseDownloadTasksOptions = {}): {
  tasks: DownloadTask[];
  activeTasks: DownloadTask[];
  completedTasks: DownloadTask[];
  failedTasks: DownloadTask[];
  overallProgress: number;
  cancelTask: (taskId: string) => void;
  removeTask: (taskId: string) => void;
  clearCompleted: () => void;
} {
  const { autoCloseOnComplete = false, autoCloseDelay = 3000, onAllComplete } = options;
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleTaskProgress = (_: any, task: DownloadTask): void => {
      setTasks((prev) => {
        const updated = prev.map((t) => (t.id === task.id ? task : t));
        return updated;
      });
    };

    const handleTaskStarted = (_: any, task: DownloadTask): void => {
      // Clear any pending auto-close when a new task starts
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
      setTasks((prev) => {
        const exists = prev.find((t) => t.id === task.id);
        if (!exists) {
          return [...prev, task];
        }
        return prev.map((t) => (t.id === task.id ? task : t));
      });
    };

    const handleTaskCompleted = (_: any, task: DownloadTask): void => {
      setTasks((prev) => {
        const updated = prev.map((t) => (t.id === task.id ? task : t));
        // Check if all tasks are now completed
        const allDone = updated.every((t) => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled');
        if (allDone) {
          onAllComplete?.();
          if (autoCloseOnComplete) {
            autoCloseTimerRef.current = setTimeout(() => {
              window.YUA?.window?.['window:close']?.('downloadFloating');
            }, autoCloseDelay);
          }
        }
        return updated;
      });
    };

    const handleTaskFailed = (_: any, task: DownloadTask): void => {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    };

    const handleWindowData = (_: any, data: any): void => {
      if (data?.task) {
        setTasks((prev) => {
          const exists = prev.find((t) => t.id === data.task.id);
          if (!exists) return [...prev, data.task];
          return prev.map((t) => (t.id === data.task.id ? data.task : t));
        });
      }
    };

    window.ipcRenderer?.on('video-downloader:task-progress', handleTaskProgress);
    window.ipcRenderer?.on('video-downloader:task-started', handleTaskStarted);
    window.ipcRenderer?.on('video-downloader:task-completed', handleTaskCompleted);
    window.ipcRenderer?.on('video-downloader:task-failed', handleTaskFailed);
    window.ipcRenderer?.on('on:window:open:ready', handleWindowData);

    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
      }
      window.ipcRenderer?.off('video-downloader:task-progress', handleTaskProgress);
      window.ipcRenderer?.off('video-downloader:task-started', handleTaskStarted);
      window.ipcRenderer?.off('video-downloader:task-completed', handleTaskCompleted);
      window.ipcRenderer?.off('video-downloader:task-failed', handleTaskFailed);
      window.ipcRenderer?.off('on:window:open:ready', handleWindowData);
    };
  }, [autoCloseOnComplete, autoCloseDelay, onAllComplete]);

  const cancelTask = useCallback((taskId: string) => {
    window.ipcRenderer?.invoke('video-downloader:cancel', taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const removeTask = useCallback((taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }, []);

  const clearCompleted = useCallback(() => {
    setTasks((prev) => prev.filter((t) => t.status !== 'completed' && t.status !== 'cancelled'));
  }, []);

  // Computed values
  const activeTasks = tasks.filter((t) => t.status === 'downloading' || t.status === 'queued');
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const failedTasks = tasks.filter((t) => t.status === 'failed');
  const overallProgress = activeTasks.length > 0 ? activeTasks.reduce((sum, t) => sum + (t.progress.percent ?? 0), 0) / activeTasks.length : tasks.length > 0 ? 100 : 0;

  return {
    tasks,
    activeTasks,
    completedTasks,
    failedTasks,
    overallProgress,
    cancelTask,
    removeTask,
    clearCompleted
  };
}
