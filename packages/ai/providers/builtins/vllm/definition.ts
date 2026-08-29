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
    { key: 'apiKey', label: 'API Key', type: 'password', required: true },
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
    description: '对接自托管的 vLLM 推理服务（OpenAI 兼容 API），模型列表以服务端 /v1/models 为准，支持自签名 HTTPS 证书。',
    website: 'https://docs.vllm.ai'
  },
  catalog: {
    name: 'vLLM',
    // 占位默认模型，实际可用模型以服务端 /v1/models 为准
    checkModel: 'Qwen2.5-7B-Instruct-AWQ',
    settings: {
      proxyUrl: {
        placeholder: 'https://127.0.0.1:8000/v1'
      },
      sdkType: 'openai',
      showModelFetcher: true
    }
  },
  protocol: {
    kind: 'openai-compatible',
    baseUrl: 'https://127.0.0.1:8000/v1',
    piBaseUrl: 'https://127.0.0.1:8000/v1'
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
      chat: 'Qwen2.5-7B-Instruct-AWQ'
    }
  },
  models: {
    // 内置一个占位默认模型；listOpenAIModels 在没有内置模型时会回退到服务端 /v1/models 拉取
    strategy: 'builtin',
    items: vllmModels
  },
  schema: vllmSchema
};
