import fs from 'node:fs';
import path from 'node:path';

import { backupDatabase, deleteBackup, importBackup, listBackups, restoreBackup } from '@packages/common/db';
import { Env, getResourcePath } from '@packages/common/utils';
import { notifySpriteCapabilityChanged } from '@packages/sprite-core/handler/capability-events';
import { app, ipcMain, shell, systemPreferences } from 'electron';

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

  // ---------------- Database Backup ----------------
  ipcMain.handle('database:backup', async (_event, customPath?: string) => {
    return backupDatabase(customPath);
  });

  ipcMain.handle('database:listBackups', async (_event, customPath?: string) => {
    return listBackups(customPath);
  });

  ipcMain.handle('database:deleteBackup', async (_event, backupPath: string) => {
    return deleteBackup(backupPath);
  });

  ipcMain.handle('database:restoreBackup', async (_event, backupPath: string) => {
    return restoreBackup(backupPath);
  });

  ipcMain.handle('database:importBackup', async (_event, sourcePath: string, options?: { restore?: boolean }) => {
    return importBackup(sourcePath, options);
  });

  // ---------------- App ----------------
  ipcMain.handle('app:relaunch', async () => {
    try {
      // Relaunch the app and exit current instance
      app.relaunch();
      app.exit(0);
      return { ok: true } as const;
    } catch (error) {
      return { ok: false, error: String(error) } as const;
    }
  });

  ipcMain.handle('app:openExternalUrl', async (_event, url: string) => {
    try {
      const target = typeof url === 'string' ? url.trim() : '';
      if (!target) {
        return { ok: false, error: 'URL is required' } as const;
      }

      const parsed = new URL(target);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { ok: false, error: 'Only HTTP(S) URLs can be opened externally' } as const;
      }

      await shell.openExternal(parsed.toString());
      return { ok: true } as const;
    } catch (error) {
      return { ok: false, error: String(error) } as const;
    }
  });

  // ---------------- Logs ----------------
  ipcMain.handle('logs:getPath', async () => {
    try {
      const logDir = getResourcePath('logs');
      return { ok: true, dir: logDir } as const;
    } catch (error) {
      return { ok: false, error: String(error) } as const;
    }
  });

  ipcMain.handle('logs:openLocation', async () => {
    try {
      const logDir = getResourcePath('logs');
      if (!logDir) return { ok: false, error: 'Logs directory not found' } as const;

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

  // ---------------- 麦克风权限 ----------------
  // 「麦克风录音」能力的激活信号取自系统授权状态(见 sprite-manager-ipc.ts 的 resolveCapabilityContext);
  // 这里提供状态查询与主动请求授权的入口,授权变化后广播能力变更让设置页刷新
  ipcMain.handle('system:microphone:getStatus', async () => {
    try {
      // Linux 无系统级授权接口,视为已授权
      if (process.platform === 'linux') {
        return { ok: true, status: 'granted' } as const;
      }
      return { ok: true, status: systemPreferences.getMediaAccessStatus('microphone') } as const;
    } catch (error) {
      return { ok: false, error: String(error) } as const;
    }
  });

  ipcMain.handle('system:microphone:requestAccess', async () => {
    try {
      if (process.platform === 'linux') {
        return { ok: true, granted: true } as const;
      }
      if (process.platform === 'darwin') {
        const granted = await systemPreferences.askForMediaAccess('microphone');
        notifySpriteCapabilityChanged({ source: 'microphone-access' });
        return { ok: true, granted } as const;
      }
      // Windows 无运行时请求接口,授权在系统设置里管理,这里只回报当前状态
      const granted = systemPreferences.getMediaAccessStatus('microphone') === 'granted';
      notifySpriteCapabilityChanged({ source: 'microphone-access' });
      return { ok: true, granted } as const;
    } catch (error) {
      return { ok: false, error: String(error) } as const;
    }
  });
}
