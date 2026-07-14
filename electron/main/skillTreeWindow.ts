import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { BrowserWindow, ipcMain, screen } from 'electron';

import { Env } from './utils';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class SkillTreeManager {
  private window: BrowserWindow | null = null;

  constructor() {
    //
  }

  registerIpc(): void {
    ipcMain.handle('skillTree:open', () => this.open());
    ipcMain.handle('skillTree:close', () => this.close());
  }

  async open(): Promise<void> {
    if (this.window && !this.window.isDestroyed()) {
      this.window.focus();
      return;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.bounds;

    this.window = new BrowserWindow({
      width,
      height,
      x: 0,
      y: 0,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      enableLargerThanScreen: true,
      hasShadow: false,
      show: false,
      fullscreen: process.platform !== 'darwin',
      simpleFullscreen: process.platform === 'darwin',
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: true,
        preload: path.join(__dirname, '../preload/index.mjs')
      }
    });

    const pageUrl = process.env.VITE_DEV_SERVER_URL ? `${process.env.VITE_DEV_SERVER_URL}#/skill-tree` : `file://${path.join(__dirname, '../../dist/index.html')}#/skill-tree`;

    this.window.loadURL(pageUrl).then(() => {
      this.window?.show();
      this.window?.setAlwaysOnTop(true, 'screen-saver');
      this.window?.focus();
      if (Env.isDev()) {
        this.window?.webContents.openDevTools({ mode: 'detach' });
      }
    });

    this.window.on('closed', () => {
      this.window = null;
    });
  }

  close(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.close();
    }
    this.window = null;
  }
}

export const skillTreeManager = new SkillTreeManager();

export function initSkillTreeHandlers(): void {
  skillTreeManager.registerIpc();
}
