import Anthropic from '@anthropic-ai/sdk';

import type { ChatRequest, ChatResponse, StreamEvent } from '../types';
import { createAssistantMessage, finalizeStreamingTextResponse, listProviderModelsFromCuratedOrFallback } from './provider-runtime-utils';

export type AnthropicRuntimeSecrets = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

export interface AnthropicChatRuntimeOptions {
  client: Anthropic;
  request: ChatRequest;
  providerId: string;
  defaultModel: string;
  configuredModel?: string;
}

export interface AnthropicListModelsOptions {
  providerId: string;
  configuredModel?: string;
  defaultModel?: string;
}

function resolveAnthropicChatModel(request: ChatRequest, configuredModel: string | undefined, defaultModel: string): string {
  return (request.extras?.model as string) || configuredModel || defaultModel;
}

function buildAnthropicRequest(request: ChatRequest): { system?: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> } {
  const systemSegments: string[] = [];
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const message of request.messages) {
    if (message.role === 'system') {
      if (message.content) {
        systemSegments.push(message.content);
      }
      continue;
    }

    messages.push({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content
    });
  }

  return {
    system: systemSegments.length ? systemSegments.join('\n\n') : undefined,
    messages: messages.length ? messages : [{ role: 'user', content: '' }]
  };
}

function extractAnthropicText(response: any): string {
  if (Array.isArray(response?.content)) {
    return response.content
      .map((block: any) => {
        if (typeof block?.text === 'string') return block.text;
        if (typeof block?.content === 'string') return block.content;
        return '';
      })
      .join('');
  }

  return response?.output_text || '';
}

export function createAnthropicClient(secrets: AnthropicRuntimeSecrets): Anthropic {
  const config: any = {};
  if (secrets.apiKey) config.apiKey = secrets.apiKey;
  if (secrets.baseUrl) config.baseURL = secrets.baseUrl;
  return new Anthropic(config);
}

export async function executeAnthropicChat(options: AnthropicChatRuntimeOptions, onStream?: (event: StreamEvent) => void, signal?: AbortSignal): Promise<ChatResponse> {
  const model = resolveAnthropicChatModel(options.request, options.configuredModel, options.defaultModel);
  const payload = buildAnthropicRequest(options.request);

  if (options.request.stream && onStream) {
    try {
      const stream: any = await (options.client as any).messages.create(
        {
          model,
          messages: payload.messages,
          system: payload.system,
          stream: true
        },
        { signal }
      );

      let fullText = '';
      for await (const event of stream) {
        const delta = (event?.delta?.text || event?.content_block?.text) as string | undefined;
        if (!delta) continue;

        fullText += delta;
        onStream({ type: 'delta', data: { text: delta } });
      }

      return finalizeStreamingTextResponse(options.providerId, fullText, onStream);
    } catch {
      // Fall back to non-streaming if the SDK/runtime does not support streaming here.
    }
  }

  const response: any = await (options.client as any).messages.create(
    {
      model,
      messages: payload.messages,
      system: payload.system
    },
    { signal }
  );

  return {
    message: createAssistantMessage(extractAnthropicText(response)),
    providerId: options.providerId
  };
}

export async function listAnthropicModels(options: AnthropicListModelsOptions): Promise<Array<{ id: string }>> {
  return listProviderModelsFromCuratedOrFallback({
    providerId: options.providerId,
    configuredModel: options.configuredModel,
    defaultModel: options.defaultModel
  });
}
