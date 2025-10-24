import { ipcMain, BrowserWindow, screen } from 'electron';
import { downloadManager, getVideoInfo, getThumbnail, getSetting, setSetting } from './video-downloader';
import { getMainWindow } from '../index';
import { windowManager } from '../window/window-manager';

export function initVideoDownloadHandlers(win: BrowserWindow): void {
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

  // 关闭下载悬浮窗
  ipcMain.on('download-floating:close', () => {
    try {
      windowManager.close('downloadFloating');
    } catch (error) {
      console.error('[VideoDownload] Failed to close download floating window:', error);
    }
  });

  // 设置下载管理器事件监听器
  downloadManager.on('taskAdded', (task) => {
    console.log('[VideoDownload] 任务已添加:', task.id);
  });

  downloadManager.on('taskStarted', async (task) => {
    console.log('[VideoDownload] 任务已开始:', task.id);
    try {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.setProgressBar(0);
      }

      // 创建或显示下载悬浮窗
      console.log('[VideoDownload] 正在创建下载悬浮窗...');
      const downloadWindow = await windowManager.createOrShow('downloadFloating', { task });
      console.log('[VideoDownload] 下载悬浮窗创建结果:', downloadWindow ? '成功' : '失败');
      if (downloadWindow) {
        // 设置窗口位置（右上角）
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: screenWidth } = primaryDisplay.workAreaSize;
        const windowWidth = 320;
        const windowHeight = 120;

        downloadWindow.setBounds({
          x: screenWidth - windowWidth - 20,
          y: 20,
          width: windowWidth,
          height: windowHeight
        });

        // 显示窗口
        downloadWindow.show();
        downloadWindow.focus();

        // 发送任务开始事件到下载悬浮窗
        console.log('[VideoDownload] 发送任务开始事件到下载悬浮窗:', task.id);
        downloadWindow.webContents.send('video-downloader:task-started', task);
      }
    } catch (error) {
      console.warn('[VideoDownload] 设置进度条失败:', error);
    }
  });

  downloadManager.on('taskProgress', (task) => {
    // 发送进度到渲染进程（用于其他UI更新）
    win.webContents.send('video-downloader:task-progress', task);

    // 发送进度到下载悬浮窗
    const downloadWindow = windowManager.get('downloadFloating');
    if (downloadWindow && !downloadWindow.isDestroyed()) {
      downloadWindow.webContents.send('video-downloader:task-progress', task);
    }

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

      // 发送完成事件到下载悬浮窗
      const downloadWindow = windowManager.get('downloadFloating');
      if (downloadWindow && !downloadWindow.isDestroyed()) {
        downloadWindow.webContents.send('video-downloader:task-completed', task);
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

      // 发送失败事件到下载悬浮窗
      const downloadWindow = windowManager.get('downloadFloating');
      if (downloadWindow && !downloadWindow.isDestroyed()) {
        downloadWindow.webContents.send('video-downloader:task-failed', task);
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

  // 获取外部资源设置
  ipcMain.handle('video-downloader:get-external-resource-settings', async () => {
    try {
      const settings = getSetting();
      return { success: true, data: settings };
    } catch (error) {
      console.error('[VideoDownload] Failed to get external resource settings:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 设置外部资源设置
  ipcMain.handle('video-downloader:set-external-resource-settings', async (event, settings) => {
    try {
      Object.keys(settings).forEach((key) => {
        setSetting(key as any, settings[key]);
      });
      return { success: true };
    } catch (error) {
      console.error('[VideoDownload] Failed to set external resource settings:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  console.log('[VideoDownload] Video download handlers initialized');
}
