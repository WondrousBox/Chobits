import fs from 'node:fs/promises';
import path from 'node:path';

import type { PiSessionToolContext } from '../tool-context';
import { resolveWorkspacePath } from './path-policy';

const DEFAULT_MAX_LIST_ENTRIES = 200;
const DEFAULT_MAX_READ_CHARS = 20000;
const MAX_LIST_ENTRIES = 500;
const MAX_READ_CHARS = 200000;
const MAX_LIST_DEPTH = 8;
const LARGE_DIRECTORY_NAMES = new Set(['.git', 'coverage', 'dist', 'node_modules', 'out']);

export interface WorkspaceListEntry {
  kind: 'directory' | 'file' | 'symlink';
  modifiedAt?: number;
  name: string;
  path: string;
  sizeBytes?: number;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function countOccurrences(content: string, needle: string): number {
  if (!needle) return 0;

  let count = 0;
  let searchIndex = 0;

  while (searchIndex < content.length) {
    const nextIndex = content.indexOf(needle, searchIndex);
    if (nextIndex < 0) break;
    count += 1;
    searchIndex = nextIndex + needle.length;
  }

  return count;
}

function replaceFirstOccurrence(content: string, needle: string, replacement: string): string {
  const matchIndex = content.indexOf(needle);
  if (matchIndex < 0) return content;

  return content.slice(0, matchIndex) + replacement + content.slice(matchIndex + needle.length);
}

function detectLineEnding(content: string): '\n' | '\r\n' | undefined {
  if (content.includes('\r\n')) {
    return '\r\n';
  }

  if (content.includes('\n')) {
    return '\n';
  }

  return undefined;
}

function normalizeLineEndings(content: string, lineEnding?: '\n' | '\r\n'): string {
  if (!lineEnding) {
    return content;
  }

  return content.replace(/\r?\n/g, lineEnding);
}

function looksBinary(buffer: Buffer): boolean {
  const sampleLength = Math.min(buffer.length, 4096);

  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] === 0) {
      return true;
    }
  }

  return false;
}

export class PiWorkspaceFileService {
  constructor(private readonly toolContext: PiSessionToolContext) {}

  private getWorkspace(): NonNullable<PiSessionToolContext['coding']> {
    if (!this.toolContext.coding?.rootPath?.trim()) {
      throw new Error('Coding workspace root is not configured.');
    }

    return this.toolContext.coding;
  }

  private async readTextFile(absolutePath: string): Promise<string> {
    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${absolutePath}`);
    }

    const buffer = await fs.readFile(absolutePath);
    if (looksBinary(buffer)) {
      throw new Error(`Binary files are not supported: ${absolutePath}`);
    }

    return buffer.toString('utf8');
  }

  private async writeTextFileAtomic(absolutePath: string, content: string, mode?: number): Promise<void> {
    const directoryPath = path.dirname(absolutePath);
    const tempPath = path.join(
      directoryPath,
      `.${path.basename(absolutePath)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );

    await fs.writeFile(tempPath, content, 'utf8');

    if (typeof mode === 'number') {
      await fs.chmod(tempPath, mode);
    }

    try {
      await fs.rename(tempPath, absolutePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code !== 'EEXIST' && code !== 'EPERM') {
        throw error;
      }

      await fs.rm(absolutePath, { force: true });
      await fs.rename(tempPath, absolutePath);
    } finally {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
    }
  }

