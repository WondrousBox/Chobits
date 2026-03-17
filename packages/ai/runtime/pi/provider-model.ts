import {
  getProviderDefinition,
  getProviderDefinitionDefaultModel,
  getProviderDefinitionPiBaseUrl
} from '../../providers/service';
import type { ResolvedPiModelConfig, ResolvedPiRequest } from './contracts';

type PiAiModule = typeof import('@mariozechner/pi-ai');
type PiApi = import('@mariozechner/pi-ai').Api;
type PiKnownProvider = import('@mariozechner/pi-ai').KnownProvider;
type PiModel = import('@mariozechner/pi-ai').Model<PiApi>;
type PiOpenAICompletionsCompat = import('@mariozechner/pi-ai').OpenAICompletionsCompat;

export function sanitizePiBaseUrl(baseUrl?: string): string | undefined {
  const trimmed = baseUrl?.trim();
  return trimmed ? trimmed.replace(/\/+$/, '') : undefined;
}

export function resolvePiFallbackModelId(providerId: string, modelId?: string): string {
  const trimmed = modelId?.trim();
  if (trimmed) return trimmed;
  return getProviderDefinitionDefaultModel(providerId, 'chat') || 'gpt-4o-mini';
}

export function resolvePiFallbackBaseUrl(model: ResolvedPiModelConfig): string {
  const baseUrl = sanitizePiBaseUrl(model.baseUrl);
  if (baseUrl) return baseUrl;

  return sanitizePiBaseUrl(getProviderDefinitionPiBaseUrl(model.canonicalProviderId, 'openai')) || 'https://api.openai.com/v1';
}

export function inferPiReasoningCapability(modelId: string): boolean {
  return /gpt-5|^o[134]|reason|thinking|claude.*4|gemini-2\.5/i.test(modelId);
}

export function resolvePiApi(model: ResolvedPiModelConfig): PiApi {
  const protocolKind = getProviderDefinition(model.canonicalProviderId)?.protocol.kind;

  switch (protocolKind) {
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

export function resolvePiBuiltinProvider(model: ResolvedPiModelConfig): PiKnownProvider | undefined {
  const protocolKind = getProviderDefinition(model.canonicalProviderId)?.protocol.kind;

  switch (protocolKind) {
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

export function buildPiOpenAICompat(model: ResolvedPiModelConfig): PiOpenAICompletionsCompat | undefined {
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

export function buildPiModelHeaders(model: ResolvedPiModelConfig): Record<string, string> | undefined {
  if (model.canonicalProviderId !== 'openai') return undefined;

  const organization = model.secrets.organization?.trim();
  if (!organization) return undefined;

  return {
    'OpenAI-Organization': organization
  };
}

export async function buildPiModel(ai: PiAiModule, resolved: ResolvedPiRequest): Promise<PiModel> {
  const fallbackModelId = resolvePiFallbackModelId(resolved.model.canonicalProviderId, resolved.model.modelId);
  const builtinProvider = resolvePiBuiltinProvider(resolved.model);

  if (builtinProvider) {
    const builtinModel = ai.getModel(builtinProvider as any, fallbackModelId as any);
    if (builtinModel) {
      const headers = buildPiModelHeaders(resolved.model);
      return {
        ...builtinModel,
        ...(headers ? { headers } : {}),
        baseUrl: sanitizePiBaseUrl(resolved.model.baseUrl) || builtinModel.baseUrl,
        maxTokens: resolved.request.maxTokens || builtinModel.maxTokens
      } as PiModel;
    }
  }

  const api = resolvePiApi(resolved.model);
  const headers = buildPiModelHeaders(resolved.model);

  return {
    api,
    baseUrl: resolvePiFallbackBaseUrl(resolved.model),
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
    reasoning: inferPiReasoningCapability(fallbackModelId),
    ...(api === 'openai-completions'
      ? {
          compat: buildPiOpenAICompat(resolved.model)
        }
      : {})
  } as PiModel;
}
