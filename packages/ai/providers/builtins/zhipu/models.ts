import type { ChatProviderModelCard, ImageProviderModelCard } from '../../model-types';

// price: https://bigmodel.cn/pricing
// ref: https://docs.bigmodel.cn/cn/guide/start/model-overview

const zhipuChatModels: ChatProviderModelCard[] = [
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
        {
          lookup: {
            prices: {
              '[0, 0.032]_[0, 0.0002]': 0.4,
              '[0, 0.032]_[0.0002, infinity]': 0.6,
              '[0.032, 0.2]': 0.8
            },
            pricingParams: ['textInput', 'textOutput']
          },
          name: 'textInput_cacheRead',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]_[0, 0.0002]': 2,
              '[0, 0.032]_[0.0002, infinity]': 3,
              '[0.032, 0.2]': 4
            },
            pricingParams: ['textInput', 'textOutput']
          },
          name: 'textInput',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]_[0, 0.0002]': 8,
              '[0, 0.032]_[0.0002, infinity]': 14,
              '[0.032, 0.2]': 16
            },
            pricingParams: ['textInput', 'textOutput']
          },
          name: 'textOutput',
          strategy: 'lookup',
          unit: 'millionTokens'
        }
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
        {
          lookup: {
            prices: {
              '[0, 0.032]_[0, 0.0002]': 0.4,
              '[0, 0.032]_[0.0002, infinity]': 0.6,
              '[0.032, 0.2]': 0.8
            },
            pricingParams: ['textInput', 'textOutput']
          },
          name: 'textInput_cacheRead',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]_[0, 0.0002]': 2,
              '[0, 0.032]_[0.0002, infinity]': 3,
              '[0.032, 0.2]': 4
            },
            pricingParams: ['textInput', 'textOutput']
          },
          name: 'textInput',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]_[0, 0.0002]': 8,
              '[0, 0.032]_[0.0002, infinity]': 14,
              '[0.032, 0.2]': 16
            },
            pricingParams: ['textInput', 'textOutput']
          },
          name: 'textOutput',
          strategy: 'lookup',
          unit: 'millionTokens'
        }
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
      search: true,
      vision: true
    },
    contextWindowTokens: 65_536,
    displayName: 'GLM-4.5V',
    enabled: true,
    id: 'glm-4.5v',
    maxOutput: 16_384,
    pricing: {
      currency: 'CNY',
      units: [
        {
          lookup: {
            prices: {
              '[0, 0.032]': 0.4,
              '[0.032, infinity]': 0.8
            },
            pricingParams: ['textInput']
          },
          name: 'textInput_cacheRead',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]': 2,
              '[0.032, infinity]': 4
            },
            pricingParams: ['textInput']
          },
          name: 'textInput',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]': 6,
              '[0.032, infinity]': 12
            },
            pricingParams: ['textInput']
          },
          name: 'textOutput',
          strategy: 'lookup',
          unit: 'millionTokens'
        }
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
    id: 'glm-4.5',
    maxOutput: 98_304,
    pricing: {
      currency: 'CNY',
      units: [
        {
          lookup: {
            prices: {
              '[0, 0.032]_[0, 0.0002]': 0.4,
              '[0, 0.032]_[0.0002, infinity]': 0.6,
              '[0.032, 0.128]': 0.8
            },
            pricingParams: ['textInput', 'textOutput']
          },
          name: 'textInput_cacheRead',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]_[0, 0.0002]': 2,
              '[0, 0.032]_[0.0002, infinity]': 3,
              '[0.032, 0.128]': 4
            },
            pricingParams: ['textInput', 'textOutput']
          },
          name: 'textInput',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]_[0, 0.0002]': 8,
              '[0, 0.032]_[0.0002, infinity]': 14,
              '[0.032, 0.128]': 16
            },
            pricingParams: ['textInput', 'textOutput']
          },
          name: 'textOutput',
          strategy: 'lookup',
          unit: 'millionTokens'
        }
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
    displayName: 'GLM-4.5-X',
    id: 'glm-4.5-x',
    maxOutput: 98_304,
    pricing: {
      currency: 'CNY',
      units: [
        {
          lookup: {
            prices: {
              '[0, 0.032]': 1.6,
              '[0, 0.032]_[0.0002, infinity]': 2.4,
              '[0.032, 0.128]': 3.2
            },
            pricingParams: ['textInput', 'textOutput']
          },
          name: 'textInput_cacheRead',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]_[0, 0.0002]': 8,
              '[0, 0.032]_[0.0002, infinity]': 12,
              '[0.032, 0.128]': 16
            },
            pricingParams: ['textInput', 'textOutput']
          },
          name: 'textInput',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]_[0, 0.0002]': 16,
              '[0, 0.032]_[0.0002, infinity]': 32,
              '[0.032, 0.128]': 64
            },
            pricingParams: ['textInput', 'textOutput']
          },
          name: 'textOutput',
          strategy: 'lookup',
          unit: 'millionTokens'
        }
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
    id: 'glm-4.5-air',
    maxOutput: 98_304,
    pricing: {
      currency: 'CNY',
      units: [
        {
          lookup: {
            prices: {
              '[0, 0.032]': 0.16,
              '[0.032, 0.128]': 0.24
            },
            pricingParams: ['textInput']
          },
          name: 'textInput_cacheRead',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]': 0.8,
              '[0.032, 0.128]': 1.2
            },
            pricingParams: ['textInput']
          },
          name: 'textInput',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]_[0, 0.0002]': 2,
              '[0, 0.032]_[0.0002, infinity]': 6,
              '[0.032, 0.128]': 8
            },
            pricingParams: ['textInput', 'textOutput']
          },
          name: 'textOutput',
          strategy: 'lookup',
          unit: 'millionTokens'
        }
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
    displayName: 'GLM-4.5-AirX',
    id: 'glm-4.5-airx',
    maxOutput: 98_304,
    pricing: {
      currency: 'CNY',
      units: [
        {
          lookup: {
            prices: {
              '[0, 0.032]': 0.8,
              '[0.032, 0.128]': 1.6
            },
            pricingParams: ['textInput']
          },
          name: 'textInput_cacheRead',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]': 4,
              '[0.032, 0.128]': 8
            },
            pricingParams: ['textInput']
          },
          name: 'textInput',
          strategy: 'lookup',
          unit: 'millionTokens'
        },
        {
          lookup: {
            prices: {
              '[0, 0.032]_[0, 0.0002]': 12,
              '[0, 0.032]_[0.0002, infinity]': 16,
              '[0.032, 0.128]': 32
            },
            pricingParams: ['textInput', 'textOutput']
          },
          name: 'textOutput',
          strategy: 'lookup',
          unit: 'millionTokens'
        }
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
    displayName: 'GLM-4.5-Flash',
    enabled: true,
    free: true,
    id: 'glm-4.5-flash',
    maxOutput: 98_304,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput_cacheRead', rate: 0, strategy: 'fixed', unit: 'millionTokens' },
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
      reasoning: true,
      vision: true
    },
    contextWindowTokens: 65_536,
    displayName: 'GLM-4.1V-Thinking-FlashX',
    id: 'glm-4.1v-thinking-flashx',
    maxOutput: 32_768,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 2, strategy: 'fixed', unit: 'millionTokens' },
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
    contextWindowTokens: 65_536,
    displayName: 'GLM-4.1V-Thinking-Flash',
    free: true,
    id: 'glm-4.1v-thinking-flash',
    maxOutput: 32_768,
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
    contextWindowTokens: 16_384,
    displayName: 'GLM-Zero-Preview',
    id: 'glm-zero-preview',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 10, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 10, strategy: 'fixed', unit: 'millionTokens' }
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
    displayName: 'GLM-Z1-Air',
    id: 'glm-z1-air',
    maxOutput: 32_768,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0.5, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    settings: {
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      reasoning: true,
      search: true
    },
    contextWindowTokens: 32_768,
    displayName: 'GLM-Z1-AirX',
    id: 'glm-z1-airx',
    maxOutput: 32_768,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 5, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    settings: {
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      reasoning: true,
      search: true
    },
    contextWindowTokens: 131_072,
    displayName: 'GLM-Z1-FlashX',
    id: 'glm-z1-flashx',
    maxOutput: 32_768,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.1, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0.1, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    settings: {
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      reasoning: true,
      search: true
    },
    contextWindowTokens: 131_072,
    displayName: 'GLM-Z1-Flash',
    free: true,
    id: 'glm-z1-flash',
    maxOutput: 32_768,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    settings: {
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      search: true
    },
    contextWindowTokens: 131_072,
    displayName: 'GLM-4-Flash-250414',
    free: true,
    id: 'glm-4-flash-250414',
    maxOutput: 32_768,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    settings: {
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      search: true
    },
    contextWindowTokens: 131_072,
    displayName: 'GLM-4-FlashX-250414',
    id: 'glm-4-flashx',
    maxOutput: 4095,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.1, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0.1, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    settings: {
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      search: true
    },
    contextWindowTokens: 1_024_000,
    displayName: 'GLM-4-Long',
    id: 'glm-4-long',
    maxOutput: 4095,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 1, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 1, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    settings: {
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      search: true
    },
    contextWindowTokens: 131_072,
    displayName: 'GLM-4-Air-250414',
    id: 'glm-4-air-250414',
    maxOutput: 16_384,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0.5, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    settings: {
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      search: true
    },
    contextWindowTokens: 8192,
    displayName: 'GLM-4-AirX',
    id: 'glm-4-airx',
    maxOutput: 4095,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 10, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 10, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    settings: {
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      search: true
    },
    contextWindowTokens: 131_072,
    displayName: 'GLM-4-Plus',
    id: 'glm-4-plus',
    maxOutput: 4095,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 5, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 5, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    settings: {
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      functionCall: true,
      search: true
    },
    contextWindowTokens: 131_072,
    displayName: 'GLM-4-0520',
    id: 'glm-4-0520', // Deprecation date: December 30, 2025
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 100, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 100, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    settings: {
      searchImpl: 'params'
    },
    type: 'chat'
  },
  {
    abilities: {
      vision: true
    },
    contextWindowTokens: 4096,
    displayName: 'GLM-4V-Flash',
    free: true,
    id: 'glm-4v-flash',
    maxOutput: 8192,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    releasedAt: '2024-12-09',
    type: 'chat'
  },
  {
    abilities: {
      vision: true
    },
    contextWindowTokens: 16_000,
    displayName: 'GLM-4V-Plus-0111',
    id: 'glm-4v-plus-0111',
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 4, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 4, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    abilities: {
      vision: true
    },
    contextWindowTokens: 4096,
    displayName: 'GLM-4V',
    id: 'glm-4v',
    maxOutput: 1024,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 50, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 50, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    contextWindowTokens: 131_072,
    displayName: 'CodeGeeX-4',
    enabled: true,
    id: 'codegeex-4',
    maxOutput: 32_768,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 0.1, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 0.1, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    contextWindowTokens: 8192,
    displayName: 'CharGLM-4',
    id: 'charglm-4',
    maxOutput: 4000,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 1, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 1, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  },
  {
    contextWindowTokens: 8192,
    displayName: 'Emohaa',
    id: 'emohaa',
    maxOutput: 4000,
    pricing: {
      currency: 'CNY',
      units: [
        { name: 'textInput', rate: 15, strategy: 'fixed', unit: 'millionTokens' },
        { name: 'textOutput', rate: 15, strategy: 'fixed', unit: 'millionTokens' }
      ]
    },
    type: 'chat'
  }
];

const zhipuImageModels: ImageProviderModelCard[] = [
  // https://bigmodel.cn/dev/api/image-model/cogview
  {
    displayName: 'CogView-4',
    enabled: true,
    id: 'cogview-4',
    parameters: {
      prompt: {
        default: ''
      },
      size: {
        default: '1024x1024',
        enum: ['1024x1024', '768x1344', '864x1152', '1344x768', '1152x864', '1440x720', '720x1440']
      }
    },
    pricing: {
      currency: 'CNY',
      units: [{ name: 'imageGeneration', rate: 0.06, strategy: 'fixed', unit: 'image' }]
    },
    releasedAt: '2025-03-04',
    type: 'image'
  }
];

export const allModels = [...zhipuChatModels, ...zhipuImageModels];

export default allModels;
