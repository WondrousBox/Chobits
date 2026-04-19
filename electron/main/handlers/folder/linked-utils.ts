import * as fscb from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { FoldersRepo, LinkedFolderMountsRepo, WorkspacesRepo } from '../../db/repositories';
import type { FolderRow, LinkedFolderMountRow, WorkspaceRow } from '../../db/schema';
import { resolveFolderPathFromRow } from './storage';

export type LinkedFolderContext = {
  folder: FolderRow;
  mount: LinkedFolderMountRow;
  workspace?: WorkspaceRow;
  folderPath: string;
  relativePath: string;
  isRoot: boolean;
};

export function normalizeRelativePath(relativePath?: string | null): string {
  return String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

export function joinRelativePath(base: string, name: string): string {
  const normalizedBase = normalizeRelativePath(base);
  const normalizedName = normalizeRelativePath(name);
  if (!normalizedBase) return normalizedName;
  if (!normalizedName) return normalizedBase;
  return `${normalizedBase}/${normalizedName}`;
}

export function replaceRelativePathPrefix(relativePath: string, oldPrefix: string, newPrefix: string): string {
  const normalizedRelativePath = normalizeRelativePath(relativePath);
  const normalizedOldPrefix = normalizeRelativePath(oldPrefix);
  const normalizedNewPrefix = normalizeRelativePath(newPrefix);
  if (!normalizedOldPrefix) return normalizedRelativePath;
  if (normalizedRelativePath === normalizedOldPrefix) return normalizedNewPrefix;
  const oldPrefixWithSlash = `${normalizedOldPrefix}/`;
  if (!normalizedRelativePath.startsWith(oldPrefixWithSlash)) return normalizedRelativePath;
  const suffix = normalizedRelativePath.slice(oldPrefixWithSlash.length);
  return joinRelativePath(normalizedNewPrefix, suffix);
}

export function getRelativePathWithinMount(mount: Pick<LinkedFolderMountRow, 'absolutePath'>, absolutePath: string): string {
  const relativePath = path.relative(mount.absolutePath, absolutePath);
  if (!relativePath || relativePath === '.') return '';
  const normalized = normalizeRelativePath(relativePath);
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error('linked-path-outside-mount');
  }
  return normalized;
}

export async function ensureUniquePath(targetPath: string): Promise<string> {
  const dir = path.dirname(targetPath);
  const ext = path.extname(targetPath);
  const stem = path.basename(targetPath, ext);
  let candidate = targetPath;
  let counter = 1;
  while (fscb.existsSync(candidate)) {
    candidate = path.join(dir, `${stem}(${counter})${ext}`);
    counter += 1;
  }
  return candidate;
}

export async function ensureUniqueEntryName(directoryPath: string, baseName: string, takenNames: Iterable<string> = []): Promise<string> {
  const normalizedBaseName = String(baseName || '').trim() || 'New Folder';
  const taken = new Set(Array.from(takenNames, (value) => String(value)));
  let candidate = normalizedBaseName;
  let counter = 2;
  while (taken.has(candidate) || fscb.existsSync(path.join(directoryPath, candidate))) {
    candidate = `${normalizedBaseName} ${counter}`;
    counter += 1;
  }
  return candidate;
}

export async function movePathSafe(sourcePath: string, targetPath: string): Promise<void> {
  if (sourcePath === targetPath) return;
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  try {
    await fs.rename(sourcePath, targetPath);
    return;
  } catch (error: any) {
    if (error?.code !== 'EXDEV') {
      throw error;
    }
  }

  const stat = await fs.stat(sourcePath);
  if (stat.isDirectory()) {
    await fs.cp(sourcePath, targetPath, { recursive: true, errorOnExist: true, force: false });
    await fs.rm(sourcePath, { recursive: true, force: true });
    return;
  }

  await fs.copyFile(sourcePath, targetPath);
  await fs.unlink(sourcePath);
}

export async function copyPathIntoDirectory(sourcePath: string, targetDirectoryPath: string, preferredName?: string): Promise<{ targetPath: string; name: string; isDirectory: boolean }> {
  const stat = await fs.stat(sourcePath);
  await fs.mkdir(targetDirectoryPath, { recursive: true });
  const desiredTargetPath = path.join(targetDirectoryPath, preferredName || path.basename(sourcePath));
  const targetPath = await ensureUniquePath(desiredTargetPath);

  if (stat.isDirectory()) {
    await fs.cp(sourcePath, targetPath, { recursive: true, errorOnExist: true, force: false });
  } else {
    await fs.copyFile(sourcePath, targetPath);
  }

  return {
    targetPath,
    name: path.basename(targetPath),
    isDirectory: stat.isDirectory()
  };
}

export async function getLinkedFolderContext(folderOrId: string | FolderRow): Promise<LinkedFolderContext> {
  const folder = typeof folderOrId === 'string' ? await FoldersRepo.getById(folderOrId) : folderOrId;
  if (!folder) {
    throw new Error('folder-not-found');
  }
  if (folder.originType !== 'linked' || !folder.linkedMountId) {
    throw new Error('linked-folder-required');
  }

  const mount = await LinkedFolderMountsRepo.getById(folder.linkedMountId);
  if (!mount) {
    throw new Error('linked-mount-not-found');
  }

  const folderPath = await resolveFolderPathFromRow(folder);
  if (!folderPath) {
    throw new Error('linked-folder-path-unavailable');
  }

  const workspace = folder.workspaceId ? await WorkspacesRepo.getById(folder.workspaceId) : undefined;
  const relativePath = normalizeRelativePath(folder.relativePath);

  return {
    folder,
    mount,
    workspace: workspace || undefined,
    folderPath,
    relativePath,
    isRoot: relativePath === ''
  };
}
