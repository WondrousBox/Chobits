/**
 * Default Agent Runtime
 *
 * Agent 运行时的默认实现
 * 核心执行引擎，协调 LLM 和工具执行
 */

import type { AgentRuntime, RuntimeContext } from '../interfaces/agent-runtime';
import type { AgentError, AgentEvent, AgentInput, Message, RuntimeOptions } from '../types';
import { ErrorCategory } from '../types';
import { executionLoop } from './execution-loop';

/**
 * 默认 Agent 运行时实现
 *
 * @description
 * 实现 Agent 的核心执行逻辑：
 * - 无状态核心：Agent 本身无状态，状态外置于 Context
 * - 依赖反转：通过 RuntimeContext 注入所有依赖
 * - 事件驱动：通过 AsyncIterable 暴露执行过程
 * - 可中止：支持通过 abort() 方法中止执行
 *
 * @example
 * ```typescript
 * const runtime = new DefaultAgentRuntime();
 *
 * const context: RuntimeContext = {
 *   sessionId: crypto.randomUUID(),
 *   llm: new VercelAIAdapter({ provider: 'openai', model: 'gpt-4o' }),
 *   tools: new RegistryToolProvider(),
 * };
 *
 * for await (const event of runtime.run({ messages }, context)) {
 *   if (event.type === 'delta') {
 *     process.stdout.write(event.text);
 *   }
 * }
 * ```
 */
export class DefaultAgentRuntime implements AgentRuntime {
  private abortController: AbortController | null = null;

  /**
   * 执行 Agent 任务
   *
   * @param input - 用户输入
   * @param context - 运行上下文
   * @returns 异步迭代器，发射执行事件
   */
  async *run(input: AgentInput, context: RuntimeContext): AsyncIterable<AgentEvent> {
    // 创建新的 AbortController
    this.abortController = new AbortController();
    const { signal } = this.abortController;

    const { sessionId, llm, tools, memory, logger, options: userOptions } = context;

    // 合并默认配置
    const options: Required<RuntimeOptions> = {
      maxIterations: userOptions?.maxIterations ?? 10,
      timeout: userOptions?.timeout ?? 60000,
      enableMemory: userOptions?.enableMemory ?? true,
      enableLogging: userOptions?.enableLogging ?? true,
      temperature: userOptions?.temperature ?? 0.7,
      maxTokens: userOptions?.maxTokens ?? 4096,
      maxHistoryMessages: userOptions?.maxHistoryMessages ?? 100
    };

    logger?.info('Agent run started', { sessionId, options });

    // 构建初始消息
    const messages: Message[] = [];

    // 添加系统提示词
    if (input.systemPrompt) {
      messages.push({ role: 'system', content: input.systemPrompt });
    }

    try {
      // 1. 从记忆加载上下文（可选）
      if (options.enableMemory && memory) {
        try {
          const memoryKey = `session:${sessionId}:context`;
          const memoryContext = await memory.get(memoryKey);

          if (memoryContext && typeof memoryContext === 'object') {
            yield {
              type: 'metadata',
              data: { phase: 'memory_loaded', context: memoryContext }
            };
            logger?.debug('Memory context loaded', { key: memoryKey });

            const memoryMessages = this.extractMemoryMessages(memoryContext, input.systemPrompt);
            if (memoryMessages.length > 0) {
              messages.push(...memoryMessages);
              logger?.debug('Memory messages merged', { count: memoryMessages.length });
            }
          }
        } catch (error) {
          logger?.warn('Failed to load memory context', { error });
        }
      }

      // 添加用户消息
      messages.push(...input.messages);

      // 3. 应用历史消息裁剪
      this.trimHistory(messages, options.maxHistoryMessages);

      // 4. 设置超时
      let timeoutId: NodeJS.Timeout | undefined;
      if (options.timeout > 0) {
        timeoutId = setTimeout(() => {
          this.abort();
        }, options.timeout);
      }

      try {
        // 5. 执行主循环
        yield* executionLoop(
          {
            llm,
            tools,
            logger,
            options,
            signal
          },
          messages
        );
      } finally {
        // 清除超时
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }

      // 6. 保存到记忆（可选）
      if (options.enableMemory && memory) {
        try {
          const memoryKey = `session:${sessionId}:context`;
          this.trimHistory(messages, options.maxHistoryMessages);
          await memory.set(
            memoryKey,
            {
              messages,
              timestamp: Date.now()
            },
            { persist: false, ttl: 3600 }
          );
          logger?.debug('Memory context saved', { key: memoryKey });
        } catch (error) {
          logger?.warn('Failed to save memory context', { error });
        }
      }
    } catch (error) {
      // 处理顶层错误
      const agentError = this.normalizeError(error);
      logger?.error('Agent run failed', { error: agentError });

      yield { type: 'error', error: agentError };
      yield { type: 'done', success: false };
    } finally {
      this.abortController = null;
      logger?.info('Agent run completed', { sessionId });
    }
  }

