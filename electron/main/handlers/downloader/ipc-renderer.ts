import { ipcRenderer } from 'electron';

// 视频下载相关的API接口
const downloaderIpcRenderer = {
  // 获取视频信息
  getVideoInfo: (url: string, timeoutMs?: number) => ipcRenderer.invoke('video-downloader:get-info', url, timeoutMs),

  // 获取缩略图
  getThumbnail: (url: string) => ipcRenderer.invoke('video-downloader:get-thumbnail', url),

  // 开始下载视频
  downloadVideo: (options: { url: string; filename?: string; destination?: string; quality?: number }) => ipcRenderer.invoke('video-downloader:download', options),

  // 取消下载
  cancelDownload: (taskId: string) => ipcRenderer.invoke('video-downloader:cancel', taskId),

  // 获取下载任务列表
  getTasks: () => ipcRenderer.invoke('video-downloader:get-tasks'),

  // 获取特定任务信息
  getTask: (taskId: string) => ipcRenderer.invoke('video-downloader:get-task', taskId),

  // 清理已完成的任务
  cleanup: () => ipcRenderer.invoke('video-downloader:cleanup'),

  // 获取外部资源设置
  getExternalResourceSettings: () => ipcRenderer.invoke('video-downloader:get-external-resource-settings'),

  // 设置外部资源设置
  setExternalResourceSettings: (settings: any) => ipcRenderer.invoke('video-downloader:set-external-resource-settings', settings),

  // 获取 yt-dlp 配置文件路径
  getConfigPath: () => ipcRenderer.invoke('video-downloader:get-config-path'),

  onTaskProgress: (callback: (task: any) => void) => {
    ipcRenderer.on('video-downloader:task-progress', (_, task) => callback(task));
  },

  onTaskStarted: (callback: (task: any) => void) => {
    ipcRenderer.on('video-downloader:task-started', (_, task) => callback(task));
  },

  onTaskCompleted: (callback: (task: any) => void) => {
    ipcRenderer.on('video-downloader:task-completed', (_, task) => callback(task));
  },

  onTaskFailed: (callback: (task: any) => void) => {
    ipcRenderer.on('video-downloader:task-failed', (_, task) => callback(task));
  }
};

// 导出API
export default downloaderIpcRenderer;

export type DownloaderIpcRendererType = typeof downloaderIpcRenderer;
