/**
 * Agent Runtime 接口
 *
 * 定义 Agent 运行时的标准接口
 */

import type { AgentEvent, AgentInput, RuntimeOptions } from '../types';
import type { LLMProvider } from './llm-provider';
import type { LoggerProvider } from './logger-provider';
import type { MemoryProvider } from './memory-provider';
import type { ToolProvider } from './tool-provider';

/**
 * 运行时上下文
 *
 * @description
 * 依赖注入容器，包含 Agent 运行所需的所有依赖。
 * 通过依赖反转原则，Agent 不直接依赖具体实现。
 */
export interface RuntimeContext {
  /** 会话 ID */
  sessionId: string;

  /** 用户 ID（可选） */
  userId?: string;

  /** LLM 提供者（必需） */
  llm: LLMProvider;

  /** 工具提供者（必需） */
  tools: ToolProvider;

  /** 记忆提供者（可选） */
  memory?: MemoryProvider;

  /** 日志提供者（可选） */
  logger?: LoggerProvider;

  /** 运行时配置 */
  options?: RuntimeOptions;
}

/**
 * Agent 运行时接口
 *
 * @description
 * 定义 Agent 执行的核心接口。
 * Agent 只做三件事：
 * 1. 接收用户输入
 * 2. 调用 LLM 决策（工具选择）
 * 3. 协调工具执行并返回结果
 *
 * @example
 * ```typescript
 * const runtime = new DefaultAgentRuntime();
 *
 * for await (const event of runtime.run(input, context)) {
 *   if (event.type === 'delta') {
 *     console.log(event.text);
 *   }
 * }
 * ```
 */
export interface AgentRuntime {
  /**
   * 执行 Agent 任务
   *
   * @param input - 用户输入
   * @param context - 运行上下文（依赖注入）
   * @returns 异步迭代器，发射执行事件
   *
   * @description
   * 执行流程：
   * 1. 检查记忆（可选）
   * 2. 调用 LLM 生成
   * 3. 处理 LLM 输出（文本/工具调用）
   * 4. 工具结果追加到上下文
   * 5. 循环直到完成
   * 6. 保存记忆（可选）
   */
  run(input: AgentInput, context: RuntimeContext): AsyncIterable<AgentEvent>;

  /**
   * 中止执行
   *
   * @description
   * 中止当前正在执行的任务。
   * 调用后，run() 方法会在合适的时机终止。
   */
  abort(): void;
}
