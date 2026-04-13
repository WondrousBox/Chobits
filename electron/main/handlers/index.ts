import { windowManager } from '@aim-packages/window-manager';
import { BrowserWindow } from 'electron';

import { initAIHandlers } from '../../../packages/ai/ipc-main';
import type { DownloadProgress } from '../../../packages/plugins';
import { initPluginResourceHandlers } from '../../../packages/plugins/ipc-main';
import { initRecorderHandlers } from '../../../packages/recorder/ipc-main';
import { initSherpaHandlers } from '../../../packages/sherpa/ipc-main';
import { initSpriteHandlers, initSpriteManagerIPC } from '../../../packages/sprite-core/handler';
import { initTTSHandlers } from '../../../packages/tts/ipc-main';
import { initYtDlpIpcHandlers } from '../../../packages/ytdlp';
import { initDailyCare } from '../daily';
import { initScreenshotHandlers } from '../screenshot';
import { initSkillTreeHandlers } from '../skillTreeWindow';
import { getResourcePath } from '../utils/resources-path';
import { initAnalyticsHandlers } from './analytics/ipc-main';
import { initAnnotationHandlers } from './annotation/ipc-main';
import { initAutomationHandlers } from './automation/ipc-main';
import { initClipHandlers } from './clip/ipc-main';
import { initDownloadHandlers } from './downloader/ipc-main';
import { initVectorHandlers } from './embedding/ipc-main';
import { initFFmpegHandlers } from './ffmpeg/ipc-main';
import { initFileHandlers } from './file/ipc-main';
import { initFolderHandlers } from './folder/ipc-main';
import { initMediaHandlers } from './media/ipc-main';
import { initMediaTrackHandlers } from './mediaTrack/ipc-main';
import { initMemoryHandlers } from './memory/ipc-main';
import { initPreferencesHandlers } from './preferences/ipc-main';
import { initProxyHandlers } from './proxy/ipc-main';
import { getHttpProxy } from './proxy/proxy';
import { initResourceHandlers } from './resource/ipc-main';
import { initRssHandlers } from './rss/ipc-main';
import { initShortcutsHandlers } from './shortcuts';
import { initSpleeterHandlers } from './spleeter/ipc-main';
import { SpriteSpontaneousUtteranceService } from './sprite/spontaneous-utterance-service';
import { initStatusHandlers } from './status';
import { initSystemHandlers } from './system/ipc-main';
import { initThemeHandlers } from './theme/ipc-main';
import { initTrashHandlers } from './trash/ipc-main';
import { initUserProfileHandlers } from './user-profile/ipc-main';
import { initWindowHandlers } from './window';
import { initWorkspaceHandlers } from './workspace/ipc-main';

export async function initHandlers(win: BrowserWindow): Promise<void> {
  console.log(process.versions);

  initWindowHandlers(win);
  initFFmpegHandlers(win);
  initVectorHandlers(win);
  initResourceHandlers();
  initRssHandlers();
  initAutomationHandlers();
  initFolderHandlers?.();
  initTrashHandlers();
  initWorkspaceHandlers();
  initFileHandlers(win);
  initSystemHandlers();
  initDownloadHandlers(win);
  initSpriteHandlers({
    addAllowedResourceRoot: (await import('../resource-protocol')).addAllowedResourceRoot,
    getResourcePath
  });
  initDailyCare(() => {
    if (win && !win.isDestroyed()) return win;
    const existing = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
    return existing || null;
  });
  initStatusHandlers(win);
  await initAIHandlers(win);
  initRecorderHandlers();
  initSherpaHandlers();
  initTTSHandlers();
  initShortcutsHandlers(win);
  initPreferencesHandlers();
  initPluginResourceHandlers(win, {
    getHttpProxy,
    getPluginDefinitionsPath: () => getResourcePath('plugins')!,
    onProgress: (info: DownloadProgress) => {
      // 发送到所有可能需要进度更新的窗口
      const targets = [win, windowManager.get('pluginDownload'), windowManager.get('pluginManager'), windowManager.get('settings')];
      for (const w of targets) {
        try {
          if (w && !w.isDestroyed()) {
            w.webContents.send('plugin-resource:progress', info);
          }
        } catch {
          // 窗口可能已关闭
        }
      }
    }
  });
  initProxyHandlers(win);
  initThemeHandlers();
  initScreenshotHandlers();
  initSpleeterHandlers(win);
  initYtDlpIpcHandlers(win);
  initSkillTreeHandlers();
  initClipHandlers();
  initMediaTrackHandlers();
  initAnnotationHandlers();
  initMediaHandlers(win);
  initMemoryHandlers();
  initAnalyticsHandlers();
  initUserProfileHandlers();
  const spontaneousUtteranceService = new SpriteSpontaneousUtteranceService();
  await initSpriteManagerIPC(win, {
    addAllowedResourceRoot: (await import('../resource-protocol')).addAllowedResourceRoot,
    spontaneousUtteranceExecutor: spontaneousUtteranceService
  });
}
