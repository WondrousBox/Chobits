import type { ChatProviderModelCard, ImageProviderModelCard } from '../../model-types';

// https://help.aliyun.com/zh/model-studio/models?spm=a2c4g.11186623

const qwenChatModels: ChatProviderModelCard[] = [
  {
    abilities: {
      reasoning: true,
      vision: true
    },
    config: {
      deploymentName: 'qwen3-vl-plus-2025-12-19'
    },
    contextWindowTokens: 262_144,
    displayName: 'Qwen3 VL Plus',
    id: 'qwen3-vl-plus',
    maxOutput: 32_768,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        {
          lookup: {
            prices: {
              '[0, 0.032]': 1,
              '[0.032, 0.128]': 1.5,
              '[0.128, infinity]': 3
            },
            pricingParams: ['textInputRange']
          },
          name: 'textInput',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]': 10,
              '[0.032, 0.128]': 15,
              '[0.128, infinity]': 30
            },
            pricingParams: ['textInputRange']
          },
          name: 'textOutput',
          strategy: 'lookup',
          unit: 'millionTokens'
        }
      ]
    },
    releasedAt: '2025-09-23',
    settings: {
      extendParams: ['enableReasoning', 'reasoningBudgetToken']
    },
    type: 'chat'
  },
  {
    abilities: {
      reasoning: true,
      vision: true
    },
    config: {
      deploymentName: 'qwen3-vl-flash-2025-10-15'
    },
    contextWindowTokens: 262_144,
    displayName: 'Qwen3 VL Flash',
    id: 'qwen3-vl-flash',
    maxOutput: 32_768,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        {
          lookup: {
            prices: {
              '[0, 0.032]': 0.15,
              '[0.032, 0.128]': 0.3,
              '[0.128, 0.256]': 0.6
            },
            pricingParams: ['textInputRange']
          },
          name: 'textInput',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]': 1.5,
              '[0.032, 0.128]': 3,
              '[0.128, 0.256]': 6
            },
            pricingParams: ['textInputRange']
          },
          name: 'textOutput',
          strategy: 'lookup',
          unit: 'millionTokens'
        }
      ]
    },
    releasedAt: '2025-10-15',
    settings: {
      extendParams: ['enableReasoning', 'reasoningBudgetToken']
    },
    type: 'chat'
  },
  {
    abilities: {
      reasoning: true,
      search: true
    },
    contextWindowTokens: 131_072,
    displayName: 'DeepSeek V3.2 Exp',
    id: 'deepseek-v3.2-exp',
    maxOutput: 65_536,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 3, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    settings: {
      extendParams: ['enableReasoning', 'reasoningBudgetToken']
    },
    type: 'chat'
  },
  {
    abilities: {
      reasoning: true,
      search: true
    },
    contextWindowTokens: 131_072,
    displayName: 'DeepSeek V3.1',
    id: 'deepseek-v3.1',
    maxOutput: 65_536,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 4, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 12, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    settings: {
      extendParams: ['enableReasoning', 'reasoningBudgetToken']
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 262_144,
    displayName: 'Kimi K2 Thinking',
    id: 'kimi-k2-thinking',
    maxOutput: 16_384,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 4, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 16, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-11-10',
    settings: {
      extendParams: ['reasoningBudgetToken']
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      search: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Kimi K2 Instruct',
    id: 'Moonshot-Kimi-K2-Instruct',
    maxOutput: 8192,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 4, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 16, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-07-17',
    settings: {
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 202_752,
    displayName: 'GLM-4.6',
    id: 'glm-4.6',
    maxOutput: 16_384,
    pricing: {
      currency: 'CNY',
      units: [
        {
          lookup: {
            prices: {
              '[0, 0.032]': 3,
              '[0.032, infinity]': 4
            },
            pricingParams: ['textInputRange']
          },
          name: 'textInput',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]': 14,
              '[0.032, infinity]': 16
            },
            pricingParams: ['textInputRange']
          },
          name: 'textOutput',
          strategy: 'lookup',
          unit: 'millionTokens'
        }
      ]
    },
    settings: {
      extendParams: ['enableReasoning', 'reasoningBudgetToken']
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 131_072,
    displayName: 'GLM-4.5',
    id: 'glm-4.5',
    maxOutput: 16_384,
    pricing: {
      currency: 'CNY',
      units: [
        {
          lookup: {
            prices: {
              '[0, 0.032]': 3,
              '[0.032, infinity]': 4
            },
            pricingParams: ['textInputRange']
          },
          name: 'textInput',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]': 14,
              '[0.032, infinity]': 16
            },
            pricingParams: ['textInputRange']
          },
          name: 'textOutput',
          strategy: 'lookup',
          unit: 'millionTokens'
        }
      ]
    },
    settings: {
      extendParams: ['enableReasoning', 'reasoningBudgetToken']
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 131_072,
    displayName: 'GLM-4.5-Air',
    id: 'glm-4.5-air',
    maxOutput: 16_384,
    pricing: {
      currency: 'CNY',
      units: [
        {
          lookup: {
            prices: {
              '[0, 0.032]': 0.8,
              '[0.032, infinity]': 1.2
            },
            pricingParams: ['textInputRange']
          },
          name: 'textInput',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]': 6,
              '[0.032, infinity]': 8
            },
            pricingParams: ['textInputRange']
          },
          name: 'textOutput',
          strategy: 'lookup',
          unit: 'millionTokens'
        }
      ]
    },
    settings: {
      extendParams: ['enableReasoning', 'reasoningBudgetToken']
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    config: {
      deploymentName: 'qwen3-coder-plus' // Supports context caching
    },
    contextWindowTokens: 1_000_000,
    displayName: 'Qwen3 Coder Plus',
    id: 'qwen3-coder-plus',
    maxOutput: 65_536,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        {
          lookup: {
            prices: {
              '[0, 0.032]': 4 * 0.2,
              '[0.032, 0.128]': 6 * 0.2,
              '[0.128, 0.256]': 10 * 0.2,
              '[0.256, infinity]': 20 * 0.2
            },
            pricingParams: ['textInputRange']
          },
          name: 'textInput_cacheRead',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]': 4,
              '[0.032, 0.128]': 6,
              '[0.128, 0.256]': 10,
              '[0.256, infinity]': 20
            },
            pricingParams: ['textInputRange']
          },
          name: 'textInput',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]': 16,
              '[0.032, 0.128]': 24,
              '[0.128, 0.256]': 40,
              '[0.256, infinity]': 200
            },
            pricingParams: ['textInputRange']
          },
          name: 'textOutput',
          strategy: 'lookup',
          unit: 'millionTokens'
        }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    config: {
      deploymentName: 'qwen3-coder-flash' // Supports context caching
    },
    contextWindowTokens: 1_000_000,
    displayName: 'Qwen3 Coder Flash',
    id: 'qwen3-coder-flash',
    maxOutput: 65_536,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        {
          lookup: {
            prices: {
              '[0, 0.032]': 0.2,
              '[0.032, 0.128]': 0.3,
              '[0.128, 0.256]': 0.5,
              '[0.256, 1]': 1
            },
            pricingParams: ['textInputRange']
          },
          name: 'textInput_cacheRead',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]': 1,
              '[0.032, 0.128]': 1.5,
              '[0.128, 0.256]': 2.5,
              '[0.256, 1]': 5
            },
            pricingParams: ['textInputRange']
          },
          name: 'textInput',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]': 4,
              '[0.032, 0.128]': 6,
              '[0.128, 0.256]': 10,
              '[0.256, 1]': 25
            },
            pricingParams: ['textInputRange']
          },
          name: 'textOutput',
          strategy: 'lookup',
          unit: 'millionTokens'
        }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 262_144,
    displayName: 'Qwen3 Coder 480B A35B',
    id: 'qwen3-coder-480b-a35b-instruct',
    maxOutput: 65_536,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        {
          lookup: {
            prices: {
              '[0, 0.032]': 6,
              '[0.032, 0.128]': 9,
              '[0.128, 0.2]': 15
            },
            pricingParams: ['textInputRange']
          },
          name: 'textInput',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]': 24,
              '[0.032, 0.128]': 36,
              '[0.128, 0.2]': 60
            },
            pricingParams: ['textInputRange']
          },
          name: 'textOutput',
          strategy: 'lookup',
          unit: 'millionTokens'
        }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 262_144,
    displayName: 'Qwen3 Coder 30B A3B',
    id: 'qwen3-coder-30b-a3b-instruct',
    maxOutput: 65_536,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        {
          lookup: {
            prices: {
              '[0, 0.032]': 1.5,
              '[0.032, 0.128]': 2.25,
              '[0.128, 0.2]': 3.75
            },
            pricingParams: ['textInputRange']
          },
          name: 'textInput',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]': 6,
              '[0.032, 0.128]': 9,
              '[0.128, 0.2]': 15
            },
            pricingParams: ['textInputRange']
          },
          name: 'textOutput',
          strategy: 'lookup',
          unit: 'millionTokens'
        }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen3 235B A22B Thinking 2507',
    enabled: true,
    id: 'qwen3-235b-a22b-thinking-2507',
    maxOutput: 32_768,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 20, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-07-25',
    settings: {
      extendParams: ['reasoningBudgetToken']
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen3 235B A22B Instruct 2507',
    enabled: true,
    id: 'qwen3-235b-a22b-instruct-2507',
    maxOutput: 32_768,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 8, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-07-22',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen3 30B A3B Thinking 2507',
    id: 'qwen3-30b-a3b-thinking-2507',
    maxOutput: 32_768,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.75, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 7.5, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-07-30',
    settings: {
      extendParams: ['reasoningBudgetToken']
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen3 30B A3B Instruct 2507',
    id: 'qwen3-30b-a3b-instruct-2507',
    maxOutput: 32_768,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.75, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 3, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-07-29',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen3 Next 80B A3B Thinking',
    id: 'qwen3-next-80b-a3b-thinking',
    maxOutput: 32_768,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 1, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 10, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-09-12',
    settings: {
      extendParams: ['reasoningBudgetToken']
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen3 Next 80B A3B Instruct',
    id: 'qwen3-next-80b-a3b-instruct',
    maxOutput: 32_768,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 1, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 4, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-09-12',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen3 235B A22B',
    id: 'qwen3-235b-a22b',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 20, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-04-28',
    settings: {
      extendParams: ['enableReasoning', 'reasoningBudgetToken']
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen3 32B',
    id: 'qwen3-32b',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 20, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-04-28',
    settings: {
      extendParams: ['enableReasoning', 'reasoningBudgetToken']
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen3 30B A3B',
    id: 'qwen3-30b-a3b',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.75, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 7.5, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-04-28',
    settings: {
      extendParams: ['enableReasoning', 'reasoningBudgetToken']
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen3 14B',
    id: 'qwen3-14b',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 1, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 10, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-04-28',
    settings: {
      extendParams: ['enableReasoning', 'reasoningBudgetToken']
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen3 8B',
    id: 'qwen3-8b',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 5, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-04-28',
    settings: {
      extendParams: ['enableReasoning', 'reasoningBudgetToken']
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen3 4B',
    id: 'qwen3-4b',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.3, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 3, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-04-28',
    settings: {
      extendParams: ['enableReasoning', 'reasoningBudgetToken']
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 32_768,
    displayName: 'Qwen3 1.7B',
    id: 'qwen3-1.7b',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.3, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 3, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-04-28',
    settings: {
      extendParams: ['enableReasoning', 'reasoningBudgetToken']
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true
    },
    contextWindowTokens: 32_768,
    displayName: 'Qwen3 0.6B',
    id: 'qwen3-0.6b',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.3, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 3, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-04-28',
    settings: {
      extendParams: ['enableReasoning', 'reasoningBudgetToken']
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true
    },
    config: {
      deploymentName: 'qwq-plus-2025-03-05'
    },
    contextWindowTokens: 131_072,
    displayName: 'QwQ Plus',
    id: 'qwq-plus',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 1.6, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 4, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-03-05',
    settings: {
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
    config: {
      deploymentName: 'qwen-flash'
    },
    contextWindowTokens: 1_000_000,
    displayName: 'Qwen Flash',
    enabled: true,
    id: 'qwen-flash',
    maxOutput: 32_768,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        {
          name: 'textInput',
          strategy: 'tiered',
          tiers: [
            { rate: 0.15, upTo: 0.128 },
            { rate: 0.6, upTo: 0.256 },
            { rate: 1.2, upTo: 'infinity' }
          ],
          unit: 'millionTokens'
        },
        {
          name: 'textOutput',
          strategy: 'tiered',
          tiers: [
            { rate: 1.5, upTo: 0.128 },
            { rate: 6, upTo: 0.256 },
            { rate: 12, upTo: 'infinity' }
          ],
          unit: 'millionTokens'
        },
        {
          name: 'textInput_cacheRead',
          strategy: 'tiered',
          tiers: [
            { rate: 0.15 * 0.2, upTo: 0.128 },
            { rate: 0.6 * 0.2, upTo: 0.256 },
            { rate: 1.2 * 0.2, upTo: 'infinity' }
          ],
          unit: 'millionTokens'
        }
      ]
    },
    releasedAt: '2025-07-28',
    settings: {
      extendParams: ['enableReasoning', 'reasoningBudgetToken'],
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
    config: {
      deploymentName: 'qwen-turbo-2025-07-15'
    },
    contextWindowTokens: 1_000_000, // Non-thinking mode
    displayName: 'Qwen Turbo',
    id: 'qwen-turbo',
    maxOutput: 16_384,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 0.3 * 0.2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 0.3, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 3, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-07-15',
    settings: {
      extendParams: ['enableReasoning', 'reasoningBudgetToken'],
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
    config: {
      deploymentName: 'qwen-plus-2025-12-01'
    },
    contextWindowTokens: 1_000_000,
    displayName: 'Qwen Plus',
    enabled: true,
    id: 'qwen-plus',
    maxOutput: 32_768,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        {
          lookup: {
            prices: {
              '[0, 0.128]': 0.8 * 0.2,
              '[0.128, 0.256]': 2.4 * 0.2,
              '[0.256, infinity]': 4.8 * 0.2
            },
            pricingParams: ['textInputRange']
          },
          name: 'textInput_cacheRead',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.128]': 0.8,
              '[0.128, 0.256]': 2.4,
              '[0.256, infinity]': 4.8
            },
            pricingParams: ['textInputRange']
          },
          name: 'textInput',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.128]_[false]': 2,
              '[0, 0.128]_[true]': 8,
              '[0.128, 0.256]_[false]': 20,
              '[0.128, 0.256]_[true]': 24,
              '[0.256, infinity]_[false]': 48,
              '[0.256, infinity]_[true]': 64
            },
            pricingParams: ['textInputRange', 'thinkingMode']
          },
          name: 'textOutput',
          strategy: 'lookup',
          unit: 'millionTokens'
        }
      ]
    },
    settings: {
      extendParams: ['enableReasoning', 'reasoningBudgetToken'],
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      search: true
    },
    config: {
      deploymentName: 'qwen3-max' // Supports context caching
    },
    contextWindowTokens: 262_144,
    displayName: 'Qwen3 Max',
    enabled: true,
    id: 'qwen3-max',
    maxOutput: 65_536,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        {
          lookup: {
            prices: {
              '[0, 0.032]': 3.2 * 0.2,
              '[0.032, 0.128]': 6.4 * 0.2,
              '[0.128, infinity]': 9.6 * 0.2
            },
            pricingParams: ['textInputRange']
          },
          name: 'textInput_cacheRead',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]': 3.2,
              '[0.032, 0.128]': 6.4,
              '[0.128, infinity]': 9.6
            },
            pricingParams: ['textInputRange']
          },
          name: 'textInput',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]': 12.8,
              '[0.032, 0.128]': 25.6,
              '[0.128, infinity]': 38.4
            },
            pricingParams: ['textInputRange']
          },
          name: 'textOutput',
          strategy: 'lookup',
          unit: 'millionTokens'
        }
      ]
    },
    releasedAt: '2025-09-23',
    settings: {
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
    config: {
      deploymentName: 'qwen3-max-preview' // Supports context caching
    },
    contextWindowTokens: 262_144,
    displayName: 'Qwen3 Max Preview',
    id: 'qwen3-max-preview',
    maxOutput: 65_536,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        {
          lookup: {
            prices: {
              '[0, 0.032]': 6 * 0.2,
              '[0.032, 0.128]': 10 * 0.2,
              '[0.128, infinity]': 15 * 0.2
            },
            pricingParams: ['textInputRange']
          },
          name: 'textInput_cacheRead',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]': 6,
              '[0.032, 0.128]': 10,
              '[0.128, infinity]': 15
            },
            pricingParams: ['textInputRange']
          },
          name: 'textInput',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]': 24,
              '[0.032, 0.128]': 40,
              '[0.128, infinity]': 60
            },
            pricingParams: ['textInputRange']
          },
          name: 'textOutput',
          strategy: 'lookup',
          unit: 'millionTokens'
        }
      ]
    },
    releasedAt: '2025-10-30',
    settings: {
      extendParams: ['enableReasoning', 'reasoningBudgetToken'],
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      search: true
    },
    config: {
      deploymentName: 'qwen-max-2025-01-25'
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen Max',
    id: 'qwen-max',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 2.4 * 0.2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 2.4, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 9.6, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    settings: {
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    config: {
      deploymentName: 'qwen-long-latest'
    },
    contextWindowTokens: 10_000_000,
    displayName: 'Qwen Long',
    id: 'qwen-long',
    maxOutput: 32_768,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 2, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      reasoning: true,
      vision: true
    },
    config: {
      deploymentName: 'qwen3-omni-flash-2025-09-15'
    },
    contextWindowTokens: 65_536,
    displayName: 'Qwen3 Omni Flash',
    id: 'qwen3-omni-flash',
    maxOutput: 16_384,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 1.8, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 6.9, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-09-15',
    settings: {
      extendParams: ['enableReasoning', 'reasoningBudgetToken']
    },
    type: 'chat'
  },
  {
    abilities: {
      vision: true
    },
    config: {
      deploymentName: 'qwen-omni-turbo-2025-03-26'
    },
    contextWindowTokens: 32_768,
    displayName: 'Qwen Omni Turbo',
    id: 'qwen-omni-turbo',
    maxOutput: 2048,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 1.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 4.5, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      vision: true
    },
    contextWindowTokens: 32_768,
    displayName: 'Qwen2.5 Omni 7B',
    id: 'qwen2.5-omni-7b',
    maxOutput: 2048,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 6, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      vision: true
    },
    config: {
      deploymentName: 'qwen-vl-plus-2025-08-15'
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen VL Plus',
    id: 'qwen-vl-plus',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 0.8 * 0.2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 0.8, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 2, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      vision: true
    },
    config: {
      deploymentName: 'qwen-vl-max-2025-08-13'
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen VL Max',
    id: 'qwen-vl-max',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 1.6 * 0.2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textInput', rate: 1.6, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 4, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      vision: true
    },
    config: {
      deploymentName: 'qwen-vl-ocr-2025-04-13'
    },
    contextWindowTokens: 34_096,
    displayName: 'Qwen VL OCR',
    id: 'qwen-vl-ocr',
    maxOutput: 4096,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 5, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      reasoning: true,
      vision: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen3 VL 30B A3B Thinking',
    id: 'qwen3-vl-30b-a3b-thinking',
    maxOutput: 32_768,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.75, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 7.5, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    settings: {
      extendParams: ['reasoningBudgetToken']
    },
    type: 'chat'
  },
  {
    abilities: {
      vision: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen3 VL 30B A3B Instruct',
    id: 'qwen3-vl-30b-a3b-instruct',
    maxOutput: 32_768,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.75, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 3, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      reasoning: true,
      vision: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen3 VL 8B Thinking',
    id: 'qwen3-vl-8b-thinking',
    maxOutput: 32_768,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 5, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    settings: {
      extendParams: ['reasoningBudgetToken']
    },
    type: 'chat'
  },
  {
    abilities: {
      vision: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen3 VL 8B Instruct',
    id: 'qwen3-vl-8b-instruct',
    maxOutput: 32_768,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 2, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      reasoning: true,
      vision: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen3 VL 235B A22B Thinking',
    id: 'qwen3-vl-235b-a22b-thinking',
    maxOutput: 32_768,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 20, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    settings: {
      extendParams: ['reasoningBudgetToken']
    },
    type: 'chat'
  },
  {
    abilities: {
      vision: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen3 VL 235B A22B Instruct',
    id: 'qwen3-vl-235b-a22b-instruct',
    maxOutput: 32_768,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 8, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      reasoning: true,
      vision: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen3 VL 32B Thinking',
    id: 'qwen3-vl-32b-thinking',
    maxOutput: 32_768,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 20, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    settings: {
      extendParams: ['reasoningBudgetToken']
    },
    type: 'chat'
  },
  {
    abilities: {
      vision: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen3 VL 32B Instruct',
    id: 'qwen3-vl-32b-instruct',
    maxOutput: 32_768,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 8, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    config: {
      deploymentName: 'qwen-math-turbo-latest'
    },
    contextWindowTokens: 4096,
    displayName: 'Qwen Math Turbo',
    id: 'qwen-math-turbo',
    maxOutput: 3072,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 6, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    config: {
      deploymentName: 'qwen-math-plus-latest'
    },
    contextWindowTokens: 4096,
    displayName: 'Qwen Math Plus',
    id: 'qwen-math-plus',
    maxOutput: 3072,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 4, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 12, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    config: {
      deploymentName: 'qwen-coder-turbo-latest'
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen Coder Turbo',
    id: 'qwen-coder-turbo',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 6, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    config: {
      deploymentName: 'qwen-coder-plus-latest'
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen Coder Plus',
    id: 'qwen-coder-plus',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 3.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 7, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      reasoning: true,
      search: true
    },
    contextWindowTokens: 131_072,
    displayName: 'QwQ 32B',
    id: 'qwq-32b',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 6, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-03-06',
    settings: {
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      reasoning: true
    },
    contextWindowTokens: 32_768,
    displayName: 'QwQ 32B Preview',
    id: 'qwq-32b-preview',
    maxOutput: 16_384,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 6, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2024-11-28',
    type: 'chat'
  },
  {
    abilities: {
      reasoning: true,
      vision: true
    },
    config: {
      deploymentName: 'qvq-max-2025-05-15'
    },
    contextWindowTokens: 131_072,
    displayName: 'QVQ Max',
    id: 'qvq-max',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 8, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 32, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-05-15',
    type: 'chat'
  },
  {
    abilities: {
      reasoning: true,
      vision: true
    },
    config: {
      deploymentName: 'qvq-plus-2025-05-15'
    },
    contextWindowTokens: 131_072,
    displayName: 'QVQ Plus',
    id: 'qvq-plus',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 5, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-05-15',
    type: 'chat'
  },
  {
    abilities: {
      reasoning: true,
      vision: true
    },
    contextWindowTokens: 32_768,
    displayName: 'QVQ 72B Preview',
    id: 'qvq-72b-preview',
    maxOutput: 16_384,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 12, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 36, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2024-12-25',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen2.5 7B',
    id: 'qwen2.5-7b-instruct',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 1, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen2.5 14B',
    id: 'qwen2.5-14b-instruct',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 1, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 3, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen2.5 32B',
    id: 'qwen2.5-32b-instruct',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 6, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen2.5 72B',
    id: 'qwen2.5-72b-instruct',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 4, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 12, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true
    },
    contextWindowTokens: 1_000_000,
    displayName: 'Qwen2.5 14B 1M',
    id: 'qwen2.5-14b-instruct-1m',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 1, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 3, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-01-27',
    type: 'chat'
  },
  {
    contextWindowTokens: 4096,
    displayName: 'Qwen2.5 Math 7B',
    id: 'qwen2.5-math-7b-instruct',
    maxOutput: 3072,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 1, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 2, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    contextWindowTokens: 4096,
    displayName: 'Qwen2.5 Math 72B',
    id: 'qwen2.5-math-72b-instruct',
    maxOutput: 3072,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 4, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 12, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-07-23',
    type: 'chat'
  },
  {
    contextWindowTokens: 131_072,
    displayName: 'Qwen2.5 Coder 7B',
    id: 'qwen2.5-coder-7b-instruct',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 1, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 2, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    contextWindowTokens: 131_072,
    displayName: 'Qwen2.5 Coder 14B',
    id: 'qwen2.5-coder-14b-instruct',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 6, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    contextWindowTokens: 131_072,
    displayName: 'Qwen2.5 Coder 32B',
    id: 'qwen2.5-coder-32b-instruct',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 6, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      vision: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen2.5 VL 72B',
    id: 'qwen2.5-vl-72b-instruct',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 16, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 48, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-01-27',
    type: 'chat'
  },
  {
    abilities: {
      vision: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen2.5 VL 32B',
    id: 'qwen2.5-vl-32b-instruct',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 8, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 24, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-03-24',
    type: 'chat'
  },
  {
    abilities: {
      vision: true
    },
    contextWindowTokens: 131_072,
    displayName: 'Qwen2.5 VL 7B',
    id: 'qwen2.5-vl-7b-instruct',
    maxOutput: 8192,
    organization: 'Qwen',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 5, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-01-27',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      reasoning: true,
      search: true
    },
    contextWindowTokens: 131_072,
    displayName: 'DeepSeek R1 0528',
    id: 'deepseek-r1-0528',
    maxOutput: 16_384,
    organization: 'DeepSeek',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 4, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 16, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-05-28',
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      search: true
    },
    contextWindowTokens: 65_536,
    displayName: 'DeepSeek V3',
    id: 'deepseek-v3',
    maxOutput: 8192,
    organization: 'DeepSeek',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 8, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2025-01-27',
    type: 'chat'
  },
  {
    abilities: {
      reasoning: true
    },
    contextWindowTokens: 32_768,
    displayName: 'DeepSeek R1 Distill Qwen 1.5B',
    id: 'deepseek-r1-distill-qwen-1.5b',
    maxOutput: 16_384,
    organization: 'DeepSeek',
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
      reasoning: true
    },
    contextWindowTokens: 32_768,
    displayName: 'DeepSeek R1 Distill Qwen 7B',
    id: 'deepseek-r1-distill-qwen-7b',
    maxOutput: 16_384,
    organization: 'DeepSeek',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 1, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      reasoning: true
    },
    contextWindowTokens: 32_768,
    displayName: 'DeepSeek R1 Distill Qwen 14B',
    id: 'deepseek-r1-distill-qwen-14b',
    maxOutput: 16_384,
    organization: 'DeepSeek',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 1, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 3, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      reasoning: true
    },
    contextWindowTokens: 32_768,
    displayName: 'DeepSeek R1 Distill Qwen 32B',
    id: 'deepseek-r1-distill-qwen-32b',
    maxOutput: 16_384,
    organization: 'DeepSeek',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 6, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      reasoning: true
    },
    contextWindowTokens: 32_768,
    displayName: 'DeepSeek R1 Distill Llama 8B',
    id: 'deepseek-r1-distill-llama-8b',
    maxOutput: 16_384,
    organization: 'DeepSeek',
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
      reasoning: true
    },
    contextWindowTokens: 32_768,
    displayName: 'DeepSeek R1 Distill Llama 70B',
    id: 'deepseek-r1-distill-llama-70b',
    maxOutput: 16_384,
    organization: 'DeepSeek',
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

