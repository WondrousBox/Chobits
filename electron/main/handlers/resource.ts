import { BrowserWindow, ipcMain } from 'electron';
import { addResource, listResources, getResource, deleteResource, updateResource } from '../preload/apis/resource';
import { embeddingQueue } from '../embedding/queue';
import { chunkText } from '../embedding/chunker';
import { randomUUID } from 'node:crypto';

export function initResourceHandlers(_win: BrowserWindow) {
  ipcMain.handle('addResource', async (_event, payload: { resource: any }) => {
    const res = payload.resource || {};
    const id = res.id || randomUUID();
    await addResource({ ...res, id });
    // Auto-chunk & enqueue for embedding if text exists
    const text = res.contentText || res.description || res.title;
    if (typeof text === 'string' && text.trim().length > 0) {
      const chunks = chunkText(text);
      const items = chunks.map(c => ({
        id: `${id}#${c.index}`,
        content: c.content,
        metadata: { parentId: id, chunkIndex: c.index, chunkCount: c.count, source: 'resource' },
      }));
      embeddingQueue.enqueue({ items, dim: 384, batchSize: 16 });
    }
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
