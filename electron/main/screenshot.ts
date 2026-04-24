import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { windowManager } from '@aim-packages/window-manager';
import dayjs from 'dayjs';
import { BrowserWindow, desktopCapturer, dialog, ipcMain, screen, shell, systemPreferences } from 'electron';

import pkg from '../../package.json';
import { eventManager } from '../../packages/event';
import { AppEvent } from '../../packages/event/events';
import { assertSpriteCapabilityUnlocked } from '../../packages/sprite-core/capability-runtime';
import { FoldersRepo, ResourcesRepo, WorkspacesRepo } from './db/repositories';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class ScreenshotManager {
  private windows: BrowserWindow[] = [];

  constructor() {
    //
  }

  registerIpc(): void {
    ipcMain.handle('screenshot:start', () => this.start());
    ipcMain.handle('screenshot:save', (_, { dataURL }) => this.save(dataURL));
    ipcMain.handle('screenshot:close', () => this.close());
    ipcMain.handle('screenshot:reset-other-selections', (event) => this.resetOtherSelections(event.sender));
    ipcMain.handle('screenshot:ready', (event) => this.showWindow(event.sender));
  }

  showWindow(senderWebContents: Electron.WebContents): void {
    const win = BrowserWindow.fromWebContents(senderWebContents);
    if (win) {
      win.show();
      win.setAlwaysOnTop(true, 'screen-saver');
      win.focus();
    }
  }

  resetOtherSelections(senderWebContents: Electron.WebContents): void {
    const senderWindow = BrowserWindow.fromWebContents(senderWebContents);
    if (!senderWindow) return;

    this.windows.forEach((win) => {
      if (win !== senderWindow) {
        win.webContents.send('screenshot:reset-selection');
      }
    });
  }

  async start(): Promise<void> {
    assertSpriteCapabilityUnlocked('screenshot');

    if (this.windows.length > 0) {
      this.windows.forEach((w) => w.focus());
      return;
    }

    const displays = screen.getAllDisplays();

    // Check permissions on macOS
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('screen');
      console.log('[screenshot] Screen recording permission status:', status);

      if (status === 'denied') {
        dialog
          .showMessageBox({
            type: 'warning',
            title: 'Screen Recording Permission Denied',
            message: `${pkg.name} needs screen recording permission to take screenshots.`,
            detail: 'Please enable it in System Settings > Privacy & Security > Screen Recording.',
            buttons: ['Open Settings', 'Cancel'],
            defaultId: 0
          })
          .then(({ response }) => {
            if (response === 0) {
              shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
            }
          });
        return;
      }
    }

    // Get source IDs for all screens (we only need the IDs, not thumbnails).
    // The renderer will use getUserMedia with chromeMediaSourceId to capture
    // at native physical resolution, which avoids macOS DPI scaling issues
    // with desktopCapturer thumbnails on mixed-DPI multi-monitor setups.
    let sources: Electron.DesktopCapturerSource[] = [];
    try {
      sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1, height: 1 } // We don't need thumbnails
      });
    } catch (e) {
      console.error('Failed to capture screens:', e);

      if (process.platform === 'darwin') {
        dialog
          .showMessageBox({
            type: 'warning',
            title: 'Screen Recording Failed',
            message: 'Failed to capture screen. Please check permissions.',
            detail: `Please ensure ${pkg.name} has Screen Recording permission in System Settings.`,
            buttons: ['Open Settings', 'Cancel'],
            defaultId: 0
          })
          .then(({ response }) => {
            if (response === 0) {
              shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture');
            }
          });
      }
      return;
    }

    for (const display of displays) {
      const window = new BrowserWindow({
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
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

      this.windows.push(window);

      const pageUrl = process.env.VITE_DEV_SERVER_URL ? `${process.env.VITE_DEV_SERVER_URL}#/screenshot` : `file://${path.join(__dirname, '../../dist/index.html')}#/screenshot`;

      window.loadURL(pageUrl).then(() => {
        // Don't show the window yet — the renderer will capture the screen first
        // using getUserMedia, then call screenshot:ready to show the window.
        // This ensures the screenshot doesn't include the overlay window itself.

        // Find the source for this display
        const source =
          sources.find((s) => s.display_id === display.id.toString()) ||
          // Fallback logic if display_id doesn't match directly (common on some OSs)
          sources.find((s) => s.name === display.label) ||
          sources[0]; // Worst case fallback

        if (source) {
          // Send source ID + display info so the renderer can capture at native resolution
          window.webContents.send('screenshot:capture-source', {
            sourceId: source.id,
            scaleFactor: display.scaleFactor,
            width: display.size.width,
            height: display.size.height
          });
        }
      });

      window.on('closed', () => {
        const index = this.windows.indexOf(window);
        if (index > -1) {
          this.windows.splice(index, 1);
        }
      });
    }
  }

  async ensureDailyFolder(workspaceId: string): Promise<string> {
    const today = dayjs().format('YYYY-MM-DD');
    // Check if folder exists in DB
    // 只在“未删除”的顶层文件夹中查找，避免命中回收站里的文件夹
    const siblings = await FoldersRepo.list({ workspaceId, parentId: null, deletedAt: 0 } as any, 2000, 0);
    const existing = siblings.find((s: any) => s.name === today);

    if (existing) {
      return existing.id;
    }

    // Create new folder
    const newFolder = {
      id: randomUUID(),
      name: today,
      parentId: null,
      workspaceId
    };

    await FoldersRepo.create(newFolder);
    eventManager.emit(AppEvent.FOLDER_CREATED, newFolder);
    return newFolder.id;
  }

  async save(dataURL: string): Promise<string> {
    try {
      assertSpriteCapabilityUnlocked('screenshot');

      const base64Data = dataURL.replace(/^data:image\/png;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      // Get default workspace
      const ws = await WorkspacesRepo.getDefault();
      if (!ws) {
        // 如果没有默认工作空间，直接打开工作空间向导窗口
        try {
          await windowManager.createOrShow('workspaceWizard' as any);
        } catch (e) {
          console.warn('[screenshot] failed to open workspace wizard', e);
        }
        // 不再落盘，返回空字符串给调用方
        return '';
      }

      const folderId = await this.ensureDailyFolder(ws.id);
      const baseDir = path.join(ws.rootPath, 'resources', 'folders', folderId);

      if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir, { recursive: true });
      }

      const filename = `screenshot-${dayjs().format('HH-mm-ss')}.png`;
      const filePath = path.join(baseDir, filename);

      fs.writeFileSync(filePath, buffer);

      // Create Resource
      const now = Date.now();
      const resource = {
        id: randomUUID(),
        title: filename,
        filePath: filePath,
        sizeBytes: buffer.length,
        type: 'image',
        workspaceId: ws.id,
        folderId: folderId,
        createdAt: now,
        updatedAt: now,
        collectedAt: now,
        status: 'processed'
      };

      await ResourcesRepo.upsert(resource as any);
      eventManager.emit(AppEvent.RESOURCE_CREATED, resource);

      return filePath;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Sprite capability locked:')) {
        throw error;
      }
      console.error('Failed to save screenshot:', error);
      throw error;
    } finally {
      this.close();
    }
  }

  close(): void {
    this.windows.forEach((w) => w.close());
    this.windows = [];
  }
}

export const screenshotManager = new ScreenshotManager();

export function initScreenshotHandlers(): void {
  screenshotManager.registerIpc();
}
