import type { ProviderConfig } from '../../../types';
import type { BuiltinProviderDefinition } from '../../types';
import geminiModels from './models';

const geminiSchema: ProviderConfig = {
  id: 'gemini',
  label: 'Google Gemini',
  enabled: true,
  icon: 'providers/icons/gemini-color.svg',
  locales: {
    en: {
      label: 'Google Gemini',
      fields: {
        apiKey: 'API Key',
        model: 'Default model (e.g., gemini-1.5-flash)'
      }
    },
    'zh-CN': {
      label: 'Google Gemini',
      fields: {
        apiKey: 'API Key',
        model: '默认模型（如 gemini-1.5-flash）'
      }
    }
  },
  fields: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    { key: 'model', label: '默认模型（如 gemini-1.5-flash）', type: 'text' }
  ]
};

export const geminiDefinition: BuiltinProviderDefinition = {
  id: 'gemini',
  aliases: ['gemini', 'google'],
  source: 'builtin',
  display: {
    label: 'Google Gemini',
    description:
      "Google's Gemini family is its most advanced general-purpose AI, built by Google DeepMind for multimodal use across text, code, images, audio, and video. It scales from data centers to mobile devices with strong efficiency and reach.",
    icon: 'providers/icons/gemini-color.svg',
    website: 'https://ai.google.dev'
  },
  catalog: {
    name: 'Google',
    checkModel: 'gemini-2.0-flash',
    modelsUrl: 'https://ai.google.dev/gemini-api/docs/models/gemini',
    enabled: true,
    proxyUrl: {
      placeholder: 'https://generativelanguage.googleapis.com'
    },
    settings: {
      proxyUrl: {
        placeholder: 'https://generativelanguage.googleapis.com'
      },
      responseAnimation: {
        speed: 50,
        text: 'smooth'
      },
      sdkType: 'google',
      showModelFetcher: true
    }
  },
  protocol: {
    kind: 'gemini',
    piBaseUrl: 'https://generativelanguage.googleapis.com/v1beta'
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
      chat: 'gemini-1.5-flash'
    }
  },
  models: {
    strategy: 'builtin',
    items: geminiModels
  },
  schema: geminiSchema
};
