import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import * as retrieval from '../../../services/memory-retrieval-service';
import type { PiSessionToolContext } from '../tool-context';
import { buildRetrievalDbDeps } from './memory-db-deps';
import { createJsonToolResult } from './result';

const memoryGetParameters = Type.Object({
  noteId: Type.String({ description: '记忆 note ID（从 memorySearchTool 结果获取）' }),
  section: Type.Optional(
    Type.String({
      description: '段落标题，如 "Key Points" 或 "Open Items"。不填则返回整篇 note 的标题树。'
    })
  ),
  lineRange: Type.Optional(
    Type.Object({
      start: Type.Number({ description: '起始行号（1-based）' }),
      end: Type.Number({ description: '结束行号（1-based）' })
    })
  )
});

export function createPiMemoryGetTool(_toolContext: PiSessionToolContext): ToolDefinition<typeof memoryGetParameters> {
  void _toolContext;
  const db = buildRetrievalDbDeps();

  return {
    name: 'memoryGetTool',
    label: 'memoryGetTool',
    description: '读取记忆 note 的具体段落内容。先用 memorySearchTool 找到相关 note，再用此工具读取详情。不指定 section 时返回标题树概览。',
    parameters: memoryGetParameters,

    async execute(_toolCallId, input) {
      try {
        const result = await retrieval.get(input.noteId, db, {
          section: input.section,
          lineRange: input.lineRange
        });

        if (!result) {
          return createJsonToolResult({ success: false, error: `Note "${input.noteId}" not found` });
        }

        return createJsonToolResult({
          success: true,
          ...result
        });
      } catch (error: any) {
        return createJsonToolResult({
          success: false,
          error: error?.message || 'Memory get failed'
        });
      }
    }
  };
}
