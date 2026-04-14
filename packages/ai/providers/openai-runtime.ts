import OpenAI, { toFile } from 'openai';
import type { Uploadable } from 'openai/core/uploads';
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';

import type { ChatRequest, ChatResponse, EmbeddingRequest, EmbeddingResponse, StreamEvent, TokenUsage, TranscribeOptions, TranscriptionResponse } from '../types';
import { listProviderRuntimeModels } from './service';

export type OpenAIRuntimeSecrets = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  organization?: string;
};

export interface OpenAIChatRuntimeOptions {
  client: OpenAI;
  request: ChatRequest;
  providerId: string;
  defaultModel: string;
  configuredModel?: string;
}

export interface OpenAIEmbeddingRuntimeOptions {
  client: OpenAI;
  request: EmbeddingRequest;
  providerId: string;
  defaultModel: string;
  configuredModel?: string;
}

export interface OpenAITranscriptionRuntimeOptions {
  client: OpenAI;
  file: File | Blob | Buffer | ArrayBuffer;
  providerId: string;
  defaultModel: string;
  options?: TranscribeOptions;
}

export interface OpenAIListModelsOptions {
  client: OpenAI;
  providerId: string;
  configuredModel?: string;
  defaultModel?: string;
}

function resolveOpenAIChatModel(request: ChatRequest, configuredModel: string | undefined, defaultModel: string): string {
  return (request.extras?.model as string) || configuredModel || defaultModel;
}

function resolveOpenAIEmbeddingModel(request: EmbeddingRequest, configuredModel: string | undefined, defaultModel: string): string {
  return (request.model as string) || (request as any)?.extras?.secrets?.model || configuredModel || defaultModel;
}

function resolveOpenAITranscriptionModel(options: TranscribeOptions | undefined, defaultModel: string): string {
  return options?.model || (options?.secrets as any)?.model || defaultModel;
}

async function normalizeOpenAIAudioFile(file: File | Blob | Buffer | ArrayBuffer): Promise<Uploadable> {
  if (typeof File !== 'undefined' && file instanceof File) {
    return file;
  }

  if (file instanceof Blob) {
    return toFile(file, 'audio.wav', { type: file.type || 'audio/wav' });
  }

  const bytes = Buffer.isBuffer(file) ? file : Buffer.from(file);
  return toFile(bytes, 'audio.wav', { type: 'audio/wav' });
}

function normalizeOpenAIModelInfo<T extends { type?: string }>(model: T): T {
  if (model.type !== 'stt') {
    return model;
  }

  return {
    ...model,
    type: 'audio'
  };
}

function buildOpenAIChatMessages(request: ChatRequest): ChatCompletionMessageParam[] {
  return request.messages.map((message): ChatCompletionMessageParam => {
    switch (message.role) {
      case 'system':
        return {
          role: 'system',
          content: message.content
        };
      case 'assistant':
        return {
          role: 'assistant',
          content: message.content
        };
      case 'tool':
        return {
          role: 'tool',
          content: message.content,
          tool_call_id: message.toolCallId || message.name || 'tool-call'
        };
      case 'user':
      default:
        return {
          role: 'user',
          content: message.content,
          ...(message.name ? { name: message.name } : {})
        };
    }
  });
}

function buildOpenAITools(request: ChatRequest): ChatCompletionTool[] | undefined {
  const toolDefs = (request.extras as any)?.tools as Array<{ name: string; description: string; parameters: any }> | undefined;
  if (!toolDefs?.length) return undefined;

  return toolDefs.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
    }
  }));
}

async function streamOpenAIChat(
  client: OpenAI,
  request: ChatRequest,
  providerId: string,
  model: string,
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[] | undefined,
  onStream: (event: StreamEvent) => void,
  signal?: AbortSignal
): Promise<ChatResponse> {
  const stream = await client.chat.completions.create(
    {
      model,
      messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens as any,
      tools,
      tool_choice: tools?.length ? 'auto' : undefined,
      stream: true
    },
    { signal }
  );

  let finalText = '';
  const toolCalls = new Map<number, { id?: string; name?: string; args: string }>();

  for await (const part of stream) {
    const choice = part?.choices?.[0];
    const delta = choice?.delta?.content;
    if (delta) {
      finalText += delta;
      onStream({ type: 'delta', data: { text: delta } });
    }

    const toolDelta = choice?.delta?.tool_calls;
    if (Array.isArray(toolDelta)) {
      for (const call of toolDelta) {
        const index = (call as any)?.index ?? 0;
        const current = toolCalls.get(index) || { id: undefined, name: undefined, args: '' };
        if (call?.id) current.id = call.id;
        if ((call as any)?.function?.name) current.name = (call as any).function.name;
        if ((call as any)?.function?.arguments) current.args += (call as any).function.arguments;
        toolCalls.set(index, current);
      }
    }
  }

  for (const entry of toolCalls.values()) {
    if (!entry.name) continue;
    let args: any = entry.args;
    try {
      args = entry.args ? JSON.parse(entry.args) : {};
    } catch {
      // keep raw string payload
    }
    onStream({ type: 'tool_call', data: { name: entry.name, args, callId: entry.id || '' } });
  }

  const message = { role: 'assistant' as const, content: finalText, createdAt: Date.now() };
  onStream({ type: 'message_completed', data: { message } });
  return { message, providerId };
}

