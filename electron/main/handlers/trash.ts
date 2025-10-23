import { ipcMain } from 'electron';
import { RecycleBinRepo } from '../db/repositories';

export function initTrashHandlers(): void {
  ipcMain.handle('trash:list', async (_e, payload: { filter?: any; limit?: number; offset?: number }) => {
    return RecycleBinRepo.list(payload?.filter || {}, payload?.limit ?? 100, payload?.offset ?? 0);
  });
  ipcMain.handle('trash:restore', async (_e, payload: { recycleIds: string[] }) => {
    const restored = await RecycleBinRepo.restoreEntitiesByRecycleIds(payload.recycleIds || []);
    return { restored };
  });
  ipcMain.handle('trash:purge', async (_e, payload: { recycleIds: string[] }) => {
    const deleted = await RecycleBinRepo.purgeEntitiesByRecycleIds(payload.recycleIds || []);
    return { deleted };
  });
  ipcMain.handle('trash:empty', async (_e, payload: { filter?: any }) => {
    const deleted = await RecycleBinRepo.empty(payload?.filter || {});
    return { deleted };
  });
}
