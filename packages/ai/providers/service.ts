import type { ProviderAdapter, ProviderCapabilities, ProviderCapabilityKey, ProviderConfig, ProviderDefaultModels } from '../types';
import { BUILTIN_PROVIDER_DEFINITIONS } from './builtins';
import type { ProviderModelDefinition } from './model-types';
import { getRegisteredProviderAliases, getRegisteredProviderDefinition, listRegisteredProviderDefinitions, registerProviderDefinition } from './registry';
import type { BuiltinProviderDefinition, BuiltinProviderId, ProviderDefinition } from './types';
import { isBuiltinProviderDefinition } from './types';

let builtinDefinitionsRegistered = false;
type ProviderCapabilitySource = Pick<ProviderAdapter, 'chat' | 'embed' | 'generateMusic' | 'getCapabilities' | 'getDefaultModels' | 'listModels' | 'transcribe'> & { id?: string };

export interface ProviderRuntimeModelInfo {
  id: string;
  label?: string;
  type?: 'chat' | 'embedding' | 'audio' | 'image' | 'tooling' | 'video' | 'vision' | string;
  context?: number;
  pricing?: {
    prompt?: number;
    completion?: number;
    unit?: '1K tokens' | '1M tokens' | string;
    currency?: 'USD' | 'CNY' | string;
  };
  capabilities?: Record<string, boolean>;
  tags?: string[];
  description?: string;
  [k: string]: any;
}

function ensureBuiltinDefinitionsRegistered(): void {
  if (builtinDefinitionsRegistered) return;

  for (const definition of BUILTIN_PROVIDER_DEFINITIONS) {
    registerProviderDefinition(definition);
  }

  builtinDefinitionsRegistered = true;
}

export function registerBuiltinProviderDefinitions(): void {
  ensureBuiltinDefinitionsRegistered();
}

export function listProviderDefinitions(): ProviderDefinition[] {
  ensureBuiltinDefinitionsRegistered();
  return listRegisteredProviderDefinitions();
}

export function getProviderDefinition(providerId?: string): ProviderDefinition | undefined {
  ensureBuiltinDefinitionsRegistered();
  return getRegisteredProviderDefinition(providerId);
}

export function listProviderDefinitionAliases(providerId?: string): string[] {
  ensureBuiltinDefinitionsRegistered();
  return getRegisteredProviderAliases(providerId);
}

function normalizeProviderId(providerId?: string): string {
  return String(providerId || '')
    .trim()
    .toLowerCase();
}

function cloneProviderModelDefinition(model: ProviderModelDefinition, providerId?: string): ProviderModelDefinition {
  return {
    ...model,
    ...(providerId ? { providerId } : {}),
    ...(model.abilities ? { abilities: { ...model.abilities } } : {}),
    ...(model.pricing ? { pricing: { ...model.pricing } } : {}),
    ...(model.settings ? { settings: { ...model.settings } } : {}),
    ...(model.tags ? { tags: [...model.tags] } : {})
  };
}

function cloneProviderConfigField(field: ProviderConfig['fields'][number]): ProviderConfig['fields'][number] {
  return {
    ...field,
    ...(field.options ? { options: field.options.map((option) => ({ ...option })) } : {})
  };
}

function dedupeProviderModels<T extends ProviderModelDefinition>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const id = String(item?.id || '').trim();
    if (!id) continue;

    const providerId = String(item?.providerId || '').trim();
    const key = providerId ? `${providerId}::${id}` : id;
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(item);
  }

  return result;
}

function getExplicitProviderModels(definition: ProviderDefinition): ProviderModelDefinition[] {
  const items = definition.models?.items || [];
  return dedupeProviderModels(items.map((model) => cloneProviderModelDefinition(model, definition.id)));
}

function listModelsForDefinition(definition: ProviderDefinition): ProviderModelDefinition[] {
  return getExplicitProviderModels(definition);
}

function resolveRuntimeModelType(providerId: string, model: ProviderModelDefinition): ProviderRuntimeModelInfo['type'] {
  const rawType = String(model.type || 'chat')
    .trim()
    .toLowerCase();

  if (rawType === 'stt' || rawType === 'tts') {
    return 'audio';
  }

  if ((providerId === 'qwen' || providerId === 'zhipu') && rawType === 'chat' && model.abilities?.vision) {
    return 'vision';
  }

  return rawType || 'chat';
}