const qwenImageModels: ImageProviderModelCard[] = [
  {
    displayName: 'Qwen Image Edit',
    enabled: true,
    id: 'qwen-image-edit',
    organization: 'Qwen',
    parameters: {
      imageUrl: {
        default: ''
      },
      prompt: {
        default: ''
      },
      seed: { default: null }
    },
    pricing: {
      currency: 'CNY',
      units: [{ name: 'imageGeneration', rate: 0.3, strategy: 'fixed', unit: 'image' }]
    },
    releasedAt: '2025-09-18',
    type: 'image'
  },
  {
    displayName: 'Qwen Image',
    enabled: true,
    id: 'qwen-image',
    organization: 'Qwen',
    parameters: {
      prompt: {
        default: ''
      },
      seed: { default: null },
      size: {
        default: '1328x1328',
        enum: ['1664x928', '1472x1140', '1328x1328', '1140x1472', '928x1664']
      }
    },
    pricing: {
      currency: 'CNY',
      units: [{ name: 'imageGeneration', rate: 0.25, strategy: 'fixed', unit: 'image' }]
    },
    releasedAt: '2025-08-13',
    type: 'image'
  },
  {
    displayName: 'Wanxiang2.2 T2I Flash',
    enabled: true,
    id: 'wan2.2-t2i-flash',
    organization: 'Qwen',
    parameters: {
      height: { default: 1024, max: 1440, min: 512, step: 1 },
      prompt: {
        default: ''
      },
      seed: { default: null },
      width: { default: 1024, max: 1440, min: 512, step: 1 }
    },
    pricing: {
      currency: 'CNY',
      units: [{ name: 'imageGeneration', rate: 0.14, strategy: 'fixed', unit: 'image' }]
    },
    releasedAt: '2025-07-28',
    type: 'image'
  },
  {
    displayName: 'Wanxiang2.2 T2I Plus',
    enabled: true,
    id: 'wan2.2-t2i-plus',
    organization: 'Qwen',
    parameters: {
      height: { default: 1024, max: 1440, min: 512, step: 1 },
      prompt: {
        default: ''
      },
      seed: { default: null },
      width: { default: 1024, max: 1440, min: 512, step: 1 }
    },
    pricing: {
      currency: 'CNY',
      units: [{ name: 'imageGeneration', rate: 0.2, strategy: 'fixed', unit: 'image' }]
    },
    releasedAt: '2025-07-28',
    type: 'image'
  },
  {
    displayName: 'Wanxiang2.1 T2I Turbo',
    id: 'wanx2.1-t2i-turbo',
    organization: 'Qwen',
    parameters: {
      height: { default: 1024, max: 1440, min: 512, step: 1 },
      prompt: {
        default: ''
      },
      seed: { default: null },
      width: { default: 1024, max: 1440, min: 512, step: 1 }
    },
    pricing: {
      currency: 'CNY',
      units: [{ name: 'imageGeneration', rate: 0.14, strategy: 'fixed', unit: 'image' }]
    },
    releasedAt: '2025-01-08',
    type: 'image'
  },
  {
    displayName: 'Wanxiang2.1 T2I Plus',
    id: 'wanx2.1-t2i-plus',
    organization: 'Qwen',
    parameters: {
      height: { default: 1024, max: 1440, min: 512, step: 1 },
      prompt: {
        default: ''
      },
      seed: { default: null },
      width: { default: 1024, max: 1440, min: 512, step: 1 }
    },
    pricing: {
      currency: 'CNY',
      units: [{ name: 'imageGeneration', rate: 0.2, strategy: 'fixed', unit: 'image' }]
    },
    releasedAt: '2025-01-08',
    type: 'image'
  },
  {
    displayName: 'Wanxiang2.0 T2I Turbo',
    id: 'wanx2.0-t2i-turbo',
    organization: 'Qwen',
    parameters: {
      height: { default: 1024, max: 1440, min: 512, step: 1 },
      prompt: {
        default: ''
      },
      seed: { default: null },
      width: { default: 1024, max: 1440, min: 512, step: 1 }
    },
    pricing: {
      currency: 'CNY',
      units: [{ name: 'imageGeneration', rate: 0.04, strategy: 'fixed', unit: 'image' }]
    },
    releasedAt: '2025-01-17',
    type: 'image'
  },
  {
    displayName: 'Wanxiang v1',
    id: 'wanx-v1',
    organization: 'Qwen',
    parameters: {
      height: { default: 1024, max: 1440, min: 512, step: 1 },
      prompt: {
        default: ''
      },
      seed: { default: null },
      width: { default: 1024, max: 1440, min: 512, step: 1 }
    },
    pricing: {
      currency: 'CNY',
      units: [{ name: 'imageGeneration', rate: 0.16, strategy: 'fixed', unit: 'image' }]
    },
    releasedAt: '2024-05-22',
    type: 'image'
  },
  {
    displayName: 'FLUX.1 [schnell]',
    enabled: true,
    id: 'flux-schnell',
    organization: 'Qwen',
    parameters: {
      prompt: {
        default: ''
      },
      seed: { default: null },
      size: {
        default: '1024x1024',
        enum: ['512x1024', '768x512', '768x1024', '1024x576', '576x1024', '1024x1024']
      },
      steps: { default: 4, max: 12, min: 1 }
    },
    pricing: {
      currency: 'CNY',
      units: [{ name: 'imageGeneration', rate: 0, strategy: 'fixed', unit: 'image' }]
    },
    releasedAt: '2024-08-07',
    type: 'image'
  },
  {
    displayName: 'FLUX.1 [dev]',
    enabled: true,
    id: 'flux-dev',
    organization: 'Qwen',
    parameters: {
      prompt: {
        default: ''
      },
      seed: { default: null },
      size: {
        default: '1024x1024',
        enum: ['512x1024', '768x512', '768x1024', '1024x576', '576x1024', '1024x1024']
      },
      steps: { default: 50, max: 50, min: 1 }
    },
    pricing: {
      currency: 'CNY',
      units: [{ name: 'imageGeneration', rate: 0, strategy: 'fixed', unit: 'image' }]
    },
    releasedAt: '2024-08-07',
    type: 'image'
  },
  {
    displayName: 'FLUX.1-merged',
    enabled: true,
    id: 'flux-merged',
    organization: 'Qwen',
    parameters: {
      prompt: {
        default: ''
      },
      seed: { default: null },
      size: {
        default: '1024x1024',
        enum: ['512x1024', '768x512', '768x1024', '1024x576', '576x1024', '1024x1024']
      },
      steps: { default: 30, max: 30, min: 1 }
    },
    pricing: {
      currency: 'CNY',
      units: [{ name: 'imageGeneration', rate: 0, strategy: 'fixed', unit: 'image' }]
    },
    releasedAt: '2024-08-22',
    type: 'image'
  },
  {
    displayName: 'StableDiffusion 3.5 Large',
    id: 'stable-diffusion-3.5-large',
    organization: 'Qwen',
    parameters: {
      height: { default: 1024, max: 1024, min: 512, step: 128 },
      prompt: {
        default: ''
      },
      steps: { default: 40, max: 500, min: 1 },
      width: { default: 1024, max: 1024, min: 512, step: 128 }
    },
    pricing: {
      currency: 'CNY',
      units: [{ name: 'imageGeneration', rate: 0, strategy: 'fixed', unit: 'image' }]
    },
    releasedAt: '2024-10-25',
    type: 'image'
  },
  {
    displayName: 'StableDiffusion 3.5 Large Turbo',
    id: 'stable-diffusion-3.5-large-turbo',
    organization: 'Qwen',
    parameters: {
      height: { default: 1024, max: 1024, min: 512, step: 128 },
      prompt: {
        default: ''
      },
      steps: { default: 40, max: 500, min: 1 },
      width: { default: 1024, max: 1024, min: 512, step: 128 }
    },
    pricing: {
      currency: 'CNY',
      units: [{ name: 'imageGeneration', rate: 0, strategy: 'fixed', unit: 'image' }]
    },
    releasedAt: '2024-10-25',
    type: 'image'
  },
  {
    displayName: 'StableDiffusion xl',
    id: 'stable-diffusion-xl',
    organization: 'Qwen',
    parameters: {
      height: { default: 1024, max: 1024, min: 512, step: 128 },
      prompt: {
        default: ''
      },
      steps: { default: 50, max: 500, min: 1 },
      width: { default: 1024, max: 1024, min: 512, step: 128 }
    },
    pricing: {
      currency: 'CNY',
      units: [{ name: 'imageGeneration', rate: 0, strategy: 'fixed', unit: 'image' }]
    },
    releasedAt: '2024-04-09',
    type: 'image'
  },
  {
    displayName: 'StableDiffusion v1.5',
    id: 'stable-diffusion-v1.5',
    organization: 'Qwen',
    parameters: {
      height: { default: 512, max: 1024, min: 512, step: 128 },
      prompt: {
        default: ''
      },
      steps: { default: 50, max: 500, min: 1 },
      width: { default: 512, max: 1024, min: 512, step: 128 }
    },
    pricing: {
      currency: 'CNY',
      units: [{ name: 'imageGeneration', rate: 0, strategy: 'fixed', unit: 'image' }]
    },
    releasedAt: '2024-04-09',
    type: 'image'
  }
];

export const allModels = [...qwenChatModels, ...qwenImageModels];

export default allModels;
