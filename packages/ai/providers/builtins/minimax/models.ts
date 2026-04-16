import type { ChatProviderModelCard } from '../../model-types';

// MiniMax Token Plan 套餐模型
// ref: https://platform.minimaxi.com/docs/token-plan/intro
// endpoint: https://api.minimaxi.com/v1

const minimaxChatModels: ChatProviderModelCard[] = [
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      vision: true
    },
    contextWindowTokens: 1_000_000,
    description: 'MiniMax-M2.7 是 MiniMax 最新旗舰模型，兼容 OpenAI 和 Anthropic 接口协议，适用于代码助手、Agent 工具、AI IDE 等多种场景。',
    displayName: 'MiniMax-M2.7',
    enabled: true,
    id: 'MiniMax-M2.7',
    maxOutput: 65_536,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0, strategy: 'fixed', unit: 'millionTokens' }
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
    contextWindowTokens: 1_000_000,
    description: 'MiniMax-M2.7-highspeed 是 M2.7 的极速版本，提供更快的推理速度，适合极速版订阅用户。',
    displayName: 'MiniMax-M2.7 Highspeed',
    enabled: true,
    id: 'MiniMax-M2.7-highspeed',
    maxOutput: 65_536,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  }
];

export const allModels = [...minimaxChatModels];

export default allModels;
