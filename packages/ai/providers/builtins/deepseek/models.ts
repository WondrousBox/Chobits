import type { ChatProviderModelCard } from '../../model-types';

// https://api-docs.deepseek.com/zh-cn/quick_start/pricing
const deepseekChatModels: ChatProviderModelCard[] = [
  {
    abilities: {
      functionCall: true,
      structuredOutput: true
    },
    contextWindowTokens: 131_072,
    displayName: 'DeepSeek V3.2 Exp',
    enabled: true,
    id: 'deepseek-chat',
    maxOutput: 8192,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 0.2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 3, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-12-01',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 131_072,
    displayName: 'DeepSeek V3.2 Exp Thinking',
    enabled: true,
    id: 'deepseek-reasoner',
    maxOutput: 65_536,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 0.2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 3, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-12-01',
    type: 'chat'
  }
];

export const allModels = [...deepseekChatModels];

export default allModels;
