import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { BrowserWindow, dialog, ipcMain, type MessageBoxOptions, type OpenDialogOptions } from 'electron';

import { eventManager } from '../../../../packages/event';
import { AppEvent } from '../../../../packages/event/events';
import { getOrm } from '../../db';
import { FoldersRepo, LinkedFolderMountsRepo, RecycleBinRepo, ResourcesRepo, WorkspacesRepo } from '../../db/repositories';
import { folders, type LinkedFolderMountRow, recycle_bin, resources } from '../../db/schema';
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
      conflictCount: number;
      thumbnailCount: number;
    };
    reactivated: boolean;
    alreadyLinked: boolean;
  };
};

function isLinkedFolderRow(folder: { originType?: string } | undefined | null): boolean {
  return folder?.originType === 'linked';
}

function isLinkedRootFolder(folder: { originType?: string; relativePath?: string | null } | undefined | null): boolean {
  return isLinkedFolderRow(folder) && normalizeRelativePath(folder?.relativePath) === '';
}

function isRelativePathWithin(candidatePath?: string | null, ancestorPath?: string | null): boolean {
  const candidate = normalizeRelativePath(candidatePath);
  const ancestor = normalizeRelativePath(ancestorPath);
  if (!ancestor) return true;
  return candidate === ancestor || candidate.startsWith(`${ancestor}/`);
}

function resolveLinkedAbsolutePath(absoluteMountPath: string, relativePath?: string | null): string {
  const normalized = normalizeRelativePath(relativePath);
  return normalized ? path.join(absoluteMountPath, ...normalized.split('/')) : absoluteMountPath;
}

