import { registerProvider } from '../registry';
import type { ProviderAdapter } from '../types';
import { AnthropicProvider } from './anthropic';
import { DeepSeekProvider } from './deepseek';
import { GeminiProvider } from './gemini';
import { GPTeamProvider } from './gpteam';
import { KimiProvider } from './kimi';
import { MiniMaxProvider } from './minimax';
import { OllamaProvider } from './ollama';
import { OpenAIProvider } from './openai';
import { QwenProvider } from './qwen';
import type { BuiltinProviderId } from './types';
import { ZaiProvider } from './zai';
import { ZhipuProvider } from './zhipu';

const BUILTIN_PROVIDER_FACTORIES: Record<BuiltinProviderId, () => ProviderAdapter> = {
  anthropic: () => new AnthropicProvider(),
  deepseek: () => new DeepSeekProvider(),
  gemini: () => new GeminiProvider(),
  gpteam: () => new GPTeamProvider(),
  kimi: () => new KimiProvider(),
  minimax: () => new MiniMaxProvider(),
  ollama: () => new OllamaProvider(),
  openai: () => new OpenAIProvider(),
  qwen: () => new QwenProvider(),
  zai: () => new ZaiProvider(),
  zhipu: () => new ZhipuProvider()
};

const BUILTIN_PROVIDER_ORDER: BuiltinProviderId[] = ['anthropic', 'deepseek', 'gemini', 'gpteam', 'kimi', 'minimax', 'ollama', 'openai', 'qwen', 'zai', 'zhipu'];

export function registerBuiltInProviders(): void {
  for (const providerId of BUILTIN_PROVIDER_ORDER) {
    registerProvider(BUILTIN_PROVIDER_FACTORIES[providerId]());
  }
}
