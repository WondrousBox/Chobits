import { app, BrowserWindow, screen } from 'electron'
import path from 'node:path'
import { windowConfigs, type WindowConfig, type WindowKey } from './window-config'

const DEV_URL = process.env.VITE_DEV_SERVER_URL
const APP_ROOT = process.env.APP_ROOT || app.getAppPath()
const RENDERER_DIST = path.join(APP_ROOT, 'dist')

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

export class WindowManager {
  private static _instance: WindowManager | null = null
  static get instance() {
    if (!this._instance) this._instance = new WindowManager()
    return this._instance
  }

  private registry = new Map<WindowKey, BrowserWindow>()
  private mainWindow: BrowserWindow | null = null
  private preloadPath: string | undefined

  init(mainWindow: BrowserWindow, options: { preloadPath?: string }) {
    this.mainWindow = mainWindow
    this.preloadPath = options.preloadPath || (mainWindow as any).__preloadPath
  }

  get(key: WindowKey) {
    const w = this.registry.get(key)
    return w && !w.isDestroyed() ? w : null
  }

  async createOrShow(key: WindowKey) {
    let w = this.get(key)
    if (!w) w = await this.create(key)
    if (!w) return null
    try { if (!w.isVisible()) w.show() } catch { }
    try { w.focus() } catch { }
    return w
  }

  async create(key: WindowKey): Promise<BrowserWindow | null> {
    const conf: WindowConfig | undefined = (windowConfigs as any)[key]
    if (!conf) return null
    const opts = { ...conf.options }
    opts.webPreferences = { ...(conf.options.webPreferences || {}), preload: this.preloadPath }
    if (conf.parent === 'main' && this.mainWindow && !this.mainWindow.isDestroyed()) {
      opts.parent = this.mainWindow
    }
    const w = new BrowserWindow(opts)
    this.registry.set(key, w)

    // Broadcast maximize / unmaximize state changes to renderer so UI can update controls
    try {
      w.on('maximize', () => { try { w.webContents.send('window-maximize-changed', true) } catch {} })
      w.on('unmaximize', () => { try { w.webContents.send('window-maximize-changed', false) } catch {} })
    } catch {}

    w.once('ready-to-show', () => {
      try {
        console.log("ready-to-show", conf.showOnReady)

        if (conf.showOnReady === false) return
        w.show()
      } catch { }
    })

    // Auto-close registry cleanup
    w.on('closed', () => {
      try { this.registry.delete(key) } catch { }
    })

    await this.loadRoute(w, conf)

    // Auto-center
    this.autoCenter(w, conf)

    if (conf.fillWorkArea) {
      try {
        const display = screen.getPrimaryDisplay()
        const { x, y, width, height } = display.workArea
        // Defer to next tick to avoid resize flicker before content load
        setTimeout(() => {
          try { w.setBounds({ x, y, width, height }) } catch {}
        }, 0)
      } catch { }
    }

    // Close on blur
    if (conf.closeOnBlur) {
      w.on('blur', () => { try { w.close() } catch { } })
    }

    if (conf.openDevTools) {
      maybeOpenDevTools(w)
    }

    return w
  }

  private async loadRoute(w: BrowserWindow, conf: WindowConfig) {
    const hash = typeof conf.routeHash === 'function' ? conf.routeHash() : conf.routeHash
    if (DEV_URL) {
      await w.loadURL(`${DEV_URL}#${hash}`)
    } else {
      const indexHtml = path.join(RENDERER_DIST, 'index.html')
      await (w as any).loadFile(indexHtml, { hash })
    }
  }

  private autoCenter(w: BrowserWindow, conf: WindowConfig) {
    if (!conf.autoCenterOn || conf.autoCenterOn === 'none') return
    try {
      let display = screen.getPrimaryDisplay()
      if (conf.autoCenterOn === 'parent-display' && this.mainWindow) {
        const b = this.mainWindow.getBounds()
        display = screen.getDisplayNearestPoint({ x: b.x + b.width / 2, y: b.y + b.height / 2 })
      }
      const work = display.workArea
      const { width = 400, height = 300 } = w.getBounds()
      w.setPosition(
        Math.round(work.x + (work.width - width) / 2),
        Math.round(work.y + (work.height - height) / 2)
      )
    } catch { }
  }

  async destroy(key: WindowKey) {
    const w = this.get(key)
    if (w) {
      try { w.destroy() } catch { }
      this.registry.delete(key)
    }
  }

  async show(key: WindowKey) {
    const w = this.get(key)
    if (w) { try { w.show(); w.focus() } catch { } }
    return w
  }

  async hide(key: WindowKey) {
    const w = this.get(key)
    if (w) { try { w.hide() } catch { } }
    return w
  }

  async close(key: WindowKey) {
    const w = this.get(key)
    if (w) { try { w.close() } catch { } }
    return w
  }

  all() {
    return new Map(this.registry)
  }
}

export const windowManager = WindowManager.instance
