import type { ToolDefinition } from '@mariozechner/pi-coding-agent'
import { WorkspacesRepo } from '@packages/common/db'
import { Type } from '@sinclair/typebox'

import type { PersonaCandidateFact, PersonaChatFn, PersonaUpdateJobParams, PersonaUpdateReason } from '../../../services/persona-types'
import { updatePersona } from '../../../services/persona-update-service'
import { createManagedTaskChatFn, LONG_TASK_CHAT_TIMEOUTS } from '../../../services/task-chat-runner'
import { resolveGuardedToolExecution } from '../skills'
import { createPiTaskChatRuntimeFromRequest, type PiTaskChatFunction } from '../task-chat'
import { buildNonReasoningTaskRuntimeRequest } from '../task-model-policy'
import type { PiSessionToolContext } from '../tool-context'
import { resolveWorkspaceId } from './memory-db-deps'
import { createJsonToolResult } from './result'

const personaUpdateParameters = Type.Object({
  candidateFacts: Type.Array(
    Type.Object({
      dimension: Type.Union(
        [
          Type.Literal('basic'),
          Type.Literal('preference'),
          Type.Literal('goal'),
          Type.Literal('personality'),
          Type.Literal('decision'),
          Type.Literal('activity'),
          Type.Literal('recent')
        ],
        { description: 'Persona dimension.' }
      ),
      statement: Type.String({ description: 'Candidate persona fact.' }),
      confidence: Type.Number({ description: 'Confidence between 0.0 and 1.0.', minimum: 0, maximum: 1 })
    }),
    {
      description: 'Candidate persona facts to merge into USER_PERSONA.md.',
      minItems: 1
    }
  ),
  reason: Type.Optional(
    Type.String({
      description: 'Optional reason such as new_stable_preference or new_goal_or_priority.'
    })
  )
})

function adaptChatFn(piChatFn: PiTaskChatFunction): PersonaChatFn {
  return createManagedTaskChatFn(piChatFn, {
    tag: '[PersonaUpdateTool]',
    timeouts: LONG_TASK_CHAT_TIMEOUTS
  })
}

export function createPiPersonaUpdateTool(toolContext: PiSessionToolContext): ToolDefinition<typeof personaUpdateParameters> {
  return {
    name: 'personaUpdateTool',
    label: 'personaUpdateTool',
    description: 'Update USER_PERSONA.md when the conversation reveals stable user preferences, goals, or other important persona facts.',
    parameters: personaUpdateParameters,
    async execute(toolCallId, input) {
      const tag = '[PersonaUpdateTool]'

      try {
        const guardResolution = await resolveGuardedToolExecution(toolContext, toolCallId, 'persona-update')
        if (guardResolution?.kind === 'blocked' || guardResolution?.kind === 'cancel') {
          return createJsonToolResult(guardResolution.details)
        }

        const workspaceId = await resolveWorkspaceId(toolContext)
        if (!workspaceId) {
          return createJsonToolResult({ success: false, error: 'No active workspace' })
        }

        const workspace = await WorkspacesRepo.getById(workspaceId)
        if (!workspace?.rootPath) {
          return createJsonToolResult({ success: false, error: 'Workspace root path not found' })
        }

        const providerId = toolContext.resolved?.model?.providerId
        if (!providerId) {
          return createJsonToolResult({ success: false, error: 'No provider available for LLM call' })
        }

        const providerPresetId = toolContext.resolved?.model?.presetId
        const conversationId = toolContext.conversationId
        const candidateFacts: PersonaCandidateFact[] = input.candidateFacts.map((fact) => ({
          dimension: fact.dimension,
          statement: fact.statement,
          confidence: fact.confidence
        }))
        const reason: PersonaUpdateReason = (input.reason as PersonaUpdateReason) || 'new_stable_preference'

        const jobParams: PersonaUpdateJobParams = {
          workspaceId,
          evidence: conversationId ? [{ conversationId, seqStart: 0, seqEnd: 0 }] : [],
          candidateFacts,
          reason,
          providerId,
          providerPresetId
        }

        console.log(`${tag} Creating LLM runtime for agent-initiated persona update: provider=${providerId}`)
        const runtime = await createPiTaskChatRuntimeFromRequest(
          buildNonReasoningTaskRuntimeRequest({
            providerId,
            providerPresetId,
            agentId: 'user-persona-update',
            maxTokens: 2000
          })
        )
        const chatFn = adaptChatFn(runtime.chatFn)

        console.log(`${tag} Executing persona update: ${candidateFacts.length} facts, reason=${reason}`)
        const result = await updatePersona(jobParams, chatFn, workspace.rootPath)
        console.log(`${tag} Persona update completed: action=${result.action}, chars=${result.charCount}, items=${result.itemCount}`)

        return createJsonToolResult({
          success: true,
          action: result.action,
          charCount: result.charCount,
          itemCount: result.itemCount,
          factCount: candidateFacts.length,
          reason,
          ...(guardResolution?.warning ? { warning: guardResolution.warning } : {}),
          message: `Persona updated: ${candidateFacts.map((fact) => fact.statement).join('; ')}`
        })
      } catch (error: any) {
        console.error(`${tag} Persona update failed:`, error?.message || error)
        return createJsonToolResult({
          success: false,
          error: error?.message || 'Failed to update persona'
        })
      }
    }
  }
}
