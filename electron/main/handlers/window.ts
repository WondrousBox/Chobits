import { ipcMain } from "electron";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { screen, app } from "electron";
import fs from 'node:fs';
import path from 'node:path';

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
  } catch {}
}

export function initWindowHandlers(win: BrowserWindow) {
  let fileListWindow: BrowserWindow | null = null
  // New follower windows: context menu + settings
  let menuWindow: BrowserWindow | null = null
  let settingsWindow: BrowserWindow | null = null
  // 工作空间创建向导窗口
  let workspaceWizardWindow: BrowserWindow | null = null
  // 资源管理窗口
  let resourcesWindow: BrowserWindow | null = null
  // 回收站窗口
  let recycleWindow: BrowserWindow | null = null
  // 记录上一次放置的方向 (针对所有跟随窗口分别记录)
  const lastFollowerSide = new Map<BrowserWindow, 'right' | 'left' | 'bottom' | 'top' | null>()
  let followerAnimTimer: NodeJS.Timeout | null = null
  let followerAnimRaf: number | null = null
  // 动画状态变量
  let followerAnimStart: number = 0
  let followerAnimFrom: { x: number; y: number } | null = null
  let followerAnimTo: { x: number; y: number } | null = null
  let followerAnimDur = 0
  // Polyfill rAF in main process (Node 没有原生 requestAnimationFrame)
  const hasNativeRaf = typeof (globalThis as any).requestAnimationFrame === 'function'
  const raf = (cb: (ts: number) => void): number => {
    if (hasNativeRaf) return (globalThis as any).requestAnimationFrame(cb)
    return setTimeout(() => cb(performance.now()), 16) as unknown as number
  }
  const caf = (id: number) => {
    if (hasNativeRaf) (globalThis as any).cancelAnimationFrame(id)
    else clearTimeout(id as any)
  }

  function stopFollowerAnimation() {
    if (followerAnimTimer) { clearInterval(followerAnimTimer); followerAnimTimer = null }
    if (followerAnimRaf !== null) { try { caf(followerAnimRaf) } catch {} ; followerAnimRaf = null }
  }

  // Movement config persistence ------------------------------------------------
  type MovementConfig = { walkSpeed: number; fpsLimit: number; movementMode: 'stepped' | 'smooth'; stepGrid: number; pathCurveFactor: number; assistantPadding: number }
  const defaultConfig: MovementConfig = { walkSpeed: 500, fpsLimit: 30, movementMode: 'stepped', stepGrid: 12, pathCurveFactor: 0.15, assistantPadding: 100 }
  const configDir = app.getPath('userData')
  const configFile = path.join(configDir, 'movement-config.json')
  let movementConfig: MovementConfig = defaultConfig
  try {
    if (fs.existsSync(configFile)) {
      const txt = fs.readFileSync(configFile,'utf8')
      const parsed = JSON.parse(txt)
      movementConfig = { ...defaultConfig, ...parsed }
    }
  } catch { movementConfig = defaultConfig }
  function saveConfig() {
    try { fs.writeFileSync(configFile, JSON.stringify(movementConfig, null, 2), 'utf8') } catch {}
  }

  function adjustMainWindowForPadding(oldPadding: number, newPadding: number) {
    if (!win || win.isDestroyed()) return
    if (oldPadding === newPadding) return
    try {
      const b = win.getBounds()
      // 旧的内层角色左上角
      const innerX = b.x + oldPadding
      const innerY = b.y + oldPadding
      const newWidth = ASSISTANT_WIDTH + newPadding * 2
      const newHeight = ASSISTANT_HEIGHT + newPadding * 2
      const newX = innerX - newPadding
      const newY = innerY - newPadding
      win.setBounds({ x: newX, y: newY, width: newWidth, height: newHeight })
      repositionAllFollowers()
    } catch {}
  }

  // 计算目标位置并返回方向（基于内层角色区域而非整个窗口边框）
  function computeFollowerPosition(main: Electron.Rectangle, follower: { width: number; height: number }) {
    const gap = 12
    const padding = movementConfig.assistantPadding ?? 0
    const anchor = { x: main.x + padding, y: main.y + padding, width: ASSISTANT_WIDTH, height: ASSISTANT_HEIGHT }
    const display = screen.getDisplayNearestPoint({ x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 })
    const work = display.workArea
    const candidates: Array<{ x: number; y: number; score: number; side: 'right' | 'left' | 'bottom' | 'top' }> = []
    candidates.push({ x: anchor.x + anchor.width + gap, y: anchor.y, score: 100, side: 'right' })
    candidates.push({ x: anchor.x - follower.width - gap, y: anchor.y, score: 90, side: 'left' })
    candidates.push({ x: anchor.x, y: anchor.y + anchor.height + gap, score: 80, side: 'bottom' })
    candidates.push({ x: anchor.x, y: anchor.y - follower.height - gap, score: 70, side: 'top' })

    const valid: typeof candidates = []
    for (const c of candidates) {
      const withinX = c.x >= work.x && c.x + follower.width <= work.x + work.width
      const withinY = c.y >= work.y && c.y + follower.height <= work.y + work.height
      if (withinX && withinY) valid.push(c)
    }
    if (valid.length === 0) {
      // 允许越界，找最小出界
      function overflowArea(c: typeof candidates[number]) {
        const ox = Math.max(0, work.x - c.x) + Math.max(0, (c.x + follower.width) - (work.x + work.width))
        const oy = Math.max(0, work.y - c.y) + Math.max(0, (c.y + follower.height) - (work.y + work.height))
        return ox * follower.height + oy * follower.width
      }
      candidates.forEach(c => (c as any).overflow = overflowArea(c))
      candidates.sort((a: any, b: any) => a.overflow - b.overflow || b.score - a.score)
      const best = candidates[0]
      return {
        x: Math.min(Math.max(best.x, work.x), work.x + work.width - follower.width),
        y: Math.min(Math.max(best.y, work.y), work.y + work.height - follower.height),
        side: best.side
      }
    }
    valid.sort((a, b) => b.score - a.score)
    const best = valid[0]
    return { x: best.x, y: best.y, side: best.side }
  }

  function animateFollowerTo(followerWin: BrowserWindow, target: { x: number; y: number }) {
    if (!followerWin || followerWin.isDestroyed()) return
    try {
      const [cx, cy] = followerWin.getPosition()
      const dx = target.x - cx
      const dy = target.y - cy
      const dist = Math.hypot(dx, dy)
      // 小距离直接跳
      if (dist < 8) { followerWin.setPosition(target.x, target.y); return }
      stopFollowerAnimation()
      followerAnimFrom = { x: cx, y: cy }
      followerAnimTo = target
      // 动画时长与距离相关（像素 / 3 但限制范围）
      followerAnimDur = Math.min(400, Math.max(160, dist * 3))
      followerAnimStart = performance.now()
      const step = (now: number) => {
        if (!followerWin || followerWin.isDestroyed()) { stopFollowerAnimation(); return }
        if (!followerAnimFrom || !followerAnimTo) { stopFollowerAnimation(); return }
        const t = (now - followerAnimStart) / followerAnimDur
        if (t >= 1) {
          followerWin.setPosition(followerAnimTo.x, followerAnimTo.y)
          stopFollowerAnimation(); return
        }
        // easeInOutQuad
        const tt = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
        const nx = Math.round(followerAnimFrom.x + (followerAnimTo.x - followerAnimFrom.x) * tt)
        const ny = Math.round(followerAnimFrom.y + (followerAnimTo.y - followerAnimFrom.y) * tt)
        followerWin.setPosition(nx, ny)
        followerAnimRaf = raf(step)
      }
      followerAnimRaf = raf(step)
    } catch {
      // 失败时直接跳到目标
      try { followerWin?.setPosition(target.x, target.y) } catch {}
    }
  }

  function repositionFollower(followerWin: BrowserWindow | null) {
    if (!win || !followerWin || followerWin.isDestroyed()) return
    try {
      const mainBounds = win.getBounds()
      const followerBounds = followerWin.getBounds()
      const pos = computeFollowerPosition(mainBounds, followerBounds)
      const lastSide = lastFollowerSide.get(followerWin) || null
      // 如果方向变化，则做动画，否则直接贴靠
      if (lastSide && pos.side !== lastSide) {
        animateFollowerTo(followerWin, { x: pos.x, y: pos.y })
      } else {
        // 方向未变，保持紧随（直接设置）
        followerWin.setPosition(pos.x, pos.y)
      }
      lastFollowerSide.set(followerWin, pos.side)
    } catch { }
  }

  function repositionAllFollowers() {
    repositionFollower(fileListWindow)
    repositionFollower(menuWindow)
    // settingsWindow 不是跟随窗口，不自动贴靠
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
        } catch {}
      }
    }, 33) // ~30fps 轮询
  }
  function stopHoverMonitor() {
    if (hoverTimer) { clearInterval(hoverTimer); hoverTimer = null }
  }

  // 主窗口关闭时统一销毁子窗口
  win.on('closed', () => {
    ;[fileListWindow, menuWindow, settingsWindow, resourcesWindow, recycleWindow, workspaceWizardWindow].forEach(w => { try { w && !w.isDestroyed() && w.destroy() } catch {} })
    fileListWindow = null; menuWindow = null; settingsWindow = null; resourcesWindow = null; recycleWindow = null; workspaceWizardWindow = null
    stopFollowerAnimation()
    stopHoverMonitor()
  })

  // 启动 hover 监控
  startHoverMonitor()

  // ---------------- Movement Config IPC --------------------
  ipcMain.handle('getMovementConfig', () => {
    return movementConfig
  })
  ipcMain.handle('updateMovementConfig', (_: IpcMainInvokeEvent, partial: Partial<MovementConfig>) => {
    const oldPadding = movementConfig.assistantPadding
    movementConfig = { ...movementConfig, ...partial }
    saveConfig()
    if (partial.assistantPadding !== undefined) {
      adjustMainWindowForPadding(oldPadding, movementConfig.assistantPadding)
    }
    // 广播更新
    try { win?.webContents.send('movement-config-updated', movementConfig) } catch {}
    try { settingsWindow?.webContents.send('movement-config-updated', movementConfig) } catch {}
    return movementConfig
  })

  // ---------------- Window Move & Click Through -------------
  ipcMain.handle('moveWindow', (_: IpcMainInvokeEvent, x: number, y: number) => {
    if (!win) return false
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false
    win.setPosition(Math.round(x), Math.round(y))
    repositionAllFollowers()
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
      if (!fileListWindow || fileListWindow.isDestroyed()) {
        const { BrowserWindow } = await import('electron')
        fileListWindow = new BrowserWindow({
          width: 260,
          height: 320,
          frame: false,
          transparent: true,
          resizable: true,
          alwaysOnTop: false,
          skipTaskbar: true,
          show: false,
          backgroundColor: '#00000000',
          parent: win,
          webPreferences: { preload: (win as any).__preloadPath || undefined, nodeIntegration: true, contextIsolation: true }
        })
        fileListWindow.once('ready-to-show', () => { try { fileListWindow && fileListWindow.showInactive() } catch {} })
        lastFollowerSide.set(fileListWindow, null)
        repositionFollower(fileListWindow)
        const url = process.env.VITE_DEV_SERVER_URL
        if (url) {
          fileListWindow.loadURL(`${url}#filebox`)
        } else {
          const indexHtml = (process.env.APP_ROOT || '') + '/dist/index.html'
          ;(fileListWindow as any).loadFile(indexHtml, { hash: 'filebox' })
        }
        maybeOpenDevTools(fileListWindow)
        fileListWindow.on('closed', () => { fileListWindow = null; stopFollowerAnimation(); lastFollowerSide.delete(fileListWindow as any) })
      } else {
        repositionFollower(fileListWindow)
      }
      // Send/refresh file list
      fileListWindow!.webContents.send('update-file-list', files)
      fileListWindow!.showInactive() // show without stealing focus
      return true
    } catch (e) { return false }
  })

  // ---------------- Context Menu Follower Window -------------
  ipcMain.handle('openMenuWindow', async () => {
    if (!win) return false
    try {
      if (!menuWindow || menuWindow.isDestroyed()) {
        const { BrowserWindow } = await import('electron')
        menuWindow = new BrowserWindow({
          width: 220,
          height: 260,
          frame: false,
          transparent: true,
          resizable: false,
          alwaysOnTop: true,
          skipTaskbar: true,
          backgroundColor: '#00000000',
          parent: win,
          show: false,
          webPreferences: { preload: (win as any).__preloadPath || undefined, nodeIntegration: true, contextIsolation: true }
        })
        menuWindow.once('ready-to-show', () => { try { menuWindow && menuWindow.show() } catch {} })
        lastFollowerSide.set(menuWindow, null)
        repositionFollower(menuWindow)
        const url = process.env.VITE_DEV_SERVER_URL
        if (url) menuWindow.loadURL(`${url}#menu`)
        else {
          const indexHtml = (process.env.APP_ROOT || '') + '/dist/index.html'
          ;(menuWindow as any).loadFile(indexHtml, { hash: 'menu' })
        }
        menuWindow.on('blur', () => { try { menuWindow && menuWindow.close() } catch {} })
        menuWindow.on('closed', () => { lastFollowerSide.delete(menuWindow as any); menuWindow = null })
      } else {
        repositionFollower(menuWindow)
      }
      // 如果已存在且 ready，直接显示
      if (menuWindow && menuWindow.isVisible()) menuWindow.focus(); else try { menuWindow?.show() } catch {}
      return true
    } catch { return false }
  })

  // ---------------- Settings Window (独立配置窗口) ------------
  async function createOrShowSettingsWindow() {
    if (!win) return false
    try {
      if (!settingsWindow || settingsWindow.isDestroyed()) {
        const { BrowserWindow } = await import('electron')
        settingsWindow = new BrowserWindow({
          width: 420,
          height: 480,
          frame: false,
          transparent: true,
          resizable: false,
          alwaysOnTop: true,
          skipTaskbar: false,
          backgroundColor: '#00000000',
          parent: win,
          show: false,
          webPreferences: { preload: (win as any).__preloadPath || undefined, nodeIntegration: true, contextIsolation: true }
        })
        settingsWindow.once('ready-to-show', () => { try { settingsWindow && settingsWindow.show() } catch {} })
        // 居中到主窗口所在屏幕
        const mainBounds = win.getBounds()
        const display = screen.getDisplayNearestPoint({ x: mainBounds.x + mainBounds.width / 2, y: mainBounds.y + mainBounds.height / 2 })
        const work = display.workArea
        const posX = Math.round(work.x + (work.width - 420) / 2)
        const posY = Math.round(work.y + (work.height - 480) / 2)
        settingsWindow.setPosition(posX, posY)
        const url = process.env.VITE_DEV_SERVER_URL
        if (url) settingsWindow.loadURL(`${url}#settings`)
        else {
          const indexHtml = (process.env.APP_ROOT || '') + '/dist/index.html'
          ;(settingsWindow as any).loadFile(indexHtml, { hash: 'settings' })
        }
        maybeOpenDevTools(settingsWindow)
        settingsWindow.on('closed', () => { settingsWindow = null })
      }
      if (settingsWindow && !settingsWindow.isVisible()) settingsWindow.show(); settingsWindow?.focus()
      return true
    } catch { return false }
  }

  ipcMain.handle('openSettingsWindow', async () => {
    return createOrShowSettingsWindow()
  })

  // ---------------- Workspace Wizard Window (独立引导窗口) ------------
  ipcMain.handle('openWorkspaceWizardWindow', async () => {
    if (!win) return false
    try {
      if (!workspaceWizardWindow || workspaceWizardWindow.isDestroyed()) {
        const { BrowserWindow } = await import('electron')
        workspaceWizardWindow = new BrowserWindow({
          width: 520,
          height: 460,
          frame: false,
          transparent: true,
          resizable: false,
          alwaysOnTop: true,
          skipTaskbar: false,
          backgroundColor: '#00000000',
          parent: win,
          show: false,
          webPreferences: { preload: (win as any).__preloadPath || undefined, nodeIntegration: true, contextIsolation: true }
        })
        workspaceWizardWindow.once('ready-to-show', () => { try { workspaceWizardWindow && workspaceWizardWindow.show() } catch {} })
        // 居中到主窗口所在屏幕
        const mainBounds = win.getBounds()
        const display = screen.getDisplayNearestPoint({ x: mainBounds.x + mainBounds.width / 2, y: mainBounds.y + mainBounds.height / 2 })
        const work = display.workArea
        const w = 520, h = 460
        workspaceWizardWindow.setPosition(
          Math.round(work.x + (work.width - w) / 2),
          Math.round(work.y + (work.height - h) / 2),
        )
        const url = process.env.VITE_DEV_SERVER_URL
        if (url) workspaceWizardWindow.loadURL(`${url}#workspace-wizard`)
        else {
          const indexHtml = (process.env.APP_ROOT || '') + '/dist/index.html'
          ;(workspaceWizardWindow as any).loadFile(indexHtml, { hash: 'workspace-wizard' })
        }
        maybeOpenDevTools(workspaceWizardWindow)
        workspaceWizardWindow.on('closed', () => { workspaceWizardWindow = null })
      }
      if (workspaceWizardWindow && !workspaceWizardWindow.isVisible()) workspaceWizardWindow.show(); workspaceWizardWindow?.focus()
      return true
    } catch { return false }
  })

  // Suggest a default workspace path: ~/Documents/Chobits, fallback to incremented suffix
  ipcMain.handle('suggestWorkspacePath', async () => {
    try {
      const docs = app.getPath('documents')
      const base = path.join(docs, 'Chobits')
      if (!fs.existsSync(base)) return { ok: true, path: base }
      for (let i = 2; i < 50; i++) {
        const candidate = `${base} ${i}`
        if (!fs.existsSync(candidate)) return { ok: true, path: candidate }
      }
      return { ok: true, path: base + ' ' + Date.now() }
    } catch { return { ok: false } }
  })

  // ---------------- Menu Command (转发给主渲染) ---------------
  ipcMain.on('menu-command', (_e, action: string) => {
    switch (action) {
      case 'open-settings':
        createOrShowSettingsWindow()
        return
      case 'close-workspace-wizard':
        try { workspaceWizardWindow?.close() } catch {}
        return
      case 'quit-app':
        try { app.quit() } catch {}
        return
      case 'close-settings':
        try { settingsWindow?.close() } catch {}
        return
      case 'toggle-walk':
      case 'walk-once':
        try { win?.webContents.send('menu-command', action) } catch {}
        return
      default:
        try { win?.webContents.send('menu-command', action) } catch {}
        return
    }
  })

  ipcMain.handle('openResourcesWindow', async () => {
    if (!win) return false
    try {
      if (!resourcesWindow || resourcesWindow.isDestroyed()) {
        const { BrowserWindow } = await import('electron')
        resourcesWindow = new BrowserWindow({
          width: 720,
          height: 520,
          frame: true, // 标题栏
          transparent: false, // 非透明
          resizable: true,
          alwaysOnTop: false,
          skipTaskbar: false,
          backgroundColor: '#fff', // 白色背景
          show: false,
          autoHideMenuBar: true, // 隐藏菜单栏
          webPreferences: { preload: (win as any).__preloadPath || undefined, nodeIntegration: true, contextIsolation: true }
        })
        resourcesWindow.once('ready-to-show', () => { try { resourcesWindow && resourcesWindow.show() } catch {} })
        // 居中
        const mainBounds = win.getBounds()
        const display = screen.getDisplayNearestPoint({ x: mainBounds.x + mainBounds.width / 2, y: mainBounds.y + mainBounds.height / 2 })
        const work = display.workArea
        resourcesWindow.setPosition(
          Math.round(work.x + (work.width - 720) / 2),
          Math.round(work.y + (work.height - 520) / 2),
        )
        const url = process.env.VITE_DEV_SERVER_URL
        if (url) resourcesWindow.loadURL(`${url}#resources`)
        else {
          const indexHtml = (process.env.APP_ROOT || '') + '/dist/index.html'
          ;(resourcesWindow as any).loadFile(indexHtml, { hash: 'resources' })
        }
        maybeOpenDevTools(resourcesWindow)
        resourcesWindow.on('closed', () => { resourcesWindow = null })
      } else {
        try { resourcesWindow.show() } catch {}
      }
      return true
    } catch { return false }
  })

  // ---------------- Recycle Bin Window (独立窗口) ------------
  ipcMain.handle('openRecycleWindow', async () => {
    if (!win) return false
    try {
      if (!recycleWindow || recycleWindow.isDestroyed()) {
        const { BrowserWindow } = await import('electron')
        recycleWindow = new BrowserWindow({
          width: 720,
          height: 520,
          frame: true,
          transparent: false,
          resizable: true,
          alwaysOnTop: false,
          skipTaskbar: false,
          backgroundColor: '#fff',
          show: false,
          autoHideMenuBar: true,
          webPreferences: { preload: (win as any).__preloadPath || undefined, nodeIntegration: true, contextIsolation: true }
        })
        recycleWindow.once('ready-to-show', () => { try { recycleWindow && recycleWindow.show() } catch {} })
        // 居中到主窗口所在屏幕
        const mainBounds = win.getBounds()
        const display = screen.getDisplayNearestPoint({ x: mainBounds.x + mainBounds.width / 2, y: mainBounds.y + mainBounds.height / 2 })
        const work = display.workArea
        recycleWindow.setPosition(
          Math.round(work.x + (work.width - 720) / 2),
          Math.round(work.y + (work.height - 520) / 2),
        )
        const url = process.env.VITE_DEV_SERVER_URL
        if (url) recycleWindow.loadURL(`${url}#recycle`)
        else {
          const indexHtml = (process.env.APP_ROOT || '') + '/dist/index.html'
          ;(recycleWindow as any).loadFile(indexHtml, { hash: 'recycle' })
        }
        maybeOpenDevTools(recycleWindow)
        recycleWindow.on('closed', () => { recycleWindow = null })
      } else {
        try { recycleWindow.show() } catch {}
      }
      return true
    } catch { return false }
  })
}
