import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import * as retrieval from '../../../services/memory-retrieval-service';
import type { PiSessionToolContext } from '../tool-context';
import { buildRetrievalDbDeps, resolveWorkspaceId } from './memory-db-deps';
import { createJsonToolResult } from './result';

const memoryTopicsParameters = Type.Object({
    topicId: Type.Optional(
        Type.String({
            description: '主题 ID。不填则返回根主题列表（按活跃度排序）。'
        })
    ),
    action: Type.Optional(
        Type.Union([Type.Literal('children'), Type.Literal('related'), Type.Literal('notes')], {
            description: '操作类型：children=子主题，related=关联主题，notes=该主题下的记忆列表。默认 children'
        })
    ),
    limit: Type.Optional(
        Type.Number({
            description: '返回数量，默认 10',
            minimum: 1,
            maximum: 50
        })
    )
});

export function createPiMemoryTopicsTool(_toolContext: PiSessionToolContext): ToolDefinition<typeof memoryTopicsParameters> {
    void _toolContext;
    const db = buildRetrievalDbDeps();

    return {
        name: 'memoryTopicsTool',
        label: 'memoryTopicsTool',
        description: '浏览记忆主题图谱。查看主题层级结构、相关主题、某主题下的记忆列表。用于导航和发现记忆内容。',
        parameters: memoryTopicsParameters,

        async execute(_toolCallId, input) {
            try {
                const workspaceId = await resolveWorkspaceId();

                const result = await retrieval.browseTopics(db, {
                    topicId: input.topicId,
                    action: input.action,
                    workspaceId,
                    limit: input.limit
                });

                return createJsonToolResult({
                    success: true,
                    ...result
                });
            } catch (error: any) {
                return createJsonToolResult({
                    success: false,
                    error: error?.message || 'Memory topics browse failed'
                });
            }
        }
    };
}
