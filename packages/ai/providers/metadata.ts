import { toCanonicalProviderId } from '../runtime/pi/provider-alias';
import type { ProviderAdapter, ProviderCapabilities, ProviderCapabilityKey, ProviderDefaultModels } from '../types';

export type BuiltinProviderId = 'anthropic' | 'deepseek' | 'gemini' | 'ollama' | 'openai' | 'qwen' | 'zhipu';

export type BuiltinProviderKind = 'anthropic' | 'gemini' | 'ollama' | 'openai' | 'openai-compatible';

type BuiltinProviderDefaultModels = ProviderDefaultModels & { chat: string };
type ProviderCapabilitySource = Pick<ProviderAdapter, 'chat' | 'embed' | 'getCapabilities' | 'getDefaultModels' | 'listModels' | 'transcribe'> & { id?: string };

export interface BuiltinProviderMetadata {
  id: BuiltinProviderId;
  kind: BuiltinProviderKind;
  label: string;
  capabilities: ProviderCapabilities;
  defaultModel: string;
  defaultModels: BuiltinProviderDefaultModels;
  providerBaseUrl?: string;
  piBaseUrl?: string;
}

function createProviderCapabilities(capabilities?: Partial<ProviderCapabilities>): ProviderCapabilities {
  return {
    chat: true,
    embeddings: false,
    imageGeneration: false,
    modelListing: true,
    transcribe: false,
    ...capabilities
  };
}

function defineBuiltinProviderMetadata(
  metadata: Omit<BuiltinProviderMetadata, 'capabilities' | 'defaultModel'> & {
    capabilities?: Partial<ProviderCapabilities>;
    defaultModels: BuiltinProviderDefaultModels;
  }
): BuiltinProviderMetadata {
  return {
    ...metadata,
    capabilities: createProviderCapabilities(metadata.capabilities),
    defaultModel: metadata.defaultModels.chat
  };
}

const BUILTIN_PROVIDER_METADATA: Record<BuiltinProviderId, BuiltinProviderMetadata> = {
  anthropic: defineBuiltinProviderMetadata({
    id: 'anthropic',
    kind: 'anthropic',
    label: 'Anthropic (Claude)',
    capabilities: {},
    defaultModels: {
      chat: 'claude-3-5-sonnet-20241022'
    },
    providerBaseUrl: 'https://api.anthropic.com',
    piBaseUrl: 'https://api.anthropic.com'
  }),
  deepseek: defineBuiltinProviderMetadata({
    id: 'deepseek',
    kind: 'openai-compatible',
    label: 'DeepSeek',
    capabilities: {
      embeddings: false
    },
    defaultModels: {
      chat: 'deepseek-chat'
    },
    providerBaseUrl: 'https://api.deepseek.com',
    piBaseUrl: 'https://api.deepseek.com'
  }),
  gemini: defineBuiltinProviderMetadata({
    id: 'gemini',
    kind: 'gemini',
    label: 'Google Gemini',
    capabilities: {},
    defaultModels: {
      chat: 'gemini-1.5-flash'
    },
    piBaseUrl: 'https://generativelanguage.googleapis.com/v1beta'
  }),
  ollama: defineBuiltinProviderMetadata({
    id: 'ollama',
    kind: 'ollama',
    label: 'Ollama (local)',
    capabilities: {
      embeddings: true
    },
    defaultModels: {
      chat: 'llama3.1',
      embeddings: 'nomic-embed-text'
    },
    providerBaseUrl: 'http://127.0.0.1:11434',
    piBaseUrl: 'http://127.0.0.1:11434/v1'
  }),
  openai: defineBuiltinProviderMetadata({
    id: 'openai',
    kind: 'openai',
    label: 'OpenAI',
    capabilities: {
      embeddings: true,
      imageGeneration: true,
      transcribe: true
    },
    defaultModels: {
      chat: 'gpt-4o-mini',
      embeddings: 'text-embedding-3-small',
      imageGeneration: 'gpt-image-1',
      transcribe: 'gpt-4o-mini-transcribe'
    },
    providerBaseUrl: 'https://api.openai.com/v1',
    piBaseUrl: 'https://api.openai.com/v1'
  }),
  qwen: defineBuiltinProviderMetadata({
    id: 'qwen',
    kind: 'openai-compatible',
    label: '通义千问 (Qwen)',
    capabilities: {
      embeddings: true
    },
    defaultModels: {
      chat: 'qwen2.5',
      embeddings: 'text-embedding-v4'
    },
    providerBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    piBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  }),
  zhipu: defineBuiltinProviderMetadata({
    id: 'zhipu',
    kind: 'openai-compatible',
    label: '智谱 (GLM)',
    capabilities: {
      embeddings: true,
      imageGeneration: true,
      transcribe: true
    },
    defaultModels: {
      chat: 'glm-4-flash',
      embeddings: 'embedding-3',
      imageGeneration: 'cogview-3-flash',
      transcribe: 'glm-asr'
    },
    providerBaseUrl: 'https://open.bigmodel.cn/api/paas/v4/',
    piBaseUrl: 'https://open.bigmodel.cn/api/paas/v4/'
  })
};

export function getBuiltinProviderMetadata(providerId?: string): BuiltinProviderMetadata | undefined {
  const canonicalId = toCanonicalProviderId(providerId) as BuiltinProviderId;
  return BUILTIN_PROVIDER_METADATA[canonicalId];
}

export function getProviderCapabilities(providerId?: string, provider?: ProviderCapabilitySource): ProviderCapabilities {
  const metadata = getBuiltinProviderMetadata(providerId || provider?.id);
  const providerCapabilities = provider?.getCapabilities?.();

  return {
    chat: providerCapabilities?.chat ?? metadata?.capabilities.chat ?? Boolean(provider?.chat),
    embeddings: providerCapabilities?.embeddings ?? metadata?.capabilities.embeddings ?? Boolean(provider?.embed),
    imageGeneration: providerCapabilities?.imageGeneration ?? metadata?.capabilities.imageGeneration ?? false,
    modelListing: providerCapabilities?.modelListing ?? metadata?.capabilities.modelListing ?? Boolean(provider?.listModels),
    transcribe: providerCapabilities?.transcribe ?? metadata?.capabilities.transcribe ?? Boolean(provider?.transcribe)
  };
}

export function supportsProviderCapability(providerId: string | undefined, capability: ProviderCapabilityKey, provider?: ProviderCapabilitySource): boolean {
  return Boolean(getProviderCapabilities(providerId, provider)[capability]);
}

export function getProviderDefaultModels(providerId?: string, provider?: ProviderCapabilitySource): ProviderDefaultModels {
  const metadata = getBuiltinProviderMetadata(providerId || provider?.id);
  const providerDefaults = provider?.getDefaultModels?.();

  return {
    chat: providerDefaults?.chat || metadata?.defaultModels.chat || metadata?.defaultModel,
    embeddings: providerDefaults?.embeddings ?? metadata?.defaultModels.embeddings,
    imageGeneration: providerDefaults?.imageGeneration ?? metadata?.defaultModels.imageGeneration,
    transcribe: providerDefaults?.transcribe ?? metadata?.defaultModels.transcribe
  };
}

export function listBuiltinProviderMetadata(): BuiltinProviderMetadata[] {
  return Object.values(BUILTIN_PROVIDER_METADATA).map((metadata) => ({ ...metadata }));
}
