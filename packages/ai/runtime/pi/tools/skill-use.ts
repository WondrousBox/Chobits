import { randomUUID } from 'node:crypto'

import type { ToolDefinition } from '@mariozechner/pi-coding-agent'
import { Type } from '@sinclair/typebox'

import type { UserChoiceRequest } from '../../../types'
import { getPiToolDescriptor } from '../tool-registry'
import { createSkillSessionState, executeSkill, findSkillByReference, getSkillSourceInfo, getSkillSourcePolicy, isSkillPathMatched, markGuardedSkillApproved, requiresSkillSourceCaution } from '../skills'
import type { PiSessionToolContext } from '../tool-context'
import { createJsonToolResult } from './result'

const skillUseParameters = Type.Object({
  acknowledgeRisk: Type.Optional(
    Type.Boolean({
      description: '为更高风险的 plugin / compatibility skill 提供显式确认，允许在完成审阅后继续 inline 执行'
    })
  ),
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
      const sourceInfo = getSkillSourceInfo(record)
      const sourcePolicy = getSkillSourcePolicy(record)

      if (!pathsMatched && mode === 'inline') {
        return createJsonToolResult({
          success: false,
          error: `Skill "${record.name}" 的路径约束与当前 workspace 不匹配`,
          paths: record.paths
        })
      }

      const hasExplicitUserIntent = toolContext.resolved.explicitSkillInvocation?.skillName === record.name
      let effectiveMode = mode
      let confirmationOutcome: 'blocked' | 'cancelled' | 'confirmed-inline' | 'previewed' | undefined

      if (mode === 'inline' && sourcePolicy.requiresExplicitUserIntent && !hasExplicitUserIntent && input.acknowledgeRisk !== true) {
        const confirmationDecision = await promptForGuardedSkillExecution(toolContext, _toolCallId, {
          skillName: record.name,
          sourceDetail: sourceInfo.detail,
          sourceLabel: sourceInfo.label,
          sourcePolicy,
          trustNote: sourceInfo.trustNote
        })

        if (confirmationDecision === 'cancel') {
          return createJsonToolResult({
            success: false,
            cancelled: true,
            confirmationOutcome: 'cancelled',
            error: `User declined to continue with guarded skill "${record.name}".`,
            skill: record.name,
            source: record.source,
            sourceDetail: sourceInfo.detail,
            sourceLabel: sourceInfo.label,
            sourcePolicy,
            trustNote: sourceInfo.trustNote,
            trustLevel: sourceInfo.trustLevel
          })
        }

        if (confirmationDecision === 'preview') {
          effectiveMode = 'preview'
          confirmationOutcome = 'previewed'
        } else if (confirmationDecision === 'inline') {
          confirmationOutcome = 'confirmed-inline'
        } else {
          confirmationOutcome = 'blocked'
          return createJsonToolResult({
            success: false,
            error: `Skill "${record.name}" requires explicit confirmation before inline execution because it comes from a guarded source.`,
            nextStep:
              sourcePolicy.requiresPreviewBeforeInline
                ? `先调用 skillUseTool({ skill: '${record.name}', mode: 'preview' }) 审阅内容，再在确认后使用 acknowledgeRisk: true 重试 inline。`
                : `如果确认继续，请在下一次调用时传入 acknowledgeRisk: true。`,
            requiresConfirmation: true,
            confirmationOutcome,
            skill: record.name,
            source: record.source,
            sourceDetail: sourceInfo.detail,
            sourceLabel: sourceInfo.label,
            sourcePolicy,
            trustNote: sourceInfo.trustNote,
            trustLevel: sourceInfo.trustLevel
          })
        }
      }

      try {
        const result = await executeSkill(entry, {
          args: input.args,
          mode: effectiveMode,
          sessionId: toolContext.conversationId,
          state,
          workspaceRoot
        })

        if (
          effectiveMode === 'inline' &&
          sourcePolicy.riskLevel === 'guarded' &&
          (input.acknowledgeRisk === true || confirmationOutcome === 'confirmed-inline')
        ) {
          markGuardedSkillApproved(state, record.name)
        }

        let activatedToolNames: string[] = []
        let forkedExecution: Awaited<ReturnType<NonNullable<PiSessionToolContext['runForkedSkill']>>> | undefined
        if (effectiveMode === 'inline' && result.executionContext === 'inline' && toolContext.session && result.activationToolIds.length > 0) {
          const suggestedToolNames = result.activationToolIds
            .map((toolId) => getPiToolDescriptor(toolId)?.name)
            .filter((toolName): toolName is string => Boolean(toolName))

          const currentActiveToolNames = toolContext.session.getActiveToolNames()
          const nextActiveToolNames = Array.from(new Set([...currentActiveToolNames, ...suggestedToolNames]))
          toolContext.session.setActiveToolsByName(nextActiveToolNames)
          activatedToolNames = suggestedToolNames.filter((toolName) => !currentActiveToolNames.includes(toolName))
        }

        if (effectiveMode === 'inline' && result.executionContext === 'fork' && toolContext.runForkedSkill) {
          forkedExecution = await toolContext.runForkedSkill(result, { toolCallId: _toolCallId })
        }

        const resultSourceInfo = getSkillSourceInfo(result.record)
        const resultSourcePolicy = getSkillSourcePolicy(result.record)
        const warnings: string[] = []

        if (requiresSkillSourceCaution(resultSourceInfo.trustLevel) && resultSourceInfo.trustNote) {
          warnings.push(resultSourceInfo.trustNote)
        }

        if (resultSourcePolicy.riskLevel === 'guarded') {
          warnings.push(resultSourcePolicy.message)
        }

        if (confirmationOutcome === 'previewed') {
          warnings.push('User chose to preview this guarded skill instead of executing it inline.')
        }

        if (confirmationOutcome === 'confirmed-inline') {
          warnings.push('User explicitly confirmed inline execution for this guarded skill.')
        }

        if (result.executionContext === 'fork' && !forkedExecution) {
          warnings.push('This skill requests fork execution. The current runtime surfaces its instructions and overrides, but does not automatically spawn a forked session yet.')
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
          confirmationOutcome,
          pathsMatched: result.pathsMatched,
          resolvedArgs: result.resolvedArgs,
          skill: result.record.name,
          source: result.source,
          sourceDetail: resultSourceInfo.detail,
          sourceLabel: resultSourceInfo.label,
          sourcePolicy: resultSourcePolicy,
          trustNote: resultSourceInfo.trustNote,
          trustLevel: resultSourceInfo.trustLevel,
          warning: warnings.length > 0 ? warnings.join(' ') : undefined
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

async function promptForGuardedSkillExecution(
  toolContext: PiSessionToolContext,
  toolCallId: string,
  input: {
    skillName: string
    sourceDetail?: string
    sourceLabel: string
    sourcePolicy: { message: string }
    trustNote?: string
  }
): Promise<'cancel' | 'inline' | 'preview' | undefined> {
  const { emitUserChoiceRequest, waitForUserChoiceResponse } = toolContext
  if (!emitUserChoiceRequest || !waitForUserChoiceResponse) {
    return undefined
  }

  const choiceId = randomUUID()
  const request: UserChoiceRequest = {
    choiceId,
    toolCallId,
    prompt: `Skill "${input.skillName}" 来自 ${input.sourceLabel}，当前命中了更严格的执行保护。请选择如何继续。`,
    questions: [
      {
        id: 'guarded_skill_execution',
        title: `如何处理高风险 skill "${input.skillName}"？`,
        description: [input.sourcePolicy.message, input.trustNote, input.sourceDetail ? `来源目录：${input.sourceDetail}` : undefined].filter(Boolean).join(' '),
        multiple: false,
        options: [
          {
            value: 'preview',
            label: '先预览',
            description: '只加载 skill 指令和约束，不激活工具。'
          },
          {
            value: 'inline',
            label: '确认执行',
            description: '继续 inline 执行这个 skill。'
          },
          {
            value: 'cancel',
            label: '取消',
            description: '先不使用这个 skill。'
          }
        ]
      }
    ]
  }

  emitUserChoiceRequest(request)
  const response = await waitForUserChoiceResponse(choiceId)
  const answer = response.answers['guarded_skill_execution']?.[0]
  if (answer === 'preview' || answer === 'inline' || answer === 'cancel') {
    return answer
  }
  return 'cancel'
}
