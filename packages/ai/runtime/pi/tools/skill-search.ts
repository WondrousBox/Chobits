import type { ToolDefinition } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'

import { createSkillSessionState, findSkillByReference, getSkillSourceInfo, getSkillSourcePolicy, isSkillPathMatched, markSkillDiscovered, searchSkills } from '../skills'
import type { PiSessionToolContext } from '../tool-context'
import type { SkillRecord, SkillSessionState } from '../skills'
import { createJsonToolResult } from './result'

const skillSearchParameters = Type.Object({
  action: Type.Union([Type.Literal('list'), Type.Literal('search'), Type.Literal('get')], {
    description: 'list=列出可见 skills，search=按意图搜索 skill，get=按名称/别名获取 skill metadata'
  }),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, description: '返回 skill 数量上限，默认 10' })),
  query: Type.Optional(Type.String({ description: 'search 时填搜索词，get 时填 skill 名称或别名' }))
})

export function createPiSkillSearchTool(toolContext: PiSessionToolContext): ToolDefinition<typeof skillSearchParameters> {
  return {
    name: 'skillSearchTool',
    label: 'skillSearchTool',
    description:
      '搜索和查看当前 session 可用的 skills。list 返回 skill 列表，search 按意图匹配相关 skills，get 按名称获取某个 skill 的 metadata。不会加载 skill 正文。',
    parameters: skillSearchParameters,
    async execute(_toolCallId, input) {
      const registry = toolContext.skillRegistry
      if (!registry) {
        return createJsonToolResult({
          success: false,
          error: 'Skill registry is not available in the current session.'
        })
      }

      const state = toolContext.skillSessionState || (toolContext.skillSessionState = createSkillSessionState())
      const visibleRecords = registry.listModelVisible()
      const workspaceRoot = toolContext.coding?.rootPath?.trim() || process.cwd()
      const limit = input.limit ?? 10

      if (input.action === 'list') {
        const results = visibleRecords.slice(0, limit).map((record) => buildSkillMetadata(record, state, workspaceRoot))
        return createJsonToolResult({
          success: true,
          skills: results,
          total: visibleRecords.length
        })
      }

      if (input.action === 'get') {
        if (!input.query?.trim()) {
          return createJsonToolResult({ success: false, error: 'get 需要提供 query（skill 名称或别名）' })
        }

        const record = findSkillByReference(visibleRecords, input.query)
        if (!record) {
          return createJsonToolResult({
            success: false,
            error: `未找到 skill "${input.query}"`,
            availableSkills: visibleRecords.map((skill) => skill.name)
          })
        }

        markSkillDiscovered(state, record.name)

        return createJsonToolResult({
          success: true,
          skill: buildSkillMetadata(record, state, workspaceRoot)
        })
      }

      if (!input.query?.trim()) {
        return createJsonToolResult({ success: false, error: 'search 需要提供 query' })
      }

      const matches = searchSkills(visibleRecords, {
        limit,
        query: input.query,
        workspaceRoot
      })

      for (const match of matches) {
        markSkillDiscovered(state, match.record.name)
      }

      return createJsonToolResult({
        success: true,
        query: input.query,
        results: matches.map((match) => ({
          ...buildSkillMetadata(match.record, state, workspaceRoot, match.pathsMatched),
          matchedFields: match.matchedFields,
          score: match.score
        })),
        total: matches.length
      })
    }
  }
}

function buildSkillMetadata(
  record: SkillRecord,
  state: SkillSessionState,
  workspaceRoot: string,
  pathsMatched = isSkillPathMatched(record, workspaceRoot)
) {
  const sourceInfo = getSkillSourceInfo(record)
  const sourcePolicy = getSkillSourcePolicy(record)
  return {
    activationToolIds: record.activationToolIds,
    aliases: record.aliases,
    allowedToolIds: record.allowedToolIds,
    argumentHint: record.argumentHint,
    argumentNames: record.argumentNames,
    description: record.description,
    disableModelInvocation: record.disableModelInvocation,
    effort: record.effort,
    executionContext: record.executionContext || 'inline',
    isActive: state.activeSkillNames.has(record.name),
    isDiscovered: state.discoveredSkillNames.has(record.name),
    isLoaded: state.loadedSkillNames.has(record.name),
    model: record.model,
    name: record.name,
    paths: record.paths,
    pathsMatched,
    source: record.source,
    sourceDetail: sourceInfo.detail,
    sourceLabel: sourceInfo.label,
    sourcePolicy,
    tags: record.tags,
    trustNote: sourceInfo.trustNote,
    trustLevel: sourceInfo.trustLevel,
    userInvocable: record.userInvocable,
    whenToUse: record.whenToUse
  }
}
