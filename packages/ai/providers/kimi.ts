import { OpenAICompatibleProvider } from './openai-compatible';

export class KimiProvider extends OpenAICompatibleProvider {
  constructor() {
    super('kimi');
  }
}
