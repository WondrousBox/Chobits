import { OpenAICompatibleProvider } from './openai-compatible';

export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor() {
    super({ id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' });
  }
}
