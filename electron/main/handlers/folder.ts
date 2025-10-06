import { BrowserWindow, ipcMain } from 'electron';
import { WorkspacesRepo, FoldersRepo } from '../db/repositories';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

// 基于资源管理的上下文，复用默认工作空间根路径，按文件夹 ID 命名本地文件夹
export function initFolderHandlers(_win: BrowserWindow) {
  ipcMain.handle('folder.create', async (_event, payload: { name: string; parentId?: string | null; workspaceId?: string; description?: string }) => {
    const { name, parentId = null } = payload || ({} as any);
    if (!name) return { success: false, error: 'invalid-name' };
    let workspaceId = payload?.workspaceId;
    try {
      const ws = workspaceId ? await WorkspacesRepo.getById(workspaceId) : await WorkspacesRepo.getDefault();
      if (!ws) return { success: false, error: 'no-workspace' };
      workspaceId = ws.id;
      const row = await FoldersRepo.upsert({ name, parentId, workspaceId } as any);
      if (!row) return { success: false };
      // 磁盘：以 ID 命名文件夹
      const baseDir = ws.rootPath ? path.join(ws.rootPath, 'resources', 'folders') : path.join(process.cwd(), 'uploads', 'folders');
      await fs.mkdir(baseDir, { recursive: true });
      const dirPath = path.join(baseDir, row.id);
      await fs.mkdir(dirPath, { recursive: true });
      return { success: true, data: row, dirPath };
    } catch (e: any) {
      return { success: false, error: e?.message || 'unknown' };
    }
  });

  ipcMain.handle('folder.rename', async (_event, payload: { id: string; name: string }) => {
    const { id, name } = payload || ({} as any);
    if (!id || !name) return { success: false, error: 'invalid-params' };
    const row = await FoldersRepo.rename(id, name);
    return { success: true, data: row };
  });

  ipcMain.handle('folder.move', async (_event, payload: { id: string; parentId: string | null }) => {
    const { id, parentId } = payload || ({} as any);
    if (!id) return { success: false, error: 'invalid-params' };
    const row = await FoldersRepo.move(id, parentId ?? null);
    return { success: true, data: row };
  });

  ipcMain.handle('folder.get', async (_event, payload: { id: string }) => {
    const { id } = payload || ({} as any);
    if (!id) return undefined;
    return await FoldersRepo.getById(id);
  });

  ipcMain.handle('folder.list', async (_event, payload: { workspaceId?: string; parentId?: string | null; deletedAt?: 0 | 1 } = {} as any) => {
    const filter: any = {};
    if (typeof payload?.deletedAt === 'number') filter.deletedAt = payload.deletedAt;
    if (typeof payload?.parentId !== 'undefined') filter.parentId = payload.parentId;
    if (payload?.workspaceId) filter.workspaceId = payload.workspaceId;
    if (!filter.workspaceId) {
      const ws = await WorkspacesRepo.getDefault();
      if (ws) filter.workspaceId = ws.id;
    }
    const rows = await FoldersRepo.list(filter, 1000, 0);
    return rows;
  });

  ipcMain.handle('folder.softDelete', async (_event, payload: { ids: string[] }) => {
    const { ids = [] } = payload || ({} as any);
    if (!ids.length) return { success: true, data: [] };
    const rows = await FoldersRepo.softDelete(ids);
    return { success: true, data: rows };
  });

  ipcMain.handle('folder.restore', async (_event, payload: { ids: string[] }) => {
    const { ids = [] } = payload || ({} as any);
    if (!ids.length) return { success: true, data: [] };
    const rows = await FoldersRepo.restore(ids);
    return { success: true, data: rows };
  });

  ipcMain.handle('folder.delete', async (_event, payload: { ids: string[]; deleteChildren?: boolean }) => {
    const { ids = [], deleteChildren = false } = payload || ({} as any);
    if (!ids.length) return { success: true, deleted: 0 };
    // 如果删除子孙：找出所有子树 ID（简化：由调用方保证拓扑顺序，或后续递归）
    const deleted = await FoldersRepo.deleteByIds(ids);
    return { success: true, deleted };
  });
}
