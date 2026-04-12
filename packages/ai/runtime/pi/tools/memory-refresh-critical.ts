import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { MemoryNoteRepo, MemoryTopicRepo, WorkspacesRepo } from '@packages/common/db';
import { Type } from '@sinclair/typebox';

import { clearCriticalFactsCache, clearRecallCache } from '../../../services/memory-auto-recall';
import { type ContentGenDbDeps, generateMemoryIndex } from '../../../services/memory-content-gen';
import type { PiSessionToolContext } from '../tool-context';
import { resolveWorkspaceId } from './memory-db-deps';
import { createJsonToolResult } from './result';

const memoryRefreshCriticalParameters = Type.Object({
  reason: Type.Optional(
    Type.String({
      description: '触发刷新的原因说明（可选），如"刚保存了用户的重要偏好"'
    })
  )
});

function buildContentGenDb(): ContentGenDbDeps {
  return {
    listNotesByDate: (date, workspaceId) => MemoryNoteRepo.listByDate(date, workspaceId),
    listNotesByWorkspace: (workspaceId, limit, offset) => MemoryNoteRepo.listByWorkspace(workspaceId, limit, offset),
    listAllTopics: (workspaceId, limit) => MemoryTopicRepo.listAll(workspaceId, limit),
    listNotesByTopicId: (topicId, workspaceId, limit) => MemoryNoteRepo.listByTopicId(topicId, workspaceId, limit)
  };
}

/**
 * Agent-initiated MEMORY.md refresh tool.
 *
 * 当 Agent 保存了重要记忆（通过 memorySaveTool）后，
 * 新保存的内容不会立即出现在 MEMORY.md 的 Critical Facts / User Preferences 中。
 * 此工具立即重新生成 MEMORY.md 并清除缓存，
 * 使关键记忆在下一轮对话中即可通过 always-loaded 机制注入。
 *
 * 典型使用场景：
 * 1. 先用 memorySaveTool 保存高重要度笔记
 * 2. 然后调用此工具刷新 MEMORY.md
 */
export function createPiMemoryRefreshCriticalTool(toolContext: PiSessionToolContext): ToolDefinition<typeof memoryRefreshCriticalParameters> {
  return {
    name: 'memoryRefreshCriticalTool',
    label: 'memoryRefreshCriticalTool',
    description:
      '立即刷新 MEMORY.md（关键记忆索引）。在使用 memorySaveTool 保存了重要记忆后调用此工具，使其立即生效——新保存的关键事实和用户偏好将在后续对话中自动注入。通常与 memorySaveTool 配合使用。',
    parameters: memoryRefreshCriticalParameters,

    async execute(_toolCallId, input) {
      const TAG = '[MemoryRefreshCritical]';
      try {
        const workspaceId = await resolveWorkspaceId(toolContext);
        if (!workspaceId) {
          return createJsonToolResult({ success: false, error: 'No active workspace' });
        }

        const ws = await WorkspacesRepo.getById(workspaceId);
        if (!ws?.rootPath) {
          return createJsonToolResult({ success: false, error: 'Workspace root path not found' });
        }

        const reason = input.reason || 'agent-initiated';
        console.log(`${TAG} Regenerating MEMORY.md: workspace=${workspaceId}, reason=${reason}`);

        // Regenerate MEMORY.md
        const db = buildContentGenDb();
        const result = await generateMemoryIndex(ws.rootPath, db, workspaceId);

        // Clear caches so the next system prompt gets fresh data
        clearCriticalFactsCache();
        const conversationId = toolContext.conversationId;
        if (conversationId) {
          clearRecallCache(conversationId);
        }

        console.log(`${TAG} MEMORY.md refreshed: notes=${result.noteCount}, selected=${result.selectedCount}, topics=${result.topicCount}`);

        return createJsonToolResult({
          success: true,
          noteCount: result.noteCount,
          selectedCount: result.selectedCount,
          topicCount: result.topicCount,
          cachesCleared: true,
          message: `MEMORY.md 已刷新（${result.selectedCount} 条关键记忆已更新），缓存已清除`
        });
      } catch (error: any) {
        console.error(`${TAG} MEMORY.md refresh failed:`, error?.message || error);
        return createJsonToolResult({
          success: false,
          error: error?.message || 'Failed to refresh MEMORY.md'
        });
      }
    }
  };
}
