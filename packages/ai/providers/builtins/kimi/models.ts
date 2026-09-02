import type { ChatProviderModelCard } from '../../model-types';

// https://platform.kimi.com/docs/overview
const kimiChatModels: ChatProviderModelCard[] = [
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      structuredOutput: true,
      video: true,
      vision: true
    },
    contextWindowTokens: 1_048_576,
    description: 'Kimi K3 是面向长程编程与端到端知识工作的旗舰模型，1M token 上下文，支持 reasoning_effort 推理强度配置。',
    displayName: 'Kimi K3',
    enabled: true,
    id: 'kimi-k3',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      structuredOutput: true,
      video: true,
      vision: true
    },
    contextWindowTokens: 262_144,
    description: 'Kimi K2.6 支持思考与非思考模式，适合通用对话、Agent 任务、视觉理解和复杂推理。',
    displayName: 'Kimi K2.6',
    enabled: true,
    id: 'kimi-k2.6',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      structuredOutput: true,
      video: true,
      vision: true
    },
    contextWindowTokens: 262_144,
    description: 'Kimi K2.7 Code 是面向代码场景的 Coding 模型，支持文本/图片/视频输入和思考模式。',
    displayName: 'Kimi K2.7 Code',
    enabled: true,
    id: 'kimi-k2.7-code',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      structuredOutput: true,
      video: true,
      vision: true
    },
    contextWindowTokens: 262_144,
    description: 'Kimi K2.7 Code 高速版，适合追求更高输出速度的代码生成、代码修改和编程 Agent 场景。',
    displayName: 'Kimi K2.7 Code Highspeed',
    enabled: true,
    id: 'kimi-k2.7-code-highspeed',
    type: 'chat'
  }
];

export default kimiChatModels;
