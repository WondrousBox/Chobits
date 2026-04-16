import type { ToolDefinition } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'

import { getPiToolDescriptor } from '../tool-registry'
import { createSkillSessionState, executeSkill, findSkillByReference, isSkillPathMatched } from '../skills'
import type { PiSessionToolContext } from '../tool-context'
import { createJsonToolResult } from './result'

const skillUseParameters = Type.Object({
  args: Type.Optional(Type.Record(Type.String(), Type.String(), { description: '传给 skill 的参数键值对' })),
  mode: Type.Optional(
    Type.Union([Type.Literal('inline'), Type.Literal('preview')], {
      description: 'inline=加载 skill 并激活建议工具，preview=仅预览 skill 内容和约束'
    })
  ),
  skill: Type.String({ description: '要使用的 skill 名称或别名' })
})

export function createPiSkillUseTool(toolContext: PiSessionToolContext): ToolDefinition<typeof skillUseParameters> {
  return {
    name: 'skillUseTool',
    label: 'skillUseTool',
    description:
      '按名称加载并使用一个 skill。会读取 skill 正文、返回约束与说明；inline 模式下还会激活该 skill 建议的工具，preview 模式只查看不激活。',
    parameters: skillUseParameters,
    async execute(_toolCallId, input) {
      const registry = toolContext.skillRegistry
      if (!registry) {
        return createJsonToolResult({
          success: false,
          error: 'Skill registry is not available in the current session.'
        })
      }

      const state = toolContext.skillSessionState || (toolContext.skillSessionState = createSkillSessionState())
      const record = findSkillByReference(registry.list(), input.skill)
      if (!record) {
        return createJsonToolResult({
          success: false,
          error: `未找到 skill "${input.skill}"`,
          availableSkills: registry.list().map((skill) => skill.name)
        })
      }

      const entry = registry.getEntry(record.name)
      if (!entry) {
        return createJsonToolResult({
          success: false,
          error: `Skill "${record.name}" 已存在于 registry metadata 中，但缺少可执行入口`
        })
      }

      const workspaceRoot = toolContext.coding?.rootPath?.trim() || process.cwd()
      const mode = input.mode ?? 'inline'
      const pathsMatched = isSkillPathMatched(record, workspaceRoot)

      if (!pathsMatched && mode === 'inline') {
        return createJsonToolResult({
          success: false,
          error: `Skill "${record.name}" 的路径约束与当前 workspace 不匹配`,
          paths: record.paths
        })
      }

      try {
        const result = await executeSkill(entry, {
          args: input.args,
          mode,
          sessionId: toolContext.conversationId,
          state,
          workspaceRoot
        })

        let activatedToolNames: string[] = []
        let forkedExecution: Awaited<ReturnType<NonNullable<PiSessionToolContext['runForkedSkill']>>> | undefined
        if (mode === 'inline' && result.executionContext === 'inline' && toolContext.session && result.activationToolIds.length > 0) {
          const suggestedToolNames = result.activationToolIds
            .map((toolId) => getPiToolDescriptor(toolId)?.name)
            .filter((toolName): toolName is string => Boolean(toolName))

          const currentActiveToolNames = toolContext.session.getActiveToolNames()
          const nextActiveToolNames = Array.from(new Set([...currentActiveToolNames, ...suggestedToolNames]))
          toolContext.session.setActiveToolsByName(nextActiveToolNames)
          activatedToolNames = suggestedToolNames.filter((toolName) => !currentActiveToolNames.includes(toolName))
        }

        if (mode === 'inline' && result.executionContext === 'fork' && toolContext.runForkedSkill) {
          forkedExecution = await toolContext.runForkedSkill(result, { toolCallId: _toolCallId })
        }

        return createJsonToolResult({
          success: true,
          activatedToolNames,
          activationToolIds: result.activationToolIds,
          allowedToolIds: result.allowedToolIds,
          content: result.content,
          effort: result.effort,
          executionContext: result.executionContext,
          executionMode: result.executionMode,
          forkedExecution,
          model: result.model,
          pathsMatched: result.pathsMatched,
          resolvedArgs: result.resolvedArgs,
          skill: result.record.name,
          source: result.source,
          warning:
            result.executionContext === 'fork' && !forkedExecution
              ? 'This skill requests fork execution. The current runtime surfaces its instructions and overrides, but does not automatically spawn a forked session yet.'
              : undefined
        })
      } catch (error: any) {
        return createJsonToolResult({
          success: false,
          error: error?.message || `Failed to use skill "${record.name}".`,
          skill: record.name
        })
      }
    }
  }
}
