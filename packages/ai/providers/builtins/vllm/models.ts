import type { ProviderModelDefinition } from '../../model-types';

// Chi 门面 serve.py 的内置模型：服务端 /v1/models 同样返回这两个“模型”，
// 门面按 model 名路由 —— chi-chat 走聊天（注入 system prompt、固定采样），
// chi-translate 走翻译（自动判断中日方向）。

const vllmChatModels: ProviderModelDefinition[] = [
  {
    description: 'Chi 对话模型（serve.py 门面路由：注入 chi_system.md，固定 temp 0.4 / freq_pen 0.8）。',
    displayName: 'Chi Chat',
    enabled: true,
    id: 'chi-chat',
    tags: ['self-hosted', 'vllm'],
    type: 'chat'
  },
  {
    description: 'Chi 翻译模型（serve.py 门面路由：中日互译，自动判断方向，temp 0.2）。',
    displayName: 'Chi Translate',
    enabled: true,
    id: 'chi-translate',
    tags: ['self-hosted', 'vllm', 'translate'],
    type: 'chat'
  }
];

export default vllmChatModels;
