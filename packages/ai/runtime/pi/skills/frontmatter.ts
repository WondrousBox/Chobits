import { resolvePiToolId } from '../tool-registry'
import type { ParseSkillMarkdownOptions, ParseSkillMarkdownResult, ParsedSkillMetadata, SkillEffortLevel, SkillExecutionContext, SkillIssue } from './types'

type TopLevelEntry = {
  childLines: string[]
  inlineValue: string
  key: string
}

const BLOCK_SCALAR_PATTERN = /^[>|][+-]?$/

export function parseSkillMarkdown(markdown: string, options: ParseSkillMarkdownOptions = {}): ParseSkillMarkdownResult {
  const issues: SkillIssue[] = []
  const { body, frontmatterText } = splitFrontmatter(markdown)

  if (!frontmatterText) {
    issues.push({
      severity: 'error',
      code: 'missing-frontmatter',
      message: 'SKILL.md must start with a YAML frontmatter block.',
      filePath: options.filePath
    })
    return {
      body,
      issues,
      rawFrontmatter: {}
    }
  }

  const entries = collectTopLevelEntries(frontmatterText, issues, options.filePath)
  const rawFrontmatter: Record<string, unknown> = {}

  for (const entry of entries) {
    rawFrontmatter[entry.key] = parseEntryValue(entry)
  }

  const name = readRequiredString(rawFrontmatter.name, 'name', issues, options.filePath)
  const description = readRequiredString(rawFrontmatter.description, 'description', issues, options.filePath)

  if (!name || !description) {
    return {
      body,
      issues,
      rawFrontmatter
    }
  }

  const allowedTools = normalizeToolIds(rawFrontmatter['allowed-tools'], 'allowed-tools', issues, options.filePath)
  const activationTools = normalizeToolIds(rawFrontmatter['activation-tools'], 'activation-tools', issues, options.filePath)

  const metadata: ParsedSkillMetadata = {
    activationToolIds: activationTools,
    aliases: toStringList(rawFrontmatter.aliases),
    allowedToolIds: allowedTools,
    argumentHint: readOptionalString(rawFrontmatter['argument-hint']),
    argumentNames: extractArgumentNames(rawFrontmatter.arguments),
    description,
    disableModelInvocation: readBoolean(rawFrontmatter['disable-model-invocation'], false),
    effort: readEffortLevel(rawFrontmatter.effort, issues, options.filePath),
    executionContext: readExecutionContext(rawFrontmatter.context, issues, options.filePath),
    model: readOptionalString(rawFrontmatter.model),
    name,
    paths: toOptionalStringList(rawFrontmatter.paths),
    rawFrontmatter,
    tags: toStringList(rawFrontmatter.tags),
    userInvocable: readBoolean(rawFrontmatter['user-invocable'], true),
    whenToUse: readOptionalString(rawFrontmatter.when_to_use)
  }

  return {
    body,
    issues,
    metadata,
    rawFrontmatter
  }
}

function splitFrontmatter(markdown: string): { body: string; frontmatterText?: string } {
  const normalized = markdown.replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) {
    return { body: normalized }
  }

  const closingMarkerMatch = normalized.slice(4).match(/\n---(?:\n|$)/)
  if (!closingMarkerMatch || closingMarkerMatch.index === undefined) {
    return { body: normalized }
  }

  const closingMarkerIndex = closingMarkerMatch.index + 4
  const closingMarkerLength = closingMarkerMatch[0].length

  return {
    frontmatterText: normalized.slice(4, closingMarkerIndex),
    body: normalized.slice(closingMarkerIndex + closingMarkerLength).trimStart()
  }
}

function collectTopLevelEntries(frontmatterText: string, issues: SkillIssue[], filePath?: string): TopLevelEntry[] {
  const entries: TopLevelEntry[] = []
  const lines = frontmatterText.split('\n')

  for (let index = 0; index < lines.length; ) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed || trimmed.startsWith('#')) {
      index += 1
      continue
    }

    if (countLeadingSpaces(line) > 0) {
      issues.push({
        severity: 'warning',
        code: 'unexpected-indentation',
        message: `Ignoring indented frontmatter line without a parent key: ${trimmed}`,
        filePath
      })
      index += 1
      continue
    }

    const separatorIndex = line.indexOf(':')
    if (separatorIndex < 0) {
      issues.push({
        severity: 'warning',
        code: 'invalid-frontmatter-line',
        message: `Ignoring invalid frontmatter line: ${trimmed}`,
        filePath
      })
      index += 1
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    const inlineValue = line.slice(separatorIndex + 1).trim()
    const childLines: string[] = []

    index += 1
    while (index < lines.length) {
      const childLine = lines[index]
      if (childLine.trim() && countLeadingSpaces(childLine) === 0) {
        break
      }
      childLines.push(childLine)
      index += 1
    }

    entries.push({ childLines, inlineValue, key })
  }

  return entries
}

