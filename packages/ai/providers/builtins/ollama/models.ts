import type { ChatProviderModelCard } from '../../model-types';

const ollamaChatModels: ChatProviderModelCard[] = [
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 163_840,
    displayName: 'DeepSeek V3.1',
    id: 'deepseek-v3.1:671b',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 131_072,
    displayName: 'GPT-OSS 20B',
    id: 'gpt-oss:20b',
    releasedAt: '2025-08-05',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 131_072,
    displayName: 'GPT-OSS 120B',
    id: 'gpt-oss:120b',
    releasedAt: '2025-08-05',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 262_144,
    displayName: 'Qwen3 Coder 480B',
    id: 'qwen3-coder:480b',
    type: 'chat'
  },
  {
    abilities: {
      reasoning: true
    },
    contextWindowTokens: 65_536,
    displayName: 'DeepSeek R1',
    id: 'deepseek-r1',
    type: 'chat'
  },
  {
    contextWindowTokens: 65_536,
    displayName: 'DeepSeek V3 671B',
    id: 'deepseek-v3',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 128_000,
    displayName: 'Llama 3.1 8B',
    id: 'llama3.1',
    type: 'chat'
  },
  {
    contextWindowTokens: 128_000,
    displayName: 'Llama 3.1 70B',
    id: 'llama3.1:70b',
    type: 'chat'
  },
  {
    contextWindowTokens: 128_000,
    displayName: 'Llama 3.1 405B',
    id: 'llama3.1:405b',
    type: 'chat'
  },
  {
    contextWindowTokens: 16_384,
    displayName: 'Code Llama 7B',
    id: 'codellama',
    type: 'chat'
  },
  {
    contextWindowTokens: 16_384,
    displayName: 'Code Llama 13B',
    id: 'codellama:13b',
    type: 'chat'
  },
  {
    contextWindowTokens: 16_384,
    displayName: 'Code Llama 34B',
    id: 'codellama:34b',
    type: 'chat'
  },
  {
    contextWindowTokens: 16_384,
    displayName: 'Code Llama 70B',
    id: 'codellama:70b',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 128_000,
    displayName: 'QwQ 32B',
    id: 'qwq',
    releasedAt: '2024-11-28',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 65_536,
    displayName: 'Qwen3 7B',
    id: 'qwen3',
    type: 'chat'
  },

  {
    contextWindowTokens: 128_000,
    displayName: 'Qwen2.5 0.5B',
    id: 'qwen2.5:0.5b',
    type: 'chat'
  },
  {
    contextWindowTokens: 128_000,
    displayName: 'Qwen2.5 1.5B',
    id: 'qwen2.5:1.5b',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 128_000,
    displayName: 'Qwen2.5 7B',
    id: 'qwen2.5',
    type: 'chat'
  },
  {
    contextWindowTokens: 128_000,
    displayName: 'Qwen2.5 72B',
    id: 'qwen2.5:72b',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 65_536,
    displayName: 'CodeQwen1.5 7B',
    id: 'codeqwen',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 128_000,
    displayName: 'Qwen2 0.5B',
    id: 'qwen2:0.5b',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 128_000,
    displayName: 'Qwen2 1.5B',
    id: 'qwen2:1.5b',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 128_000,
    displayName: 'Qwen2 7B',
    id: 'qwen2',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 128_000,
    displayName: 'Qwen2 72B',
    id: 'qwen2:72b',
    type: 'chat'
  },
  {
    contextWindowTokens: 8192,
    displayName: 'Gemma 2 2B',
    id: 'gemma2:2b',
    type: 'chat'
  },
  {
    contextWindowTokens: 8192,
    displayName: 'Gemma 2 9B',
    id: 'gemma2',
    type: 'chat'
  },
  {
    contextWindowTokens: 8192,
    displayName: 'Gemma 2 27B',
    id: 'gemma2:27b',
    type: 'chat'
  },
  {
    contextWindowTokens: 8192,
    displayName: 'CodeGemma 2B',
    id: 'codegemma:2b',
    type: 'chat'
  },
  {
    contextWindowTokens: 8192,
    displayName: 'CodeGemma 7B',
    id: 'codegemma',
    type: 'chat'
  },
  {
    contextWindowTokens: 128_000,
    displayName: 'Phi-3 3.8B',
    id: 'phi3',
    type: 'chat'
  },
  {
    contextWindowTokens: 128_000,
    displayName: 'Phi-3 14B',
    id: 'phi3:14b',
    type: 'chat'
  },
  {
    contextWindowTokens: 32_768,
    displayName: 'WizardLM 2 7B',
    id: 'wizardlm2',
    type: 'chat'
  },
  {
    contextWindowTokens: 65_536,
    displayName: 'WizardLM 2 8x22B',
    id: 'wizardlm2:8x22b',
    type: 'chat'
  },
  {
    contextWindowTokens: 32_768,
    displayName: 'MathΣtral 7B',
    id: 'mathstral',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 32_768,
    displayName: 'Mistral 7B',
    id: 'mistral',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 32_768,
    displayName: 'Mixtral 8x7B',
    id: 'mixtral',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 65_536,
    displayName: 'Mixtral 8x22B',
    id: 'mixtral:8x22b',
    type: 'chat'
  },
  {
    contextWindowTokens: 128_000,
    displayName: 'Mixtral Large 123B',
    id: 'mistral-large',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 128_000,
    displayName: 'Mixtral Nemo 12B',
    id: 'mistral-nemo',
    type: 'chat'
  },
  {
    contextWindowTokens: 32_768,
    displayName: 'Codestral 22B',
    id: 'codestral',
    type: 'chat'
  },
  {
    contextWindowTokens: 8192,
    displayName: 'Aya 23 8B',
    id: 'aya',
    type: 'chat'
  },
  {
    contextWindowTokens: 8192,
    displayName: 'Aya 23 35B',
    id: 'aya:35b',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Command R 35B',
    id: 'command-r',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Command R+ 104B',
    id: 'command-r-plus',
    type: 'chat'
  },
  {
    contextWindowTokens: 32_768,
    displayName: 'DeepSeek V2 16B',
    id: 'deepseek-v2',
    type: 'chat'
  },
  {
    contextWindowTokens: 128_000,
    displayName: 'DeepSeek V2 236B',
    id: 'deepseek-v2:236b',
    type: 'chat'
  },
  {
    contextWindowTokens: 128_000,
    displayName: 'DeepSeek Coder V2 16B',
    id: 'deepseek-coder-v2',
    type: 'chat'
  },
  {
    contextWindowTokens: 128_000,
    displayName: 'DeepSeek Coder V2 236B',
    id: 'deepseek-coder-v2:236b',
    type: 'chat'
  },
  {
    abilities: {
      vision: true
    },
    contextWindowTokens: 4096,
    displayName: 'LLaVA 7B',
    id: 'llava',
    type: 'chat'
  },
  {
    abilities: {
      vision: true
    },
    contextWindowTokens: 4096,
    displayName: 'LLaVA 13B',
    id: 'llava:13b',
    type: 'chat'
  },
  {
    abilities: {
      vision: true
    },
    contextWindowTokens: 4096,
    displayName: 'LLaVA 34B',
    id: 'llava:34b',
    type: 'chat'
  },
  {
    abilities: {
      vision: true
    },
    contextWindowTokens: 128_000,
    displayName: 'MiniCPM-V 8B',
    id: 'minicpm-v',
    type: 'chat'
  }
];

export const allModels = [...ollamaChatModels];

export default allModels;
