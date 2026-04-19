import path from 'node:path';

import type { FolderRow } from '../../db/schema';
import { FoldersRepo, LinkedFolderMountsRepo, WorkspacesRepo } from '../../db/repositories';

function splitRelativePath(relativePath?: string | null): string[] {
  const normalized = String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  return normalized ? normalized.split('/') : [];
}

export function getWorkspaceResourcesRoot(rootPath?: string | null): string {
  return rootPath ? path.join(rootPath, 'resources') : path.join(process.cwd(), 'uploads');
}

export function getWorkspaceFoldersRoot(rootPath?: string | null): string {
  return rootPath ? path.join(rootPath, 'resources', 'folders') : path.join(process.cwd(), 'uploads', 'folders');
}

export async function resolveWorkspaceResourcesPath(workspaceId?: string | null): Promise<string | undefined> {
  const ws = workspaceId ? await WorkspacesRepo.getById(workspaceId) : await WorkspacesRepo.getDefault();
  if (!ws) return undefined;
  return getWorkspaceResourcesRoot(ws.rootPath);
}

export async function resolveFolderPathFromRow(
  folder: Pick<FolderRow, 'id' | 'workspaceId' | 'originType' | 'linkedMountId' | 'relativePath'>
): Promise<string | undefined> {
  if (folder.originType === 'linked') {
    if (!folder.linkedMountId) return undefined;
    const mount = await LinkedFolderMountsRepo.getById(folder.linkedMountId);
    if (!mount) return undefined;
    const segments = splitRelativePath(folder.relativePath);
    return segments.length ? path.join(mount.absolutePath, ...segments) : mount.absolutePath;
  }

  const ws = folder.workspaceId ? await WorkspacesRepo.getById(folder.workspaceId) : await WorkspacesRepo.getDefault();
  if (!ws) return undefined;
  return path.join(getWorkspaceFoldersRoot(ws.rootPath), folder.id);
}

export async function resolveFolderPath(folderId: string): Promise<string | undefined> {
  const folder = await FoldersRepo.getById(folderId);
  if (!folder) return undefined;
  return resolveFolderPathFromRow(folder);
}

export async function resolveFolderLayoutPath(folderId: string): Promise<string | undefined> {
  const folder = await FoldersRepo.getById(folderId);
  if (!folder) return undefined;

  if (folder.originType === 'linked') {
    const ws = folder.workspaceId ? await WorkspacesRepo.getById(folder.workspaceId) : await WorkspacesRepo.getDefault();
    if (!ws) return undefined;
    return path.join(getWorkspaceResourcesRoot(ws.rootPath), '.folder-layouts', `${folder.id}.layout.json`);
  }

  const folderPath = await resolveFolderPathFromRow(folder);
  if (!folderPath) return undefined;
  return path.join(folderPath, '.layout.json');
}
