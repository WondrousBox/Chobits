/**
 * 执行循环
 *
 * Agent 的核心执行循环逻辑
 * 负责协调 LLM 调用和工具执行
 */

import type { LLMProvider } from '../interfaces/llm-provider';
import type { LoggerProvider } from '../interfaces/logger-provider';
import type { ToolProvider } from '../interfaces/tool-provider';
import type { AgentEvent, Message, RuntimeOptions, ToolCall, ToolResult } from '../types';
import { ErrorCategory } from '../types';

/**
 * 执行循环配置
 */
export interface ExecutionLoopConfig {
  /** LLM 提供者 */
  llm: LLMProvider;
  /** 工具提供者 */
  tools: ToolProvider;
  /** 日志提供者 */
  logger?: LoggerProvider;
  /** 运行时选项 */
  options: Required<RuntimeOptions>;
  /** 中止信号 */
  signal: AbortSignal;
}

/**
 * 执行循环状态
 */
interface LoopState {
  /** 当前迭代次数 */
  iteration: number;
  /** 对话消息历史 */
  messages: Message[];
  /** 是否完成 */
  completed: boolean;
  /** 累计文本 */
  accumulatedText: string;
}

/**
 * 执行循环
 *
 * @description
 * 实现 Agent 的核心执行循环：
 * 1. 调用 LLM 生成响应
 * 2. 处理文本输出或工具调用
 * 3. 执行工具并收集结果
 * 4. 将工具结果追加到消息历史
 * 5. 继续循环直到 LLM 不再调用工具
 *
 * @param config - 循环配置
 * @param initialMessages - 初始消息
 * @yields Agent 事件
 */
export async function* executionLoop(config: ExecutionLoopConfig, initialMessages: Message[]): AsyncGenerator<AgentEvent, void, undefined> {
  const { llm, tools, logger, options, signal } = config;

  const state: LoopState = {
    iteration: 0,
    messages: initialMessages,
    completed: false,
    accumulatedText: ''
  };

  logger?.debug('Starting execution loop', {
    maxIterations: options.maxIterations,
    messageCount: state.messages.length
  });

  while (state.iteration < options.maxIterations && !state.completed && !signal.aborted) {
    // 发射迭代开始元数据
    yield {
      type: 'metadata',
      data: { phase: 'iteration_start', iteration: state.iteration }
    };

    logger?.debug(`Iteration ${state.iteration} started`, {
      messageCount: state.messages.length
    });

    // 收集当前迭代的工具调用
    const pendingToolCalls: ToolCall[] = [];
    let hasToolCall = false;
    let iterationText = '';

    try {
      // 调用 LLM
      for await (const chunk of llm.stream({
        messages: state.messages,
        tools: tools.list(),
        temperature: options.temperature,
        maxTokens: options.maxTokens
      })) {
        // 检查中止
        if (signal.aborted) {
          logger?.info('Execution aborted');
          yield { type: 'done', success: false };
          return;
        }

        switch (chunk.type) {
          case 'text':
            iterationText += chunk.text;
            state.accumulatedText += chunk.text;
            yield { type: 'delta', text: chunk.text };
            break;

          case 'tool_call':
            hasToolCall = true;
            pendingToolCalls.push(chunk.call);
            yield { type: 'tool_call', call: chunk.call };
            logger?.info(`Tool call: ${chunk.call.name}`, { params: chunk.call.params });
            break;

          case 'done':
            yield {
              type: 'metadata',
              data: { phase: 'llm_done', usage: chunk.usage, iteration: state.iteration }
            };
            break;
        }
      }

      // 执行所有工具调用
      if (pendingToolCalls.length > 0) {
        // 先添加助手消息（包含工具调用）
        state.messages.push({
          role: 'assistant',
          content: iterationText,
          toolCalls: pendingToolCalls
        });

        // 执行每个工具并收集结果
        for (const toolCall of pendingToolCalls) {
          const result = await executeToolWithRetry(tools, toolCall, logger);
          yield { type: 'tool_result', result, callId: toolCall.id };

          // 添加工具结果到消息历史
          state.messages.push({
            role: 'tool',
            content: JSON.stringify(result),
            toolCallId: toolCall.id,
            name: toolCall.name
          });
        }
      }

      // 如果没有工具调用，说明任务完成
      if (!hasToolCall) {
        if (iterationText) {
          state.messages.push({
            role: 'assistant',
            content: iterationText
          });
        }
        state.completed = true;
        logger?.info('No tool calls, execution completed');
      }
    } catch (error) {
      logger?.error('Error in execution loop', { error });
      yield {
        type: 'error',
        error: {
          category: ErrorCategory.LLM_ERROR,
          message: error instanceof Error ? error.message : String(error),
          recoverable: false,
          cause: error instanceof Error ? error : undefined
        }
      };
      yield { type: 'done', success: false };
      return;
    }

    state.iteration++;
  }

  // 检查是否达到最大迭代次数
  if (state.iteration >= options.maxIterations && !state.completed) {
    logger?.warn('Max iterations reached', { maxIterations: options.maxIterations });
    yield {
      type: 'metadata',
      data: { phase: 'max_iterations_reached', iteration: state.iteration }
    };
  }

  yield { type: 'done', success: state.completed };
}

/**
 * 带重试的工具执行
 */
async function executeToolWithRetry(tools: ToolProvider, toolCall: ToolCall, logger?: LoggerProvider, maxRetries: number = 1): Promise<ToolResult> {
  let lastError: string | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // 可选：验证参数
      if (tools.validate) {
        const validation = tools.validate(toolCall.name, toolCall.params);
        if (!validation.valid) {
          return {
            success: false,
            error: `Parameter validation failed: ${validation.error}`
          };
        }
      }

      // 执行工具
      const result = await tools.execute(toolCall.name, toolCall.params);
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      logger?.warn(`Tool execution failed (attempt ${attempt + 1}/${maxRetries + 1})`, {
        tool: toolCall.name,
        error: lastError
      });

      if (attempt < maxRetries) {
        // 指数退避
        await sleep(Math.pow(2, attempt) * 100);
      }
    }
  }

  return {
    success: false,
    error: lastError || 'Unknown error during tool execution'
  };
}

/**
 * 休眠函数
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
