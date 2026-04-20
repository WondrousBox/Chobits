import * as fscb from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { eq, inArray } from 'drizzle-orm';

import { eventManager } from '../../../../packages/event';
import { AppEvent } from '../../../../packages/event/events';
import { getOrm } from '../../db';
import { FoldersRepo, LinkedFolderMountsRepo, ResourcesRepo, WorkspacesRepo } from '../../db/repositories';
import { type FolderRow, folders, type LinkedFolderMountRow, recycle_bin, type ResourceRow, resources } from '../../db/schema';
import { addAllowedResourceRoot, removeAllowedResourceRoot } from '../../resource-protocol';
import { detectBasicType, generateThumbnailForResource } from '../../utils/thumbnail';
import { getWorkspaceResourcesRoot } from './storage';

const LIST_LIMIT = 100000;
const DELETE_CHUNK_SIZE = 400;
const WATCH_DEBOUNCE_MS = 800;

type LinkedMountSyncReason = 'link' | 'manual' | 'watch' | 'startup';

const linkedMountWatchers = new Map<string, fscb.FSWatcher>();
const linkedMountSyncTimers = new Map<string, ReturnType<typeof setTimeout>>();
const linkedMountSyncPromises = new Map<string, Promise<LinkedDirectorySyncResult>>();
const linkedMountQueuedReasons = new Map<string, LinkedMountSyncReason>();

export type LinkedDirectorySyncStats = {
  folderCount: number;
  resourceCount: number;
  restoredFolderCount: number;
  restoredResourceCount: number;
  hiddenFolderCount: number;
  hiddenResourceCount: number;
  conflictCount: number;
  thumbnailCount: number;
};

export type LinkedDirectorySyncResult = {
  mount: LinkedFolderMountRow;
  rootFolder: FolderRow;
  stats: LinkedDirectorySyncStats;
  reactivated: boolean;
  alreadyLinked: boolean;
};

type LinkedMountSyncMetadata = {
  lastSyncAttemptAt?: number;
  lastSyncStatus?: 'ok' | 'root-missing' | 'error';
  lastSyncReason?: LinkedMountSyncReason;
  lastSyncError?: string | null;
  lastSyncStats?: LinkedDirectorySyncStats | null;
};

type LinkedFolderSyncState = {
  syncState: 'missing';
  issueType: 'missing-folder';
  pathStatus: 'missing';
  lastMissingAt: number;
};

function clearScheduledLinkedMountSync(mountId: string): void {
  const timer = linkedMountSyncTimers.get(mountId);
  if (timer) {
    clearTimeout(timer);
    linkedMountSyncTimers.delete(mountId);
  }
}

function emitLinkedDirectorySynced(result: LinkedDirectorySyncResult, reason: LinkedMountSyncReason): void {
  eventManager.emit(AppEvent.FOLDER_UPDATED, result.rootFolder);
  eventManager.emit(AppEvent.LINKED_DIRECTORY_SYNCED, {
    mountId: result.mount.id,
    rootFolderId: result.rootFolder.id,
    stats: result.stats,
    reason,
    success: true
  });
}

