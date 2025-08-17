import { ipcMain } from "electron";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { screen } from "electron";

export function initWindowHandlers(win: BrowserWindow) {
  // AI Assistant IPC handlers
  ipcMain.handle('moveWindow', (_: IpcMainInvokeEvent, { x, y }) => {
    if (win) {
      win.setPosition(x, y)
    }
  })

  ipcMain.handle('getWindowPosition', () => {
    if (win) {
      return win.getPosition()
    }
    return [0, 0]
  })

  ipcMain.handle('getScreenSize', () => {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    return { width, height }
  })
}
