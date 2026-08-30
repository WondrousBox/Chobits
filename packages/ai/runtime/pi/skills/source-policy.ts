import { getPiToolDescriptor } from '../tool-registry'

import { requiresSkillSourceCaution } from './source-info'
import type { SkillExecutionContext, SkillSource, SkillSourcePolicy } from './types'

const GUARDED_TOOL_CATEGORIES = new Set(['file', 'shell', 'ui-side-effect'])
const GUARDED_TOOL_IDS = new Set(['workflow-run'])

export function getSkillSourcePolicy(
  record: Pick<SkillSourcePolicyInput, 'source' | 'allowedToolIds' | 'activationToolIds' | 'executionContext' | 'sourcePolicy'>
): SkillSourcePolicy {
  if (record.sourcePolicy) {
    return record.sourcePolicy
  }

  return buildSkillSourcePolicy({
    activationToolIds: record.activationToolIds,
    allowedToolIds: record.allowedToolIds,
    executionContext: record.executionContext,
    source: record.source
  })
}

type SkillSourcePolicyInput = {
  activationToolIds: string[]
  allowedToolIds: string[]
  executionContext?: SkillExecutionContext
  source: SkillSource
  sourcePolicy?: SkillSourcePolicy
}

type SensitiveToolResolution = {
  sensitiveToolCategories: string[]
  sensitiveToolIds: string[]
  sensitiveToolLabels: string[]
}

export function buildSkillSourcePolicy(input: SkillSourcePolicyInput): SkillSourcePolicy {
  const toolIds = Array.from(new Set([...input.allowedToolIds, ...input.activationToolIds]))
  const { sensitiveToolCategories, sensitiveToolIds, sensitiveToolLabels } = resolveSensitiveTools(toolIds)
  const hasForkExecution = input.executionContext === 'fork'
  const guarded = requiresSkillSourceCaution(resolveTrustLevelLike(input.source)) && (sensitiveToolIds.length > 0 || hasForkExecution)

  if (guarded) {
    const guardedReasons = [
      ...(sensitiveToolCategories.length > 0 ? [`sensitive tool categories: ${sensitiveToolCategories.join(', ')}`] : []),
      ...(sensitiveToolLabels.length > 0 ? [`sensitive tools: ${sensitiveToolLabels.join(', ')}`] : []),
      ...(hasForkExecution ? ['forked execution context'] : [])
    ]
    return {
      message: `This skill comes from a higher-risk source and should be previewed before inline execution because it uses ${guardedReasons.join(' and ')}.`,
      recommendedMode: 'preview',
      requiresExplicitUserIntent: true,
      requiresPreviewBeforeInline: true,
      riskLevel: 'guarded',
      sensitiveToolCategories,
      sensitiveToolIds
    }
  }

  if (requiresSkillSourceCaution(resolveTrustLevelLike(input.source))) {
    return {
      message: 'This skill comes from a higher-risk source. Review its instructions and intended actions before relying on it for important work.',
      recommendedMode: 'preview',
      requiresExplicitUserIntent: false,
      requiresPreviewBeforeInline: false,
      riskLevel: 'caution',
      sensitiveToolCategories,
      sensitiveToolIds
    }
  }

  return {
    message: 'This skill source is treated as normal within the current runtime guardrails.',
    recommendedMode: 'inline',
    requiresExplicitUserIntent: false,
    requiresPreviewBeforeInline: false,
    riskLevel: 'normal',
    sensitiveToolCategories,
    sensitiveToolIds
  }
}

function resolveSensitiveTools(toolIds: string[]): SensitiveToolResolution {
  const sensitiveToolCategories = new Set<string>()
  const sensitiveToolIds: string[] = []
  const sensitiveToolLabels: string[] = []

  for (const toolId of toolIds) {
    const descriptor = getPiToolDescriptor(toolId)
    const category = descriptor?.category
    const matchesGuardedCategory = Boolean(category && GUARDED_TOOL_CATEGORIES.has(category))
    const matchesGuardedToolId = GUARDED_TOOL_IDS.has(toolId)

    if (!matchesGuardedCategory && !matchesGuardedToolId) {
      continue
    }

    sensitiveToolIds.push(toolId)

    if (matchesGuardedCategory && category) {
      sensitiveToolCategories.add(category)
    }

    if (matchesGuardedToolId && !matchesGuardedCategory) {
      sensitiveToolLabels.push(descriptor?.name || toolId)
    }
  }

  return {
    sensitiveToolCategories: Array.from(sensitiveToolCategories),
    sensitiveToolIds,
    sensitiveToolLabels
  }
}

function resolveTrustLevelLike(source: SkillSource) {
  switch (source) {
    case 'plugin':
      return 'plugin'
    case 'synthetic-toolbox':
      return 'compatibility'
    case 'project':
      return 'workspace'
    default:
      return 'trusted'
  }
}
