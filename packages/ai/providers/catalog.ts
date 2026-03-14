import { registerProvider } from '../registry';
import type { ProviderAdapter } from '../types';
import { AnthropicProvider } from './anthropic';
import { DeepSeekProvider } from './deepseek';
import { GeminiProvider } from './gemini';
import { type BuiltinProviderId, type BuiltinProviderMetadata, listBuiltinProviderMetadata } from './metadata';
import { OllamaProvider } from './ollama';
import { OpenAIProvider } from './openai';
import { QwenProvider } from './qwen';
import { ZhipuProvider } from './zhipu';

export interface BuiltinProviderDefinition extends BuiltinProviderMetadata {
  create: () => ProviderAdapter;
}

const BUILTIN_PROVIDER_FACTORIES: Record<BuiltinProviderId, () => ProviderAdapter> = {
  anthropic: () => new AnthropicProvider(),
  deepseek: () => new DeepSeekProvider(),
  gemini: () => new GeminiProvider(),
  ollama: () => new OllamaProvider(),
  openai: () => new OpenAIProvider(),
  qwen: () => new QwenProvider(),
  zhipu: () => new ZhipuProvider()
};

export function listBuiltinProviderDefinitions(): BuiltinProviderDefinition[] {
  return listBuiltinProviderMetadata().map((metadata) => ({
    ...metadata,
    create: BUILTIN_PROVIDER_FACTORIES[metadata.id]
  }));
}

export function registerBuiltInProviders(): void {
  for (const definition of listBuiltinProviderDefinitions()) {
    registerProvider(definition.create());
  }
}
