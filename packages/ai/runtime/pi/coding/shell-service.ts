import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { PiSessionToolContext } from '../tool-context';
import { resolveWorkspacePath } from './path-policy';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_OUTPUT_BYTES = 256 * 1024;
const MAX_OUTPUT_BYTES = 1024 * 1024;

export type CodingShellCommand = 'git' | 'tsc' | 'vitest';

export interface CodingShellExecutionResult {
  args: string[];
  command: CodingShellCommand;
  commandLine: string;
  cwd: string;
  durationMs: number;
  exitCode: number | null;
  maxOutputBytes: number;
  ok: boolean;
  stderr: string;
  stdout: string;
  hasTimedOut: boolean;
  truncated: boolean;
}

type ResolvedCommandSpec = {
  args: string[];
  commandLine: string;
  executable: string;
  injectedEnv?: Record<string, string>;
};

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max);
}

function sanitizeArgs(args?: string[]): string[] {
  if (!args?.length) {
    return [];
  }

  return args.map((arg) => {
    if (typeof arg !== 'string') {
      throw new Error('Command arguments must be strings.');
    }

    if (arg.length > 2000) {
      throw new Error('Command argument is too long.');
    }

    if (arg.includes('\0') || /[\r\n]/.test(arg)) {
      throw new Error('Command arguments must not contain null bytes or newlines.');
    }

    return arg;
  });
}

function quoteCommandPart(part: string): string {
  if (!/[ \t"]/u.test(part)) {
    return part;
  }

  return `"${part.replace(/(["\\$`])/g, '\\$1')}"`;
}

async function ensureFileExists(filePath: string, label: string): Promise<string> {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      throw new Error(`${label} is not a file: ${filePath}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to resolve ${label}: ${message}`);
  }

  return filePath;
}

async function findExecutableOnPath(commandName: string): Promise<string> {
  const pathValue = process.env.PATH || '';
  const pathEntries = pathValue.split(path.delimiter).filter(Boolean);

  if (process.platform === 'win32') {
    const extensions = ['.exe', '.com'];

    for (const directory of pathEntries) {
      for (const extension of extensions) {
        const candidatePath = path.join(directory, `${commandName}${extension}`);
        try {
          const stats = await fs.stat(candidatePath);
          if (stats.isFile()) {
            return candidatePath;
          }
        } catch {
          // noop
        }
      }
    }
  } else {
    for (const directory of pathEntries) {
      const candidatePath = path.join(directory, commandName);
      try {
        const stats = await fs.stat(candidatePath);
        if (stats.isFile()) {
          return candidatePath;
        }
      } catch {
        // noop
      }
    }
  }

  throw new Error(`Executable not found on PATH: ${commandName}`);
}

function validateGitArgs(args: string[]): string[] {
  if (args.length === 0) {
    return ['status', '--short'];
  }

  const subcommand = args[0];
  const allowedSubcommands = new Set(['branch', 'diff', 'log', 'rev-parse', 'show', 'status']);
  if (!allowedSubcommands.has(subcommand)) {
    throw new Error(`Unsupported git subcommand in safe mode: ${subcommand}`);
  }

  for (const arg of args.slice(1)) {
    if (arg === '-C' || arg.startsWith('--git-dir') || arg.startsWith('--work-tree') || arg === '-c' || arg.startsWith('--config-env')) {
      throw new Error(`Unsupported git argument in safe mode: ${arg}`);
    }
  }

  return args;
}

function validateTscArgs(args: string[]): string[] {
  const disallowedFlags = new Set([
    '-b',
    '-w',
    '--build',
    '--emitDeclarationOnly',
    '--generateTrace',
    '--incremental',
    '--init',
    '--outDir',
    '--outFile',
    '--tsBuildInfoFile',
    '--watch'
  ]);

  for (const arg of args) {
    if (disallowedFlags.has(arg) || arg.startsWith('--outDir=') || arg.startsWith('--outFile=') || arg.startsWith('--tsBuildInfoFile=')) {
      throw new Error(`Unsupported tsc argument in safe mode: ${arg}`);
    }
  }

  return args.includes('--noEmit') ? args : ['--noEmit', ...args];
}

function validateVitestArgs(args: string[]): string[] {
  const disallowedFlags = new Set(['-u', '--api', '--browser', '--coverage', '--open', '--standalone', '--ui', '--update', '--watch']);

  for (const arg of args) {
    if (arg === 'watch' || disallowedFlags.has(arg)) {
      throw new Error(`Unsupported vitest argument in safe mode: ${arg}`);
    }
  }

  if (args[0] === 'run') {
    return args;
  }

  return ['run', ...args];
}

export class PiWorkspaceShellService {
  constructor(private readonly toolContext: PiSessionToolContext) {}

  private getWorkspace(): NonNullable<PiSessionToolContext['coding']> {
    if (!this.toolContext.coding?.rootPath?.trim()) {
      throw new Error('Coding workspace root is not configured.');
    }

    return this.toolContext.coding;
  }

