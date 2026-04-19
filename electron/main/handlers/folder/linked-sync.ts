import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { eq, inArray } from 'drizzle-orm';

import { getOrm } from '../../db';
import { FoldersRepo, LinkedFolderMountsRepo, ResourcesRepo, WorkspacesRepo } from '../../db/repositories';
import { folders, recycle_bin, resources, type FolderRow, type LinkedFolderMountRow, type ResourceRow } from '../../db/schema';
import { addAllowedResourceRoot, removeAllowedResourceRoot } from '../../resource-protocol';
import { detectBasicType, generateThumbnailForResource } from '../../utils/thumbnail';
import { getWorkspaceResourcesRoot } from './storage';

const LIST_LIMIT = 100000;
const DELETE_CHUNK_SIZE = 400;

export type LinkedDirectorySyncStats = {
  folderCount: number;
  resourceCount: number;
  restoredFolderCount: number;
  restoredResourceCount: number;
  hiddenFolderCount: number;
  hiddenResourceCount: number;
  thumbnailCount: number;
};

export type LinkedDirectorySyncResult = {
  mount: LinkedFolderMountRow;
  rootFolder: FolderRow;
  stats: LinkedDirectorySyncStats;
  reactivated: boolean;
  alreadyLinked: boolean;
};

function normalizeAbsolutePath(targetPath: string): string {
  const resolved = path.resolve(targetPath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
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
    thumbnailCount: 0
  };
}

async function clearRecycleEntries(entityIds: string[]): Promise<void> {
  if (!entityIds.length) return;
  const db = getOrm();
  for (let i = 0; i < entityIds.length; i += DELETE_CHUNK_SIZE) {
    const chunk = entityIds.slice(i, i + DELETE_CHUNK_SIZE);
    await db.delete(recycle_bin).where(inArray(recycle_bin.entityId, chunk)).run();
  }
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

async function ensureThumbnail(
  workspaceRoot: string,
  resource: Pick<ResourceRow, 'id' | 'type' | 'title' | 'thumbnailPath'>,
  absolutePath: string,
  stats: LinkedDirectorySyncStats
): Promise<void> {
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
    ? ((await FoldersRepo.upsert({
        ...existingFolder,
        name: payload.name,
        parentId: payload.parentId,
        workspaceId: payload.mount.workspaceId,
        originType: 'linked',
        linkedMountId: payload.mount.id,
        relativePath: payload.relativePath,
        deletedAt: null
      } as any)) || existingFolder)
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
  },
  stats: LinkedDirectorySyncStats
): Promise<ResourceRow | undefined> {
  const detected = detectBasicType(payload.absolutePath);
  const shouldRefreshThumb =
    !existingResource?.thumbnailPath ||
    existingResource.externalMtimeMs !== payload.mtimeMs ||
    existingResource.externalSizeBytes !== payload.sizeBytes;

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
    externalMtimeMs: payload.mtimeMs,
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

export async function syncLinkedMount(mountId: string): Promise<LinkedDirectorySyncResult> {
  const mount = await LinkedFolderMountsRepo.getById(mountId);
  if (!mount) {
    throw new Error('linked-mount-not-found');
  }

  const workspace = await ensureWorkspace(mount.workspaceId || undefined);
  const rootStat = await fs.stat(mount.absolutePath).catch(() => null);
  if (!rootStat?.isDirectory()) {
    throw new Error('linked-directory-not-found');
  }

  addAllowedResourceRoot(mount.absolutePath);

  const rootFolder = await ensureRootFolder(mount);
  const stats = createEmptyStats();

  const existingFolders = await FoldersRepo.list({ linkedMountId: mount.id } as any, LIST_LIMIT, 0);
  const existingResources = await ResourcesRepo.list({ linkedMountId: mount.id } as any, LIST_LIMIT, 0);

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
        const folder = await upsertLinkedFolder(folderMap.get(relativeChildPath), {
          mount,
          name: dirent.name,
          parentId: parentFolder.id,
          relativePath: relativeChildPath
        }, stats);
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

      await upsertLinkedResource(resourceMap.get(relativeChildPath), {
        mount,
        workspaceRoot: workspace.rootPath,
        absolutePath: absoluteChildPath,
        fileName: dirent.name,
        folderId: parentFolder.id,
        relativePath: relativeChildPath,
        mtimeMs: Math.round(fileStat.mtimeMs),
        sizeBytes: Number(fileStat.size)
      }, stats);
      seenResources.add(relativeChildPath);
    }
  }

  await walkDirectory(mount.absolutePath, '', rootFolder);

  const missingFolders = existingFolders.filter((folder) => !seenFolders.has(normalizeRelativePath(folder.relativePath)) && !folder.deletedAt);
  const missingResources = existingResources.filter((resource) => !seenResources.has(normalizeRelativePath(resource.relativePath)) && !resource.deletedAt);
  const now = Date.now();
  const db = getOrm();

  if (missingFolders.length) {
    await db.update(folders).set({ deletedAt: now, updatedAt: now } as any).where(inArray(folders.id, missingFolders.map((folder) => folder.id))).run();
    stats.hiddenFolderCount = missingFolders.length;
  }

  if (missingResources.length) {
    await db
      .update(resources)
      .set({ deletedAt: now, updatedAt: now, syncState: 'missing' } as any)
      .where(inArray(resources.id, missingResources.map((resource) => resource.id)))
      .run();
    stats.hiddenResourceCount = missingResources.length;
  }

  await clearRecycleEntries([...missingFolders.map((folder) => folder.id), ...missingResources.map((resource) => resource.id)]);

  const updatedMount =
    (await LinkedFolderMountsRepo.update(mount.id, {
      rootFolderId: rootFolder.id,
      displayName: getDisplayName(mount.absolutePath),
      status: 'active',
      lastScanAt: now
    } as any)) || mount;

  return {
    mount: updatedMount,
    rootFolder,
    stats,
    reactivated: false,
    alreadyLinked: false
  };
}

export async function linkLocalDirectory(workspaceId: string | undefined, absolutePath: string): Promise<LinkedDirectorySyncResult> {
  const workspace = await ensureWorkspace(workspaceId);
  const normalizedAbsolutePath = path.resolve(absolutePath);
  const stat = await fs.stat(normalizedAbsolutePath).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error('linked-directory-not-found');
  }

  const { mount, reactivated, alreadyLinked } = await ensureMount(workspace.id, normalizedAbsolutePath);
  const synced = await syncLinkedMount(mount.id);
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
    await db.update(folders).set({ deletedAt: now, updatedAt: now } as any).where(eq(folders.linkedMountId, mount.id)).run();
  }

  if (linkedResources.length) {
    await db.update(resources).set({ deletedAt: now, updatedAt: now } as any).where(eq(resources.linkedMountId, mount.id)).run();
  }

  await clearRecycleEntries([...linkedFolders.map((folder) => folder.id), ...linkedResources.map((resource) => resource.id)]);
  removeAllowedResourceRoot(mount.absolutePath);

  const updatedMount =
    (await LinkedFolderMountsRepo.update(mount.id, {
      status: 'disconnected'
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
  return syncLinkedMount(mount.id);
}
