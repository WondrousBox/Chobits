import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseSkillMarkdown } from './frontmatter'
import { buildSkillSourceInfo } from './source-info'
import { buildSkillSourcePolicy } from './source-policy'
import { loadSyntheticToolboxSkillEntries, SYNTHETIC_TOOLBOX_PRIORITY } from './synthetic-toolbox'
import type { LoadSkillSourcesOptions, LoadSkillSourcesResult, SkillIssue, SkillRegistryEntry, SkillSource } from './types'

const SKILL_FILE_NAME = 'SKILL.md'
const BUNDLED_PRIORITY = 10
const USER_PRIORITY = 20
const PROJECT_PRIORITY = 30
const PLUGIN_PRIORITY = 40

const USER_SKILL_SUBDIRS = ['.chobits/skills', '.agents/skills', '.claude/skills'] as const
const PROJECT_SKILL_SUBDIRS = USER_SKILL_SUBDIRS
const PLUGIN_SKILL_SUBDIRS = ['skills', 'pi-skills'] as const
const require = createRequire(import.meta.url)

type SkillFileCandidate = {
  priority: number
  rootDir: string
  skillDir: string
  skillFilePath: string
  source: SkillSource
}

export function resolveDefaultBundledSkillRoot(): string {
  return fileURLToPath(new URL('./bundled', import.meta.url))
}

export async function collectProjectSkillRoots(workspaceRoot: string): Promise<string[]> {
  const ancestors = await collectWorkspaceAncestors(workspaceRoot)
  const roots: string[] = []

  for (const ancestor of ancestors) {
    for (const subdir of PROJECT_SKILL_SUBDIRS) {
      roots.push(path.join(ancestor, subdir))
    }
  }

  return roots
}

export async function loadSkillSourceEntries(options: LoadSkillSourcesOptions = {}): Promise<LoadSkillSourcesResult> {
  const issues: SkillIssue[] = []
  const entries: SkillRegistryEntry[] = []
  const scannedRoots: string[] = []
  const scannedSkillFiles: string[] = []
  const workspaceRoot = path.resolve(options.workspaceRoot?.trim() || process.cwd())
  const homeDir = path.resolve(options.homeDir?.trim() || os.homedir())

  const candidates: SkillFileCandidate[] = []

  if (options.includeBundled !== false) {
    const bundledRoot = path.resolve(options.bundledSkillRoot?.trim() || resolveDefaultBundledSkillRoot())
    scannedRoots.push(bundledRoot)
    candidates.push(...(await collectSkillFileCandidates(bundledRoot, 'bundled', BUNDLED_PRIORITY, issues)))
  }

  if (options.includeUserGlobal !== false) {
    for (const subdir of USER_SKILL_SUBDIRS) {
      const rootDir = path.join(homeDir, subdir)
      scannedRoots.push(rootDir)
      candidates.push(...(await collectSkillFileCandidates(rootDir, 'user', USER_PRIORITY, issues)))
    }
  }

  if (options.includeProject !== false) {
    const projectRoots = await collectProjectSkillRoots(workspaceRoot)
    scannedRoots.push(...projectRoots)
    for (const rootDir of projectRoots) {
      candidates.push(...(await collectSkillFileCandidates(rootDir, 'project', PROJECT_PRIORITY, issues)))
    }
  }

  if (options.includePlugins !== false) {
    const pluginRoots = await resolvePluginSkillRoots(options)

    scannedRoots.push(...pluginRoots)
    for (const rootDir of pluginRoots) {
      candidates.push(...(await collectSkillFileCandidates(rootDir, 'plugin', PLUGIN_PRIORITY, issues)))
    }
  }

  for (const candidate of candidates) {
    scannedSkillFiles.push(candidate.skillFilePath)
    const loadedEntry = await loadSkillFileCandidate(candidate)
    if (!loadedEntry) {
      issues.push({
        severity: 'error',
        code: 'skill-load-failed',
        message: `Failed to load skill metadata from ${candidate.skillFilePath}.`,
        filePath: candidate.skillFilePath,
        source: candidate.source
      })
      continue
    }
    entries.push(...loadedEntry.entries)
    issues.push(...loadedEntry.issues)
  }

  if (options.includeSyntheticToolbox !== false) {
    const synthetic = loadSyntheticToolboxSkillEntries()
    entries.push(...synthetic.entries.map((entry) => ({ ...entry, priority: Math.max(entry.priority, SYNTHETIC_TOOLBOX_PRIORITY) })))
    issues.push(...synthetic.issues)
  }

  return {
    entries,
    issues,
    scannedRoots: unique(scannedRoots),
    scannedSkillFiles: unique(scannedSkillFiles)
  }
}

export async function resolvePluginSkillRoots(options: Pick<LoadSkillSourcesOptions, 'discoverPluginRoots' | 'pluginSkillRoots' | 'pluginsDir'> = {}): Promise<string[]> {
  const explicitRoots = unique(
    (options.pluginSkillRoots || [])
      .map((rootDir) => rootDir?.trim())
      .filter((rootDir): rootDir is string => Boolean(rootDir))
      .map((rootDir) => path.resolve(rootDir))
  )

  if (!options.discoverPluginRoots) {
    return explicitRoots
  }

  const pluginsDir = options.pluginsDir?.trim() || resolveConfiguredPluginsDir()
  if (!pluginsDir) {
    return explicitRoots
  }

  const discoveredRoots = await collectPluginSkillRoots(path.resolve(pluginsDir))
  return unique([...explicitRoots, ...discoveredRoots])
}

