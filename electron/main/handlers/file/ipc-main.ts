import * as fs from 'node:fs';
import * as path from 'node:path';

import { dialog, ipcMain, shell } from 'electron';

// shell.openPath 在 macOS 上 open 一个 .app 即启动该程序，带执行位的文件也会被运行。
// 渲染端调用点（角色包目录 / 插件目录 / 下载目录）均为打开文件夹，且插件目录允许用户自定义到
// 任意位置，因此不做 userData 白名单，改为拒绝可执行目标：
// - 任何 .app 包（含包内路径）
// - 可执行/脚本扩展名
// - 带执行位的普通文件（无扩展名的 Mach-O、脚本等）
const EXECUTABLE_EXTENSIONS = new Set(['.exe', '.bat', '.cmd', '.com', '.scr', '.msi', '.ps1', '.sh', '.command', '.workflow', '.action']);

function getOpenPathBlockReason(resolvedPath: string): string | null {
  if (resolvedPath.split(path.sep).some((segment) => segment.toLowerCase().endsWith('.app'))) {
    return 'APP_BUNDLE_NOT_ALLOWED';
  }
  if (EXECUTABLE_EXTENSIONS.has(path.extname(resolvedPath).toLowerCase())) {
    return 'EXECUTABLE_NOT_ALLOWED';
  }
  try {
    const stat = fs.statSync(resolvedPath);
    if (!stat.isDirectory() && (stat.mode & 0o111) !== 0) {
      return 'EXECUTABLE_NOT_ALLOWED';
    }
  } catch {
    // 路径不存在时交给 openPath 自身报错
  }
  return null;
}

// Generic file/directory selection handlers
export function initFileHandlers(_win: Electron.BrowserWindow): void {
  // reference to avoid unused parameter lint
  void _win;
  ipcMain.handle('file:pick-dir', async (_event, options?: { allowCreate?: boolean; defaultPath?: string }) => {
    const properties: Array<'openDirectory' | 'createDirectory'> = ['openDirectory'];
    if (options?.allowCreate) properties.push('createDirectory');
    const result = await dialog.showOpenDialog({ properties, defaultPath: options?.defaultPath });
    if (result.canceled || result.filePaths.length === 0) return { ok: false };
    return { ok: true, path: result.filePaths[0] };
  });

  ipcMain.handle('file:pick-file', async (_event, options?: { filters?: { name: string; extensions: string[] }[]; defaultPath?: string; multi?: boolean }) => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', ...(options?.multi ? (['multiSelections'] as const) : [])],
      filters: options?.filters,
      defaultPath: options?.defaultPath
    });
    if (result.canceled || result.filePaths.length === 0) return { ok: false };
    return { ok: true, paths: result.filePaths, path: result.filePaths[0] };
  });

  // 保存文件对话框：选择输出文件夹和文件名
  ipcMain.handle(
    'file:save-file',
    async (
      _event,
      options?: {
        filters?: { name: string; extensions: string[] }[];
        defaultPath?: string;
        title?: string;
        nameFieldLabel?: string;
        showsTagField?: boolean;
      }
    ) => {
      const result = await dialog.showSaveDialog({
        title: options?.title,
        defaultPath: options?.defaultPath,
        filters: options?.filters,
        nameFieldLabel: options?.nameFieldLabel,
        showsTagField: options?.showsTagField
      });
      if (result.canceled || !result.filePath) return { ok: false };
      return { ok: true, path: result.filePath };
    }
  );

  // 打开/显示系统中的路径（文件或目录）
  ipcMain.handle('file:open-path', async (_event, targetPath: string) => {
    if (!targetPath || typeof targetPath !== 'string') return { ok: false, error: 'EMPTY_PATH' };
    const blockReason = getOpenPathBlockReason(path.resolve(targetPath));
    if (blockReason) return { ok: false, error: blockReason };
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

  // 在文件管理器中显示文件（选中文件）
  ipcMain.handle('file:reveal', async (_event, targetPath: string) => {
    if (!targetPath) return { ok: false, error: 'EMPTY_PATH' };
    try {
      shell.showItemInFolder(targetPath);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e) };
    }
  });
}
