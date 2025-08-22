import { ipcMain } from "electron";
import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { screen } from "electron";

export function initWindowHandlers(win: BrowserWindow) {
  let fileListWindow: BrowserWindow | null = null
  // 记录上一次放置的方向
  let lastFollowerSide: 'right' | 'left' | 'bottom' | 'top' | null = null
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

  // 计算目标位置并返回方向
  function computeFollowerPosition(main: Electron.Rectangle, follower: { width: number; height: number }) {
    const gap = 12
    const display = screen.getDisplayNearestPoint({ x: main.x + main.width / 2, y: main.y + main.height / 2 })
    const work = display.workArea
    const candidates: Array<{ x: number; y: number; score: number; side: 'right' | 'left' | 'bottom' | 'top' }> = []
    candidates.push({ x: main.x + main.width + gap, y: main.y, score: 100, side: 'right' })
    candidates.push({ x: main.x - follower.width - gap, y: main.y, score: 90, side: 'left' })
    candidates.push({ x: main.x, y: main.y + main.height + gap, score: 80, side: 'bottom' })
    candidates.push({ x: main.x, y: main.y - follower.height - gap, score: 70, side: 'top' })

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

  function animateFollowerTo(target: { x: number; y: number }) {
    if (!fileListWindow || fileListWindow.isDestroyed()) return
    try {
      const [cx, cy] = fileListWindow.getPosition()
      const dx = target.x - cx
      const dy = target.y - cy
      const dist = Math.hypot(dx, dy)
      // 小距离直接跳
      if (dist < 8) { fileListWindow.setPosition(target.x, target.y); return }
      stopFollowerAnimation()
      followerAnimFrom = { x: cx, y: cy }
      followerAnimTo = target
      // 动画时长与距离相关（像素 / 3 但限制范围）
      followerAnimDur = Math.min(400, Math.max(160, dist * 3))
      followerAnimStart = performance.now()
      const step = (now: number) => {
        if (!fileListWindow || fileListWindow.isDestroyed()) { stopFollowerAnimation(); return }
        if (!followerAnimFrom || !followerAnimTo) { stopFollowerAnimation(); return }
        const t = (now - followerAnimStart) / followerAnimDur
        if (t >= 1) {
          fileListWindow.setPosition(followerAnimTo.x, followerAnimTo.y)
          stopFollowerAnimation(); return
        }
        // easeInOutQuad
        const tt = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
        const nx = Math.round(followerAnimFrom.x + (followerAnimTo.x - followerAnimFrom.x) * tt)
        const ny = Math.round(followerAnimFrom.y + (followerAnimTo.y - followerAnimFrom.y) * tt)
        fileListWindow.setPosition(nx, ny)
        followerAnimRaf = raf(step)
      }
      followerAnimRaf = raf(step)
    } catch {
      // 失败时直接跳到目标
      try { fileListWindow?.setPosition(target.x, target.y) } catch {}
    }
  }

  function repositionFollower() {
    if (!win || !fileListWindow || fileListWindow.isDestroyed()) return
    try {
      const mainBounds = win.getBounds()
      const followerBounds = fileListWindow.getBounds()
      const pos = computeFollowerPosition(mainBounds, followerBounds)
      // 如果方向变化，则做动画，否则直接贴靠
      if (lastFollowerSide && pos.side !== lastFollowerSide) {
        animateFollowerTo({ x: pos.x, y: pos.y })
      } else {
        // 方向未变，保持紧随（直接设置）
        fileListWindow.setPosition(pos.x, pos.y)
      }
      lastFollowerSide = pos.side
    } catch { }
  }

  // 主窗口关闭时统一销毁子窗口
  win.on('closed', () => {
    if (fileListWindow && !fileListWindow.isDestroyed()) {
      try { fileListWindow.destroy() } catch { }
    }
    fileListWindow = null
    stopFollowerAnimation()
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
        fileListWindow = new BrowserWindow({
          width: 260,
          height: 320,
          frame: false,
          transparent: true,
          resizable: true,
          // 取消子窗口置顶，使主精灵总在最上层但子窗口可被其他应用遮挡
          alwaysOnTop: false,
          skipTaskbar: true,
          show: true,
          backgroundColor: '#00000000',
          parent: win, // 关联父窗口，帮助层级管理
          webPreferences: {
            preload: (win as any).__preloadPath || undefined,
            nodeIntegration: true,
            contextIsolation: true,
          }
        })
        // 初次定位直接无动画
        lastFollowerSide = null
        repositionFollower()
        const url = process.env.VITE_DEV_SERVER_URL
        if (url) {
          fileListWindow.loadURL(`${url}#filebox`)
        } else {
          const indexHtml = (process.env.APP_ROOT || '') + '/dist/index.html'
          ;(fileListWindow as any).loadFile(indexHtml, { hash: 'filebox' })
        }
        fileListWindow.on('closed', () => { fileListWindow = null; stopFollowerAnimation(); lastFollowerSide = null })
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
