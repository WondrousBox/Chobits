import { ipcMain } from "electron";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { screen } from "electron";

export function initWindowHandlers(win: BrowserWindow) {
  let fileListWindow: BrowserWindow | null = null

  // 计算子窗口应放置位置：优先右侧 -> 左侧 -> 下方 -> 上方，并避免越界
  function computeFollowerPosition(main: Electron.Rectangle, follower: { width: number; height: number }) {
    const gap = 12
    // 找到当前所在屏幕（多显示器支持）
    const display = screen.getDisplayNearestPoint({ x: main.x + main.width / 2, y: main.y + main.height / 2 })
    const work = display.workArea // {x,y,width,height}

    // 可选位置集合
    const candidates: Array<{ x: number; y: number; score: number }> = []
    // 右侧
    candidates.push({ x: main.x + main.width + gap, y: main.y, score: 100 })
    // 左侧
    candidates.push({ x: main.x - follower.width - gap, y: main.y, score: 90 })
    // 下方（对齐左边）
    candidates.push({ x: main.x, y: main.y + main.height + gap, score: 80 })
    // 上方
    candidates.push({ x: main.x, y: main.y - follower.height - gap, score: 70 })

    // 检查越界并调整得分（越界严重的丢弃）
    const valid: typeof candidates = []
    for (const c of candidates) {
      const withinX = c.x >= work.x && c.x + follower.width <= work.x + work.width
      const withinY = c.y >= work.y && c.y + follower.height <= work.y + work.height
      if (withinX && withinY) {
        valid.push(c)
      }
    }
    // 如果都有越界，则允许部分越界但做裁剪（取最少出界面积）
    if (valid.length === 0) {
      function overflowArea(c: { x: number; y: number }) {
        const ox = Math.max(0, work.x - c.x) + Math.max(0, (c.x + follower.width) - (work.x + work.width))
        const oy = Math.max(0, work.y - c.y) + Math.max(0, (c.y + follower.height) - (work.y + work.height))
        return ox * follower.height + oy * follower.width
      }
      candidates.forEach(c => { (c as any).overflow = overflowArea(c) })
      candidates.sort((a: any, b: any) => a.overflow - b.overflow || b.score - a.score)
      const best = candidates[0]
      return {
        x: Math.min(Math.max(best.x, work.x), work.x + work.width - follower.width),
        y: Math.min(Math.max(best.y, work.y), work.y + work.height - follower.height)
      }
    }
    // 选择得分最高
    valid.sort((a, b) => b.score - a.score)
    return { x: valid[0].x, y: valid[0].y }
  }

  function repositionFollower() {
    if (!win || !fileListWindow || fileListWindow.isDestroyed()) return
    try {
      const mainBounds = win.getBounds()
      const followerBounds = fileListWindow.getBounds()
      const pos = computeFollowerPosition(mainBounds, followerBounds)
      fileListWindow.setPosition(pos.x, pos.y)
    } catch {}
  }

  // 主窗口关闭时统一销毁子窗口
  win.on('closed', () => {
    if (fileListWindow && !fileListWindow.isDestroyed()) {
      try { fileListWindow.destroy() } catch {}
    }
    fileListWindow = null
  })

  // AI Assistant IPC handlers
  ipcMain.handle('moveWindow', (_: IpcMainInvokeEvent, x: number, y: number) => {
    if (!win) return false
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false
    win.setPosition(Math.round(x), Math.round(y))
    repositionFollower()
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
        const mainBounds = win.getBounds()
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
        repositionFollower()
        // Load renderer with hash to differentiate
        const url = process.env.VITE_DEV_SERVER_URL
        if (url) {
          fileListWindow.loadURL(`${url}#filebox`)
        } else {
          const indexHtml = (process.env.APP_ROOT || '') + '/dist/index.html'
            ; (fileListWindow as any).loadFile(indexHtml, { hash: 'filebox' })
        }
        fileListWindow.on('closed', () => { fileListWindow = null })
      } else {
        repositionFollower()
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
