import { OpenAICompatibleProvider } from './openai-compatible';

export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor() {
    super('deepseek');
  }
}
