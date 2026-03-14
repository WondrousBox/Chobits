import { GoogleGenerativeAI } from '@google/generative-ai';

import type { ChatRequest, ChatResponse, StreamEvent } from '../types';
import { createAssistantMessage, finalizeStreamingTextResponse, listProviderModelsFromCuratedOrFallback } from './provider-runtime-utils';

export type GeminiRuntimeSecrets = {
  apiKey?: string;
  model?: string;
};

export interface GeminiChatRuntimeOptions {
  client: GoogleGenerativeAI;
  request: ChatRequest;
  providerId: string;
  defaultModel: string;
  configuredModel?: string;
}

export interface GeminiListModelsOptions {
  providerId: string;
  configuredModel?: string;
  defaultModel?: string;
}

function resolveGeminiChatModel(request: ChatRequest, configuredModel: string | undefined, defaultModel: string): string {
  return (request.extras?.model as string) || configuredModel || defaultModel;
}

function buildGeminiPayload(request: ChatRequest): {
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
  systemInstruction?: { role: 'system'; parts: Array<{ text: string }> };
} {
  const systemSegments: string[] = [];
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  for (const message of request.messages) {
    if (message.role === 'system') {
      if (message.content) {
        systemSegments.push(message.content);
      }
      continue;
    }

    contents.push({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }]
    });
  }

  return {
    contents: contents.length ? contents : [{ role: 'user', parts: [{ text: '' }] }],
    systemInstruction: systemSegments.length
      ? {
          role: 'system',
          parts: [{ text: systemSegments.join('\n\n') }]
        }
      : undefined
  };
}

export function createGeminiClient(secrets: GeminiRuntimeSecrets): GoogleGenerativeAI {
  if (!secrets.apiKey) {
    throw new Error('Gemini API key not set');
  }

  return new GoogleGenerativeAI(secrets.apiKey);
}

export async function executeGeminiChat(options: GeminiChatRuntimeOptions, onStream?: (event: StreamEvent) => void, signal?: AbortSignal): Promise<ChatResponse> {
  const modelId = resolveGeminiChatModel(options.request, options.configuredModel, options.defaultModel);
  const payload = buildGeminiPayload(options.request);
  const model = options.client.getGenerativeModel({
    model: modelId,
    ...(payload.systemInstruction ? { systemInstruction: payload.systemInstruction } : {})
  }) as any;

  if (options.request.stream && onStream) {
    const streamResponse: any = await model.generateContentStream({ contents: payload.contents }, { signal } as any);
    let fullText = '';

    for await (const chunk of streamResponse.stream) {
      const text = chunk?.text();
      if (!text) continue;

      fullText += text;
      onStream({ type: 'delta', data: { text } });
    }

    return finalizeStreamingTextResponse(options.providerId, fullText, onStream);
  }

  const response: any = await model.generateContent({ contents: payload.contents }, { signal } as any);
  const text = response?.response?.text?.() || '';

  return {
    message: createAssistantMessage(text),
    providerId: options.providerId
  };
}

export async function listGeminiModels(options: GeminiListModelsOptions): Promise<Array<{ id: string }>> {
  return listProviderModelsFromCuratedOrFallback({
    providerId: options.providerId,
    configuredModel: options.configuredModel,
    defaultModel: options.defaultModel
  });
}
