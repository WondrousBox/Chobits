import { windowManager } from '@aim-packages/window-manager';
import { BrowserWindow, ipcMain, screen } from 'electron';

import { getMainWindow } from '../../index';
import { downloadManager, getThumbnail, getVideoInfo, subscriptionManager } from '.';
import { cookieManager } from './cookie-manager';
import { SubscriptionManager } from './subscription-manager';

export function initDownloadHandlers(win: BrowserWindow): void {
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
        // 设置窗口位置（右下角，留出一些边距）
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
        const windowWidth = 340;
        const windowHeight = 140;

        downloadWindow.setBounds({
          x: screenWidth - windowWidth - 24,
          y: screenHeight - windowHeight - 24,
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

  // 订阅管理相关 handlers
  // 获取所有订阅
  ipcMain.handle('video-downloader:get-subscriptions', async () => {
    try {
      const subscriptions = subscriptionManager.getAllSubscriptions();
      return { success: true, data: subscriptions };
    } catch (error) {
      console.error('[VideoDownload] Failed to get subscriptions:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 添加订阅
  ipcMain.handle('video-downloader:add-subscription', async (event, data: { channelIdOrUrl: string; channelName?: string; autoDownload?: boolean }) => {
    try {
      const channelInfo = await SubscriptionManager.extractChannelId(data.channelIdOrUrl);
      if (!channelInfo) {
        return {
          success: false,
          error: '无效的频道 ID 或 URL'
        };
      }

      // 尝试从 RSS feed 获取频道名称
      const channelName = data.channelName || channelInfo.channelId;
      // 注意：频道名称可以从 RSS feed 中获取，但需要解析完整的 XML
      // 这里简化处理，使用用户提供的名称或频道 ID

      const subscription = subscriptionManager.addSubscription({
        channelId: channelInfo.channelId,
        channelName,
        rssUrl: channelInfo.rssUrl,
        enabled: true,
        autoDownload: data.autoDownload !== false
      });

      return { success: true, data: subscription };
    } catch (error) {
      console.error('[VideoDownload] Failed to add subscription:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 更新订阅
  ipcMain.handle('video-downloader:update-subscription', async (event, id: string, updates: any) => {
    try {
      const subscription = subscriptionManager.updateSubscription(id, updates);
      if (!subscription) {
        return {
          success: false,
          error: '订阅不存在'
        };
      }
      return { success: true, data: subscription };
    } catch (error) {
      console.error('[VideoDownload] Failed to update subscription:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 删除订阅
  ipcMain.handle('video-downloader:delete-subscription', async (event, id: string) => {
    try {
      const success = subscriptionManager.deleteSubscription(id);
      return { success, data: { id } };
    } catch (error) {
      console.error('[VideoDownload] Failed to delete subscription:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 检查订阅（手动触发）
  ipcMain.handle('video-downloader:check-subscription', async (event, id: string) => {
    try {
      const subscription = subscriptionManager.getSubscription(id);
      if (!subscription) {
        return {
          success: false,
          error: '订阅不存在'
        };
      }

      await subscriptionManager.checkSubscription(subscription, (sub, videoId, videoUrl) => {
        // 自动下载新视频
        if (sub.autoDownload) {
          downloadManager
            .addTask({
              url: videoUrl,
              videoInfo: undefined // 将在下载时获取
            })
            .then((taskId) => {
              console.log(`[VideoDownload] Auto-downloading video from subscription ${sub.channelName}: ${taskId}`);
              subscriptionManager.markVideoDownloaded(sub.channelId, videoId);
            })
            .catch((error) => {
              console.error(`[VideoDownload] Failed to auto-download video:`, error);
            });
        }
      });

      return { success: true };
    } catch (error) {
      console.error('[VideoDownload] Failed to check subscription:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 检查所有订阅
  ipcMain.handle('video-downloader:check-all-subscriptions', async () => {
    try {
      await subscriptionManager.checkAllSubscriptions((sub, videoId, videoUrl) => {
        // 自动下载新视频
        if (sub.autoDownload) {
          downloadManager
            .addTask({
              url: videoUrl,
              videoInfo: undefined
            })
            .then((taskId) => {
              console.log(`[VideoDownload] Auto-downloading video from subscription ${sub.channelName}: ${taskId}`);
              subscriptionManager.markVideoDownloaded(sub.channelId, videoId);
            })
            .catch((error) => {
              console.error(`[VideoDownload] Failed to auto-download video:`, error);
            });
        }
      });

      return { success: true };
    } catch (error) {
      console.error('[VideoDownload] Failed to check all subscriptions:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 启动定期检查
  ipcMain.handle('video-downloader:start-periodic-check', async (event, intervalMinutes: number = 60) => {
    try {
      subscriptionManager.startPeriodicCheck(intervalMinutes, (sub, videoId, videoUrl) => {
        // 自动下载新视频
        if (sub.autoDownload) {
          downloadManager
            .addTask({
              url: videoUrl,
              videoInfo: undefined
            })
            .then((taskId) => {
              console.log(`[VideoDownload] Auto-downloading video from subscription ${sub.channelName}: ${taskId}`);
              subscriptionManager.markVideoDownloaded(sub.channelId, videoId);
            })
            .catch((error) => {
              console.error(`[VideoDownload] Failed to auto-download video:`, error);
            });
        }
      });

      return { success: true };
    } catch (error) {
      console.error('[VideoDownload] Failed to start periodic check:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 停止定期检查
  ipcMain.handle('video-downloader:stop-periodic-check', async () => {
    try {
      subscriptionManager.stopPeriodicCheck();
      return { success: true };
    } catch (error) {
      console.error('[VideoDownload] Failed to stop periodic check:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // ===== YouTube Cookie 相关处理器 =====

  // 打开 YouTube 登录窗口
  ipcMain.handle('video-downloader:open-youtube-login', async () => {
    try {
      const cookies = await cookieManager.openLoginWindow(win);
      return {
        success: true,
        data: {
          cookieCount: cookies.length,
          isLoggedIn: true
        }
      };
    } catch (error) {
      console.error('[VideoDownload] Failed to open login window:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 获取 YouTube Cookie 状态
  ipcMain.handle('video-downloader:get-cookie-status', async () => {
    try {
      return {
        success: true,
        data: {
          isLoggedIn: cookieManager.isLoggedIn(),
          cookieCount: cookieManager.getCookieCount(),
          isValid: cookieManager.isValid()
        }
      };
    } catch (error) {
      console.error('[VideoDownload] Failed to get cookie status:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 清除 YouTube Cookies
  ipcMain.handle('video-downloader:clear-cookies', async () => {
    try {
      await cookieManager.clearCookies();
      return { success: true };
    } catch (error) {
      console.error('[VideoDownload] Failed to clear cookies:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 导出 Cookies（用于调试）
  ipcMain.handle('video-downloader:export-cookies', async (event, outputPath?: string) => {
    try {
      const filePath = await cookieManager.exportNetscapeCookies(outputPath);
      return {
        success: true,
        data: { filePath }
      };
    } catch (error) {
      console.error('[VideoDownload] Failed to export cookies:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 启动时自动开始定期检查
  subscriptionManager.startPeriodicCheck(60, (sub, videoId, videoUrl) => {
    if (sub.autoDownload) {
      downloadManager
        .addTask({
          url: videoUrl,
          videoInfo: undefined
        })
        .then((taskId) => {
          console.log(`[VideoDownload] Auto-downloading video from subscription ${sub.channelName}: ${taskId}`);
          subscriptionManager.markVideoDownloaded(sub.channelId, videoId);
        })
        .catch((error) => {
          console.error(`[VideoDownload] Failed to auto-download video:`, error);
        });
    }
  });

  console.log('[VideoDownload] Video download handlers initialized');
}