function isPathInsideOrEqual(parentPath: string, childPath: string): boolean {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  const relative = path.relative(parent, child);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function getRelativePathFromAbsolute(parentPath: string, childPath: string): string {
  return normalizeRelativePath(path.relative(path.resolve(parentPath), path.resolve(childPath)));
}

function parseJsonObject(raw?: string | null): Record<string, any> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function clearLinkedFolderStateMetadata(raw?: string | null): string | null {
  const metadata = parseJsonObject(raw);
  delete metadata.linkedFolderState;
  return Object.keys(metadata).length ? JSON.stringify(metadata) : null;
}

function isLinkedMissingFolderRow(folder: { originType?: string; relativePath?: string | null; metadata?: string | null } | undefined | null): boolean {
  if (!folder || !isLinkedFolderRow(folder) || isLinkedRootFolder(folder)) return false;
  const metadata = parseJsonObject(folder.metadata);
  const linkedFolderState = metadata.linkedFolderState;
  return !!linkedFolderState && typeof linkedFolderState === 'object' && linkedFolderState.issueType === 'missing-folder';
}

async function buildLinkedRootState(folder: any): Promise<Record<string, any> | null> {
  if (!isLinkedRootFolder(folder) || !folder?.linkedMountId) return null;

  const mount = await LinkedFolderMountsRepo.getById(folder.linkedMountId);
  if (!mount) {
    return {
      mountStatus: 'missing',
      pathStatus: 'missing',
      watchEnabled: false,
      absolutePath: null,
      lastScanAt: null,
      hiddenFolderCount: 0,
      hiddenResourceCount: 0,
      conflictCount: 0,
      lastSyncStatus: 'error',
      lastSyncError: 'linked-mount-not-found',
      issueType: 'missing-root'
    };
  }

  const mountMetadata = parseJsonObject(mount.metadata);
  const lastSyncStats = mountMetadata.lastSyncStats && typeof mountMetadata.lastSyncStats === 'object' ? mountMetadata.lastSyncStats : {};
  const stat = mount.absolutePath ? await fs.stat(mount.absolutePath).catch(() => null) : null;
  const pathStatus = stat?.isDirectory() ? 'available' : 'missing';
  const hiddenFolderCount = Number(lastSyncStats.hiddenFolderCount || 0);
  const hiddenResourceCount = Number(lastSyncStats.hiddenResourceCount || 0);
  const conflictCount = Number(lastSyncStats.conflictCount || 0);
  const lastSyncStatus = typeof mountMetadata.lastSyncStatus === 'string' ? mountMetadata.lastSyncStatus : null;
  const lastSyncError = typeof mountMetadata.lastSyncError === 'string' ? mountMetadata.lastSyncError : null;

  let issueType: 'missing-root' | 'missing-children' | 'conflict' | 'sync-error' | null = null;
  if (pathStatus === 'missing') {
    issueType = 'missing-root';
  } else if (conflictCount > 0) {
    issueType = 'conflict';
  } else if (hiddenFolderCount > 0 || hiddenResourceCount > 0) {
    issueType = 'missing-children';
  } else if (lastSyncStatus && lastSyncStatus !== 'ok') {
    issueType = 'sync-error';
  }

  return {
    mountStatus: mount.status,
    pathStatus,
    watchEnabled: !!mount.watchEnabled,
    absolutePath: mount.absolutePath,
    lastScanAt: mount.lastScanAt ?? null,
    hiddenFolderCount,
    hiddenResourceCount,
    conflictCount,
    lastSyncStatus,
    lastSyncError,
    issueType
  };
}

async function enrichLinkedFolderRow(row: any): Promise<any> {
  const linkedRootState = await buildLinkedRootState(row);
  if (!linkedRootState) return row;
  return {
    ...row,
    metadata: JSON.stringify({
      ...parseJsonObject(row.metadata),
      linkedRootState
    })
  };
}

async function enrichLinkedFolderRows(rows: any[]): Promise<any[]> {
  return Promise.all((rows || []).map((row) => enrichLinkedFolderRow(row)));
}

const LINKED_LIST_LIMIT = 100000;

async function removeEmptyLinkedDirectories(folderPaths: string[]): Promise<void> {
  const uniquePaths = Array.from(new Set(folderPaths.filter(Boolean))).sort((left, right) => right.length - left.length);
  for (const folderPath of uniquePaths) {
    try {
      const stat = await fs.stat(folderPath).catch(() => null);
      if (!stat?.isDirectory()) continue;
      const remaining = await fs.readdir(folderPath);
      if (remaining.length === 0) {
        await fs.rmdir(folderPath);
      }
    } catch {
      /* ignore */
    }
  }
}

async function getFolderOrUndefined(id?: string | null): Promise<any | undefined> {
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
  patch: { name?: string; parentId?: string | null; rank?: number },
  options: {
    targetMount?: Pick<LinkedFolderMountRow, 'id' | 'absolutePath' | 'workspaceId'>;
  } = {}
): Promise<any | undefined> {
  const currentFolder = await FoldersRepo.getById(currentFolderId);
  if (!currentFolder?.linkedMountId) return currentFolder;

  const db = getOrm();
  const oldNormalized = normalizeRelativePath(oldRelativePath);
  const nextNormalized = normalizeRelativePath(nextRelativePath);
  const targetMount = options.targetMount || {
    id: currentFolder.linkedMountId,
    absolutePath: '',
    workspaceId: currentFolder.workspaceId ?? null
  };
  const linkedFolders = await FoldersRepo.list({ linkedMountId: currentFolder.linkedMountId } as any, LINKED_LIST_LIMIT, 0);
  const linkedResources = await ResourcesRepo.list({ linkedMountId: currentFolder.linkedMountId } as any, LINKED_LIST_LIMIT, 0);
  const now = Date.now();
  const mountContext = await getLinkedFolderContext(currentFolder);
  const targetMountAbsolutePath = targetMount.absolutePath || mountContext.mount.absolutePath;
  const targetWorkspaceId = targetMount.workspaceId ?? currentFolder.workspaceId ?? null;

  for (const folder of linkedFolders) {
    const relativePath = normalizeRelativePath(folder.relativePath);
    if (folder.id !== currentFolderId && relativePath !== oldNormalized && !relativePath.startsWith(`${oldNormalized}/`)) {
      continue;
    }

    const nextFolderPatch: any = {
      linkedMountId: targetMount.id,
      relativePath: folder.id === currentFolderId ? nextNormalized : replaceRelativePathPrefix(relativePath, oldNormalized, nextNormalized),
      workspaceId: targetWorkspaceId,
      updatedAt: now
    };
    if (folder.id === currentFolderId) {
      if (typeof patch.name === 'string') nextFolderPatch.name = patch.name;
      if (Object.prototype.hasOwnProperty.call(patch, 'parentId')) nextFolderPatch.parentId = patch.parentId ?? null;
      if (typeof patch.rank === 'number') nextFolderPatch.rank = patch.rank;
      nextFolderPatch.metadata = clearLinkedFolderStateMetadata(folder.metadata);
    }
    await db.update(folders).set(nextFolderPatch).where(eq(folders.id, folder.id)).run();
  }

  for (const resource of linkedResources) {
    const relativePath = normalizeRelativePath(resource.relativePath);
    if (!relativePath.startsWith(`${oldNormalized}/`)) continue;
    const nextResourceRelativePath = replaceRelativePathPrefix(relativePath, oldNormalized, nextNormalized);
    const nextFilePath = nextResourceRelativePath ? path.join(targetMountAbsolutePath, ...nextResourceRelativePath.split('/')) : targetMountAbsolutePath;
    await db
      .update(resources)
      .set({
        linkedMountId: targetMount.id,
        relativePath: nextResourceRelativePath,
        filePath: nextFilePath,
        workspaceId: targetWorkspaceId,
        updatedAt: now
      } as any)
      .where(eq(resources.id, resource.id))
      .run();
  }

  return FoldersRepo.getById(currentFolderId);
}

type LinkedMissingFolderReconnectTarget = {
  mount: LinkedFolderMountRow;
  rootFolderId: string;
  parentFolder: any;
  relativePath: string;
};

async function resolveLinkedMissingFolderReconnectTarget(
  context: { folder: { workspaceId?: string | null }; mount: LinkedFolderMountRow },
  currentFolderId: string,
  selectedPath: string
): Promise<{ target?: LinkedMissingFolderReconnectTarget; error?: string }> {
  const workspaceId = context.mount.workspaceId || context.folder.workspaceId;
  if (!workspaceId) {
    return { error: 'workspace-not-found' };
  }

  const candidateMounts = (await LinkedFolderMountsRepo.list({ workspaceId, status: 'active' } as any, LINKED_LIST_LIMIT, 0))
    .filter((mount) => mount.absolutePath && isPathInsideOrEqual(mount.absolutePath, selectedPath))
    .sort((left, right) => path.resolve(right.absolutePath).length - path.resolve(left.absolutePath).length);

  const targetMount = candidateMounts[0];
  if (!targetMount) {
    return { error: 'linked-folder-reconnect-target-not-linked' };
  }

  if (path.resolve(targetMount.absolutePath) === selectedPath) {
    return {
      error: targetMount.id === context.mount.id ? 'linked-root-readonly' : 'linked-folder-reconnect-target-is-root'
    };
  }

  const nextRelativePath = getRelativePathFromAbsolute(targetMount.absolutePath, selectedPath);
  if (!nextRelativePath) {
    return {
      error: targetMount.id === context.mount.id ? 'linked-root-readonly' : 'linked-folder-reconnect-target-is-root'
    };
  }

  const existingTarget = await FoldersRepo.getByLinkedRelativePath(targetMount.id, nextRelativePath);
  if (existingTarget && existingTarget.id !== currentFolderId) {
    return { error: 'linked-folder-path-already-indexed' };
  }

  const rootFolder = (targetMount.rootFolderId ? await FoldersRepo.getById(targetMount.rootFolderId) : undefined) || (await FoldersRepo.getByLinkedRelativePath(targetMount.id, ''));
  if (!rootFolder || rootFolder.deletedAt) {
    return { error: 'linked-folder-parent-not-indexed' };
  }

  const parentRelativePath = normalizeRelativePath(path.dirname(nextRelativePath));
  const normalizedParentRelativePath = parentRelativePath === '.' ? '' : parentRelativePath;
  const parentFolder = normalizedParentRelativePath ? await FoldersRepo.getByLinkedRelativePath(targetMount.id, normalizedParentRelativePath) : rootFolder;
  if (!parentFolder || parentFolder.deletedAt) {
    return { error: 'linked-folder-parent-not-indexed' };
  }

  return {
    target: {
      mount: targetMount,
      rootFolderId: rootFolder.id,
      parentFolder,
      relativePath: nextRelativePath
    }
  };
}

async function markLinkedResourcesDeletedWithoutMoving(resourceRows: any[], now: number, reason: string): Promise<any[]> {
  if (!resourceRows.length) return [];
  const db = getOrm();
  const resourcesById = new Map<string, any>();
  resourceRows.forEach((resource) => resourcesById.set(resource.id, resource));

  let frontier = resourceRows.map((resource) => resource.id);
  while (frontier.length) {
    const childRows = await db
      .select()
      .from(resources)
      .where(and(inArray(resources.parentResourceId, frontier), isNull(resources.deletedAt)));
    const next: string[] = [];
    (childRows as any[]).forEach((resource) => {
      if (!resourcesById.has(resource.id)) {
        resourcesById.set(resource.id, resource);
        next.push(resource.id);
      }
    });
    frontier = next;
  }

  const expandedResourceRows = Array.from(resourcesById.values());
  const resourceIds = expandedResourceRows.map((resource) => resource.id);

  await db
    .update(resources)
    .set({ deletedAt: now, updatedAt: now } as any)
    .where(inArray(resources.id, resourceIds))
    .run();

  const recycleItems = expandedResourceRows.map((resource) => ({
    id: `res:${resource.id}`,
    entityType: 'resource',
    entityId: resource.id,
    title: resource.title ?? resource.description ?? resource.id,
    summary: resource.description ?? null,
    reason,
    deletedAt: now,
    deletedBy: 'system',
    payload: JSON.stringify({
      id: resource.id,
      originalFilePath: resource.filePath ?? null,
      originType: resource.originType ?? null,
      linkedMountId: resource.linkedMountId ?? null,
      relativePath: resource.relativePath ?? null
    }),
    expireAt: null
  }));

  await db
    .insert(recycle_bin)
    .values(recycleItems as any)
    .onConflictDoUpdate({
      target: recycle_bin.id,
      set: {
        deletedAt: sql`excluded.deleted_at`,
        payload: sql`excluded.payload`,
        title: sql`excluded.title`,
        summary: sql`excluded.summary`
      }
    })
    .run();

  return db.select().from(resources).where(inArray(resources.id, resourceIds));
}

async function softDeleteLinkedFolders(ids: string[], options: { reason?: string; moveResourceFiles?: boolean; removeEmptyDirectories?: boolean } = {}): Promise<any[]> {
  const linkedFolders = (await Promise.all(ids.map((id) => FoldersRepo.getById(id)))).filter((folder) => isLinkedFolderRow(folder)) as any[];
  if (!linkedFolders.length) return [];
  if (linkedFolders.some((folder) => isLinkedRootFolder(folder))) {
    throw new Error('linked-root-readonly');
  }

  const linkedContexts = await Promise.all(linkedFolders.map(async (folder) => ({ folder, context: await getLinkedFolderContext(folder) })));
  const effectiveRoots = linkedContexts.filter(({ folder, context }) => {
    return !linkedContexts.some((other) => {
      if (other.folder.id === folder.id) return false;
      if (other.context.mount.id !== context.mount.id) return false;
      return isRelativePathWithin(context.relativePath, other.context.relativePath);
    });
  });

  const mountIds = Array.from(new Set(effectiveRoots.map(({ context }) => context.mount.id)));
  const foldersByMount = new Map<string, any[]>();
  const resourcesByMount = new Map<string, any[]>();
  for (const mountId of mountIds) {
    foldersByMount.set(mountId, await FoldersRepo.list({ linkedMountId: mountId } as any, LINKED_LIST_LIMIT, 0));
    resourcesByMount.set(mountId, await ResourcesRepo.list({ linkedMountId: mountId } as any, LINKED_LIST_LIMIT, 0));
  }

  const folderIds = new Set<string>();
  const resourceIds = new Set<string>();
  const resourcesToDelete: any[] = [];
  const recycleItems: any[] = [];
  const now = Date.now();
  const reason = options.reason || 'user-delete';
  const moveResourceFiles = options.moveResourceFiles !== false;
  const removeEmptyDirectories = options.removeEmptyDirectories !== false;

  for (const { context } of effectiveRoots) {
    const mountFolders = foldersByMount.get(context.mount.id) || [];
    const mountResources = resourcesByMount.get(context.mount.id) || [];
    const subtreeFolders = mountFolders.filter((folder) => !folder.deletedAt && isRelativePathWithin(folder.relativePath, context.relativePath));
    const subtreeFolderIds = new Set(subtreeFolders.map((folder) => folder.id));

    subtreeFolders.forEach((folder) => {
      folderIds.add(folder.id);
      recycleItems.push({
        id: `folder:${folder.id}`,
        entityType: 'folder',
        entityId: folder.id,
        title: folder.name,
        summary: folder.description ?? null,
        reason,
        deletedAt: now,
        deletedBy: 'system',
        payload: JSON.stringify({
          id: folder.id,
          workspaceId: folder.workspaceId ?? null,
          originType: folder.originType,
          linkedMountId: folder.linkedMountId ?? null,
          relativePath: folder.relativePath ?? null,
          originalFolderPath: resolveLinkedAbsolutePath(context.mount.absolutePath, folder.relativePath)
        }),
        expireAt: null
      });
    });

    mountResources
      .filter((resource) => !resource.deletedAt && resource.folderId && subtreeFolderIds.has(resource.folderId))
      .forEach((resource) => {
        resourceIds.add(resource.id);
        resourcesToDelete.push(resource);
      });
  }

  if (resourceIds.size) {
    const deletedResources = moveResourceFiles ? await ResourcesRepo.softDelete(Array.from(resourceIds)) : await markLinkedResourcesDeletedWithoutMoving(resourcesToDelete, now, reason);
    if (deletedResources.length) {
      eventManager.emit(AppEvent.RESOURCE_BATCH_DELETED, deletedResources);
    }
  }

  if (folderIds.size) {
    await FoldersRepo.softDelete(Array.from(folderIds));
    const db = getOrm();
    await db
      .insert(recycle_bin)
      .values(recycleItems as any)
      .onConflictDoUpdate({
        target: recycle_bin.id,
        set: {
          deletedAt: sql`excluded.deleted_at`,
          payload: sql`excluded.payload`,
          title: sql`excluded.title`,
          summary: sql`excluded.summary`
        }
      })
      .run();

    if (removeEmptyDirectories) {
      await removeEmptyLinkedDirectories(
        recycleItems
          .map((item) => {
            try {
              const payload = JSON.parse(item.payload || '{}');
              return typeof payload?.originalFolderPath === 'string' ? payload.originalFolderPath : null;
            } catch {
              return null;
            }
          })
          .filter(Boolean) as string[]
      );
    }
  }

  const rows = await Promise.all(ids.map((id) => FoldersRepo.getById(id)));
  return rows.filter(Boolean);
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
        rank: movedRow?.rank ?? undefined
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
    const row = await FoldersRepo.getById(id);
    if (!row) return undefined;
    return enrichLinkedFolderRow(row);
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
    const openDialogOptions: OpenDialogOptions = {
      properties: ['openDirectory'],
      title: 'Link Local Folder'
    };
    const pickResult = win ? await dialog.showOpenDialog(win, openDialogOptions) : await dialog.showOpenDialog(openDialogOptions);

    if (pickResult.canceled || pickResult.filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    const selectedPath = pickResult.filePaths[0];
    const confirmOptions: MessageBoxOptions = {
      type: 'question',
      buttons: ['Authorize', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
      title: 'Authorize Local Folder',
      message: 'Add this folder to resource management?',
      detail: `Path: ${selectedPath}\n\nThe app will scan the folder structure and store a DB index, but it will not copy original files into the workspace.`
    };
    const confirmResult = win ? await dialog.showMessageBox(win, confirmOptions) : await dialog.showMessageBox(confirmOptions);

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

  ipcMain.handle('folder.recreateLinkedMissingDirectory', async (_event, payload: { folderId: string }) => {
    const folderId = payload?.folderId;
    if (!folderId) return { success: false, error: 'invalid-folder-id' };

    try {
      const folder = await FoldersRepo.getById(folderId);
      if (!folder) return { success: false, error: 'folder-not-found' };
      if (!isLinkedFolderRow(folder)) return { success: false, error: 'linked-folder-required' };
      if (isLinkedRootFolder(folder)) return { success: false, error: 'linked-root-readonly' };

      const context = await getLinkedFolderContext(folder);
      const rootStat = await fs.stat(context.mount.absolutePath).catch(() => null);
      if (!rootStat?.isDirectory()) {
        return { success: false, error: 'linked-root-missing' };
      }

      const existingStat = await fs.stat(context.folderPath).catch(() => null);
      if (existingStat && !existingStat.isDirectory()) {
        return { success: false, error: 'linked-folder-path-conflict' };
      }

      await fs.mkdir(context.folderPath, { recursive: true });
      const result = await rescanLinkedDirectoryByFolderId(context.mount.rootFolderId || context.folder.id);
      eventManager.emit(AppEvent.FOLDER_UPDATED, result.rootFolder);

      return {
        success: true,
        data: {
          folderId: context.folder.id,
          path: context.folderPath,
          rootFolderId: result.rootFolder.id,
          stats: result.stats
        }
      };
    } catch (error: any) {
      return { success: false, error: error?.message || 'unknown' };
    }
  });

  ipcMain.handle('folder.reconnectLinkedMissingDirectory', async (_event, payload: { folderId: string }) => {
    const folderId = payload?.folderId;
    if (!folderId) return { success: false, error: 'invalid-folder-id' };

    try {
      const folder = await FoldersRepo.getById(folderId);
      if (!folder) return { success: false, error: 'folder-not-found' };
      if (!isLinkedFolderRow(folder)) return { success: false, error: 'linked-folder-required' };
      if (isLinkedRootFolder(folder)) return { success: false, error: 'linked-root-readonly' };
      if (!isLinkedMissingFolderRow(folder)) return { success: false, error: 'linked-folder-not-missing' };

      const context = await getLinkedFolderContext(folder);
      const win = BrowserWindow.getFocusedWindow();
      const pickResult = win
        ? await dialog.showOpenDialog(win, {
            properties: ['openDirectory'],
            title: '选择要重连的关联目录'
          })
        : await dialog.showOpenDialog({
            properties: ['openDirectory'],
            title: '选择要重连的关联目录'
          });
      if (pickResult.canceled || pickResult.filePaths.length === 0) {
        return { success: false, canceled: true };
      }

      const selectedPath = path.resolve(pickResult.filePaths[0]);
      const selectedStat = await fs.stat(selectedPath).catch(() => null);
      if (!selectedStat?.isDirectory()) {
        return { success: false, error: 'linked-folder-reconnect-target-not-directory' };
      }

      const reconnectTarget = await resolveLinkedMissingFolderReconnectTarget(context, folder.id, selectedPath);
      if (!reconnectTarget.target) {
        return { success: false, error: reconnectTarget.error || 'linked-folder-reconnect-target-invalid' };
      }

      const { target } = reconnectTarget;
      const row = await updateLinkedFolderTree(
        folder.id,
        context.relativePath,
        target.relativePath,
        {
          name: path.basename(selectedPath),
          parentId: target.parentFolder.id
        },
        {
          targetMount: target.mount
        }
      );
      if (row) {
        eventManager.emit(AppEvent.FOLDER_UPDATED, row);
      }

      const currentRootFolderId = context.mount.rootFolderId || (await FoldersRepo.getByLinkedRelativePath(context.mount.id, ''))?.id;
      const rootFolderIds = Array.from(new Set([currentRootFolderId, target.rootFolderId].filter((value): value is string => !!value)));
      let primaryResult = null as Awaited<ReturnType<typeof rescanLinkedDirectoryByFolderId>> | null;
      for (const rootFolderId of rootFolderIds) {
        try {
          const result = await rescanLinkedDirectoryByFolderId(rootFolderId);
          eventManager.emit(AppEvent.FOLDER_UPDATED, result.rootFolder);
          if (rootFolderId === target.rootFolderId) {
            primaryResult = result;
          }
        } catch (error) {
          if (rootFolderId === target.rootFolderId) {
            throw error;
          }
        }
      }

      if (!primaryResult) {
        throw new Error('linked-folder-reconnect-rescan-failed');
      }

      return {
        success: true,
        data: {
          folderId,
          rootFolderId: primaryResult.rootFolder.id,
          relativePath: target.relativePath,
          path: selectedPath,
          stats: primaryResult.stats
        }
      };
    } catch (error: any) {
      return { success: false, error: error?.message || 'unknown' };
    }
  });

  ipcMain.handle('folder.ignoreLinkedMissingDirectory', async (_event, payload: { folderId: string }) => {
    const folderId = payload?.folderId;
    if (!folderId) return { success: false, error: 'invalid-folder-id' };

    try {
      const folder = await FoldersRepo.getById(folderId);
      if (!folder) return { success: false, error: 'folder-not-found' };
      if (!isLinkedFolderRow(folder)) return { success: false, error: 'linked-folder-required' };
      if (isLinkedRootFolder(folder)) return { success: false, error: 'linked-root-readonly' };
      if (!isLinkedMissingFolderRow(folder)) return { success: false, error: 'linked-folder-not-missing' };

      const context = await getLinkedFolderContext(folder);
      const rows = await softDeleteLinkedFolders([folderId], {
        reason: 'linked-missing-ignore',
        moveResourceFiles: false,
        removeEmptyDirectories: false
      });
      rows.forEach((row) => eventManager.emit(AppEvent.FOLDER_UPDATED, row));

      const rootFolderId = context.mount.rootFolderId || (await FoldersRepo.getByLinkedRelativePath(context.mount.id, ''))?.id || context.folder.id;
      try {
        const result = await rescanLinkedDirectoryByFolderId(rootFolderId);
        eventManager.emit(AppEvent.FOLDER_UPDATED, result.rootFolder);
        return {
          success: true,
          data: {
            folderId,
            rootFolderId: result.rootFolder.id,
            hiddenFolderCount: rows.length,
            stats: result.stats
          }
        };
      } catch (rescanError: any) {
        return {
          success: true,
          data: {
            folderId,
            rootFolderId,
            hiddenFolderCount: rows.length,
            rescanError: rescanError?.message || 'unknown'
          }
        };
      }
    } catch (error: any) {
      return { success: false, error: error?.message || 'unknown' };
    }
  });

  ipcMain.handle('folder.unlinkLocalDirectory', async (_event, payload: { rootFolderId: string }) => {
    const rootFolderId = payload?.rootFolderId;
    if (!rootFolderId) return { success: false, error: 'invalid-root-folder-id' };

    const win = BrowserWindow.getFocusedWindow();
    const confirmOptions: MessageBoxOptions = {
      type: 'warning',
      buttons: ['Unlink', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Unlink Local Folder',
      message: 'Unlink this local folder from resource management?',
      detail: 'This only hides the indexed resources in the app. Original files on disk will not be deleted.'
    };
    const confirmResult = win ? await dialog.showMessageBox(win, confirmOptions) : await dialog.showMessageBox(confirmOptions);

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
    return enrichLinkedFolderRows(rows as any[]);
  });

  ipcMain.handle('folder.softDelete', async (_event, payload: { ids: string[] }) => {
    const { ids = [] } = payload || ({} as any);
    if (!ids.length) return { success: true, data: [] };
    const allRows = (await Promise.all(ids.map((id) => FoldersRepo.getById(id)))).filter(Boolean) as any[];
    if (allRows.some((row) => isLinkedRootFolder(row))) {
      return { success: false, error: 'linked-root-readonly', data: [] };
    }

    const linkedIds = allRows.filter((row) => isLinkedFolderRow(row)).map((row) => row.id);
    const workspaceIds = allRows.filter((row) => !isLinkedFolderRow(row)).map((row) => row.id);
    const rows = [...(workspaceIds.length ? await FoldersRepo.softDelete(workspaceIds) : []), ...(linkedIds.length ? await softDeleteLinkedFolders(linkedIds) : [])];
    if (rows.length > 0) {
      rows.forEach((row) => eventManager.emit(AppEvent.FOLDER_UPDATED, row));
    }
    return { success: true, data: rows };
  });

  ipcMain.handle('folder.restore', async (_event, payload: { ids: string[] }) => {
    const { ids = [] } = payload || ({} as any);
    if (!ids.length) return { success: true, data: [] };
    await RecycleBinRepo.restoreEntitiesByRecycleIds(ids.map((id) => `folder:${id}`));
    const afterRecycleRestore = (await Promise.all(ids.map((id) => FoldersRepo.getById(id)))).filter(Boolean) as any[];
    const fallbackIds = afterRecycleRestore.filter((row) => row.deletedAt).map((row) => row.id);
    if (fallbackIds.length) {
      await FoldersRepo.restore(fallbackIds);
    }
    const rows = (await Promise.all(ids.map((id) => FoldersRepo.getById(id)))).filter(Boolean);
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