function parseEntryValue(entry: TopLevelEntry): unknown {
  const key = entry.key
  const inlineValue = entry.inlineValue

  if (key === 'arguments') {
    return parseArgumentsValue(inlineValue, entry.childLines)
  }

  if (key === 'allowed-tools' || key === 'activation-tools' || key === 'aliases' || key === 'tags' || key === 'paths') {
    return parseArrayValue(inlineValue, entry.childLines)
  }

  if (key === 'user-invocable' || key === 'disable-model-invocation') {
    return parseBooleanValue(inlineValue, entry.childLines)
  }

  if (key === 'description' || key === 'when_to_use' || key === 'argument-hint' || key === 'name' || key === 'context' || key === 'model' || key === 'effort') {
    return parseStringValue(inlineValue, entry.childLines)
  }

  return parseGenericValue(inlineValue, entry.childLines)
}

function parseGenericValue(inlineValue: string, childLines: string[]): unknown {
  if (inlineValue) {
    if (inlineValue.startsWith('[') && inlineValue.endsWith(']')) {
      return splitInlineList(inlineValue)
    }
    const booleanValue = parseBooleanToken(inlineValue)
    if (typeof booleanValue === 'boolean') {
      return booleanValue
    }
    return unquote(inlineValue)
  }

  const blockText = collapseChildLines(childLines)
  return blockText || ''
}

function parseStringValue(inlineValue: string, childLines: string[]): string {
  if (inlineValue) {
    if (BLOCK_SCALAR_PATTERN.test(inlineValue)) {
      return collapseChildLines(childLines, inlineValue.startsWith('>')).trim()
    }
    return unquote(inlineValue)
  }

  return collapseChildLines(childLines).trim()
}

function parseBooleanValue(inlineValue: string, childLines: string[]): boolean | undefined {
  const candidate = inlineValue || firstNonEmptyChild(childLines)
  if (!candidate) return undefined
  return parseBooleanToken(candidate)
}

function parseArrayValue(inlineValue: string, childLines: string[]): string[] {
  if (inlineValue) {
    return splitInlineList(inlineValue)
  }

  const values: string[] = []
  for (const line of dedentChildLines(childLines)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    if (trimmed.startsWith('- ')) {
      const item = trimmed.slice(2).trim()
      if (item) values.push(unquote(item))
      continue
    }
    values.push(...splitInlineList(trimmed))
  }
  return unique(values)
}

function parseArgumentsValue(inlineValue: string, childLines: string[]): unknown {
  if (inlineValue) {
    return splitInlineList(inlineValue)
  }

  const dedentedLines = dedentChildLines(childLines)
  const argumentNames: string[] = []

  for (const line of dedentedLines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    if (trimmed.startsWith('- ')) {
      const item = trimmed.slice(2).trim()
      const inlineNameMatch = item.match(/^name\s*:\s*(.+)$/)
      if (inlineNameMatch) {
        argumentNames.push(unquote(inlineNameMatch[1]))
      } else if (!item.includes(':')) {
        argumentNames.push(unquote(item))
      }
      continue
    }

    const keyMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\s*:/)
    if (keyMatch) {
      argumentNames.push(keyMatch[1])
    }
  }

  return unique(argumentNames)
}

function extractArgumentNames(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return unique(
      value
        .map((item) => (typeof item === 'string' ? item : ''))
        .map((item) => item.trim())
        .filter(Boolean)
    )
  }
  if (typeof value === 'object') {
    return unique(Object.keys(value as Record<string, unknown>).map((item) => item.trim()).filter(Boolean))
  }
  if (typeof value === 'string') {
    return unique(splitInlineList(value))
  }
  return []
}

