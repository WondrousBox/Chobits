import type { ProviderConfig } from '../../../types';
import type { BuiltinProviderDefinition } from '../../types';
import zhipuModels from './models';

const zhipuSchema: ProviderConfig = {
  id: 'zhipu',
  label: '智谱 (GLM)',
  enabled: true,
  icon: 'providers/icons/zhipu-color.svg',
  fields: [
    { key: 'apiKey', label: 'API Key', type: 'password', required: true },
    { key: 'baseUrl', label: 'Base URL (可选，OpenAI兼容网关)', type: 'text' }
  ]
};

export const zhipuDefinition: BuiltinProviderDefinition = {
  id: 'zhipu',
  aliases: ['zhipu', 'zhipuai'],
  source: 'builtin',
  display: {
    label: '智谱 (GLM)',
    description: 'ZhiPu AI provides an open platform for multimodal and language models across text processing, image understanding, and coding assistance.',
    icon: 'providers/icons/zhipu-color.svg',
    website: 'https://zhipuai.cn'
  },
  catalog: {
    name: 'ZhiPu',
    checkModel: 'glm-4.5-flash',
    modelsUrl: 'https://open.bigmodel.cn/dev/howuse/model',
    settings: {
      proxyUrl: {
        placeholder: 'https://open.bigmodel.cn/api/paas/v4'
      },
      sdkType: 'openai',
      showModelFetcher: true
    }
  },
  protocol: {
    kind: 'openai-compatible',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4/',
    piBaseUrl: 'https://open.bigmodel.cn/api/paas/v4/'
  },
  capabilities: {
    chat: true,
    embeddings: true,
    imageGeneration: true,
    modelListing: true,
    musicGeneration: false,
    speechSynthesis: false,
    transcribe: true
  },
  defaults: {
    models: {
      chat: 'glm-4.5-flash',
      embeddings: 'embedding-3',
      imageGeneration: 'cogview-3-flash',
      transcribe: 'glm-asr'
    }
  },
  models: {
    strategy: 'builtin',
    items: zhipuModels
  },
  schema: zhipuSchema
};
