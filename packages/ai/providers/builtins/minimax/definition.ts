import type { ProviderConfig } from '../../../types';
import type { BuiltinProviderDefinition } from '../../types';
import minimaxModels from './models';

const minimaxSchema: ProviderConfig = {
  id: 'minimax',
  label: 'MiniMax Token Plan',
  enabled: true,
  icon: 'providers/icons/minimax-color.svg',
  locales: {
    en: {
      label: 'MiniMax Token Plan',
      fields: {
        apiKey: 'API Key',
        baseUrl: 'Base URL'
      }
    },
    'zh-CN': {
      label: 'MiniMax Token Plan',
      fields: {
        apiKey: 'API Key',
        baseUrl: 'Base URL'
      }
    }
  },
  fields: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    { key: 'baseUrl', label: 'Base URL (可选)', type: 'text' }
  ]
};

export const minimaxDefinition: BuiltinProviderDefinition = {
  id: 'minimax',
  aliases: ['minimax', 'minimaxi'],
  source: 'builtin',
  display: {
    label: 'MiniMax Token Plan',
    description: 'MiniMax Token Plan 提供全模态覆盖的订阅服务，搭载最新 MiniMax-M3 模型，兼容 OpenAI 和 Anthropic 接口协议。',
    icon: 'providers/icons/minimax-color.svg',
    website: 'https://platform.minimaxi.com'
  },
  catalog: {
    name: 'MiniMax',
    checkModel: 'MiniMax-M3',
    modelsUrl: 'https://platform.minimaxi.com/docs/guides/text-generation#chat',
    settings: {
      proxyUrl: {
        placeholder: 'https://api.minimaxi.com/v1'
      },
      sdkType: 'openai',
      showModelFetcher: false
    }
  },
  protocol: {
    kind: 'openai-compatible',
    baseUrl: 'https://api.minimaxi.com/v1',
    piBaseUrl: 'https://api.minimaxi.com/anthropic'
  },
  capabilities: {
    chat: true,
    embeddings: false,
    imageGeneration: false,
    modelListing: true,
    musicGeneration: true,
    speechSynthesis: true,
    transcribe: false
  },
  defaults: {
    models: {
      chat: 'MiniMax-M3',
      musicGeneration: 'music-2.6',
      speechSynthesis: 'speech-2.8-turbo'
    }
  },
  models: {
    strategy: 'builtin',
    items: minimaxModels
  },
  schema: minimaxSchema
};
