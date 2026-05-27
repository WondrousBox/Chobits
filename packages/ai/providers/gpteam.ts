import { OpenAICompatibleProvider } from './openai-compatible';

export class GPTeamProvider extends OpenAICompatibleProvider {
  constructor() {
    super('gpteam');
  }
}
