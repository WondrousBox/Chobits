import type { ProviderConfig } from '../../../types';
import type { BuiltinProviderDefinition } from '../../types';
import kimiModels from './models';

const kimiSchema: ProviderConfig = {
  id: 'kimi',
  label: 'Kimi',
  enabled: true,
  icon: 'providers/icons/kimi-color.svg',
  locales: {
    en: {
      label: 'Kimi',
      fields: {
        apiKey: 'API Key',
        baseUrl: 'Base URL'
      }
    },
    'zh-CN': {
      label: 'Kimi',
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

export const kimiDefinition: BuiltinProviderDefinition = {
  id: 'kimi',
  aliases: ['kimi', 'moonshot'],
  source: 'builtin',
  display: {
    label: 'Kimi',
    description: "Kimi is Moonshot AI's OpenAI-compatible model family; the flagship Kimi K3 offers a 1M-token context window, while Kimi K2.7 Code targets coding agent scenarios.",
    icon: 'providers/icons/kimi-color.svg',
    website: 'https://platform.kimi.com'
  },
  catalog: {
    name: 'Kimi',
    checkModel: 'kimi-k3',
    modelsUrl: 'https://platform.kimi.com/docs/overview',
    settings: {
      proxyUrl: {
        placeholder: 'https://api.moonshot.cn/v1'
      },
      sdkType: 'openai',
      showModelFetcher: true
    }
  },
  protocol: {
    kind: 'openai-compatible',
    baseUrl: 'https://api.moonshot.cn/v1',
    piBaseUrl: 'https://api.moonshot.cn/v1'
  },
  capabilities: {
    chat: true,
    embeddings: false,
    imageGeneration: false,
    modelListing: true,
    musicGeneration: false,
    speechSynthesis: false,
    transcribe: false
  },
  defaults: {
    models: {
      chat: 'kimi-k3'
    }
  },
  models: {
    strategy: 'builtin',
    items: kimiModels
  },
  schema: kimiSchema
};
