import { BrowserWindow } from "electron";

import { initWindowHandlers } from "./window";
import { initFFmpegHandlers } from "./ffmpeg";

export function initHandlers(win: BrowserWindow) {
  initWindowHandlers(win);
  initFFmpegHandlers(win);
}
