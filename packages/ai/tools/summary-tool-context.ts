/**
 * 总结工具执行上下文管理器
 *
 * 由于 Mastra 的 agent.stream() 不支持自定义 toolContext 参数，
 * 我们使用全局上下文管理器来提供动态的执行依赖。
 *
 * 生命周期：
 * 1. chat-service.ts 在 agent.stream() 前调用 setContext()
 * 2. summary-tool.ts 在 execute() 中调用 getContext()
 * 3. chat-service.ts 在 finally 块中调用 clearContext()
 */

import { Agent } from '@mastra/core/agent';
import { BrowserWindow } from 'electron';

import { SummarizePayload } from '../ipc-handler-helpers';

/**
 * Chat 函数类型
 * 用于执行实际的 AI 总结请求
 */
export type ChatFn = (prompt: string, onEvent: (event: any) => void, abortSignal?: AbortSignal) => Promise<void>;

/**
 * Emit 函数类型
 * 用于向渲染进程广播总结进度和结果事件
 */
export type EmitFn = (event: { type: string; data?: any }) => void;

/**
 * 总结工具执行上下文
 * 包含工具执行所需的所有动态依赖
 */
export interface SummaryToolExecutionContext {
  /** Chat 函数 - 使用 Agent 执行 AI 请求 */
  chatFn: ChatFn;
  /** Emit 函数 - 向渲染进程广播事件 */
  emit: EmitFn;
  /** 请求 ID - 用于追踪 */
  requestId: string;
  /** 任务标签 */
  taskLabel?: string;
  /** 模型提供商 ID */
  providerId: string;
  /** 模型名称 */
  model: string;
}

/**
 * 总结工具上下文管理器
 */
class SummaryToolContextManager {
  private currentContext: SummaryToolExecutionContext | null = null;

  /**
   * 设置当前执行上下文
   */
  setContext(context: SummaryToolExecutionContext): void {
    this.currentContext = context;
  }

  /**
   * 获取当前执行上下文
   */
  getContext(): SummaryToolExecutionContext | null {
    return this.currentContext;
  }

  /**
   * 清除当前上下文
   */
  clearContext(): void {
    this.currentContext = null;
  }

  /**
   * 创建 chatFn
   * 使用 Agent 的流式能力执行 AI 请求
   *
   * @param agent - Mastra Agent 实例
   * @returns chatFn 函数
   */
  createChatFn(agent: Agent): ChatFn {
    return async (prompt: string, onEvent: (event: any) => void, abortSignal?: AbortSignal): Promise<void> => {
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
        onEvent({ type: 'error', data: { message: error?.message || '总结失败' } });
      }
    };
  }

  /**
   * 创建 emit 函数
   * 向所有 BrowserWindow 广播事件
   *
   * @param requestId - 请求 ID
   * @param eventType - 事件类型（'summary' 或 'translation'）
   * @returns emit 函数
   */
  createEmitFn(requestId: string, eventType: 'summary' | 'translation' = 'summary'): EmitFn {
    return (event: { type: string; data?: any }): void => {
      BrowserWindow.getAllWindows().forEach((w) => {
        if (!w.isDestroyed()) {
          try {
            w.webContents.send('renderer-message', {
              type: eventType,
              data: { requestId, ...event }
            });
          } catch (error) {
            console.error(`发送${eventType === 'summary' ? '总结' : '翻译'}消息失败:`, error);
          }
        }
      });
    };
  }

  /**
   * 使用上下文执行函数
   * 自动管理上下文的生命周期
   *
   * @param context - 执行上下文
   * @param fn - 要执行的函数
   * @returns 函数执行结果
   */
  async withContext<T>(context: SummaryToolExecutionContext, fn: () => Promise<T>): Promise<T> {
    this.setContext(context);
    try {
      return await fn();
    } finally {
      this.clearContext();
    }
  }
}

/**
 * 获取 SummaryService 所需的参数
 * 辅助函数，用于构建 executeSummarize 的参数
 *
 * @param params - 输入参数
 * @returns SummarizePayload 参数对象
 */
export function getSummaryServiceParams(params: {
  content: string | any[];
  targetLanguage: string;
  languageNames?: Record<string, string>;
  resourceId?: string;
  options?: {
    maxChars?: number;
    extractKeyPoints?: boolean;
    extractTimeline?: boolean;
    keywordCount?: number;
    promptTemplate?: string;
  };
}): SummarizePayload | null {
  const ctx = summaryToolContext.getContext();
  if (!ctx) {
    console.warn('[SummaryToolContext] No context available');
    return null;
  }

  return {
    providerId: ctx.providerId,
    model: ctx.model,
    content: typeof params.content === 'string' ? params.content : undefined,
    segments: Array.isArray(params.content) ? params.content : undefined,
    resourceId: params.resourceId,
    targetLanguage: params.targetLanguage,
    languageNames: params.languageNames || {},
    options: params.options
  };
}

/**
 * 全局上下文管理器实例
 * 在 chat-service.ts 中设置，在 summary-tool.ts 中读取
 */
export const summaryToolContext = new SummaryToolContextManager();
