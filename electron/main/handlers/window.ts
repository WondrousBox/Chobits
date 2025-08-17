import { ipcMain } from "electron";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { screen } from "electron";

export function initWindowHandlers(win: BrowserWindow) {
  // AI Assistant IPC handlers
  ipcMain.handle('moveWindow', (_: IpcMainInvokeEvent, x: number, y: number) => {
    if (!win) return false
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false
    // Electron expects integers
    win.setPosition(Math.round(x), Math.round(y))
    return true
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

  // Enable/disable click-through so padding area is usable for underlying apps
  ipcMain.handle('setClickThrough', (_: IpcMainInvokeEvent, enable: boolean) => {
    if (!win) return false
    try {
      win.setIgnoreMouseEvents(!!enable, { forward: true })
      return true
    } catch (e) {
      return false
    }
  })
}
