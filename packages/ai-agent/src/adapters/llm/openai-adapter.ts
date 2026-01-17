/**
 * OpenAI 直接适配器
 *
 * 直接使用 OpenAI SDK 的 LLM 提供者实现
 * 不依赖 Vercel AI SDK
 */

import type { LLMProvider } from '../../interfaces/llm-provider';
import type { LLMChunk, LLMRequest, LLMResponse, ToolDefinition } from '../../types';

/**
 * OpenAI 配置
 */
export interface OpenAIAdapterConfig {
  /** API Key */
  apiKey: string;
  /** 模型名称 */
  model?: string;
  /** 基础 URL（可选） */
  baseURL?: string;
  /** 组织 ID（可选） */
  organization?: string;
}

/**
 * OpenAI 适配器
 *
 * @description
 * 直接使用 OpenAI SDK 的适配器实现。
 * 适用于不想引入 Vercel AI SDK 的场景。
 *
 * @example
 * ```typescript
 * const llm = new OpenAIAdapter({
 *   apiKey: process.env.OPENAI_API_KEY!,
 *   model: 'gpt-4o'
 * });
 *
 * for await (const chunk of llm.stream(request)) {
 *   console.log(chunk);
 * }
 * ```
 */
export class OpenAIAdapter implements LLMProvider {
  private config: OpenAIAdapterConfig;

  constructor(config: OpenAIAdapterConfig) {
    this.config = config;
  }

  /**
   * 流式生成
   */
  async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
    const OpenAI = (await import('openai')).default;

    const client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
      organization: this.config.organization
    });

    const model = this.config.model ?? 'gpt-4o-mini';

    // 构建消息
    const messages = this.buildMessages(request);

    // 构建工具
    const tools = request.tools?.length ? this.buildTools(request.tools) : undefined;

    try {
      const stream = await client.chat.completions.create({
        model,
        messages,
        tools,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens,
        stream: true
      });

      const accumulatedToolCalls: Map<number, { id: string; name: string; args: string }> = new Map();

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        // 处理文本
        if (delta?.content) {
          yield { type: 'text', text: delta.content };
        }

        // 处理工具调用
        if (delta?.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            const index = toolCall.index;
            const existing = accumulatedToolCalls.get(index) ?? { id: '', name: '', args: '' };

            if (toolCall.id) existing.id = toolCall.id;
            if (toolCall.function?.name) existing.name = toolCall.function.name;
            if (toolCall.function?.arguments) existing.args += toolCall.function.arguments;

            accumulatedToolCalls.set(index, existing);
          }
        }

        // 检查结束原因
        if (chunk.choices[0]?.finish_reason === 'tool_calls') {
          // 发射所有工具调用
          for (const [, toolCall] of accumulatedToolCalls) {
            try {
              yield {
                type: 'tool_call',
                call: {
                  id: toolCall.id,
                  name: toolCall.name,
                  params: JSON.parse(toolCall.args || '{}')
                }
              };
            } catch {
              yield {
                type: 'tool_call',
                call: {
                  id: toolCall.id,
                  name: toolCall.name,
                  params: {}
                }
              };
            }
          }
        }

        // 处理用量
        if (chunk.usage) {
          yield {
            type: 'done',
            usage: {
              inputTokens: chunk.usage.prompt_tokens,
              outputTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens
            }
          };
          return;
        }
      }

      // 如果没有 usage，也发送 done
      yield { type: 'done' };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * 非流式生成
   */
  async generate(request: LLMRequest): Promise<LLMResponse> {
    const OpenAI = (await import('openai')).default;

    const client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseURL,
      organization: this.config.organization
    });

    const model = this.config.model ?? 'gpt-4o-mini';
    const messages = this.buildMessages(request);
    const tools = request.tools?.length ? this.buildTools(request.tools) : undefined;

    try {
      const response = await client.chat.completions.create({
        model,
        messages,
        tools,
        temperature: request.temperature ?? 0.7,
        max_tokens: request.maxTokens
      });

      const message = response.choices[0]?.message;

      return {
        message: {
          role: 'assistant',
          content: message?.content ?? ''
        },
        usage: response.usage
          ? {
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens
          }
          : undefined
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * 构建消息
   */
  private buildMessages(request: LLMRequest): any[] {
    const messages: any[] = [];

    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt
      });
    }

    for (const msg of request.messages) {
      if (msg.role === 'tool') {
        messages.push({
          role: 'tool',
          content: msg.content,
          tool_call_id: msg.toolCallId
        });
      } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: msg.content,
          tool_calls: msg.toolCalls.map((call) => ({
            id: call.id,
            type: 'function',
            function: {
              name: call.name,
              arguments: JSON.stringify(call.params ?? {})
            }
          }))
        });
      } else {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    return messages;
  }

  /**
   * 构建工具
   */
  private buildTools(tools: ToolDefinition[]): any[] {
    return tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
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
