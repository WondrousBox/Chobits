/**
 * 翻译工具上下文管理器
 *
 * 提供一个全局的方式来管理翻译工具所需的依赖
 * 这样工具在执行时可以访问到 chatFn 和 emit 等必要的函数
 */

import type { Agent } from '@mastra/core/agent';
import { BrowserWindow } from 'electron';

import { TranslationService } from '../services/translation-service';

/**
 * 聊天函数类型
 */
export type ChatFn = (prompt: string, onEvent: (event: any) => void, abortSignal?: AbortSignal) => Promise<void>;

/**
 * 事件发送函数类型
 */
export type EmitFn = (event: { type: string; data?: any }) => void;

/**
 * 翻译工具执行上下文
 */
export interface TranslationToolExecutionContext {
  /** Chat 函数 - 用于调用 AI */
  chatFn: ChatFn;
  /** 事件发送函数 - 用于发送翻译进度 */
  emit: EmitFn;
  /** 请求 ID - 用于追踪 */
  requestId: string;
  /** 任务标签 */
  taskLabel?: string;
}

/**
 * 翻译工具上下文管理器
 */
class TranslationToolContextManager {
  private currentContext: TranslationToolExecutionContext | null = null;

  /**
   * 设置当前执行上下文
   */
  setContext(context: TranslationToolExecutionContext): void {
    this.currentContext = context;
  }

  /**
   * 获取当前执行上下文
   */
  getContext(): TranslationToolExecutionContext | null {
    return this.currentContext;
  }

  /**
   * 清除上下文
   */
  clearContext(): void {
    this.currentContext = null;
  }

  /**
   * 创建一个标准的 chatFn（使用 Agent）
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
        onEvent({ type: 'error', data: { message: error?.message || 'AI 调用失败' } });
      }
    };
  }

  /**
   * 创建一个标准的 emit 函数（发送到所有窗口）
   */
  createEmitFn(requestId: string, eventType: 'translation' | 'summary' = 'translation'): EmitFn {
    return (event: { type: string; data?: any }): void => {
      const messageType = eventType === 'translation' ? 'subtitle:translate' : 'summary';

      BrowserWindow.getAllWindows().forEach((w) => {
        if (!w.isDestroyed()) {
          try {
            w.webContents.send('renderer-message', {
              type: messageType,
              data: { requestId, ...event }
            });
          } catch (error) {
            console.error('发送消息失败:', error);
          }
        }
      });
    };
  }

  /**
   * 在上下文中执行函数
   * 自动设置和清理上下文
   */
  async withContext<T>(context: TranslationToolExecutionContext, fn: () => Promise<T>): Promise<T> {
    this.setContext(context);
    try {
      return await fn();
    } finally {
      this.clearContext();
    }
  }
}

/**
 * 全局单例实例
 */
export const translationToolContext = new TranslationToolContextManager();

/**
 * 便捷函数：获取当前上下文中的 TranslationService 调用所需的参数
 */
export function getTranslationServiceParams(additionalParams: {
  segments: any[];
  targetLanguage: string;
  sourceLanguage?: string;
  languageNames?: Record<string, string>;
  metadata?: Record<string, any>;
  options?: any;
}): Parameters<typeof TranslationService.translateSubtitles>[0] | null {
  const ctx = translationToolContext.getContext();
  if (!ctx) {
    console.warn('[TranslationToolContext] No context available');
    return null;
  }

  return {
    requestId: ctx.requestId,
    chatFn: ctx.chatFn,
    taskLabel: ctx.taskLabel || 'translation',
    ...additionalParams
  };
}
