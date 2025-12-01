import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dayjs from 'dayjs';
import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, screen, shell, systemPreferences } from 'electron';

import { FoldersRepo, ResourcesRepo, WorkspacesRepo } from './db/repositories';
import { eventManager } from './handlers/event-manager';
import { AppEvent } from './handlers/events';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class ScreenshotManager {
  private windows: BrowserWindow[] = [];

  constructor() { }

  registerIpc() {
    ipcMain.handle('screenshot:start', () => this.start());
    ipcMain.handle('screenshot:save', (_, { dataURL }) => this.save(dataURL));
    ipcMain.handle('screenshot:close', () => this.close());
    ipcMain.handle('screenshot:reset-other-selections', (event) => this.resetOtherSelections(event.sender));
  }

  resetOtherSelections(senderWebContents: Electron.WebContents) {
    const senderWindow = BrowserWindow.fromWebContents(senderWebContents);
    if (!senderWindow) return;

    this.windows.forEach((win) => {
      if (win !== senderWindow) {
        win.webContents.send('screenshot:reset-selection');
      }
    });
  }

  async start() {
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
            message: 'Chobits needs screen recording permission to take screenshots.',
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

    // Capture all screens first
    let sources: Electron.DesktopCapturerSource[] = [];
    try {
      // Calculate max size needed
      const maxSize = displays.reduce(
        (acc, display) => {
          return {
            width: Math.max(acc.width, display.size.width * display.scaleFactor),
            height: Math.max(acc.height, display.size.height * display.scaleFactor)
          };
        },
        { width: 0, height: 0 }
      );

      // Get sources for all screens.
      // We need to make sure we get high enough resolution for all.
      sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: maxSize
      });
    } catch (e) {
      console.error('Failed to capture screens:', e);

      if (process.platform === 'darwin') {
        dialog
          .showMessageBox({
            type: 'warning',
            title: 'Screen Recording Failed',
            message: 'Failed to capture screen. Please check permissions.',
            detail: 'Please ensure Chobits has Screen Recording permission in System Settings.',
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
        window.show();
        window.setAlwaysOnTop(true, 'screen-saver');
        window.focus();

        // Find the source for this display
        const source =
          sources.find((s) => s.display_id === display.id.toString()) ||
          // Fallback logic if display_id doesn't match directly (common on some OSs)
          sources.find((s) => s.name === display.label) ||
          sources[0]; // Worst case fallback

        if (source) {
          // Resize thumbnail if needed to match display scale?
          // Actually desktopCapturer returns the thumbnail.
          // If we requested a large size, it should be fine.
          window.webContents.send('screenshot:captured', source.thumbnail.toDataURL());
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
    const siblings = await FoldersRepo.list({ workspaceId, parentId: null } as any, 2000, 0);
    const existing = siblings.find((s: any) => s.name === today);

    if (existing) {
      return existing.id;
    }

    // Create new folder
    const newFolder = {
      id: randomUUID(),
      name: today,
      parentId: null,
      workspaceId,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await FoldersRepo.upsert(newFolder);
    eventManager.emit(AppEvent.FOLDER_CREATED, newFolder);
    return newFolder.id;
  }

  async save(dataURL: string) {
    try {
      const base64Data = dataURL.replace(/^data:image\/png;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');

      // Get default workspace
      const ws = await WorkspacesRepo.getDefault();
      if (!ws) {
        // Fallback if no workspace
        const resourcesPath = path.join(process.env.APP_ROOT || process.cwd(), 'resources/screenshots');
        if (!fs.existsSync(resourcesPath)) {
          fs.mkdirSync(resourcesPath, { recursive: true });
        }
        const filename = `screenshot-${Date.now()}.png`;
        const filePath = path.join(resourcesPath, filename);
        fs.writeFileSync(filePath, buffer);
        return filePath;
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
      console.error('Failed to save screenshot:', error);
      throw error;
    } finally {
      this.close();
    }
  }

  close() {
    this.windows.forEach((w) => w.close());
    this.windows = [];
  }
}

export const screenshotManager = new ScreenshotManager();

export function initScreenshotHandlers() {
  screenshotManager.registerIpc();
}
