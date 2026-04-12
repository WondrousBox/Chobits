import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import * as retrieval from '../../../services/memory-retrieval-service';
import type { PiSessionToolContext } from '../tool-context';
import { buildRetrievalDbDeps, resolveWorkspaceId } from './memory-db-deps';
import { createJsonToolResult } from './result';

const memorySearchParameters = Type.Object({
  query: Type.String({ description: '搜索查询，自然语言描述想要回忆的内容' }),
  topicFilter: Type.Optional(
    Type.Array(Type.String(), {
      description: '限定搜索的主题范围，如 ["AI Agent", "记忆系统"]'
    })
  ),
  dateRange: Type.Optional(
    Type.Object({
      start: Type.Optional(Type.String({ description: '起始日期 YYYY-MM-DD' })),
      end: Type.Optional(Type.String({ description: '结束日期 YYYY-MM-DD' }))
    })
  ),
  maxResults: Type.Optional(
    Type.Number({
      description: '最大返回条数，默认 5',
      minimum: 1,
      maximum: 20
    })
  ),
  includeContent: Type.Optional(
    Type.Boolean({
      description: '是否包含段落摘要，默认 false（只返回 note 摘要）'
    })
  ),
  debug: Type.Optional(
    Type.Boolean({
      description: 'Return debug scoring breakdowns and recall routes. Default false.'
    })
  )
});

export function createPiMemorySearchTool(toolContext: PiSessionToolContext): ToolDefinition<typeof memorySearchParameters> {
  const db = buildRetrievalDbDeps();

  return {
    name: 'memorySearchTool',
    label: 'memorySearchTool',
    description:
      '搜索长期记忆，回忆过去对话中的要点、决策和偏好。返回匹配的记忆摘要列表。当用户提到"之前"、"上次"、"记得"、"我们聊过"等词语，或涉及偏好、历史决定、待办事项时使用。支持广泛查询（如"我们聊过什么"），此时会返回最近的记忆列表。',
    parameters: memorySearchParameters,

    async execute(_toolCallId, input) {
      try {
        const workspaceId = await resolveWorkspaceId(toolContext);
        if (!workspaceId) {
          return createJsonToolResult({ success: false, error: 'No active workspace', topics: [], notes: [], totalFound: 0 });
        }

        const result = await retrieval.search(input.query, workspaceId, db, {
          maxResults: input.maxResults,
          includeContent: input.includeContent,
          debug: input.debug,
          topicFilter: input.topicFilter,
          dateRange: input.dateRange
        });

        return createJsonToolResult({
          success: true,
          ...result
        });
      } catch (error: any) {
        return createJsonToolResult({
          success: false,
          error: error?.message || 'Memory search failed',
          topics: [],
          notes: [],
          totalFound: 0
        });
      }
    }
  };
}
