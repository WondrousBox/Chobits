import type { ProviderModelDefinition } from '../../model-types';

// Chii 门面 serve.py 的内置模型：服务端 /v1/models 同样返回这两个“模型”，
// 门面按 model 名路由 —— chii-chat 走聊天（注入 system prompt、固定采样），
// chii-translate 走翻译（自动判断中日方向）。
// 旧 id（chi-chat/chi-translate）由 model-aliases 兼容映射

const vllmChatModels: ProviderModelDefinition[] = [
  {
    displayName: 'Chii Chat',
    enabled: true,
    id: 'chii-chat',
    tags: ['self-hosted', 'vllm'],
    type: 'chat'
  },
  {
    displayName: 'Chii Translate',
    enabled: true,
    id: 'chii-translate',
    tags: ['self-hosted', 'vllm', 'translate'],
    type: 'chat'
  }
];

export default vllmChatModels;
