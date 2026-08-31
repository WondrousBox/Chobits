import type { ProviderConfig } from '../../../types';
import type { BuiltinProviderDefinition } from '../../types';
import vllmModels from './models';

const vllmSchema: ProviderConfig = {
  id: 'vllm',
  label: 'vLLM（自托管）',
  enabled: true,
  locales: {
    en: {
      label: 'vLLM (self-hosted)',
      fields: {
        allowInsecureTls: 'TLS Certificate Verification',
        apiKey: 'API Key',
        baseUrl: 'Base URL'
      }
    },
    'zh-CN': {
      label: 'vLLM（自托管）',
      fields: {
        allowInsecureTls: 'TLS 证书校验',
        apiKey: 'API Key',
        baseUrl: 'Base URL'
      }
    }
  },
  fields: [
    { key: 'baseUrl', label: 'Base URL', type: 'text' },
    // 内置了默认服务器的 API Key（见 defaults.config），留空时回落到内置值，故不再必填
    { key: 'apiKey', label: 'API Key', type: 'password' },
    {
      key: 'allowInsecureTls',
      label: 'TLS 证书校验（自签名证书时选「允许自签名」）',
      type: 'select',
      options: [
        { label: '严格校验（默认）', value: 'false' },
        { label: '允许自签名证书', value: 'true' }
      ]
    }
  ]
};

export const vllmDefinition: BuiltinProviderDefinition = {
  id: 'vllm',
  aliases: ['vllm'],
  source: 'builtin',
  display: {
    label: 'vLLM（自托管）',
    description: '对接自托管的 vLLM 推理服务（OpenAI 兼容 API）。默认走 Chi 门面 serve.py：model 选 chi-chat 聊天、chi-translate 翻译，支持自签名 HTTPS 证书。',
    website: 'https://docs.vllm.ai'
  },
  catalog: {
    name: 'vLLM',
    // 占位默认模型，实际可用模型以服务端 /v1/models 为准
    checkModel: 'chi-chat',
    settings: {
      proxyUrl: {
        placeholder: 'https://124.221.9.24:8080/v1'
      },
      sdkType: 'openai',
      showModelFetcher: true
    }
  },
  protocol: {
    kind: 'openai-compatible',
    baseUrl: 'https://124.221.9.24:8080/v1',
    piBaseUrl: 'https://124.221.9.24:8080/v1'
  },
  capabilities: {
    chat: true,
    embeddings: false,
    imageGeneration: false,
    modelListing: true,
    musicGeneration: false,
    speechSynthesis: false,
    transcribe: false
  },
  defaults: {
    models: {
      // 占位默认模型，实际以服务端 /v1/models 返回为准
      chat: 'chi-chat'
    },
    // 内置默认服务器（Chi 门面 serve.py）：运行时回落与设置页表单预填共用这份配置
    config: {
      allowInsecureTls: 'true',
      apiKey: 'S8-ae2yp0H0DxYG5A7I9g3xBAvaqiUmOSDDuzEcjxms',
      baseUrl: 'https://124.221.9.24:8080/v1'
    }
  },
  models: {
    // 内置一个占位默认模型；listOpenAIModels 在没有内置模型时会回退到服务端 /v1/models 拉取
    strategy: 'builtin',
    items: vllmModels
  },
  schema: vllmSchema
};
