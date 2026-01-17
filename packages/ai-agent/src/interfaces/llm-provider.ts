/**
 * LLM Provider 接口
 *
 * 定义 LLM 服务提供者的标准接口
 * 所有 LLM 适配器必须实现此接口
 */

import type { LLMChunk, LLMRequest, LLMResponse } from '../types';

/**
 * LLM 提供者接口
 *
 * @description
 * 定义与 LLM 交互的标准接口。
 * 实现者需要将具体的 LLM API（如 OpenAI、Anthropic 等）
 * 转换为统一的接口格式。
 *
 * @example
 * ```typescript
 * class MyLLMProvider implements LLMProvider {
 *   async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
 *     // 实现流式生成
 *   }
 * }
 * ```
 */
export interface LLMProvider {
  /**
   * 流式生成响应
   *
   * @param request - LLM 请求参数
   * @returns 异步迭代器，产生 LLM 响应块
   *
   * @description
   * 这是推荐的生成方式，支持：
   * - 流式文本输出（type: 'text'）
   * - 工具调用（type: 'tool_call'）
   * - 完成信号（type: 'done'）
   *
   * @example
   * ```typescript
   * for await (const chunk of llm.stream(request)) {
   *   if (chunk.type === 'text') {
   *     console.log(chunk.text);
   *   }
   * }
   * ```
   */
  stream(request: LLMRequest): AsyncIterable<LLMChunk>;

  /**
   * 非流式生成响应（可选）
   *
   * @param request - LLM 请求参数
   * @returns Promise 返回完整响应
   *
   * @description
   * 某些场景下可能需要一次性返回完整响应，
   * 例如批量处理或不需要流式 UI 的场景。
   */
  generate?(request: LLMRequest): Promise<LLMResponse>;
}
