import { getBuiltinProviderMetadata } from './metadata';
import { OpenAICompatibleProvider } from './openai-compatible';

export class QwenProvider extends OpenAICompatibleProvider {
  constructor() {
    const metadata = getBuiltinProviderMetadata('qwen');
    if (!metadata) {
      throw new Error('Missing built-in provider metadata: qwen');
    }

    super({
      id: metadata.id,
      label: metadata.label,
      model: metadata.defaultModel,
      baseUrl: metadata.providerBaseUrl
    });
  }
}
