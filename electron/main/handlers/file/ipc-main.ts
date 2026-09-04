import { dialog, ipcMain, shell } from 'electron';

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
