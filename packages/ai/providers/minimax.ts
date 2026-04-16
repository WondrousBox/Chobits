import { OpenAICompatibleProvider } from './openai-compatible';

export class MiniMaxProvider extends OpenAICompatibleProvider {
  constructor() {
    super('minimax');
  }
}
