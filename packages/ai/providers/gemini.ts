import { loadProviderSchema } from '../schema-loader';
import { ChatRequest, ChatResponse, EmbeddingRequest, EmbeddingResponse, ProviderAdapter, ProviderCapabilities, ProviderConfig, ProviderDefaultModels, ProviderSecrets, StreamEvent } from '../types';
import { createGeminiClient, executeGeminiChat, type GeminiRuntimeSecrets, listGeminiModels } from './gemini-runtime';
import { getBuiltinProviderMetadata } from './metadata';

type GeminiSecrets = GeminiRuntimeSecrets;

export class GeminiProvider implements ProviderAdapter {
  private readonly metadata = getBuiltinProviderMetadata('gemini');
  readonly id = 'gemini';
  readonly label = this.metadata?.label || 'Google Gemini';
  private secrets: GeminiSecrets = {};
  private readonly defaultModel = this.metadata?.defaultModel || 'gemini-1.5-flash';

  isConfigured(): boolean {
    return !!this.secrets.apiKey;
  }

  getCapabilities(): ProviderCapabilities {
    return {
      ...(this.metadata?.capabilities || {
        chat: true,
        embeddings: false,
        imageGeneration: false,
        modelListing: true,
        transcribe: false
      })
    };
  }

  getDefaultModels(): ProviderDefaultModels {
    return {
      ...(this.metadata?.defaultModels || {
        chat: this.defaultModel
      })
    };
  }

  getConfigSchema(): ProviderConfig {
    const fallback: ProviderConfig = {
      id: this.id,
      label: this.label,
      enabled: true,
      fields: [
        { key: 'apiKey', label: 'API Key', type: 'password', required: true },
        { key: 'model', label: '默认模型（如 gemini-1.5-flash）', type: 'text' }
      ]
    };
    return loadProviderSchema(this.id, fallback);
  }
  setSecrets(secrets: ProviderSecrets): void {
    this.secrets = { ...this.secrets, ...(secrets as any) };
  }
  getSecrets(): ProviderSecrets {
    return this.secrets;
  }

  private resolveSecrets(override?: Partial<GeminiSecrets>): GeminiSecrets {
    return {
      ...this.secrets,
      ...(override || {})
    };
  }

  private client(override?: Partial<GeminiSecrets>): ReturnType<typeof createGeminiClient> {
    return createGeminiClient(this.resolveSecrets(override));
  }

  async chat(req: ChatRequest, onStream?: (event: StreamEvent) => void, signal?: AbortSignal): Promise<ChatResponse> {
    const overrideSecrets = (req.extras as any)?.secrets as Partial<GeminiSecrets> | undefined;
    const resolvedSecrets = this.resolveSecrets(overrideSecrets);

    return executeGeminiChat(
      {
        client: this.client(overrideSecrets),
        request: req,
        providerId: this.id,
        defaultModel: this.defaultModel,
        configuredModel: resolvedSecrets.model
      },
      onStream,
      signal
    );
  }

  async embed(req: EmbeddingRequest): Promise<EmbeddingResponse> {
    void req;
    throw new Error('Gemini embeddings not implemented');
  }

  async listModels(opts?: { secrets?: Partial<GeminiSecrets> }): Promise<Array<{ id: string }>> {
    const resolvedSecrets = this.resolveSecrets(opts?.secrets);
    return listGeminiModels({
      providerId: this.id,
      configuredModel: resolvedSecrets.model,
      defaultModel: this.defaultModel
    });
  }
}
