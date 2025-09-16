import { BrowserWindow, ipcMain, shell } from 'electron';
import { addResource, listResources, getResource, deleteResource, updateResource } from '../preload/apis/resource';
import { embeddingQueue } from '../embedding/queue';
import { chunkText } from '../embedding/chunker';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

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

  ipcMain.handle('deleteResources', async (_event, payload: { ids: string[] }) => {
    const now = Date.now();
    await Promise.all((payload.ids || []).map(id => updateResource(id, { deletedAt: now })));
    return { success: true };
  });

  ipcMain.handle('openResource', async (_event, payload: { id: string }) => {
    const res = await getResource(payload.id);
    if (!res) return { success: false };
    if (res.filePath) {
      await shell.openPath(res.filePath);
      return { success: true };
    }
    if (res.url) {
      await shell.openExternal(res.url);
      return { success: true };
    }
    return { success: false };
  });

  ipcMain.handle('revealResource', async (_event, payload: { id: string }) => {
    const res = await getResource(payload.id);
    if (!res || !res.filePath) return { success: false };
    shell.showItemInFolder(res.filePath);
    return { success: true };
  });

  ipcMain.handle('renameResource', async (_event, payload: { id: string; newName: string; renameFile?: boolean }) => {
    const { id, newName, renameFile } = payload;
    const res = await getResource(id);
    if (!res) return { success: false };

    let fileRenamed = false;
    let newPath: string | undefined;
    if (renameFile && res.filePath) {
      const dir = path.dirname(res.filePath);
      const oldBase = path.basename(res.filePath);
      const ext = path.extname(oldBase);
      const targetBase = newName.includes('.') ? newName : `${newName}${ext}`;
      newPath = path.join(dir, targetBase);
      if (newPath !== res.filePath) {
        await fs.rename(res.filePath, newPath);
        fileRenamed = true;
      }
    }

    await updateResource(id, {
      title: newName,
      ...(newPath ? { filePath: newPath } : {}),
    });

    return { success: true, fileRenamed, newPath };
  });
}
