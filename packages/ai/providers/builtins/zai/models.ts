import type { ChatProviderModelCard } from '../../model-types';

// GLM Coding Plan 套餐模型
// ref: https://docs.bigmodel.cn/cn/coding-plan/overview
// endpoint: https://open.bigmodel.cn/api/coding/paas/v4

const zaiChatModels: ChatProviderModelCard[] = [
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true
    },
    contextWindowTokens: 200_000,
    displayName: 'GLM-5',
    enabled: true,
    id: 'glm-5',
    maxOutput: 131_072,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    settings: {
      extendParams: ['enableReasoning'],
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true
    },
    contextWindowTokens: 200_000,
    displayName: 'GLM-5-Turbo',
    enabled: true,
    id: 'glm-5-turbo',
    maxOutput: 131_072,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    settings: {
      extendParams: ['enableReasoning'],
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true
    },
    contextWindowTokens: 200_000,
    displayName: 'GLM-4.7',
    enabled: true,
    id: 'glm-4.7',
    maxOutput: 131_072,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    settings: {
      extendParams: ['enableReasoning'],
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true
    },
    contextWindowTokens: 200_000,
    displayName: 'GLM-4.6',
    enabled: true,
    id: 'glm-4.6',
    maxOutput: 131_072,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    settings: {
      extendParams: ['enableReasoning'],
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true
    },
    contextWindowTokens: 131_072,
    displayName: 'GLM-4.5',
    enabled: true,
    id: 'glm-4.5',
    maxOutput: 98_304,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    settings: {
      extendParams: ['enableReasoning'],
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true
    },
    contextWindowTokens: 131_072,
    displayName: 'GLM-4.5-Air',
    enabled: true,
    id: 'glm-4.5-air',
    maxOutput: 98_304,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    settings: {
      extendParams: ['enableReasoning'],
      searchImpl: 'params'
    },
    type: 'chat'
  }
];

export default zaiChatModels;
