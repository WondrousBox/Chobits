import { BrowserWindow, ipcMain } from 'electron';
import { addResource, listResources, getResource, deleteResource } from '../preload/apis/resource';

export function initResourceHandlers(_win: BrowserWindow) {
  ipcMain.handle('addResource', async (_event, payload: { resource: any }) => {
    await addResource(payload.resource);
    return { success: true };
  });
  ipcMain.handle('listResource', async () => {
    return await listResources();
  });
  ipcMain.handle('getResource', async (_event, payload: { id: string }) => {
    return await getResource(payload.id);
  });
  ipcMain.handle('deleteResource', async (_event, payload: { id: string }) => {
    await deleteResource(payload.id);
    return { success: true };
  });
}
