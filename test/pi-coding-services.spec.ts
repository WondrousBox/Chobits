import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn()
}));

vi.mock('node:child_process', () => ({
  spawn: spawnMock
}));

import { PiWorkspaceFileService } from '../packages/ai/runtime/pi/coding/file-service';
import { resolveWorkspacePath } from '../packages/ai/runtime/pi/coding/path-policy';
import { PiWorkspaceSearchService } from '../packages/ai/runtime/pi/coding/search-service';
import { PiWorkspaceShellService } from '../packages/ai/runtime/pi/coding/shell-service';

function createToolContext(rootPath: string): any {
  return {
    coding: {
      rootPath
    }
  };
}

function normalizeTestPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

class MockChildProcess extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly kill = vi.fn(() => {
    this.killed = true;
  });

  killed = false;
}

async function createTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeFile(filePath: string, content: string | Buffer): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
}

async function createDirectoryLink(targetPath: string, linkPath: string): Promise<boolean> {
  try {
    await fs.symlink(targetPath, linkPath, process.platform === 'win32' ? 'junction' : 'dir');
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'EPERM' || code === 'UNKNOWN') {
      return false;
    }

    throw error;
  }
}

describe('pi coding services', () => {
  const tempDirs = new Set<string>();

  beforeEach(() => {
    spawnMock.mockReset();
  });

  afterEach(async () => {
    await Promise.all(
      [...tempDirs].map(async (dirPath) => {
        await fs.rm(dirPath, { recursive: true, force: true });
        tempDirs.delete(dirPath);
      })
    );
  });

  describe('resolveWorkspacePath', () => {
    it('rejects paths outside the selected workspace', async () => {
      const workspaceRoot = await createTempDir('pi-path-policy-');
      tempDirs.add(workspaceRoot);

      await expect(resolveWorkspacePath({ rootPath: workspaceRoot }, '../outside.txt')).rejects.toThrow(
        'Path is outside the selected coding workspace'
      );
    });

    it('rejects symlink escapes when an intermediate path points outside the workspace', async () => {
      const workspaceRoot = await createTempDir('pi-path-policy-root-');
      const outsideRoot = await createTempDir('pi-path-policy-outside-');
      tempDirs.add(workspaceRoot);
      tempDirs.add(outsideRoot);

      const escapedDir = path.join(outsideRoot, 'escaped');
      const linkPath = path.join(workspaceRoot, 'linked-outside');

      await fs.mkdir(escapedDir, { recursive: true });

      const linked = await createDirectoryLink(escapedDir, linkPath);
      if (!linked) {
        return;
      }

      await expect(resolveWorkspacePath({ rootPath: workspaceRoot }, 'linked-outside/file.txt')).rejects.toThrow(
        'Path resolves outside the selected coding workspace'
      );
    });
  });

  describe('PiWorkspaceFileService', () => {
    it('lists, reads, writes, and edits workspace files without leaving the workspace', async () => {
      const workspaceRoot = await createTempDir('pi-file-service-');
      tempDirs.add(workspaceRoot);

      await writeFile(path.join(workspaceRoot, 'src', 'demo.ts'), 'const value = 1;\nconst label = "demo";\n');
      await writeFile(path.join(workspaceRoot, 'node_modules', 'pkg', 'index.js'), 'ignored = true;\n');

      const service = new PiWorkspaceFileService(createToolContext(workspaceRoot));

      const listResult = await service.list({
        recursive: true,
        includeHidden: false
      });
      const listedPaths = listResult.entries.map((entry) => normalizeTestPath(entry.path));
      expect(listedPaths).toContain('src/demo.ts');
      expect(listedPaths).not.toContain('node_modules/pkg/index.js');

      const readResult = await service.read({
        path: 'src/demo.ts',
        startLine: 2,
        endLine: 2
      });
      expect(readResult.content).toBe('const label = "demo";');

      const writeResult = await service.write({
        path: 'notes/todo.txt',
        content: 'first\nsecond\n'
      });
      expect(writeResult.created).toBe(true);

      const editResult = await service.edit({
        path: 'notes/todo.txt',
        oldText: 'second',
        newText: 'done'
      });
      expect(editResult.replacedOccurrences).toBe(1);

      const updatedContent = await fs.readFile(path.join(workspaceRoot, 'notes', 'todo.txt'), 'utf8');
      expect(updatedContent).toBe('first\ndone\n');
    });

    it('preserves the existing file line ending style when overwriting or editing', async () => {
      const workspaceRoot = await createTempDir('pi-file-service-line-endings-');
      tempDirs.add(workspaceRoot);

      await writeFile(path.join(workspaceRoot, 'windows.txt'), 'alpha\r\nbeta\r\n');

      const service = new PiWorkspaceFileService(createToolContext(workspaceRoot));

      await service.write({
        path: 'windows.txt',
        content: 'one\ntwo\n'
      });

      let nextContent = await fs.readFile(path.join(workspaceRoot, 'windows.txt'), 'utf8');
      expect(nextContent).toBe('one\r\ntwo\r\n');

      await service.edit({
        path: 'windows.txt',
        oldText: 'one\ntwo',
        newText: 'alpha\nbeta'
      });

      nextContent = await fs.readFile(path.join(workspaceRoot, 'windows.txt'), 'utf8');
      expect(nextContent).toBe('alpha\r\nbeta\r\n');
    });

    it('requires deterministic edits when there are multiple matches', async () => {
      const workspaceRoot = await createTempDir('pi-file-service-edit-');
      tempDirs.add(workspaceRoot);

      await writeFile(path.join(workspaceRoot, 'multi.txt'), 'alpha\nalpha\n');

      const service = new PiWorkspaceFileService(createToolContext(workspaceRoot));

      await expect(
        service.edit({
          path: 'multi.txt',
          oldText: 'alpha',
          newText: 'beta'
        })
      ).rejects.toThrow('Use replaceAll=true or set expectedReplacements');
    });

    it('rejects overwriting a binary file with text content', async () => {
      const workspaceRoot = await createTempDir('pi-file-service-binary-write-');
      tempDirs.add(workspaceRoot);

      await writeFile(path.join(workspaceRoot, 'asset.bin'), Buffer.from([0, 1, 2, 3]));

      const service = new PiWorkspaceFileService(createToolContext(workspaceRoot));

      await expect(
        service.write({
          path: 'asset.bin',
          content: 'not allowed'
        })
      ).rejects.toThrow('Binary files are not supported');
    });
  });

  describe('PiWorkspaceSearchService', () => {
    it('glob skips hidden and ignored directories by default', async () => {
      const workspaceRoot = await createTempDir('pi-search-glob-');
      tempDirs.add(workspaceRoot);

      await writeFile(path.join(workspaceRoot, 'src', 'app.ts'), 'export const alpha = 1;\n');
      await writeFile(path.join(workspaceRoot, '.hidden.ts'), 'export const hidden = true;\n');
      await writeFile(path.join(workspaceRoot, 'node_modules', 'pkg', 'index.ts'), 'export const ignored = true;\n');

      const service = new PiWorkspaceSearchService(createToolContext(workspaceRoot));
      const result = await service.glob({
        pattern: '**/*.ts'
      });

      expect(result.matches.map((match) => ({ ...match, path: normalizeTestPath(match.path) }))).toEqual([
        {
          path: 'src/app.ts',
          type: 'file'
        }
      ]);
    });

    it('grep searches text files, skips binary files, and respects include filters', async () => {
      const workspaceRoot = await createTempDir('pi-search-grep-');
      tempDirs.add(workspaceRoot);

      await writeFile(path.join(workspaceRoot, 'src', 'match.ts'), 'const alpha = 1;\nalpha();\n');
      await writeFile(path.join(workspaceRoot, 'docs', 'readme.md'), 'no hits here\n');
      await writeFile(path.join(workspaceRoot, '.hidden.txt'), 'alpha hidden\n');
      await writeFile(path.join(workspaceRoot, 'bin.dat'), Buffer.from([0, 1, 2, 3]));
      await writeFile(path.join(workspaceRoot, 'node_modules', 'pkg', 'index.ts'), 'alpha ignored\n');

      const service = new PiWorkspaceSearchService(createToolContext(workspaceRoot));
      const result = await service.grep({
        pattern: 'alpha',
        include: '**/*.ts'
      });

      expect(result.scannedFiles).toBe(1);
      expect(result.matches.map((match) => ({ ...match, path: normalizeTestPath(match.path) }))).toEqual([
        {
          path: 'src/match.ts',
          line: 1,
          lineText: 'const alpha = 1;',
          matchCount: 1
        },
        {
          path: 'src/match.ts',
          line: 2,
          lineText: 'alpha();',
          matchCount: 1
        }
      ]);
    });
  });

  describe('PiWorkspaceShellService', () => {
    it('runs safe git commands inside the selected workspace', async () => {
      const workspaceRoot = await createTempDir('pi-shell-git-workspace-');
      const binRoot = await createTempDir('pi-shell-git-bin-');
      tempDirs.add(workspaceRoot);
      tempDirs.add(binRoot);

      const executableName = process.platform === 'win32' ? 'git.exe' : 'git';
      const gitExecutable = path.join(binRoot, executableName);
      await writeFile(gitExecutable, '');

      const previousPath = process.env.PATH;
      process.env.PATH = `${binRoot}${path.delimiter}${previousPath || ''}`;

      spawnMock.mockImplementation(() => {
        const child = new MockChildProcess();
        queueMicrotask(() => {
          child.stdout.emit('data', Buffer.from(' M src/demo.ts\n'));
          child.emit('close', 0);
        });
        return child;
      });

      try {
        const service = new PiWorkspaceShellService(createToolContext(workspaceRoot));
        const result = await service.run({
          command: 'git'
        });

        expect(spawnMock).toHaveBeenCalledTimes(1);
        expect(spawnMock).toHaveBeenCalledWith(
          gitExecutable,
          ['status', '--short'],
          expect.objectContaining({
            cwd: workspaceRoot,
            shell: false,
            windowsHide: true
          })
        );
        expect(result.ok).toBe(true);
        expect(result.stdout).toContain('src/demo.ts');
        expect(result.cwd).toBe('.');
      } finally {
        process.env.PATH = previousPath;
      }
    });

    it('injects node-based runners for tsc and vitest', async () => {
      const workspaceRoot = await createTempDir('pi-shell-node-runners-');
      tempDirs.add(workspaceRoot);

      const tscScript = path.join(workspaceRoot, 'node_modules', 'typescript', 'bin', 'tsc');
      const vitestScript = path.join(workspaceRoot, 'node_modules', 'vitest', 'vitest.mjs');
      await writeFile(tscScript, '');
      await writeFile(vitestScript, '');

      spawnMock.mockImplementation(() => {
        const child = new MockChildProcess();
        queueMicrotask(() => {
          child.emit('close', 0);
        });
        return child;
      });

      const service = new PiWorkspaceShellService(createToolContext(workspaceRoot));

      await service.run({
        command: 'tsc',
        args: ['tsconfig.json']
      });
      await service.run({
        command: 'vitest',
        args: ['test/pi-coding-services.spec.ts']
      });

      expect(spawnMock).toHaveBeenNthCalledWith(
        1,
        process.execPath,
        [tscScript, '--noEmit', 'tsconfig.json'],
        expect.objectContaining({
          env: expect.objectContaining({
            ELECTRON_RUN_AS_NODE: '1'
          })
        })
      );
      expect(spawnMock).toHaveBeenNthCalledWith(
        2,
        process.execPath,
        [vitestScript, 'run', 'test/pi-coding-services.spec.ts'],
        expect.objectContaining({
          env: expect.objectContaining({
            ELECTRON_RUN_AS_NODE: '1'
          })
        })
      );
    });

    it('rejects unsupported commands and dangerous flags', async () => {
      const workspaceRoot = await createTempDir('pi-shell-reject-');
      tempDirs.add(workspaceRoot);

      const service = new PiWorkspaceShellService(createToolContext(workspaceRoot));

      await expect(
        service.run({
          command: 'git',
          args: ['checkout', 'main']
        })
      ).rejects.toThrow('Unsupported git subcommand');

      await expect(
        service.run({
          command: 'vitest',
          args: ['--watch']
        })
      ).rejects.toThrow('Unsupported vitest argument');
    });

    it('marks output as truncated when command output exceeds the configured limit', async () => {
      const workspaceRoot = await createTempDir('pi-shell-truncate-');
      const binRoot = await createTempDir('pi-shell-truncate-bin-');
      tempDirs.add(workspaceRoot);
      tempDirs.add(binRoot);

      const executableName = process.platform === 'win32' ? 'git.exe' : 'git';
      const gitExecutable = path.join(binRoot, executableName);
      await writeFile(gitExecutable, '');

      const previousPath = process.env.PATH;
      process.env.PATH = `${binRoot}${path.delimiter}${previousPath || ''}`;

      const child = new MockChildProcess();
      spawnMock.mockImplementation(() => {
        queueMicrotask(() => {
          child.stdout.emit('data', Buffer.from('x'.repeat(9000)));
          child.emit('close', null);
        });
        return child;
      });

      try {
        const service = new PiWorkspaceShellService(createToolContext(workspaceRoot));
        const result = await service.run({
          command: 'git',
          maxOutputBytes: 16
        });

        expect(child.kill).toHaveBeenCalledTimes(1);
        expect(result.truncated).toBe(true);
        expect(result.ok).toBe(false);
        expect(result.maxOutputBytes).toBe(8192);
        expect(result.stdout.length).toBe(8192);
      } finally {
        process.env.PATH = previousPath;
      }
    });
  });
});
