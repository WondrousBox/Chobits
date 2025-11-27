import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { dialog, ipcMain, shell } from 'electron';

// Generic file/directory selection handlers
export function initFileHandlers(_win: Electron.BrowserWindow): void {
  // reference to avoid unused parameter lint
  void _win;
  ipcMain.handle('file:pickDir', async (_e, opts?: { allowCreate?: boolean; defaultPath?: string }) => {
    const properties: Array<'openDirectory' | 'createDirectory'> = ['openDirectory'];
    if (opts?.allowCreate) properties.push('createDirectory');
    const res = await dialog.showOpenDialog({ properties, defaultPath: opts?.defaultPath });
    if (res.canceled || res.filePaths.length === 0) return { canceled: true };
    return { canceled: false, path: res.filePaths[0] };
  });

  ipcMain.handle('file:pickFile', async (_e, opts?: { filters?: { name: string; extensions: string[] }[]; defaultPath?: string; multi?: boolean }) => {
    const res = await dialog.showOpenDialog({
      properties: ['openFile', ...(opts?.multi ? (['multiSelections'] as const) : [])],
      filters: opts?.filters,
      defaultPath: opts?.defaultPath
    });
    if (res.canceled || res.filePaths.length === 0) return { canceled: true };
    return { canceled: false, paths: res.filePaths, path: res.filePaths[0] };
  });

  // 混合选择：支持同时选择文件和文件夹，支持多选
  ipcMain.handle('file:pickAny', async (_e, opts?: { defaultPath?: string }) => {
    const res = await dialog.showOpenDialog({
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      defaultPath: opts?.defaultPath
    });
    if (res.canceled || res.filePaths.length === 0) return { canceled: true };

    const paths = await Promise.all(
      res.filePaths.map(async (p) => {
        try {
          const stat = await fs.stat(p);
          return {
            path: p,
            name: path.basename(p),
            isDirectory: stat.isDirectory()
          };
        } catch {
          return null;
        }
      })
    );

    return { canceled: false, paths: paths.filter(Boolean) };
  });

  // 保存文件对话框：选择输出文件夹和文件名
  ipcMain.handle(
    'file:saveFile',
    async (
      _e,
      opts?: {
        filters?: { name: string; extensions: string[] }[];
        defaultPath?: string;
        title?: string;
        nameFieldLabel?: string;
        showsTagField?: boolean;
      }
    ) => {
      const res = await dialog.showSaveDialog({
        title: opts?.title,
        defaultPath: opts?.defaultPath,
        filters: opts?.filters,
        nameFieldLabel: opts?.nameFieldLabel,
        showsTagField: opts?.showsTagField
      });
      if (res.canceled || !res.filePath) return { canceled: true };
      return { canceled: false, path: res.filePath };
    }
  );

  // 打开/显示系统中的路径（文件或目录）
  ipcMain.handle('file:openPath', async (_e, targetPath: string) => {
    if (!targetPath) return { ok: false, error: 'EMPTY_PATH' };
    try {
      // 优先尝试直接打开目录；openPath 返回空字符串表示成功
      const result = await shell.openPath(targetPath);
      if (result === '') return { ok: true };
      // 如果 openPath 有消息（可能失败），尝试使用 showItemInFolder 作为回退
      try {
        shell.showItemInFolder(targetPath);
        return { ok: true };
      } catch {
        /* noop */
      }
      return { ok: false, error: result };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e) };
    }
  });

  // 读取文件内容（用于文本类资源预览）
  ipcMain.handle('file:readContent', async (_e, filePath: string, maxBytes?: number) => {
    console.log(filePath);

    if (!filePath) return { success: false, error: 'EMPTY_PATH' };

    try {
      // 检查文件是否存在
      const stats = await fs.stat(filePath);
      if (!stats.isFile()) {
        return { success: false, error: 'NOT_A_FILE' };
      }

      // 检查文件大小，如果超过限制则截取
      const maxSize = maxBytes || 20000; // 默认限制 20KB
      if (stats.size > maxSize) {
        // 读取文件的前 maxSize 字节
        const buffer = Buffer.alloc(maxSize);
        const fd = await fs.open(filePath, 'r');
        await fd.read(buffer, 0, maxSize, 0);
        await fd.close();
        return {
          success: true,
          content: buffer.toString('utf8'),
          truncated: true,
          originalSize: stats.size
        };
      } else {
        // 读取完整文件
        const content = await fs.readFile(filePath, 'utf8');
        return {
          success: true,
          content,
          truncated: false,
          originalSize: stats.size
        };
      }
    } catch (e: any) {
      return { success: false, error: String(e?.message || e) };
    }
  });

  // 递归读取文件夹内容
  ipcMain.handle('file:readDirRecursive', async (_e, dirPath: string) => {
    if (!dirPath) return { success: false, error: 'EMPTY_PATH' };
    try {
      const entries: Array<{ name: string; path: string; isDirectory: boolean; relativePath: string }> = [];

      async function traverse(currentPath: string, relativeBase: string): Promise<void> {
        const dirents = await fs.readdir(currentPath, { withFileTypes: true });
        for (const dirent of dirents) {
          const fullPath = path.join(currentPath, dirent.name);
          const relPath = path.join(relativeBase, dirent.name);
          if (dirent.isDirectory()) {
            entries.push({ name: dirent.name, path: fullPath, isDirectory: true, relativePath: relPath });
            await traverse(fullPath, relPath);
          } else {
            entries.push({ name: dirent.name, path: fullPath, isDirectory: false, relativePath: relPath });
          }
        }
      }

      await traverse(dirPath, '');
      return { success: true, data: entries };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });
}
