import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { startSubtitleTranslationTask } from '../../../ipc-handler-helpers';
import { createPiTaskChatRuntime } from '../task-chat';
import type { PiSessionToolContext } from '../tool-context';
import { waitForLongTaskOrBackground } from './long-task-control';
import { createJsonToolResult } from './result';

const translationParameters = Type.Object({
  resourceId: Type.String({ description: '字幕资源 ID' }),
  targetLanguage: Type.String({ description: '目标语言代码，例如 zh-CN、en、ja' }),
  sourceLanguage: Type.Optional(Type.String({ description: '源语言代码，可选' })),
  languageNames: Type.Optional(Type.Record(Type.String(), Type.String(), { description: '语言代码到显示名称的映射' })),
  waitForCompletion: Type.Optional(
    Type.Boolean({
      description: 'Defaults to true. False starts the translation in background mode and returns immediately.'
    })
  ),
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
    description: '翻译字幕。默认会等待完成并流式展示进度，也支持立即转为后台执行。',
    parameters: translationParameters,
    async execute(toolCallId, input) {
      const { languageNames = {}, options, resourceId, sourceLanguage, targetLanguage, waitForCompletion } = input;
      const shouldWait = waitForCompletion !== false;

      try {
        const { chatFn, modelId } = await createPiTaskChatRuntime(toolContext.resolved);
        const task = await startSubtitleTranslationTask(
          {
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
            message: '翻译任务已启动，正在后台处理中。',
            requestId: task.requestId,
            eventsChannel: task.eventsChannel
          });
        }

        const waitOutcome = await waitForLongTaskOrBackground({
          toolCallId,
          toolContext,
          taskLabel: '字幕翻译',
          taskPromise: task.completionPromise,
          prompt: '字幕翻译正在执行中。AI 会继续等待结果，并在完成后继续后续处理。',
          description: '如果你不想继续等待，可以把翻译切到后台执行。'
        });

        if (waitOutcome.mode === 'background') {
          void task.completionPromise.catch((error) => {
            console.warn('[translationTool] Background translation task failed:', error);
          });
          return createJsonToolResult({
            success: true,
            backgrounded: true,
            executionMode: 'background',
            message: '翻译任务已切到后台继续执行。',
            requestId: task.requestId,
            eventsChannel: task.eventsChannel
          });
        }

        return createJsonToolResult({
          success: true,
          executionMode: 'completed',
          message: '翻译已完成。',
          requestId: task.requestId,
          eventsChannel: task.eventsChannel,
          translatedSegmentCount: waitOutcome.result.segments.length,
          sampleTranslations: waitOutcome.result.translations.slice(0, 5),
          displayInfo: waitOutcome.result.displayInfo
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
