import { WindowConfig, WindowKey } from '@aim-packages/window-manager';

declare module '@aim-packages/window-manager' {
  interface CustomWindowKeys {
    status: void;
    menu: void;
    settings: void;
    chatPanel: void;
    chatMini: void;
    chat: void;
    aiProviderConfig: void;
    asrConfig: void;
    asr: void;
    asrTest: void;
    ttsConfig: void;
    tts: void;
    characterPackEditor: void;
    windowAnimationEditor: void;
    spriteBubbleFixedTop: void;
  }
}

const HEADER_COMMANDS_HEIGHT = 36;
const MACOS_TRAFFIC_LIGHTS_HEIGHT = 16;

const DEFAULT_WINDOW_CONFIGS: Record<WindowKey, WindowConfig> = {
  status: {
    routeHash: 'status',
    followMain: true,
    followerPreferMode: 'prefer-right',
    preferShowInactive: true,
    parent: 'main',
    showOnReady: false,
    openDevTools: false,
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
    // forceCenterAlignment 为 true 时 overlap-center 会跳过 workArea 钳制（精灵贴右下角时菜单越屏），保持 false 让居中结果再钳回屏幕内
    forceCenterAlignment: false,
    suspendHoverMonitorOnShow: true,
    parent: 'main',
    // closeOnBlur: true, // 移除，改为在页面中处理，以便播放退出动画
    hideOnClose: true, // 关闭时只隐藏不销毁，配合预创建提升打开速度
    showOnReady: false,
    options: {
      width: 600,
      height: 600,
      frame: false,
      transparent: true,
      resizable: false,
      focusable: true,
      acceptFirstMouse: true,
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
    openDevTools: false,
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
  chatPanel: {
    routeHash: 'chat-panel',
    autoCenterOn: 'none',
    showOnReady: false,
    openDevTools: false,
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
  chatMini: {
    routeHash: 'chat-mini',
    followMain: true,
    followerPreferMode: 'fixed-bottom',
    // 保持默认钳制（true）：精灵贴屏幕底部时迷你框会越出屏幕下边缘，需钳回工作区内
    preferShowInactive: false,
    suspendHoverMonitorOnShow: true,
    parent: 'main',
    hideOnClose: true,
    showOnReady: false,
    openDevTools: false,
    options: {
      width: 360,
      height: 56,
      frame: false,
      transparent: true,
      resizable: false,
      focusable: true,
      acceptFirstMouse: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      backgroundColor: '#00000000',
      show: false,
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    },
    platformOverlays: {
      darwin: { options: { hasShadow: false } }
    }
  },
  chat: {
    routeHash: 'chat',
    autoCenterOn: 'parent-display',
    showOnReady: false,
    openDevTools: false,
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
  aiProviderConfig: {
    routeHash: 'ai-provider-config',
    autoCenterOn: 'parent-display',
    showOnReady: false,
    openDevTools: false,
    options: {
      width: 420,
      height: 320,
      minWidth: 360,
      minHeight: 260,
      frame: false,
      transparent: false,
      resizable: false,
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
  asrConfig: {
    routeHash: 'asr-config',
    showOnReady: false,
    openDevTools: false,
    options: {
      width: 400,
      height: 600,
      minWidth: 360,
      minHeight: 500,
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
  asr: {
    routeHash: 'asr',
    autoCenterOn: 'parent-display',
    showOnReady: true,
    openDevTools: false,
    options: {
      width: 500,
      height: 300,
      show: false,
      autoHideMenuBar: true,
      frame: false,
      transparent: true,
      resizable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    }
  },
  ttsConfig: {
    routeHash: 'tts-config',
    showOnReady: false,
    openDevTools: false,
    options: {
      width: 400,
      height: 500,
      minWidth: 360,
      minHeight: 400,
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
  tts: {
    routeHash: 'tts',
    autoCenterOn: 'parent-display',
    showOnReady: true,
    openDevTools: false,
    options: {
      width: 500,
      height: 420,
      minWidth: 400,
      minHeight: 360,
      show: false,
      autoHideMenuBar: true,
      frame: false,
      transparent: true,
      resizable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    }
  },
  asrTest: {
    routeHash: 'asr-test',
    autoCenterOn: 'parent-display',
    showOnReady: true,
    openDevTools: false,
    options: {
      width: 520,
      height: 480,
      minWidth: 400,
      minHeight: 360,
      show: false,
      autoHideMenuBar: true,
      frame: false,
      transparent: true,
      resizable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    }
  },
  characterPackEditor: {
    routeHash: 'character-pack-editor',
    autoCenterOn: 'parent-display',
    showOnReady: false,
    openDevTools: false,
    rememberState: true,
    options: {
      width: 1180,
      height: 820,
      minWidth: 900,
      minHeight: 640,
      frame: false,
      transparent: false,
      resizable: true,
      alwaysOnTop: false,
      skipTaskbar: false,
      show: false,
      backgroundColor: '#ffffff',
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
  windowAnimationEditor: {
    routeHash: 'window-animation-editor',
    autoCenterOn: 'parent-display',
    showOnReady: false,
    openDevTools: false,
    rememberState: true,
    options: {
      width: 1180,
      height: 780,
      minWidth: 980,
      minHeight: 640,
      frame: false,
      transparent: false,
      resizable: true,
      alwaysOnTop: false,
      skipTaskbar: false,
      show: false,
      backgroundColor: '#ffffff',
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
  spriteBubbleFixedTop: {
    routeHash: 'sprite-bubble',
    followMain: true,
    followerPreferMode: 'fixed-top' as any,
    followerClampToWorkArea: false,
    preferShowInactive: true,
    suspendHoverMonitorOnShow: false,
    parent: 'main',
    hideOnClose: true,
    showOnReady: false,
    openDevTools: false,
    options: {
      width: 260,
      height: 80,
      frame: false,
      transparent: true,
      resizable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    },
    platformOverlays: {
      darwin: { options: { hasShadow: false } }
    }
  }
};

export default DEFAULT_WINDOW_CONFIGS;
