import { ipcMain, shell, app } from 'electron';
import path from 'node:path';
import { Env } from '../utils';

export function initDatabaseHandlers(): void {
  // 获取数据库路径
  ipcMain.handle('database:getPath', async () => {
    try {
      const userDir = app.getPath('userData');
      const dbDir = path.join(userDir, 'data');
      const dbPath = path.join(dbDir, Env.isDev() ? 'app-dev.db' : 'app.db');
      return { ok: true, path: dbPath, dir: dbDir };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });

  // 打开数据库所在位置
  ipcMain.handle('database:openLocation', async () => {
    try {
      const userDir = app.getPath('userData');
      const dbDir = path.join(userDir, 'data');

      // 确保目录存在
      const fs = await import('node:fs');
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // 打开数据库目录
      const result = await shell.openPath(dbDir);
      if (result === '') {
        return { ok: true };
      } else {
        // 如果 openPath 失败，尝试使用 showItemInFolder
        try {
          shell.showItemInFolder(dbDir);
          return { ok: true };
        } catch {
          return { ok: false, error: result };
        }
      }
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  });
}
