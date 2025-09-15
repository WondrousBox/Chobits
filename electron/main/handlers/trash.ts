import { BrowserWindow, ipcMain } from 'electron';
import { listTrash, restoreTrashByRecycleIds, purgeTrashByRecycleIds, emptyTrash } from '../preload/apis/trash';

export function initTrashHandlers(_win: BrowserWindow) {
  ipcMain.handle('trash:list', async (_e, payload: { filter?: any; limit?: number; offset?: number }) => {
    return listTrash(payload?.filter || {}, payload?.limit ?? 100, payload?.offset ?? 0);
  });
  ipcMain.handle('trash:restore', async (_e, payload: { recycleIds: string[] }) => {
    return restoreTrashByRecycleIds(payload.recycleIds || []);
  });
  ipcMain.handle('trash:purge', async (_e, payload: { recycleIds: string[] }) => {
    return purgeTrashByRecycleIds(payload.recycleIds || []);
  });
  ipcMain.handle('trash:empty', async (_e, payload: { filter?: any }) => {
    return emptyTrash(payload?.filter || {});
  });
}
