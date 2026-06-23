import type { ProviderConfig } from '../../../types';
import type { BuiltinProviderDefinition } from '../../types';
import gpteamModels from './models';

const gpteamSchema: ProviderConfig = {
  id: 'gpteam',
  label: 'GPTeam',
  enabled: true,
  icon: 'providers/icons/openai.svg',
  fields: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    { key: 'baseUrl', label: 'Base URL (可选，GPTeam 入口)', type: 'text' }
  ]
};

export const gpteamDefinition: BuiltinProviderDefinition = {
  id: 'gpteam',
  aliases: ['gpteam', 'gpteamservices'],
  source: 'builtin',
  display: {
    label: 'GPTeam',
    description: 'GPTeam provides OpenAI-compatible image generation and image editing through GPT image models.',
    icon: 'providers/icons/openai.svg',
    website: 'https://portal.gpteamservices.com'
  },
  catalog: {
    name: 'GPTeam',
    apiKeyUrl: 'https://portal.gpteamservices.com/portal/keys',
    checkModel: 'gpt-image-2',
    modelsUrl: 'https://portal.gpteamservices.com/portal/docs/api/image-generation',
    settings: {
      proxyUrl: {
        placeholder: 'https://api.gpteamservices.com'
      },
      sdkType: 'openai',
      showModelFetcher: false
    }
  },
  protocol: {
    kind: 'openai-compatible',
    baseUrl: 'https://api.gpteamservices.com',
    piBaseUrl: 'https://api.gpteamservices.com'
  },
  capabilities: {
    chat: false,
    embeddings: false,
    imageGeneration: true,
    modelListing: true,
    musicGeneration: false,
    speechSynthesis: false,
    transcribe: false
  },
  defaults: {
    models: {
      chat: 'gpt-image-2',
      imageGeneration: 'gpt-image-2'
    }
  },
  models: {
    strategy: 'builtin',
    items: gpteamModels
  },
  schema: gpteamSchema
};
