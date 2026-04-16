import { getSkillSourceInfo, requiresSkillSourceCaution } from './source-info'
import { getSkillSourcePolicy } from './source-policy'
import type { SkillRegistry } from './registry'
import type { SkillRecord } from './types'

export interface BuildSkillListingPromptOptions {
  limit?: number
}

export function buildSkillListingPrompt(registry: SkillRegistry, options: BuildSkillListingPromptOptions = {}): string | undefined {
  const visibleSkills = registry
    .listModelVisible()
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))

  if (!visibleSkills.length) return undefined

  const limit = options.limit ?? 12
  const listedSkills = visibleSkills.slice(0, limit)
  const remainingCount = visibleSkills.length - listedSkills.length

  const lines = [
    '## Available Skills',
    '遇到需要步骤化工作流、领域知识或多工具协同的任务时，优先考虑 skill。先看下面这些可用 skills；如果不够，再调用 skillSearchTool 搜索。',
    ...listedSkills.map((skill) => formatSkillListingLine(skill))
  ]

  if (remainingCount > 0) {
    lines.push(`- 还有 ${remainingCount} 个 skills 未展开，需要时调用 skillSearchTool({ action: 'list' | 'search' }) 查看。`)
  }

  return lines.join('\n')
}

function formatSkillListingLine(skill: SkillRecord): string {
  const sourceInfo = getSkillSourceInfo(skill)
  const sourcePolicy = getSkillSourcePolicy(skill)
  const parts = [`- \`${skill.name}\`: ${skill.description}`]

  if (skill.whenToUse) {
    parts.push(`Use when: ${normalizeInlineText(skill.whenToUse)}`)
  }

  if (skill.userInvocable) {
    parts.push('user-invocable')
  }

  if (skill.executionContext === 'fork') {
    parts.push('context: fork')
  }

  if (skill.model) {
    parts.push(`model: ${skill.model}`)
  }

  if (skill.effort) {
    parts.push(`effort: ${skill.effort}`)
  }

  parts.push(`source: ${sourceInfo.label}`)

  if (requiresSkillSourceCaution(sourceInfo.trustLevel) && sourceInfo.trustNote) {
    parts.push(`caution: ${normalizeInlineText(sourceInfo.trustNote)}`)
  }

  if (sourcePolicy.riskLevel === 'guarded') {
    parts.push(`guard: ${normalizeInlineText(sourcePolicy.message)}`)
  }

  return parts.join(' ')
}

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
