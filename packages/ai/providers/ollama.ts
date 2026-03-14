import { loadProviderSchema } from '../schema-loader';
import { ChatRequest, ChatResponse, EmbeddingRequest, EmbeddingResponse, ProviderAdapter, ProviderCapabilities, ProviderConfig, ProviderDefaultModels, ProviderSecrets, StreamEvent } from '../types';
import { getBuiltinProviderMetadata } from './metadata';
import { createOllamaClient, executeOllamaChat, executeOllamaEmbedding, listOllamaModels, type OllamaRuntimeSecrets } from './ollama-runtime';

type OllamaSecrets = OllamaRuntimeSecrets;

export class OllamaProvider implements ProviderAdapter {
  private readonly metadata = getBuiltinProviderMetadata('ollama');
  readonly id = 'ollama';
  readonly label = this.metadata?.label || 'Ollama (local)';
  private secrets: OllamaSecrets = {};
  private readonly defaultModel = this.metadata?.defaultModel || 'llama3.1';
  private readonly defaultBaseUrl = this.metadata?.providerBaseUrl || 'http://127.0.0.1:11434';

  isConfigured(): boolean {
    return true;
  }

  getCapabilities(): ProviderCapabilities {
    return {
      ...(this.metadata?.capabilities || {
        chat: true,
        embeddings: true,
        imageGeneration: false,
        modelListing: true,
        transcribe: false
      })
    };
  }

  getDefaultModels(): ProviderDefaultModels {
    return {
      ...(this.metadata?.defaultModels || {
        chat: this.defaultModel,
        embeddings: 'nomic-embed-text'
      })
    };
  }

  getConfigSchema(): ProviderConfig {
    const fallback: ProviderConfig = {
      id: this.id,
      label: this.label,
      enabled: true,
      fields: [
        { key: 'baseUrl', label: 'Base URL', type: 'text' },
        { key: 'model', label: '默认模型（如 llama3.1）', type: 'text' }
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
      defaultModel: 'nomic-embed-text',
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
