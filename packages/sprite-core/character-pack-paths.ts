import fs from 'node:fs';
import path from 'node:path';

const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-zA-Z]:[\\/]/;

export type ContainedRelativeAssetPathResolutionError = 'not-string' | 'empty' | 'outside-root';

export interface ContainedRelativeAssetPathResolution {
  path: string | null;
  error?: ContainedRelativeAssetPathResolutionError;
}

function normalizeWindowsNamespacePath(value: string): string {
  if (value.startsWith('\\\\?\\UNC\\')) {
    return `\\\\${value.slice('\\\\?\\UNC\\'.length)}`;
  }

  if (value.startsWith('\\\\?\\')) {
    return value.slice('\\\\?\\'.length);
  }

  return value;
}

export function isPathContainedByRoot(rootDir: string, candidatePath: string): boolean {
  const relative = path.relative(normalizeWindowsNamespacePath(rootDir), normalizeWindowsNamespacePath(candidatePath));
  return relative === '' || (!!relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function isExistingPathContainedByRoot(rootDir: string, candidatePath: string): boolean | null {
  let realRootDir: string;
  try {
    realRootDir = fs.realpathSync(rootDir);
  } catch {
    return null;
  }

  try {
    return isPathContainedByRoot(realRootDir, fs.realpathSync(candidatePath));
  } catch {
    return null;
  }
}

export function isResolvedPathContainedByRoot(rootDir: string, candidatePath: string): boolean {
  const normalizedRootDir = path.resolve(normalizeWindowsNamespacePath(rootDir));
  const resolved = path.resolve(normalizeWindowsNamespacePath(candidatePath));
  const lexicalContained = isPathContainedByRoot(normalizedRootDir, resolved);
  const realContained = isExistingPathContainedByRoot(normalizedRootDir, resolved);
  return lexicalContained ? realContained !== false : realContained === true;
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