  /**
   * 中止执行
   */
  abort(): void {
    this.abortController?.abort();
  }

  /**
   * 标准化错误
   */
  private normalizeError(error: unknown): AgentError {
    if (this.isAgentError(error)) {
      return error;
    }

    if (error instanceof Error) {
      // 检查是否是中止错误
      if (error.name === 'AbortError') {
        return {
          category: 'abort_error' as ErrorCategory,
          message: 'Execution was aborted',
          recoverable: false,
          cause: error
        };
      }

      // 检查是否是超时错误
      if (error.message.includes('timeout') || error.message.includes('Timeout')) {
        return {
          category: 'timeout_error' as ErrorCategory,
          message: error.message,
          recoverable: true,
          suggestion: 'Try again with a longer timeout',
          cause: error
        };
      }

      // 默认为未知错误
      return {
        category: 'unknown_error' as ErrorCategory,
        message: error.message,
        recoverable: false,
        cause: error
      };
    }

    return {
      category: 'unknown_error' as ErrorCategory,
      message: String(error),
      recoverable: false
    };
  }

  /**
   * 类型守卫：检查是否是 AgentError
   */
  private isAgentError(error: unknown): error is AgentError {
    return typeof error === 'object' && error !== null && 'category' in error && 'message' in error && 'recoverable' in error;
  }

  /**
   * 从记忆上下文中提取消息
   */
  private extractMemoryMessages(memoryContext: unknown, systemPrompt?: string): Message[] {
    if (!memoryContext || typeof memoryContext !== 'object') {
      return [];
    }

    const maybeMessages = (memoryContext as { messages?: unknown }).messages;
    if (!Array.isArray(maybeMessages)) {
      return [];
    }

    const messages = maybeMessages.filter((item): item is Message => this.isMessage(item));

    if (systemPrompt) {
      return messages.filter((message) => message.role !== 'system');
    }

    return messages;
  }

  /**
   * 类型守卫：检查是否是 Message
   */
  private isMessage(value: unknown): value is Message {
    return (
      typeof value === 'object' &&
      value !== null &&
      'role' in value &&
      'content' in value &&
      typeof (value as { role?: unknown }).role === 'string' &&
      typeof (value as { content?: unknown }).content === 'string'
    );
  }

  /**
   * 裁剪历史消息
   */
  private trimHistory(messages: Message[], maxHistoryMessages?: number): void {
    if (!maxHistoryMessages || maxHistoryMessages <= 0) {
      return;
    }

    const hasSystem = messages[0]?.role === 'system';
    const systemMessage = hasSystem ? messages[0] : undefined;
    const history = hasSystem ? messages.slice(1) : messages;

    if (history.length <= maxHistoryMessages) {
      return;
    }

    const trimmed = history.slice(-maxHistoryMessages);
    messages.length = 0;
    if (systemMessage) {
      messages.push(systemMessage);
    }
    messages.push(...trimmed);
  }
}
