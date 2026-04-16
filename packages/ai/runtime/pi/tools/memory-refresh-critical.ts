import type { ToolDefinition } from '@mariozechner/pi-coding-agent'
import { MemoryNoteRepo, MemoryTopicRepo, WorkspacesRepo } from '@packages/common/db'
import { Type } from '@sinclair/typebox'

import { clearCriticalFactsCache, clearRecallCache } from '../../../services/memory-auto-recall'
import { type ContentGenDbDeps, generateMemoryIndex } from '../../../services/memory-content-gen'
import { resolveGuardedToolExecution } from '../skills'
import type { PiSessionToolContext } from '../tool-context'
import { resolveWorkspaceId } from './memory-db-deps'
import { createJsonToolResult } from './result'

const memoryRefreshCriticalParameters = Type.Object({
  reason: Type.Optional(
    Type.String({
      description: 'Optional explanation for why MEMORY.md should be regenerated immediately.'
    })
  )
})

function buildContentGenDb(): ContentGenDbDeps {
  return {
    listNotesByDate: (date, workspaceId) => MemoryNoteRepo.listByDate(date, workspaceId),
    listNotesByWorkspace: (workspaceId, limit, offset) => MemoryNoteRepo.listByWorkspace(workspaceId, limit, offset),
    listAllTopics: (workspaceId, limit) => MemoryTopicRepo.listAll(workspaceId, limit),
    listNotesByTopicId: (topicId, workspaceId, limit) => MemoryNoteRepo.listByTopicId(topicId, workspaceId, limit)
  }
}

export function createPiMemoryRefreshCriticalTool(toolContext: PiSessionToolContext): ToolDefinition<typeof memoryRefreshCriticalParameters> {
  return {
    name: 'memoryRefreshCriticalTool',
    label: 'memoryRefreshCriticalTool',
    description: 'Regenerate MEMORY.md immediately after important memory writes so always-loaded recall stays fresh.',
    parameters: memoryRefreshCriticalParameters,
    async execute(toolCallId, input) {
      const tag = '[MemoryRefreshCritical]'

      try {
        const guardResolution = await resolveGuardedToolExecution(toolContext, toolCallId, 'memory-refresh-critical')
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

        const reason = input.reason || 'agent-initiated'
        console.log(`${tag} Regenerating MEMORY.md: workspace=${workspaceId}, reason=${reason}`)

        const result = await generateMemoryIndex(workspace.rootPath, buildContentGenDb(), workspaceId)

        clearCriticalFactsCache()
        if (toolContext.conversationId) {
          clearRecallCache(toolContext.conversationId)
        }

        console.log(`${tag} MEMORY.md refreshed: notes=${result.noteCount}, selected=${result.selectedCount}, topics=${result.topicCount}`)

        return createJsonToolResult({
          success: true,
          noteCount: result.noteCount,
          selectedCount: result.selectedCount,
          topicCount: result.topicCount,
          cachesCleared: true,
          ...(guardResolution?.warning ? { warning: guardResolution.warning } : {}),
          message: `MEMORY.md refreshed with ${result.selectedCount} selected memories.`
        })
      } catch (error: any) {
        console.error(`${tag} MEMORY.md refresh failed:`, error?.message || error)
        return createJsonToolResult({
          success: false,
          error: error?.message || 'Failed to refresh MEMORY.md'
        })
      }
    }
  }
}
