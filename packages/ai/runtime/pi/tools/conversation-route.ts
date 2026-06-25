import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { ConversationRouteEventRepo, ConversationRouteSnapshotRepo } from '@packages/common/db';

import type { PiSessionToolContext } from '../tool-context';
import { resolveWorkspaceId } from './memory-db-deps';
import { createJsonToolResult } from './result';

const conversationRouteParameters = Type.Object({
  action: Type.Union(
    [
      Type.Literal('getSnapshot'),
      Type.Literal('listEvents'),
      Type.Literal('searchEvents'),
      Type.Literal('updateEvent')
    ],
    { description: '要执行的动作' }
  ),
  conversationId: Type.Optional(Type.String({ description: '会话 ID；不填时默认使用当前会话' })),
  eventId: Type.Optional(Type.String({ description: 'updateEvent 时需要更新的线路事件 ID' })),
  limit: Type.Optional(Type.Number({ description: '最多返回数量，默认 20', minimum: 1, maximum: 100 })),
  query: Type.Optional(Type.String({ description: 'searchEvents 查询文本' })),
  status: Type.Optional(Type.String({ description: 'listEvents 或 updateEvent 的状态过滤/更新值' })),
  type: Type.Optional(Type.String({ description: 'listEvents 的事件类型过滤' })),
  workspaceId: Type.Optional(Type.String({ description: 'searchEvents 的 workspace 限定；不填时自动解析当前 workspace' }))
});

export function createPiConversationRouteTool(toolContext: PiSessionToolContext): ToolDefinition<typeof conversationRouteParameters> {
  return {
    name: 'conversationRouteTool',
    label: 'conversationRouteTool',
    description:
      '查询当前或历史会话的 Conversation Route Memory（会话线路记忆）：当前目标、话题转折、待办、用户纠正、关键线索、决策和事件时间线。当用户问“当前这场对话的线路/进展/待办/时间线”或你需要回看本会话过程时使用。',
    parameters: conversationRouteParameters,

    async execute(_toolCallId, input) {
      try {
        const conversationId = input.conversationId || toolContext.conversationId;

        if (input.action === 'getSnapshot') {
          if (!conversationId) return createJsonToolResult({ success: false, error: 'No conversationId available' });
          return createJsonToolResult({
            success: true,
            snapshot: (await ConversationRouteSnapshotRepo.get(conversationId)) ?? null
          });
        }

        if (input.action === 'listEvents') {
          if (!conversationId) return createJsonToolResult({ success: false, error: 'No conversationId available', events: [] });
          const events = await ConversationRouteEventRepo.listByConversation(conversationId, {
            limit: input.limit,
            status: input.status as any,
            type: input.type as any
          });
          return createJsonToolResult({ success: true, events });
        }

        if (input.action === 'searchEvents') {
          if (!input.query?.trim()) return createJsonToolResult({ success: false, error: 'query is required', events: [] });
          const workspaceId = input.workspaceId || (await resolveWorkspaceId(toolContext));
          const events = await ConversationRouteEventRepo.search({
            conversationId,
            workspaceId,
            query: input.query,
            limit: input.limit
          });
          return createJsonToolResult({ success: true, events });
        }

        if (input.action === 'updateEvent') {
          if (!input.eventId) return createJsonToolResult({ success: false, error: 'eventId is required' });
          const event = await ConversationRouteEventRepo.update(input.eventId, {
            status: input.status as any
          });
          const snapshot = event?.conversationId ? await ConversationRouteSnapshotRepo.recomputeFromEvents(event.conversationId) : undefined;
          return createJsonToolResult({ success: true, event: event ?? null, snapshot: snapshot ?? null });
        }

        return createJsonToolResult({ success: false, error: `Unknown action: ${input.action}` });
      } catch (error: any) {
        return createJsonToolResult({
          success: false,
          error: error?.message || 'conversationRouteTool failed'
        });
      }
    }
  };
}
