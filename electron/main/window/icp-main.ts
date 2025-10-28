import { screen, app, BrowserWindow, ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { saveWindowState, WindowState, WindowStateStore } from './window-state-store';
import { WindowConfig, WindowKey } from './types';
import { getWindowConfig, listWindowKeys, registerWindowConfig, unregisterWindowConfig } from './window-config';
import { windowManager } from './window-manager';

export function init(win: BrowserWindow): void {
  ipcMain.handle('screen:size:get', () => {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    return { width, height };
  });

  // ---------------- Click Through -------------
  ipcMain.handle('window:click:through', (_event: IpcMainInvokeEvent, enable: boolean) => {
    if (!win) return false;
    try {
      win.setIgnoreMouseEvents(!!enable, { forward: true });
      return true;
    } catch (e) {
      console.log(e);
      return false;
    }
  });

  // ---------------- window:command (转发给主渲染进程的事件) ---------------
  ipcMain.on('window:command', (_e, action: { type: string; payload?: any }) => {
    if (action.type === 'quit-app') {
      app.quit();
      return;
    }
    win?.webContents.send('window:command', action);
  });

  // ---------------- Child window open/close IPC --------------

  ipcMain.handle('window:open', async (event: IpcMainInvokeEvent, key: WindowKey, payload?: any) => {
    if (!win) return false;
    try {
      if (payload) {
        (globalThis as any).__lastWindowPayload = (globalThis as any).__lastWindowPayload || {};
        (globalThis as any).__lastWindowPayload[key] = payload;
      }
      // Record opener (the sender window) so that when the opened window closes, we can restore focus to the opener
      try {
        const opener = BrowserWindow.fromWebContents(event.sender) || null;
        if (opener && !opener.isDestroyed()) {
          windowManager.setOpener(key, opener);
        }
      } catch {
        // noop
      }
      await windowManager.createOrShow(key, payload);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('window:open:ready', (_: IpcMainInvokeEvent, key: WindowKey) => {
    const payload = ((globalThis as any).__lastWindowPayload || {})[key];
    if (payload) _.sender.send('on:window:open:ready', payload);
  });

  ipcMain.handle('window:payload:get', (_: IpcMainInvokeEvent, key: WindowKey) => {
    return ((globalThis as any).__lastWindowPayload || {})[key] || null;
  });

  ipcMain.handle('window:close', async (_: IpcMainInvokeEvent, key: WindowKey) => {
    if (!win) return false;
    try {
      await windowManager.close(key);
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle('window:move', (_: IpcMainInvokeEvent, position: { x: number; y: number }, key?: WindowKey) => {
    let currentWin: BrowserWindow | null = win;
    if (key) {
      currentWin = windowManager.get(key);
    }
    if (!currentWin) return false;
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return false;
    currentWin.setPosition(Math.round(position.x), Math.round(position.y));
    return true;
  });

  ipcMain.handle('window:position:get', (_: IpcMainInvokeEvent, key?: WindowKey) => {
    let currentWin: BrowserWindow | null = win;
    if (key) {
      currentWin = windowManager.get(key);
    }
    if (currentWin) {
      return currentWin.getPosition();
    }
    return [0, 0];
  });

  // ------- Dynamic window config registry IPC -------
  ipcMain.handle('window:config:register', async (_: IpcMainInvokeEvent, key: WindowKey, config: WindowConfig, options?: { persist?: boolean; openNow?: boolean; payload?: any }) => {
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

  ipcMain.handle('window:config:unregister', async (_: IpcMainInvokeEvent, key: WindowKey, options?: { persist?: boolean; closeIfOpen?: boolean; removeState?: boolean }) => {
    try {
      if (options?.closeIfOpen) {
        try {
          await windowManager.close(key as any);
        } catch {
          //
        }
      }
      if (options?.removeState) {
        try {
          WindowStateStore.removeState(key as any);
        } catch {
          //
        }
      }
      unregisterWindowConfig(key, !!options?.persist);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  });

  ipcMain.handle('window:config:list', () => {
    try {
      return listWindowKeys();
    } catch {
      return [];
    }
  });

  ipcMain.handle('window:config:get', (_: IpcMainInvokeEvent, key: WindowKey) => {
    try {
      return getWindowConfig(key);
    } catch {
      return undefined;
    }
  });

  // ---------------- Generic window controls for the calling (sender) window --------------
  ipcMain.handle('window:minimize', (event: IpcMainInvokeEvent) => {
    try {
      const browserWindow = BrowserWindow.fromWebContents(event.sender);
      if (browserWindow && !browserWindow.isDestroyed()) {
        browserWindow.minimize();
        return true;
      }
    } catch {
      //
    }
    return false;
  });

  ipcMain.handle('window:maximize', (event: IpcMainInvokeEvent) => {
    try {
      const browserWindow = BrowserWindow.fromWebContents(event.sender);
      if (browserWindow && !browserWindow.isDestroyed()) {
        if (browserWindow.isMaximized()) browserWindow.restore();
        else browserWindow.maximize();
        return { maximized: browserWindow.isMaximized() };
      }
    } catch {
      //
    }
    return { maximized: false };
  });

  ipcMain.handle('window:close:self', (event: IpcMainInvokeEvent) => {
    try {
      const browserWindow = BrowserWindow.fromWebContents(event.sender);
      if (browserWindow && !browserWindow.isDestroyed()) {
        browserWindow.close();
        return true;
      }
    } catch {
      //
    }
    return false;
  });

  ipcMain.handle('window:maximized:get', (event: IpcMainInvokeEvent) => {
    try {
      const browserWindow = BrowserWindow.fromWebContents(event.sender);
      if (browserWindow && !browserWindow.isDestroyed()) {
        return browserWindow.isMaximized();
      }
    } catch {
      //
    }
    return false;
  });

  ipcMain.handle('window:capabilities:get', (event: IpcMainInvokeEvent) => {
    const browserWindow = BrowserWindow.fromWebContents(event.sender);
    if (browserWindow && !browserWindow.isDestroyed()) {
      return {
        minimizable: browserWindow.isMinimizable?.() ?? true,
        maximizable: browserWindow.isMaximizable?.() ?? true,
        resizable: browserWindow.isResizable?.() ?? true
      };
    }
    return { minimizable: false, maximizable: false, resizable: false };
  });

  // 获取窗口当前大小
  ipcMain.handle('window:size:get', (_: IpcMainInvokeEvent, windowKey: string) => {
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

  // 设置窗口大小
  ipcMain.handle('window:size:set', (_: IpcMainInvokeEvent, windowKey: string, width: number, height: number, center?: boolean) => {
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
        // const currentBounds = targetWindow.getBounds();
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

  // ------- Window state persistence -------
  ipcMain.handle('window:state:save', (event: IpcMainInvokeEvent, key: WindowKey): boolean => {
    try {
      const browserWindow = BrowserWindow.fromWebContents(event.sender);
      if (browserWindow && !browserWindow.isDestroyed()) {
        saveWindowState(browserWindow, key);
        return true;
      }
    } catch {
      //
    }
    return false;
  });

  ipcMain.handle('window:state:get', (event: IpcMainInvokeEvent, key: WindowKey): WindowState | undefined => {
    try {
      return WindowStateStore.getState(key);
    } catch {
      //
    }
    return undefined;
  });

  ipcMain.handle('window:state:clear', (event: IpcMainInvokeEvent, key: WindowKey): boolean => {
    try {
      WindowStateStore.removeState(key);
      return true;
    } catch {
      //
    }
    return false;
  });
}
