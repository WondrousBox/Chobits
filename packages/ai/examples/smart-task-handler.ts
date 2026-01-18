/**
 * 智能任务 Agent 示例
 *
 * 展示如何创建一个能够自动判断任务类型并调用相应工具的智能 Agent
 */

import { Agent } from '@mastra/core/agent';
import { randomUUID } from 'crypto';
import { ipcMain } from 'electron';

import { getAgent } from '../agents';
import { createModel } from '../models/index';
import { getAllSecrets, getFirstApiKey } from '../settings-store';
import { SummaryService } from '../summary-service';
import { TranslationService } from '../translation-service';

// 注意：这是一个可选的实现示例
// 当前项目推荐直接在 ipc-main.ts 中调用服务，而不是使用这种方式

/**
 * 创建智能任务处理器
 *
 * 这个示例展示了如果需要让 Agent 自主判断任务类型时如何实现
 */
export function registerSmartTaskHandler() {
  ipcMain.handle(
    'ai:smartTask',
    async (
      _e,
      payload: {
        providerId: string;
        model: string;
        userMessage: string;
        context?: {
          segments?: any[];
          content?: string;
          resourceId?: string;
          [key: string]: any;
        };
      }
    ) => {
      const { providerId, model, userMessage, context = {} } = payload;
      const requestId = randomUUID();

      // 1. 准备 Agent 和模型
      const chatService = new (await import('../chat-service')).ChatService();
      const providerConfig = chatService.getProviderConfig(providerId);

      if (!providerConfig) {
        throw new Error(`Provider ${providerId} not found`);
      }

      const fields = providerConfig.fields as Array<{ key: string; required?: boolean }>;
      const keys = fields.map((f: any) => f.key);
      const secrets = await getAllSecrets(providerId, keys);
      const apiKey = getFirstApiKey(secrets.apiKey);

      if (!apiKey && fields.some((f: any) => f.key === 'apiKey' && f.required)) {
        throw new Error(`Provider ${providerId} 未配置 API Key`);
      }

      const modelConfig = {
        apiKey: apiKey || '',
        baseUrl: secrets.baseUrl as string,
        model: model || providerConfig.defaultModel
      };
      const modelInstance = createModel(providerId, modelConfig);

      const agent = getAgent('assistant');
      if (!agent) {
        throw new Error('Agent not found');
      }
      agent.model = modelInstance;

      // 2. 准备 chatFn（用于工具内部调用）
      const chatFn = async (prompt: string, onEvent: (event: any) => void, abortSignal?: AbortSignal): Promise<void> => {
        try {
          const stream = await agent.stream(prompt, {
            maxSteps: 10,
            abortSignal
          });

          for await (const chunk of stream.textStream) {
            if (abortSignal?.aborted) break;
            onEvent({ type: 'delta', data: { text: chunk } });
          }

          onEvent({ type: 'message_completed' });
        } catch (error: any) {
          onEvent({ type: 'error', data: { message: error?.message } });
        }
      };

      // 3. 构建完整的用户消息（包含上下文信息）
      let fullMessage = userMessage;

      if (context.segments) {
        fullMessage += `\n\n可用的字幕片段数量：${context.segments.length}`;
      }

      if (context.content) {
        fullMessage += `\n\n可用的文本内容（前200字）：${context.content.slice(0, 200)}...`;
      }

      // 4. 调用 Agent，让它自主决定使用哪个工具
      // 注意：这里需要使用支持 toolContext 的方式
      // 由于 Mastra Agent 的 stream 方法可能不直接支持 toolContext
      // 我们需要一个更高级的调用方式

      // 方案 A：使用消息上下文引导 Agent
      const guidedMessage = `${fullMessage}

注意：
- 如果用户需要翻译，请说明需要翻译的内容和目标语言
- 如果用户需要总结，请说明需要总结的内容
- 如果用户只是提问，请直接回答`;

      // 调用 Agent 进行推理
      const stream = await agent.stream(guidedMessage, {
        maxSteps: 10
      });

      let fullResponse = '';
      for await (const chunk of stream.textStream) {
        fullResponse += chunk;
      }

      // 5. 根据 Agent 的回复判断是否需要执行工具
      // 这里可以实现更复杂的逻辑，比如解析 Agent 的输出来决定调用哪个服务

      const needsTranslation = fullResponse.toLowerCase().includes('翻译') && context.segments;
      const needsSummary = fullResponse.toLowerCase().includes('总结') && (context.content || context.segments);

      let finalResult = fullResponse;

      // 6. 执行相应的服务（如果需要）
      if (needsTranslation && context.segments) {
        const emit = (event: any) => {
          // 可以发送进度事件到渲染进程
          console.log('Translation event:', event);
        };

        const translatedSegments = await TranslationService.translateSubtitles(
          {
            requestId: `${requestId}-translation`,
            chatFn,
            taskLabel: `${providerId}/${model}`,
            segments: context.segments,
            targetLanguage: 'zh-CN', // 可以从用户消息中提取
            options: {}
          },
          emit
        );

        finalResult += `\n\n翻译完成，共 ${translatedSegments.length} 个片段。`;
      }

      if (needsSummary && (context.content || context.segments)) {
        const emit = (event: any) => {
          console.log('Summary event:', event);
        };

        const contentToSummarize = context.content || context.segments;

        await SummaryService.summarize(emit, {
          requestId: `${requestId}-summary`,
          chatFn,
          taskLabel: `${providerId}/${model}`,
          content: contentToSummarize,
          targetLanguage: 'zh-CN',
          options: {}
        });

        finalResult += `\n\n总结生成完成。`;
      }

      return {
        requestId,
        response: finalResult,
        executedTranslation: needsTranslation,
        executedSummary: needsSummary
      };
    }
  );
}

