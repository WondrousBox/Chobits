import { WindowConfig, WindowKey } from '@aim-packages/window-manager';

declare module '@aim-packages/window-manager' {
  interface CustomWindowKeys {
    status: void;
    menu: void;
    fileActionsMenu: void;
    settings: void;
    workspaceWizard: void;
    resources: void;
    inventory: void;
    assistant: void;
    assistantMini: void;
    pluginManager: void;
    chat: void;
    chatOverlay: void;
    selectedTextExplain: void;
    resourcePreview: void;
    downloadFloating: void;
    pluginDownload: void;
    tagger: void;
    aiProviderConfig: void;
    asrConfig: void;
    asr: void;
    ttsConfig: void;
    tts: void;
    skillTree: void;
    levelUp: void;
    achievementUnlock: void;
    questList: void;
    webRecorder: void;
    memoryGraph: void;
    characterPackEditor: void;
    windowAnimationEditor: { presetId?: string } | void;
    spriteBubbleFixedTop: void;
    spriteEffect: void;
    musicSpectrum: void;
  }
}

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
    forceCenterAlignment: true,
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
  workspaceWizard: {
    routeHash: 'workspace-wizard',
    autoCenterOn: 'parent-display',
    showOnReady: false,
    openDevTools: false,
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
    openDevTools: false,
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
  inventory: {
    routeHash: 'inventory',
    autoCenterOn: 'parent-display',
    showOnReady: true,
    openDevTools: false,
    rememberState: true,
    options: {
      width: 680,
      height: 640,
      minWidth: 680,
      minHeight: 420,
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
  assistantMini: {
    routeHash: 'assistant-mini',
    followMain: true,
    followerPreferMode: 'fixed-bottom',
    followerClampToWorkArea: false,
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
  pluginManager: {
    routeHash: 'plugin-manager',
    autoCenterOn: 'parent-display',
    showOnReady: false,
    openDevTools: false,
    options: {
      width: 800,
      height: 600,
      minWidth: 640,
      minHeight: 480,
      frame: false,
      resizable: true,
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
  chatOverlay: {
    routeHash: 'chat-overlay',
    autoCenterOn: 'none',
    showOnReady: false,
    openDevTools: false,
    hideOnClose: true,
    options: {
      width: 560,
      height: 720,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      backgroundColor: '#00000000',
      show: false,
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    }
  },
  selectedTextExplain: {
    routeHash: 'selected-text-explain',
    autoCenterOn: 'none',
    showOnReady: false,
    openDevTools: false,
    hideOnClose: true,
    options: {
      width: 460,
      height: 540,
      minWidth: 360,
      minHeight: 360,
      frame: false,
      transparent: true,
      resizable: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      hasShadow: false,
      backgroundColor: '#00000000',
      show: false,
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    }
  },
  resourcePreview: {
    routeHash: 'resource-preview',
    autoCenterOn: 'parent-display',
    showOnReady: false,
    openDevTools: false,
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
    routeHash: 'download',
    autoCenterOn: 'none',
    showOnReady: false,
    openDevTools: false,
    options: {
      width: 340,
      height: 140,
      minWidth: 300,
      minHeight: 120,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      hasShadow: false,
      backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    }
  },
  pluginDownload: {
    routeHash: 'plugin-download',
    autoCenterOn: 'parent-display',
    showOnReady: true,
    openDevTools: false,
    rememberState: true,
    options: {
      width: 600,
      height: 500,
      minWidth: 500,
      minHeight: 400,
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
  tagger: {
    routeHash: 'tagger',
    autoCenterOn: 'parent-display',
    showOnReady: false,
    openDevTools: false,
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
  skillTree: {
    routeHash: 'skill-tree',
    // trueFullscreen 需要在 ready-to-show 时立即 show，
    // 这样 window-manager 才会在 macOS 上补 setAlwaysOnTop(..., 'screen-saver')
    // 去覆盖 Dock / 菜单栏；若延后手动 show，会丢失这一步。
    showOnReady: true,
    openDevTools: false,
    trueFullscreen: true,
    options: {
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      hasShadow: false,
      enableLargerThanScreen: true,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    }
  },
  levelUp: {
    routeHash: 'level-up',
    autoCenterOn: 'parent-display',
    showOnReady: false,
    openDevTools: false,
    options: {
      width: 500,
      height: 400,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: false,
      hasShadow: false,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    }
  },
  achievementUnlock: {
    routeHash: 'achievement-unlock',
    autoCenterOn: 'none',
    showOnReady: false,
    openDevTools: false,
    preferShowInactive: true,
    options: {
      width: 420,
      height: 128,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: true,
      acceptFirstMouse: true,
      hasShadow: false,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    }
  },
  questList: {
    routeHash: 'quest-list',
    autoCenterOn: 'parent-display',
    showOnReady: false,
    openDevTools: false,
    rememberState: true,
    options: {
      width: 520,
      height: 640,
      minWidth: 460,
      minHeight: 420,
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
  webRecorder: {
    routeHash: 'web-recorder',
    autoCenterOn: 'parent-display',
    showOnReady: false,
    openDevTools: false, // 开启调试面板，调试完成后改为 false
    options: {
      width: 280,
      height: 48,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: true,
      hasShadow: true,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: true, contextIsolation: true }
    }
  },
  memoryGraph: {
    routeHash: 'memory-graph',
    showOnReady: true,
    openDevTools: false,
    trueFullscreen: true,
    options: {
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      hasShadow: false,
      enableLargerThanScreen: true,
      show: false,
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
  },
  spriteEffect: {
    routeHash: 'sprite-effect',
    followMain: true,
    followerPreferMode: 'overlap-center',
    enableOverlapTransparency: true,
    forceCenterAlignment: true,
    preferShowInactive: true,
    suspendHoverMonitorOnShow: false,
    parent: 'main',
    hideOnClose: true,
    showOnReady: false,
    openDevTools: false,
    options: {
      width: 420,
      height: 260,
      minWidth: 360,
      minHeight: 220,
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
  },
  musicSpectrum: {
    routeHash: 'music-spectrum',
    followMain: true,
    followerPreferMode: 'overlap-center',
    enableOverlapTransparency: true,
    forceCenterAlignment: true,
    preferShowInactive: true,
    suspendHoverMonitorOnShow: false,
    parent: 'main',
    hideOnClose: true,
    showOnReady: false,
    openDevTools: false,
    options: {
      width: 360,
      height: 120,
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

export default defaultWindowConfigs;
