import { ipcMain } from "electron";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { screen } from "electron";

export function initWindowHandlers(win: BrowserWindow) {
  // Child windows (e.g. file list box)
  let fileListWindow: BrowserWindow | null = null

  // AI Assistant IPC handlers
  ipcMain.handle('moveWindow', (_: IpcMainInvokeEvent, x: number, y: number) => {
    if (!win) return false
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false
    win.setPosition(Math.round(x), Math.round(y))
    // Reposition file list window to follow (right side)
    if (fileListWindow && !fileListWindow.isDestroyed()) {
      try {
        const [wx, wy] = win.getPosition()
        const { width: wWidth } = win.getBounds()
        const gap = 12
        fileListWindow.setPosition(wx + wWidth + gap, wy)
      } catch {}
    }
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

  // Open / update file list follower window
  ipcMain.handle('openFileListWindow', async (_: IpcMainInvokeEvent, files: Array<{ name: string; path: string; isDirectory: boolean }>) => {
    if (!win) return false
    try {
      if (!fileListWindow || fileListWindow.isDestroyed()) {
        const { BrowserWindow } = await import('electron')
        const [wx, wy] = win.getPosition()
        const { width: wWidth } = win.getBounds()
        fileListWindow = new BrowserWindow({
          width: 260,
          height: 320,
          frame: false,
          transparent: true,
          resizable: true,
          alwaysOnTop: true,
          skipTaskbar: true,
          show: true,
          backgroundColor: '#00000000',
          webPreferences: {
            // reuse same preload script path as main window (stored when created)
            preload: (win as any).__preloadPath || undefined,
            nodeIntegration: true,
            contextIsolation: true,
          }
        })
        const gap = 12
        fileListWindow.setPosition(wx + wWidth + gap, wy)
        // Load renderer with hash to differentiate
        const url = process.env.VITE_DEV_SERVER_URL
        if (url) {
          fileListWindow.loadURL(`${url}#filebox`)
        } else {
          const indexHtml = (process.env.APP_ROOT || '') + '/dist/index.html'
            ; (fileListWindow as any).loadFile(indexHtml, { hash: 'filebox' })
        }
        fileListWindow.on('closed', () => { fileListWindow = null })
      }
      // Send/refresh file list
      fileListWindow!.webContents.send('update-file-list', files)
      fileListWindow!.showInactive() // show without stealing focus
      return true
    } catch (e) {
      return false
    }
  })
}
