import path from 'node:path';

import { initIpcMain, windowManager } from '@aim-packages/window-manager';
import type { IpcMainInvokeEvent } from 'electron';
import { BrowserWindow, ipcMain } from 'electron';
import { app, screen } from 'electron';

import defaultWindowConfigs from '../config/window';
import { globalInputMonitor } from '../global-input-monitor';
import { attachAppWindowClosedReporter, emitAppWindowOpened, rememberWindowPayload } from './window-events';
import { emitWorkspaceWizardClosedIfStillEmpty } from './workspace/ipc-main';

const SPRITE_BUBBLE_WINDOW_KEYS = ['spriteBubbleFixedTop'] as const;
type SpriteBubbleWindowKey = (typeof SPRITE_BUBBLE_WINDOW_KEYS)[number];
const SPRITE_BUBBLE_MIN_WIDTH = 40;
const SPRITE_BUBBLE_MIN_HEIGHT = 24;
const SPRITE_BUBBLE_MAX_WIDTH = 504;
const SPRITE_BUBBLE_MAX_HEIGHT = 392;
const SPRITE_EFFECT_WINDOW_KEY = 'spriteEffect' as const;
type AssistantInteractiveRegion = { x: number; y: number; width: number; height: number };
const WORKSPACE_WIZARD_WINDOW_KEY = 'workspaceWizard';
const ACHIEVEMENT_UNLOCK_WINDOW_KEY = 'achievementUnlock';
const ACHIEVEMENT_UNLOCK_WINDOW_WIDTH = 420;
const ACHIEVEMENT_UNLOCK_WINDOW_HEIGHT = 128;
const ACHIEVEMENT_UNLOCK_WINDOW_MARGIN = 20;

function clampWindowDimension(value: number | undefined, min: number, max: number): number {
  const numericValue = Number(value ?? 0);
  const rounded = Number.isFinite(numericValue) ? Math.round(numericValue) : 0;
  return Math.min(max, Math.max(min, rounded));
}

