import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import { executeSubtitleTranslation } from '../../../ipc-handler-helpers';
import { createPiTaskChatRuntime } from '../task-chat';
import type { PiSessionToolContext } from '../tool-context';
import { createJsonToolResult } from './result';

const translationParameters = Type.Object({
  resourceId: Type.String({ description: '字幕资源 ID' }),
  targetLanguage: Type.String({ description: '目标语言编码，例如 zh-CN、en、ja' }),
  sourceLanguage: Type.Optional(Type.String({ description: '源语言编码，可选' })),
  languageNames: Type.Optional(Type.Record(Type.String(), Type.String(), { description: '语言编码到展示名称的映射' })),
  options: Type.Optional(
    Type.Object({
      maxConcurrency: Type.Optional(Type.Number()),
      chunkSize: Type.Optional(Type.Number()),
      maxRetries: Type.Optional(Type.Number()),
      generateSummary: Type.Optional(Type.Boolean()),
      glossary: Type.Optional(Type.Any()),
      promptTemplate: Type.Optional(Type.String())
    })
  )
});

export function createPiTranslationTool(toolContext: PiSessionToolContext): ToolDefinition<typeof translationParameters> {
  return {
    name: 'translationTool',
    label: 'translationTool',
    description: '发起字幕翻译后台任务。适合已经定位到字幕资源后，直接开始翻译并把结果持续写回资源项目文件。',
    parameters: translationParameters,
    async execute(_toolCallId, input) {
      const { languageNames = {}, options, resourceId, sourceLanguage, targetLanguage } = input;

      try {
        const { chatFn, modelId } = await createPiTaskChatRuntime(toolContext.resolved);
        const task = await executeSubtitleTranslation({
          chatFn,
          languageNames,
          metadata: {
            resourceId
          },
          model: modelId,
          options,
          providerId: toolContext.resolved.model.providerId,
          resourceId,
          sourceLanguage,
          targetLanguage
        });

        return createJsonToolResult({
          success: true,
          message: '翻译任务已启动，正在后台处理中。',
          requestId: task.requestId,
          eventsChannel: task.eventsChannel
        });
      } catch (error: any) {
        return createJsonToolResult({
          success: false,
          error: error?.message || '启动翻译任务失败'
        });
      }
    }
  };
}