  private async resolveCommandCwd(cwd?: string): Promise<{ absolutePath: string; relativePath: string }> {
    const workspace = this.getWorkspace();
    const resolvedPath = await resolveWorkspacePath(workspace, cwd?.trim() || '.');
    const stats = await fs.stat(resolvedPath.absolutePath);

    if (!stats.isDirectory()) {
      throw new Error(`cwd must be a directory inside the selected coding workspace: ${resolvedPath.relativePath}`);
    }

    return {
      absolutePath: resolvedPath.absolutePath,
      relativePath: resolvedPath.relativePath
    };
  }

  private async resolveCommandSpec(command: CodingShellCommand, args: string[], workspaceRoot: string): Promise<ResolvedCommandSpec> {
    switch (command) {
      case 'git': {
        const resolvedArgs = validateGitArgs(args);
        const executable = await findExecutableOnPath('git');
        return {
          args: resolvedArgs,
          commandLine: ['git', ...resolvedArgs].map(quoteCommandPart).join(' '),
          executable
        };
      }
      case 'tsc': {
        const resolvedArgs = validateTscArgs(args);
        const scriptPath = await ensureFileExists(path.join(workspaceRoot, 'node_modules', 'typescript', 'bin', 'tsc'), 'TypeScript CLI');

        return {
          args: [scriptPath, ...resolvedArgs],
          commandLine: ['tsc', ...resolvedArgs].map(quoteCommandPart).join(' '),
          executable: process.execPath,
          injectedEnv: {
            ELECTRON_RUN_AS_NODE: '1'
          }
        };
      }
      case 'vitest': {
        const resolvedArgs = validateVitestArgs(args);
        const scriptPath = await ensureFileExists(path.join(workspaceRoot, 'node_modules', 'vitest', 'vitest.mjs'), 'Vitest CLI');

        return {
          args: [scriptPath, ...resolvedArgs],
          commandLine: ['vitest', ...resolvedArgs].map(quoteCommandPart).join(' '),
          executable: process.execPath,
          injectedEnv: {
            ELECTRON_RUN_AS_NODE: '1'
          }
        };
      }
      default:
        throw new Error(`Unsupported command: ${command satisfies never}`);
    }
  }

  async run(options: {
    args?: string[];
    command: CodingShellCommand;
    cwd?: string;
    maxOutputBytes?: number;
    timeoutMs?: number;
  }): Promise<CodingShellExecutionResult> {
    const sanitizedArgs = sanitizeArgs(options.args);
    const resolvedCwd = await this.resolveCommandCwd(options.cwd);
    const timeoutMs = clampInteger(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1_000, MAX_TIMEOUT_MS);
    const maxOutputBytes = clampInteger(options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES, 8 * 1024, MAX_OUTPUT_BYTES);
    const commandSpec = await this.resolveCommandSpec(options.command, sanitizedArgs, this.getWorkspace().rootPath);
    const startTime = Date.now();

    return new Promise<CodingShellExecutionResult>((resolve, reject) => {
      const env = {
        ...process.env,
        ...commandSpec.injectedEnv
      };
      const child = spawn(commandSpec.executable, commandSpec.args, {
        cwd: resolvedCwd.absolutePath,
        env,
        shell: false,
        windowsHide: true
      });

      let stdout = '';
      let stderr = '';
      let outputBytes = 0;
      let hasTimedOut = false;
      let truncated = false;
      let settled = false;

      const appendChunk = (current: string, chunk: Buffer): string => {
        if (outputBytes >= maxOutputBytes) {
          truncated = true;
          return current;
        }

        const remainingBytes = maxOutputBytes - outputBytes;
        const acceptedBuffer = chunk.byteLength <= remainingBytes ? chunk : chunk.subarray(0, remainingBytes);
        outputBytes += acceptedBuffer.byteLength;

        if (acceptedBuffer.byteLength < chunk.byteLength) {
          truncated = true;
        }

        return current + acceptedBuffer.toString('utf8');
      };

      const finalize = (result: CodingShellExecutionResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        resolve(result);
      };

      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutHandle);
        reject(error);
      };

      const timeoutHandle = setTimeout(() => {
        hasTimedOut = true;
        truncated = true;
        child.kill();
      }, timeoutMs);

      child.on('error', (error) => {
        fail(new Error(`Failed to start command ${options.command}: ${error.message}`));
      });

      child.stdout.on('data', (chunk: Buffer) => {
        stdout = appendChunk(stdout, chunk);
        if (truncated) {
          child.kill();
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr = appendChunk(stderr, chunk);
        if (truncated) {
          child.kill();
        }
      });

      child.on('close', (exitCode) => {
        finalize({
          args: sanitizedArgs,
          command: options.command,
          commandLine: commandSpec.commandLine,
          cwd: resolvedCwd.relativePath,
          durationMs: Date.now() - startTime,
          exitCode,
          maxOutputBytes,
          ok: exitCode === 0 && !hasTimedOut && !truncated,
          stderr,
          stdout,
          hasTimedOut,
          truncated
        });
      });
    });
  }
}
