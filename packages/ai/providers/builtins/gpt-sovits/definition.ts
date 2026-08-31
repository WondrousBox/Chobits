import type { ProviderConfig } from '../../../types';
import type { BuiltinProviderDefinition } from '../../types';
import gptSovitsModels from './models';

const gptSovitsSchema: ProviderConfig = {
  id: 'gpt-sovits',
  label: 'GPT-SoVITS (self-hosted)',
  enabled: true,
  locales: {
    en: {
      label: 'GPT-SoVITS (self-hosted)',
      fields: {
        apiKey: 'API Key',
        baseUrl: 'Base URL',
        allowInsecureTls: 'TLS Certificate Verification'
      }
    },
    'zh-CN': {
      label: 'GPT-SoVITS（自托管）',
      fields: {
        apiKey: 'API Key',
        baseUrl: 'Base URL',
        allowInsecureTls: 'TLS 证书校验'
      }
    }
  },
  fields: [
    { key: 'baseUrl', label: 'Base URL', type: 'text' },
    { key: 'apiKey', label: 'API Key（服务端启用鉴权时必填）', type: 'password' },
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

export const gptSovitsDefinition: BuiltinProviderDefinition = {
  id: 'gpt-sovits',
  aliases: ['gpt-sovits', 'gptsovits'],
  source: 'builtin',
  display: {
    label: 'GPT-SoVITS (self-hosted)',
    description: '对接自部署的 GPT-SoVITS 语音克隆 TTS 服务（OpenAI 兼容 /v1/audio/speech 接口），仅支持语音合成。',
    website: 'https://github.com/RVC-Boss/GPT-SoVITS'
  },
  catalog: {
    name: 'GPT-SoVITS',
    checkModel: 'chi-tts',
    defaultShowBrowserRequest: true,
    settings: {
      defaultShowBrowserRequest: true,
      showModelFetcher: false
    }
  },
  protocol: {
    kind: 'openai-compatible',
    baseUrl: 'https://124.221.9.24:9880',
    piBaseUrl: 'https://124.221.9.24:9880'
  },
  capabilities: {
    chat: false,
    embeddings: false,
    imageGeneration: false,
    modelListing: true,
    musicGeneration: false,
    speechSynthesis: true,
    transcribe: false
  },
  defaults: {
    models: {
      speechSynthesis: 'chi-tts'
    },
    // 内置默认服务器：运行时回落与设置页表单预填共用这份配置
    config: {
      allowInsecureTls: 'true',
      apiKey: '9479f6c491217e258c7f8643d4df4da8af295f1d8b816883',
      baseUrl: 'https://124.221.9.24:9880'
    }
  },
  models: {
    strategy: 'builtin',
    items: gptSovitsModels
  },
  schema: gptSovitsSchema
};
