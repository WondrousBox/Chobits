import path from 'node:path';

import { initIpcMain as initWindowManagerHandlers, windowManager } from '@aim-packages/window-manager';
import { attachAppWindowClosedReporter, emitAppWindowOpened, rememberWindowPayload } from '@packages/event/window-events';
import type { IpcMainInvokeEvent } from 'electron';
import { BrowserWindow, ipcMain } from 'electron';
import { app, screen } from 'electron';

import DEFAULT_WINDOW_CONFIGS from '../config/window';
import { globalInputMonitor } from '../global-input-monitor';

const SPRITE_BUBBLE_WINDOW_KEYS = ['spriteBubbleFixedTop'] as const;
type SpriteBubbleWindowKey = (typeof SPRITE_BUBBLE_WINDOW_KEYS)[number];
const SPRITE_BUBBLE_MIN_WIDTH = 40;
const SPRITE_BUBBLE_MIN_HEIGHT = 24;
const SPRITE_BUBBLE_MAX_WIDTH = 504;
const SPRITE_BUBBLE_MAX_HEIGHT = 392;
type SpriteInteractiveRegion = { x: number; y: number; width: number; height: number };

function clampWindowDimension(value: number | undefined, min: number, max: number): number {
  const numericValue = Number(value ?? 0);
  const rounded = Number.isFinite(numericValue) ? Math.round(numericValue) : 0;
  return Math.min(max, Math.max(min, rounded));
}

function normalizeInteractiveRegion(region: Partial<SpriteInteractiveRegion> | null | undefined): SpriteInteractiveRegion | null {
  const x = Number(region?.x);
  const y = Number(region?.y);
  const width = Number(region?.width);
  const height = Number(region?.height);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  if (width <= 0 || height <= 0) {
    return null;
  }
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.ceil(width),
    height: Math.ceil(height)
  };
}

