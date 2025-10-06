import type { BrowserWindowConstructorOptions } from 'electron'

const HEADER_COMMANDS_HEIGHT = 36;
const MACOS_TRAFFIC_LIGHTS_HEIGHT = 16;

// 跟随窗口位置偏好模式
export type FollowerPreferMode = 'auto' | 'prefer-right' | 'prefer-left' | 'prefer-bottom' | 'prefer-top' | 'overlap-center'

export type WindowKey =
  | 'fileList'
  | 'menu'
  | 'settings'
  | 'workspaceWizard'
  | 'resources'
  | 'recycle'
  | 'assistant'
  | 'modelManager'
  | 'resourcePreview'
  | 'downloadFloating'

export interface WindowConfig {
  routeHash: string | (() => string)
  options: BrowserWindowConstructorOptions
  fillWorkArea?: boolean
  showOnReady?: boolean
  openDevTools?: boolean
  autoCenterOn?: 'parent-display' | 'primary-display' | 'none'
  closeOnBlur?: boolean
  /**
   * 窗口跟随配置
   * - true: 跟随主窗口移动
   * - false: 不跟随
   * - 'auto': 由窗口管理器自动决定是否跟随
   */
  followMain?: boolean | 'auto'
  /**
   * 跟随窗口位置偏好模式
   * - 'auto': 自动选择最佳位置
   * - 'prefer-right': 优先右侧
   * - 'prefer-left': 优先左侧
   * - 'prefer-bottom': 优先底部
   * - 'prefer-top': 优先顶部
   * - 'overlap-center': 重叠居中
   */
  followerPreferMode?: FollowerPreferMode
  /**
   * 当使用 overlap-center 模式时，是否启用半透明效果以避免遮挡精灵
   * 默认: false
   */
  enableOverlapTransparency?: boolean
  /**
   * 当使用 overlap-center 模式时，是否强制居中（忽略屏幕边界限制）
   * 默认: false
   */
  forceCenterAlignment?: boolean
  parent?: 'main' | undefined
  /**
   * If true, the window will open maximized on first show.
   * - When showOnReady !== false, it maximizes right before showing on ready-to-show to avoid flicker.
   * - When showOnReady === false, it maximizes on the first manual show.
   */
  startMaximized?: boolean
  /**
   * If true, the window will remember its position and size for next time.
   */
  rememberState?: boolean
}

export type WindowConfigMap = Record<WindowKey, WindowConfig>

export const windowConfigs: WindowConfigMap = {
  fileList: {
    routeHash: 'filebox',
    followMain: true,
    followerPreferMode: 'prefer-right',
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
    followMain: true,
    followerPreferMode: 'overlap-center',
    enableOverlapTransparency: true,
    forceCenterAlignment: true,
    parent: 'main',
    closeOnBlur: true,
    showOnReady: false,
    options: {
      width: 600,
      height: 600,
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
      width: 800,
      height: 600,
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
    rememberState: true,
    options: {
      width: 1300,
      height: 720,
      // Mac 保留系统 traffic lights；Windows 使用自定义标题栏（frameless）
      ...(process.platform === 'darwin'
        ? {
          titleBarStyle: 'hiddenInset' as const,
          titleBarOverlay: true,
          trafficLightPosition: {
            x: 20,
            y: HEADER_COMMANDS_HEIGHT / 2 - MACOS_TRAFFIC_LIGHTS_HEIGHT / 2,
          },
          frame: true,
        }
        : {
          frame: false,
        }),
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
      width: 1000,
      height: 600,
      ...(process.platform === 'darwin'
        ? {
          titleBarStyle: 'hiddenInset' as const,
          titleBarOverlay: true,
          trafficLightPosition: {
            x: 20,
            y: HEADER_COMMANDS_HEIGHT / 2 - MACOS_TRAFFIC_LIGHTS_HEIGHT / 2,
          },
          frame: true,
        }
        : {
          frame: false,
        }),
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
  assistant: {
    routeHash: 'assistant',
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
      // Mac 保留系统 traffic lights；Windows 使用自定义标题栏（frameless）
      ...(process.platform === 'darwin'
        ? {
          titleBarStyle: 'hiddenInset' as const,
          titleBarOverlay: true,
          trafficLightPosition: {
            x: 20,
            y: HEADER_COMMANDS_HEIGHT / 2 - MACOS_TRAFFIC_LIGHTS_HEIGHT / 2,
          },
          frame: true,
        }
        : {
          frame: false,
        }),
      resizable: false,
      alwaysOnTop: false,
      skipTaskbar: false,
      show: false,
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: true, contextIsolation: true },
    },
  },
  resourcePreview: {
    routeHash: 'resource-preview',
    parent: 'main',
    autoCenterOn: 'parent-display',
    showOnReady: false,
    // closeOnBlur: true,
    openDevTools: true,
    // startMaximized: true,
    rememberState: true,
    options: {
      width: 600,
      height: 420,
      // Mac 保留系统 traffic lights；Windows 使用自定义标题栏（frameless）
      ...(process.platform === 'darwin'
        ? {
          titleBarStyle: 'hiddenInset' as const,
          titleBarOverlay: true,
          trafficLightPosition: {
            x: 20,
            y: HEADER_COMMANDS_HEIGHT / 2 - MACOS_TRAFFIC_LIGHTS_HEIGHT / 2,
          },
          frame: true,
        }
        : {
          frame: false,
        }),
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
  downloadFloating: {
    routeHash: 'download-floating',
    autoCenterOn: 'none',
    showOnReady: false,
    openDevTools: false,
    options: {
      width: 320,
      height: 120,
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
}
