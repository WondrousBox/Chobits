import { dialog, ipcMain } from 'electron';

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
}
