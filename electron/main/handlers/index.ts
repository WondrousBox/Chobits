import { BrowserWindow } from "electron";

import { initWindowHandlers } from "./window";
import { initFFmpegHandlers } from "./ffmpeg";
import { initVectorHandlers } from './vector';
import { initResourceHandlers } from './resource';
import { initTrashHandlers } from './trash';
import { initWorkspaceHandlers } from './workspace';
import { initModelHandlers } from './model';
import { initFileHandlers } from './file';
import { initDatabaseHandlers } from './database';
import { initVideoDownloadHandlers } from './video-download';
import { initFolderHandlers } from './folder';
import { initSpriteHandlers } from './sprite';
import { initStatusHandlers } from './status';

export function initHandlers(win: BrowserWindow) {

  console.log(process.versions);
  

  initWindowHandlers(win);
  initFFmpegHandlers(win);
  initVectorHandlers(win);
  initResourceHandlers(win);
  initFolderHandlers?.(win);
  initTrashHandlers(win);
  initWorkspaceHandlers(win);
  initModelHandlers(win);
  initFileHandlers(win);
  initDatabaseHandlers(win);
  initVideoDownloadHandlers(win);
  initSpriteHandlers(win);
  initStatusHandlers(win);
}
