import type { ChatRequest } from '../../types';
import type { ResolvedPiModelConfig, ResolvedPiRequest } from './contracts';
import { resolvePiRequest } from './model-resolver';

type PiAiModule = typeof import('@mariozechner/pi-ai');
type PiApi = import('@mariozechner/pi-ai').Api;
type PiKnownProvider = import('@mariozechner/pi-ai').KnownProvider;
type PiModel = import('@mariozechner/pi-ai').Model<PiApi>;
type PiOpenAICompletionsCompat = import('@mariozechner/pi-ai').OpenAICompletionsCompat;
type PiSimpleStreamOptions = import('@mariozechner/pi-ai').SimpleStreamOptions;
type PiThinkingLevel = import('@mariozechner/pi-ai').ThinkingLevel;

export type PiTaskChatEvent = { type: 'delta'; data: { text: string } } | { type: 'message_completed' } | { type: 'error'; data: { message: string } };

export type PiTaskChatFunction = (prompt: string, onEvent: (event: PiTaskChatEvent) => void, abortSignal?: AbortSignal) => Promise<void>;

export interface CreatePiTaskRuntimeRequest {
  agentId?: string;
  extras?: Record<string, any>;
  maxTokens?: number;
  model?: string;
  providerId: string;
  providerInstanceId?: string;
  temperature?: number;
}

const DEFAULT_MODEL_IDS: Record<string, string> = {
  anthropic: 'claude-3-5-sonnet-20241022',
  deepseek: 'deepseek-chat',
  gemini: 'gemini-1.5-flash',
  ollama: 'llama3.1',
  openai: 'gpt-4o-mini',
  qwen: 'qwen2.5',
  zhipu: 'glm-4-flash'
};

const DEFAULT_BASE_URLS: Record<string, string> = {
  anthropic: 'https://api.anthropic.com',
  deepseek: 'https://api.deepseek.com',
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  ollama: 'http://127.0.0.1:11434/v1',
  openai: 'https://api.openai.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  zhipu: 'https://open.bigmodel.cn/api/paas/v4/'
};

function sanitizeBaseUrl(baseUrl?: string): string | undefined {
  const trimmed = baseUrl?.trim();
  return trimmed ? trimmed.replace(/\/+$/, '') : undefined;
}

function resolveFallbackModelId(providerId: string, modelId?: string): string {
  const trimmed = modelId?.trim();
  if (trimmed) return trimmed;
  return DEFAULT_MODEL_IDS[providerId] || DEFAULT_MODEL_IDS.openai;
}

function resolveFallbackBaseUrl(model: ResolvedPiModelConfig): string {
  const baseUrl = sanitizeBaseUrl(model.baseUrl);
  if (baseUrl) return baseUrl;
  return DEFAULT_BASE_URLS[model.canonicalProviderId] || DEFAULT_BASE_URLS.openai;
}

function inferReasoningCapability(modelId: string): boolean {
  return /gpt-5|^o[134]|reason|thinking|claude.*4|gemini-2\.5/i.test(modelId);
}

function resolvePiApi(model: ResolvedPiModelConfig): PiApi {
  switch (model.canonicalProviderId) {
    case 'anthropic':
      return 'anthropic-messages';
    case 'gemini':
      return 'google-generative-ai';
    case 'openai':
      if (!model.baseUrl || /api\.openai\.com/i.test(model.baseUrl)) {
        return 'openai-responses';
      }
      return 'openai-completions';
    default:
      return 'openai-completions';
  }
}

function resolveBuiltinProvider(model: ResolvedPiModelConfig): PiKnownProvider | undefined {
  switch (model.canonicalProviderId) {
    case 'anthropic':
      return 'anthropic';
    case 'gemini':
      return 'google';
    case 'openai':
      if (!model.baseUrl || /api\.openai\.com/i.test(model.baseUrl)) {
        return 'openai';
      }
      return undefined;
    default:
      return undefined;
  }
}

function buildOpenAICompat(model: ResolvedPiModelConfig): PiOpenAICompletionsCompat | undefined {
  if (resolvePiApi(model) !== 'openai-completions') return undefined;

  const compat: PiOpenAICompletionsCompat = {};

  if (model.canonicalProviderId !== 'openai') {
    compat.supportsDeveloperRole = false;
  }

  if (model.canonicalProviderId === 'qwen') {
    compat.thinkingFormat = 'qwen';
  }

  if (model.canonicalProviderId === 'zhipu') {
    compat.thinkingFormat = 'zai';
    compat.supportsDeveloperRole = false;
  }

  if (model.canonicalProviderId === 'ollama') {
    compat.supportsUsageInStreaming = false;
  }

  return Object.keys(compat).length ? compat : undefined;
}

function buildModelHeaders(model: ResolvedPiModelConfig): Record<string, string> | undefined {
  if (model.canonicalProviderId !== 'openai') return undefined;

  const organization = model.secrets.organization?.trim();
  if (!organization) return undefined;

  return {
    'OpenAI-Organization': organization
  };
}

