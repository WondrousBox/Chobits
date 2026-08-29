import { ChatRequest, ChatResponse, EmbeddingRequest, EmbeddingResponse, ProviderAdapter, ProviderSecrets, StreamEvent } from '../types';
import { createGeminiClient, executeGeminiChat, type GeminiRuntimeSecrets, listGeminiModels } from './gemini-runtime';
import { getBuiltinProviderDefinitionOrThrow } from './service';

type GeminiSecrets = GeminiRuntimeSecrets;

export class GeminiProvider implements ProviderAdapter {
  private readonly definition = getBuiltinProviderDefinitionOrThrow('gemini');
  private readonly defaultModels = this.definition.defaults.models;
  readonly id = this.definition.id;
  readonly label = this.definition.display.label;
  private secrets: GeminiSecrets = {};
  private readonly defaultModel = this.defaultModels.chat!;

  isConfigured(): boolean {
    return !!this.secrets.apiKey;
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
