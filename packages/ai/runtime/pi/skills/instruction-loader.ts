import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { InstructionFileRecord, InstructionIssue, LoadInstructionFilesOptions, LoadInstructionFilesResult } from './types'

const USER_INSTRUCTION_FILES = ['.chobits/AGENTS.md', '.agents/AGENTS.md', '.claude/CLAUDE.md'] as const
const PROJECT_INSTRUCTION_FILES = ['.chobits/AGENTS.md', '.agents/AGENTS.md', '.claude/CLAUDE.md', 'AGENTS.md', 'CLAUDE.md'] as const

export async function loadInstructionFiles(options: LoadInstructionFilesOptions = {}): Promise<LoadInstructionFilesResult> {
  const workspaceRoot = path.resolve(options.workspaceRoot?.trim() || process.cwd())
  const homeDir = path.resolve(options.homeDir?.trim() || os.homedir())
  const files: InstructionFileRecord[] = []
  const issues: InstructionIssue[] = []
  const scannedPaths: string[] = []

  if (options.includeUserGlobal !== false) {
    for (const relativePath of USER_INSTRUCTION_FILES) {
      const filePath = path.join(homeDir, relativePath)
      scannedPaths.push(filePath)
      const loaded = await readInstructionFile(filePath, 'user', issues)
      if (loaded) files.push(loaded)
    }
  }

  if (options.includeProject !== false) {
    const ancestors = await collectWorkspaceAncestors(workspaceRoot)
    for (const ancestor of ancestors) {
      for (const relativePath of PROJECT_INSTRUCTION_FILES) {
        const filePath = path.join(ancestor, relativePath)
        scannedPaths.push(filePath)
        const loaded = await readInstructionFile(filePath, 'project', issues)
        if (loaded) files.push(loaded)
      }
    }
  }

  return {
    files,
    issues,
    scannedPaths: Array.from(new Set(scannedPaths))
  }
}

async function collectWorkspaceAncestors(workspaceRoot: string): Promise<string[]> {
  const ancestors: string[] = []
  let currentPath = path.resolve(workspaceRoot)

  while (true) {
    ancestors.push(currentPath)
    if (await hasGitMarker(currentPath)) {
      break
    }

    const parentPath = path.dirname(currentPath)
    if (parentPath === currentPath) {
      break
    }
    currentPath = parentPath
  }

  return ancestors.reverse()
}

async function hasGitMarker(targetPath: string): Promise<boolean> {
  return (await isFile(path.join(targetPath, '.git'))) || (await isDirectory(path.join(targetPath, '.git')))
}

async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath)
    return stat.isDirectory()
  } catch {
    return false
  }
}

async function isFile(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath)
    return stat.isFile()
  } catch {
    return false
  }
}

async function readInstructionFile(filePath: string, source: InstructionFileRecord['source'], issues: InstructionIssue[]): Promise<InstructionFileRecord | undefined> {
  if (!(await isFile(filePath))) {
    return undefined
  }

  try {
    const content = (await fs.readFile(filePath, 'utf8')).trim()
    if (!content) {
      return undefined
    }

    return {
      content,
      filePath,
      source
    }
  } catch (error) {
    issues.push({
      severity: 'warning',
      code: 'instruction-read-failed',
      message: `Unable to read instruction file ${filePath}: ${toErrorMessage(error)}`,
      filePath,
      source
    })
    return undefined
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