function normalizeInteractiveRegion(region: Partial<AssistantInteractiveRegion> | null | undefined): AssistantInteractiveRegion | null {
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

function positionAchievementUnlockWindow(targetWindow: BrowserWindow, referenceWindow: BrowserWindow | null): void {
  try {
    const display = referenceWindow && !referenceWindow.isDestroyed() ? screen.getDisplayMatching(referenceWindow.getBounds()) : screen.getPrimaryDisplay();
    const workArea = display.workArea;
    targetWindow.setBounds({
      x: Math.round(workArea.x + workArea.width - ACHIEVEMENT_UNLOCK_WINDOW_WIDTH - ACHIEVEMENT_UNLOCK_WINDOW_MARGIN),
      y: Math.round(workArea.y + ACHIEVEMENT_UNLOCK_WINDOW_MARGIN),
      width: ACHIEVEMENT_UNLOCK_WINDOW_WIDTH,
      height: ACHIEVEMENT_UNLOCK_WINDOW_HEIGHT
    });
  } catch (error) {
    console.warn('[window] failed to position achievement unlock window:', error);
  }
}

export function initWindowHandlers(win: BrowserWindow): void {
  // 记录助手窗口的 padding（由渲染进程通过 IPC 动态设置）
  let assistantPadding = 100; // 默认值，等待渲染进程通过 setAssistantSize 设置
  let assistantPaddingInitialized = false;

  // ---------------- Hover monitor to manage click-through ---------------
  // 在透明窗口上，为了让外部（Finder）拖拽能进入助手区域，我们需要在鼠标进入助手内层矩形时
  // 自动关闭 ignoreMouseEvents（否则不会收到 dragenter/over 事件）。
  // 优先使用全局系统级鼠标事件钩子（uiohook-napi），不可用时回退到低频轮询。
  // 记录助手窗口的实际尺寸（由渲染进程通过 IPC 设置）。
  // 初始值为 0，等待渲染进程通过 setAssistantSize 设置。
  let assistantWidth = 0;
  let assistantHeight = 0;
  let assistantInteractiveRegions: AssistantInteractiveRegion[] = [];

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

  let lastInside = true;
  function pointInside(x: number, y: number): boolean {
    if (assistantWidth > 0 && assistantHeight > 0) {
      const padding = assistantPadding ?? 0;
      const ax = cachedBounds.x + padding;
      const ay = cachedBounds.y + padding;
      const aw = assistantWidth;
      const ah = assistantHeight;
      if (x >= ax && x <= ax + aw && y >= ay && y <= ay + ah) {
        return true;
      }
    }

    return assistantInteractiveRegions.some((region) => {
      const rx = cachedBounds.x + region.x;
      const ry = cachedBounds.y + region.y;
      return x >= rx && x <= rx + region.width && y >= ry && y <= ry + region.height;
    });
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
  let unsubscribeMouseMove: (() => void) | null = null;
  let hookActive = false;
  let hoverMonitorActive = false;
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
        applyInsideState(pointInside(e.x, e.y));
      });
      hookActive = true;
    } catch {
      // 模块不可用或启动失败，回退轮询
      hookActive = false;
      startPolling();
    }
  }
  function stopHook(): void {
    if (hookActive && unsubscribeMouseMove) {
      try {
        unsubscribeMouseMove();
      } catch {
        /* ignore */
      }
    }
    unsubscribeMouseMove = null;
    hookActive = false;
  }

  function restoreMouseEvents(): void {
    lastInside = true;
    try {
      win.setIgnoreMouseEvents(false, { forward: true });
    } catch {
      /* ignore */
    }
  }

  function shouldRunHoverMonitor(): boolean {
    return assistantPaddingInitialized && assistantWidth > 0 && assistantHeight > 0;
  }

  function startHoverMonitor(): void {
    if (!shouldRunHoverMonitor() || hoverMonitorActive) return;
    hoverMonitorActive = true;
    try {
      startHook();
      if (!hookActive) startPolling();
    } catch {
      startPolling();
    }
    pollOnce();
  }
  function stopHoverMonitor(options?: { restoreMouseEvents?: boolean }): void {
    stopHook();
    stopPolling();
    hoverMonitorActive = false;
    if (options?.restoreMouseEvents) {
      restoreMouseEvents();
    }
  }

  function syncHoverMonitor(): void {
    if (shouldRunHoverMonitor()) {
      startHoverMonitor();
      if (hoverMonitorActive) {
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
      syncHoverMonitor();
    }
  });

  const attachWorkspaceWizardClosedReporter = (workspaceWindow: BrowserWindow | null): void => {
    if (!workspaceWindow || workspaceWindow.isDestroyed()) return;
    if ((workspaceWindow as any).__workspaceWizardClosedReporterAttached) return;
    (workspaceWindow as any).__workspaceWizardClosedReporterAttached = true;
    const sourceWindowId = workspaceWindow.webContents.id;
    workspaceWindow.once('closed', () => {
      void emitWorkspaceWizardClosedIfStillEmpty('window-closed', sourceWindowId);
    });
  };

  // ---------------- Assistant Size IPC --------------------
  // 渲染进程通过此接口设置窗口大小和 padding
  ipcMain.handle('setAssistantSize', (_: IpcMainInvokeEvent, params: { width: number; height: number; padding: number }) => {
    try {
      if (!win || win.isDestroyed()) return { success: false };

      // 更新记录的尺寸（这些值用于鼠标移动效果和窗口贴边等计算）
      assistantWidth = params.width;
      assistantHeight = params.height;
      assistantPaddingInitialized = true;

      // 计算窗口总大小（助手尺寸 + padding * 2）
      const winWidth = params.width + params.padding * 2;
      const winHeight = params.height + params.padding * 2;

      // 设置窗口大小
      win.setSize(winWidth, winHeight, false);

      // 更新窗口管理器的 anchor 尺寸（无论 padding 是否改变都要更新）
      try {
        if (typeof windowManager.setAnchorWidth === 'function') {
          windowManager.setAnchorWidth(assistantWidth);
        }
        if (typeof windowManager.setAnchorHeight === 'function') {
          windowManager.setAnchorHeight(assistantHeight);
        }
      } catch (error) {
        console.warn('Failed to update windowManager anchor size:', error);
      }

      // 更新 padding（如果不同）
      if (assistantPadding !== params.padding) {
        const oldPadding = assistantPadding;
        assistantPadding = params.padding;
        // 更新窗口管理器的 padding（这个方法可能会调整窗口位置，但不会改变大小，因为我们已经设置了）
        windowManager.adjustMainWindowForPadding(oldPadding, params.padding);
      }
      if (params.padding <= 0) {
        assistantInteractiveRegions = [];
      }

      // 刷新缓存边界
      refreshBounds();
      syncHoverMonitor();

      return { success: true };
    } catch (error) {
      console.error('Failed to set assistant size:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('setAssistantInteractiveRegions', (_: IpcMainInvokeEvent, params: { regions?: Array<Partial<AssistantInteractiveRegion>> }) => {
    try {
      assistantInteractiveRegions = (params?.regions ?? []).map(normalizeInteractiveRegion).filter((region): region is AssistantInteractiveRegion => Boolean(region));
      syncHoverMonitor();
      return { success: true };
    } catch (error) {
      console.error('Failed to set assistant interactive regions:', error);
      return { success: false, error: String(error) };
    }
  });

  initIpcMain(win);
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
        if (String(windowKey) === ACHIEVEMENT_UNLOCK_WINDOW_KEY) {
          opened = await windowManager.createOrShow(windowKey, payload, {
            beforeShow: (targetWindow) => positionAchievementUnlockWindow(targetWindow, opener)
          });
        } else if (options?.sameDisplayAsSender && opener && !opener.isDestroyed()) {
          const display = screen.getDisplayMatching(opener.getBounds());
          opened = await windowManager.createOrShowOnDisplay(windowKey, display, payload);
        }
      } catch (error) {
        console.warn('[window:open] failed to align new window to sender display', error);
      }

      opened = opened ?? (await windowManager.createOrShow(windowKey, payload));
      attachAppWindowClosedReporter(opened, String(windowKey), 'renderer-window-open');
      if (windowKey === WORKSPACE_WIZARD_WINDOW_KEY) {
        attachWorkspaceWizardClosedReporter(opened);
      }
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
        return { success: false, error: 'Window not found' };
      }
      const nextBounds = {
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.max(1, Math.round(bounds.width)),
        height: Math.max(1, Math.round(bounds.height))
      };
      targetWindow.setBounds(nextBounds);
      return { success: true, bounds: targetWindow.getBounds() };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // ---------------- Sprite Bubble Window IPC --------------------
  // 调整气泡独立窗口的尺寸，并触发对应的跟随定位刷新。
  ipcMain.removeHandler('sprite:bubble:resize');
  ipcMain.handle('sprite:bubble:resize', (event, payload: { width: number; height: number }) => {
    try {
      const target = resolveSpriteBubbleEventTarget(event);
      if (!target || target.window.isDestroyed()) {
        return { success: false, error: 'spriteBubbleFixedTop window not available' };
      }
      const bubble = target.window;
      const width = clampWindowDimension(payload?.width, SPRITE_BUBBLE_MIN_WIDTH, SPRITE_BUBBLE_MAX_WIDTH);
      const height = clampWindowDimension(payload?.height, SPRITE_BUBBLE_MIN_HEIGHT, SPRITE_BUBBLE_MAX_HEIGHT);
      bubble.setSize(width, height, false);
      updateSpriteBubblePosition();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.removeHandler('sprite:bubble:setVisible');
  ipcMain.handle('sprite:bubble:setVisible', async (event, payload: { visible: boolean }) => {
    try {
      const target = resolveSpriteBubbleEventTarget(event);
      if (!target) {
        return { success: false, error: 'spriteBubbleFixedTop window not available' };
      }
      if (payload?.visible) {
        await windowManager.show(target.key);
      } else {
        await windowManager.hide(target.key);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // 调整特效独立窗口的尺寸，并保持其居中跟随主精灵窗口。
  ipcMain.removeHandler('sprite:effect:resize');
  ipcMain.handle('sprite:effect:resize', async (_event, payload: { width: number; height: number }) => {
    try {
      const effectWindow = await ensureSpriteEffectWindow();
      if (!effectWindow || effectWindow.isDestroyed()) {
        return { success: false, error: 'spriteEffect window not available' };
      }
      const width = Math.max(120, Math.round(payload?.width ?? 0));
      const height = Math.max(80, Math.round(payload?.height ?? 0));
      effectWindow.setSize(width, height, false);
      updateSpriteEffectPosition();
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  ipcMain.removeHandler('sprite:effect:setVisible');
  ipcMain.handle('sprite:effect:setVisible', async (_event, payload: { visible: boolean }) => {
    try {
      const effectWindow = payload?.visible ? await ensureSpriteEffectWindow() : resolveSpriteEffectWindow();
      if (!effectWindow) {
        if (!payload?.visible) {
          return { success: true };
        }
        return { success: false, error: 'spriteEffect window not available' };
      }
      configureSpriteEffectWindow(effectWindow);
      if (payload?.visible) {
        configureSpriteEffectWindow(await windowManager.show(SPRITE_EFFECT_WINDOW_KEY));
      } else {
        configureSpriteEffectWindow(await windowManager.hide(SPRITE_EFFECT_WINDOW_KEY));
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  });

  // Pre-create menu window in hidden state for faster first-open
  // This reduces the loading delay when user right-clicks for the first time
  windowManager.create('menu');
  // 预创建固定在主窗口上方的气泡窗口；需要时由渲染进程调 sprite:bubble:setVisible 显示。
  windowManager.create('spriteBubbleFixedTop');
  void windowManager
    .create(SPRITE_EFFECT_WINDOW_KEY)
    .then((effectWindow) => {
      configureSpriteEffectWindow(effectWindow);
    })
    .catch(() => undefined);

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

  function resolveSpriteEffectWindow(): BrowserWindow | null {
    const effectWindow = windowManager.get(SPRITE_EFFECT_WINDOW_KEY);
    return effectWindow && !effectWindow.isDestroyed() ? effectWindow : null;
  }

  async function ensureSpriteEffectWindow(): Promise<BrowserWindow | null> {
    const existing = resolveSpriteEffectWindow();
    if (existing) return existing;
    const created = await windowManager.create(SPRITE_EFFECT_WINDOW_KEY);
    configureSpriteEffectWindow(created);
    return created;
  }

  function configureSpriteEffectWindow(effectWindow: BrowserWindow | null): void {
    if (!effectWindow || effectWindow.isDestroyed()) return;
    try {
      effectWindow.setIgnoreMouseEvents(true, { forward: true });
    } catch {
      /* ignore */
    }
  }

  function updateSpriteEffectPosition(): void {
    try {
      windowManager.updateFollowerPositionsManually();
    } catch {
      /* ignore */
    }
  }
}
