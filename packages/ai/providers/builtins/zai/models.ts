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
    description: 'GLM-5 是智谱最新旗舰模型，对标 Claude Opus，在推理、编码和智能体能力上全面达到顶尖水平。Coding 套餐 Max 与 Pro 套餐可用。',
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
    description: 'GLM-5-Turbo 是专为 Agentic 长程工作流深度优化的模型，在指令遵循、工具调用、定时执行和长任务稳定性方面表现出色，适合从对话到执行的真实业务流程。Coding 套餐 Max 套餐可用。',
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
    description: 'GLM-4.7 是智谱旗舰模型，面向 Agentic Coding 场景强化了编码能力、长程任务规划与工具协同，通用能力提升，回复更简洁自然。所有 Coding 套餐均可使用。',
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
    description: 'GLM-4.6 (355B) 在高级编码、长文本处理、推理与智能体能力上全面超越前代，编程能力对齐 Claude Sonnet 4，成为国内顶尖的 Coding 模型。所有 Coding 套餐均可使用。',
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
    description: 'GLM-4.5 旗舰模型，支持可切换的思维模式，在推理、编码和智能体任务上达到开源 SOTA，最大支持 128K 上下文。所有 Coding 套餐均可使用。',
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
    description: 'GLM-4.5-Air 轻量版模型，在性能与成本之间取得平衡，支持灵活的混合思维模式。所有 Coding 套餐均可使用。',
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
