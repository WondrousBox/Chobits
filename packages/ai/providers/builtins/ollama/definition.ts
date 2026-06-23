import type { ProviderConfig } from '../../../types';
import type { BuiltinProviderDefinition } from '../../types';
import ollamaModels from './models';

const ollamaSchema: ProviderConfig = {
  id: 'ollama',
  label: 'Ollama (local)',
  enabled: true,
  icon: 'providers/icons/ollama.svg',
  locales: {
    en: {
      label: 'Ollama (local)',
      fields: {
        baseUrl: 'Base URL'
      }
    },
    'zh-CN': {
      label: 'Ollama（本地）',
      fields: {
        baseUrl: 'Base URL'
      }
    }
  },
  fields: [
    { key: 'baseUrl', label: 'Base URL', type: 'text' }
  ]
};

export const ollamaDefinition: BuiltinProviderDefinition = {
  id: 'ollama',
  aliases: ['ollama'],
  source: 'builtin',
  display: {
    label: 'Ollama (local)',
    description:
      'Ollama offers models across code generation, math, multilingual processing, and chat, supporting both enterprise and local deployments.',
    icon: 'providers/icons/ollama.svg',
    website: 'https://ollama.com'
  },
  catalog: {
    name: 'Ollama',
    checkModel: 'deepseek-r1',
    modelsUrl: 'https://ollama.com/library',
    defaultShowBrowserRequest: true,
    showApiKey: false,
    settings: {
      defaultShowBrowserRequest: true,
      sdkType: 'ollama',
      showApiKey: false,
      showModelFetcher: true
    }
  },
  protocol: {
    kind: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    piBaseUrl: 'http://127.0.0.1:11434/v1'
  },
  capabilities: {
    chat: true,
    embeddings: true,
    imageGeneration: false,
    modelListing: true,
    musicGeneration: false,
    speechSynthesis: false,
    transcribe: false
  },
  defaults: {
    models: {
      chat: 'llama3.1',
      embeddings: 'nomic-embed-text'
    }
  },
  models: {
    strategy: 'builtin',
    items: ollamaModels
  },
  schema: ollamaSchema
};
