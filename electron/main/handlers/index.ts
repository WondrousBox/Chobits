import { BrowserWindow } from "electron";

import { initWindowHandlers } from "./window";
import { initFFmpegHandlers } from "./ffmpeg";
import { initVectorHandlers } from './vector';
import { initResourceHandlers } from './resource';
import { initTrashHandlers } from './trash';

export function initHandlers(win: BrowserWindow) {

  console.log(process.versions);
  

  initWindowHandlers(win);
  initFFmpegHandlers(win);
  initVectorHandlers(win);
  initResourceHandlers(win);
  initTrashHandlers(win);
}
