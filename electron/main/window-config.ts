import type { BrowserWindowConstructorOptions } from 'electron'

const HEADER_COMMANDS_HEIGHT = 50;
const MACOS_TRAFFIC_LIGHTS_HEIGHT = 16;

export type WindowKey =
  | 'fileList'
  | 'menu'
  | 'settings'
  | 'workspaceWizard'
  | 'resources'
  | 'recycle'
  | 'workspace'
  | 'assistantPanel'
  | 'modelManager'

export interface WindowConfig {
  routeHash: string | (() => string)
  options: BrowserWindowConstructorOptions
  fillWorkArea?: boolean
  showOnReady?: boolean
  openDevTools?: boolean
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
    openDevTools: true,
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
    autoCenterOn: 'parent-display',
    showOnReady: false,
    openDevTools: true,
    options: {
      width: 440,
      height: 440,
      titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "hidden",
      // titleBarOverlay: true,
      titleBarOverlay: {
        color: "#FFFFFF",
        symbolColor: "#111111",
        height: 32,
      },
      trafficLightPosition: {
        x: 20,
        y: HEADER_COMMANDS_HEIGHT / 2 - MACOS_TRAFFIC_LIGHTS_HEIGHT / 2,
      },
      resizable: false,
      alwaysOnTop: false,
      skipTaskbar: false,
      show: false,
      webPreferences: { nodeIntegration: true, contextIsolation: true },
    },
  },
  resources: {
    routeHash: 'resources',
    autoCenterOn: 'parent-display',
    showOnReady: true,
    openDevTools: true,
    options: {
      width: 1024,
      height: 720,
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
    showOnReady: true,
    openDevTools: true,
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
  workspace: {
    routeHash: 'workspace',
    showOnReady: true,
    openDevTools: true,
    options: {
      width: 900,
      height: 600,
      titleBarStyle: process.platform === "darwin" ? "hiddenInset" : undefined,
      titleBarOverlay: true,
      trafficLightPosition: {
        x: 20,
        y: HEADER_COMMANDS_HEIGHT / 2 - MACOS_TRAFFIC_LIGHTS_HEIGHT / 2,
      },
      resizable: true,
      show: false,
      webPreferences: { nodeIntegration: true, contextIsolation: true },
    },
  },
  assistantPanel: {
    routeHash: 'assistant-panel',
    autoCenterOn: 'none',
    showOnReady: false,
    openDevTools: true,
    fillWorkArea: false,
    options: {
      width: 800,
      height: 600,
      frame: false,
      transparent: true,
      resizable: true,
      alwaysOnTop: true,
      skipTaskbar: false,
      backgroundColor: '#00000000',
      show: false,
      webPreferences: { nodeIntegration: true, contextIsolation: true },
    },
  },
  modelManager: {
    routeHash: 'model-manager',
    autoCenterOn: 'parent-display',
    showOnReady: false,
    openDevTools: true,
    options: {
      width: 720,
      height: 560,
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
