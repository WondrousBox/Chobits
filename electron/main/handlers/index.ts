import { BrowserWindow } from 'electron';

import { init as initPluginResourceHandlers } from '../../../packages/plugins/ipc-main';
import { init as initAIHandlers } from '../ai/ipc-main';
import { initDailyCare } from '../daily';
import { initFFmpegHandlers } from './ffmpeg/ipc-main';
import { initFileHandlers } from './file/ipc-main';
import { initFolderHandlers } from './folder/ipc-main';
import { init as initProxyHandlers } from './proxy/ipc-main';
import { initResourceHandlers } from './resource/ipc-main';
import { initShortcutsHandlers } from './shortcuts';
import { initSpriteHandlers } from './sprite';
import { initStatusHandlers } from './status';
import { initSystemHandlers } from './system';
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
  initShortcutsHandlers(win);
  initPluginResourceHandlers(win);
  initProxyHandlers(win);
  initThemeHandlers();
}
