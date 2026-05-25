import { windowManager } from '@aim-packages/window-manager';
import { AppEvent, eventManager } from '@packages/event';
import { BrowserWindow, ipcMain, screen } from 'electron';

import { RssFeedItemsRepo } from '../../db/repositories';
import { getMainWindow } from '../../index';
import type { RssDownloadErrorCode, RssDownloadStatus } from '../rss/types';
import { downloadManager, type DownloadTask, getThumbnail, getVideoInfo, subscriptionManager } from '.';
import { cookieManager } from './cookie-manager';
import { SubscriptionManager } from './subscription-manager';

const RSS_DOWNLOAD_PROGRESS_WRITE_INTERVAL_MS = 1500;
const rssDownloadProgressWrites = new Map<string, { at: number; percent: number }>();

type RssDownloadStatusPatch = {
  downloaded?: boolean;
  localResourceId?: string | null;
  downloadStatus?: RssDownloadStatus;
  downloadProgress?: number | null;
  downloadErrorCode?: RssDownloadErrorCode | null;
  downloadError?: string | null;
  downloadErrorAt?: number | null;
  lastDownloadAt?: number | null;
};

function getStringMetadataValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function getRssTaskLink(payload: { parentResourceId?: string; metadata?: Record<string, unknown> }): { rssResourceId: string; itemId: string } | null {
  const metadata = payload.metadata || {};
  const itemId = getStringMetadataValue(metadata.itemId);
  const rssResourceId = getStringMetadataValue(metadata.rssResourceId) || getStringMetadataValue(metadata.parentResourceId) || payload.parentResourceId;

  if (!rssResourceId || !itemId) {
    return null;
  }

  return { rssResourceId, itemId };
}

function getRssTaskKey(link: { rssResourceId: string; itemId: string }): string {
  return `${link.rssResourceId}:${link.itemId}`;
}

function normalizeProgressPercent(percent?: number): number | undefined {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) {
    return undefined;
  }

  return Math.max(0, Math.min(100, Math.round(percent)));
}

function shouldPersistRssProgress(link: { rssResourceId: string; itemId: string }, percent?: number): percent is number {
  if (percent === undefined) {
    return false;
  }

  const key = getRssTaskKey(link);
  const now = Date.now();
  const previous = rssDownloadProgressWrites.get(key);

  if (!previous || percent === 100 || now - previous.at >= RSS_DOWNLOAD_PROGRESS_WRITE_INTERVAL_MS || Math.abs(percent - previous.percent) >= 5) {
    rssDownloadProgressWrites.set(key, { at: now, percent });
    return true;
  }

  return false;
}

