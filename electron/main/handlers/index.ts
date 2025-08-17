import { BrowserWindow } from "electron";

import { initWindowHandlers } from "./window";

export function initHandlers(win: BrowserWindow) {
  initWindowHandlers(win);
}
