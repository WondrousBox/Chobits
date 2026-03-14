import { loadProviderSchema } from '../schema-loader';
import {
  ChatRequest,
  ChatResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  ProviderAdapter,
  ProviderCapabilities,
  ProviderConfig,
  ProviderDefaultModels,
  ProviderSecrets,
  StreamEvent,
  TranscribeOptions
} from '../types';
import { getBuiltinProviderMetadata } from './metadata';
import { createOpenAIClient, executeOpenAIChat, executeOpenAIEmbedding, executeOpenAITranscription, listOpenAIModels, type OpenAIRuntimeSecrets } from './openai-runtime';

type OpenAISecrets = OpenAIRuntimeSecrets;

export class OpenAIProvider implements ProviderAdapter {
  private readonly metadata = getBuiltinProviderMetadata('openai');
  readonly id = 'openai';
  readonly label = this.metadata?.label || 'OpenAI';
  private secrets: OpenAISecrets = {};
  private readonly defaultModel = this.metadata?.defaultModel || 'gpt-4o-mini';
  private readonly defaultBaseUrl = this.metadata?.providerBaseUrl;
  private readonly defaultTranscribeModel = this.metadata?.defaultModels.transcribe || 'gpt-4o-mini-transcribe';

  isConfigured(): boolean {
    return !!this.secrets.apiKey;
  }

  getCapabilities(): ProviderCapabilities {
    return {
      ...(this.metadata?.capabilities || {
        chat: true,
        embeddings: true,
        imageGeneration: true,
        modelListing: true,
        transcribe: true
      })
    };
  }

  getDefaultModels(): ProviderDefaultModels {
    return {
      ...(this.metadata?.defaultModels || {
        chat: this.defaultModel,
        embeddings: 'text-embedding-3-small',
        imageGeneration: 'gpt-image-1',
        transcribe: this.defaultTranscribeModel
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
        { key: 'model', label: '默认模型（如 gpt-4o-mini）', type: 'text' }
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

  private resolveSecrets(override?: Partial<OpenAISecrets>): OpenAISecrets {
    return {
      ...(this.defaultBaseUrl ? { baseUrl: this.defaultBaseUrl } : {}),
      ...this.secrets,
      ...(override || {})
    };
  }

  private client(override?: Partial<OpenAISecrets>): ReturnType<typeof createOpenAIClient> {
    return createOpenAIClient(this.resolveSecrets(override));
  }

  async chat(req: ChatRequest, onStream?: (event: StreamEvent) => void, signal?: AbortSignal): Promise<ChatResponse> {
    const overrideSecrets = (req.extras as any)?.secrets as Partial<OpenAISecrets> | undefined;
    const resolvedSecrets = this.resolveSecrets(overrideSecrets);

    return executeOpenAIChat(
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
    const overrideSecrets = (req as any)?.extras?.secrets as Partial<OpenAISecrets> | undefined;
    const resolvedSecrets = this.resolveSecrets(overrideSecrets);

    return executeOpenAIEmbedding({
      client: this.client(overrideSecrets),
      request: req,
      providerId: this.id,
      defaultModel: 'text-embedding-3-small',
      configuredModel: resolvedSecrets.model
    });
  }

  async transcribe(file: File | Blob | Buffer | ArrayBuffer, options?: TranscribeOptions): Promise<{ text: string }> {
    return executeOpenAITranscription({
      client: this.client(options?.secrets as Partial<OpenAISecrets> | undefined),
      file,
      options,
      providerId: this.id,
      defaultModel: this.defaultTranscribeModel
    });
  }

  async listModels(opts?: { secrets?: Partial<OpenAISecrets> }): Promise<Array<{ id: string }>> {
    const resolvedSecrets = this.resolveSecrets(opts?.secrets);
    return listOpenAIModels({
      client: this.client(opts?.secrets),
      providerId: this.id,
      configuredModel: resolvedSecrets.model,
      defaultModel: this.defaultModel
    });
  }
}
