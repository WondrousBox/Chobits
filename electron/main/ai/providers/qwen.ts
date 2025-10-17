import { OpenAICompatibleProvider } from './openai-compatible';

export class QwenProvider extends OpenAICompatibleProvider {
  constructor() {
    // 阿里云百炼（DashScope）OpenAI 兼容网关地址请在设置中填写
    super({ id: 'qwen', label: '通义千问 (Qwen)', model: 'qwen2.5' });
  }
}
