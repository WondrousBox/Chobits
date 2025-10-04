import { ipcMain, BrowserWindow } from 'electron';
import { downloadManager, getVideoInfo, getThumbnail } from './video-downloader';
import { getMainWindow } from '../index';

export function initVideoDownloadHandlers(win: BrowserWindow) {
  console.log('[VideoDownload] Initializing video download handlers');

  // 获取视频信息
  ipcMain.handle('video-downloader:get-info', async (event, url: string, timeoutMs?: number) => {
    try {
      const info = await getVideoInfo(url, timeoutMs);
      return { success: true, data: info };
    } catch (error) {
      console.error('[VideoDownload] Failed to get video info:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 获取缩略图
  ipcMain.handle('video-downloader:get-thumbnail', async (event, url: string) => {
    try {
      const thumbnail = await getThumbnail(url);
      return { success: true, data: thumbnail };
    } catch (error) {
      console.error('[VideoDownload] Failed to get thumbnail:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 开始下载视频
  ipcMain.handle('video-downloader:download', async (event, options) => {
    try {
      // 如果没有提供videoInfo，先获取视频信息
      if (!options.videoInfo) {
        try {
          const videoInfo = await getVideoInfo(options.url);
          options.videoInfo = videoInfo;
        } catch (error) {
          console.warn('[VideoDownload] Failed to get video info, proceeding without it:', error);
        }
      }

      const taskId = await downloadManager.addTask(options);
      return { success: true, data: { taskId } };
    } catch (error) {
      console.error('[VideoDownload] Failed to start download:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 取消下载
  ipcMain.handle('video-downloader:cancel', async (event, taskId: string) => {
    try {
      const success = downloadManager.cancelTask(taskId);
      return { success, data: { taskId } };
    } catch (error) {
      console.error('[VideoDownload] Failed to cancel download:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 获取下载任务列表
  ipcMain.handle('video-downloader:get-tasks', async () => {
    try {
      const tasks = downloadManager.getAllTasks();
      return { success: true, data: tasks };
    } catch (error) {
      console.error('[VideoDownload] Failed to get tasks:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 获取特定任务信息
  ipcMain.handle('video-downloader:get-task', async (event, taskId: string) => {
    try {
      const task = downloadManager.getTask(taskId);
      return { success: true, data: task };
    } catch (error) {
      console.error('[VideoDownload] Failed to get task:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 清理已完成的任务
  ipcMain.handle('video-downloader:cleanup', async () => {
    try {
      downloadManager.cleanup();
      return { success: true };
    } catch (error) {
      console.error('[VideoDownload] Failed to cleanup:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 设置下载管理器事件监听器
  downloadManager.on('taskAdded', (task) => {
    console.log('[VideoDownload] 任务已添加:', task.id);
  });

  downloadManager.on('taskStarted', (task) => {
    console.log('[VideoDownload] 任务已开始:', task.id);
    try {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.setProgressBar(0);
      }
    } catch (error) {
      console.warn('[VideoDownload] 设置进度条失败:', error);
    }
  });

  downloadManager.on('taskProgress', (task) => {
    // 发送进度到渲染进程（用于其他UI更新）
    win.webContents.send('video-downloader:task-progress', task);

    if (task.progress && task.progress.percent !== undefined) {
      try {
        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.setProgressBar(task.progress.percent / 100);
          console.log('[VideoDownload] 下载进度:', task.progress.percent + '%');
        }
      } catch (error) {
        console.warn('[VideoDownload] 更新进度条失败:', error);
      }
    }
  });

  downloadManager.on('taskCompleted', (task) => {
    console.log('[VideoDownload] 任务已完成:', task.id);
    try {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.setProgressBar(-1);
      }
    } catch (error) {
      console.warn('[VideoDownload] 重置进度条失败:', error);
    }
  });

  downloadManager.on('taskFailed', (task) => {
    console.log('[VideoDownload] 任务失败:', task.id, task.error);
    try {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.setProgressBar(-1);
      }
    } catch (error) {
      console.warn('[VideoDownload] 重置进度条失败:', error);
    }
  });

  downloadManager.on('taskCancelled', (task) => {
    console.log('[VideoDownload] 任务已取消:', task.id);
    try {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.setProgressBar(-1);
      }
    } catch (error) {
      console.warn('[VideoDownload] 重置进度条失败:', error);
    }
  });

  console.log('[VideoDownload] Video download handlers initialized');
}