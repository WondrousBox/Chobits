import { loadProviderSchema } from '../schema-loader';
import { ChatRequest, ChatResponse, EmbeddingRequest, EmbeddingResponse, ProviderAdapter, ProviderCapabilities, ProviderConfig, ProviderDefaultModels, ProviderSecrets, StreamEvent } from '../types';
import { type AnthropicRuntimeSecrets, createAnthropicClient, executeAnthropicChat, listAnthropicModels } from './anthropic-runtime';
import { getBuiltinProviderMetadata } from './metadata';

type AnthropicSecrets = AnthropicRuntimeSecrets;

export class AnthropicProvider implements ProviderAdapter {
  private readonly metadata = getBuiltinProviderMetadata('anthropic');
  readonly id = 'anthropic';
  readonly label = this.metadata?.label || 'Anthropic (Claude)';
  private secrets: AnthropicSecrets = {};
  private readonly defaultModel = this.metadata?.defaultModel || 'claude-3-5-sonnet-20241022';
  private readonly defaultBaseUrl = this.metadata?.providerBaseUrl;

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
        { key: 'baseUrl', label: 'Base URL (可选，自定义网关)', type: 'text' },
        { key: 'model', label: '默认模型（如 claude-3-5-sonnet-latest）', type: 'text' }
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

  private resolveSecrets(override?: Partial<AnthropicSecrets>): AnthropicSecrets {
    return {
      ...(this.defaultBaseUrl ? { baseUrl: this.defaultBaseUrl } : {}),
      ...this.secrets,
      ...(override || {})
    };
  }

  private client(override?: Partial<AnthropicSecrets>): ReturnType<typeof createAnthropicClient> {
    return createAnthropicClient(this.resolveSecrets(override));
  }

  async chat(req: ChatRequest, onStream?: (event: StreamEvent) => void, signal?: AbortSignal): Promise<ChatResponse> {
    const overrideSecrets = (req.extras as any)?.secrets as Partial<AnthropicSecrets> | undefined;
    const resolvedSecrets = this.resolveSecrets(overrideSecrets);

    return executeAnthropicChat(
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
    throw new Error('Anthropic embeddings not supported via API');
  }

  async listModels(opts?: { secrets?: Partial<AnthropicSecrets> }): Promise<Array<{ id: string }>> {
    const resolvedSecrets = this.resolveSecrets(opts?.secrets);
    return listAnthropicModels({
      providerId: this.id,
      configuredModel: resolvedSecrets.model,
      defaultModel: this.defaultModel
    });
  }
}
