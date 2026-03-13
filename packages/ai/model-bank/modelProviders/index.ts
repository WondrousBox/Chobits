import { type ModelProviderCard } from '../types/llm';
import AnthropicProvider from './anthropic';
import DeepSeekProvider from './deepseek';
import GoogleProvider from './google';
import OllamaProvider from './ollama';
import OpenAIProvider from './openai';
import QwenProvider from './qwen';
import ZhiPuProvider from './zhipu';

export const DEFAULT_MODEL_PROVIDER_LIST: ModelProviderCard[] = [
  OpenAIProvider,
  AnthropicProvider,
  GoogleProvider,
  DeepSeekProvider,
  QwenProvider,
  ZhiPuProvider,
  OllamaProvider,
];

export const filterEnabledModels = (provider: ModelProviderCard) => {
  return provider.chatModels.filter((v) => v.enabled).map((m) => m.id);
};

export const isProviderDisableBrowserRequest = (id: string) => {
  const provider = DEFAULT_MODEL_PROVIDER_LIST.find((v) => v.id === id && v.disableBrowserRequest);
  return !!provider;
};

export { default as AnthropicProviderCard } from './anthropic';
export { default as DeepSeekProviderCard } from './deepseek';
export { default as GoogleProviderCard } from './google';
export { default as OllamaProviderCard } from './ollama';
export { default as OpenAIProviderCard } from './openai';
export { default as QwenProviderCard } from './qwen';
export { default as ZhiPuProviderCard } from './zhipu';
