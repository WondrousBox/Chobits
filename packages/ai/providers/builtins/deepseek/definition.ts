import type { ProviderConfig } from '../../../types';
import type { BuiltinProviderDefinition } from '../../types';
import deepseekModels from './models';

const deepseekSchema: ProviderConfig = {
  id: 'deepseek',
  label: 'DeepSeek',
  enabled: true,
  icon: 'providers/icons/deepseek-color.svg',
  locales: {
    en: {
      label: 'DeepSeek',
      fields: {
        apiKey: 'API Key',
        baseUrl: 'Base URL'
      }
    },
    'zh-CN': {
      label: 'DeepSeek',
      fields: {
        apiKey: 'API Key',
        baseUrl: 'Base URL'
      }
    }
  },
  fields: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    { key: 'baseUrl', label: 'Base URL', type: 'text' }
  ]
};

export const deepseekDefinition: BuiltinProviderDefinition = {
  id: 'deepseek',
  aliases: ['deepseek'],
  source: 'builtin',
  display: {
    label: 'DeepSeek',
    description:
      'DeepSeek focuses on AI research and applications; its latest DeepSeek-V3 benchmarks surpass open models like Qwen2.5-72B and Llama-3.1-405B, aligning with leading closed models such as GPT-4o and Claude-3.5-Sonnet.',
    icon: 'providers/icons/deepseek-color.svg',
    website: 'https://deepseek.com'
  },
  catalog: {
    name: 'DeepSeek',
    checkModel: 'deepseek-chat',
    modelsUrl: 'https://platform.deepseek.com/api-docs/zh-cn/quick_start/pricing',
    settings: {
      proxyUrl: {
        placeholder: 'https://api.deepseek.com'
      },
      sdkType: 'openai',
      showModelFetcher: true
    }
  },
  protocol: {
    kind: 'openai-compatible',
    baseUrl: 'https://api.deepseek.com',
    piBaseUrl: 'https://api.deepseek.com'
  },
  capabilities: {
    chat: true,
    embeddings: false,
    imageGeneration: false,
    modelListing: true,
    transcribe: false
  },
  defaults: {
    models: {
      chat: 'deepseek-chat'
    }
  },
  models: {
    strategy: 'builtin',
    items: deepseekModels
  },
  schema: deepseekSchema
};
