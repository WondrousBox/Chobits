import { OpenAICompatibleProvider } from './openai-compatible';

export class ZhipuProvider extends OpenAICompatibleProvider {
  constructor() {
    // 智谱 GLM OpenAI 兼容网关地址可能不同，请在设置中填写
    super({ id: 'zhipu', baseUrl: 'https://open.bigmodel.cn/api/paas/v4/', label: '智谱 (GLM)', model: 'glm-4-flash' });
  }
}
