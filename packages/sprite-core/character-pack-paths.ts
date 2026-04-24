import fs from 'node:fs';
import path from 'node:path';

const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-zA-Z]:[\\/]/;

export type ContainedRelativeAssetPathResolutionError = 'not-string' | 'empty' | 'outside-root';

export interface ContainedRelativeAssetPathResolution {
  path: string | null;
  error?: ContainedRelativeAssetPathResolutionError;
}

export function isPathContainedByRoot(rootDir: string, candidatePath: string): boolean {
  const relative = path.relative(rootDir, candidatePath);
  return relative === '' || (!!relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function isExistingPathContainedByRoot(rootDir: string, candidatePath: string): boolean {
  let realRootDir: string;
  try {
    realRootDir = fs.realpathSync(rootDir);
  } catch {
    return true;
  }

  try {
    return isPathContainedByRoot(realRootDir, fs.realpathSync(candidatePath));
  } catch {
    return true;
  }
}

export function isResolvedPathContainedByRoot(rootDir: string, candidatePath: string): boolean {
  const normalizedRootDir = path.resolve(rootDir);
  const resolved = path.resolve(candidatePath);
  return isPathContainedByRoot(normalizedRootDir, resolved) && isExistingPathContainedByRoot(normalizedRootDir, resolved);
}

export function resolveContainedRelativeAssetPathWithDiagnostics(baseDir: string, candidate: unknown, containmentRootDir = baseDir): ContainedRelativeAssetPathResolution {
  if (typeof candidate !== 'string') {
    return { path: null, error: 'not-string' };
  }

  const normalized = candidate.trim();
  if (!normalized || path.isAbsolute(normalized) || WINDOWS_ABSOLUTE_PATH_PATTERN.test(normalized)) {
    return { path: null, error: normalized ? 'outside-root' : 'empty' };
  }

  const resolved = path.resolve(baseDir, normalized);
  if (!isResolvedPathContainedByRoot(containmentRootDir, resolved)) {
    return { path: null, error: 'outside-root' };
  }

  return { path: resolved };
}

export function resolveContainedRelativeAssetPath(baseDir: string, candidate: unknown, containmentRootDir = baseDir): string | null {
  return resolveContainedRelativeAssetPathWithDiagnostics(baseDir, candidate, containmentRootDir).path;
}

export function resolvePackRelativeAssetPath(rootDir: string, candidate: unknown): string | null {
  return resolveContainedRelativeAssetPath(rootDir, candidate, rootDir);
}

export function resolvePackRelativeAssetPathWithDiagnostics(rootDir: string, candidate: unknown): ContainedRelativeAssetPathResolution {
  return resolveContainedRelativeAssetPathWithDiagnostics(rootDir, candidate, rootDir);
}
