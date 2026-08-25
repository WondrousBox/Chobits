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

import { DEFAULT_CODER_TOOL_IDS } from '../../packages/ai/runtime/pi/tool-registry';
import { createPiFileEditTool } from '../../packages/ai/runtime/pi/tools/file-edit';
import { createPiFileGlobTool } from '../../packages/ai/runtime/pi/tools/file-glob';
import { createPiFileGrepTool } from '../../packages/ai/runtime/pi/tools/file-grep';
import { createPiFileListTool } from '../../packages/ai/runtime/pi/tools/file-list';
import { createPiFileReadTool } from '../../packages/ai/runtime/pi/tools/file-read';
import { createPiFileWriteTool } from '../../packages/ai/runtime/pi/tools/file-write';
import { createPiShellExecTool } from '../../packages/ai/runtime/pi/tools/shell-exec';

class MockChildProcess extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly kill = vi.fn();
}

function normalizePathForAssert(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function createToolContext(workspaceRoot: string): any {
  return {
    coding: {
      rootPath: workspaceRoot,
      label: path.basename(workspaceRoot),
      mode: 'safe',
      source: 'manual'
    }
  };
}

function getToolDetails(result: any): any {
  return result?.details;
}

function getToolByName(tools: any[], name: string): any {
  const tool = tools.find((entry) => entry.name === name);
  if (!tool) {
    throw new Error(`Tool not found: ${name}`);
  }
  return tool;
}

function createCoderTools(workspaceRoot: string): any[] {
  const toolContext = createToolContext(workspaceRoot);

  return [
    createPiFileListTool(toolContext),
    createPiFileReadTool(toolContext),
    createPiFileGlobTool(toolContext),
    createPiFileGrepTool(toolContext),
    createPiFileWriteTool(toolContext),
    createPiFileEditTool(toolContext),
    createPiShellExecTool(toolContext)
  ];
}

async function createTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeFile(filePath: string, content: string | Buffer): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
}

describe('coding agent tool integration', () => {
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

  it('registers the default coder toolchain in the expected order', () => {
    const tools = createCoderTools(process.cwd());

    expect(DEFAULT_CODER_TOOL_IDS).toEqual(['file-list', 'file-read', 'file-glob', 'file-grep', 'file-write', 'file-edit', 'shell-exec']);
    expect(tools.map((tool) => tool.name)).toEqual([
      'fileListTool',
      'fileReadTool',
      'fileGlobTool',
      'fileGrepTool',
      'fileWriteTool',
      'fileEditTool',
      'shellExecTool'
    ]);
  });

  it('executes a read-search-edit-write workflow inside the selected workspace', async () => {
    const workspaceRoot = await createTempDir('coding-agent-workflow-');
    tempDirs.add(workspaceRoot);

    await writeFile(path.join(workspaceRoot, 'package.json'), '{\n  "name": "demo"\n}\n');
    await writeFile(path.join(workspaceRoot, 'src', 'app.ts'), 'export function hello() {\n  return "hello";\n}\n');

    const tools = createCoderTools(workspaceRoot);

    const fileListTool = getToolByName(tools, 'fileListTool');
    const fileReadTool = getToolByName(tools, 'fileReadTool');
    const fileGlobTool = getToolByName(tools, 'fileGlobTool');
    const fileGrepTool = getToolByName(tools, 'fileGrepTool');
    const fileWriteTool = getToolByName(tools, 'fileWriteTool');
    const fileEditTool = getToolByName(tools, 'fileEditTool');

    const listResult = getToolDetails(await fileListTool.execute('call-1', { path: 'src', recursive: true }));
    expect(listResult.success).toBe(true);
    expect(listResult.entries.map((entry: any) => normalizePathForAssert(entry.path))).toContain('src/app.ts');

    const readResult = getToolDetails(await fileReadTool.execute('call-2', { path: 'src/app.ts' }));
    expect(readResult.success).toBe(true);
    expect(readResult.content).toContain('return "hello";');

    const globResult = getToolDetails(await fileGlobTool.execute('call-3', { pattern: 'src/**/*.ts' }));
    expect(globResult.success).toBe(true);
    expect(globResult.matches.map((entry: any) => normalizePathForAssert(entry.path))).toEqual(['src/app.ts']);

    const grepResult = getToolDetails(await fileGrepTool.execute('call-4', { pattern: 'hello', include: 'src/**/*.ts' }));
    expect(grepResult.success).toBe(true);
    expect(grepResult.matches).toHaveLength(2);

    const editResult = getToolDetails(
      await fileEditTool.execute('call-5', {
        path: 'src/app.ts',
        oldText: 'return "hello";',
        newText: 'return "updated";'
      })
    );
    expect(editResult.success).toBe(true);
    expect(editResult.replacedOccurrences).toBe(1);

    const writeResult = getToolDetails(
      await fileWriteTool.execute('call-6', {
        path: 'notes/result.txt',
        content: 'workflow complete\n'
      })
    );
    expect(writeResult.success).toBe(true);
    expect(writeResult.created).toBe(true);

    expect(await fs.readFile(path.join(workspaceRoot, 'src', 'app.ts'), 'utf8')).toContain('return "updated";');
    expect(await fs.readFile(path.join(workspaceRoot, 'notes', 'result.txt'), 'utf8')).toBe('workflow complete\n');
  });

  it('returns structured tool errors for paths outside the selected workspace', async () => {
    const workspaceRoot = await createTempDir('coding-agent-guard-');
    tempDirs.add(workspaceRoot);

    const tools = createCoderTools(workspaceRoot);
    const fileReadTool = getToolByName(tools, 'fileReadTool');

    const result = getToolDetails(await fileReadTool.execute('call-7', { path: '../outside.txt' }));

    expect(result.success).toBe(false);
    expect(result.error).toContain('outside the selected coding workspace');
  });

  it('executes the restricted shell tool through the registered coder toolset', async () => {
    const workspaceRoot = await createTempDir('coding-agent-shell-');
    tempDirs.add(workspaceRoot);

    const tscScriptPath = path.join(workspaceRoot, 'node_modules', 'typescript', 'bin', 'tsc');
    await writeFile(tscScriptPath, '');

    spawnMock.mockImplementation(() => {
      const child = new MockChildProcess();
      queueMicrotask(() => {
        child.stdout.emit('data', Buffer.from('tsc ok'));
        child.emit('close', 0);
      });
      return child;
    });

    const tools = createCoderTools(workspaceRoot);
    const shellExecTool = getToolByName(tools, 'shellExecTool');

    const result = getToolDetails(
      await shellExecTool.execute('call-8', {
        command: 'tsc',
        args: ['tsconfig.json']
      })
    );

    expect(result.success).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain('tsc ok');
    expect(spawnMock).toHaveBeenCalledWith(
      process.execPath,
      [tscScriptPath, '--noEmit', 'tsconfig.json'],
      expect.objectContaining({
        cwd: workspaceRoot,
        env: expect.objectContaining({
          ELECTRON_RUN_AS_NODE: '1'
        })
      })
    );
  });
});
