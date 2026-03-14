import { loadProviderSchema } from '../schema-loader';
import { ChatRequest, ChatResponse, EmbeddingRequest, EmbeddingResponse, ProviderAdapter, ProviderCapabilities, ProviderConfig, ProviderDefaultModels, ProviderSecrets, StreamEvent } from '../types';
import { getBuiltinProviderMetadata } from './metadata';
import { createOpenAIClient, executeOpenAIChat, executeOpenAIEmbedding, listOpenAIModels, type OpenAIRuntimeSecrets } from './openai-runtime';

export class OpenAICompatibleProvider implements ProviderAdapter {
  readonly id: string;
  readonly label: string;
  private defaults: { baseUrl?: string; model?: string };
  private secrets: OpenAIRuntimeSecrets = {};

  constructor(opts: { id: string; label: string; baseUrl?: string; model?: string }) {
    this.id = opts.id;
    this.label = opts.label;
    this.defaults = { baseUrl: opts.baseUrl, model: opts.model };
  }

  isConfigured(): boolean {
    return !!this.secrets.apiKey;
  }

  getCapabilities(): ProviderCapabilities {
    const metadata = getBuiltinProviderMetadata(this.id);
    return {
      ...(metadata?.capabilities || {
        chat: true,
        embeddings: Boolean(this.embed),
        imageGeneration: false,
        modelListing: true,
        transcribe: Boolean((this as any).transcribe)
      })
    };
  }

  getDefaultModels(): ProviderDefaultModels {
    const metadata = getBuiltinProviderMetadata(this.id);
    return {
      ...(metadata?.defaultModels || {
        chat: this.defaults.model
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
        { key: 'baseUrl', label: 'Base URL', type: 'text' },
        { key: 'model', label: '默认模型', type: 'text' }
      ]
    };
    return loadProviderSchema(this.id, fallback);
  }
  setSecrets(secrets: ProviderSecrets): void {
    this.secrets = { ...this.defaults, ...(this.secrets || {}), ...(secrets as any) };
  }
  getSecrets(): ProviderSecrets {
    return this.secrets;
  }

  protected resolveSecrets(override?: Partial<OpenAIRuntimeSecrets>): OpenAIRuntimeSecrets {
    return {
      ...this.defaults,
      ...(this.secrets || {}),
      ...(override || {})
    };
  }

  protected client(override?: Partial<OpenAIRuntimeSecrets>): ReturnType<typeof createOpenAIClient> {
    return createOpenAIClient(this.resolveSecrets(override));
  }

  async chat(req: ChatRequest, onStream?: (event: StreamEvent) => void, signal?: AbortSignal): Promise<ChatResponse> {
    const overrideSecrets = (req.extras as any)?.secrets as Partial<OpenAIRuntimeSecrets> | undefined;
    const resolvedSecrets = this.resolveSecrets(overrideSecrets);

    return executeOpenAIChat(
      {
        client: this.client(overrideSecrets),
        request: req,
        providerId: this.id,
        defaultModel: this.defaults.model || 'gpt-3.5-turbo',
        configuredModel: resolvedSecrets.model
      },
      onStream,
      signal
    );
  }

  async embed(req: EmbeddingRequest): Promise<EmbeddingResponse> {
    const overrideSecrets = (req as any)?.extras?.secrets as Partial<OpenAIRuntimeSecrets> | undefined;
    const resolvedSecrets = this.resolveSecrets(overrideSecrets);

    return executeOpenAIEmbedding({
      client: this.client(overrideSecrets),
      request: req,
      providerId: this.id,
      defaultModel: 'text-embedding-3-small',
      configuredModel: resolvedSecrets.model
    });
  }

  async listModels(opts?: { secrets?: { apiKey?: string; baseUrl?: string; model?: string } }): Promise<Array<{ id: string }>> {
    const resolvedSecrets = this.resolveSecrets(opts?.secrets);
    return listOpenAIModels({
      client: this.client(opts?.secrets),
      providerId: this.id,
      configuredModel: resolvedSecrets.model,
      defaultModel: this.defaults.model
    });
  }
}