async function updateRssDownloadStatus(payload: { parentResourceId?: string; metadata?: Record<string, unknown> }, patch: RssDownloadStatusPatch): Promise<void> {
  const link = getRssTaskLink(payload);
  if (!link) {
    return;
  }

  try {
    await RssFeedItemsRepo.updateDownloadStatus(link.rssResourceId, link.itemId, patch);
  } catch (error) {
    console.warn('[VideoDownload] Failed to update RSS download status:', error);
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message || fallback;
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return fallback;
}

function createRssDownloadActivePatch(status: Extract<RssDownloadStatus, 'pending' | 'downloading'>, progress = 0): RssDownloadStatusPatch {
  return {
    downloaded: false,
    localResourceId: null,
    downloadStatus: status,
    downloadProgress: progress,
    downloadErrorCode: null,
    downloadError: null,
    downloadErrorAt: null
  };
}

function createRssDownloadFailurePatch(code: RssDownloadErrorCode, message: string): RssDownloadStatusPatch {
  return {
    downloaded: false,
    localResourceId: null,
    downloadStatus: 'error',
    downloadProgress: null,
    downloadErrorCode: code,
    downloadError: message,
    downloadErrorAt: Date.now()
  };
}

function createRssDownloadCancelledPatch(): RssDownloadStatusPatch {
  return {
    downloaded: false,
    localResourceId: null,
    downloadStatus: 'cancelled',
    downloadProgress: null,
    downloadErrorCode: null,
    downloadError: null,
    downloadErrorAt: null
  };
}

function createRssDownloadCompletedPatch(localResourceId?: string): RssDownloadStatusPatch {
  return {
    ...(localResourceId ? { downloaded: true, localResourceId } : {}),
    downloadStatus: 'completed',
    downloadProgress: 100,
    downloadErrorCode: null,
    downloadError: null,
    downloadErrorAt: null,
    lastDownloadAt: Date.now()
  };
}

async function updateRssDownloadProgress(task: DownloadTask): Promise<void> {
  const link = getRssTaskLink(task);
  if (!link) {
    return;
  }

  const percent = normalizeProgressPercent(task.progress?.percent);
  if (!shouldPersistRssProgress(link, percent)) {
    return;
  }

  await updateRssDownloadStatus(task, {
    downloadProgress: percent
  });
}

function clearRssProgressWriteState(task: DownloadTask): void {
  const link = getRssTaskLink(task);
  if (link) {
    rssDownloadProgressWrites.delete(getRssTaskKey(link));
  }
}

function getDownloadTaskLabel(task: DownloadTask): string {
  const label = task.filename || task.videoInfo?.title || task.url;
  return typeof label === 'string' && label.trim() ? label.trim() : '任务';
}

function emitDownloadSpriteEvent(event: AppEvent, task: DownloadTask, message: string, progress?: number): void {
  eventManager.emit(event, {
    taskId: task.id,
    resourceId: task.result?.resourceId || (task.result?.resource as any)?.id,
    progress,
    message
  });
}

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

      await updateRssDownloadStatus(options, createRssDownloadActivePatch('pending', 0));

      const taskId = await downloadManager.addTask(options);
      return { success: true, data: { taskId } };
    } catch (error) {
      console.error('[VideoDownload] Failed to start download:', error);
      await updateRssDownloadStatus(options, createRssDownloadFailurePatch('download_queue_failed', getErrorMessage(error, '启动下载失败')));
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
    await updateRssDownloadStatus(task, createRssDownloadActivePatch('downloading', 0));
    emitDownloadSpriteEvent(AppEvent.SPRITE_DOWNLOAD_START, task, `下载中: ${getDownloadTaskLabel(task)}`, 0);
    win.webContents.send('video-downloader:task-started', task);
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
    void updateRssDownloadProgress(task);
    const percent = normalizeProgressPercent(task.progress?.percent);
    if (percent !== undefined && percent < 100) {
      emitDownloadSpriteEvent(AppEvent.SPRITE_DOWNLOAD_PROGRESS, task, `下载中: ${getDownloadTaskLabel(task)}`, percent);
    }
    win.webContents.send('video-downloader:task-progress', task);

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

  downloadManager.on('taskCompleted', async (task) => {
    console.log('[VideoDownload] 任务已完成:', task.id);
    const rssLink = getRssTaskLink(task);
    const resourceId = task.result?.resourceId || (task.result?.resource as any)?.id;
    if (rssLink && !resourceId) {
      task.status = 'failed';
      task.error = 'Download finished but the resource could not be added to the library';
      await updateRssDownloadStatus(task, createRssDownloadFailurePatch('library_import_failed', task.error));
      clearRssProgressWriteState(task);
      emitDownloadSpriteEvent(AppEvent.SPRITE_DOWNLOAD_FAIL, task, `下载失败: ${getDownloadTaskLabel(task)}`);
      try {
        win.webContents.send('video-downloader:task-failed', task);
        const mainWindow = getMainWindow();
        if (mainWindow) {
          mainWindow.setProgressBar(-1);
        }

        const downloadWindow = windowManager.get('downloadFloating');
        if (downloadWindow && !downloadWindow.isDestroyed()) {
          downloadWindow.webContents.send('video-downloader:task-failed', task);
        }
      } catch (error) {
        console.warn('[VideoDownload] 重置进度条失败:', error);
      }
      return;
    }

    await updateRssDownloadStatus(task, createRssDownloadCompletedPatch(resourceId));
    clearRssProgressWriteState(task);
    emitDownloadSpriteEvent(AppEvent.SPRITE_DOWNLOAD_COMPLETE, task, `下载完成: ${getDownloadTaskLabel(task)}`, 100);
    try {
      win.webContents.send('video-downloader:task-completed', task);
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.setProgressBar(-1);
      }

      const downloadWindow = windowManager.get('downloadFloating');
      if (downloadWindow && !downloadWindow.isDestroyed()) {
        downloadWindow.webContents.send('video-downloader:task-completed', task);
      }
    } catch (error) {
      console.warn('[VideoDownload] 重置进度条失败:', error);
    }
  });

  downloadManager.on('taskFailed', async (task) => {
    console.log('[VideoDownload] 任务失败:', task.id, task.error);
    await updateRssDownloadStatus(task, createRssDownloadFailurePatch('download_failed', getErrorMessage(task.error, '下载失败')));
    clearRssProgressWriteState(task);
    emitDownloadSpriteEvent(AppEvent.SPRITE_DOWNLOAD_FAIL, task, `下载失败: ${getDownloadTaskLabel(task)}`);
    try {
      win.webContents.send('video-downloader:task-failed', task);
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.setProgressBar(-1);
      }

      const downloadWindow = windowManager.get('downloadFloating');
      if (downloadWindow && !downloadWindow.isDestroyed()) {
        downloadWindow.webContents.send('video-downloader:task-failed', task);
      }
    } catch (error) {
      console.warn('[VideoDownload] 重置进度条失败:', error);
    }
  });

  downloadManager.on('taskCancelled', async (task) => {
    console.log('[VideoDownload] 任务已取消:', task.id);
    await updateRssDownloadStatus(task, createRssDownloadCancelledPatch());
    clearRssProgressWriteState(task);
    emitDownloadSpriteEvent(AppEvent.SPRITE_DOWNLOAD_FAIL, task, `下载已取消: ${getDownloadTaskLabel(task)}`);
    try {
      win.webContents.send('video-downloader:task-cancelled', task);
      const mainWindow = getMainWindow();
      if (mainWindow) {
        mainWindow.setProgressBar(-1);
      }

      const downloadWindow = windowManager.get('downloadFloating');
      if (downloadWindow && !downloadWindow.isDestroyed()) {
        downloadWindow.webContents.send('video-downloader:task-cancelled', task);
      }
    } catch (error) {
      console.warn('[VideoDownload] 重置进度条失败:', error);
    }
  });

  // 订阅管理相关 handlers
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
      console.error('[VideoDownload] Failed to check subscription:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  ipcMain.handle('video-downloader:check-all-subscriptions', async () => {
    try {
      await subscriptionManager.checkAllSubscriptions((sub, videoId, videoUrl) => {
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

  ipcMain.handle('video-downloader:start-periodic-check', async (event, intervalMinutes: number = 60) => {
    try {
      subscriptionManager.startPeriodicCheck(intervalMinutes, (sub, videoId, videoUrl) => {
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
