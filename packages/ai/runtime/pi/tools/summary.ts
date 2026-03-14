import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import { executeSummarize } from '../../../ipc-handler-helpers';
import { createPiTaskChatRuntime } from '../task-chat';
import type { PiSessionToolContext } from '../tool-context';
import { createJsonToolResult } from './result';

const summaryParameters = Type.Object({
  content: Type.Optional(Type.Any({ description: '待总结内容，可为字符串或字幕片段数组' })),
  resourceId: Type.Optional(Type.String({ description: '资源 ID；未传 content 时将尝试从资源中加载' })),
  targetLanguage: Type.String({ description: '目标语言编码，例如 zh-CN、en' }),
  languageNames: Type.Optional(Type.Record(Type.String(), Type.String(), { description: '语言编码到展示名称的映射' })),
  options: Type.Optional(
    Type.Object({
      extractKeyPoints: Type.Optional(Type.Boolean()),
      extractTimeline: Type.Optional(Type.Boolean()),
      keywordCount: Type.Optional(Type.Number()),
      maxChars: Type.Optional(Type.Number()),
      promptTemplate: Type.Optional(Type.String())
    })
  )
});

export function createPiSummaryTool(toolContext: PiSessionToolContext): ToolDefinition<typeof summaryParameters> {
  return {
    name: 'summaryTool',
    label: 'summaryTool',
    description: '发起内容总结后台任务。适合对字幕或文本资源生成摘要、关键点和时间线。',
    parameters: summaryParameters,
    async execute(_toolCallId, input) {
      const { content, languageNames = {}, options, resourceId, targetLanguage } = input;

      try {
        const { chatFn, modelId } = await createPiTaskChatRuntime(toolContext.resolved);
        const task = await executeSummarize({
          chatFn,
          content: typeof content === 'string' ? content : undefined,
          languageNames,
          metadata: resourceId
            ? {
                resourceId
              }
            : undefined,
          model: modelId,
          options,
          providerId: toolContext.resolved.model.providerId,
          resourceId,
          segments: Array.isArray(content) ? content : undefined,
          targetLanguage
        });

        return createJsonToolResult({
          success: true,
          message: '总结任务已启动，正在后台处理中。',
          requestId: task.requestId,
          eventsChannel: task.eventsChannel
        });
      } catch (error: any) {
        return createJsonToolResult({
          success: false,
          error: error?.message || '启动总结任务失败'
        });
      }
    }
  };
}
