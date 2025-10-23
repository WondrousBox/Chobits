import { ipcMain, BrowserWindow } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { screen, app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { windowManager } from '../window/window-manager';
import { registerWindowConfig, unregisterWindowConfig, listWindowKeys, getWindowConfig } from '../window/window-config';
import { getSuggestWorkspacePath } from '../utils';
import { saveWindowState, WindowStateStore } from '../window/window-state-store';
import { ASSISTANT_HEIGHT, ASSISTANT_WIDTH } from '../config';
import { WindowConfig, WindowKey } from '../window/types';

export function initWindowHandlers(win: BrowserWindow) {
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
  function saveConfig() {
    try {
      fs.writeFileSync(configFile, JSON.stringify(movementConfig, null, 2), 'utf8');
    } catch { }
  }

  // ---------------- Hover monitor to manage click-through ---------------
  // 在透明窗口上，为了让外部（Finder）拖拽能进入助手区域，我们需要在鼠标进入助手内层矩形时
  // 自动关闭 ignoreMouseEvents（否则不会收到 dragenter/over 事件）。
  let hoverTimer: NodeJS.Timeout | null = null;
  let lastInside = false;
  function isCursorInsideAssistant(): boolean {
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
  try {
    windowManager.init(win, {
      preloadPath: (win as any).__preloadPath,
      assistantPadding: movementConfig.assistantPadding,
      onBeforeFollowerShow: () => {
        try {
          stopHoverMonitor();
        } catch { }
      },
      onAfterFollowerHide: () => {
        try {
          startHoverMonitor();
        } catch { }
      }
    });
  } catch { }

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

  // ---------------- Window Move & Click Through -------------
  ipcMain.handle('moveWindow', (_: IpcMainInvokeEvent, x: number, y: number) => {
    if (!win) return false;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    win.setPosition(Math.round(x), Math.round(y));
    return true;
  });

  ipcMain.handle('getWindowPosition', () => {
    if (win) {
      return win.getPosition();
    }
    return [0, 0];
  });

  ipcMain.handle('getScreenSize', () => {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    return { width, height };
  });

  // 设置窗口大小
  ipcMain.handle('setWindowSize', (_: IpcMainInvokeEvent, windowKey: string, width: number, height: number, center?: boolean) => {
    try {
      let targetWindow: BrowserWindow | null = null;

      // 根据窗口键获取目标窗口
      if (windowKey === 'main') {
        targetWindow = win;
      } else {
        // 从窗口管理器获取其他窗口
        targetWindow = windowManager.get(windowKey as any);
      }

      if (!targetWindow || targetWindow.isDestroyed()) {
        return { success: false, error: 'Window not found' };
      }

      // 获取当前屏幕信息
      const display = screen.getDisplayNearestPoint(targetWindow.getBounds());
      const workArea = display.workArea;

      // 确保窗口大小不超过屏幕工作区域
      const maxWidth = workArea.width;
      const maxHeight = workArea.height;
      const finalWidth = Math.min(width, maxWidth);
      const finalHeight = Math.min(height, maxHeight);

      // 计算窗口位置
      let x = targetWindow.getPosition()[0];
      let y = targetWindow.getPosition()[1];

      if (center) {
        // 居中显示
        x = workArea.x + Math.floor((workArea.width - finalWidth) / 2);
        y = workArea.y + Math.floor((workArea.height - finalHeight) / 2);
      } else {
        // 保持当前位置，但确保窗口在屏幕内
        const currentBounds = targetWindow.getBounds();
        x = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - finalWidth));
        y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - finalHeight));
      }

      // 设置窗口大小和位置
      targetWindow.setBounds({ x, y, width: finalWidth, height: finalHeight });

      return { success: true, bounds: { x, y, width: finalWidth, height: finalHeight } };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 获取窗口当前大小
  ipcMain.handle('getWindowSize', (_: IpcMainInvokeEvent, windowKey: string) => {
    try {
      let targetWindow: BrowserWindow | null = null;

      if (windowKey === 'main') {
        targetWindow = win;
      } else {
        targetWindow = windowManager.get(windowKey as any);
      }

      if (!targetWindow || targetWindow.isDestroyed()) {
        return { success: false, error: 'Window not found' };
      }

      const bounds = targetWindow.getBounds();
      return { success: true, bounds };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('setClickThrough', (_: IpcMainInvokeEvent, enable: boolean) => {
    if (!win) return false;
    try {
      win.setIgnoreMouseEvents(!!enable, { forward: true });
      return true;
    } catch (e) {
      return false;
    }
  });

  ipcMain.handle('suggestWorkspacePath', async () => getSuggestWorkspacePath());

  // ---------------- Menu Command (转发给主渲染) ---------------
  ipcMain.on('menu-command', (_e, action: string) => {
    switch (action) {
      case 'quit-app':
        try {
          app.quit();
        } catch { }
        return;
      case 'walk-once':
        try {
          win?.webContents.send('menu-command', action);
        } catch { }
        return;
      default:
        try {
          win?.webContents.send('menu-command', action);
        } catch { }
        return;
    }
  });

  ipcMain.handle('openWindow', async (_: IpcMainInvokeEvent, key: WindowKey, payload?: any) => {
    if (!win) return false;
    try {
      if (payload) {
        (globalThis as any).__lastWindowPayload = (globalThis as any).__lastWindowPayload || {};
        (globalThis as any).__lastWindowPayload[key] = payload;
      }
      await windowManager.createOrShow(key, payload);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('openWindowReady', (_: IpcMainInvokeEvent, key: WindowKey) => {
    try {
      const payload = ((globalThis as any).__lastWindowPayload || {})[key];
      if (payload) _.sender.send('openWindowReadyData', payload);
    } catch { }
  });

  ipcMain.handle('getWindowPayload', (_: IpcMainInvokeEvent, key: WindowKey) => {
    try {
      return ((globalThis as any).__lastWindowPayload || {})[key] || null;
    } catch {
      return null;
    }
  });

  ipcMain.handle('closeWindow', async (_: IpcMainInvokeEvent, key: WindowKey) => {
    if (!win) return false;
    try {
      await windowManager.close(key);
      return true;
    } catch {
      return false;
    }
  });

  // ------- Dynamic window config registry IPC -------
  ipcMain.handle('window-register-config', async (_: IpcMainInvokeEvent, key: WindowKey, config: WindowConfig, options?: { persist?: boolean; openNow?: boolean; payload?: any }) => {
    try {
      registerWindowConfig(key, config, !!options?.persist);
      if (options?.openNow) {
        await windowManager.createOrShow(key as any, options?.payload);
      }
      return { ok: true };
    } catch (e: any) {
      const msg = e?.message ? String(e.message) : String(e);
      return { ok: false, error: msg };
    }
  });

  ipcMain.handle('window-unregister-config', async (_: IpcMainInvokeEvent, key: WindowKey, options?: { persist?: boolean; closeIfOpen?: boolean; removeState?: boolean }) => {
    try {
      if (options?.closeIfOpen) {
        try {
          await windowManager.close(key as any);
        } catch { }
      }
      if (options?.removeState) {
        try {
          WindowStateStore.removeState(key as any);
        } catch { }
      }
      unregisterWindowConfig(key, !!options?.persist);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle('window-list-configs', () => {
    try {
      return listWindowKeys();
    } catch {
      return [];
    }
  });

  ipcMain.handle('window-get-config', (_: IpcMainInvokeEvent, key: WindowKey) => {
    try {
      return getWindowConfig(key);
    } catch {
      return undefined;
    }
  });

  // ---------------- Generic window controls for the calling (sender) window --------------
  ipcMain.handle('window-minimize', (event: IpcMainInvokeEvent) => {
    try {
      const browserWindow = BrowserWindow.fromWebContents(event.sender);
      if (browserWindow && !browserWindow.isDestroyed()) {
        browserWindow.minimize();
        return true;
      }
    } catch { }
    return false;
  });

  ipcMain.handle('window-maximize-or-restore', (event: IpcMainInvokeEvent) => {
    try {
      const browserWindow = BrowserWindow.fromWebContents(event.sender);
      if (browserWindow && !browserWindow.isDestroyed()) {
        if (browserWindow.isMaximized()) browserWindow.restore();
        else browserWindow.maximize();
        return { maximized: browserWindow.isMaximized() };
      }
    } catch { }
    return { maximized: false };
  });

  ipcMain.handle('window-close-self', (event: IpcMainInvokeEvent) => {
    try {
      const browserWindow = BrowserWindow.fromWebContents(event.sender);
      if (browserWindow && !browserWindow.isDestroyed()) {
        browserWindow.close();
        return true;
      }
    } catch { }
    return false;
  });

  ipcMain.handle('window-is-maximized', (event: IpcMainInvokeEvent) => {
    try {
      const browserWindow = BrowserWindow.fromWebContents(event.sender);
      if (browserWindow && !browserWindow.isDestroyed()) {
        return browserWindow.isMaximized();
      }
    } catch { }
    return false;
  });

  ipcMain.handle('window-capabilities', (event: IpcMainInvokeEvent) => {
    try {
      const browserWindow = BrowserWindow.fromWebContents(event.sender);
      if (browserWindow && !browserWindow.isDestroyed()) {
        return {
          minimizable: browserWindow.isMinimizable?.() ?? true,
          maximizable: browserWindow.isMaximizable?.() ?? true,
          resizable: browserWindow.isResizable?.() ?? true
        };
      }
    } catch { }
    return { minimizable: false, maximizable: false, resizable: false };
  });

  // 窗口状态保存和恢复相关的 IPC 处理器
  ipcMain.handle('window-save-state', (event: IpcMainInvokeEvent, key: WindowKey) => {
    try {
      const browserWindow = BrowserWindow.fromWebContents(event.sender);
      if (browserWindow && !browserWindow.isDestroyed()) {
        saveWindowState(browserWindow, key);
        return true;
      }
    } catch { }
    return false;
  });

  ipcMain.handle('window-get-state', (event: IpcMainInvokeEvent, key: WindowKey) => {
    try {
      return WindowStateStore.getState(key);
    } catch { }
    return null;
  });

  ipcMain.handle('window-clear-state', (event: IpcMainInvokeEvent, key: WindowKey) => {
    try {
      WindowStateStore.removeState(key);
      return true;
    } catch { }
    return false;
  });
}