function resolveRuntimeModelCapabilities(providerId: string, model: ProviderModelDefinition): ProviderRuntimeModelInfo['capabilities'] {
  const capabilities: Record<string, boolean> = {};
  const type = resolveRuntimeModelType(providerId, model);

  if (model.abilities?.vision) capabilities.vision = true;
  if (model.abilities?.functionCall) capabilities.function_call = true;
  if (model.abilities?.reasoning) capabilities.reasoning = true;
  if (model.abilities?.search) capabilities.search = true;
  if (model.abilities?.video) capabilities.video = true;
  if (model.abilities?.files) capabilities.files = true;
  if (model.abilities?.imageOutput) capabilities.imageOutput = true;
  if (model.abilities?.structuredOutput) capabilities.json = true;
  if (type === 'image') capabilities.image_generation = true;
  if (type === 'text2music') capabilities.music_generation = true;
  if (
    String(model.type || '')
      .trim()
      .toLowerCase() === 'stt'
  ) {
    capabilities.asr = true;
    capabilities.transcribe = true;
  }

  return Object.keys(capabilities).length > 0 ? capabilities : undefined;
}

function resolveRuntimeModelPricing(model: ProviderModelDefinition): ProviderRuntimeModelInfo['pricing'] {
  const pricing = model.pricing as Record<string, any> | undefined;
  if (!pricing || Array.isArray(pricing) || typeof pricing !== 'object') {
    return undefined;
  }

  const prompt = typeof pricing.input === 'number' ? pricing.input : undefined;
  const completion = typeof pricing.output === 'number' ? pricing.output : undefined;
  if (prompt == null && completion == null) {
    return undefined;
  }

  return {
    prompt,
    completion,
    unit: typeof pricing.unit === 'string' ? pricing.unit : '1M tokens',
    currency: typeof pricing.currency === 'string' ? pricing.currency : 'USD'
  };
}

function toProviderRuntimeModelInfo(providerId: string, model: ProviderModelDefinition): ProviderRuntimeModelInfo {
  return {
    ...model,
    id: model.id,
    label: model.displayName || model.id,
    type: resolveRuntimeModelType(providerId, model),
    context: model.contextWindowTokens,
    pricing: resolveRuntimeModelPricing(model),
    capabilities: resolveRuntimeModelCapabilities(providerId, model),
    tags: model.tags || [],
    description: model.description
  };
}

export function getProviderDefinitionSchema(providerId?: string): ProviderConfig | undefined {
  return getProviderDefinition(providerId)?.schema;
}

export function listProviderConfigFields(providerId?: string): ProviderConfig['fields'] {
  return (getProviderDefinitionSchema(providerId)?.fields || []).map(cloneProviderConfigField);
}

export function listProviderSecretKeys(providerId?: string): string[] {
  return listProviderConfigFields(providerId).map((field) => field.key);
}

export function listRequiredProviderSecretKeys(providerId?: string): string[] {
  return listProviderConfigFields(providerId)
    .filter((field) => field.required)
    .map((field) => field.key);
}

function getProviderDefinitionDefaultModels(providerId?: string): ProviderDefaultModels | undefined {
  return getProviderDefinition(providerId)?.defaults.models;
}

export function getProviderDefinitionDefaultModel(providerId: string | undefined, capability: keyof ProviderDefaultModels, fallbackProviderId = 'openai'): string | undefined {
  return getProviderDefinitionDefaultModels(providerId)?.[capability] || getProviderDefinitionDefaultModels(fallbackProviderId)?.[capability];
}

export function getProviderDefinitionPiBaseUrl(providerId?: string, fallbackProviderId?: string): string | undefined {
  const definition = getProviderDefinition(providerId);
  if (definition?.protocol.piBaseUrl) return definition.protocol.piBaseUrl;
  if (definition?.protocol.baseUrl) return definition.protocol.baseUrl;

  if (!fallbackProviderId) return undefined;
  const fallbackDefinition = getProviderDefinition(fallbackProviderId);
  return fallbackDefinition?.protocol.piBaseUrl || fallbackDefinition?.protocol.baseUrl;
}

export function getProviderDefinitionModel(providerId?: string, modelId?: string): ProviderModelDefinition | undefined {
  const definition = getProviderDefinition(providerId);
  const normalizedModelId = normalizeProviderId(modelId);
  if (!definition || !normalizedModelId) {
    return undefined;
  }

  return listModelsForDefinition(definition).find((model) => normalizeProviderId(model.id) === normalizedModelId);
}

export function toCanonicalProviderId(providerId?: string): string {
  const normalized = normalizeProviderId(providerId);
  if (!normalized) return 'openai';
  return getProviderDefinition(normalized)?.id || normalized;
}

export function getProviderAliases(canonicalProviderId: string): string[] {
  const normalized = normalizeProviderId(canonicalProviderId);
  if (!normalized) return ['openai'];

  const aliases = listProviderDefinitionAliases(normalized);
  if (aliases.length > 0) {
    return aliases;
  }

  return [toCanonicalProviderId(normalized)];
}

