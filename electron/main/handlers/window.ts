import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { initIpcMain, windowManager } from '@aim-packages/window-manager';
import type { IpcMainInvokeEvent } from 'electron';
import { BrowserWindow, ipcMain } from 'electron';
import { app, screen, systemPreferences } from 'electron';

import { ASSISTANT_HEIGHT, ASSISTANT_WIDTH } from '../config';
import defaultWindowConfigs from '../config/window';

export function initWindowHandlers(win: BrowserWindow): void {
  // Movement config persistence ------------------------------------------------
  type MovementConfig = { walkSpeed: number; fpsLimit: number; movementMode: 'stepped' | 'smooth'; stepGrid: number; pathCurveFactor: number; assistantPadding: number };
  const defaultConfig: MovementConfig = { walkSpeed: 500, fpsLimit: 30, movementMode: 'stepped', stepGrid: 12, pathCurveFactor: 0.15, assistantPadding: 100 };
  const configDir = app.getPath('userData');
  const configFile = path.join(configDir, 'movement-config.json');
  let movementConfig: MovementConfig = defaultConfig;
  try {
    if (fs.existsSync(configFile)) {
      const txt = fs.readFileSync(configFile, 'utf8');
      const parsed = JSON.parse(txt);
      movementConfig = { ...defaultConfig, ...parsed };
    }
  } catch {
    movementConfig = defaultConfig;
  }
  function saveConfig(): void {
    try {
      fs.writeFileSync(configFile, JSON.stringify(movementConfig, null, 2), 'utf8');
    } catch {
      //
    }
  }

  // ---------------- Hover monitor to manage click-through ---------------
  // 在透明窗口上，为了让外部（Finder）拖拽能进入助手区域，我们需要在鼠标进入助手内层矩形时
  // 自动关闭 ignoreMouseEvents（否则不会收到 dragenter/over 事件）。
  // 优先使用全局系统级鼠标事件钩子（uiohook-napi），不可用时回退到低频轮询。
  const require = createRequire(import.meta.url);

  // 缓存窗口边界，避免每次事件都调用 getBounds()
  let cachedBounds = win.getBounds();
  function refreshBounds(): void {
    try {
      if (!win || win.isDestroyed()) return;
      cachedBounds = win.getBounds();
    } catch {
      /* ignore */
    }
  }
  win.on('move', refreshBounds);
  win.on('resize', refreshBounds);

  let lastInside = false;
  function pointInside(x: number, y: number): boolean {
    const padding = movementConfig.assistantPadding ?? 0;
    const ax = cachedBounds.x + padding;
    const ay = cachedBounds.y + padding;
    const aw = ASSISTANT_WIDTH;
    const ah = ASSISTANT_HEIGHT;
    return x >= ax && x <= ax + aw && y >= ay && y <= ay + ah;
  }

  function applyInsideState(inside: boolean): void {
    if (inside === lastInside) return;
    lastInside = inside;
    try {
      // 鼠标在助手区域内：允许接收事件（包括外部拖拽）
      // 区域外：继续穿透到底层应用
      win.setIgnoreMouseEvents(!inside, { forward: true });
    } catch {
      /* ignore */
    }
  }

  // 轮询回退
  let hoverTimer: NodeJS.Timeout | null = null;
  function pollOnce(): void {
    try {
      const p = screen.getCursorScreenPoint();
      applyInsideState(pointInside(p.x, p.y));
    } catch {
      /* ignore */
    }
  }
  function startPolling(): void {
    stopPolling();
    hoverTimer = setInterval(pollOnce, 33); // ~30fps 轮询
  }
  function stopPolling(): void {
    if (hoverTimer) {
      clearInterval(hoverTimer);
      hoverTimer = null;
    }
  }

  // 全局钩子
  let uIOhook: any | null = null;
  let hookActive = false;
  function startHook(): void {
    stopHook();
    // macOS: 检查辅助功能授权，未授权时引导用户授权
    if (process.platform === 'darwin') {
      try {
        const trusted = systemPreferences.isTrustedAccessibilityClient(false);
        if (!trusted) systemPreferences.isTrustedAccessibilityClient(true);
      } catch {
        /* ignore */
      }
    }
    try {
      const mod = require('uiohook-napi');
      uIOhook = mod?.uIOhook ?? mod; // 兼容不同导出形式
      if (!uIOhook || typeof uIOhook.on !== 'function') throw new Error('uIOhook not available');
      uIOhook.on('mousemove', (e: { x: number; y: number }) => {
        applyInsideState(pointInside(e.x, e.y));
      });
      uIOhook.start();
      hookActive = true;
    } catch {
      // 模块不可用或启动失败，回退轮询
      hookActive = false;
      startPolling();
    }
  }
  function stopHook(): void {
    if (hookActive && uIOhook) {
      try {
        uIOhook.removeAllListeners?.('mousemove');
        uIOhook.stop?.();
      } catch {
        /* ignore */
      }
    }
    hookActive = false;
  }

  function startHoverMonitor(): void {
    stopHoverMonitor();
    try {
      startHook();
      if (!hookActive) startPolling();
    } catch {
      startPolling();
    }
  }
  function stopHoverMonitor(): void {
    stopHook();
    stopPolling();
  }

  // 主窗口关闭时统一销毁子窗口
  win.on('closed', () => {
    windowManager.destroyAll();
    stopHoverMonitor();
  });

  // 启动 hover 监控
  startHoverMonitor();

  // Bootstrap WindowManager with main window context
  windowManager.init(win, {
    preloadPath: (win as any).__preloadPath,
    assistantPadding: movementConfig.assistantPadding,
    anchorHeight: ASSISTANT_HEIGHT,
    anchorWidth: ASSISTANT_WIDTH,
    serverUrl: process.env.VITE_DEV_SERVER_URL,
    rendererDist: path.join(process.env.APP_ROOT || app.getAppPath(), 'dist'),
    windowConfigs: defaultWindowConfigs,
    onBeforeFollowerShow: () => {
      stopHoverMonitor();
    },
    onAfterFollowerHide: () => {
      startHoverMonitor();
    }
  });

  // ---------------- Movement Config IPC --------------------
  ipcMain.handle('getMovementConfig', () => {
    return movementConfig;
  });
  ipcMain.handle('updateMovementConfig', (_: IpcMainInvokeEvent, partial: Partial<MovementConfig>) => {
    const oldPadding = movementConfig.assistantPadding;
    movementConfig = { ...movementConfig, ...partial };
    saveConfig();
    if (partial.assistantPadding !== undefined) {
      // 使用窗口管理器的内边距调整功能，它会自动更新跟随窗口位置
      windowManager.adjustMainWindowForPadding(oldPadding, movementConfig.assistantPadding);
      // 重新计算缓存边界（padding 影响命中区域）
      refreshBounds();
    }
    // 广播更新
    try {
      win?.webContents.send('movement-config-updated', movementConfig);
    } catch {
      /* ignore */
    }
    try {
      windowManager.get('settings')?.webContents.send('movement-config-updated', movementConfig);
    } catch {
      /* ignore */
    }
    return movementConfig;
  });

  initIpcMain(win);
}
