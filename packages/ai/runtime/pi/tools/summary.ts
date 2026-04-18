import type { ToolDefinition } from '@mariozechner/pi-coding-agent';
import { Type } from '@sinclair/typebox';

import { startSummarizeTask } from '../../../ipc-handler-helpers';
import { createPiTaskChatRuntime } from '../task-chat';
import type { PiSessionToolContext } from '../tool-context';
import { waitForLongTaskOrBackground } from './long-task-control';
import { createJsonToolResult } from './result';

const summaryParameters = Type.Object({
  content: Type.Optional(Type.Any({ description: '待总结内容，可为字符串或字幕片段数组' })),
  resourceId: Type.Optional(Type.String({ description: '资源 ID；未传 content 时会尝试从资源中加载' })),
  targetLanguage: Type.String({ description: '目标语言代码，例如 zh-CN、en' }),
  languageNames: Type.Optional(Type.Record(Type.String(), Type.String(), { description: '语言代码到显示名称的映射' })),
  waitForCompletion: Type.Optional(
    Type.Boolean({
      description: 'Defaults to true. False starts the summary task in background mode and returns immediately.'
    })
  ),
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
    description: '总结内容。默认会等待完成并流式展示进度，也支持立即转为后台执行。',
    parameters: summaryParameters,
    async execute(toolCallId, input) {
      const { content, languageNames = {}, options, resourceId, targetLanguage, waitForCompletion } = input;
      const shouldWait = waitForCompletion !== false;

      try {
        const { chatFn, modelId } = await createPiTaskChatRuntime(toolContext.resolved);
        const task = await startSummarizeTask(
          {
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
          },
          shouldWait
            ? {
                onEvent: (event) => {
                  if (event.type !== 'progress') return;
                  toolContext.reportProgress?.(toolCallId, event.data?.percentage ?? 0, event.data?.message);
                }
              }
            : undefined
        );

        if (!shouldWait) {
          return createJsonToolResult({
            success: true,
            executionMode: 'background',
            message: '总结任务已启动，正在后台处理中。',
            requestId: task.requestId,
            eventsChannel: task.eventsChannel
          });
        }

        const waitOutcome = await waitForLongTaskOrBackground({
          toolCallId,
          toolContext,
          taskLabel: '内容总结',
          taskPromise: task.completionPromise,
          prompt: '内容总结正在执行中。AI 会继续等待结果，并在完成后继续后续处理。',
          description: '如果你不想继续等待，可以把总结切到后台执行。'
        });

        if (waitOutcome.mode === 'background') {
          void task.completionPromise.catch((error) => {
            console.warn('[summaryTool] Background summary task failed:', error);
          });
          return createJsonToolResult({
            success: true,
            backgrounded: true,
            executionMode: 'background',
            message: '总结任务已切到后台继续执行。',
            requestId: task.requestId,
            eventsChannel: task.eventsChannel
          });
        }

        return createJsonToolResult({
          success: true,
          executionMode: 'completed',
          message: '总结已完成。',
          requestId: task.requestId,
          eventsChannel: task.eventsChannel,
          output: waitOutcome.result
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
