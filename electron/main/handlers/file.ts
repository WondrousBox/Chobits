import { dialog, ipcMain, shell } from 'electron';

// Generic file/directory selection handlers
export function initFileHandlers(win: Electron.BrowserWindow) {
  ipcMain.handle('file:pickDir', async (_e, opts?: { allowCreate?: boolean; defaultPath?: string }) => {
    const properties: Array<'openDirectory' | 'createDirectory'> = ['openDirectory'];
    if (opts?.allowCreate) properties.push('createDirectory');
    const res = await dialog.showOpenDialog({ properties, defaultPath: opts?.defaultPath });
    if (res.canceled || res.filePaths.length === 0) return { canceled: true };
    return { canceled: false, path: res.filePaths[0] };
  });

  ipcMain.handle('file:pickFile', async (_e, opts?: { filters?: { name: string; extensions: string[] }[]; defaultPath?: string; multi?: boolean }) => {
    const res = await dialog.showOpenDialog({
      properties: ['openFile', ...(opts?.multi ? ['multiSelections'] as const : [])],
      filters: opts?.filters,
      defaultPath: opts?.defaultPath,
    });
    if (res.canceled || res.filePaths.length === 0) return { canceled: true };
    return { canceled: false, paths: res.filePaths, path: res.filePaths[0] };
  });

  // 打开/显示系统中的路径（文件或目录）
  ipcMain.handle('file:openPath', async (_e, targetPath: string) => {
    if (!targetPath) return { ok: false, error: 'EMPTY_PATH' };
    try {
      // 优先尝试直接打开目录；openPath 返回空字符串表示成功
      const result = await shell.openPath(targetPath);
      if (result === '') return { ok: true };
      // 如果 openPath 有消息（可能失败），尝试使用 showItemInFolder 作为回退
      try { shell.showItemInFolder(targetPath); return { ok: true } } catch { }
      return { ok: false, error: result };
    } catch (e: any) {
      return { ok: false, error: String(e?.message || e) };
    }
  });
}
