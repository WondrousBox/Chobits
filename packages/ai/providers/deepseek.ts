import { getBuiltinProviderMetadata } from './metadata';
import { OpenAICompatibleProvider } from './openai-compatible';

export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor() {
    const metadata = getBuiltinProviderMetadata('deepseek');
    if (!metadata) {
      throw new Error('Missing built-in provider metadata: deepseek');
    }

    super({
      id: metadata.id,
      label: metadata.label,
      baseUrl: metadata.providerBaseUrl,
      model: metadata.defaultModel
    });
  }
}
