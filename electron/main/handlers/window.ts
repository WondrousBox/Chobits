import { createRequire } from 'node:module';
import path from 'node:path';

import { initIpcMain, windowManager } from '@aim-packages/window-manager';
import type { IpcMainInvokeEvent } from 'electron';
import { BrowserWindow, ipcMain } from 'electron';
import { app, screen } from 'electron';

import defaultWindowConfigs from '../config/window';

export function initWindowHandlers(win: BrowserWindow): void {
  // 自动移动开关（运行时状态，不持久化）
  let autoWalkEnabled = true; // 默认启用

  // 记录助手窗口的 padding（由渲染进程通过 IPC 动态设置）
  let assistantPadding = 100; // 默认值，等待渲染进程通过 setAssistantSize 设置

  // ---------------- Hover monitor to manage click-through ---------------
  // 在透明窗口上，为了让外部（Finder）拖拽能进入助手区域，我们需要在鼠标进入助手内层矩形时
  // 自动关闭 ignoreMouseEvents（否则不会收到 dragenter/over 事件）。
  // 优先使用全局系统级鼠标事件钩子（uiohook-napi），不可用时回退到低频轮询。
  const require = createRequire(import.meta.url);

  // 记录助手窗口的实际尺寸（由渲染进程通过 IPC 设置）
  // 初始值为 0，等待渲染进程通过 setAssistantSize 设置
  let assistantWidth = 0;
  let assistantHeight = 0;

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
    // 如果尺寸还未设置，返回 false（不认为在区域内）
    if (assistantWidth <= 0 || assistantHeight <= 0) return false;
    const padding = assistantPadding ?? 0;
    const ax = cachedBounds.x + padding;
    const ay = cachedBounds.y + padding;
    const aw = assistantWidth;
    const ah = assistantHeight;
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
    // if (process.platform === 'darwin') {
    //   try {
    //     const trusted = systemPreferences.isTrustedAccessibilityClient(false);
    //     if (!trusted) systemPreferences.isTrustedAccessibilityClient(true);
    //   } catch {
    //     /* ignore */
    //   }
    // }
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
  // 注意：anchorWidth 和 anchorHeight 初始为 0，会在 setAssistantSize 时更新
  // windowManager 可能需要这些值，但会在渲染进程设置后通过其他方式更新
  windowManager.init(win, {
    preloadPath: (win as any).__preloadPath,
    assistantPadding: assistantPadding, // 初始为默认值，等待渲染进程设置
    anchorHeight: assistantHeight, // 初始为 0，等待渲染进程设置
    anchorWidth: assistantWidth, // 初始为 0，等待渲染进程设置
    loadURL: process.env.VITE_DEV_SERVER_URL,
    loadFile: path.join(process.env.APP_ROOT || app.getAppPath(), 'dist'),
    windowConfigs: defaultWindowConfigs,
    onBeforeFollowerShow: () => {
      stopHoverMonitor();
    },
    onAfterFollowerHide: () => {
      startHoverMonitor();
    }
  });

  // ---------------- Auto Walk Control IPC --------------------
  // 获取自动移动开关状态
  ipcMain.handle('getAutoWalkEnabled', () => {
    return autoWalkEnabled;
  });

  // 设置自动移动开关状态
  ipcMain.handle('setAutoWalkEnabled', (_: IpcMainInvokeEvent, enabled: boolean) => {
    autoWalkEnabled = enabled;
    // 广播状态变化
    try {
      win?.webContents.send('auto-walk-enabled-changed', enabled);
    } catch {
      /* ignore */
    }
    try {
      windowManager.get('settings')?.webContents.send('auto-walk-enabled-changed', enabled);
    } catch {
      /* ignore */
    }
    return enabled;
  });

  // ---------------- Assistant Size IPC --------------------
  // 渲染进程通过此接口设置窗口大小和 padding
  ipcMain.handle('setAssistantSize', (_: IpcMainInvokeEvent, params: { width: number; height: number; padding: number }) => {
    try {
      if (!win || win.isDestroyed()) return { success: false };

      // 更新记录的尺寸（这些值用于鼠标移动效果和窗口贴边等计算）
      assistantWidth = params.width;
      assistantHeight = params.height;

      // 计算窗口总大小（助手尺寸 + padding * 2）
      const winWidth = params.width + params.padding * 2;
      const winHeight = params.height + params.padding * 2;

      // 设置窗口大小
      win.setSize(winWidth, winHeight, false);

      // 更新 padding（如果不同）
      if (assistantPadding !== params.padding) {
        const oldPadding = assistantPadding;
        assistantPadding = params.padding;

        // 更新窗口管理器的 anchor 尺寸和 padding
        try {
          windowManager.setAnchorWidth?.(assistantWidth);
          windowManager.setAnchorHeight?.(assistantHeight);
        } catch {
          // 如果方法不存在，忽略
        }
        // 更新窗口管理器的 padding（这个方法可能会调整窗口位置，但不会改变大小，因为我们已经设置了）
        windowManager.adjustMainWindowForPadding(oldPadding, params.padding);
      }

      // 刷新缓存边界
      refreshBounds();

      return { success: true };
    } catch (error) {
      console.error('Failed to set assistant size:', error);
      return { success: false, error: String(error) };
    }
  });

  initIpcMain(win);
}
