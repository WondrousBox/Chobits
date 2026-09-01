import { ChatRequest, ChatResponse, EmbeddingRequest, EmbeddingResponse, ProviderAdapter, ProviderSecrets, StreamEvent } from '../types';
import { getBuiltinProviderDefinitionOrThrow } from './service';
import { createOpenAIClient, executeOpenAIChat, executeOpenAIEmbedding, listOpenAIModels, type OpenAIRuntimeSecrets } from './openai-runtime';
import type { BuiltinProviderId, BuiltinProviderDefinition } from './types';

export class OpenAICompatibleProvider implements ProviderAdapter {
  protected readonly definition: BuiltinProviderDefinition;
  readonly id: string;
  readonly label: string;
  private defaults: { baseUrl?: string; model?: string };
  private secrets: OpenAIRuntimeSecrets = {};
  private readonly defaultEmbeddingModel?: string;

  constructor(providerId: BuiltinProviderId) {
    this.definition = getBuiltinProviderDefinitionOrThrow(providerId);
    this.id = this.definition.id;
    this.label = this.definition.display.label;
    this.defaults = {
      baseUrl: this.definition.protocol.baseUrl,
      model: this.definition.defaults.models.chat
    };
    this.defaultEmbeddingModel = this.definition.defaults.models.embeddings;
  }

  isConfigured(): boolean {
    return !!this.secrets.apiKey;
  }
  setSecrets(secrets: ProviderSecrets): void {
    this.secrets = { ...this.defaults, ...(this.secrets || {}), ...(secrets as any) };
  }
  clearSecrets(): void {
    // resolveSecrets 会重新叠加 this.defaults，这里只需丢掉用户配置
    this.secrets = {};
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
        client: await this.client(overrideSecrets),
        request: req,
        providerId: this.id,
        defaultModel: this.definition.defaults.models.chat!,
        configuredModel: resolvedSecrets.model
      },
      onStream,
      signal
    );
  }

  async embed(req: EmbeddingRequest): Promise<EmbeddingResponse> {
    if (!this.definition.capabilities.embeddings) {
      throw new Error(`${this.label} embeddings not supported`);
    }

    if (!this.defaultEmbeddingModel) {
      throw new Error(`Missing default embeddings model for provider ${this.id}`);
    }

    const overrideSecrets = (req as any)?.extras?.secrets as Partial<OpenAIRuntimeSecrets> | undefined;
    const resolvedSecrets = this.resolveSecrets(overrideSecrets);

    return executeOpenAIEmbedding({
      client: await this.client(overrideSecrets),
      request: req,
      providerId: this.id,
      defaultModel: this.defaultEmbeddingModel,
      configuredModel: resolvedSecrets.model
    });
  }

  async listModels(opts?: { secrets?: { apiKey?: string; baseUrl?: string; model?: string } }): Promise<Array<{ id: string }>> {
    const resolvedSecrets = this.resolveSecrets(opts?.secrets);
    return listOpenAIModels({
      client: await this.client(opts?.secrets),
      providerId: this.id,
      configuredModel: resolvedSecrets.model,
      defaultModel: this.defaults.model
    });
  }
}
