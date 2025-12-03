import { OpenAICompatibleProvider } from './openai-compatible';

export class QwenProvider extends OpenAICompatibleProvider {
  constructor() {
    // 阿里云百炼（DashScope）OpenAI 兼容网关地址
    // 北京地域：https://dashscope.aliyuncs.com/compatible-mode/v1
    // 新加坡地域：https://dashscope-intl.aliyuncs.com/compatible-mode/v1
    super({
      id: 'qwen',
      label: '通义千问 (Qwen)',
      model: 'qwen2.5',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' // 默认使用北京地域
    });
  }
}
