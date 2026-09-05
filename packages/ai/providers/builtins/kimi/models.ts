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
    displayName: 'Kimi K2.7 Code Highspeed',
    enabled: true,
    id: 'kimi-k2.7-code-highspeed',
    type: 'chat'
  }
];

export default kimiChatModels;