export async function collectPluginSkillRoots(pluginsDir: string): Promise<string[]> {
  if (!(await isDirectory(pluginsDir))) {
    return []
  }

  const roots: string[] = []
  const dirEntries = await safeReadDir(pluginsDir, [], 'plugin')

  for (const dirEntry of dirEntries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!dirEntry.isDirectory()) continue

    const pluginDir = path.join(pluginsDir, dirEntry.name)
    for (const subdir of PLUGIN_SKILL_SUBDIRS) {
      const skillRoot = path.join(pluginDir, subdir)
      if (await isDirectory(skillRoot)) {
        roots.push(skillRoot)
      }
    }
  }

  return unique(roots)
}

async function collectSkillFileCandidates(rootDir: string, source: SkillSource, priority: number, issues: SkillIssue[]): Promise<SkillFileCandidate[]> {
  if (!(await isDirectory(rootDir, issues, source))) {
    return []
  }

  const candidates: SkillFileCandidate[] = []
  const directSkillFilePath = path.join(rootDir, SKILL_FILE_NAME)
  if (await isFile(directSkillFilePath)) {
    candidates.push({
      priority,
      rootDir,
      skillDir: rootDir,
      skillFilePath: directSkillFilePath,
      source
    })
  }

  const dirEntries = await safeReadDir(rootDir, issues, source)
  for (const dirEntry of dirEntries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!dirEntry.isDirectory()) continue

    const skillDir = path.join(rootDir, dirEntry.name)
    const skillFilePath = path.join(skillDir, SKILL_FILE_NAME)
    if (!(await isFile(skillFilePath))) continue

    candidates.push({
      priority,
      rootDir,
      skillDir,
      skillFilePath,
      source
    })
  }

  return candidates
}

async function loadSkillFileCandidate(candidate: SkillFileCandidate): Promise<{ entries: SkillRegistryEntry[]; issues: SkillIssue[] } | undefined> {
  try {
    const markdown = await fs.readFile(candidate.skillFilePath, 'utf8')
    const parsed = parseSkillMarkdown(markdown, { filePath: candidate.skillFilePath })
    if (!parsed.metadata) {
      return {
        entries: [],
        issues: parsed.issues.map((issue) => ({
          ...issue,
          source: issue.source || candidate.source
        }))
      }
    }

    return {
      entries: [
        {
          locator: { kind: 'skill-file' },
          priority: candidate.priority,
          rawFrontmatter: parsed.rawFrontmatter,
          record: {
            ...parsed.metadata,
            contentHash: createHash('sha256').update(markdown).digest('hex'),
            skillDir: candidate.skillDir,
            skillFilePath: candidate.skillFilePath,
            source: candidate.source,
            sourcePolicy: buildSkillSourcePolicy({
              activationToolIds: parsed.metadata.activationToolIds,
              allowedToolIds: parsed.metadata.allowedToolIds,
              executionContext: parsed.metadata.executionContext,
              source: candidate.source
            }),
            sourceInfo: buildSkillSourceInfo({
              skillDir: candidate.skillDir,
              source: candidate.source,
              sourceRootDir: candidate.rootDir
            }),
            sourceRootDir: candidate.rootDir
          }
        }
      ],
      issues: parsed.issues.map((issue) => ({
        ...issue,
        source: issue.source || candidate.source
      }))
    }
  } catch (error) {
    return {
      entries: [],
      issues: [
        {
          severity: 'error',
          code: 'skill-read-failed',
          message: `Unable to read ${candidate.skillFilePath}: ${toErrorMessage(error)}`,
          filePath: candidate.skillFilePath,
          source: candidate.source
        }
      ]
    }
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

async function isDirectory(targetPath: string, issues?: SkillIssue[], source?: SkillSource): Promise<boolean> {
  try {
    const stat = await fs.stat(targetPath)
    return stat.isDirectory()
  } catch (error) {
    if (!isNotFoundError(error) && issues && source) {
      issues.push({
        severity: 'warning',
        code: 'skill-root-unavailable',
        message: `Unable to access skill root ${targetPath}: ${toErrorMessage(error)}`,
        filePath: targetPath,
        source
      })
    }
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

async function safeReadDir(targetPath: string, issues: SkillIssue[], source: SkillSource) {
  try {
    return await fs.readdir(targetPath, { withFileTypes: true })
  } catch (error) {
    if (!isNotFoundError(error)) {
      issues.push({
        severity: 'warning',
        code: 'skill-root-unavailable',
        message: `Unable to read skill root ${targetPath}: ${toErrorMessage(error)}`,
        filePath: targetPath,
        source
      })
    }
    return []
  }
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'ENOENT'
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

function resolveConfiguredPluginsDir(): string | undefined {
  try {
    const { PluginConfigStore } = require('../../../../plugins/plugin-config-store')
    const pluginsDir = PluginConfigStore?.getPluginsDir?.()
    return typeof pluginsDir === 'string' && pluginsDir.trim() ? pluginsDir : undefined
  } catch {
    return undefined
  }
}
