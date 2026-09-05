import type { ModelParamsSchema } from '../../model-params';
import type { ChatProviderModelCard, EmbeddingProviderModelCard, ImageProviderModelCard, RealtimeProviderModelCard, STTProviderModelCard, TTSProviderModelCard } from '../../model-types';

export const gptImage1ParamsSchema: ModelParamsSchema = {
  imageUrls: { default: [] },
  prompt: { default: '' },
  size: {
    default: 'auto',
    enum: ['auto', '1024x1024', '1536x1024', '1024x1536']
  }
};

export const openaiChatModels: ChatProviderModelCard[] = [
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
      structuredOutput: true,
      vision: true
    },
    contextWindowTokens: 400_000,
    displayName: 'GPT-5.2',
    enabled: true,
    id: 'gpt-5.2',
    maxOutput: 128_000,
    pricing: {
      units: [
        { name: 'textInput', rate: 1.75, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput_cacheRead', rate: 0.175, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 14, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-12-11',
    settings: {
      extendParams: ['gpt5_2ReasoningEffort', 'textVerbosity'],
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
      vision: true
    },
    contextWindowTokens: 400_000,
    displayName: 'GPT-5.2 pro',
    id: 'gpt-5.2-pro',
    maxOutput: 128_000,
    pricing: {
      units: [
        { name: 'textInput', rate: 21, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 168, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-12-11',
    settings: {
      extendParams: ['gpt5_2ProReasoningEffort'],
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      vision: true
    },
    contextWindowTokens: 128_000,
    displayName: 'GPT-5.2 Chat',
    enabled: true,
    id: 'gpt-5.2-chat-latest',
    maxOutput: 16_384,
    pricing: {
      units: [
        { name: 'textInput', rate: 1.75, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput_cacheRead', rate: 0.175, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 14, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-12-11',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
      vision: true
    },
    contextWindowTokens: 400_000,
    displayName: 'GPT-5.1',
    id: 'gpt-5.1',
    maxOutput: 128_000,
    pricing: {
      units: [
        { name: 'textInput', rate: 1.25, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput_cacheRead', rate: 0.125, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 10, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-11-13',
    settings: {
      extendParams: ['gpt51ReasoningEffort', 'textVerbosity'],
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      vision: true
    },
    contextWindowTokens: 128_000,
    displayName: 'GPT-5.1 Chat',
    id: 'gpt-5.1-chat-latest',
    maxOutput: 16_384,
    pricing: {
      units: [
        { name: 'textInput', rate: 1.25, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput_cacheRead', rate: 0.125, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 10, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-11-13',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
      vision: true
    },
    contextWindowTokens: 400_000,
    displayName: 'GPT-5.1 Codex',
    id: 'gpt-5.1-codex',
    maxOutput: 128_000,
    pricing: {
      units: [
        { name: 'textInput', rate: 1.25, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput_cacheRead', rate: 0.125, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 10, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-11-13',
    settings: {
      extendParams: ['gpt51ReasoningEffort'],
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
      vision: true
    },
    contextWindowTokens: 400_000,
    displayName: 'GPT-5.1 Codex mini',
    id: 'gpt-5.1-codex-mini',
    maxOutput: 128_000,
    pricing: {
      units: [
        { name: 'textInput', rate: 0.25, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput_cacheRead', rate: 0.025, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 2, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-11-13',
    settings: {
      extendParams: ['gpt51ReasoningEffort'],
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
      vision: true
    },
    contextWindowTokens: 400_000,
    displayName: 'GPT-5 pro',
    id: 'gpt-5-pro',
    maxOutput: 272_000,
    pricing: {
      units: [
        { name: 'textInput', rate: 15, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 120, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-10-06',
    settings: {
      extendParams: ['textVerbosity'],
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
      vision: true
    },
    contextWindowTokens: 400_000,
    displayName: 'GPT-5 Codex',
    id: 'gpt-5-codex',
    maxOutput: 128_000,
    pricing: {
      units: [
        { name: 'textInput', rate: 1.25, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 10, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput_cacheRead', rate: 0.125, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2024-09-15',
    settings: {
      extendParams: ['gpt5ReasoningEffort'],
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
      structuredOutput: true,
      vision: true
    },
    contextWindowTokens: 400_000,
    displayName: 'GPT-5',
    id: 'gpt-5',
    maxOutput: 128_000,
    pricing: {
      units: [
        { name: 'textInput', rate: 1.25, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 10, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput_cacheRead', rate: 0.125, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-08-07',
    settings: {
      extendParams: ['gpt5ReasoningEffort', 'textVerbosity'],
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
      structuredOutput: true,
      vision: true
    },
    contextWindowTokens: 400_000,
    displayName: 'GPT-5 mini',
    enabled: true,
    id: 'gpt-5-mini',
    maxOutput: 128_000,
    pricing: {
      units: [
        { name: 'textInput', rate: 0.25, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput_cacheRead', rate: 0.025, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-08-07',
    settings: {
      extendParams: ['gpt5ReasoningEffort', 'textVerbosity'],
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      vision: true
    },
    contextWindowTokens: 400_000,
    displayName: 'GPT-5 nano',
    id: 'gpt-5-nano',
    maxOutput: 128_000,
    pricing: {
      units: [
        { name: 'textInput', rate: 0.05, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0.4, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput_cacheRead', rate: 0.005, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-08-07',
    settings: {
      extendParams: ['gpt5ReasoningEffort', 'textVerbosity']
    },
    type: 'chat'
  },
  {
    abilities: {
      vision: true
    },
    contextWindowTokens: 400_000,
    displayName: 'GPT-5 Chat',
    id: 'gpt-5-chat-latest',
    maxOutput: 128_000,
    pricing: {
      units: [
        { name: 'textInput', rate: 1.25, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 10, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput_cacheRead', rate: 0.125, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-08-07',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
      vision: true
    },
    contextWindowTokens: 200_000,
    displayName: 'o4-mini',
    id: 'o4-mini',
    maxOutput: 100_000,
    pricing: {
      units: [
        { name: 'textInput_cacheRead', rate: 0.275, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 1.1, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 4.4, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-04-17',
    settings: {
      extendParams: ['reasoningEffort'],
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
      vision: true
    },
    contextWindowTokens: 200_000,
    displayName: 'o4-mini Deep Research',
    id: 'o4-mini-deep-research',
    maxOutput: 100_000,
    pricing: {
      units: [
        { name: 'textInput_cacheRead', rate: 0.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 8, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-06-26',
    settings: {
      extendParams: ['reasoningEffort'],
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
      vision: true
    },
    contextWindowTokens: 200_000,
    displayName: 'o3-pro',
    id: 'o3-pro',
    maxOutput: 100_000,
    pricing: {
      units: [
        { name: 'textInput', rate: 20, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 80, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-06-10',
    settings: {
      extendParams: ['reasoningEffort'],
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
      vision: true
    },
    contextWindowTokens: 200_000,
    displayName: 'o3',
    id: 'o3',
    maxOutput: 100_000,
    pricing: {
      units: [
        { name: 'textInput_cacheRead', rate: 0.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 8, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-04-16',
    settings: {
      extendParams: ['reasoningEffort'],
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true,
      vision: true
    },
    contextWindowTokens: 200_000,
    displayName: 'o3 Deep Research',
    id: 'o3-deep-research',
    maxOutput: 100_000,
    pricing: {
      units: [
        { name: 'textInput_cacheRead', rate: 2.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 10, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 40, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-06-26',
    settings: {
      extendParams: ['reasoningEffort'],
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 200_000,
    displayName: 'o3-mini',
    id: 'o3-mini',
    maxOutput: 100_000,
    pricing: {
      units: [
        { name: 'textInput_cacheRead', rate: 0.55, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 1.1, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 4.4, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-01-31',
    settings: {
      extendParams: ['reasoningEffort']
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      vision: true
    },
    contextWindowTokens: 200_000,
    displayName: 'o1-pro',
    id: 'o1-pro',
    maxOutput: 100_000,
    pricing: {
      units: [
        { name: 'textInput', rate: 150, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 600, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-03-19',
    settings: {
      extendParams: ['reasoningEffort']
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      vision: true
    },
    contextWindowTokens: 200_000,
    displayName: 'o1',
    id: 'o1',
    maxOutput: 100_000,
    pricing: {
      units: [
        { name: 'textInput_cacheRead', rate: 7.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 15, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 60, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2024-12-17',
    settings: {
      extendParams: ['reasoningEffort']
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      search: true,
      vision: true
    },
    contextWindowTokens: 1_047_576,
    displayName: 'GPT-4.1',
    id: 'gpt-4.1',
    maxOutput: 32_768,
    pricing: {
      units: [
        { name: 'textInput_cacheRead', rate: 0.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 8, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-04-14',
    settings: {
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      search: true,
      vision: true
    },
    contextWindowTokens: 1_047_576,
    displayName: 'GPT-4.1 mini',
    id: 'gpt-4.1-mini',
    maxOutput: 32_768,
    pricing: {
      units: [
        { name: 'textInput_cacheRead', rate: 0.1, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 0.4, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 1.6, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-04-14',
    settings: {
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      vision: true
    },
    contextWindowTokens: 1_047_576,
    displayName: 'GPT-4.1 nano',
    id: 'gpt-4.1-nano',
    maxOutput: 32_768,
    pricing: {
      units: [
        { name: 'textInput_cacheRead', rate: 0.025, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 0.1, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0.4, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-04-14',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      search: true,
      vision: true
    },
    contextWindowTokens: 128_000,
    displayName: 'GPT-4o mini',
    id: 'gpt-4o-mini',
    maxOutput: 16_384,
    pricing: {
      units: [
        { name: 'textInput_cacheRead', rate: 0.075, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 0.15, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0.6, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2024-07-18',
    settings: {
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      search: true
    },
    contextWindowTokens: 128_000,
    displayName: 'GPT-4o mini Search Preview',
    id: 'gpt-4o-mini-search-preview',
    maxOutput: 16_384,
    pricing: {
      units: [
        { name: 'textInput', rate: 0.15, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0.6, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-03-11',
    settings: {
      searchImpl: 'internal'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      search: true,
      vision: true
    },
    contextWindowTokens: 128_000,
    displayName: 'GPT-4o',
    id: 'gpt-4o',
    pricing: {
      units: [
        { name: 'textInput_cacheRead', rate: 1.25, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 2.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 10, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2024-05-13',
    settings: {
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      search: true
    },
    contextWindowTokens: 128_000,
    displayName: 'GPT-4o Search Preview',
    id: 'gpt-4o-search-preview',
    maxOutput: 16_384,
    pricing: {
      units: [
        { name: 'textInput', rate: 2.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 10, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-03-11',
    settings: {
      searchImpl: 'internal'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      search: true,
      vision: true
    },
    contextWindowTokens: 128_000,
    displayName: 'GPT-4o 1120',
    id: 'gpt-4o-2024-11-20',
    pricing: {
      units: [
        { name: 'textInput_cacheRead', rate: 1.25, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 2.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 10, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2024-11-20',
    settings: {
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      search: true,
      vision: true
    },
    contextWindowTokens: 128_000,
    displayName: 'GPT-4o 0513',
    id: 'gpt-4o-2024-05-13',
    pricing: {
      units: [
        { name: 'textInput', rate: 5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 15, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2024-05-13',
    settings: {
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 128_000,
    displayName: 'GPT Audio',
    id: 'gpt-audio',
    maxOutput: 16_384,
    pricing: {
      units: [
        { name: 'textInput', rate: 2.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 10, strategy: 'fixed', unit: 'millionTokens' },

        { name: 'audioInput', rate: 40, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'audioOutput', rate: 80, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-08-28',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
      //search: true,
    },
    contextWindowTokens: 128_000,
    displayName: 'GPT-4o Audio Preview',
    id: 'gpt-4o-audio-preview',
    maxOutput: 16_384,
    pricing: {
      units: [
        { name: 'textInput', rate: 2.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 10, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2024-12-17',
    /*
    settings: {
      searchImpl: 'params',
    },
    */
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
      //search: true,
    },
    contextWindowTokens: 128_000,
    displayName: 'GPT-4o mini Audio',
    id: 'gpt-4o-mini-audio-preview',
    maxOutput: 16_384,
    pricing: {
      units: [
        { name: 'textInput', rate: 0.15, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0.6, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2024-12-17',
    /*
    settings: {
      searchImpl: 'params',
    },
    */
    type: 'chat'
  },
  {
    abilities: {
      vision: true
    },
    contextWindowTokens: 128_000,
    displayName: 'ChatGPT-4o',
    id: 'chatgpt-4o-latest',
    pricing: {
      units: [
        { name: 'textInput', rate: 5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 15, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2024-08-14',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      vision: true
    },
    contextWindowTokens: 128_000,
    displayName: 'GPT-4 Turbo',
    id: 'gpt-4-turbo',
    pricing: {
      units: [
        { name: 'textInput', rate: 10, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 30, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      vision: true
    },
    contextWindowTokens: 128_000,
    displayName: 'GPT-4 Turbo Vision 0409',
    id: 'gpt-4-turbo-2024-04-09',
    pricing: {
      units: [
        { name: 'textInput', rate: 10, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 30, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2024-04-09',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 128_000,
    displayName: 'GPT-4 Turbo Preview',
    id: 'gpt-4-turbo-preview',
    pricing: {
      units: [
        { name: 'textInput', rate: 10, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 30, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 128_000,
    displayName: 'GPT-4 Turbo Preview 0125',
    id: 'gpt-4-0125-preview',
    pricing: {
      units: [
        { name: 'textInput', rate: 10, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 30, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2024-01-25',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 128_000,
    displayName: 'GPT-4 Turbo Preview 1106',
    id: 'gpt-4-1106-preview',
    pricing: {
      units: [
        { name: 'textInput', rate: 10, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 30, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2023-11-06',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 8192,
    displayName: 'GPT-4',
    id: 'gpt-4',
    pricing: {
      units: [
        { name: 'textInput', rate: 30, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 60, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 8192,
    displayName: 'GPT-4 0613',
    id: 'gpt-4-0613',
    pricing: {
      units: [
        { name: 'textInput', rate: 30, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 60, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2023-06-13',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 16_384,
    displayName: 'GPT-3.5 Turbo',
    id: 'gpt-3.5-turbo',
    pricing: {
      units: [
        { name: 'textInput', rate: 0.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 1.5, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 16_384,
    displayName: 'GPT-3.5 Turbo 0125',
    id: 'gpt-3.5-turbo-0125',
    pricing: {
      units: [
        { name: 'textInput', rate: 0.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 1.5, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2024-01-25',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 16_384,
    displayName: 'GPT-3.5 Turbo 1106',
    id: 'gpt-3.5-turbo-1106',
    pricing: {
      units: [
        { name: 'textInput', rate: 1, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 2, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2023-11-06',
    type: 'chat'
  },
  {
    contextWindowTokens: 4096,
    displayName: 'GPT-3.5 Turbo Instruct',
    id: 'gpt-3.5-turbo-instruct',
    pricing: {
      units: [
        { name: 'textInput', rate: 1.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 2, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      vision: true
    },
    contextWindowTokens: 200_000,
    displayName: 'Codex mini',
    id: 'codex-mini-latest',
    maxOutput: 100_000,
    pricing: {
      units: [
        { name: 'textInput_cacheRead', rate: 0.375, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 1.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 6, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-06-01',
    settings: {
      extendParams: ['reasoningEffort']
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      vision: true
    },
    contextWindowTokens: 8192,
    displayName: 'Computer Use Preview',
    id: 'computer-use-preview',
    maxOutput: 1024,
    pricing: {
      units: [
        { name: 'textInput', rate: 3, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 12, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-03-11',
    settings: {
      extendParams: ['reasoningEffort']
    },
    type: 'chat'
  }
];

export const openaiEmbeddingModels: EmbeddingProviderModelCard[] = [
  {
    contextWindowTokens: 8192,
    displayName: 'Text Embedding 3 Large',
    id: 'text-embedding-3-large',
    maxDimension: 3072,
    pricing: {
      currency: 'USD',
      units: [{ name: 'textInput', rate: 0.13, strategy: 'fixed', unit: 'millionTokens' }]
    },
    releasedAt: '2024-01-25',
    type: 'embedding'
  },
  {
    contextWindowTokens: 8192,
    displayName: 'Text Embedding 3 Small',
    id: 'text-embedding-3-small',
    maxDimension: 1536,
    pricing: {
      currency: 'USD',
      units: [{ name: 'textInput', rate: 0.02, strategy: 'fixed', unit: 'millionTokens' }]
    },
    releasedAt: '2024-01-25',
    type: 'embedding'
  }
];

// Text-to-speech models
export const openaiTTSModels: TTSProviderModelCard[] = [
  {
    displayName: 'TTS-1',
    id: 'tts-1',
    pricing: {
      units: [{ name: 'textInput', rate: 15, strategy: 'fixed', unit: 'millionCharacters' }]
    },
    type: 'tts'
  },
  {
    displayName: 'TTS-1 HD',
    id: 'tts-1-hd',
    pricing: {
      units: [{ name: 'textInput', rate: 30, strategy: 'fixed', unit: 'millionCharacters' }]
    },
    type: 'tts'
  },
  {
    displayName: 'GPT-4o Mini TTS',
    id: 'gpt-4o-mini-tts',
    pricing: {
      units: [
        { name: 'textInput', rate: 0.6, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'audioOutput', rate: 12, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'tts'
  }
];

// Speech recognition models
export const openaiSTTModels: STTProviderModelCard[] = [
  {
    displayName: 'Whisper',
    id: 'whisper-1',
    pricing: {
      units: [
        {
          name: 'audioInput',
          rate: 0.0001, // $0.006 per minute => $0.0001 per second
          strategy: 'fixed',
          unit: 'second'
        }
      ]
    },
    type: 'stt'
  },
  {
    contextWindowTokens: 16_000,
    displayName: 'GPT-4o Transcribe',
    id: 'gpt-4o-transcribe',
    maxOutput: 2000,
    pricing: {
      units: [
        { name: 'textInput', rate: 2.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'audioInput', rate: 6, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 10, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'stt'
  },
  {
    contextWindowTokens: 16_000,
    displayName: 'GPT-4o Mini Transcribe',
    id: 'gpt-4o-mini-transcribe',
    maxOutput: 2000,
    pricing: {
      units: [
        { name: 'textInput', rate: 1.25, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'audioInput', rate: 3, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 5, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'stt'
  }
];

// Image generation models
export const openaiImageModels: ImageProviderModelCard[] = [
  {
    displayName: 'GPT Image 1.5',
    enabled: true,
    id: 'gpt-image-1.5',
    parameters: gptImage1ParamsSchema,
    pricing: {
      approximatePricePerImage: 0.034,
      units: [
        { name: 'textInput', rate: 5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput_cacheRead', rate: 1.25, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'imageInput', rate: 8, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'imageInput_cacheRead', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'imageOutput', rate: 32, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-12-16',
    type: 'image'
  },
  // https://platform.openai.com/docs/models/gpt-image-1
  {
    displayName: 'GPT Image 1',
    enabled: true,
    id: 'gpt-image-1',
    parameters: gptImage1ParamsSchema,
    pricing: {
      approximatePricePerImage: 0.042,
      units: [
        { name: 'textInput', rate: 5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput_cacheRead', rate: 1.25, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'imageInput', rate: 10, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'imageInput_cacheRead', rate: 2.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'imageOutput', rate: 40, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'image'
  },
  {
    displayName: 'GPT Image 1 Mini',
    enabled: true,
    id: 'gpt-image-1-mini',
    parameters: gptImage1ParamsSchema,
    pricing: {
      approximatePricePerImage: 0.011,
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput_cacheRead', rate: 0.2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'imageInput', rate: 2.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'imageInput_cacheRead', rate: 0.25, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'imageOutput', rate: 8, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-10-06',
    type: 'image'
  },
  {
    displayName: 'DALL·E 3',
    enabled: true,
    id: 'dall-e-3',
    parameters: {
      prompt: { default: '' },
      quality: {
        default: 'standard',
        enum: ['standard', 'hd']
      },
      size: {
        default: '1024x1024',
        enum: ['1024x1024', '1792x1024', '1024x1792']
      }
    },
    pricing: {
      units: [
        {
          lookup: {
            prices: {
              hd_1024x1024: 0.08,
              hd_1024x1792: 0.12,
              hd_1792x1024: 0.12,
              standard_1024x1024: 0.04,
              standard_1024x1792: 0.08,
              standard_1792x1024: 0.08
            },
            pricingParams: ['quality', 'size']
          },
          name: 'imageGeneration',
          strategy: 'lookup',
          unit: 'image'
        }
      ]
    },
    type: 'image'
  },
  {
    displayName: 'DALL·E 2',
    id: 'dall-e-2',
    parameters: {
      imageUrl: { default: null },
      prompt: { default: '' },
      size: {
        default: '1024x1024',
        enum: ['256x256', '512x512', '1024x1024']
      }
    },
    pricing: {
      units: [
        {
          lookup: {
            prices: {
              '1024x1024': 0.02,
              '256x256': 0.016,
              '512x512': 0.018
            },
            pricingParams: ['size']
          },
          name: 'imageGeneration',
          strategy: 'lookup',
          unit: 'image'
        }
      ]
    },
    type: 'image'
  }
];

// GPT-4o and GPT-4o-mini realtime models
export const openaiRealtimeModels: RealtimeProviderModelCard[] = [
  {
    abilities: {
      functionCall: true,
      vision: true
    },
    contextWindowTokens: 32_000,
    displayName: 'GPT Realtime',
    id: 'gpt-realtime',
    maxOutput: 4096,
    pricing: {
      units: [
        { name: 'audioInput', rate: 32, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'audioOutput', rate: 64, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'audioInput_cacheRead', rate: 0.4, strategy: 'fixed', unit: 'millionTokens' },

        { name: 'textInput', rate: 4, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 16, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput_cacheRead', rate: 0.4, strategy: 'fixed', unit: 'millionTokens' },

        { name: 'imageInput', rate: 5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'imageInput_cacheRead', rate: 0.5, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-08-28',
    type: 'realtime'
  },
  {
    contextWindowTokens: 16_000,
    displayName: 'GPT-4o Realtime 241217',
    id: 'gpt-4o-realtime-preview',
    maxOutput: 4096,
    pricing: {
      units: [
        { name: 'audioInput', rate: 40, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'audioOutput', rate: 80, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'audioInput_cacheRead', rate: 2.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput_cacheRead', rate: 2.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 20, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2024-12-17',
    type: 'realtime'
  },
  {
    contextWindowTokens: 32_000,
    displayName: 'GPT-4o Realtime 250603',
    id: 'gpt-4o-realtime-preview-2025-06-03',
    maxOutput: 4096,
    pricing: {
      units: [
        { name: 'audioInput', rate: 40, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'audioOutput', rate: 80, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'audioInput_cacheRead', rate: 2.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput_cacheRead', rate: 2.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 20, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-06-03',
    type: 'realtime'
  },
  {
    contextWindowTokens: 16_000,
    displayName: 'GPT-4o Realtime 241001',
    id: 'gpt-4o-realtime-preview-2024-10-01', // deprecated on 2025-10-10
    maxOutput: 4096,
    pricing: {
      units: [
        { name: 'audioInput', rate: 100, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'audioOutput', rate: 200, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'audioInput_cacheRead', rate: 20, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput_cacheRead', rate: 2.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 20, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2024-10-01',
    type: 'realtime'
  },
  {
    contextWindowTokens: 128_000,
    displayName: 'GPT-4o Mini Realtime',
    id: 'gpt-4o-mini-realtime-preview',
    maxOutput: 4096,
    pricing: {
      units: [
        { name: 'audioInput', rate: 10, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'audioOutput', rate: 20, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'audioInput_cacheRead', rate: 0.3, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput_cacheRead', rate: 0.3, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 0.6, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 2.4, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2024-12-17',
    type: 'realtime'
  }
];

export const allModels = [...openaiChatModels, ...openaiEmbeddingModels, ...openaiTTSModels, ...openaiSTTModels, ...openaiImageModels, ...openaiRealtimeModels];

export default allModels;
