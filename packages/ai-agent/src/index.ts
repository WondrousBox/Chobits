/**
 * AI Agent Core
 *
 * 轻量级、高度解耦的 AI Agent 运行时引擎
 *
 * @description
 * 本模块提供了一个完整的 AI Agent 框架，包括：
 * - 核心运行时（AgentRuntime）
 * - 依赖注入接口（LLMProvider、ToolProvider、MemoryProvider）
 * - 工具系统（Tool、RegistryToolProvider）
 * - 记忆系统（SimpleMemoryProvider）
 * - 错误处理（AgentError、ErrorRecovery）
 * - LLM 适配器（VercelAIAdapter、OpenAIAdapter、AnthropicAdapter）
 *
 * @example
 * ```typescript
 * import {
 *   DefaultAgentRuntime,
 *   RegistryToolProvider,
 *   OpenAIAdapter
 * } from '@packages/ai-agent';
 *
 * // 1. 创建工具提供者
 * const tools = new RegistryToolProvider();
 *
 * // 2. 创建 LLM 适配器
 * const llm = new OpenAIAdapter({
 *   apiKey: process.env.OPENAI_API_KEY!,
 *   model: 'gpt-4o'
 * });
 *
 * // 3. 创建运行时
 * const runtime = new DefaultAgentRuntime();
 *
 * // 4. 执行 Agent
 * for await (const event of runtime.run(
 *   { messages: [{ role: 'user', content: '现在几点？' }] },
 *   { sessionId: crypto.randomUUID(), llm, tools }
 * )) {
 *   if (event.type === 'delta') {
 *     process.stdout.write(event.text);
 *   }
 * }
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// 类型导出
// ============================================================================

export * from './types';

// ============================================================================
// 接口导出
// ============================================================================

export * from './interfaces';

// ============================================================================
// 运行时导出
// ============================================================================

export { DefaultAgentRuntime } from './runtime/agent-runtime';
export type { AgentEventMap } from './runtime/event-emitter';
export { createAgentEventEmitter, TypedEventEmitter } from './runtime/event-emitter';
export type { ExecutionLoopConfig } from './runtime/execution-loop';
export { executionLoop } from './runtime/execution-loop';

// ============================================================================
// 工具导出
// ============================================================================

export { BuiltinTools, JsonTool, RandomTool, StringTool } from './tools/builtin-tools';
export { RegistryToolProvider } from './tools/registry-tool-provider';
export { createSchemaValidator, validateSchema } from './tools/schema-validator';
export type { Tool, ToolBuilderOptions } from './tools/tool';
export { createTool, toToolDefinition } from './tools/tool';

// ============================================================================
// 记忆导出
// ============================================================================

export { InMemoryKVStore, SimpleMemoryProvider } from './memory/simple-memory-provider';

// ============================================================================
// 适配器导出
// ============================================================================

export type { AnthropicAdapterConfig } from './adapters/llm/anthropic-adapter';
export { AnthropicAdapter } from './adapters/llm/anthropic-adapter';
export type { OpenAIAdapterConfig } from './adapters/llm/openai-adapter';
export { OpenAIAdapter } from './adapters/llm/openai-adapter';
export type { VercelAIConfig } from './adapters/llm/vercel-ai-adapter';
export { VercelAIAdapter } from './adapters/llm/vercel-ai-adapter';

// ============================================================================
// 错误处理导出
// ============================================================================

export { AgentError, getErrorMessage, isAgentError } from './errors/agent-error';
export type { RecoveryContext, RetryOptions } from './errors/recovery';
export { createRetryCondition, ErrorRecovery, getRecoveryStrategy, isRetryable, withRetry } from './errors/recovery';

// ============================================================================
// 工具函数导出
// ============================================================================

export type { ConsoleLoggerConfig } from './utils/console-logger';
export { ConsoleLogger, LogLevel, NoopLogger } from './utils/console-logger';
export { debounce, deepMerge, generateId, retry, safeJsonParse, safeJsonStringify, sleep, throttle, truncate, withTimeout } from './utils/helpers';
