import { OpenAICompatibleProvider } from './openai-compatible';

export class QwenProvider extends OpenAICompatibleProvider {
  constructor() {
    super('qwen');
  }
}
