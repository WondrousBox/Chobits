import type { ProviderConfig } from '../../../types';
import type { BuiltinProviderDefinition } from '../../types';
import openaiModels from './models';

const openaiSchema: ProviderConfig = {
  id: 'openai',
  label: 'OpenAI',
  enabled: true,
  icon: 'providers/icons/openai.svg',
  locales: {
    en: {
      label: 'OpenAI',
      fields: {
        apiKey: 'API Key',
        baseUrl: 'Base URL (optional)'
      }
    },
    'zh-CN': {
      label: 'OpenAI',
      fields: {
        apiKey: 'API Key',
        baseUrl: 'Base URL（可选，自定义网关）'
      }
    }
  },
  fields: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    { key: 'baseUrl', label: 'Base URL (可选，自定义网关)', type: 'text' }
  ]
};

export const openaiDefinition: BuiltinProviderDefinition = {
  id: 'openai',
  aliases: ['openai'],
  source: 'builtin',
  display: {
    label: 'OpenAI',
    description:
      'OpenAI is a leading AI research lab whose GPT models advanced natural language processing, delivering high performance and strong value across research, business, and innovation.',
    icon: 'providers/icons/openai.svg',
    website: 'https://openai.com'
  },
  catalog: {
    name: 'OpenAI',
    apiKeyUrl: 'https://platform.openai.com/api-keys?utm_source=lobehub',
    checkModel: 'gpt-5-nano',
    modelsUrl: 'https://platform.openai.com/docs/models',
    enabled: true,
    settings: {
      responseAnimation: 'smooth',
      showModelFetcher: true,
      supportResponsesApi: true
    }
  },
  protocol: {
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    piBaseUrl: 'https://api.openai.com/v1'
  },
  capabilities: {
    chat: true,
    embeddings: true,
    imageGeneration: true,
    modelListing: true,
    transcribe: true
  },
  defaults: {
    models: {
      chat: 'gpt-4o-mini',
      embeddings: 'text-embedding-3-small',
      imageGeneration: 'gpt-image-1',
      transcribe: 'gpt-4o-mini-transcribe'
    }
  },
  models: {
    strategy: 'builtin',
    items: openaiModels
  },
  schema: openaiSchema
};
