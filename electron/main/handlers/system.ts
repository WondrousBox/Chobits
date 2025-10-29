import { app, ipcMain, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { Env, getRealPath } from '../utils';

/**
 * System-level handlers: database paths/open and logs paths/open.
 * Central place to extend for other common system actions later.
 */
export function initSystemHandlers(): void {
  // ---------------- Database ----------------
  ipcMain.handle('database:getPath', async () => {
    try {
      const userDir = app.getPath('userData');
      const dbDir = path.join(userDir, 'data');
      const dbPath = path.join(dbDir, Env.isDev() ? 'app-dev.db' : 'app.db');
      return { ok: true, path: dbPath, dir: dbDir } as const;
    } catch (error) {
      return { ok: false, error: String(error) } as const;
    }
  });

  ipcMain.handle('database:openLocation', async () => {
    try {
      const userDir = app.getPath('userData');
      const dbDir = path.join(userDir, 'data');

      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      const result = await shell.openPath(dbDir);
      if (result === '') return { ok: true } as const;

      try {
        shell.showItemInFolder(dbDir);
        return { ok: true } as const;
      } catch {
        return { ok: false, error: result } as const;
      }
    } catch (error) {
      return { ok: false, error: String(error) } as const;
    }
  });

  // ---------------- Logs ----------------
  ipcMain.handle('logs:getPath', async () => {
    try {
      const logDir = getRealPath('../../logs/', './logs/');
      return { ok: true, dir: logDir } as const;
    } catch (error) {
      return { ok: false, error: String(error) } as const;
    }
  });

  ipcMain.handle('logs:openLocation', async () => {
    try {
      const logDir = getRealPath('../../logs/', './logs/');

      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const result = await shell.openPath(path.resolve(logDir));
      if (result === '') return { ok: true } as const;

      try {
        shell.showItemInFolder(path.resolve(logDir));
        return { ok: true } as const;
      } catch {
        return { ok: false, error: result } as const;
      }
    } catch (error) {
      return { ok: false, error: String(error) } as const;
    }
  });
}
