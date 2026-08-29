import { ChatRequest, ChatResponse, EmbeddingRequest, EmbeddingResponse, ProviderAdapter, ProviderSecrets, StreamEvent } from '../types';
import { type AnthropicRuntimeSecrets, createAnthropicClient, executeAnthropicChat, listAnthropicModels } from './anthropic-runtime';
import { getBuiltinProviderDefinitionOrThrow } from './service';

type AnthropicSecrets = AnthropicRuntimeSecrets;

export class AnthropicProvider implements ProviderAdapter {
  private readonly definition = getBuiltinProviderDefinitionOrThrow('anthropic');
  private readonly defaultModels = this.definition.defaults.models;
  readonly id = this.definition.id;
  readonly label = this.definition.display.label;
  private secrets: AnthropicSecrets = {};
  private readonly defaultModel = this.defaultModels.chat!;
  private readonly defaultBaseUrl = this.definition.protocol.baseUrl;

  isConfigured(): boolean {
    return !!this.secrets.apiKey;
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
