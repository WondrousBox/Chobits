import { BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

import { checkYtDlpUpdate, downloadAndInstallVersion, ensureYtdlpBinaryPath } from './updater';
import { ytdlpService } from './ytdlp-service';
import type { YtDlpConfig, YtDlpDownloadProgress, YtDlpReleaseInfo } from './types';

/**
 * 初始化 yt-dlp 相关的 IPC handlers
 */
export function initYtDlpIpcHandlers(win: BrowserWindow): void {
  console.log('[yt-dlp] Initializing yt-dlp IPC handlers');

  // 在初始化时确保 yt-dlp 使用正确的二进制路径
  ensureYtdlpBinaryPath();

  // ========== 二进制管理 ==========

  // 检查更新（包含最近5个版本）
  ipcMain.handle('ytdlp:check-update', async () => {
    try {
      const info = await checkYtDlpUpdate(true);
      return { success: true, data: info };
    } catch (error) {
      console.error('[yt-dlp] Failed to check update:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 下载并安装指定版本
  ipcMain.handle('ytdlp:download-version', async (_event, release?: YtDlpReleaseInfo) => {
    try {
      console.log('[yt-dlp] Starting download', release?.tag_name || 'latest');

      const result = await downloadAndInstallVersion(release, (p: YtDlpDownloadProgress) => {
        win.webContents.send('ytdlp:download-progress', p);
      });

      console.log('[yt-dlp] Download completed', result);

      return { success: true, data: result };
    } catch (error) {
      console.error('[yt-dlp] Failed to download:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 获取当前 yt-dlp 路径
  ipcMain.handle('ytdlp:get-path', async () => {
    try {
      const currentPath = ytdlpService.getCurrentBinaryPath();
      return { success: true, data: { path: currentPath } };
    } catch (error) {
      console.error('[yt-dlp] Failed to get path:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 重置为内置版本
  ipcMain.handle('ytdlp:reset-to-builtin', async () => {
    try {
      const userPath = ytdlpService.getUserBinaryPath();
      const userDir = path.dirname(userPath);

      // 删除用户目录中的 yt-dlp
      if (fs.existsSync(userDir)) {
        fs.rmSync(userDir, { recursive: true, force: true });
      }

      // 重置为内置路径
      const builtinPath = ytdlpService.getBuiltinBinaryPath();
      ytdlpService.updateBinaryPath(builtinPath);
      console.log('[yt-dlp] Reset to builtin path:', builtinPath);

      return { success: true, data: { path: builtinPath } };
    } catch (error) {
      console.error('[yt-dlp] Failed to reset:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 获取 yt-dlp 文件夹路径（用于打开文件夹）
  ipcMain.handle('ytdlp:get-folder-path', async () => {
    try {
      const userPath = ytdlpService.getUserBinaryPath();
      const userDir = path.dirname(userPath);

      // 优先返回用户下载的文件夹路径，如果不存在则返回内置版本的文件夹路径
      if (fs.existsSync(userDir)) {
        return { success: true, data: { folderPath: userDir } };
      }

      const builtinPath = ytdlpService.getBuiltinBinaryPath();
      const builtinDir = path.dirname(builtinPath);
      return { success: true, data: { folderPath: builtinDir } };
    } catch (error) {
      console.error('[yt-dlp] Failed to get folder path:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // ========== 配置管理 ==========

  // 获取配置
  ipcMain.handle('ytdlp:get-config', async () => {
    try {
      const config = ytdlpService.getConfig();
      return { success: true, data: config };
    } catch (error) {
      console.error('[yt-dlp] Failed to get config:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 设置配置
  ipcMain.handle('ytdlp:set-config', async (_event, config: Partial<YtDlpConfig>) => {
    try {
      const updated = ytdlpService.setConfig(config);
      return { success: true, data: updated };
    } catch (error) {
      console.error('[yt-dlp] Failed to set config:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  // 获取配置文件路径
  ipcMain.handle('ytdlp:get-config-path', async () => {
    try {
      const configPath = ytdlpService.getConfigFilePath();
      const ytdlpConfPath = ytdlpService.getYtDlpConfFilePath();
      return { success: true, data: { configPath, ytdlpConfPath } };
    } catch (error) {
      console.error('[yt-dlp] Failed to get config path:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });

  console.log('[yt-dlp] yt-dlp IPC handlers initialized');
}
