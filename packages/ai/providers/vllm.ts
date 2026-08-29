import { OpenAICompatibleProvider } from './openai-compatible';

export class VllmProvider extends OpenAICompatibleProvider {
  constructor() {
    super('vllm');
  }
}