export function initWindowHandlers(win: BrowserWindow): void {
  // 记录精灵窗口的 padding（由渲染进程通过 IPC 动态设置）
  let spritePadding = 100; // 默认值，等待渲染进程通过 sprite:size:set 设置
  let isSpritePaddingInitialized = false;

  // ---------------- Hover monitor to manage click-through ---------------
  // 在透明窗口上，为了让外部（Finder）拖拽能进入精灵区域，我们需要在鼠标进入精灵内层矩形时
  // 自动关闭 ignoreMouseEvents（否则不会收到 dragenter/over 事件）。
  // 优先使用全局系统级鼠标事件钩子（uiohook-napi），不可用时回退到低频轮询。
  // 记录精灵窗口的实际尺寸（由渲染进程通过 IPC 设置）。
  // 初始值为 0，等待渲染进程通过 sprite:size:set 设置。
  let spriteWidth = 0;
  let spriteHeight = 0;
  let spriteInteractiveRegions: SpriteInteractiveRegion[] = [];

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

  let wasInsideLast = true;
  function isPointInside(x: number, y: number): boolean {
    if (spriteWidth > 0 && spriteHeight > 0) {
      const padding = spritePadding ?? 0;
      const ax = cachedBounds.x + padding;
      const ay = cachedBounds.y + padding;
      const aw = spriteWidth;
      const ah = spriteHeight;
      if (x >= ax && x <= ax + aw && y >= ay && y <= ay + ah) {
        return true;
      }
    }

    return spriteInteractiveRegions.some((region) => {
      const rx = cachedBounds.x + region.x;
      const ry = cachedBounds.y + region.y;
      return x >= rx && x <= rx + region.width && y >= ry && y <= ry + region.height;
    });
  }

  function applyInsideState(inside: boolean): void {
    if (inside === wasInsideLast) return;
    wasInsideLast = inside;
    try {
      // 鼠标在精灵区域内：允许接收事件（包括外部拖拽）
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
      applyInsideState(isPointInside(p.x, p.y));
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
  let unsubscribeMouseMove: (() => void) | null = null;
  let isHookActive = false;
  let isHoverMonitorActive = false;
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
      unsubscribeMouseMove = globalInputMonitor.on('mousemove', (e: { x: number; y: number }) => {
        // uiohook 上报的是屏幕物理像素坐标，而窗口 bounds 与轮询路径都是 DIP 坐标。
        // Linux HiDPI（scaleFactor > 1）下两者不一致会导致区域判定永远失败、窗口被永久穿透。
        let x = e.x;
        let y = e.y;
        try {
          const dip = screen.screenToDipPoint({ x, y });
          x = dip.x;
          y = dip.y;
        } catch {
          /* ignore: 转换不可用时按原始坐标处理 */
        }
        applyInsideState(isPointInside(x, y));
      });
      isHookActive = true;
      // Linux 下 uiohook 可能 start 成功但事件不上报（如 XRecord 不可用），叠加轮询兜底
      if (process.platform === 'linux') startPolling();
    } catch {
      // 模块不可用或启动失败，回退轮询
      isHookActive = false;
      startPolling();
    }
  }
  function stopHook(): void {
    if (isHookActive && unsubscribeMouseMove) {
      try {
        unsubscribeMouseMove();
      } catch {
        /* ignore */
      }
    }
    unsubscribeMouseMove = null;
    isHookActive = false;
  }

  function restoreMouseEvents(): void {
    wasInsideLast = true;
    try {
      win.setIgnoreMouseEvents(false, { forward: true });
    } catch {
      /* ignore */
    }
  }

  function shouldRunHoverMonitor(): boolean {
    return isSpritePaddingInitialized && spriteWidth > 0 && spriteHeight > 0;
  }

  function startHoverMonitor(): void {
    if (!shouldRunHoverMonitor() || isHoverMonitorActive) return;
    isHoverMonitorActive = true;
    try {
      startHook();
      if (!isHookActive) startPolling();
    } catch {
      startPolling();
    }
    pollOnce();
  }
  function stopHoverMonitor(options?: { restoreMouseEvents?: boolean }): void {
    stopHook();
    stopPolling();
    isHoverMonitorActive = false;
    if (options?.restoreMouseEvents) {
      restoreMouseEvents();
    }
  }

  function syncHoverMonitor(): void {
    if (shouldRunHoverMonitor()) {
      startHoverMonitor();
      if (isHoverMonitorActive) {
        pollOnce();
      }
      return;
    }

    stopHoverMonitor({ restoreMouseEvents: true });
  }

  // 主窗口关闭时统一销毁子窗口
  win.on('closed', () => {
    windowManager.destroyAll();
    stopHoverMonitor({ restoreMouseEvents: true });
  });

  // Bootstrap WindowManager with main window context
  // 注意：anchorWidth 和 anchorHeight 初始为 0，会在 sprite:size:set 时更新
  // windowManager 可能需要这些值，但会在渲染进程设置后通过其他方式更新
  windowManager.init(win, {
    preloadPath: (win as any).__preloadPath,
    assistantPadding: spritePadding, // window-manager 包的外部选项名，保持不动；初始为默认值，等待渲染进程设置
    anchorHeight: spriteHeight, // 初始为 0，等待渲染进程设置
    anchorWidth: spriteWidth, // 初始为 0，等待渲染进程设置
    loadURL: process.env.VITE_DEV_SERVER_URL,
    loadFile: path.join(process.env.APP_ROOT || app.getAppPath(), 'dist'),
    windowConfigs: DEFAULT_WINDOW_CONFIGS,
    onBeforeFollowerShow: () => {
      stopHoverMonitor();
    },
    onAfterFollowerHide: () => {
      syncHoverMonitor();
    }
  });

  // ---------------- Sprite Size IPC --------------------
  // 渲染进程通过此接口设置窗口大小和 padding
  ipcMain.handle('sprite:size:set', (_event: IpcMainInvokeEvent, params: { width: number; height: number; padding: number }) => {
    try {
      if (!win || win.isDestroyed()) return { ok: false };

      // 更新记录的尺寸（这些值用于鼠标移动效果和窗口贴边等计算）
      spriteWidth = params.width;
      spriteHeight = params.height;
      isSpritePaddingInitialized = true;

      // 计算窗口总大小（精灵尺寸 + padding * 2）
      const winWidth = params.width + params.padding * 2;
      const winHeight = params.height + params.padding * 2;

      // 设置窗口大小
      win.setSize(winWidth, winHeight, false);

      // 更新窗口管理器的 anchor 尺寸（无论 padding 是否改变都要更新）
      try {
        if (typeof windowManager.setAnchorWidth === 'function') {
          windowManager.setAnchorWidth(spriteWidth);
        }
        if (typeof windowManager.setAnchorHeight === 'function') {
          windowManager.setAnchorHeight(spriteHeight);
        }
      } catch (error) {
        console.warn('Failed to update windowManager anchor size:', error);
      }

      // 更新 padding（如果不同）
      if (spritePadding !== params.padding) {
        const oldPadding = spritePadding;
        spritePadding = params.padding;
        // 更新窗口管理器的 padding（这个方法可能会调整窗口位置，但不会改变大小，因为我们已经设置了）
        windowManager.adjustMainWindowForPadding(oldPadding, params.padding);
      }
      if (params.padding <= 0) {
        spriteInteractiveRegions = [];
      }

      // 刷新缓存边界
      refreshBounds();
      syncHoverMonitor();

      return { ok: true };
    } catch (error) {
      console.error('Failed to set sprite size:', error);
      return { ok: false, error: String(error) };
    }
  });

  ipcMain.handle('sprite:interactive-regions:set', (_event: IpcMainInvokeEvent, params: { regions?: Array<Partial<SpriteInteractiveRegion>> }) => {
    try {
      spriteInteractiveRegions = (params?.regions ?? []).map(normalizeInteractiveRegion).filter((region): region is SpriteInteractiveRegion => Boolean(region));
      syncHoverMonitor();
      return { ok: true };
    } catch (error) {
      console.error('Failed to set sprite interactive regions:', error);
      return { ok: false, error: String(error) };
    }
  });

  initWindowManagerHandlers(win);
  ipcMain.removeHandler('window:devtools:toggle');
  ipcMain.handle('window:devtools:toggle', (event) => {
    try {
      const targetWindow = BrowserWindow.fromWebContents(event.sender);
      if (!targetWindow || targetWindow.isDestroyed()) {
        return false;
      }

      const webContents = targetWindow.webContents;
      if (webContents.isDevToolsOpened()) {
        webContents.closeDevTools();
      } else {
        webContents.openDevTools({ mode: 'detach', activate: true });
      }
      return true;
    } catch (error) {
      console.warn('[window] toggle detached devtools failed:', error);
      return false;
    }
  });
  ipcMain.removeHandler('window:open');
  ipcMain.handle('window:open', async (event, windowKey, payload, options) => {
    if (!win || win.isDestroyed()) return false;
    try {
      rememberWindowPayload(String(windowKey), payload);

      let opened: BrowserWindow | null = null;
      let opener: BrowserWindow | null = null;
      try {
        opener = BrowserWindow.fromWebContents(event.sender) || null;
        if (opener && !opener.isDestroyed()) {
          windowManager.setOpener(windowKey, opener);
        }
        if (options?.sameDisplayAsSender && opener && !opener.isDestroyed()) {
          const display = screen.getDisplayMatching(opener.getBounds());
          opened = await windowManager.createOrShowOnDisplay(windowKey, display, payload);
        }
      } catch (error) {
        console.warn('[window:open] failed to align new window to sender display', error);
      }

      opened = opened ?? (await windowManager.createOrShow(windowKey, payload));
      attachAppWindowClosedReporter(opened, String(windowKey), 'renderer-window-open');
      emitAppWindowOpened(String(windowKey), payload, 'renderer-window-open');
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.removeHandler('screen:work-area:get');
  ipcMain.handle('screen:work-area:get', (event, windowKey?: string) => {
    try {
      const targetWindow = windowKey ? windowManager.get(windowKey as any) : BrowserWindow.fromWebContents(event.sender);
      const display = targetWindow && !targetWindow.isDestroyed() ? screen.getDisplayMatching(targetWindow.getBounds()) : screen.getPrimaryDisplay();
      const { x, y, width, height } = display.workArea;
      return { x, y, width, height };
    } catch {
      const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
      return { x, y, width, height };
    }
  });
  ipcMain.removeHandler('window:bounds:set');
  ipcMain.handle('window:bounds:set', (event, windowKey: string | undefined, bounds: { x: number; y: number; width: number; height: number }) => {
    try {
      const targetWindow = windowKey ? windowManager.get(windowKey as any) : BrowserWindow.fromWebContents(event.sender);
      if (!targetWindow || targetWindow.isDestroyed()) {
        return { ok: false, error: 'Window not found' };
      }
      const nextBounds = {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.max(1, Math.round(bounds.width)),
        height: Math.max(1, Math.round(bounds.height))
      };
      targetWindow.setBounds(nextBounds);
      return { ok: true, bounds: targetWindow.getBounds() };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  // ---------------- Sprite Bubble Window IPC --------------------
  // 调整气泡独立窗口的尺寸，并触发对应的跟随定位刷新。
  ipcMain.removeHandler('sprite:bubble:resize');
  ipcMain.handle('sprite:bubble:resize', (event, payload: { width: number; height: number }) => {
    try {
      const target = resolveSpriteBubbleEventTarget(event);
      if (!target || target.window.isDestroyed()) {
        return { ok: false, error: 'spriteBubbleFixedTop window not available' };
      }
      const bubble = target.window;
      const width = clampWindowDimension(payload?.width, SPRITE_BUBBLE_MIN_WIDTH, SPRITE_BUBBLE_MAX_WIDTH);
      const height = clampWindowDimension(payload?.height, SPRITE_BUBBLE_MIN_HEIGHT, SPRITE_BUBBLE_MAX_HEIGHT);
      bubble.setSize(width, height, false);
      updateSpriteBubblePosition();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  ipcMain.removeHandler('sprite:bubble:set-visible');
  ipcMain.handle('sprite:bubble:set-visible', async (event, payload: { visible: boolean }) => {
    try {
      const target = resolveSpriteBubbleEventTarget(event);
      if (!target) {
        return { ok: false, error: 'spriteBubbleFixedTop window not available' };
      }
      if (payload?.visible) {
        await windowManager.show(target.key);
      } else {
        await windowManager.hide(target.key);
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  // Pre-create menu window in hidden state for faster first-open
  // This reduces the loading delay when user right-clicks for the first time
  windowManager.create('menu');
  // 预创建固定在主窗口上方的气泡窗口；需要时由渲染进程调 sprite:bubble:set-visible 显示。
  windowManager.create('spriteBubbleFixedTop');

  function resolveSpriteBubbleEventTarget(event: IpcMainInvokeEvent): { key: SpriteBubbleWindowKey; window: BrowserWindow } | null {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (senderWindow && !senderWindow.isDestroyed()) {
      const senderKey = getSpriteBubbleWindowKey(senderWindow);
      if (senderKey) return { key: senderKey, window: senderWindow };
    }

    const fallback = windowManager.get('spriteBubbleFixedTop');
    return fallback && !fallback.isDestroyed() ? { key: 'spriteBubbleFixedTop', window: fallback } : null;
  }

  function getSpriteBubbleWindowKey(targetWindow: BrowserWindow): SpriteBubbleWindowKey | null {
    for (const key of SPRITE_BUBBLE_WINDOW_KEYS) {
      const candidate = windowManager.get(key);
      if (candidate && !candidate.isDestroyed() && candidate.id === targetWindow.id) {
        return key;
      }
    }
    return null;
  }

  function updateSpriteBubblePosition(): void {
    try {
      windowManager.updateFollowerPositionsManually();
    } catch {
      /* ignore */
    }
  }
}
