import { BrowserWindow, ipcMain } from 'electron';
import { addResource, listResources, getResource, deleteResource, updateResource } from '../preload/apis/resource';

export function initResourceHandlers(_win: BrowserWindow) {
  ipcMain.handle('addResource', async (_event, payload: { resource: any }) => {
    await addResource(payload.resource);
    return { success: true };
  });
  ipcMain.handle('listResource', async () => {
    // Hide soft-deleted items by default
    return await listResources({ deletedAt: 0 });
  });
  ipcMain.handle('getResource', async (_event, payload: { id: string }) => {
    return await getResource(payload.id);
  });
  ipcMain.handle('deleteResource', async (_event, payload: { id: string }) => {
    // Soft delete: mark deletedAt to trigger recycle_bin entry via trigger
    await updateResource(payload.id, { deletedAt: Date.now() });
    return { success: true };
  });
}
