import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { WorkspacesRepo } from '@packages/common/db/repositories';
import { Env, getResourcePath } from '@packages/common/utils';
import { app, BrowserWindow, ipcMain, shell } from 'electron';

import { eventManager } from '../../packages/event';
import { AppEvent } from '../../packages/event/events';
import { initHandlers } from './handlers';
import { logger } from './logger';
import { addAllowedResourceRoot, addWorkspaceResourceRoot, setupResourceProtocol } from './resource-protocol';
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from './shortcuts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.mjs   > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//
process.env.APP_ROOT = path.join(__dirname, '../..');

export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
export const DOCKER_ICON = 'icon.png';

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;

// Disable GPU Acceleration for Windows 7
if (os.release().startsWith('6.1')) app.disableHardwareAcceleration();

// Set application name for Windows 10+ notifications
if (process.platform === 'win32') app.setAppUserModelId(app.getName());

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let win: BrowserWindow | null = null;
let splashWin: BrowserWindow | null = null;
const preload = path.join(__dirname, '../preload/index.mjs');
const indexHtml = path.join(RENDERER_DIST, 'index.html');

// 获取主窗口的函数
export function getMainWindow(): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null;
}

// splash 不再展示状态/日志文字，仅保留终端日志
function updateSplashLog(text: string): void {
  console.log('>> ' + text);
}

function createSplashWindow(): Promise<void> {
  return new Promise((resolve) => {
    const htmlDir = getResourcePath('html');
    const splashHtml = path.join(htmlDir!, 'splash.html');

    splashWin = new BrowserWindow({
      width: 480,
      height: 480,
      frame: false,
      resizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      center: true,
      show: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    splashWin.loadFile(splashHtml);
    splashWin.once('ready-to-show', () => {
      if (splashWin && !splashWin.isDestroyed()) {
        splashWin.show();
      }
      resolve();
    });
  });
}

function closeSplashWindow(): void {
  if (splashWin && !splashWin.isDestroyed()) {
    splashWin.close();
  }
  splashWin = null;
}

async function createWindow(): Promise<void> {
  win = new BrowserWindow({
    title: 'Main window',
    icon: path.join(process.env.VITE_PUBLIC, 'favicon.ico'),
    // 窗口大小由渲染进程通过 IPC 设置，这里只设置一个很小的默认值
    width: 1,
    height: 1,
    frame: false, // frameless for a floating assistant
    transparent: true, // transparent background
    backgroundColor: '#00000000',
    alwaysOnTop: true, // stay on top
    resizable: false, // fixed size to preserve padding
    skipTaskbar: true, // do not show in taskbar
    hasShadow: false,
    show: false, // 延迟显示，等待 ready-to-show 以防白屏闪烁
    webPreferences: {
      preload,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      nodeIntegration: true,
      contextIsolation: true,
      spellcheck: true
    }
  });
  (win as any).__preloadPath = preload;

  // 设置 Mac 平台 Docker 上的图标
  if (process.platform === 'darwin') {
    app.dock?.setIcon(path.join(process.env.VITE_PUBLIC, DOCKER_ICON));
    // win.setVibrancy('under-window')
  }

  if (VITE_DEV_SERVER_URL) {
    // #298
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(indexHtml);
  }

  // 主窗口显示由 splash 流程控制，不在此自动 show
  win.once('ready-to-show', () => {
    if (Env.isDev()) {
      win?.webContents.openDevTools({ mode: 'detach', activate: true });
    }
  });

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url);
    return { action: 'deny' };
  });

  updateSplashLog('initializing IPC handlers');
  await initHandlers(win);
  updateSplashLog('IPC handlers registered');

  // https://github.com/electron/electron/issues/7049
  // https://www.electronjs.org/docs/latest/breaking-changes#removed-crashed-event-on-webcontents-and-webview
  win.webContents.on('render-process-gone', (event, details) => {
    logger.log.error('webContents: render-process-gone', details);
    win?.destroy();
    createWindow().then(() => {
      if (win && !win.isDestroyed()) win.show();
    });
  });
}

