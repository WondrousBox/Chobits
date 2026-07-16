import path from 'node:path';

export function isAbsoluteFileSystemPath(value: string | undefined, platform: NodeJS.Platform = process.platform): value is string {
  if (!value) return false;
  if (platform === 'win32') {
    return /^[A-Za-z]:[\\/]/.test(value) || /^\\\\/.test(value);
  }
  return path.posix.isAbsolute(value);
}

export function isPathInsideDirectory(filePath: string, directoryPath: string, platform: NodeJS.Platform = process.platform): boolean {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const relative = pathApi.relative(pathApi.resolve(directoryPath), pathApi.resolve(filePath));
  return relative === '' || (!!relative && !relative.startsWith('..') && !pathApi.isAbsolute(relative));
}

export function shouldDeleteWorkspaceStagingSource(input: { sourcePath: string; resourcesDir: string; requireManagedCopy: boolean; platform?: NodeJS.Platform }): boolean {
  if (input.requireManagedCopy) return false;
  return isPathInsideDirectory(input.sourcePath, input.resourcesDir, input.platform);
}
