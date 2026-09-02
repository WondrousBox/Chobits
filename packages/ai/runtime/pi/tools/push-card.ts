import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import type { ChatCardType } from '../../../types';
import { resolveGuardedToolExecution } from '../skills';
import type { PiSessionToolContext } from '../tool-context';
import { createJsonToolResult } from './result';

const pushCardParameters = Type.Object({
  type: Type.Union([Type.Literal('resource'), Type.Literal('video'), Type.Literal('audio'), Type.Literal('image'), Type.Literal('document'), Type.Literal('link'), Type.Literal('file')]),
  resourceId: Type.Optional(Type.String({ description: 'Resource ID from the database.' })),
  data: Type.Optional(
    Type.Object({
      id: Type.String({ description: 'Stable identifier for the temporary card.' }),
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
  text: Type.Optional(Type.String({ description: 'Optional text shown above the card.' }))
});

export function createPiPushCardTool(toolContext: PiSessionToolContext): ToolDefinition<typeof pushCardParameters> {
  return {
    name: 'pushCardTool',
    label: 'pushCardTool',
    description: 'Push a resource card into the chat UI after the target resource has been identified.',
    parameters: pushCardParameters,
    async execute(toolCallId, input) {
      const { data, resourceId, text, type } = input;

      if (!resourceId && !data) {
        return createJsonToolResult({
          success: false,
          error: 'Either resourceId or data must be provided.'
        });
      }

      const cardId = resourceId || data?.id;
      if (!cardId) {
        return createJsonToolResult({
          success: false,
          error: 'Either resourceId or data.id must be provided.'
        });
      }

      try {
        const guardResolution = await resolveGuardedToolExecution(toolContext, toolCallId, 'push-card');
        if (guardResolution?.kind === 'blocked' || guardResolution?.kind === 'cancel') {
          return createJsonToolResult(guardResolution.details);
        }

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

        return createJsonToolResult({
          success: true,
          cardId,
          conversationId: toolContext.conversationId,
          ...(guardResolution?.warning ? { warning: guardResolution.warning } : {})
        });
      } catch (error: any) {
        return createJsonToolResult({
          success: false,
          error: error?.message || 'Failed to push chat card.'
        });
      }
    }
  };
}
