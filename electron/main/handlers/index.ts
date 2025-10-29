import { BrowserWindow } from 'electron';

import { initWindowHandlers } from './window';
import { initFFmpegHandlers } from './ffmpeg';
import { initVectorHandlers } from './vector';
import { initResourceHandlers } from './resource';
import { initTrashHandlers } from './trash';
import { initWorkspaceHandlers } from './workspace';
import { initModelHandlers } from './model';
import { initFileHandlers } from './file';
import { initVideoDownloadHandlers } from './video-download';
import { initFolderHandlers } from './folder';
import { initSpriteHandlers } from './sprite';
import { initStatusHandlers } from './status';
import { init as initAIHandlers } from '../ai/ipc-main';
import { initShortcutsHandlers } from './shortcuts';
import { initSystemHandlers } from './system';

export function initHandlers(win: BrowserWindow): void {
  console.log(process.versions);

  initWindowHandlers(win);
  initFFmpegHandlers(win);
  initVectorHandlers(win);
  initResourceHandlers();
  initFolderHandlers?.(win);
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
}
