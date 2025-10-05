import { app, BrowserWindow, shell, ipcMain, globalShortcut } from 'electron'
import { setupResourceProtocol, addAllowedResourceRoot, addWorkspaceResourceRoot } from './resource-protocol'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import os from 'node:os'
import { update } from './update'
import { initHandlers } from './handlers'
import { windowManager } from './window/window-manager'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..')

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName())

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
const preload = path.join(__dirname, '../preload/index.mjs')
const indexHtml = path.join(RENDERER_DIST, 'index.html')

// 获取主窗口的函数
export function getMainWindow(): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null
}

async function createWindow() {
  win = new BrowserWindow({
    title: 'Main window',
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    // Assistant size: 180x220, plus 100px padding on each side
    width: 380,
    height: 420,
    frame: false, // frameless for a floating assistant
    transparent: true, // transparent background
    backgroundColor: '#00000000',
    alwaysOnTop: true, // stay on top
    resizable: false, // fixed size to preserve 100px padding
    skipTaskbar: true, // do not show in taskbar
    hasShadow: false,
    show: false, // 延迟显示，等待 ready-to-show 以防白屏闪烁
    webPreferences: {
      preload,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      nodeIntegration: true,
      contextIsolation: true,
      spellcheck: true,
    },
  })
  ;(win as any).__preloadPath = preload

  if (VITE_DEV_SERVER_URL) { // #298
    win.loadURL(VITE_DEV_SERVER_URL)
    // Open devTool if the app is not packaged
    win.webContents.openDevTools()
  } else {
    win.loadFile(indexHtml)
  }

  win.once('ready-to-show', () => {
    if (!win || win.isDestroyed()) return
    win.show()
    if (VITE_DEV_SERVER_URL) win.webContents.openDevTools()
  })

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  initHandlers(win);
  try { windowManager.init(win, { preloadPath: (win as any).__preloadPath }) } catch {}
  // (workspace resource root addition moved to app.whenReady after protocol setup)

  // Auto update
  update(win)
}

app.whenReady().then(async () => {
  // Setup custom resource protocol (modern protocol.handle API)
  try {
    await setupResourceProtocol()
  } catch (e) {
    console.warn('[protocol res] setup failed', e)
  }
  // Add workspace root if exists
  try {
    const { WorkspacesRepo } = await import('./db/repositories')
    const ws = await WorkspacesRepo.getDefault()
    if (ws?.rootPath) {
      const resRoot = path.join(ws.rootPath, 'resources')
      addAllowedResourceRoot(resRoot)
      addWorkspaceResourceRoot(ws.id, resRoot)
    }
  } catch (e) { console.warn('[protocol res] add workspace root failed', e) }
  await createWindow()
  // Register global shortcut for assistant panel toggle
  try {
    const reg = globalShortcut.register('CommandOrControl+K', () => {
      try {
        const existing = windowManager.get('assistant' as any)
        if (existing) {
          if (existing.isVisible()) existing.close(); else windowManager.show('assistant' as any)
        } else {
          windowManager.createOrShow('assistant' as any)
        }
      } catch {}
    })
    if (!reg) console.warn('[shortcut] failed to register CommandOrControl+K')
  } catch (e) {
    console.warn('[shortcut] error registering CommandOrControl+K', e)
  }

  // Register global shortcuts to toggle DevTools
  // Common Electron defaults are CommandOrControl+Shift+I and F12; we provide both.
  const toggleDevtools = () => {
    try {
      if (!win || win.isDestroyed()) return
      const wc = win.webContents
      if (wc.isDevToolsOpened()) wc.closeDevTools(); else wc.openDevTools({ mode: 'detach' })
    } catch (e) {
      console.warn('[shortcut] toggle devtools error', e)
    }
  }
  try {
    const combos = ['CommandOrControl+Alt+I', 'CommandOrControl+Shift+I', 'F12']
    combos.forEach(accel => {
      try {
        const ok = globalShortcut.register(accel, toggleDevtools)
        if (!ok) console.warn(`[shortcut] failed to register ${accel}`)
      } catch (e) {
        console.warn(`[shortcut] error registering ${accel}`, e)
      }
    })
  } catch (e) {
    console.warn('[shortcut] unexpected error registering devtools shortcuts', e)
  }
})

app.on('window-all-closed', () => {
  try { globalShortcut.unregister('CommandOrControl+K') } catch {}
  try { globalShortcut.unregisterAll() } catch {}
  win = null
  if (process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if (allWindows.length) {
    allWindows[0].focus()
  } else {
    createWindow()
  }
})

app.on('will-quit', () => {
  try { globalShortcut.unregisterAll() } catch {}
})

// New window example arg: new windows url
ipcMain.handle('open-win', (_, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    childWindow.loadURL(`${VITE_DEV_SERVER_URL}#${arg}`)
  } else {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
})
