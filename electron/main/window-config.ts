import type { BrowserWindowConstructorOptions } from 'electron'

export type WindowKey =
  | 'fileList'
  | 'menu'
  | 'settings'
  | 'workspaceWizard'
  | 'resources'
  | 'recycle'

export interface WindowConfig {
  routeHash: string | (() => string)
  options: BrowserWindowConstructorOptions
  showOnReady?: boolean
  autoCenterOn?: 'parent-display' | 'primary-display' | 'none'
  closeOnBlur?: boolean
  follower?: boolean
  parent?: 'main' | undefined
}

export type WindowConfigMap = Record<WindowKey, WindowConfig>

export const windowConfigs: WindowConfigMap = {
  fileList: {
    routeHash: 'filebox',
    follower: true,
    parent: 'main',
    showOnReady: false,
    options: {
      width: 260,
      height: 320,
      frame: false,
      transparent: true,
      resizable: true,
      alwaysOnTop: false,
      skipTaskbar: true,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: true, contextIsolation: true },
    },
  },
  menu: {
    routeHash: 'menu',
    follower: true,
    parent: 'main',
    closeOnBlur: true,
    showOnReady: false,
    options: {
      width: 220,
      height: 260,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: true, contextIsolation: true },
    },
  },
  settings: {
    routeHash: 'settings',
    parent: 'main',
    autoCenterOn: 'parent-display',
    showOnReady: false,
    options: {
      width: 420,
      height: 480,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: false,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: true, contextIsolation: true },
    },
  },
  workspaceWizard: {
    routeHash: 'workspace-wizard',
    parent: 'main',
    autoCenterOn: 'parent-display',
    showOnReady: false,
    options: {
      width: 520,
      height: 460,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: false,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: true, contextIsolation: true },
    },
  },
  resources: {
    routeHash: 'resources',
    autoCenterOn: 'parent-display',
    showOnReady: false,
    options: {
      width: 720,
      height: 520,
      frame: true,
      transparent: false,
      resizable: true,
      alwaysOnTop: false,
      skipTaskbar: false,
      backgroundColor: '#ffffff',
      show: false,
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: true, contextIsolation: true },
    },
  },
  recycle: {
    routeHash: 'recycle',
    autoCenterOn: 'parent-display',
    showOnReady: false,
    options: {
      width: 720,
      height: 520,
      frame: true,
      transparent: false,
      resizable: true,
      alwaysOnTop: false,
      skipTaskbar: false,
      backgroundColor: '#ffffff',
      show: false,
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: true, contextIsolation: true },
    },
  },
}
