import { ipcMain, BrowserWindow } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { screen, app } from "electron";
import fs from 'node:fs';
import path from 'node:path';
import { windowManager } from '../window/window-manager'
import { WindowKey } from "../window/window-config";
import { getSuggestWorkspacePath } from "../utils";
import { saveWindowState, WindowStateStore } from '../window/window-state-store';

// Assistant intrinsic size
const ASSISTANT_WIDTH = 180;
const ASSISTANT_HEIGHT = 220;

// Open DevTools automatically in dev/test environments
const SHOULD_OPEN_DEVTOOLS = !!process.env.VITE_DEV_SERVER_URL || (process.env.NODE_ENV && process.env.NODE_ENV !== 'production')
function maybeOpenDevTools(w: BrowserWindow | null) {
  try {
    if (SHOULD_OPEN_DEVTOOLS && w && !w.isDestroyed()) {
      // detach mode avoids overlaying frameless/transparent windows
      w.webContents.openDevTools({ mode: 'detach' })
    }
  } catch { }
}

export function initWindowHandlers(win: BrowserWindow) {
  let fileListWindow: BrowserWindow | null = null
  // New follower windows: context menu + settings
  let menuWindow: BrowserWindow | null = null
  let settingsWindow: BrowserWindow | null = null

  // Movement config persistence ------------------------------------------------
  type MovementConfig = { walkSpeed: number; fpsLimit: number; movementMode: 'stepped' | 'smooth'; stepGrid: number; pathCurveFactor: number; assistantPadding: number }
  const defaultConfig: MovementConfig = { walkSpeed: 500, fpsLimit: 30, movementMode: 'stepped', stepGrid: 12, pathCurveFactor: 0.15, assistantPadding: 100 }
  const configDir = app.getPath('userData')
  const configFile = path.join(configDir, 'movement-config.json')
  let movementConfig: MovementConfig = defaultConfig
  try {
    if (fs.existsSync(configFile)) {
      const txt = fs.readFileSync(configFile, 'utf8')
      const parsed = JSON.parse(txt)
      movementConfig = { ...defaultConfig, ...parsed }
    }
  } catch { movementConfig = defaultConfig }
  function saveConfig() {
    try { fs.writeFileSync(configFile, JSON.stringify(movementConfig, null, 2), 'utf8') } catch { }
  }

  // ---------------- Hover monitor to manage click-through ---------------
  // 在透明窗口上，为了让外部（Finder）拖拽能进入助手区域，我们需要在鼠标进入助手内层矩形时
  // 自动关闭 ignoreMouseEvents（否则不会收到 dragenter/over 事件）。
  let hoverTimer: NodeJS.Timeout | null = null
  let lastInside = false
  function isCursorInsideAssistant(): boolean {
    if (!win || win.isDestroyed()) return false
    try {
      const p = screen.getCursorScreenPoint()
      const b = win.getBounds()
      const padding = movementConfig.assistantPadding ?? 0
      const ax = b.x + padding
      const ay = b.y + padding
      const aw = ASSISTANT_WIDTH
      const ah = ASSISTANT_HEIGHT
      return p.x >= ax && p.x <= ax + aw && p.y >= ay && p.y <= ay + ah
    } catch { return false }
  }

  function startHoverMonitor() {
    stopHoverMonitor()
    hoverTimer = setInterval(() => {
      const inside = isCursorInsideAssistant()
      if (inside !== lastInside) {
        lastInside = inside
        try {
          // 鼠标在助手区域内：允许接收事件（包括外部拖拽）
          // 区域外：继续穿透到底层应用
          win.setIgnoreMouseEvents(!inside, { forward: true })
        } catch { }
      }
    }, 33) // ~30fps 轮询
  }
  function stopHoverMonitor() {
    if (hoverTimer) { clearInterval(hoverTimer); hoverTimer = null }
  }

  // 主窗口关闭时统一销毁子窗口
  win.on('closed', () => {
    [fileListWindow, menuWindow, settingsWindow]
      .forEach(w => { try { w && !w.isDestroyed() && w.destroy() } catch { } });

    fileListWindow = null;
    menuWindow = null;
    settingsWindow = null;
    // stopFollowerAnimation 已迁移到窗口管理器中
    stopHoverMonitor()
  })

  // 启动 hover 监控
  startHoverMonitor()

  // Bootstrap WindowManager with main window context
  try {
    windowManager.init(win, {
      preloadPath: (win as any).__preloadPath,
      assistantPadding: movementConfig.assistantPadding
    })
  } catch { }

  // ---------------- Movement Config IPC --------------------
  ipcMain.handle('getMovementConfig', () => {
    return movementConfig
  })
  ipcMain.handle('updateMovementConfig', (_: IpcMainInvokeEvent, partial: Partial<MovementConfig>) => {
    const oldPadding = movementConfig.assistantPadding
    movementConfig = { ...movementConfig, ...partial }
    saveConfig()
    if (partial.assistantPadding !== undefined) {
      // 使用窗口管理器的内边距调整功能，它会自动更新跟随窗口位置
      windowManager.adjustMainWindowForPadding(oldPadding, movementConfig.assistantPadding)
    }
    // 广播更新
    try { win?.webContents.send('movement-config-updated', movementConfig) } catch { }
    try { settingsWindow?.webContents.send('movement-config-updated', movementConfig) } catch { }
    return movementConfig
  })

  // ---------------- Window Move & Click Through -------------
  ipcMain.handle('moveWindow', (_: IpcMainInvokeEvent, x: number, y: number) => {
    if (!win) return false
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false
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

  // 设置窗口大小
  ipcMain.handle('setWindowSize', (_: IpcMainInvokeEvent, windowKey: string, width: number, height: number, center?: boolean) => {
    try {
      let targetWindow: BrowserWindow | null = null

      // 根据窗口键获取目标窗口
      if (windowKey === 'main') {
        targetWindow = win
      } else {
        // 从窗口管理器获取其他窗口
        targetWindow = windowManager.get(windowKey as any)
      }

      if (!targetWindow || targetWindow.isDestroyed()) {
        return { success: false, error: 'Window not found' }
      }

      // 获取当前屏幕信息
      const display = screen.getDisplayNearestPoint(targetWindow.getBounds())
      const workArea = display.workArea

      // 确保窗口大小不超过屏幕工作区域
      const maxWidth = workArea.width
      const maxHeight = workArea.height
      const finalWidth = Math.min(width, maxWidth)
      const finalHeight = Math.min(height, maxHeight)

      // 计算窗口位置
      let x = targetWindow.getPosition()[0]
      let y = targetWindow.getPosition()[1]

      if (center) {
        // 居中显示
        x = workArea.x + Math.floor((workArea.width - finalWidth) / 2)
        y = workArea.y + Math.floor((workArea.height - finalHeight) / 2)
      } else {
        // 保持当前位置，但确保窗口在屏幕内
        const currentBounds = targetWindow.getBounds()
        x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - finalWidth))
        y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - finalHeight))
      }

      // 设置窗口大小和位置
      targetWindow.setBounds({ x, y, width: finalWidth, height: finalHeight })

      return { success: true, bounds: { x, y, width: finalWidth, height: finalHeight } }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  // 获取窗口当前大小
  ipcMain.handle('getWindowSize', (_: IpcMainInvokeEvent, windowKey: string) => {
    try {
      let targetWindow: BrowserWindow | null = null

      if (windowKey === 'main') {
        targetWindow = win
      } else {
        targetWindow = windowManager.get(windowKey as any)
      }

      if (!targetWindow || targetWindow.isDestroyed()) {
        return { success: false, error: 'Window not found' }
      }

      const bounds = targetWindow.getBounds()
      return { success: true, bounds }
    } catch (error) {
      return { success: false, error: String(error) }
    }
  })

  ipcMain.handle('setClickThrough', (_: IpcMainInvokeEvent, enable: boolean) => {
    if (!win) return false
    try {
      win.setIgnoreMouseEvents(!!enable, { forward: true })
      return true
    } catch (e) {
      return false
    }
  })

  // ---------------- File List Follower Window ----------------
  ipcMain.handle('openFileListWindow', async (_: IpcMainInvokeEvent, files: Array<{ name: string; path: string; isDirectory: boolean }>) => {
    if (!win) return false
    try {
      let w = windowManager.get('fileList')
      if (!w) {
        w = await windowManager.create('fileList')
        if (!w) return false
        fileListWindow = w
        w.once('ready-to-show', () => { try { w!.showInactive?.() } catch { } })
        // 使用新的窗口管理器跟随功能
        windowManager.updateFollowerPositionsManually()
        maybeOpenDevTools(w)
        w.on('closed', () => { fileListWindow = null; /* 动画清理已迁移到窗口管理器 */ })
      } else {
        fileListWindow = w
        // 使用新的窗口管理器跟随功能
        windowManager.updateFollowerPositionsManually()
      }
      try { (fileListWindow as any).showInactive?.() } catch { }
      return true
    } catch (e) { return false }
  })

  // ---------------- Context Menu Follower Window -------------
  ipcMain.handle('openMenuWindow', async () => {
    if (!win) return false
    try {
      let w = windowManager.get('menu')
      if (!w) {
        w = await windowManager.create('menu')
        if (!w) return false
        menuWindow = w
        w.once('ready-to-show', () => {
          try {
            // 菜单显示前暂停主窗口悬停监控，避免期间进行鼠标穿透计算
            stopHoverMonitor()
            w!.show()
          } catch { }
        })
        // 使用新的窗口管理器跟随功能
        windowManager.updateFollowerPositionsManually()
        // 菜单显示期间暂停监控，关闭/隐藏后恢复
        w.on('show', () => { try { stopHoverMonitor() } catch { } })
        w.on('hide', () => { try { startHoverMonitor() } catch { } })
        w.on('closed', () => { menuWindow = null; try { startHoverMonitor() } catch { } })
      } else {
        menuWindow = w
        // 使用新的窗口管理器跟随功能
        windowManager.updateFollowerPositionsManually()
        try { stopHoverMonitor() } catch { }
      }
      // 如果已存在且 ready，直接显示
      if (menuWindow && menuWindow.isVisible()) menuWindow.focus(); else try { stopHoverMonitor(); menuWindow?.show() } catch { }
      return true
    } catch { return false }
  })

  // ---------------- Settings Window (独立配置窗口) ------------

  ipcMain.handle('suggestWorkspacePath', async () => getSuggestWorkspacePath())

  // ---------------- Menu Command (转发给主渲染) ---------------
  ipcMain.on('menu-command', (_e, action: string) => {
    switch (action) {
      case 'quit-app':
        try { app.quit() } catch { }
        return
      case 'close-settings':
        try { settingsWindow?.close() } catch { }
        return
      case 'toggle-walk':
      case 'walk-once':
        try { win?.webContents.send('menu-command', action) } catch { }
        return
      default:
        try { win?.webContents.send('menu-command', action) } catch { }
        return
    }
  })

  ipcMain.handle('openWindow', async (_: IpcMainInvokeEvent, key: WindowKey, payload?: any) => {
    if (!win) return false
    try {
      if (payload) {
        (globalThis as any).__lastResourcePreviewPayload = (globalThis as any).__lastResourcePreviewPayload || {};
        (globalThis as any).__lastResourcePreviewPayload[key] = payload
      }
      await windowManager.createOrShow(key, payload)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('openWindowReady', (_: IpcMainInvokeEvent, key: WindowKey) => {
    try {
      const payload = ((globalThis as any).__lastResourcePreviewPayload || {})[key]
      if (payload) _.sender.send('openWindowReadyData', payload)
    } catch { }
  })

  ipcMain.handle('getWindowPayload', (_: IpcMainInvokeEvent, key: WindowKey) => {
    try { return ((globalThis as any).__lastResourcePreviewPayload || {})[key] || null } catch { return null }
  })

  ipcMain.handle('closeWindow', async (_: IpcMainInvokeEvent, key: WindowKey) => {
    if (!win) return false
    try {
      await windowManager.close(key)
      return true
    } catch {
      return false
    }
  })

  // ---------------- Generic window controls for the calling (sender) window --------------
  ipcMain.handle('window-minimize', (event: IpcMainInvokeEvent) => {
    try {
      const browserWindow = BrowserWindow.fromWebContents(event.sender)
      if (browserWindow && !browserWindow.isDestroyed()) {
        browserWindow.minimize()
        return true
      }
    } catch { }
    return false
  })

  ipcMain.handle('window-maximize-or-restore', (event: IpcMainInvokeEvent) => {
    try {
      const browserWindow = BrowserWindow.fromWebContents(event.sender)
      if (browserWindow && !browserWindow.isDestroyed()) {
        if (browserWindow.isMaximized()) browserWindow.restore(); else browserWindow.maximize()
        return { maximized: browserWindow.isMaximized() }
      }
    } catch { }
    return { maximized: false }
  })

  ipcMain.handle('window-close-self', (event: IpcMainInvokeEvent) => {
    try {
      const browserWindow = BrowserWindow.fromWebContents(event.sender)
      if (browserWindow && !browserWindow.isDestroyed()) {
        browserWindow.close()
        return true
      }
    } catch { }
    return false
  })

  ipcMain.handle('window-is-maximized', (event: IpcMainInvokeEvent) => {
    try {
      const browserWindow = BrowserWindow.fromWebContents(event.sender)
      if (browserWindow && !browserWindow.isDestroyed()) {
        return browserWindow.isMaximized()
      }
    } catch { }
    return false
  })

  ipcMain.handle('window-capabilities', (event: IpcMainInvokeEvent) => {
    try {
      const browserWindow = BrowserWindow.fromWebContents(event.sender)
      if (browserWindow && !browserWindow.isDestroyed()) {
        return {
          minimizable: browserWindow.isMinimizable?.() ?? true,
          maximizable: browserWindow.isMaximizable?.() ?? true,
          resizable: browserWindow.isResizable?.() ?? true,
        }
      }
    } catch { }
    return { minimizable: false, maximizable: false, resizable: false }
  })

  // 窗口状态保存和恢复相关的 IPC 处理器
  ipcMain.handle('window-save-state', (event: IpcMainInvokeEvent, key: WindowKey) => {
    try {
      const browserWindow = BrowserWindow.fromWebContents(event.sender)
      if (browserWindow && !browserWindow.isDestroyed()) {
        saveWindowState(browserWindow, key)
        return true
      }
    } catch { }
    return false
  })

  ipcMain.handle('window-get-state', (event: IpcMainInvokeEvent, key: WindowKey) => {
    try {
      return WindowStateStore.getState(key)
    } catch { }
    return null
  })

  ipcMain.handle('window-clear-state', (event: IpcMainInvokeEvent, key: WindowKey) => {
    try {
      WindowStateStore.removeState(key)
      return true
    } catch { }
    return false
  })

}