/**
 * 使用说明
 *
 * 在 ipc-main.ts 中调用：
 *
 * ```typescript
 * import { registerSmartTaskHandler } from './examples/smart-task-handler';
 *
 * export function registerAI() {
 *   // ... 其他注册
 *
 *   // 注册智能任务处理器（可选）
 *   registerSmartTaskHandler();
 * }
 * ```
 *
 * 渲染进程调用：
 *
 * ```typescript
 * // 场景 1：用户明确说要翻译
 * const result = await window.api.ai.smartTask({
 *   providerId: 'openai',
 *   model: 'gpt-4',
 *   userMessage: '请帮我把这些字幕翻译成中文',
 *   context: {
 *     segments: [...],
 *     resourceId: 'res-123'
 *   }
 * });
 *
 * // 场景 2：用户问了一个问题，Agent 判断需要总结
 * const result = await window.api.ai.smartTask({
 *   providerId: 'openai',
 *   model: 'gpt-4',
 *   userMessage: '这个视频主要讲了什么？',
 *   context: {
 *     content: '视频的完整文本...',
 *     resourceId: 'res-456'
 *   }
 * });
 *
 * // 场景 3：用户只是问个问题
 * const result = await window.api.ai.smartTask({
 *   providerId: 'openai',
 *   model: 'gpt-4',
 *   userMessage: '今天天气怎么样？',
 *   context: {}
 * });
 * ```
 */

/**
 * 与直接调用的对比
 *
 * 直接调用方式（推荐用于明确的任务）：
 * ```typescript
 * // 用户明确要翻译
 * await window.api.ai.translate({
 *   providerId: 'openai',
 *   model: 'gpt-4',
 *   segments: [...],
 *   targetLanguage: 'zh-CN'
 * });
 * ```
 *
 * 智能任务方式（适合对话式交互）：
 * ```typescript
 * // 用户说："帮我处理这个字幕"，Agent 自动判断需要翻译
 * await window.api.ai.smartTask({
 *   providerId: 'openai',
 *   model: 'gpt-4',
 *   userMessage: '帮我处理这个字幕',
 *   context: { segments: [...] }
 * });
 * ```
 */
