import { ipcMain, BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { screen, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { windowManager } from '../window/window-manager';
import { ASSISTANT_HEIGHT, ASSISTANT_WIDTH } from '../config';
import { init } from '../window/icp-main';

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
  let hoverTimer: NodeJS.Timeout | null = null;
  let lastInside = false;
  function isCursorInsideAssistant(): boolean {
    console.log('===========');

    if (!win || win.isDestroyed()) return false;
    try {
      const p = screen.getCursorScreenPoint();
      const b = win.getBounds();
      const padding = movementConfig.assistantPadding ?? 0;
      const ax = b.x + padding;
      const ay = b.y + padding;
      const aw = ASSISTANT_WIDTH;
      const ah = ASSISTANT_HEIGHT;
      return p.x >= ax && p.x <= ax + aw && p.y >= ay && p.y <= ay + ah;
    } catch {
      return false;
    }
  }

  function startHoverMonitor() {
    stopHoverMonitor();
    hoverTimer = setInterval(() => {
      const inside = isCursorInsideAssistant();
      if (inside !== lastInside) {
        lastInside = inside;
        try {
          // 鼠标在助手区域内：允许接收事件（包括外部拖拽）
          // 区域外：继续穿透到底层应用
          win.setIgnoreMouseEvents(!inside, { forward: true });
        } catch { }
      }
    }, 33); // ~30fps 轮询
  }
  function stopHoverMonitor() {
    if (hoverTimer) {
      clearInterval(hoverTimer);
      hoverTimer = null;
    }
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
    }
    // 广播更新
    try {
      win?.webContents.send('movement-config-updated', movementConfig);
    } catch { }
    try {
      windowManager.get('settings')?.webContents.send('movement-config-updated', movementConfig);
    } catch { }
    return movementConfig;
  });

  init(win);
}
