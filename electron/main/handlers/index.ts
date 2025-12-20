import { windowManager } from '@aim-packages/window-manager';
import { BrowserWindow } from 'electron';

import { initAIHandlers } from '../../../packages/ai/ipc-main';
import type { DownloadProgress } from '../../../packages/plugins';
import { initPluginResourceHandlers } from '../../../packages/plugins/ipc-main';
import { initRecorderHandlers } from '../../../packages/recorder/ipc-main';
import { initDailyCare } from '../daily';
import { initScreenshotHandlers } from '../screenshot';
import { getResourcePath } from '../utils/resources-path';
import { initAutomationHandlers } from './automation/ipc-main';
import { initFFmpegHandlers } from './ffmpeg/ipc-main';
import { initFileHandlers } from './file/ipc-main';
import { initFolderHandlers } from './folder/ipc-main';
import { initProxyHandlers } from './proxy/ipc-main';
import { getHttpProxy } from './proxy/proxy';
import { initResourceHandlers } from './resource/ipc-main';
import { initShortcutsHandlers } from './shortcuts';
import { initSpriteHandlers } from './sprite';
import { initStatusHandlers } from './status';
import { initSystemHandlers } from './system/ipc-main';
import { initThemeHandlers } from './theme/ipc-main';
import { initTrashHandlers } from './trash/ipc-main';
import { initVectorHandlers } from './vector';
import { initVideoDownloadHandlers } from './video-download';
import { initWindowHandlers } from './window';
import { initWorkspaceHandlers } from './workspace/ipc-main';

export function initHandlers(win: BrowserWindow): void {
  console.log(process.versions);

  initWindowHandlers(win);
  initFFmpegHandlers(win);
  initVectorHandlers(win);
  initResourceHandlers();
  initAutomationHandlers();
  initFolderHandlers?.();
  initTrashHandlers();
  initWorkspaceHandlers();
  initFileHandlers(win);
  initSystemHandlers();
  initVideoDownloadHandlers(win);
  initSpriteHandlers();
  initDailyCare(() => {
    if (win && !win.isDestroyed()) return win;
    const existing = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    return existing || null;
  });
  initStatusHandlers(win);
  initAIHandlers(win);
  initRecorderHandlers();
  initShortcutsHandlers(win);
  initPluginResourceHandlers(win, {
    getHttpProxy,
    getPluginDefinitionsPath: () => getResourcePath('plugins')!,
    onProgress: (info: DownloadProgress) => {
      try {
        // 发送到主窗口
        win.webContents.send('plugin-resource:progress', info);
      } catch {
        // 窗口可能已关闭
      }
      // 同时发送到插件下载窗口
      try {
        const downloadWindow = windowManager.get('pluginDownload');
        if (downloadWindow && !downloadWindow.isDestroyed()) {
          downloadWindow.webContents.send('plugin-resource:progress', info);
        }
        const settingsWindow = windowManager.get('settings');
        if (settingsWindow && !settingsWindow.isDestroyed()) {
          settingsWindow.webContents.send('plugin-resource:progress', info);
        }
      } catch {
        // 窗口可能不存在或已关闭
      }
    }
  });
  initProxyHandlers(win);
  initThemeHandlers();
  initScreenshotHandlers();
}
