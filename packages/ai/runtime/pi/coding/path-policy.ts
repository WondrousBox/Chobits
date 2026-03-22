import fs from 'node:fs/promises';
import path from 'node:path';

import type { PiCodingWorkspaceContext } from '../contracts';

export interface ResolvedWorkspacePath {
  absolutePath: string;
  relativePath: string;
  workspaceRoot: string;
}

function isWithinPath(parentPath: string, targetPath: string): boolean {
  const relative = path.relative(parentPath, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function resolveWorkspaceRoot(workspace: PiCodingWorkspaceContext): Promise<string> {
  const rootPath = workspace.rootPath.trim();
  if (!rootPath) {
    throw new Error('Coding workspace root is not configured.');
  }

  const resolvedRootPath = path.resolve(rootPath);

  try {
    const stats = await fs.stat(resolvedRootPath);
    if (!stats.isDirectory()) {
      throw new Error(`Coding workspace root is not a directory: ${resolvedRootPath}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to access coding workspace root: ${message}`);
  }

  return resolvedRootPath;
}

async function findNearestExistingPath(targetPath: string, workspaceRoot: string): Promise<string | undefined> {
  let currentPath = targetPath;

  while (isWithinPath(workspaceRoot, currentPath)) {
    try {
      await fs.lstat(currentPath);
      return currentPath;
    } catch {
      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        return undefined;
      }
      currentPath = parentPath;
    }
  }

  return undefined;
}

export async function resolveWorkspacePath(workspace: PiCodingWorkspaceContext, filePath: string): Promise<ResolvedWorkspacePath> {
  const rawPath = filePath.trim();
  if (!rawPath) {
    throw new Error('File path is required.');
  }

  const workspaceRoot = await resolveWorkspaceRoot(workspace);
  const workspaceRootRealPath = await fs.realpath(workspaceRoot);
  const absolutePath = path.resolve(workspaceRoot, rawPath);

  if (!isWithinPath(workspaceRoot, absolutePath)) {
    throw new Error(`Path is outside the selected coding workspace: ${rawPath}`);
  }

  const nearestExistingPath = await findNearestExistingPath(absolutePath, workspaceRoot);
  if (nearestExistingPath) {
    const nearestExistingRealPath = await fs.realpath(nearestExistingPath);
    if (!isWithinPath(workspaceRootRealPath, nearestExistingRealPath)) {
      throw new Error(`Path resolves outside the selected coding workspace: ${rawPath}`);
    }
  }

  return {
    absolutePath,
    relativePath: path.relative(workspaceRoot, absolutePath) || '.',
    workspaceRoot
  };
}
