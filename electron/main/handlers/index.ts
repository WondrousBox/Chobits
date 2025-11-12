import { BrowserWindow } from 'electron';

import { init as initPluginResourceHandlers } from '../../../packages/plugins/ipc-main';
import { init as initProxyHandlers } from '../../../packages/proxy/ipc-main';
import { init as initAIHandlers } from '../ai/ipc-main';
import { initFFmpegHandlers } from './ffmpeg';
import { initFileHandlers } from './file';
import { initFolderHandlers } from './folder';
import { initModelHandlers } from './model';
import { initResourceHandlers } from './resource';
import { initShortcutsHandlers } from './shortcuts';
import { initSpriteHandlers } from './sprite';
import { initStatusHandlers } from './status';
import { initSystemHandlers } from './system';
import { initTrashHandlers } from './trash';
import { initVectorHandlers } from './vector';
import { initVideoDownloadHandlers } from './video-download';
import { initWindowHandlers } from './window';
import { initWorkspaceHandlers } from './workspace';

export function initHandlers(win: BrowserWindow): void {
  console.log(process.versions);

  initWindowHandlers(win);
  initFFmpegHandlers(win);
  initVectorHandlers(win);
  initResourceHandlers();
  initFolderHandlers?.();
  initTrashHandlers();
  initWorkspaceHandlers();
  initModelHandlers(win);
  initFileHandlers(win);
  initSystemHandlers();
  initVideoDownloadHandlers(win);
  initSpriteHandlers();
  initStatusHandlers(win);
  initAIHandlers(win);
  initShortcutsHandlers(win);
  initPluginResourceHandlers(win);
  initProxyHandlers(win);
}
