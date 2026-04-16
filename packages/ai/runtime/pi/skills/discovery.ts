import { markSkillDiscovered } from './executor'
import { searchSkills } from './matcher'
import type { SkillRegistry } from './registry'
import { getSkillSourceInfo, requiresSkillSourceCaution } from './source-info'
import { getSkillSourcePolicy } from './source-policy'
import type { SkillSearchResult, SkillSessionState } from './types'

export interface BuildSkillDiscoveryPromptOptions {
  limit?: number
  query?: string
  state?: SkillSessionState
  workspaceRoot?: string
}

export function buildSkillDiscoveryPrompt(registry: SkillRegistry, options: BuildSkillDiscoveryPromptOptions = {}): string | undefined {
  const query = options.query?.trim()
  if (!query) return undefined

  const matches = discoverRelevantSkills(registry, options)
  if (!matches.length) return undefined

  const lines = [
    '## Relevant Skills For This Request',
    '当前请求和下面这些 skills 高相关。优先检查它们，再决定是否调用通用工具或继续搜索。',
    ...matches.map((match) => formatDiscoveryLine(match))
  ]

  return lines.join('\n')
}

export function discoverRelevantSkills(registry: SkillRegistry, options: BuildSkillDiscoveryPromptOptions = {}): SkillSearchResult[] {
  const query = options.query?.trim()
  if (!query) return []

  const matches = searchSkills(registry.listModelVisible(), {
    limit: options.limit ?? 4,
    query,
    workspaceRoot: options.workspaceRoot
  }).filter((match) => match.pathsMatched && match.score >= 4)

  if (options.state) {
    for (const match of matches) {
      markSkillDiscovered(options.state, match.record.name)
    }
  }

  return matches
}

function formatDiscoveryLine(match: SkillSearchResult): string {
  const sourceInfo = getSkillSourceInfo(match.record)
  const sourcePolicy = getSkillSourcePolicy(match.record)
  const whyParts: string[] = []

  if (match.record.whenToUse) {
    whyParts.push(`Use when: ${normalizeInlineText(match.record.whenToUse)}`)
  }

  if (match.matchedFields.length > 0) {
    whyParts.push(`Matched on: ${match.matchedFields.join(', ')}`)
  }

  whyParts.push(`Source: ${sourceInfo.label}`)

  if (requiresSkillSourceCaution(sourceInfo.trustLevel) && sourceInfo.trustNote) {
    whyParts.push(`Caution: ${normalizeInlineText(sourceInfo.trustNote)}`)
  }

  if (sourcePolicy.riskLevel === 'guarded') {
    whyParts.push(`Guard: ${normalizeInlineText(sourcePolicy.message)}`)
  }

  return `- \`${match.record.name}\`: ${match.record.description}${whyParts.length > 0 ? ` ${whyParts.join(' ')}` : ''}`
}

function normalizeInlineText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