function normalizeToolIds(value: unknown, fieldName: string, issues: SkillIssue[], filePath?: string): string[] {
  const normalized: string[] = []
  const seen = new Set<string>()

  for (const toolName of toStringList(value)) {
    const toolId = resolvePiToolId(toolName)
    if (!toolId) {
      issues.push({
        severity: 'warning',
        code: 'unknown-tool-reference',
        message: `Unknown tool "${toolName}" in ${fieldName}; ignoring it.`,
        filePath
      })
      continue
    }
    if (seen.has(toolId)) continue
    seen.add(toolId)
    normalized.push(toolId)
  }

  return normalized
}

function readRequiredString(value: unknown, fieldName: string, issues: SkillIssue[], filePath?: string): string | undefined {
  const parsed = readOptionalString(value)
  if (parsed) return parsed

  issues.push({
    severity: 'error',
    code: 'missing-required-field',
    message: `Missing required frontmatter field "${fieldName}".`,
    filePath
  })
  return undefined
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readExecutionContext(value: unknown, issues: SkillIssue[], filePath?: string): SkillExecutionContext | undefined {
  const parsed = readOptionalString(value)?.toLowerCase()
  if (!parsed) return undefined

  if (parsed === 'inline' || parsed === 'fork') {
    return parsed
  }

  issues.push({
    severity: 'warning',
    code: 'invalid-skill-context',
    message: `Unknown skill context "${parsed}". Expected "inline" or "fork".`,
    filePath
  })
  return undefined
}

function readEffortLevel(value: unknown, issues: SkillIssue[], filePath?: string): SkillEffortLevel | undefined {
  const parsed = readOptionalString(value)?.toLowerCase()
  if (!parsed) return undefined

  if (parsed === 'minimal' || parsed === 'low' || parsed === 'medium' || parsed === 'high' || parsed === 'xhigh') {
    return parsed
  }

  issues.push({
    severity: 'warning',
    code: 'invalid-skill-effort',
    message: `Unknown skill effort "${parsed}". Expected one of: minimal, low, medium, high, xhigh.`,
    filePath
  })
  return undefined
}

function toOptionalStringList(value: unknown): string[] | undefined {
  const list = toStringList(value)
  return list.length > 0 ? list : undefined
}

function toStringList(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return unique(
      value
        .map((item) => (typeof item === 'string' ? item : ''))
        .map((item) => item.trim())
        .filter(Boolean)
    )
  }
  if (typeof value === 'string') {
    return unique(splitInlineList(value))
  }
  return []
}

function firstNonEmptyChild(childLines: string[]): string | undefined {
  for (const line of childLines) {
    const trimmed = line.trim()
    if (trimmed) return trimmed
  }
  return undefined
}

function collapseChildLines(childLines: string[], foldLines = false): string {
  const dedented = dedentChildLines(childLines)
  if (!foldLines) {
    return dedented.join('\n')
  }
  return dedented
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
}

function dedentChildLines(childLines: string[]): string[] {
  const relevant = childLines.filter((line) => line.trim())
  if (!relevant.length) return []

  const minIndent = Math.min(...relevant.map((line) => countLeadingSpaces(line)))
  return childLines.map((line) => {
    if (!line.trim()) return ''
    return line.slice(minIndent)
  })
}

function parseBooleanToken(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase()
  if (['true', 'yes', 'on', '1'].includes(normalized)) return true
  if (['false', 'no', 'off', '0'].includes(normalized)) return false
  return undefined
}

function splitInlineList(value: string): string[] {
  const trimmed = value.trim()
  const content = trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed
  const tokens: string[] = []
  let current = ''
  let activeQuote: '"' | "'" | undefined

  for (const char of content) {
    if (activeQuote) {
      if (char === activeQuote) {
        activeQuote = undefined
      } else {
        current += char
      }
      continue
    }

    if (char === '"' || char === "'") {
      activeQuote = char
      continue
    }

    if (char === ',' || char === '，' || char === '、' || char === ';' || char === '；') {
      const token = current.trim()
      if (token) tokens.push(unquote(token))
      current = ''
      continue
    }

    current += char
  }

  const lastToken = current.trim()
  if (lastToken) tokens.push(unquote(lastToken))

  return unique(tokens)
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function countLeadingSpaces(value: string): number {
  const match = value.match(/^ */)
  return match ? match[0].length : 0
}
