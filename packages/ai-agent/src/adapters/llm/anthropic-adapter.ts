/**
 * Anthropic 直接适配器
 *
 * 直接使用 Anthropic SDK 的 LLM 提供者实现
 */

import type { LLMProvider } from '../../interfaces/llm-provider';
import type { LLMChunk, LLMRequest, LLMResponse, ToolDefinition } from '../../types';

/**
 * Anthropic 配置
 */
export interface AnthropicAdapterConfig {
  /** API Key */
  apiKey: string;
  /** 模型名称 */
  model?: string;
  /** 基础 URL（可选） */
  baseURL?: string;
}

/**
 * Anthropic 适配器
 *
 * @description
 * 直接使用 Anthropic SDK 的适配器实现。
 *
 * @example
 * ```typescript
 * const llm = new AnthropicAdapter({
 *   apiKey: process.env.ANTHROPIC_API_KEY!,
 *   model: 'claude-3-5-sonnet-20241022'
 * });
 *
 * for await (const chunk of llm.stream(request)) {
 *   console.log(chunk);
 * }
 * ```
 */
export class AnthropicAdapter implements LLMProvider {
  private config: AnthropicAdapterConfig;

  constructor(config: AnthropicAdapterConfig) {
    this.config = config;
  }

  /**
   * 流式生成
   */
  async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;

    const client = new Anthropic({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL
    });

    const model = this.config.model ?? 'claude-3-5-sonnet-20241022';

    // 构建消息（Anthropic 格式）
    const { system, messages } = this.buildMessages(request);

    // 构建工具
    const tools = request.tools?.length ? this.buildTools(request.tools) : undefined;

    try {
      const stream = await client.messages.stream({
        model,
        system,
        messages,
        tools,
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.7
      });

      let currentToolUse: { id: string; name: string; input: string } | null = null;

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          const delta = event.delta;

          // 文本 delta
          if ('text' in delta) {
            yield { type: 'text', text: delta.text };
          }

          // 工具调用 delta
          if ('partial_json' in delta) {
            if (currentToolUse) {
              currentToolUse.input += delta.partial_json;
            }
          }
        }

        if (event.type === 'content_block_start') {
          const block = event.content_block;
          if (block.type === 'tool_use') {
            currentToolUse = {
              id: block.id,
              name: block.name,
              input: ''
            };
          }
        }

        if (event.type === 'content_block_stop') {
          if (currentToolUse) {
            try {
              yield {
                type: 'tool_call',
                call: {
                  id: currentToolUse.id,
                  name: currentToolUse.name,
                  params: JSON.parse(currentToolUse.input || '{}')
                }
              };
            } catch {
              yield {
                type: 'tool_call',
                call: {
                  id: currentToolUse.id,
                  name: currentToolUse.name,
                  params: {}
                }
              };
            }
            currentToolUse = null;
          }
        }

        if (event.type === 'message_delta') {
          if (event.usage) {
            yield {
              type: 'done',
              usage: {
                outputTokens: event.usage.output_tokens
              }
            };
            return;
          }
        }
      }

      yield { type: 'done' };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * 非流式生成
   */
  async generate(request: LLMRequest): Promise<LLMResponse> {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;

    const client = new Anthropic({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL
    });

    const model = this.config.model ?? 'claude-3-5-sonnet-20241022';
    const { system, messages } = this.buildMessages(request);
    const tools = request.tools?.length ? this.buildTools(request.tools) : undefined;

    try {
      const response = await client.messages.create({
        model,
        system,
        messages,
        tools,
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.7
      });

      // 提取文本内容
      let content = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          content += block.text;
        }
      }

      return {
        message: {
          role: 'assistant',
          content
        },
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          totalTokens: response.usage.input_tokens + response.usage.output_tokens
        }
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * 构建消息（Anthropic 格式）
   */
  private buildMessages(request: LLMRequest): { system: string; messages: any[] } {
    let system = '';
    const messages: any[] = [];

    // 处理系统提示
    if (request.systemPrompt) {
      system = request.systemPrompt;
    }

    for (const msg of request.messages) {
      if (msg.role === 'system') {
        system = system ? `${system}\n\n${msg.content}` : msg.content;
        continue;
      }

      if (msg.role === 'tool') {
        // Anthropic 的工具结果格式
        messages.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.toolCallId,
              content: msg.content
            }
          ]
        });
        continue;
      }

      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        const contentBlocks: Array<{ type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown }> = [];

        if (msg.content) {
          contentBlocks.push({ type: 'text', text: msg.content });
        }

        for (const call of msg.toolCalls) {
          contentBlocks.push({
            type: 'tool_use',
            id: call.id,
            name: call.name,
            input: call.params ?? {}
          });
        }

        messages.push({
          role: 'assistant',
          content: contentBlocks
        });
        continue;
      }

      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content
      });
    }

    return { system, messages };
  }

  /**
   * 构建工具（Anthropic 格式）
   */
  private buildTools(tools: ToolDefinition[]): any[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters
    }));
  }

  /**
   * 标准化错误
   */
  private normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }
    return new Error(String(error));
  }
}
