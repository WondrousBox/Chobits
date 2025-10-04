import { ipcMain, BrowserWindow } from 'electron';
import { downloadManager, getVideoInfo, getThumbnail } from './video-downloader';

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
  });

  downloadManager.on('taskStarted', (task) => {
  });

  downloadManager.on('taskProgress', (task) => {
    win.webContents.send('video-downloader:task-progress', task);
  });

  downloadManager.on('taskCompleted', (task) => {
  });

  downloadManager.on('taskFailed', (task) => {
  });

  downloadManager.on('taskCancelled', (task) => {
  });

  console.log('[VideoDownload] Video download handlers initialized');
}