function normalizeAbsolutePath(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isPathInsideOrEqual(parentPath: string, childPath: string): boolean {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  const relative = path.relative(parent, child);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function normalizeRelativePath(relativePath?: string | null): string {
  return String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

function joinRelativePath(base: string, name: string): string {
  const normalizedBase = normalizeRelativePath(base);
  return normalizedBase ? `${normalizedBase}/${name}` : name;
}

function getDisplayName(absolutePath: string): string {
  const name = path.basename(absolutePath);
  return name || absolutePath;
}

function createEmptyStats(): LinkedDirectorySyncStats {
  return {
    folderCount: 0,
    resourceCount: 0,
    restoredFolderCount: 0,
    restoredResourceCount: 0,
    hiddenFolderCount: 0,
    hiddenResourceCount: 0,
    conflictCount: 0,
    thumbnailCount: 0
  };
}

function parseLinkedMountSyncMetadata(raw?: string | null): LinkedMountSyncMetadata {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function buildLinkedMountSyncMetadata(raw: string | null | undefined, patch: Partial<LinkedMountSyncMetadata>): string {
  return JSON.stringify({
    ...parseLinkedMountSyncMetadata(raw),
    ...patch
  });
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

function buildLinkedFolderMetadata(raw: string | null | undefined, linkedFolderState: LinkedFolderSyncState | null): string | null {
  const metadata = parseJsonObject(raw);
  if (linkedFolderState) {
    metadata.linkedFolderState = linkedFolderState;
  } else {
    delete metadata.linkedFolderState;
  }
  return Object.keys(metadata).length ? JSON.stringify(metadata) : null;
}

function resolveLinkedMountSyncFailureStatus(error: unknown): 'root-missing' | 'error' {
  return (error as any)?.message === 'linked-directory-not-found' ? 'root-missing' : 'error';
}

async function emitLinkedDirectorySyncFailed(mountId: string, reason: LinkedMountSyncReason, error: unknown): Promise<void> {
  const mount = await LinkedFolderMountsRepo.getById(mountId);
  if (!mount) return;

  const updatedMount =
    (await LinkedFolderMountsRepo.update(mount.id, {
      metadata: buildLinkedMountSyncMetadata(mount.metadata, {
        lastSyncAttemptAt: Date.now(),
        lastSyncStatus: resolveLinkedMountSyncFailureStatus(error),
        lastSyncReason: reason,
        lastSyncError: String((error as any)?.message || error || 'unknown'),
        lastSyncStats: null
      })
    } as any)) || mount;

  const rootFolder = (updatedMount.rootFolderId ? await FoldersRepo.getById(updatedMount.rootFolderId) : undefined) || (await FoldersRepo.getByLinkedRelativePath(updatedMount.id, ''));

  if (rootFolder) {
    eventManager.emit(AppEvent.FOLDER_UPDATED, rootFolder);
  }

  eventManager.emit(AppEvent.LINKED_DIRECTORY_SYNCED, {
    mountId: updatedMount.id,
    rootFolderId: rootFolder?.id,
    reason,
    success: false,
    error: String((error as any)?.message || error || 'unknown')
  });
}

async function clearRecycleEntries(entityIds: string[]): Promise<void> {
  if (!entityIds.length) return;
  const db = getOrm();
  for (let i = 0; i < entityIds.length; i += DELETE_CHUNK_SIZE) {
    const chunk = entityIds.slice(i, i + DELETE_CHUNK_SIZE);
    await db.delete(recycle_bin).where(inArray(recycle_bin.entityId, chunk)).run();
  }
}

async function listRecycleEntries(entityIds: string[]): Promise<Array<{ entityId: string; entityType: string }>> {
  if (!entityIds.length) return [];
  const db = getOrm();
  const rows: Array<{ entityId: string; entityType: string }> = [];
  for (let i = 0; i < entityIds.length; i += DELETE_CHUNK_SIZE) {
    const chunk = entityIds.slice(i, i + DELETE_CHUNK_SIZE);
    const chunkRows = (await db.select({ entityId: recycle_bin.entityId, entityType: recycle_bin.entityType }).from(recycle_bin).where(inArray(recycle_bin.entityId, chunk))) as Array<{
      entityId: string;
      entityType: string;
    }>;
    rows.push(...chunkRows);
  }
  return rows;
}

async function findMountByWorkspacePath(workspaceId: string, absolutePath: string): Promise<LinkedFolderMountRow | undefined> {
  const rows = await LinkedFolderMountsRepo.list({ workspaceId }, LIST_LIMIT, 0);
  const normalizedTarget = normalizeAbsolutePath(absolutePath);
  return rows.find((row) => normalizeAbsolutePath(row.absolutePath) === normalizedTarget);
}

async function ensureWorkspace(workspaceId?: string): Promise<NonNullable<Awaited<ReturnType<typeof WorkspacesRepo.getDefault>>>> {
  const workspace = workspaceId ? await WorkspacesRepo.getById(workspaceId) : await WorkspacesRepo.getDefault();
  if (!workspace) {
    throw new Error('workspace-not-found');
  }
  return workspace;
}

async function ensureMount(workspaceId: string, absolutePath: string): Promise<{ mount: LinkedFolderMountRow; reactivated: boolean; alreadyLinked: boolean }> {
  const now = Date.now();
  const displayName = getDisplayName(absolutePath);
  const existing = await findMountByWorkspacePath(workspaceId, absolutePath);

  if (existing) {
    const reactivated = existing.status !== 'active';
    const mount =
      (await LinkedFolderMountsRepo.update(existing.id, {
        absolutePath,
        displayName,
        authorizedAt: existing.authorizedAt || now,
        status: 'active'
      } as any)) || existing;
    return {
      mount,
      reactivated,
      alreadyLinked: !reactivated
    };
  }

  const mount = await LinkedFolderMountsRepo.create({
    workspaceId,
    absolutePath,
    displayName,
    authorizedAt: now,
    status: 'active',
    watchEnabled: 0
  } as any);

  return {
    mount,
    reactivated: false,
    alreadyLinked: false
  };
}

async function ensureRootFolder(mount: LinkedFolderMountRow): Promise<FolderRow> {
  const relativePath = '';
  const displayName = getDisplayName(mount.absolutePath);
  const existingRoot = (mount.rootFolderId ? await FoldersRepo.getById(mount.rootFolderId) : undefined) || (await FoldersRepo.getByLinkedRelativePath(mount.id, relativePath));

  let rootFolder: FolderRow;
  if (existingRoot) {
    rootFolder =
      (await FoldersRepo.upsert({
        ...existingRoot,
        name: displayName,
        parentId: null,
        workspaceId: mount.workspaceId,
        originType: 'linked',
        linkedMountId: mount.id,
        relativePath,
        deletedAt: null
      } as any)) || existingRoot;
  } else {
    rootFolder = await FoldersRepo.create({
      name: displayName,
      parentId: null,
      workspaceId: mount.workspaceId,
      originType: 'linked',
      linkedMountId: mount.id,
      relativePath
    } as any);
  }

  if (mount.rootFolderId !== rootFolder.id) {
    const updatedMount = await LinkedFolderMountsRepo.update(mount.id, {
      rootFolderId: rootFolder.id,
      displayName
    } as any);
    if (updatedMount) {
      mount = updatedMount;
    }
  }

  return rootFolder;
}

async function ensureThumbnail(workspaceRoot: string, resource: Pick<ResourceRow, 'id' | 'type' | 'title' | 'thumbnailPath'>, absolutePath: string, stats: LinkedDirectorySyncStats): Promise<void> {
  const thumbBuffer = await generateThumbnailForResource({ filePath: absolutePath, type: resource.type, title: resource.title || undefined });
  if (!thumbBuffer) return;

  const thumbsDir = path.join(getWorkspaceResourcesRoot(workspaceRoot), '.thumbs');
  await fs.mkdir(thumbsDir, { recursive: true });
  const thumbPath = path.join(thumbsDir, `${resource.id}.png`);
  await fs.writeFile(thumbPath, thumbBuffer);
  await ResourcesRepo.update(resource.id, { thumbnailPath: thumbPath } as any);
  stats.thumbnailCount += 1;
}

async function upsertLinkedFolder(
  existingFolder: FolderRow | undefined,
  payload: {
    mount: LinkedFolderMountRow;
    name: string;
    parentId: string | null;
    relativePath: string;
  },
  stats: LinkedDirectorySyncStats
): Promise<FolderRow> {
  const nextFolder = existingFolder
    ? (await FoldersRepo.upsert({
        ...existingFolder,
        name: payload.name,
        parentId: payload.parentId,
        workspaceId: payload.mount.workspaceId,
        originType: 'linked',
        linkedMountId: payload.mount.id,
        relativePath: payload.relativePath,
        metadata: buildLinkedFolderMetadata(existingFolder.metadata, null),
        deletedAt: null
      } as any)) || existingFolder
    : await FoldersRepo.create({
        name: payload.name,
        parentId: payload.parentId,
        workspaceId: payload.mount.workspaceId,
        originType: 'linked',
        linkedMountId: payload.mount.id,
        relativePath: payload.relativePath
      } as any);

  if (existingFolder?.deletedAt) {
    stats.restoredFolderCount += 1;
  }

  stats.folderCount += 1;
  return nextFolder;
}

async function upsertLinkedResource(
  existingResource: ResourceRow | undefined,
  payload: {
    mount: LinkedFolderMountRow;
    workspaceRoot: string;
    absolutePath: string;
    fileName: string;
    folderId: string;
    relativePath: string;
    mtimeMs: number;
    sizeBytes: number;
    markConflicts: boolean;
  },
  stats: LinkedDirectorySyncStats
): Promise<ResourceRow | undefined> {
  const detected = detectBasicType(payload.absolutePath);
  const previousMtime = typeof existingResource?.externalMtimeMs === 'number' ? Math.round(existingResource.externalMtimeMs) : null;
  const previousSize = typeof existingResource?.externalSizeBytes === 'number' ? existingResource.externalSizeBytes : null;
  const currentMtime = Math.round(payload.mtimeMs);
  const hasCompleteSnapshot = previousMtime !== null && previousSize !== null;
  const diskSnapshotChanged = hasCompleteSnapshot && (previousMtime !== currentMtime || previousSize !== payload.sizeBytes);
  const shouldMarkConflict = payload.markConflicts && !!existingResource && !existingResource.deletedAt && existingResource.syncState !== 'missing' && diskSnapshotChanged;

  if (shouldMarkConflict) {
    const conflictResource = await ResourcesRepo.upsert({
      ...existingResource,
      title: payload.fileName,
      type: detected.type as any,
      mimeType: detected.mimeType,
      filePath: payload.absolutePath,
      folderId: payload.folderId,
      workspaceId: payload.mount.workspaceId,
      originType: 'linked',
      linkedMountId: payload.mount.id,
      relativePath: payload.relativePath,
      deletedAt: null,
      syncState: 'conflict'
    } as any);
    if (!conflictResource) return undefined;

    stats.resourceCount += 1;
    stats.conflictCount += 1;
    return conflictResource;
  }

  const shouldRefreshThumb = !existingResource?.thumbnailPath || diskSnapshotChanged;

  const nextResource = {
    ...(existingResource || {}),
    title: payload.fileName,
    type: detected.type as any,
    mimeType: detected.mimeType,
    filePath: payload.absolutePath,
    folderId: payload.folderId,
    workspaceId: payload.mount.workspaceId,
    sizeBytes: payload.sizeBytes,
    originType: 'linked',
    linkedMountId: payload.mount.id,
    relativePath: payload.relativePath,
    externalMtimeMs: currentMtime,
    externalSizeBytes: payload.sizeBytes,
    syncState: 'synced',
    deletedAt: null,
    collectedAt: existingResource?.collectedAt || Date.now(),
    status: existingResource?.status || 'new'
  } as any;

  const resource = await ResourcesRepo.upsert(nextResource);
  if (!resource) return undefined;

  if (existingResource?.deletedAt) {
    stats.restoredResourceCount += 1;
  }

  stats.resourceCount += 1;

  if (shouldRefreshThumb) {
    try {
      await ensureThumbnail(payload.workspaceRoot, resource, payload.absolutePath, stats);
    } catch (error) {
      console.warn('[linked-sync] thumbnail generation failed:', payload.absolutePath, error);
    }
  }

  return resource;
}

async function syncLinkedMountOnce(mountId: string, reason: LinkedMountSyncReason): Promise<LinkedDirectorySyncResult> {
  const mount = await LinkedFolderMountsRepo.getById(mountId);
  if (!mount) {
    throw new Error('linked-mount-not-found');
  }

  const workspace = await ensureWorkspace(mount.workspaceId || undefined);
  if (!workspace.rootPath) {
    throw new Error('workspace-root-not-found');
  }
  const activeMount = mount;
  const workspaceRoot = workspace.rootPath;
  const rootStat = await fs.stat(mount.absolutePath).catch(() => null);
  if (!rootStat?.isDirectory()) {
    throw new Error('linked-directory-not-found');
  }

  addAllowedResourceRoot(mount.absolutePath);

  const rootFolder = await ensureRootFolder(mount);
  const stats = createEmptyStats();
  const markConflicts = reason === 'watch' || reason === 'startup';

  const existingFolders = await FoldersRepo.list({ linkedMountId: mount.id } as any, LIST_LIMIT, 0);
  const existingResources = await ResourcesRepo.list({ linkedMountId: mount.id } as any, LIST_LIMIT, 0);
  const nestedActiveMountRoots = new Set(
    (await LinkedFolderMountsRepo.list({ workspaceId: mount.workspaceId, status: 'active' } as any, LIST_LIMIT, 0))
      .filter((candidate) => candidate.id !== mount.id && candidate.absolutePath && isPathInsideOrEqual(mount.absolutePath, candidate.absolutePath))
      .map((candidate) => normalizeAbsolutePath(candidate.absolutePath))
  );

  const folderMap = new Map<string, FolderRow>();
  const resourceMap = new Map<string, ResourceRow>();
  existingFolders.forEach((folder) => folderMap.set(normalizeRelativePath(folder.relativePath), folder));
  existingResources.forEach((resource) => resourceMap.set(normalizeRelativePath(resource.relativePath), resource));

  const seenFolders = new Set<string>();
  const seenResources = new Set<string>();
  seenFolders.add('');

  folderMap.set('', rootFolder);

  async function walkDirectory(currentAbsolutePath: string, currentRelativePath: string, parentFolder: FolderRow): Promise<void> {
    const dirents = await fs.readdir(currentAbsolutePath, { withFileTypes: true });
    dirents.sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) {
        return left.isDirectory() ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });

    for (const dirent of dirents) {
      const absoluteChildPath = path.join(currentAbsolutePath, dirent.name);
      const relativeChildPath = joinRelativePath(currentRelativePath, dirent.name);

      if (dirent.isDirectory()) {
        if (nestedActiveMountRoots.has(normalizeAbsolutePath(absoluteChildPath))) {
          continue;
        }
        const folder = await upsertLinkedFolder(
          folderMap.get(relativeChildPath),
          {
            mount: activeMount,
            name: dirent.name,
            parentId: parentFolder.id,
            relativePath: relativeChildPath
          },
          stats
        );
        folderMap.set(relativeChildPath, folder);
        seenFolders.add(relativeChildPath);
        await walkDirectory(absoluteChildPath, relativeChildPath, folder);
        continue;
      }

      if (!dirent.isFile()) {
        continue;
      }

      const fileStat = await fs.stat(absoluteChildPath).catch(() => null);
      if (!fileStat?.isFile()) {
        continue;
      }

      await upsertLinkedResource(
        resourceMap.get(relativeChildPath),
        {
          mount: activeMount,
          workspaceRoot,
          absolutePath: absoluteChildPath,
          fileName: dirent.name,
          folderId: parentFolder.id,
          relativePath: relativeChildPath,
          mtimeMs: Math.round(fileStat.mtimeMs),
          sizeBytes: Number(fileStat.size),
          markConflicts
        },
        stats
      );
      seenResources.add(relativeChildPath);
    }
  }

  await walkDirectory(mount.absolutePath, '', rootFolder);

  const missingFolders = existingFolders.filter((folder) => !seenFolders.has(normalizeRelativePath(folder.relativePath)) && !folder.deletedAt);
  const now = Date.now();
  const db = getOrm();
  const recycledEntityRows = await listRecycleEntries([...existingFolders.map((folder) => folder.id), ...existingResources.map((resource) => resource.id)]);
  const recycledFolderIds = new Set(recycledEntityRows.filter((row) => row.entityType === 'folder').map((row) => row.entityId));
  const recycledResourceIds = new Set(recycledEntityRows.filter((row) => row.entityType === 'resource').map((row) => row.entityId));
  const missingSafeFolders = missingFolders.filter((folder) => !recycledFolderIds.has(folder.id));
  const missingResources = existingResources.filter((resource) => !seenResources.has(normalizeRelativePath(resource.relativePath)) && !recycledResourceIds.has(resource.id));

  if (missingSafeFolders.length) {
    await Promise.all(
      missingSafeFolders.map((folder) =>
        db
          .update(folders)
          .set({
            metadata: buildLinkedFolderMetadata(folder.metadata, {
              syncState: 'missing',
              issueType: 'missing-folder',
              pathStatus: 'missing',
              lastMissingAt: now
            }),
            updatedAt: now
          } as any)
          .where(eq(folders.id, folder.id))
          .run()
      )
    );
    stats.hiddenFolderCount = missingSafeFolders.length;
  }

  if (missingResources.length) {
    await db
      .update(resources)
      .set({ deletedAt: null, updatedAt: now, syncState: 'missing' } as any)
      .where(
        inArray(
          resources.id,
          missingResources.map((resource) => resource.id)
        )
      )
      .run();
    stats.hiddenResourceCount = missingResources.length;
  }

  await clearRecycleEntries([...missingSafeFolders.map((folder) => folder.id), ...missingResources.map((resource) => resource.id)]);

  const updatedMount =
    (await LinkedFolderMountsRepo.update(mount.id, {
      rootFolderId: rootFolder.id,
      displayName: getDisplayName(mount.absolutePath),
      status: 'active',
      lastScanAt: now,
      metadata: buildLinkedMountSyncMetadata(mount.metadata, {
        lastSyncAttemptAt: now,
        lastSyncStatus: 'ok',
        lastSyncReason: reason,
        lastSyncError: null,
        lastSyncStats: stats
      })
    } as any)) || mount;

  return {
    mount: updatedMount,
    rootFolder,
    stats,
    reactivated: false,
    alreadyLinked: false
  };
}

async function runLinkedMountSync(mountId: string, reason: LinkedMountSyncReason): Promise<LinkedDirectorySyncResult> {
  clearScheduledLinkedMountSync(mountId);
  const existing = linkedMountSyncPromises.get(mountId);
  if (existing) {
    linkedMountQueuedReasons.set(mountId, reason);
    return existing;
  }

  const promise = (async () => {
    try {
      const result = await syncLinkedMountOnce(mountId, reason);
      emitLinkedDirectorySynced(result, reason);
      return result;
    } catch (error) {
      await emitLinkedDirectorySyncFailed(mountId, reason, error);
      throw error;
    }
  })();

  linkedMountSyncPromises.set(mountId, promise);
  try {
    return await promise;
  } finally {
    linkedMountSyncPromises.delete(mountId);
    const queuedReason = linkedMountQueuedReasons.get(mountId);
    if (queuedReason) {
      linkedMountQueuedReasons.delete(mountId);
      scheduleLinkedMountSync(mountId, queuedReason);
    }
  }
}

function scheduleLinkedMountSync(mountId: string, reason: LinkedMountSyncReason): void {
  clearScheduledLinkedMountSync(mountId);
  linkedMountSyncTimers.set(
    mountId,
    setTimeout(() => {
      linkedMountSyncTimers.delete(mountId);
      void runLinkedMountSync(mountId, reason).catch((error) => {
        console.warn('[linked-watch] sync failed:', mountId, error);
      });
    }, WATCH_DEBOUNCE_MS)
  );
}

export async function stopLinkedMountWatcher(mountId: string, options: { updateMount?: boolean } = {}): Promise<void> {
  clearScheduledLinkedMountSync(mountId);
  linkedMountQueuedReasons.delete(mountId);
  const watcher = linkedMountWatchers.get(mountId);
  linkedMountWatchers.delete(mountId);
  if (watcher) {
    try {
      watcher.close();
    } catch {
      /* ignore */
    }
  }
  if (options.updateMount !== false) {
    try {
      await LinkedFolderMountsRepo.update(mountId, { watchEnabled: 0 } as any);
    } catch {
      /* ignore */
    }
  }
}

export async function startLinkedMountWatcher(mountId: string, options: { syncOnStart?: boolean; startupReason?: LinkedMountSyncReason } = {}): Promise<boolean> {
  const mount = await LinkedFolderMountsRepo.getById(mountId);
  if (!mount?.absolutePath || mount.status !== 'active') {
    await stopLinkedMountWatcher(mountId);
    return false;
  }

  await stopLinkedMountWatcher(mount.id, { updateMount: false });

  try {
    const watcher = fscb.watch(mount.absolutePath, { recursive: true }, (_eventType, filename) => {
      const normalized = String(filename || '').replace(/\\/g, '/');
      if (normalized === '.DS_Store' || normalized.endsWith('/.DS_Store')) {
        return;
      }
      scheduleLinkedMountSync(mount.id, 'watch');
    });

    watcher.on('error', (error) => {
      console.warn('[linked-watch] watcher error:', mount.id, error);
      void stopLinkedMountWatcher(mount.id);
    });

    linkedMountWatchers.set(mount.id, watcher);
    await LinkedFolderMountsRepo.update(mount.id, { watchEnabled: 1 } as any);

    if (options.syncOnStart) {
      scheduleLinkedMountSync(mount.id, options.startupReason || 'startup');
    }
    return true;
  } catch (error) {
    console.warn('[linked-watch] start failed:', mount.id, error);
    await stopLinkedMountWatcher(mount.id);
    return false;
  }
}

export async function restoreLinkedMountWatchers(options: { syncOnStart?: boolean } = {}): Promise<void> {
  const mounts = await LinkedFolderMountsRepo.list({ status: 'active' } as any, LIST_LIMIT, 0);
  for (const mount of mounts) {
    if (!mount.absolutePath) continue;
    await startLinkedMountWatcher(mount.id, { syncOnStart: options.syncOnStart, startupReason: 'startup' });
  }
}

export async function syncLinkedMount(mountId: string, reason: LinkedMountSyncReason = 'manual'): Promise<LinkedDirectorySyncResult> {
  return runLinkedMountSync(mountId, reason);
}

export async function linkLocalDirectory(workspaceId: string | undefined, absolutePath: string): Promise<LinkedDirectorySyncResult> {
  const workspace = await ensureWorkspace(workspaceId);
  const normalizedAbsolutePath = path.resolve(absolutePath);
  const stat = await fs.stat(normalizedAbsolutePath).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error('linked-directory-not-found');
  }

  const { mount, reactivated, alreadyLinked } = await ensureMount(workspace.id, normalizedAbsolutePath);
  const synced = await syncLinkedMount(mount.id, 'link');
  await startLinkedMountWatcher(mount.id);
  return {
    ...synced,
    reactivated,
    alreadyLinked
  };
}

export async function unlinkLinkedDirectoryByFolderId(rootFolderId: string): Promise<{ mount: LinkedFolderMountRow; hiddenFolderCount: number; hiddenResourceCount: number }> {
  const mount = await LinkedFolderMountsRepo.getByRootFolderId(rootFolderId);
  if (!mount) {
    throw new Error('linked-mount-not-found');
  }

  const linkedFolders = await FoldersRepo.list({ linkedMountId: mount.id } as any, LIST_LIMIT, 0);
  const linkedResources = await ResourcesRepo.list({ linkedMountId: mount.id } as any, LIST_LIMIT, 0);
  const now = Date.now();
  const db = getOrm();

  if (linkedFolders.length) {
    await db
      .update(folders)
      .set({ deletedAt: now, updatedAt: now } as any)
      .where(eq(folders.linkedMountId, mount.id))
      .run();
  }

  if (linkedResources.length) {
    await db
      .update(resources)
      .set({ deletedAt: now, updatedAt: now } as any)
      .where(eq(resources.linkedMountId, mount.id))
      .run();
  }

  await clearRecycleEntries([...linkedFolders.map((folder) => folder.id), ...linkedResources.map((resource) => resource.id)]);
  removeAllowedResourceRoot(mount.absolutePath);
  await stopLinkedMountWatcher(mount.id, { updateMount: false });

  const updatedMount =
    (await LinkedFolderMountsRepo.update(mount.id, {
      status: 'disconnected',
      watchEnabled: 0
    } as any)) || mount;

  return {
    mount: updatedMount,
    hiddenFolderCount: linkedFolders.filter((folder) => !folder.deletedAt).length,
    hiddenResourceCount: linkedResources.filter((resource) => !resource.deletedAt).length
  };
}

export async function rescanLinkedDirectoryByFolderId(rootFolderId: string): Promise<LinkedDirectorySyncResult> {
  const mount = await LinkedFolderMountsRepo.getByRootFolderId(rootFolderId);
  if (!mount) {
    throw new Error('linked-mount-not-found');
  }
  return syncLinkedMount(mount.id, 'manual');
}
