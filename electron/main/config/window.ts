import { WindowConfig, WindowKey } from '../window/types';

const HEADER_COMMANDS_HEIGHT = 36;
const MACOS_TRAFFIC_LIGHTS_HEIGHT = 16;

const defaultWindowConfigs: Record<WindowKey, WindowConfig> = {
  status: {
    routeHash: 'status',
    followMain: true,
    followerPreferMode: 'prefer-right',
    preferShowInactive: true,
    parent: 'main',
    showOnReady: false,
    openDevTools: true,
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
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    }
  },
  menu: {
    routeHash: 'menu',
    followMain: true,
    followerPreferMode: 'overlap-center',
    enableOverlapTransparency: true,
    forceCenterAlignment: true,
    suspendHoverMonitorOnShow: true,
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
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    },
    platformOverlays: {
      darwin: { options: { hasShadow: false } }
    }
  },
  fileActionsMenu: {
    routeHash: 'file-actions',
    followMain: true,
    followerPreferMode: 'overlap-center',
    enableOverlapTransparency: true,
    forceCenterAlignment: true,
    suspendHoverMonitorOnShow: true,
    parent: 'main',
    closeOnBlur: true,
    showOnReady: false,
    options: {
      width: 640,
      height: 640,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    },
    platformOverlays: {
      darwin: { options: { hasShadow: false } }
    }
  },
  settings: {
    routeHash: 'settings',
    showOnReady: false,
    openDevTools: true,
    options: {
      width: 1200,
      height: 800,
      minWidth: 1000,
      minHeight: 600,
      frame: false,
      transparent: false,
      resizable: true,
      alwaysOnTop: false,
      skipTaskbar: false,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    },
    platformOverlays: {
      darwin: {
        options: {
          titleBarStyle: 'hiddenInset',
          titleBarOverlay: true,
          trafficLightPosition: { x: 20, y: HEADER_COMMANDS_HEIGHT / 2 - MACOS_TRAFFIC_LIGHTS_HEIGHT / 2 },
          frame: true
        }
      }
    }
  },
  workspaceWizard: {
    routeHash: 'workspace-wizard',
    autoCenterOn: 'parent-display',
    showOnReady: false,
    openDevTools: true,
    options: {
      width: 440,
      height: 440,
      titleBarStyle: 'hidden',
      titleBarOverlay: { color: '#FFFFFF', symbolColor: '#111111', height: 32 },
      resizable: false,
      alwaysOnTop: false,
      skipTaskbar: false,
      show: false,
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    },
    platformOverlays: {
      darwin: {
        options: {
          titleBarStyle: 'hiddenInset',
          trafficLightPosition: { x: 20, y: HEADER_COMMANDS_HEIGHT / 2 - MACOS_TRAFFIC_LIGHTS_HEIGHT / 2 }
        }
      }
    }
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
      frame: false,
      transparent: false,
      resizable: true,
      alwaysOnTop: false,
      skipTaskbar: false,
      backgroundColor: '#ffffff',
      show: false,
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    },
    platformOverlays: {
      darwin: {
        options: {
          titleBarStyle: 'hiddenInset',
          titleBarOverlay: true,
          trafficLightPosition: { x: 20, y: HEADER_COMMANDS_HEIGHT / 2 - MACOS_TRAFFIC_LIGHTS_HEIGHT / 2 },
          frame: true
        }
      }
    }
  },
  recycle: {
    routeHash: 'recycle',
    autoCenterOn: 'parent-display',
    showOnReady: true,
    openDevTools: true,
    options: {
      width: 1000,
      height: 600,
      frame: false,
      transparent: false,
      resizable: true,
      alwaysOnTop: false,
      skipTaskbar: false,
      backgroundColor: '#ffffff',
      show: false,
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    },
    platformOverlays: {
      darwin: {
        options: {
          titleBarStyle: 'hiddenInset',
          titleBarOverlay: true,
          trafficLightPosition: { x: 20, y: HEADER_COMMANDS_HEIGHT / 2 - MACOS_TRAFFIC_LIGHTS_HEIGHT / 2 },
          frame: true
        }
      }
    }
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
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    }
  },
  modelManager: {
    routeHash: 'model-manager',
    autoCenterOn: 'parent-display',
    showOnReady: false,
    openDevTools: true,
    options: {
      width: 720,
      height: 560,
      frame: false,
      resizable: false,
      alwaysOnTop: false,
      skipTaskbar: false,
      show: false,
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    },
    platformOverlays: {
      darwin: {
        options: {
          titleBarStyle: 'hiddenInset',
          titleBarOverlay: true,
          trafficLightPosition: { x: 20, y: HEADER_COMMANDS_HEIGHT / 2 - MACOS_TRAFFIC_LIGHTS_HEIGHT / 2 },
          frame: true
        }
      }
    }
  },
  chat: {
    routeHash: 'chat',
    autoCenterOn: 'parent-display',
    showOnReady: false,
    openDevTools: true,
    rememberState: true,
    options: {
      width: 1000,
      height: 720,
      frame: false,
      transparent: false,
      resizable: true,
      alwaysOnTop: false,
      skipTaskbar: false,
      backgroundColor: '#ffffff',
      show: false,
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    },
    platformOverlays: {
      darwin: {
        options: {
          titleBarStyle: 'hiddenInset',
          titleBarOverlay: true,
          trafficLightPosition: { x: 20, y: HEADER_COMMANDS_HEIGHT / 2 - MACOS_TRAFFIC_LIGHTS_HEIGHT / 2 },
          frame: true
        }
      }
    }
  },
  resourcePreview: {
    routeHash: 'resource-preview',
    autoCenterOn: 'parent-display',
    showOnReady: false,
    openDevTools: true,
    rememberState: true,
    options: {
      width: 600,
      height: 420,
      frame: false,
      transparent: false,
      resizable: true,
      alwaysOnTop: false,
      skipTaskbar: false,
      backgroundColor: '#ffffff',
      show: false,
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    },
    platformOverlays: {
      darwin: {
        options: {
          titleBarStyle: 'hiddenInset',
          titleBarOverlay: true,
          trafficLightPosition: { x: 20, y: HEADER_COMMANDS_HEIGHT / 2 - MACOS_TRAFFIC_LIGHTS_HEIGHT / 2 },
          frame: true
        }
      }
    }
  },
  downloadFloating: {
    routeHash: 'download-floating',
    autoCenterOn: 'none',
    showOnReady: false,
    openDevTools: false,
    options: {
      width: 500,
      height: 500,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    }
  },
  tagger: {
    routeHash: 'tagger',
    autoCenterOn: 'parent-display',
    showOnReady: false,
    openDevTools: true,
    rememberState: true,
    options: {
      width: 1100,
      height: 720,
      frame: false,
      transparent: false,
      resizable: true,
      alwaysOnTop: false,
      skipTaskbar: false,
      backgroundColor: '#ffffff',
      show: false,
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    },
    platformOverlays: {
      darwin: {
        options: {
          titleBarStyle: 'hiddenInset',
          titleBarOverlay: true,
          trafficLightPosition: { x: 20, y: 10 },
          frame: true
        }
      }
    }
  }
};

export default defaultWindowConfigs;
