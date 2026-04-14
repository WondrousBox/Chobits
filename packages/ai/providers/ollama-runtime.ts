import type { ChatRequest, ChatResponse, EmbeddingRequest, EmbeddingResponse, StreamEvent, TokenUsage } from '../types';
import { createAssistantMessage, finalizeStreamingTextResponse, listProviderModelsFromCuratedOrFallback } from './provider-runtime-utils';

export type OllamaRuntimeSecrets = {
  baseUrl?: string;
  model?: string;
};

export interface OllamaRuntimeClient {
  baseUrl: string;
}

export interface OllamaChatRuntimeOptions {
  client: OllamaRuntimeClient;
  request: ChatRequest;
  providerId: string;
  defaultModel: string;
  configuredModel?: string;
}

export interface OllamaEmbeddingRuntimeOptions {
  client: OllamaRuntimeClient;
  request: EmbeddingRequest;
  providerId: string;
  defaultModel: string;
  configuredModel?: string;
}

export interface OllamaListModelsOptions {
  client: OllamaRuntimeClient;
  providerId: string;
  configuredModel?: string;
  defaultModel?: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function resolveOllamaUrl(client: OllamaRuntimeClient, path: string): string {
  return `${client.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

function resolveOllamaChatModel(request: ChatRequest, configuredModel: string | undefined, defaultModel: string): string {
  return (request.extras?.model as string) || configuredModel || defaultModel;
}

function resolveOllamaEmbeddingModel(request: EmbeddingRequest, configuredModel: string | undefined, defaultModel: string): string {
  return (request.model as string) || configuredModel || defaultModel;
}

async function ensureOllamaResponse(response: Response, scope: string): Promise<void> {
  if (response.ok) return;

  const errorText = await response.text().catch(() => '');
  throw new Error(`${scope} failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`);
}

async function readOllamaStreamingText(response: Response, onDelta: (delta: string) => void): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';

  const decoder = new TextDecoder();
  let buffered = '';
  let fullText = '';

  const flushLine = (line: string): void => {
    if (!line) return;

    try {
      const payload = JSON.parse(line);
      const delta = payload?.message?.content || '';
      if (!delta) return;

      fullText += delta;
      onDelta(delta);
    } catch (error) {
      console.error('[OllamaProvider] Failed to parse streaming chunk:', error);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffered += decoder.decode(value, { stream: true });
    let newlineIndex = buffered.indexOf('\n');

    while (newlineIndex >= 0) {
      flushLine(buffered.slice(0, newlineIndex).trim());
      buffered = buffered.slice(newlineIndex + 1);
      newlineIndex = buffered.indexOf('\n');
    }
  }

  flushLine(buffered.trim());
  return fullText;
}

export function createOllamaClient(secrets: OllamaRuntimeSecrets): OllamaRuntimeClient {
  return {
    baseUrl: normalizeBaseUrl(secrets.baseUrl || 'http://127.0.0.1:11434')
  };
}

export async function executeOllamaChat(options: OllamaChatRuntimeOptions, onStream?: (event: StreamEvent) => void, signal?: AbortSignal): Promise<ChatResponse> {
  const model = resolveOllamaChatModel(options.request, options.configuredModel, options.defaultModel);
  const messages = options.request.messages.map((message) => ({
    role: message.role,
    content: message.content
  }));

  if (options.request.stream && onStream) {
    const response = await fetch(resolveOllamaUrl(options.client, '/api/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true }),
      signal
    });

    await ensureOllamaResponse(response, 'Ollama streaming chat');
    const fullText = await readOllamaStreamingText(response, (delta) => {
      onStream({ type: 'delta', data: { text: delta } });
    });

    return finalizeStreamingTextResponse(options.providerId, fullText, onStream);
  }

  const response = await fetch(resolveOllamaUrl(options.client, '/api/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false }),
    signal
  });

  await ensureOllamaResponse(response, 'Ollama chat');
  const data: any = await response.json();

  return {
    message: createAssistantMessage(data?.message?.content || ''),
    providerId: options.providerId
  };
}

export async function executeOllamaEmbedding(options: OllamaEmbeddingRuntimeOptions): Promise<EmbeddingResponse> {
  const model = resolveOllamaEmbeddingModel(options.request, options.configuredModel, options.defaultModel);
  const response = await fetch(resolveOllamaUrl(options.client, '/api/embeddings'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: options.request.texts })
  });

  await ensureOllamaResponse(response, 'Ollama embeddings');
  const data: any = await response.json();
  const vectors = (data?.embeddings || data?.data || []).map((item: any) => item?.embedding || item).filter(Boolean);
  const dim = vectors[0]?.length || 0;
  const usage = normalizeOllamaEmbeddingUsage(data);
  const rawUsage = usage
    ? {
        prompt_eval_count: data?.prompt_eval_count,
        total_duration: data?.total_duration
      }
    : undefined;

  return {
    vectors,
    dim,
    model,
    providerId: options.providerId,
    ...(rawUsage ? { rawUsage } : {}),
    ...(usage ? { usage } : {})
  };
}

function normalizeOllamaEmbeddingUsage(data: any): TokenUsage | undefined {
  const inputTokens = typeof data?.prompt_eval_count === 'number' && Number.isFinite(data.prompt_eval_count) && data.prompt_eval_count >= 0 ? data.prompt_eval_count : undefined;

  if (inputTokens === undefined) {
    return undefined;
  }

  return {
    inputTokens,
    totalTokens: inputTokens
  };
}

export async function listOllamaModels(options: OllamaListModelsOptions): Promise<Array<{ id: string }>> {
  return listProviderModelsFromCuratedOrFallback({
    providerId: options.providerId,
    configuredModel: options.configuredModel,
    defaultModel: options.defaultModel,
    loadRemoteModels: async () => {
      const response = await fetch(resolveOllamaUrl(options.client, '/api/tags'));
      await ensureOllamaResponse(response, 'Ollama list models');
      const data: any = await response.json();
      const models = Array.isArray(data?.models) ? data.models : Array.isArray(data?.data) ? data.data : [];
      return models.map((model: any) => ({ id: model.name || model.model || model.id || '' })).filter((model: any) => model.id);
    }
  });
}
