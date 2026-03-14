import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import type { ChatCardType } from '../../../types';
import type { PiSessionToolContext } from '../tool-context';
import { createJsonToolResult } from './result';

const pushCardParameters = Type.Object({
  type: Type.Union([Type.Literal('resource'), Type.Literal('video'), Type.Literal('audio'), Type.Literal('image'), Type.Literal('document'), Type.Literal('link'), Type.Literal('file')]),
  resourceId: Type.Optional(Type.String({ description: '数据库中的资源 ID' })),
  data: Type.Optional(
    Type.Object({
      id: Type.String({ description: '临时卡片的唯一标识' }),
      title: Type.Optional(Type.String()),
      description: Type.Optional(Type.String()),
      thumbnailPath: Type.Optional(Type.String()),
      filePath: Type.Optional(Type.String()),
      url: Type.Optional(Type.String()),
      sizeBytes: Type.Optional(Type.Number()),
      durationMs: Type.Optional(Type.Number()),
      domain: Type.Optional(Type.String())
    })
  ),
  text: Type.Optional(Type.String({ description: '显示在卡片上方的说明文本' }))
});

export function createPiPushCardTool(toolContext: PiSessionToolContext): ToolDefinition<typeof pushCardParameters> {
  return {
    name: 'pushCardTool',
    label: 'pushCardTool',
    description: `在聊天里推送资源卡片。适合在你已经找到目标资源之后，把资源直接展示给用户点击查看。`,
    parameters: pushCardParameters,
    async execute(_toolCallId, input) {
      const { data, resourceId, text, type } = input;

      if (!resourceId && !data) {
        return createJsonToolResult({
          success: false,
          error: '必须提供 resourceId 或 data'
        });
      }

      const cardId = resourceId || data?.id;
      if (!cardId) {
        return createJsonToolResult({
          success: false,
          error: '必须提供 resourceId 或 data.id'
        });
      }

      try {
        toolContext.pushCardToWindows(
          {
            conversationId: toolContext.conversationId,
            data,
            resourceId,
            text,
            type: type as ChatCardType
          },
          toolContext.targetWindowId
        );

        let persisted = false;
        let warning: string | undefined;

        if (toolContext.conversationId) {
          try {
            const cardToken = `[card:${type}:${cardId}]`;
            const messageContent = text ? `${text}\n\n${cardToken}` : cardToken;

            await toolContext.chatRepo.addMessage(toolContext.conversationId, {
              role: 'assistant',
              content: messageContent,
              createdAt: Date.now(),
              metadata: JSON.stringify({
                card: {
                  data,
                  resourceId,
                  type
                }
              })
            });

            persisted = true;
          } catch (error: any) {
            warning = error?.message || '卡片已推送，但写入会话历史失败';
            console.warn('[pi:pushCardTool] failed to persist card message:', error);
          }
        }

        return createJsonToolResult({
          success: true,
          cardId,
          conversationId: toolContext.conversationId,
          persisted,
          warning
        });
      } catch (error: any) {
        return createJsonToolResult({
          success: false,
          error: error?.message || '推送卡片失败'
        });
      }
    }
  };
}