export function createOpenAIClient(secrets: OpenAIRuntimeSecrets): OpenAI {
  const cfg: any = {};
  if (secrets.apiKey) cfg.apiKey = secrets.apiKey;
  if (secrets.baseUrl) cfg.baseURL = secrets.baseUrl;
  if (secrets.organization) cfg.organization = secrets.organization;
  // Provide a dummy key when none is configured so the constructor doesn't throw.
  // Actual API calls will still fail; this only allows curated-model listing to work
  // without a configured key.
  if (!cfg.apiKey) cfg.apiKey = 'not-configured';
  return new OpenAI(cfg);
}

export async function executeOpenAIChat(options: OpenAIChatRuntimeOptions, onStream?: (event: StreamEvent) => void, signal?: AbortSignal): Promise<ChatResponse> {
  const messages = buildOpenAIChatMessages(options.request);
  const tools = buildOpenAITools(options.request);
  const model = resolveOpenAIChatModel(options.request, options.configuredModel, options.defaultModel);

  if (options.request.stream && onStream) {
    return streamOpenAIChat(options.client, options.request, options.providerId, model, messages, tools, onStream, signal);
  }

  const response = await options.client.chat.completions.create(
    {
      model,
      messages,
      temperature: options.request.temperature,
      max_tokens: options.request.maxTokens as any,
      tools,
      tool_choice: tools?.length ? 'auto' : undefined
    },
    { signal }
  );

  const text = response?.choices?.[0]?.message?.content || '';
  return {
    message: { role: 'assistant', content: text, createdAt: Date.now() },
    providerId: options.providerId
  };
}

export async function executeOpenAIEmbedding(options: OpenAIEmbeddingRuntimeOptions): Promise<EmbeddingResponse> {
  const model = resolveOpenAIEmbeddingModel(options.request, options.configuredModel, options.defaultModel);
  const response = await options.client.embeddings.create({
    model,
    input: options.request.texts
  });
  const vectors = response.data.map((item: any) => item.embedding as number[]);
  const dim = vectors[0]?.length || 0;
  const usage = normalizeOpenAIEmbeddingUsage(response?.usage);

  return {
    vectors,
    dim,
    model,
    providerId: options.providerId,
    ...(response?.usage ? { rawUsage: response.usage } : {}),
    ...(usage ? { usage } : {})
  };
}

function normalizeOpenAIEmbeddingUsage(usage: any): TokenUsage | undefined {
  const inputTokens = typeof usage?.prompt_tokens === 'number' && Number.isFinite(usage.prompt_tokens) && usage.prompt_tokens >= 0 ? usage.prompt_tokens : undefined;
  const totalTokens = typeof usage?.total_tokens === 'number' && Number.isFinite(usage.total_tokens) && usage.total_tokens >= 0 ? usage.total_tokens : undefined;

  if (inputTokens === undefined && totalTokens === undefined) {
    return undefined;
  }

  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(inputTokens !== undefined ? { billableInputTokens: inputTokens } : {}),
    ...(totalTokens !== undefined ? { billableTotalTokens: totalTokens } : {})
  };
}

function normalizeOpenAITranscriptionUsage(usage: any): TokenUsage | undefined {
  if (!usage || typeof usage !== 'object') {
    return undefined;
  }

  if (usage.type !== 'tokens') {
    return undefined;
  }

  const inputTokens = typeof usage.input_tokens === 'number' && Number.isFinite(usage.input_tokens) && usage.input_tokens >= 0 ? usage.input_tokens : undefined;
  const outputTokens = typeof usage.output_tokens === 'number' && Number.isFinite(usage.output_tokens) && usage.output_tokens >= 0 ? usage.output_tokens : undefined;
  const totalTokens = typeof usage.total_tokens === 'number' && Number.isFinite(usage.total_tokens) && usage.total_tokens >= 0 ? usage.total_tokens : undefined;

  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) {
    return undefined;
  }

  return {
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(inputTokens !== undefined ? { billableInputTokens: inputTokens } : {}),
    ...(outputTokens !== undefined ? { billableOutputTokens: outputTokens } : {}),
    ...(totalTokens !== undefined ? { billableTotalTokens: totalTokens } : {})
  };
}

export async function executeOpenAITranscription(options: OpenAITranscriptionRuntimeOptions): Promise<TranscriptionResponse> {
  const model = resolveOpenAITranscriptionModel(options.options, options.defaultModel);
  const response = await options.client.audio.transcriptions.create({
    file: await normalizeOpenAIAudioFile(options.file),
    model,
    language: options.options?.language,
    prompt: options.options?.prompt
  });
  const usage = normalizeOpenAITranscriptionUsage(response?.usage);

  return {
    text: response.text || '',
    model,
    providerId: options.providerId,
    ...(response?.usage ? { rawUsage: response.usage } : {}),
    ...(usage ? { usage } : {})
  };
}

export async function listOpenAIModels(options: OpenAIListModelsOptions): Promise<Array<{ id: string }>> {
  const curated = await listProviderRuntimeModels(options.providerId);
  if (curated.length) {
    return curated.map((model) => normalizeOpenAIModelInfo(model));
  }

  try {
    const response: any = await options.client.models.list();
    const data = Array.isArray(response?.data) ? response.data : [];
    const items = data.map((model: any) => ({ id: model.id })).filter((model: any) => model.id);
    if (items.length) return items;
  } catch {
    // fall through to configured/default fallback
  }

  const fallbackIds = [options.configuredModel, options.defaultModel].filter(Boolean) as string[];
  return Array.from(new Set(fallbackIds)).map((id) => ({ id }));
}
