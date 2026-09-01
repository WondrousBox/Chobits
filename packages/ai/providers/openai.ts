import { ChatRequest, ChatResponse, EmbeddingRequest, EmbeddingResponse, ProviderAdapter, ProviderSecrets, StreamEvent, TranscribeOptions, TranscriptionResponse } from '../types';
import { createOpenAIClient, executeOpenAIChat, executeOpenAIEmbedding, executeOpenAITranscription, listOpenAIModels, type OpenAIRuntimeSecrets } from './openai-runtime';
import { getBuiltinProviderDefinitionOrThrow, getRequiredBuiltinProviderDefaultModel } from './service';

type OpenAISecrets = OpenAIRuntimeSecrets;

export class OpenAIProvider implements ProviderAdapter {
  private readonly definition = getBuiltinProviderDefinitionOrThrow('openai');
  private readonly defaultModels = this.definition.defaults.models;
  readonly id = this.definition.id;
  readonly label = this.definition.display.label;
  private secrets: OpenAISecrets = {};
  private readonly defaultModel = this.defaultModels.chat!;
  private readonly defaultBaseUrl = this.definition.protocol.baseUrl;
  private readonly defaultEmbeddingModel = getRequiredBuiltinProviderDefaultModel('openai', 'embeddings');
  private readonly defaultTranscribeModel = getRequiredBuiltinProviderDefaultModel('openai', 'transcribe');

  isConfigured(): boolean {
    return !!this.secrets.apiKey;
  }
  setSecrets(secrets: ProviderSecrets): void {
    this.secrets = { ...this.secrets, ...(secrets as any) };
  }
  clearSecrets(): void {
    this.secrets = {};
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
        client: await this.client(overrideSecrets),
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
      client: await this.client(overrideSecrets),
      request: req,
      providerId: this.id,
      defaultModel: this.defaultEmbeddingModel,
      configuredModel: resolvedSecrets.model
    });
  }

  async transcribe(file: File | Blob | Buffer | ArrayBuffer, options?: TranscribeOptions): Promise<TranscriptionResponse> {
    return executeOpenAITranscription({
      client: await this.client(options?.secrets as Partial<OpenAISecrets> | undefined),
      file,
      options,
      providerId: this.id,
      defaultModel: this.defaultTranscribeModel
    });
  }

  async listModels(opts?: { secrets?: Partial<OpenAISecrets> }): Promise<Array<{ id: string }>> {
    const resolvedSecrets = this.resolveSecrets(opts?.secrets);
    return listOpenAIModels({
      client: await this.client(opts?.secrets),
      providerId: this.id,
      configuredModel: resolvedSecrets.model,
      defaultModel: this.defaultModel
    });
  }
}
