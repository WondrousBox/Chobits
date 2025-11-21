import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { ipcMain } from 'electron';

import { FoldersRepo, WorkspacesRepo } from '../db/repositories';

// 基于资源库的上下文，复用默认工作空间根路径，按文件夹 ID 命名本地文件夹
export function initFolderHandlers(): void {
  ipcMain.handle('folder.create', async (_event, payload: { name: string; parentId?: string | null; workspaceId?: string; description?: string }) => {
    const { name, parentId = null } = payload || ({} as any);
    if (!name) return { success: false, error: 'invalid-name' };
    let workspaceId = payload?.workspaceId;
    try {
      const ws = workspaceId ? await WorkspacesRepo.getById(workspaceId) : await WorkspacesRepo.getDefault();
      if (!ws) return { success: false, error: 'no-workspace' };
      workspaceId = ws.id;

      // 1) 预取同一父级下已存在的名称（包含软删项，因唯一索引未排除 deletedAt）
      const siblings = await FoldersRepo.list({ workspaceId, parentId } as any, 2000, 0);
      const existed = new Set<string>(siblings.map((s: any) => String(s.name || '')));

      // 2) 生成不重复的候选名：base, base 2, base 3, ...
      const baseName = String(name).trim() || '新建文件夹';
      let candidate = baseName;
      let suffix = 2;
      while (existed.has(candidate) && suffix < 200) {
        candidate = `${baseName} ${suffix}`;
        suffix += 1;
      }

      // 3) 写入（并在极端并发下若仍冲突则继续尝试后缀）
      let row: any | undefined;
      for (let retry = 0; retry < 5; retry++) {
        try {
          row = await FoldersRepo.upsert({ name: candidate, parentId, workspaceId } as any);
          break;
        } catch (e: any) {
          const msg = String(e?.message || e || '');
          if (/UNIQUE\s+constraint\s+failed/i.test(msg)) {
            candidate = `${baseName} ${suffix++}`;
            continue;
          }
          throw e;
        }
      }
      if (!row) return { success: false, error: 'create-failed' };

      // 4) 磁盘创建目录：以 ID 命名
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
    try {
      const cur = await FoldersRepo.getById(id);
      if (!cur) return { success: false, error: 'not-found' };

      const baseName = String(name).trim();
      if (!baseName) return { success: false, error: 'invalid-name' };

      // 若与当前名称相同，直接返回（避免无谓冲突检测）
      if (cur.name === baseName) {
        return { success: true, data: cur };
      }

      // 同级已有名称集合（排除自身）
      const siblings = await FoldersRepo.list({ workspaceId: cur.workspaceId, parentId: cur.parentId } as any, 2000, 0);
      const existed = new Set<string>(siblings.filter((s: any) => s.id !== id).map((s: any) => String(s.name || '')));

      let candidate = baseName;
      let suffix = 2;
      while (existed.has(candidate) && suffix < 200) {
        candidate = `${baseName} ${suffix}`;
        suffix += 1;
      }

      // 并发兜底：若仍遇唯一约束，继续加后缀重试
      let row: any | undefined;
      for (let retry = 0; retry < 5; retry++) {
        try {
          row = await FoldersRepo.rename(id, candidate);
          break;
        } catch (e: any) {
          const msg = String(e?.message || e || '');
          if (/UNIQUE\s+constraint\s+failed/i.test(msg)) {
            candidate = `${baseName} ${suffix++}`;
            continue;
          }
          throw e;
        }
      }
      if (!row) return { success: false, error: 'rename-failed' };
      return { success: true, data: row };
    } catch (e: any) {
      return { success: false, error: e?.message || 'unknown' };
    }
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
    const ids = (payload?.ids ?? []) as string[];
    if (!ids.length) return { success: true, deleted: 0 };
    // 如果删除子孙：找出所有子树 ID（简化：由调用方保证拓扑顺序，或后续递归）
    const deleted = await FoldersRepo.deleteByIds(ids);
    return { success: true, deleted };
  });

  // 读取文件夹的瀑布流布局配置
  ipcMain.handle('folder.getMasonryLayout', async (_event, payload: { folderId: string }) => {
    const { folderId } = payload || ({} as any);
    if (!folderId) return { success: false, error: 'invalid-folder-id' };
    try {
      const folder = await FoldersRepo.getById(folderId);
      if (!folder) return { success: false, error: 'folder-not-found' };
      const ws = await WorkspacesRepo.getById(folder.workspaceId || '');
      if (!ws) return { success: false, error: 'workspace-not-found' };

      const baseDir = ws.rootPath ? path.join(ws.rootPath, 'resources', 'folders') : path.join(process.cwd(), 'uploads', 'folders');
      const layoutPath = path.join(baseDir, folderId, '.layout.json');

      try {
        const content = await fs.readFile(layoutPath, 'utf-8');
        const layout = JSON.parse(content);
        return { success: true, data: layout };
      } catch (e: any) {
        // 文件不存在时返回空配置
        if ((e as any)?.code === 'ENOENT') {
          return { success: true, data: null };
        }
        throw e;
      }
    } catch (e: any) {
      return { success: false, error: e?.message || 'unknown' };
    }
  });

  // 保存文件夹的瀑布流布局配置
  ipcMain.handle('folder.saveMasonryLayout', async (_event, payload: { folderId: string; layout: any }) => {
    const { folderId, layout } = payload || ({} as any);
    if (!folderId || !layout) return { success: false, error: 'invalid-params' };
    try {
      const folder = await FoldersRepo.getById(folderId);
      if (!folder) return { success: false, error: 'folder-not-found' };
      const ws = await WorkspacesRepo.getById(folder.workspaceId || '');
      if (!ws) return { success: false, error: 'workspace-not-found' };

      const baseDir = ws.rootPath ? path.join(ws.rootPath, 'resources', 'folders') : path.join(process.cwd(), 'uploads', 'folders');
      const folderDir = path.join(baseDir, folderId);
      await fs.mkdir(folderDir, { recursive: true });
      const layoutPath = path.join(folderDir, '.layout.json');

      await fs.writeFile(layoutPath, JSON.stringify(layout, null, 2), 'utf-8');
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'unknown' };
    }
  });
}