async function loadPiAi(): Promise<PiAiModule> {
  return import('@mariozechner/pi-ai');
}

async function buildPiModel(ai: PiAiModule, resolved: ResolvedPiRequest): Promise<PiModel> {
  const fallbackModelId = resolveFallbackModelId(resolved.model.canonicalProviderId, resolved.model.modelId);
  const builtinProvider = resolveBuiltinProvider(resolved.model);

  if (builtinProvider) {
    const builtinModel = ai.getModel(builtinProvider as any, fallbackModelId as any);
    if (builtinModel) {
      const headers = buildModelHeaders(resolved.model);
      return {
        ...builtinModel,
        ...(headers ? { headers } : {}),
        baseUrl: sanitizeBaseUrl(resolved.model.baseUrl) || builtinModel.baseUrl,
        maxTokens: resolved.request.maxTokens || builtinModel.maxTokens
      } as PiModel;
    }
  }

  const api = resolvePiApi(resolved.model);
  const headers = buildModelHeaders(resolved.model);

  return {
    api,
    baseUrl: resolveFallbackBaseUrl(resolved.model),
    contextWindow: 128000,
    cost: {
      cacheRead: 0,
      cacheWrite: 0,
      input: 0,
      output: 0
    },
    ...(headers ? { headers } : {}),
    id: fallbackModelId,
    input: ['text'],
    maxTokens: resolved.request.maxTokens || 8192,
    name: fallbackModelId,
    provider: resolved.model.providerId || resolved.model.canonicalProviderId,
    reasoning: inferReasoningCapability(fallbackModelId),
    ...(api === 'openai-completions'
      ? {
          compat: buildOpenAICompat(resolved.model)
        }
      : {})
  } as PiModel;
}

function resolveThinkingLevel(req: ChatRequest): PiThinkingLevel | undefined {
  const raw = String(req.extras?.reasoning || req.extras?.thinking || '')
    .trim()
    .toLowerCase();
  if (!raw) return undefined;

  switch (raw) {
    case 'minimal':
    case 'low':
    case 'medium':
    case 'high':
    case 'xhigh':
      return raw;
    default:
      return undefined;
  }
}

function buildSimpleOptions(resolved: ResolvedPiRequest, signal?: AbortSignal): PiSimpleStreamOptions {
  const headers = buildModelHeaders(resolved.model);
  const reasoning = resolveThinkingLevel(resolved.request);

  return {
    ...(resolved.model.apiKey ? { apiKey: resolved.model.apiKey } : {}),
    ...(headers ? { headers } : {}),
    ...(resolved.request.conversationId ? { sessionId: resolved.request.conversationId } : {}),
    ...(typeof resolved.request.maxTokens === 'number' ? { maxTokens: resolved.request.maxTokens } : {}),
    ...(typeof resolved.request.temperature === 'number' ? { temperature: resolved.request.temperature } : {}),
    ...(reasoning ? { reasoning } : {}),
    ...(signal ? { signal } : {})
  };
}

function createPromptContext(prompt: string): { messages: Array<{ content: string; role: 'user'; timestamp: number }> } {
  return {
    messages: [
      {
        content: prompt,
        role: 'user',
        timestamp: Date.now()
      }
    ]
  };
}

export async function createPiTaskChatRuntime(resolved: ResolvedPiRequest): Promise<{ chatFn: PiTaskChatFunction; modelId: string }> {
  const ai = await loadPiAi();
  const model = await buildPiModel(ai, resolved);

  return {
    chatFn: async (prompt, onEvent, abortSignal) => {
      try {
        const stream = ai.streamSimple(model, createPromptContext(prompt) as any, buildSimpleOptions(resolved, abortSignal));

        for await (const event of stream) {
          switch (event.type) {
            case 'text_delta':
              onEvent({
                type: 'delta',
                data: { text: event.delta }
              });
              break;
            case 'done':
              onEvent({ type: 'message_completed' });
              return;
            case 'error':
              onEvent({
                type: 'error',
                data: { message: event.error.errorMessage || 'Pi task execution failed' }
              });
              return;
            default:
              break;
          }
        }

        onEvent({ type: 'message_completed' });
      } catch (error: any) {
        onEvent({
          type: 'error',
          data: { message: error?.message || 'Pi task execution failed' }
        });
      }
    },
    modelId: model.id
  };
}

export async function createPiTaskChatRuntimeFromRequest(request: CreatePiTaskRuntimeRequest): Promise<{ chatFn: PiTaskChatFunction; modelId: string; resolved: ResolvedPiRequest }> {
  const resolved = await resolvePiRequest({
    agentId: request.agentId || 'chat',
    extras: {
      ...(request.extras || {}),
      ...(request.model ? { model: request.model } : {}),
      runtime: 'pi'
    },
    maxTokens: request.maxTokens,
    messages: [],
    persist: false,
    providerId: request.providerId,
    providerInstanceId: request.providerInstanceId,
    temperature: request.temperature
  });
  const runtime = await createPiTaskChatRuntime(resolved);

  return {
    ...runtime,
    resolved
  };
}
