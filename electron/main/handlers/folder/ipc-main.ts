import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { BrowserWindow, dialog, ipcMain } from 'electron';
import { eq } from 'drizzle-orm';

import { eventManager } from '../../../../packages/event';
import { AppEvent } from '../../../../packages/event/events';
import { getOrm } from '../../db';
import { folders, resources } from '../../db/schema';
import { FoldersRepo, ResourcesRepo, WorkspacesRepo } from '../../db/repositories';
import { linkLocalDirectory, rescanLinkedDirectoryByFolderId, unlinkLinkedDirectoryByFolderId } from './linked-sync';
import { ensureUniqueEntryName, getLinkedFolderContext, joinRelativePath, movePathSafe, normalizeRelativePath, replaceRelativePathPrefix } from './linked-utils';
import { getWorkspaceFoldersRoot, resolveFolderLayoutPath, resolveFolderPath, resolveWorkspaceResourcesPath } from './storage';

type LinkLocalDirectoryResponse = {
  success: boolean;
  canceled?: boolean;
  error?: string;
  data?: {
    rootFolderId: string;
    mountId: string;
    stats: {
      folderCount: number;
      resourceCount: number;
      restoredFolderCount: number;
      restoredResourceCount: number;
      hiddenFolderCount: number;
      hiddenResourceCount: number;
      thumbnailCount: number;
    };
    reactivated: boolean;
    alreadyLinked: boolean;
  };
};

function isLinkedFolderRow(folder: { originType?: string } | undefined | null): boolean {
  return folder?.originType === 'linked';
}

const LINKED_LIST_LIMIT = 100000;

async function getFolderOrUndefined(id?: string | null) {
  if (!id) return undefined;
  return FoldersRepo.getById(id);
}

async function hasLinkedFolder(ids: string[]): Promise<boolean> {
  const rows = await Promise.all(ids.map((id) => FoldersRepo.getById(id)));
  return rows.some((row) => isLinkedFolderRow(row));
}

async function updateLinkedFolderTree(
  currentFolderId: string,
  oldRelativePath: string,
  nextRelativePath: string,
  patch: { name?: string; parentId?: string | null; rank?: number }
): Promise<any | undefined> {
  const currentFolder = await FoldersRepo.getById(currentFolderId);
  if (!currentFolder?.linkedMountId) return currentFolder;

  const db = getOrm();
  const oldNormalized = normalizeRelativePath(oldRelativePath);
  const nextNormalized = normalizeRelativePath(nextRelativePath);
  const linkedFolders = await FoldersRepo.list({ linkedMountId: currentFolder.linkedMountId } as any, LINKED_LIST_LIMIT, 0);
  const linkedResources = await ResourcesRepo.list({ linkedMountId: currentFolder.linkedMountId } as any, LINKED_LIST_LIMIT, 0);
  const now = Date.now();
  const mountContext = await getLinkedFolderContext(currentFolder);

  for (const folder of linkedFolders) {
    const relativePath = normalizeRelativePath(folder.relativePath);
    if (folder.id !== currentFolderId && relativePath !== oldNormalized && !relativePath.startsWith(`${oldNormalized}/`)) {
      continue;
    }

    const nextFolderPatch: any = {
      relativePath: folder.id === currentFolderId ? nextNormalized : replaceRelativePathPrefix(relativePath, oldNormalized, nextNormalized),
      updatedAt: now
    };
    if (folder.id === currentFolderId) {
      if (typeof patch.name === 'string') nextFolderPatch.name = patch.name;
      if (Object.prototype.hasOwnProperty.call(patch, 'parentId')) nextFolderPatch.parentId = patch.parentId ?? null;
      if (typeof patch.rank === 'number') nextFolderPatch.rank = patch.rank;
    }
    await db.update(folders).set(nextFolderPatch).where(eq(folders.id, folder.id)).run();
  }

  for (const resource of linkedResources) {
    const relativePath = normalizeRelativePath(resource.relativePath);
    if (!relativePath.startsWith(`${oldNormalized}/`)) continue;
    const nextResourceRelativePath = replaceRelativePathPrefix(relativePath, oldNormalized, nextNormalized);
    const nextFilePath = nextResourceRelativePath
      ? path.join(mountContext.mount.absolutePath, ...nextResourceRelativePath.split('/'))
      : mountContext.mount.absolutePath;
    await db
      .update(resources)
      .set({
        relativePath: nextResourceRelativePath,
        filePath: nextFilePath,
        updatedAt: now
      } as any)
      .where(eq(resources.id, resource.id))
      .run();
  }

  return FoldersRepo.getById(currentFolderId);
}