  async list(options?: {
    includeHidden?: boolean;
    includeIgnored?: boolean;
    limit?: number;
    maxDepth?: number;
    path?: string;
    recursive?: boolean;
  }): Promise<{ basePath: string; entries: WorkspaceListEntry[]; limit: number; truncated: boolean; workspaceRoot: string }> {
    const workspace = this.getWorkspace();
    const targetPath = options?.path?.trim() || '.';
    const resolvedPath = await resolveWorkspacePath(workspace, targetPath);
    const stats = await fs.stat(resolvedPath.absolutePath);

    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${resolvedPath.relativePath}`);
    }

    const recursive = options?.recursive === true;
    const includeHidden = options?.includeHidden !== false;
    const includeIgnored = options?.includeIgnored === true;
    const maxDepth = clampInteger(options?.maxDepth ?? (recursive ? 3 : 1), 0, MAX_LIST_DEPTH);
    const limit = clampInteger(options?.limit ?? DEFAULT_MAX_LIST_ENTRIES, 1, MAX_LIST_ENTRIES);
    const entries: WorkspaceListEntry[] = [];
    let truncated = false;

    const walk = async (currentAbsolutePath: string, depth: number): Promise<void> => {
      const dirents = await fs.readdir(currentAbsolutePath, { withFileTypes: true });
      dirents.sort((left, right) => {
        if (left.isDirectory() !== right.isDirectory()) {
          return left.isDirectory() ? -1 : 1;
        }
        return left.name.localeCompare(right.name);
      });

      for (const dirent of dirents) {
        if (!includeHidden && dirent.name.startsWith('.')) {
          continue;
        }

        const entryAbsolutePath = path.join(currentAbsolutePath, dirent.name);
        const entryRelativePath = path.relative(resolvedPath.workspaceRoot, entryAbsolutePath) || '.';
        const entryStats = await fs.lstat(entryAbsolutePath);
        const isSymlink = entryStats.isSymbolicLink();
        const isDirectory = dirent.isDirectory() && !isSymlink;

        entries.push({
          kind: isSymlink ? 'symlink' : isDirectory ? 'directory' : 'file',
          modifiedAt: Number.isFinite(entryStats.mtimeMs) ? Math.round(entryStats.mtimeMs) : undefined,
          name: dirent.name,
          path: entryRelativePath,
          sizeBytes: isDirectory || isSymlink ? undefined : entryStats.size
        });

        if (entries.length >= limit) {
          truncated = true;
          return;
        }

        const shouldDescend = recursive && isDirectory && depth < maxDepth;
        const isLargeDirectory = LARGE_DIRECTORY_NAMES.has(dirent.name);

        if (shouldDescend && (!isLargeDirectory || includeIgnored)) {
          await walk(entryAbsolutePath, depth + 1);
          if (truncated) {
            return;
          }
        }
      }
    };

    await walk(resolvedPath.absolutePath, 0);

    return {
      basePath: resolvedPath.relativePath,
      entries,
      limit,
      truncated,
      workspaceRoot: resolvedPath.workspaceRoot
    };
  }

  async read(options: { endLine?: number; maxChars?: number; path: string; startLine?: number }): Promise<{
    content: string;
    lineEnd: number;
    lineStart: number;
    path: string;
    totalLines: number;
    truncated: boolean;
  }> {
    const workspace = this.getWorkspace();
    const resolvedPath = await resolveWorkspacePath(workspace, options.path);
    const content = await this.readTextFile(resolvedPath.absolutePath);
    const lines = content.split(/\r?\n/);
    const totalLines = lines.length;
    const maxChars = clampInteger(options.maxChars ?? DEFAULT_MAX_READ_CHARS, 200, MAX_READ_CHARS);
    const hasRange = typeof options.startLine === 'number' || typeof options.endLine === 'number';
    const lineStart = hasRange ? clampInteger(options.startLine ?? 1, 1, Math.max(totalLines, 1)) : 1;
    const lineEnd = hasRange ? clampInteger(options.endLine ?? totalLines, lineStart, Math.max(totalLines, lineStart)) : totalLines;
    let slicedContent = hasRange ? lines.slice(lineStart - 1, lineEnd).join('\n') : content;
    let truncated = false;

    if (slicedContent.length > maxChars) {
      slicedContent = slicedContent.slice(0, maxChars);
      truncated = true;
    }

    return {
      content: slicedContent,
      lineEnd,
      lineStart,
      path: resolvedPath.relativePath,
      totalLines,
      truncated
    };
  }

  async write(options: { content: string; createDirectories?: boolean; overwrite?: boolean; path: string }): Promise<{
    created: boolean;
    path: string;
    sizeBytes: number;
  }> {
    const workspace = this.getWorkspace();
    const resolvedPath = await resolveWorkspacePath(workspace, options.path);
    const createDirectories = options.createDirectories !== false;
    let existed = false;
    let existingContent: string | undefined;
    let existingMode: number | undefined;

    try {
      const existingStats = await fs.stat(resolvedPath.absolutePath);
      existed = true;
      if (!existingStats.isFile()) {
        throw new Error(`Path is not a file: ${resolvedPath.relativePath}`);
      }
      existingMode = existingStats.mode;
      existingContent = await this.readTextFile(resolvedPath.absolutePath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code !== 'ENOENT') {
        throw error;
      }
    }

    if (existed && options.overwrite === false) {
      throw new Error(`File already exists: ${resolvedPath.relativePath}`);
    }

    if (createDirectories) {
      await fs.mkdir(path.dirname(resolvedPath.absolutePath), { recursive: true });
    }

    const nextContent = normalizeLineEndings(options.content, detectLineEnding(existingContent || ''));
    await this.writeTextFileAtomic(resolvedPath.absolutePath, nextContent, existingMode);
    const stats = await fs.stat(resolvedPath.absolutePath);

    return {
      created: !existed,
      path: resolvedPath.relativePath,
      sizeBytes: stats.size
    };
  }

  async edit(options: {
    expectedReplacements?: number;
    newText: string;
    oldText: string;
    path: string;
    replaceAll?: boolean;
  }): Promise<{
    path: string;
    replacedOccurrences: number;
    totalOccurrences: number;
  }> {
    if (!options.oldText) {
      throw new Error('oldText must not be empty.');
    }

    const workspace = this.getWorkspace();
    const resolvedPath = await resolveWorkspacePath(workspace, options.path);
    const currentContent = await this.readTextFile(resolvedPath.absolutePath);
    const lineEnding = detectLineEnding(currentContent);
    const oldText = normalizeLineEndings(options.oldText, lineEnding);
    const newText = normalizeLineEndings(options.newText, lineEnding);
    const totalOccurrences = countOccurrences(currentContent, oldText);

    if (totalOccurrences === 0) {
      throw new Error(`oldText was not found in ${resolvedPath.relativePath}.`);
    }

    if (typeof options.expectedReplacements === 'number' && totalOccurrences !== options.expectedReplacements) {
      throw new Error(`Expected ${options.expectedReplacements} matches but found ${totalOccurrences} in ${resolvedPath.relativePath}.`);
    }

    if (!options.replaceAll && typeof options.expectedReplacements !== 'number' && totalOccurrences !== 1) {
      throw new Error(
        `Found ${totalOccurrences} matches in ${resolvedPath.relativePath}. Use replaceAll=true or set expectedReplacements to make the edit deterministic.`
      );
    }

    const nextContent = options.replaceAll ? currentContent.split(oldText).join(newText) : replaceFirstOccurrence(currentContent, oldText, newText);
    const replacedOccurrences = options.replaceAll ? totalOccurrences : 1;

    const stats = await fs.stat(resolvedPath.absolutePath);
    await this.writeTextFileAtomic(resolvedPath.absolutePath, nextContent, stats.mode);

    return {
      path: resolvedPath.relativePath,
      replacedOccurrences,
      totalOccurrences
    };
  }
}
