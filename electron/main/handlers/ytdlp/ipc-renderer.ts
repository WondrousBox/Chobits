import { ipcRenderer } from 'electron';

import type { YtDlpDownloadProgress, YtDlpReleaseInfo, YtDlpUpdateInfo } from './updater';

/**
 * yt-dlp 渲染进程 API
 */
export const ytdlpIpcRenderer = {
  /**
   * 检查更新（包含最近5个版本）
   */
  checkUpdate: (): Promise<{ success: boolean; data?: YtDlpUpdateInfo; error?: string }> => ipcRenderer.invoke('ytdlp:check-update'),

  /**
   * 下载并安装指定版本
   * @param release 要安装的版本信息，不传则安装最新版本
   */
  downloadVersion: (release?: YtDlpReleaseInfo): Promise<{ success: boolean; data?: { installedVersion: string; path: string }; error?: string }> =>
    ipcRenderer.invoke('ytdlp:download-version', release),

  /**
   * 获取当前 yt-dlp 路径
   */
  getPath: (): Promise<{ success: boolean; data?: { path: string }; error?: string }> => ipcRenderer.invoke('ytdlp:get-path'),

  /**
   * 重置为内置版本
   */
  resetToBuiltin: (): Promise<{ success: boolean; data?: { path: string }; error?: string }> => ipcRenderer.invoke('ytdlp:reset-to-builtin'),

  /**
   * 获取 yt-dlp 文件夹路径
   */
  getFolderPath: (): Promise<{ success: boolean; data?: { folderPath: string }; error?: string }> => ipcRenderer.invoke('ytdlp:get-folder-path'),

  /**
   * 监听下载进度
   */
  onDownloadProgress: (callback: (progress: YtDlpDownloadProgress) => void): (() => void) => {
    const handler = (_event: any, progress: YtDlpDownloadProgress): void => callback(progress);
    ipcRenderer.on('ytdlp:download-progress', handler);
    return () => ipcRenderer.off('ytdlp:download-progress', handler);
  }
};

export type YtDlpIpcRendererType = typeof ytdlpIpcRenderer;

// 重新导出类型
export type { YtDlpDownloadProgress, YtDlpReleaseInfo, YtDlpUpdateInfo } from './updater';
