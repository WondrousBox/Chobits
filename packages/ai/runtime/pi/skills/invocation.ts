import type { SkillRegistry } from './registry'
import type { ExplicitSkillInvocation, RequestedSkillInvocation, SkillRecord } from './types'

export function normalizeRequestedSkillInvocation(input: unknown): RequestedSkillInvocation | undefined {
  if (!input || typeof input !== 'object') {
    return undefined
  }

  const matchedReference = typeof (input as { matchedReference?: unknown }).matchedReference === 'string'
    ? (input as { matchedReference: string }).matchedReference.trim()
    : ''
  if (!matchedReference) {
    return undefined
  }

  const remainingQuery = typeof (input as { remainingQuery?: unknown }).remainingQuery === 'string'
    ? (input as { remainingQuery: string }).remainingQuery.trim()
    : undefined
  const rawSource = typeof (input as { source?: unknown }).source === 'string'
    ? (input as { source: string }).source.trim().toLowerCase()
    : ''

  return {
    matchedReference,
    remainingQuery: remainingQuery || undefined,
    source: rawSource === 'slash-command' ? 'slash-command' : 'input'
  }
}

export function resolveRequestedSkillInvocation(
  invocation: RequestedSkillInvocation,
  registry: SkillRegistry
): ExplicitSkillInvocation | undefined {
  const matched = findExactSkillReferenceMatch(invocation.matchedReference, registry)
  if (!matched) return undefined

  return toExplicitSkillInvocation(matched.record, matched.reference, invocation.remainingQuery)
}

export function resolveExplicitSkillInvocation(query: string, registry: SkillRegistry): ExplicitSkillInvocation | undefined {
  const trimmedQuery = query.trim()
  if (!trimmedQuery.startsWith('/')) return undefined

  const commandBody = trimmedQuery.slice(1).trim()
  if (!commandBody) return undefined

  const bestMatch = findPrefixSkillReferenceMatch(commandBody, registry)
  if (!bestMatch) return undefined

  const remainingQuery = commandBody.slice(bestMatch.reference.length).trim()
  return toExplicitSkillInvocation(bestMatch.record, bestMatch.reference, remainingQuery || undefined)
}

export function buildExplicitSkillInvocationPrompt(invocation: ExplicitSkillInvocation): string {
  const lines = [
    '## Explicit Skill Invocation',
    `The user explicitly invoked the user-invocable skill \`${invocation.skillName}\` via \`/${invocation.matchedReference}\`.`,
    `Treat this as a strong instruction: call \`skillUseTool({ skill: '${invocation.skillName}', mode: 'inline' })\` before switching to other workflow skills unless the user is only clarifying details.`
  ]

  if (invocation.executionContext === 'fork') {
    lines.push('This skill prefers `context: fork`, so preserve that execution hint after loading the skill and do not assume its suggested tools belong in the current session.')
  }

  if (invocation.model) {
    lines.push(`This skill requests model override \`${invocation.model}\`.`)
  }

  if (invocation.effort) {
    lines.push(`This skill requests reasoning effort \`${invocation.effort}\`.`)
  }

  if (invocation.remainingQuery) {
    lines.push(`Use the remaining user request as the concrete goal for this invocation: ${invocation.remainingQuery}`)
  } else {
    lines.push('If no extra natural-language request was provided, use the current conversation context and ask only for the missing arguments required to proceed.')
  }

  return lines.join('\n')
}

function matchesSkillReferencePrefix(commandBody: string, reference: string): boolean {
  if (commandBody.length < reference.length) return false

  const normalizedBody = commandBody.toLowerCase()
  const normalizedReference = reference.toLowerCase()
  if (!normalizedBody.startsWith(normalizedReference)) return false

  if (commandBody.length === reference.length) return true

  const nextChar = commandBody.slice(reference.length, reference.length + 1)
  return !nextChar || /\s/.test(nextChar)
}

function findPrefixSkillReferenceMatch(
  commandBody: string,
  registry: SkillRegistry
):
  | {
      record: SkillRecord
      reference: string
    }
  | undefined {
  let bestMatch:
    | {
        record: SkillRecord
        reference: string
      }
    | undefined

  for (const record of registry.listUserInvocable()) {
    for (const reference of [record.name, ...record.aliases]) {
      const normalizedReference = reference.trim()
      if (!normalizedReference) continue
      if (!matchesSkillReferencePrefix(commandBody, normalizedReference)) continue

      if (!bestMatch || normalizedReference.length > bestMatch.reference.length) {
        bestMatch = {
          record,
          reference: normalizedReference
        }
      }
    }
  }

  return bestMatch
}

function findExactSkillReferenceMatch(
  matchedReference: string,
  registry: SkillRegistry
):
  | {
      record: SkillRecord
      reference: string
    }
  | undefined {
  const normalizedMatchedReference = matchedReference.trim().toLowerCase()
  if (!normalizedMatchedReference) return undefined

  for (const record of registry.listUserInvocable()) {
    for (const reference of [record.name, ...record.aliases]) {
      const normalizedReference = reference.trim()
      if (!normalizedReference) continue
      if (normalizedReference.toLowerCase() !== normalizedMatchedReference) continue

      return {
        record,
        reference: normalizedReference
      }
    }
  }

  return undefined
}

function toExplicitSkillInvocation(
  record: SkillRecord,
  matchedReference: string,
  remainingQuery?: string
): ExplicitSkillInvocation {
  return {
    effort: record.effort,
    executionContext: record.executionContext,
    matchedReference,
    model: record.model,
    remainingQuery,
    skillName: record.name
  }
}
