import type { ProviderConfig } from '../../../types';
import type { BuiltinProviderDefinition } from '../../types';
import anthropicModels from './models';

const anthropicSchema: ProviderConfig = {
  id: 'anthropic',
  label: 'Anthropic (Claude)',
  enabled: true,
  icon: 'providers/icons/anthropic.svg',
  locales: {
    en: {
      label: 'Anthropic (Claude)',
      fields: {
        apiKey: 'API Key',
        baseUrl: 'Base URL (optional)'
      }
    },
    'zh-CN': {
      label: 'Anthropic（Claude）',
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

export const anthropicDefinition: BuiltinProviderDefinition = {
  id: 'anthropic',
  aliases: ['anthropic'],
  source: 'builtin',
  display: {
    label: 'Anthropic (Claude)',
    description:
      'Anthropic builds advanced language models like Claude 3.5 Sonnet, Claude 3 Sonnet, Claude 3 Opus, and Claude 3 Haiku, balancing intelligence, speed, and cost for workloads from enterprise to rapid-response use cases.',
    icon: 'providers/icons/anthropic.svg',
    website: 'https://anthropic.com'
  },
  catalog: {
    name: 'Anthropic',
    checkModel: 'claude-3-haiku-20240307',
    modelsUrl: 'https://docs.anthropic.com/en/docs/about-claude/models#model-names',
    enabled: true,
    proxyUrl: {
      placeholder: 'https://api.anthropic.com'
    },
    settings: {
      proxyUrl: {
        placeholder: 'https://api.anthropic.com'
      },
      responseAnimation: 'smooth',
      sdkType: 'anthropic',
      showModelFetcher: true
    }
  },
  protocol: {
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    piBaseUrl: 'https://api.anthropic.com'
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
      chat: 'claude-3-5-sonnet-20241022'
    }
  },
  models: {
    strategy: 'builtin',
    items: anthropicModels
  },
  schema: anthropicSchema
};
