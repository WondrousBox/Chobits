import { BrowserWindow } from "electron";

import { initWindowHandlers } from "./window";
import { initFFmpegHandlers } from "./ffmpeg";
import { initVectorHandlers } from './vector';

export function initHandlers(win: BrowserWindow) {
  initWindowHandlers(win);
  initFFmpegHandlers(win);
  initVectorHandlers(win);
}
