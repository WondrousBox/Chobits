import fs from 'node:fs/promises';
import path from 'node:path';

import type { PiSessionToolContext } from '../tool-context';
import { resolveWorkspacePath } from './path-policy';

const DEFAULT_MAX_RESULTS = 100;
const MAX_RESULTS = 500;
const DEFAULT_MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_DEPTH = 8;
const LARGE_DIRECTORY_NAMES = new Set(['.git', 'coverage', 'dist', 'dist-electron', 'node_modules', 'out']);

export interface WorkspaceGlobMatch {
  path: string;
  type: 'file' | 'directory';
}

export interface WorkspaceGrepMatch {
  line: number;
  lineText: string;
  matchCount: number;
  path: string;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function normalizeForMatch(input: string): string {
  return input.replace(/\\/g, '/');
}

function escapeRegExp(input: string): string {
  return input.replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function globToRegExp(pattern: string): RegExp {
  const normalized = normalizeForMatch(pattern).replace(/^\.?\//, '');
  let source = '^';

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const nextChar = normalized[index + 1];

    if (char === '*') {
      if (nextChar === '*') {
        const nextNextChar = normalized[index + 2];
        if (nextNextChar === '/') {
          source += '(?:.*/)?';
          index += 2;
        } else {
          source += '.*';
          index += 1;
        }
      } else {
        source += '[^/]*';
      }
      continue;
    }

    if (char === '?') {
      source += '[^/]';
      continue;
    }

    if (char === '/') {
      source += '/';
      continue;
    }

    source += escapeRegExp(char);
  }

  source += '$';
  return new RegExp(source);
}

function countSubstringOccurrences(text: string, query: string, ignoreCase: boolean): number {
  if (!query) return 0;

  const haystack = ignoreCase ? text.toLowerCase() : text;
  const needle = ignoreCase ? query.toLowerCase() : query;
  let count = 0;
  let searchIndex = 0;

  while (searchIndex < haystack.length) {
    const matchIndex = haystack.indexOf(needle, searchIndex);
    if (matchIndex < 0) break;
    count += 1;
    searchIndex = matchIndex + Math.max(needle.length, 1);
  }

  return count;
}

function isBinaryBuffer(buffer: Buffer): boolean {
  const sampleLength = Math.min(buffer.length, 4096);

  for (let index = 0; index < sampleLength; index += 1) {
    if (buffer[index] === 0) {
      return true;
    }
  }

  return false;
}

function countRegexOccurrences(text: string, regex: RegExp): number {
  regex.lastIndex = 0;
  let count = 0;

  while (true) {
    const match = regex.exec(text);
    if (!match) break;

    count += 1;

    if (!regex.global) {
      break;
    }

    if (match[0].length === 0) {
      regex.lastIndex += 1;
    }
  }

  regex.lastIndex = 0;
  return count;
}

export class PiWorkspaceSearchService {
  constructor(private readonly toolContext: PiSessionToolContext) {}

  private getWorkspace(): NonNullable<PiSessionToolContext['coding']> {
    if (!this.toolContext.coding?.rootPath?.trim()) {
      throw new Error('Coding workspace root is not configured.');
    }

    return this.toolContext.coding;
  }

  private async walkWorkspaceFiles(options?: {
    basePath?: string;
    includeHidden?: boolean;
    includeIgnored?: boolean;
    maxDepth?: number;
    onDirectory?: (relativePath: string) => boolean | void;
    onFile: (args: { absolutePath: string; relativePath: string }) => Promise<boolean | void>;
  }): Promise<void> {
    if (!options?.onFile) {
      throw new Error('walkWorkspaceFiles requires an onFile handler.');
    }

    const onFile = options.onFile;
    const workspace = this.getWorkspace();
    const resolvedBasePath = await resolveWorkspacePath(workspace, options?.basePath?.trim() || '.');
    const baseStats = await fs.stat(resolvedBasePath.absolutePath);

    if (!baseStats.isDirectory()) {
      throw new Error(`Path is not a directory: ${resolvedBasePath.relativePath}`);
    }

    const includeHidden = options?.includeHidden === true;
    const includeIgnored = options?.includeIgnored === true;
    const maxDepth = clampInteger(options?.maxDepth ?? DEFAULT_MAX_DEPTH, 0, DEFAULT_MAX_DEPTH);

    const walk = async (currentAbsolutePath: string, depth: number): Promise<boolean> => {
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
        const entryRelativePath = path.relative(resolvedBasePath.workspaceRoot, entryAbsolutePath) || '.';
        const entryStats = await fs.lstat(entryAbsolutePath);

        if (entryStats.isSymbolicLink()) {
          continue;
        }

        if (dirent.isDirectory()) {
          const shouldContinue = options?.onDirectory?.(entryRelativePath);
          if (shouldContinue === false) {
            continue;
          }

          const isLargeDirectory = LARGE_DIRECTORY_NAMES.has(dirent.name);
          if (depth >= maxDepth || (isLargeDirectory && !includeIgnored)) {
            continue;
          }

          const shouldStop = await walk(entryAbsolutePath, depth + 1);
          if (shouldStop) {
            return true;
          }
          continue;
        }

        const shouldStop = await onFile({
          absolutePath: entryAbsolutePath,
          relativePath: entryRelativePath
        });

        if (shouldStop === true) {
          return true;
        }
      }

      return false;
    };

    await walk(resolvedBasePath.absolutePath, 0);
  }

  async glob(options: {
    basePath?: string;
    includeHidden?: boolean;
    includeIgnored?: boolean;
    limit?: number;
    maxDepth?: number;
    pattern: string;
  }): Promise<{ matches: WorkspaceGlobMatch[]; pattern: string; wasTruncated: boolean }> {
    const rawPattern = options.pattern.trim();
    if (!rawPattern) {
      throw new Error('pattern is required.');
    }

    const matcher = globToRegExp(rawPattern);
    const limit = clampInteger(options.limit ?? DEFAULT_MAX_RESULTS, 1, MAX_RESULTS);
    const matches: WorkspaceGlobMatch[] = [];
    let wasTruncated = false;

    await this.walkWorkspaceFiles({
      basePath: options.basePath,
      includeHidden: options.includeHidden,
      includeIgnored: options.includeIgnored,
      maxDepth: options.maxDepth,
      onDirectory: (relativePath) => {
        const normalizedPath = normalizeForMatch(relativePath);
        if (matcher.test(normalizedPath)) {
          matches.push({
            path: relativePath,
            type: 'directory'
          });
        }

        if (matches.length >= limit) {
          wasTruncated = true;
          return false;
        }

        return true;
      },
      onFile: async ({ relativePath }) => {
        const normalizedPath = normalizeForMatch(relativePath);
        if (matcher.test(normalizedPath)) {
          matches.push({
            path: relativePath,
            type: 'file'
          });
        }

        if (matches.length >= limit) {
          wasTruncated = true;
          return true;
        }

        return false;
      }
    });

    return {
      matches,
      pattern: rawPattern,
      wasTruncated
    };
  }

  async grep(options: {
    basePath?: string;
    include?: string;
    includeHidden?: boolean;
    includeIgnored?: boolean;
    ignoreCase?: boolean;
    isRegex?: boolean;
    limit?: number;
    maxDepth?: number;
    maxFileBytes?: number;
    pattern: string;
  }): Promise<{ matches: WorkspaceGrepMatch[]; pattern: string; scannedFiles: number; wasTruncated: boolean }> {
    const rawPattern = options.pattern.trim();
    if (!rawPattern) {
      throw new Error('pattern is required.');
    }

    const ignoreCase = options.ignoreCase === true;
    const isRegex = options.isRegex === true;
    const limit = clampInteger(options.limit ?? DEFAULT_MAX_RESULTS, 1, MAX_RESULTS);
    const maxFileBytes = clampInteger(options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES, 1024, MAX_FILE_BYTES);
    const includeMatcher = options.include?.trim() ? globToRegExp(options.include.trim()) : undefined;
    const regex = isRegex ? new RegExp(rawPattern, ignoreCase ? 'gi' : 'g') : undefined;
    const matches: WorkspaceGrepMatch[] = [];
    let scannedFiles = 0;
    let wasTruncated = false;

    await this.walkWorkspaceFiles({
      basePath: options.basePath,
      includeHidden: options.includeHidden,
      includeIgnored: options.includeIgnored,
      maxDepth: options.maxDepth,
      onFile: async ({ absolutePath, relativePath }) => {
        const normalizedPath = normalizeForMatch(relativePath);
        if (includeMatcher && !includeMatcher.test(normalizedPath)) {
          return false;
        }

        const stats = await fs.stat(absolutePath);
        if (stats.size > maxFileBytes) {
          return false;
        }

        const buffer = await fs.readFile(absolutePath);
        if (isBinaryBuffer(buffer)) {
          return false;
        }

        scannedFiles += 1;

        const content = buffer.toString('utf8');
        const lines = content.split(/\r?\n/);

        for (let index = 0; index < lines.length; index += 1) {
          const lineText = lines[index];
          const matchCount = regex ? countRegexOccurrences(lineText, regex) : countSubstringOccurrences(lineText, rawPattern, ignoreCase);

          if (matchCount <= 0) {
            continue;
          }

          matches.push({
            line: index + 1,
            lineText,
            matchCount,
            path: relativePath
          });

          if (matches.length >= limit) {
            wasTruncated = true;
            return true;
          }
        }

        return false;
      }
    });

    return {
      matches,
      pattern: rawPattern,
      scannedFiles,
      wasTruncated
    };
  }
}