function isSameProviderId(left?: string, right?: string): boolean {
  return toCanonicalProviderId(left) === toCanonicalProviderId(right);
}

export function resolveKnownProviderId(providerId: string, knownProviderIds: string[]): string {
  const canonicalId = toCanonicalProviderId(providerId);
  const exact = knownProviderIds.find((id) => id === providerId);
  if (exact) return exact;

  const matched = knownProviderIds.find((id) => isSameProviderId(id, canonicalId));
  return matched || canonicalId;
}

function createProviderCapabilities(capabilities?: Partial<ProviderCapabilities>): ProviderCapabilities {
  return {
    chat: true,
    embeddings: false,
    imageGeneration: false,
    modelListing: true,
    musicGeneration: false,
    transcribe: false,
    ...capabilities
  };
}

export function getProviderCapabilities(providerId?: string, provider?: ProviderCapabilitySource): ProviderCapabilities {
  const definition = getProviderDefinition(providerId || provider?.id);
  const providerCapabilities = provider?.getCapabilities?.();
  const definitionCapabilities = definition ? createProviderCapabilities(definition.capabilities) : undefined;

  return {
    chat: providerCapabilities?.chat ?? definitionCapabilities?.chat ?? Boolean(provider?.chat),
    embeddings: providerCapabilities?.embeddings ?? definitionCapabilities?.embeddings ?? Boolean(provider?.embed),
    imageGeneration: providerCapabilities?.imageGeneration ?? definitionCapabilities?.imageGeneration ?? false,
    modelListing: providerCapabilities?.modelListing ?? definitionCapabilities?.modelListing ?? Boolean(provider?.listModels),
    musicGeneration: providerCapabilities?.musicGeneration ?? definitionCapabilities?.musicGeneration ?? Boolean(provider?.generateMusic),
    transcribe: providerCapabilities?.transcribe ?? definitionCapabilities?.transcribe ?? Boolean(provider?.transcribe)
  };
}

export function supportsProviderCapability(providerId: string | undefined, capability: ProviderCapabilityKey, provider?: ProviderCapabilitySource): boolean {
  return Boolean(getProviderCapabilities(providerId, provider)[capability]);
}

export function getProviderDefaultModels(providerId?: string, provider?: ProviderCapabilitySource): ProviderDefaultModels {
  const providerDefaults = provider?.getDefaultModels?.();
  const defaultModels = getProviderDefinitionDefaultModels(providerId || provider?.id);

  return {
    chat: providerDefaults?.chat || defaultModels?.chat,
    embeddings: providerDefaults?.embeddings ?? defaultModels?.embeddings,
    imageGeneration: providerDefaults?.imageGeneration ?? defaultModels?.imageGeneration,
    musicGeneration: providerDefaults?.musicGeneration ?? defaultModels?.musicGeneration,
    transcribe: providerDefaults?.transcribe ?? defaultModels?.transcribe
  };
}

function getBuiltinProviderDefinition(providerId?: string): BuiltinProviderDefinition | undefined {
  const definition = getProviderDefinition(providerId);
  return definition && isBuiltinProviderDefinition(definition) ? definition : undefined;
}

export function getBuiltinProviderDefinitionOrThrow(providerId: BuiltinProviderId): BuiltinProviderDefinition {
  const definition = getBuiltinProviderDefinition(providerId);
  if (!definition) {
    throw new Error(`Missing built-in provider definition: ${providerId}`);
  }
  return definition;
}

export async function listProviderRuntimeModels(providerId: string): Promise<ProviderRuntimeModelInfo[]> {
  const providerModels = await listProviderDefinitionModels(providerId);
  return providerModels.map((model) => toProviderRuntimeModelInfo(providerId, model));
}

export async function listProviderDefinitionModels(providerId?: string): Promise<ProviderModelDefinition[]> {
  if (providerId) {
    const definition = getProviderDefinition(providerId);
    return definition ? listModelsForDefinition(definition) : [];
  }

  const definitions = listProviderDefinitions();
  const models = await Promise.all(definitions.map((definition) => listModelsForDefinition(definition)));
  return models.flat();
}

export function getRequiredBuiltinProviderDefaultModel(providerId: BuiltinProviderId, capability: keyof ProviderDefaultModels): string {
  const definition = getBuiltinProviderDefinitionOrThrow(providerId);
  const model = definition.defaults.models[capability];
  if (!model) {
    throw new Error(`Missing default ${capability} model for built-in provider: ${providerId}`);
  }
  return model;
}
