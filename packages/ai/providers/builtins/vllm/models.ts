import type { ProviderModelDefinition } from '../../model-types';

// vLLM 私有部署的占位模型
// 实际可用模型以服务端的 OpenAI 兼容接口 /v1/models 返回为准

const vllmChatModels: ProviderModelDefinition[] = [
  {
    description: 'vLLM 私有部署的默认对话模型（占位）；实际模型列表以服务端 /v1/models 为准。',
    displayName: 'Qwen2.5 7B Instruct AWQ',
    enabled: true,
    id: 'Qwen2.5-7B-Instruct-AWQ',
    tags: ['self-hosted', 'vllm'],
    type: 'chat'
  }
];

export default vllmChatModels;
