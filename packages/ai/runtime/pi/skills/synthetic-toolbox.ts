import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolvePiToolId } from '../tool-registry'
import { loadToolboxIndex } from '../toolbox'
import type { SkillIssue, SkillRegistryEntry } from './types'

export const SYNTHETIC_TOOLBOX_PRIORITY = 5

const TOOLBOX_SOURCE_URL = new URL('../toolbox.md', import.meta.url)
const TOOLBOX_SOURCE_PATH =
  TOOLBOX_SOURCE_URL.protocol === 'file:'
    ? fileURLToPath(TOOLBOX_SOURCE_URL)
    : path.resolve(process.cwd(), 'packages/ai/runtime/pi/toolbox.md')

export function loadSyntheticToolboxSkillEntries(): { entries: SkillRegistryEntry[]; issues: SkillIssue[] } {
  const issues: SkillIssue[] = []
  const { skills } = loadToolboxIndex()
  const entries: SkillRegistryEntry[] = []

  for (const skill of skills) {
    const aliases = normalizeToolboxTriggers(skill.triggers)
    const toolIds = normalizeToolboxToolIds(skill.tools, issues)
    const whenToUse = aliases.length > 0 ? `当用户提到 ${aliases.slice(0, 4).join('、')} 等意图时使用。` : `当任务需要「${skill.name}」这类工作流时使用。`

    entries.push({
      locator: {
        kind: 'toolbox-section',
        lineEnd: skill.lineEnd,
        lineStart: skill.lineStart,
        sectionName: skill.name
      },
      priority: SYNTHETIC_TOOLBOX_PRIORITY,
      rawFrontmatter: {},
      record: {
        activationToolIds: toolIds,
        aliases,
        allowedToolIds: toolIds,
        argumentHint: undefined,
        argumentNames: [],
        contentHash: createHash('sha256').update(`${skill.name}\n${skill.content}`).digest('hex'),
        description: buildSyntheticDescription(skill.name, aliases, toolIds),
        disableModelInvocation: false,
        name: skill.name,
        paths: undefined,
        skillDir: path.dirname(TOOLBOX_SOURCE_PATH),
        skillFilePath: TOOLBOX_SOURCE_PATH,
        source: 'synthetic-toolbox',
        tags: [],
        userInvocable: aliases.length > 0,
        whenToUse
      }
    })
  }

  return { entries, issues }
}

function normalizeToolboxTriggers(triggers: string[]): string[] {
  return Array.from(
    new Set(
      triggers
        .map((trigger) => trigger.trim())
        .filter(Boolean)
        .filter((trigger) => !trigger.includes('无固定触发词'))
    )
  )
}

function normalizeToolboxToolIds(toolNames: string[], issues: SkillIssue[]): string[] {
  const normalized: string[] = []
  const seen = new Set<string>()

  for (const toolName of toolNames) {
    const toolId = resolvePiToolId(toolName)
    if (!toolId) {
      issues.push({
        severity: 'warning',
        code: 'unknown-tool-reference',
        message: `Unknown toolbox tool "${toolName}" while generating synthetic skills.`,
        filePath: TOOLBOX_SOURCE_PATH,
        source: 'synthetic-toolbox'
      })
      continue
    }
    if (seen.has(toolId)) continue
    seen.add(toolId)
    normalized.push(toolId)
  }

  return normalized
}

function buildSyntheticDescription(skillName: string, aliases: string[], toolIds: string[]): string {
  if (aliases.length > 0) {
    return `兼容自 toolbox.md 的「${skillName}」工作流，适用于 ${aliases.slice(0, 4).join('、')} 等请求。`
  }

  if (toolIds.length > 0) {
    return `兼容自 toolbox.md 的「${skillName}」工作流，涉及工具：${toolIds.join(', ')}。`
  }

  return `兼容自 toolbox.md 的「${skillName}」工作流。`
}
