import { app, BrowserWindow, ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { saveWindowState, WindowStateStore } from './window-state-store';
import { WindowConfig, WindowKey } from './types';
import { getWindowConfig, listWindowKeys, registerWindowConfig, unregisterWindowConfig } from './window-config';
import { windowManager } from './window-manager';

export function init(win: BrowserWindow): void {
  // ---------------- Menu Command (转发给主渲染) ---------------
  ipcMain.on('menu-command', (_e, action: string) => {
    if (action === 'quit-app') {
      app.quit();
      return;
    }
    win?.webContents.send('menu-command', action);
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
    } catch {
      //
    }
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
    } catch {
      //
    }
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
    } catch {
      //
    }
    return { maximized: false };
  });

  ipcMain.handle('window-close-self', (event: IpcMainInvokeEvent) => {
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

  ipcMain.handle('window-is-maximized', (event: IpcMainInvokeEvent) => {
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
    } catch {
      //
    }
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
    } catch {
      //
    }
    return false;
  });

  ipcMain.handle('window-get-state', (event: IpcMainInvokeEvent, key: WindowKey) => {
    try {
      return WindowStateStore.getState(key);
    } catch {
      //
    }
    return null;
  });
  ipcMain.handle('window-clear-state', (event: IpcMainInvokeEvent, key: WindowKey) => {
    try {
      WindowStateStore.removeState(key);
      return true;
    } catch {
      //
    }
    return false;
  });
}
