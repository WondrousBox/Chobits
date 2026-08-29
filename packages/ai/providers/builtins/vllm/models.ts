import type { ProviderModelDefinition } from '../../model-types';

// vLLM 自托管的占位模型
// 实际可用模型以服务端的 OpenAI 兼容接口 /v1/models 返回为准

const vllmChatModels: ProviderModelDefinition[] = [
  {
    description: 'vLLM 自托管的默认对话模型（占位）；实际模型列表以服务端 /v1/models 为准。',
    displayName: 'Qwen2.5 7B Instruct AWQ',
    enabled: true,
    id: 'Qwen2.5-7B-Instruct-AWQ',
    tags: ['self-hosted', 'vllm'],
    type: 'chat'
  }
];

export default vllmChatModels;
