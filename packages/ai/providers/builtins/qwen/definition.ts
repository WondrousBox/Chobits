import type { ProviderConfig } from '../../../types';
import type { BuiltinProviderDefinition } from '../../types';
import qwenModels from './models';

const qwenSchema: ProviderConfig = {
  id: 'qwen',
  label: '通义千问 (Qwen)',
  enabled: true,
  icon: 'providers/icons/qwen-color.svg',
  fields: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    { key: 'baseUrl', label: 'Base URL (可选，OpenAI兼容网关)', type: 'text' }
  ]
};

export const qwenDefinition: BuiltinProviderDefinition = {
  id: 'qwen',
  aliases: ['qwen'],
  source: 'builtin',
  display: {
    label: '通义千问 (Qwen)',
    description: "Qwen is Alibaba Cloud's large-scale language model with strong understanding and generation, covering Q&A, writing, opinion expression, and code across many domains.",
    icon: 'providers/icons/qwen-color.svg',
    website: 'https://www.aliyun.com/product/bailian'
  },
  catalog: {
    name: 'Aliyun Bailian',
    checkModel: 'qwen-flash',
    modelsUrl: 'https://help.aliyun.com/zh/dashscope/developer-reference/api-details',
    disableBrowserRequest: true,
    settings: {
      disableBrowserRequest: true,
      proxyUrl: {
        placeholder: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
      },
      responseAnimation: {
        speed: 2,
        text: 'smooth'
      },
      sdkType: 'openai',
      showDeployName: true,
      showModelFetcher: true
    }
  },
  protocol: {
    kind: 'openai-compatible',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    piBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  },
  capabilities: {
    chat: true,
    embeddings: true,
    imageGeneration: false,
    modelListing: true,
    musicGeneration: false,
    speechSynthesis: false,
    transcribe: false
  },
  defaults: {
    models: {
      chat: 'qwen2.5',
      embeddings: 'text-embedding-v4'
    }
  },
  models: {
    strategy: 'builtin',
    items: qwenModels
  },
  schema: qwenSchema
};
