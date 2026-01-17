/**
 * Vercel AI SDK 适配器
 *
 * 基于 Vercel AI SDK (ai 包) 的 LLM 提供者实现
 * 支持 OpenAI、Anthropic、Google 等多种模型
 */

import type { LLMProvider } from '../../interfaces/llm-provider';
import type { LLMChunk, LLMRequest, LLMResponse, ToolDefinition } from '../../types';

/**
 * Vercel AI SDK 配置
 */
export interface VercelAIConfig {
  /** 提供商 */
  provider: 'openai' | 'anthropic' | 'google';
  /** 模型名称 */
  model: string;
  /** API Key（可选，默认使用环境变量） */
  apiKey?: string;
  /** 基础 URL（可选） */
  baseURL?: string;
}

/**
 * Vercel AI SDK 适配器
 *
 * @description
 * 将 Vercel AI SDK 适配为 LLMProvider 接口。
 *
 * @example
 * ```typescript
 * import { VercelAIAdapter } from '@packages/ai-agent/adapters/llm';
 *
 * const llm = new VercelAIAdapter({
 *   provider: 'openai',
 *   model: 'gpt-4o',
 *   apiKey: process.env.OPENAI_API_KEY
 * });
 *
 * for await (const chunk of llm.stream(request)) {
 *   console.log(chunk);
 * }
 * ```
 */
export class VercelAIAdapter implements LLMProvider {
  private config: VercelAIConfig;

  constructor(config: VercelAIConfig) {
    this.config = config;
  }

  /**
   * 流式生成
   */
  async *stream(request: LLMRequest): AsyncIterable<LLMChunk> {
    // 动态导入 Vercel AI SDK
    const { streamText } = await import('ai');
    const model = await this.getModel();

    // 构建消息
    const messages = this.convertMessages(request);

    // 构建工具
    const tools = request.tools ? this.convertTools(request.tools) : undefined;

    try {
      const result = await streamText({
        model,
        messages,
        tools,
        temperature: request.temperature ?? 0.7,
        maxTokens: request.maxTokens
      });

      // 处理文本流
      for await (const part of result.textStream) {
        yield { type: 'text', text: part };
      }

      // 处理工具调用
      const toolCalls = await result.toolCalls;
      if (toolCalls && toolCalls.length > 0) {
        for (const call of toolCalls) {
          yield {
            type: 'tool_call',
            call: {
              id: call.toolCallId,
              name: call.toolName,
              params: call.args
            }
          };
        }
      }

      // 发送完成信号
      const usage = await result.usage;
      yield {
        type: 'done',
        usage: usage
          ? {
            inputTokens: usage.promptTokens,
            outputTokens: usage.completionTokens,
            totalTokens: usage.totalTokens
          }
          : undefined
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * 非流式生成
   */
  async generate(request: LLMRequest): Promise<LLMResponse> {
    const { generateText } = await import('ai');
    const model = await this.getModel();

    const messages = this.convertMessages(request);
    const tools = request.tools ? this.convertTools(request.tools) : undefined;

    try {
      const result = await generateText({
        model,
        messages,
        tools,
        temperature: request.temperature ?? 0.7,
        maxTokens: request.maxTokens
      });

      return {
        message: {
          role: 'assistant',
          content: result.text
        },
        usage: result.usage
          ? {
            inputTokens: result.usage.promptTokens,
            outputTokens: result.usage.completionTokens,
            totalTokens: result.usage.totalTokens
          }
          : undefined
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  /**
   * 获取模型实例
   */
  private async getModel(): Promise<any> {
    const { provider, model, apiKey, baseURL } = this.config;

    switch (provider) {
      case 'openai': {
        const { openai, createOpenAI } = await import('@ai-sdk/openai');
        if (apiKey || baseURL) {
          const customOpenAI = createOpenAI({
            apiKey,
            baseURL
          });
          return customOpenAI(model);
        }
        return openai(model);
      }

      case 'anthropic': {
        const { anthropic, createAnthropic } = await import('@ai-sdk/anthropic');
        if (apiKey || baseURL) {
          const customAnthropic = createAnthropic({
            apiKey,
            baseURL
          });
          return customAnthropic(model);
        }
        return anthropic(model);
      }

      case 'google': {
        const { google, createGoogleGenerativeAI } = await import('@ai-sdk/google');
        if (apiKey || baseURL) {
          const customGoogle = createGoogleGenerativeAI({
            apiKey,
            baseURL
          });
          return customGoogle(model);
        }
        return google(model);
      }

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * 转换消息格式
   */
  private convertMessages(request: LLMRequest): any[] {
    const messages: any[] = [];

    // 添加系统提示词
    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt
      });
    }

    // 转换用户消息
    for (const msg of request.messages) {
      if (msg.role === 'tool') {
        messages.push({
          role: 'tool',
          content: msg.content,
          toolCallId: msg.toolCallId
        });
      } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        const toolCalls = msg.toolCalls.map((call) => ({
          toolCallId: call.id,
          toolName: call.name,
          args: call.params ?? {}
        }));

        messages.push({
          role: 'assistant',
          content: msg.content,
          toolCalls,
          tool_calls: toolCalls
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
   * 转换工具格式
   */
  private convertTools(tools: ToolDefinition[]): Record<string, any> {
    const result: Record<string, any> = {};

    for (const tool of tools) {
      result[tool.name] = {
        description: tool.description,
        parameters: tool.parameters
      };
    }

    return result;
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
