import { app, BrowserWindow, ipcMain } from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import { saveWindowState, WindowState, WindowStateStore } from './window-state-store';
import { WindowConfig, WindowKey } from './types';
import { getWindowConfig, listWindowKeys, registerWindowConfig, unregisterWindowConfig } from './window-config';
import { windowManager } from './window-manager';

export function init(win: BrowserWindow): void {
  // ---------------- window:command (转发给主渲染进程的事件) ---------------
  ipcMain.on('window:command', (_e, action: { type: string; payload?: any }) => {
    if (action.type === 'quit-app') {
      app.quit();
      return;
    }
    win?.webContents.send('window:command', action);
  });

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

  // 窗口状态保存和恢复相关的 IPC 处理器
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
