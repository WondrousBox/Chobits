import { ChatRequest, ChatResponse, EmbeddingRequest, EmbeddingResponse, ProviderAdapter, ProviderSecrets, StreamEvent } from '../types';
import { getBuiltinProviderDefinitionOrThrow, getRequiredBuiltinProviderDefaultModel } from './service';
import { createOllamaClient, executeOllamaChat, executeOllamaEmbedding, listOllamaModels, type OllamaRuntimeSecrets } from './ollama-runtime';

type OllamaSecrets = OllamaRuntimeSecrets;

export class OllamaProvider implements ProviderAdapter {
  private readonly definition = getBuiltinProviderDefinitionOrThrow('ollama');
  private readonly defaultModels = this.definition.defaults.models;
  readonly id = this.definition.id;
  readonly label = this.definition.display.label;
  private secrets: OllamaSecrets = {};
  private readonly defaultModel = this.defaultModels.chat!;
  private readonly defaultBaseUrl = this.definition.protocol.baseUrl;
  private readonly defaultEmbeddingModel = getRequiredBuiltinProviderDefaultModel('ollama', 'embeddings');

  isConfigured(): boolean {
    return true;
  }
  setSecrets(secrets: ProviderSecrets): void {
    this.secrets = { ...this.secrets, ...(secrets as any) };
  }
  getSecrets(): ProviderSecrets {
    return this.secrets;
  }

  private resolveSecrets(override?: Partial<OllamaSecrets>): OllamaSecrets {
    return {
      baseUrl: this.defaultBaseUrl,
      ...this.secrets,
      ...(override || {})
    };
  }

  private client(override?: Partial<OllamaSecrets>): ReturnType<typeof createOllamaClient> {
    return createOllamaClient(this.resolveSecrets(override));
  }

  async chat(req: ChatRequest, onStream?: (event: StreamEvent) => void, signal?: AbortSignal): Promise<ChatResponse> {
    const overrideSecrets = (req.extras as any)?.secrets as Partial<OllamaSecrets> | undefined;
    const resolvedSecrets = this.resolveSecrets(overrideSecrets);

    return executeOllamaChat(
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
    const overrideSecrets = (req as any)?.extras?.secrets as Partial<OllamaSecrets> | undefined;
    const resolvedSecrets = this.resolveSecrets(overrideSecrets);

    return executeOllamaEmbedding({
      client: this.client(overrideSecrets),
      request: req,
      providerId: this.id,
      defaultModel: this.defaultEmbeddingModel,
      configuredModel: resolvedSecrets.model
    });
  }

  async listModels(opts?: { secrets?: Partial<OllamaSecrets> }): Promise<Array<{ id: string }>> {
    const resolvedSecrets = this.resolveSecrets(opts?.secrets);
    return listOllamaModels({
      client: this.client(opts?.secrets),
      providerId: this.id,
      configuredModel: resolvedSecrets.model,
      defaultModel: this.defaultModel
    });
  }
}