export function initFolderHandlers(): void {
  ipcMain.handle('folder.create', async (_event, payload: { name: string; parentId?: string | null; workspaceId?: string; description?: string }) => {
    const { name, parentId = null } = payload || ({} as any);
    if (!name) return { success: false, error: 'invalid-name' };
    let workspaceId = payload?.workspaceId;
    try {
      const parentFolder = await getFolderOrUndefined(parentId);
      if (isLinkedFolderRow(parentFolder)) {
        const parentContext = await getLinkedFolderContext(parentFolder!);
        const siblings = await FoldersRepo.list({ workspaceId: parentContext.folder.workspaceId, parentId } as any, 2000, 0);
        const siblingNames = siblings.filter((folder) => !folder.deletedAt).map((folder) => folder.name || '');
        const candidate = await ensureUniqueEntryName(parentContext.folderPath, name, siblingNames);
        const dirPath = path.join(parentContext.folderPath, candidate);
        await fs.mkdir(dirPath, { recursive: true });

        const row = await FoldersRepo.create({
          name: candidate,
          parentId,
          workspaceId: parentContext.folder.workspaceId,
          originType: 'linked',
          linkedMountId: parentContext.mount.id,
          relativePath: joinRelativePath(parentContext.relativePath, candidate)
        } as any);

        eventManager.emit(AppEvent.FOLDER_CREATED, row);
        return { success: true, data: row, dirPath };
      }

      const ws = workspaceId ? await WorkspacesRepo.getById(workspaceId) : await WorkspacesRepo.getDefault();
      if (!ws) return { success: false, error: 'no-workspace' };
      workspaceId = ws.id;

      const siblings = await FoldersRepo.list({ workspaceId, parentId } as any, 2000, 0);
      const existed = new Set<string>(siblings.map((s: any) => String(s.name || '')));

      const baseName = String(name).trim() || 'New Folder';
      let candidate = baseName;
      let suffix = 2;
      while (existed.has(candidate) && suffix < 200) {
        candidate = `${baseName} ${suffix}`;
        suffix += 1;
      }

      let row: any | undefined;
      for (let retry = 0; retry < 5; retry++) {
        try {
          row = await FoldersRepo.create({ name: candidate, parentId, workspaceId } as any);
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

      const baseDir = getWorkspaceFoldersRoot(ws.rootPath);
      await fs.mkdir(baseDir, { recursive: true });
      const dirPath = path.join(baseDir, row.id);
      await fs.mkdir(dirPath, { recursive: true });

      eventManager.emit(AppEvent.FOLDER_CREATED, row);

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
      if (isLinkedFolderRow(cur)) {
        const currentContext = await getLinkedFolderContext(cur);
        if (currentContext.isRoot) return { success: false, error: 'linked-root-readonly' };
        const parentFolder = await getFolderOrUndefined(cur.parentId ?? null);
        if (!parentFolder) return { success: false, error: 'folder-parent-not-found' };
        const parentContext = await getLinkedFolderContext(parentFolder);
        const baseName = String(name).trim();
        if (!baseName) return { success: false, error: 'invalid-name' };
        if (cur.name === baseName) {
          return { success: true, data: cur };
        }

        const siblings = await FoldersRepo.list({ workspaceId: cur.workspaceId, parentId: cur.parentId ?? null } as any, 2000, 0);
        const siblingNames = siblings.filter((folder) => folder.id !== cur.id && !folder.deletedAt).map((folder) => folder.name || '');
        const candidate = await ensureUniqueEntryName(parentContext.folderPath, baseName, siblingNames);
        const nextPath = path.join(parentContext.folderPath, candidate);
        await movePathSafe(currentContext.folderPath, nextPath);

        const row = await updateLinkedFolderTree(cur.id, currentContext.relativePath, joinRelativePath(parentContext.relativePath, candidate), {
          name: candidate
        });
        if (!row) return { success: false, error: 'rename-failed' };
        eventManager.emit(AppEvent.FOLDER_UPDATED, row);
        return { success: true, data: row };
      }

      const baseName = String(name).trim();
      if (!baseName) return { success: false, error: 'invalid-name' };
      if (cur.name === baseName) {
        return { success: true, data: cur };
      }

      const row = await FoldersRepo.rename(id, baseName);
      if (!row) return { success: false, error: 'rename-failed' };
      eventManager.emit(AppEvent.FOLDER_UPDATED, row);
      return { success: true, data: row };
    } catch (e: any) {
      return { success: false, error: e?.message || 'unknown' };
    }
  });

  ipcMain.handle('folder.move', async (_event, payload: { id: string; parentId: string | null; prevRank?: number; nextRank?: number }) => {
    const { id, parentId, prevRank, nextRank } = payload || ({} as any);
    if (!id) return { success: false, error: 'invalid-params' };
    const currentFolder = await FoldersRepo.getById(id);
    const targetFolder = await getFolderOrUndefined(parentId ?? null);
    if (isLinkedFolderRow(currentFolder) || isLinkedFolderRow(targetFolder)) {
      if (!isLinkedFolderRow(currentFolder) || !isLinkedFolderRow(targetFolder)) {
        return { success: false, error: 'cross-origin-folder-move-not-supported' };
      }
      const currentContext = await getLinkedFolderContext(currentFolder!);
      const targetContext = await getLinkedFolderContext(targetFolder!);
      if (currentContext.isRoot) return { success: false, error: 'linked-root-readonly' };
      if (currentContext.mount.id !== targetContext.mount.id) {
        return { success: false, error: 'cross-linked-mount-folder-move-not-supported' };
      }

      if ((currentFolder?.parentId ?? null) === (targetFolder?.id ?? null)) {
        const row = await FoldersRepo.move(id, parentId ?? null, prevRank, nextRank);
        if (row) {
          eventManager.emit(AppEvent.FOLDER_MOVED, row);
        }
        return { success: true, data: row };
      }

      const siblings = await FoldersRepo.list({ workspaceId: targetFolder?.workspaceId, parentId: targetFolder?.id ?? null } as any, 2000, 0);
      const siblingNames = siblings.filter((folder) => folder.id !== id && !folder.deletedAt).map((folder) => folder.name || '');
      const candidate = await ensureUniqueEntryName(targetContext.folderPath, currentFolder?.name || '', siblingNames);
      const nextFolderPath = path.join(targetContext.folderPath, candidate);
      await movePathSafe(currentContext.folderPath, nextFolderPath);

      const movedRow = await FoldersRepo.move(id, parentId ?? null, prevRank, nextRank);
      const row = await updateLinkedFolderTree(id, currentContext.relativePath, joinRelativePath(targetContext.relativePath, candidate), {
        name: candidate,
        parentId: parentId ?? null,
        rank: movedRow?.rank
      });
      if (row) {
        eventManager.emit(AppEvent.FOLDER_MOVED, row);
      }
      return { success: true, data: row };
    }
    const row = await FoldersRepo.move(id, parentId ?? null, prevRank, nextRank);
    if (row) {
      eventManager.emit(AppEvent.FOLDER_MOVED, row);
    }
    return { success: true, data: row };
  });

  ipcMain.handle('folder.get', async (_event, payload: { id: string }) => {
    const { id } = payload || ({} as any);
    if (!id) return undefined;
    return await FoldersRepo.getById(id);
  });

  ipcMain.handle('folder.getResolvedPath', async (_event, payload: { id?: string | null; workspaceId?: string }) => {
    const folderId = payload?.id ?? null;
    if (folderId) {
      const folder = await FoldersRepo.getById(folderId);
      if (!folder) return { success: false, error: 'folder-not-found' };
      const folderPath = await resolveFolderPath(folderId);
      if (!folderPath) return { success: false, error: 'folder-path-unavailable' };
      return {
        success: true,
        path: folderPath,
        originType: folder.originType,
        linkedMountId: folder.linkedMountId ?? undefined
      };
    }

    const rootPath = await resolveWorkspaceResourcesPath(payload?.workspaceId);
    if (!rootPath) return { success: false, error: 'workspace-not-found' };
    return { success: true, path: rootPath, originType: 'workspace' };
  });

  ipcMain.handle('folder.linkLocalDirectory', async (_event, payload: { workspaceId?: string } = {} as any): Promise<LinkLocalDirectoryResponse> => {
    const win = BrowserWindow.getFocusedWindow();
    const pickResult = await dialog.showOpenDialog(win || undefined, {
      properties: ['openDirectory'],
      title: 'Link Local Folder'
    });

    if (pickResult.canceled || pickResult.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const selectedPath = pickResult.filePaths[0];
    const confirmResult = await dialog.showMessageBox(win || undefined, {
      type: 'question',
      buttons: ['Authorize', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      title: 'Authorize Local Folder',
      message: 'Add this folder to resource management?',
      detail: `Path: ${selectedPath}\n\nThe app will scan the folder structure and store a DB index, but it will not copy original files into the workspace.`
    });

    if (confirmResult.response !== 0) {
      return { success: false, canceled: true };
    }

    try {
      const result = await linkLocalDirectory(payload?.workspaceId, selectedPath);
      eventManager.emit(AppEvent.FOLDER_CREATED, result.rootFolder);
      return {
        success: true,
        data: {
          rootFolderId: result.rootFolder.id,
          mountId: result.mount.id,
          stats: result.stats,
          reactivated: result.reactivated,
          alreadyLinked: result.alreadyLinked
        }
      };
    } catch (error: any) {
      return { success: false, error: error?.message || 'unknown' };
    }
  });

  ipcMain.handle('folder.rescanLinkedDirectory', async (_event, payload: { rootFolderId: string }) => {
    const rootFolderId = payload?.rootFolderId;
    if (!rootFolderId) return { success: false, error: 'invalid-root-folder-id' };

    try {
      const result = await rescanLinkedDirectoryByFolderId(rootFolderId);
      eventManager.emit(AppEvent.FOLDER_UPDATED, result.rootFolder);
      return {
        success: true,
        data: {
          rootFolderId: result.rootFolder.id,
          mountId: result.mount.id,
          stats: result.stats
        }
      };
    } catch (error: any) {
      return { success: false, error: error?.message || 'unknown' };
    }
  });

  ipcMain.handle('folder.unlinkLocalDirectory', async (_event, payload: { rootFolderId: string }) => {
    const rootFolderId = payload?.rootFolderId;
    if (!rootFolderId) return { success: false, error: 'invalid-root-folder-id' };

    const win = BrowserWindow.getFocusedWindow();
    const confirmResult = await dialog.showMessageBox(win || undefined, {
      type: 'warning',
      buttons: ['Unlink', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Unlink Local Folder',
      message: 'Unlink this local folder from resource management?',
      detail: 'This only hides the indexed resources in the app. Original files on disk will not be deleted.'
    });

    if (confirmResult.response !== 0) {
      return { success: false, canceled: true };
    }

    try {
      const result = await unlinkLinkedDirectoryByFolderId(rootFolderId);
      eventManager.emit(AppEvent.FOLDER_DELETED, { id: rootFolderId });
      return {
        success: true,
        data: {
          mountId: result.mount.id,
          hiddenFolderCount: result.hiddenFolderCount,
          hiddenResourceCount: result.hiddenResourceCount
        }
      };
    } catch (error: any) {
      return { success: false, error: error?.message || 'unknown' };
    }
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
    if (await hasLinkedFolder(ids)) return { success: false, error: 'linked-folder-readonly', data: [] };
    const rows = await FoldersRepo.softDelete(ids);
    if (rows.length > 0) {
      rows.forEach((row) => eventManager.emit(AppEvent.FOLDER_UPDATED, row));
    }
    return { success: true, data: rows };
  });

  ipcMain.handle('folder.restore', async (_event, payload: { ids: string[] }) => {
    const { ids = [] } = payload || ({} as any);
    if (!ids.length) return { success: true, data: [] };
    const rows = await FoldersRepo.restore(ids);
    if (rows.length > 0) {
      rows.forEach((row) => eventManager.emit(AppEvent.FOLDER_UPDATED, row));
    }
    return { success: true, data: rows };
  });

  ipcMain.handle('folder.delete', async (_event, payload: { ids: string[]; deleteChildren?: boolean }) => {
    const ids = (payload?.ids ?? []) as string[];
    if (!ids.length) return { success: true, deleted: 0 };
    if (await hasLinkedFolder(ids)) return { success: false, error: 'linked-folder-readonly', deleted: 0 };
    const deleted = await FoldersRepo.deleteByIds(ids);
    if (deleted > 0) {
      ids.forEach((id) => eventManager.emit(AppEvent.FOLDER_DELETED, { id }));
    }
    return { success: true, deleted };
  });

  ipcMain.handle('folder.getMasonryLayout', async (_event, payload: { folderId: string }) => {
    const { folderId } = payload || ({} as any);
    if (!folderId) return { success: false, error: 'invalid-folder-id' };
    try {
      const folder = await FoldersRepo.getById(folderId);
      if (!folder) return { success: false, error: 'folder-not-found' };
      if (!folder.workspaceId) return { success: false, error: 'workspace-not-found' };

      const layoutPath = await resolveFolderLayoutPath(folderId);
      if (!layoutPath) return { success: false, error: 'folder-layout-path-unavailable' };

      try {
        const content = await fs.readFile(layoutPath, 'utf-8');
        const layout = JSON.parse(content);
        return { success: true, data: layout };
      } catch (e: any) {
        if ((e as any)?.code === 'ENOENT') {
          return { success: true, data: null };
        }
        throw e;
      }
    } catch (e: any) {
      return { success: false, error: e?.message || 'unknown' };
    }
  });

  ipcMain.handle('folder.saveMasonryLayout', async (_event, payload: { folderId: string; layout: any }) => {
    const { folderId, layout } = payload || ({} as any);
    if (!folderId || !layout) return { success: false, error: 'invalid-params' };
    try {
      const folder = await FoldersRepo.getById(folderId);
      if (!folder) return { success: false, error: 'folder-not-found' };
      if (!folder.workspaceId) return { success: false, error: 'workspace-not-found' };

      const layoutPath = await resolveFolderLayoutPath(folderId);
      if (!layoutPath) return { success: false, error: 'folder-layout-path-unavailable' };
      const folderDir = path.dirname(layoutPath);
      await fs.mkdir(folderDir, { recursive: true });

      await fs.writeFile(layoutPath, JSON.stringify(layout, null, 2), 'utf-8');
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e?.message || 'unknown' };
    }
  });
}