app.whenReady().then(async () => {
  // Show splash window first, wait until it's visible
  const splashStartTime = Date.now();
  await createSplashWindow();

  // Setup custom resource protocol (modern protocol.handle API)
  updateSplashLog('setup res:// protocol handler');
  try {
    await setupResourceProtocol();
    updateSplashLog('res:// protocol ready');
  } catch (e) {
    console.warn('[protocol res] setup failed', e);
  }

  // Add workspace root if exists
  updateSplashLog('loading default workspace');
  try {
    const ws = await WorkspacesRepo.getDefault();
    if (ws?.rootPath) {
      const resRoot = path.join(ws.rootPath, 'resources');
      addAllowedResourceRoot(resRoot);
      addWorkspaceResourceRoot(ws.id, resRoot);
      updateSplashLog(`workspace root: ${ws.rootPath}`);
    }
  } catch (e) {
    console.warn('[protocol res] add workspace root failed', e);
  }

  // Add userData/data directory as allowed root for sprite speak cache etc.
  updateSplashLog('registering userData resource root');
  try {
    const userDataDir = path.join(app.getPath('userData'), 'data');
    addAllowedResourceRoot(userDataDir);
  } catch (e) {
    console.warn('[protocol res] add userData root failed', e);
  }

  // Register renderer-ready handler BEFORE creating the window, so the handler
  // is already in place when the renderer loads and calls invoke('app:renderer-ready').
  // Otherwise there's a race: if the renderer mounts React before we reach the
  // handler registration below, the invoke call fails with "No handler registered".
  const rendererReady = new Promise<void>((resolve) => {
    ipcMain.handle('app:renderer-ready', () => {
      resolve();
      // Keep handler registered — in dev mode Vite HMR full-reloads re-run
      // main.tsx which calls invoke again; removing the handler causes
      // "No handler registered" errors on subsequent calls.
      // resolve() on an already-resolved Promise is a harmless no-op.
    });
  });

  updateSplashLog('creating main BrowserWindow');
  await createWindow();
  updateSplashLog('main window created, loading IPC handlers');

  // Register all global shortcuts (assistant toggle, devtools, etc.)
  updateSplashLog('registering global shortcuts');
  registerGlobalShortcuts(getMainWindow);

  // --- Wait for renderer to be fully ready ---
  updateSplashLog('waiting for renderer React mount...');

  // 2) Minimum 2 seconds splash display
  const MIN_SPLASH_MS = 2000;
  const minSplashTime = new Promise<void>((resolve) => {
    const remaining = Math.max(0, MIN_SPLASH_MS - (Date.now() - splashStartTime));
    setTimeout(resolve, remaining);
  });

  // 3) Safety timeout: don't block forever if renderer crashes (15s)
  const safetyTimeout = new Promise<void>((resolve) => setTimeout(resolve, 15000));

  // Wait for (renderer ready OR safety timeout) AND minimum splash time
  await Promise.all([Promise.race([rendererReady, safetyTimeout]), minSplashTime]);

  // All ready — show main window, then close splash
  if (win && !win.isDestroyed()) {
    win.show();
  }
  closeSplashWindow();

  // Emit App Started Event
  eventManager.emit(AppEvent.APP_STARTED);
  eventManager.emit(AppEvent.SPRITE_SYSTEM_READY);
});

process.on('uncaughtException', function (error) {
  console.log('uncaughtException');
  logger.log.error(error);
});

app.on('render-process-gone', (event, webContents, killed) => {
  logger.log.error('App: render-process-gone', event, killed);
});

app.on('window-all-closed', () => {
  // Clean up registered shortcuts when all windows are closed
  unregisterGlobalShortcuts();
  win = null;
  if (process.platform !== 'darwin') app.quit();
});

app.on('second-instance', () => {
  if (win) {
    // Focus on the main window if the user tried to open another
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows();
  if (allWindows.length) {
    allWindows[0].focus();
  } else {
    createWindow().then(() => {
      if (win && !win.isDestroyed()) win.show();
    });
  }
});

app.on('will-quit', async () => {
  eventManager.emit(AppEvent.SPRITE_SYSTEM_QUIT);
  // Ensure shortcuts are fully unregistered on app quit
  unregisterGlobalShortcuts();
});
