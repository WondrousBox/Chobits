import { describe, expect, it } from 'vitest';

import { isAbsoluteFileSystemPath, shouldDeleteWorkspaceStagingSource } from '../electron/main/utils/local-file-path';

describe('local file path guards', () => {
  it('requires drive-qualified or UNC paths on Windows', () => {
    expect(isAbsoluteFileSystemPath('F:/source/example.txt', 'win32')).toBe(true);
    expect(isAbsoluteFileSystemPath('F:\\source\\example.txt', 'win32')).toBe(true);
    expect(isAbsoluteFileSystemPath('\\\\server\\share\\example.txt', 'win32')).toBe(true);
    expect(isAbsoluteFileSystemPath('/album/example.txt', 'win32')).toBe(false);
    expect(isAbsoluteFileSystemPath('./example.txt', 'win32')).toBe(false);
  });

  it('accepts absolute POSIX paths and rejects relative paths', () => {
    expect(isAbsoluteFileSystemPath('/Users/example/source.txt', 'darwin')).toBe(true);
    expect(isAbsoluteFileSystemPath('./source.txt', 'darwin')).toBe(false);
  });

  it('never deletes a managed-copy source file', () => {
    expect(
      shouldDeleteWorkspaceStagingSource({
        sourcePath: 'F:\\workspace\\resources\\old\\example.txt',
        resourcesDir: 'F:\\workspace\\resources',
        requireManagedCopy: true,
        platform: 'win32'
      })
    ).toBe(false);
  });

  it('only deletes legacy upload staging files inside the resources directory', () => {
    expect(
      shouldDeleteWorkspaceStagingSource({
        sourcePath: 'F:\\workspace\\resources\\example.txt',
        resourcesDir: 'F:\\workspace\\resources',
        requireManagedCopy: false,
        platform: 'win32'
      })
    ).toBe(true);
    expect(
      shouldDeleteWorkspaceStagingSource({
        sourcePath: 'F:\\source\\example.txt',
        resourcesDir: 'F:\\workspace\\resources',
        requireManagedCopy: false,
        platform: 'win32'
      })
    ).toBe(false);
  });
});
