import fs from 'node:fs/promises'

import { getPiToolDescriptor } from '../tool-registry'
import { getToolboxSkill } from '../toolbox'
import { parseSkillMarkdown } from './frontmatter'
import { isSkillPathMatched } from './matcher'
import type { SkillExecutionOptions, SkillExecutionResult, SkillRegistryEntry, SkillSessionState } from './types'

export async function executeSkill(entry: SkillRegistryEntry, options: SkillExecutionOptions = {}): Promise<SkillExecutionResult> {
  const executionMode = options.mode ?? 'inline'
  const executionContext = entry.record.executionContext || 'inline'
  const pathsMatched = isSkillPathMatched(entry.record, options.workspaceRoot)
  const resolvedArgs = normalizeSkillArgs(options.args)
  const rawContent = await loadSkillContent(entry)
  const content = replaceSkillPlaceholders(rawContent, entry.record.skillDir, options.sessionId, resolvedArgs)
  const activationToolNames = entry.record.activationToolIds
    .map((toolId) => getPiToolDescriptor(toolId)?.name)
    .filter((toolName): toolName is string => Boolean(toolName))
  const sessionActivationToolNames = executionContext === 'inline' ? activationToolNames : []

  if (options.state) {
    markSkillDiscovered(options.state, entry.record.name)
    markSkillLoaded(options.state, entry.record.name)
    if (executionMode === 'inline') {
      markSkillActive(options.state, entry.record.name)
      for (const toolName of sessionActivationToolNames) {
        options.state.activatedToolNames.add(toolName)
      }
    }
  }

  return {
    activatedToolNames: executionMode === 'inline' ? sessionActivationToolNames : [],
    activationToolIds: [...entry.record.activationToolIds],
    allowedToolIds: [...entry.record.allowedToolIds],
    content,
    effort: entry.record.effort,
    executionContext,
    executionMode,
    model: entry.record.model,
    pathsMatched,
    record: entry.record,
    resolvedArgs,
    source: entry.record.source
  }
}

export function createSkillSessionState(): SkillSessionState {
  return {
    activeSkillNames: new Set<string>(),
    activatedToolNames: new Set<string>(),
    discoveredSkillNames: new Set<string>(),
    loadedSkillNames: new Set<string>()
  }
}

export function markSkillDiscovered(state: SkillSessionState, skillName: string): void {
  state.discoveredSkillNames.add(skillName)
  state.lastDiscoveryAt = Date.now()
}

export function markSkillLoaded(state: SkillSessionState, skillName: string): void {
  state.loadedSkillNames.add(skillName)
}

export function markSkillActive(state: SkillSessionState, skillName: string): void {
  state.activeSkillNames.add(skillName)
}

async function loadSkillContent(entry: SkillRegistryEntry): Promise<string> {
  if (entry.locator.kind === 'toolbox-section') {
    const toolboxSkill = getToolboxSkill(entry.locator.sectionName)
    if (!toolboxSkill) {
      throw new Error(`Synthetic toolbox skill "${entry.record.name}" is no longer available.`)
    }
    return toolboxSkill.content
  }

  const markdown = await fs.readFile(entry.record.skillFilePath, 'utf8')
  const parsed = parseSkillMarkdown(markdown, { filePath: entry.record.skillFilePath })
  if (!parsed.metadata) {
    throw new Error(`Skill file "${entry.record.skillFilePath}" is missing valid frontmatter.`)
  }
  return parsed.body
}

function normalizeSkillArgs(args?: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {}
  if (!args) return normalized

  for (const [key, value] of Object.entries(args)) {
    const normalizedKey = key.trim()
    if (!normalizedKey) continue
    normalized[normalizedKey] = String(value ?? '').trim()
  }

  return normalized
}

function replaceSkillPlaceholders(content: string, skillDir: string, sessionId: string | undefined, args: Record<string, string>): string {
  let resolved = content
    .replaceAll('${CHOBITS_SKILL_DIR}', skillDir)
    .replaceAll('{baseDir}', skillDir)
    .replaceAll('${CHOBITS_SESSION_ID}', sessionId || '')

  for (const [key, value] of Object.entries(args)) {
    resolved = resolved.replaceAll(`{{${key}}}`, value)
  }

  return resolved
}
