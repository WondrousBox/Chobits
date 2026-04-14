import { pathToFileURL } from 'node:url';

import type {
  ChatRequest,
  ChatResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  ProviderAdapter,
  ProviderCapabilities,
  ProviderCapabilityKey,
  ProviderDefaultModels,
  ProviderSecrets,
  StreamEvent,
  TranscribeOptions,
  TranscriptionResponse
} from '../../types';
import { type AnthropicRuntimeSecrets, createAnthropicClient, executeAnthropicChat, listAnthropicModels } from '../anthropic-runtime';
import { createGeminiClient, executeGeminiChat, type GeminiRuntimeSecrets, listGeminiModels } from '../gemini-runtime';
import { createOllamaClient, executeOllamaChat, executeOllamaEmbedding, listOllamaModels, type OllamaRuntimeSecrets } from '../ollama-runtime';
import { createOpenAIClient, executeOpenAIChat, executeOpenAIEmbedding, executeOpenAITranscription, listOpenAIModels, type OpenAIRuntimeSecrets } from '../openai-runtime';
import type { ProviderDefinition, ProviderRuntimeModule, ProviderRuntimeModuleExport } from '../types';

const OPENAI_DRIVER_CAPABILITIES: ProviderCapabilities = {
  chat: true,
  embeddings: true,
  imageGeneration: true,
  modelListing: true,
  transcribe: true
};

const ANTHROPIC_DRIVER_CAPABILITIES: ProviderCapabilities = {
  chat: true,
  embeddings: false,
  imageGeneration: false,
  modelListing: true,
  transcribe: false
};

const GEMINI_DRIVER_CAPABILITIES: ProviderCapabilities = {
  chat: true,
  embeddings: false,
  imageGeneration: false,
  modelListing: true,
  transcribe: false
};

const OLLAMA_DRIVER_CAPABILITIES: ProviderCapabilities = {
  chat: true,
  embeddings: true,
  imageGeneration: false,
  modelListing: true,
  transcribe: false
};

export interface PluginProviderAdapterResult {
  adapter?: ProviderAdapter;
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isProviderRuntimeModule(value: unknown): value is ProviderRuntimeModule {
  return isRecord(value) && typeof value.createAdapter === 'function';
}

function isProviderAdapter(value: unknown): value is ProviderAdapter {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    typeof value.isConfigured === 'function' &&
    typeof value.setSecrets === 'function' &&
    typeof value.getSecrets === 'function'
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function resolveModuleImportTarget(modulePath: string): string {
  return /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(modulePath) ? modulePath : pathToFileURL(modulePath).href;
}

function cloneCapabilities(capabilities: ProviderCapabilities): ProviderCapabilities {
  return {
    chat: Boolean(capabilities.chat),
    embeddings: Boolean(capabilities.embeddings),
    imageGeneration: Boolean(capabilities.imageGeneration),
    modelListing: Boolean(capabilities.modelListing),
    transcribe: Boolean(capabilities.transcribe)
  };
}

function cloneDefaultModels(defaults?: ProviderDefaultModels): ProviderDefaultModels {
  return {
    chat: defaults?.chat,
    embeddings: defaults?.embeddings,
    imageGeneration: defaults?.imageGeneration,
    transcribe: defaults?.transcribe
  };
}

function intersectCapabilities(left: ProviderCapabilities, right: ProviderCapabilities): ProviderCapabilities {
  return {
    chat: Boolean(left.chat && right.chat),
    embeddings: Boolean(left.embeddings && right.embeddings),
    imageGeneration: Boolean(left.imageGeneration && right.imageGeneration),
    modelListing: Boolean(left.modelListing && right.modelListing),
    transcribe: Boolean(left.transcribe && right.transcribe)
  };
}

function listUnsupportedCapabilities(declared: ProviderCapabilities, supported: ProviderCapabilities): ProviderCapabilityKey[] {
  const keys: ProviderCapabilityKey[] = ['chat', 'embeddings', 'imageGeneration', 'modelListing', 'transcribe'];
  return keys.filter((key) => declared[key] && !supported[key]);
}

function resolveRequiredFieldKeys(definition: ProviderDefinition): string[] {
  return (definition.schema?.fields || []).filter((field) => field.required).map((field) => field.key);
}

function resolveDefaultModel(definition: ProviderDefinition, capability: keyof ProviderDefaultModels): string | undefined {
  return definition.defaults.models[capability];
}

abstract class DefinitionBackedPluginProvider implements ProviderAdapter {
  readonly id: string;
  readonly label: string;
  protected readonly definition: ProviderDefinition;
  protected readonly driverCapabilities: ProviderCapabilities;
  protected secrets: ProviderSecrets = {};

  constructor(definition: ProviderDefinition, driverCapabilities: ProviderCapabilities) {
    this.definition = definition;
    this.driverCapabilities = cloneCapabilities(driverCapabilities);
    this.id = definition.id;
    this.label = definition.display.label;
  }

  isConfigured(): boolean {
    const requiredKeys = resolveRequiredFieldKeys(this.definition);
    if (!requiredKeys.length) return true;

    const resolvedSecrets = this.resolveBaseSecrets();
    return requiredKeys.every((key) => String((resolvedSecrets as any)?.[key] || '').trim().length > 0);
  }

  getCapabilities(): ProviderCapabilities {
    return intersectCapabilities(this.definition.capabilities, this.driverCapabilities);
  }

  getDefaultModels(): ProviderDefaultModels {
    return cloneDefaultModels(this.definition.defaults.models);
  }

  setSecrets(secrets: ProviderSecrets): void {
    this.secrets = {
      ...(this.secrets || {}),
      ...(secrets || {})
    };
  }

  getSecrets(): ProviderSecrets {
    return {
      ...(this.secrets || {})
    };
  }

  protected requireCapability(capability: ProviderCapabilityKey): void {
    if (!this.getCapabilities()[capability]) {
      throw new Error(`Provider ${this.id} does not support ${capability}`);
    }
  }

  protected resolveBaseSecrets<T extends Record<string, any>>(override?: Partial<T>): T {
    return {
      ...(this.definition.protocol.baseUrl ? { baseUrl: this.definition.protocol.baseUrl } : {}),
      ...((this.definition.defaults.config || {}) as Record<string, any>),
      ...((this.secrets || {}) as Record<string, any>),
      ...((override || {}) as Record<string, any>)
    } as T;
  }
}

class OpenAIStylePluginProvider extends DefinitionBackedPluginProvider {
  constructor(definition: ProviderDefinition) {
    super(definition, OPENAI_DRIVER_CAPABILITIES);
  }

  private resolveSecrets(override?: Partial<OpenAIRuntimeSecrets>): OpenAIRuntimeSecrets {
    return this.resolveBaseSecrets<OpenAIRuntimeSecrets>(override);
  }

  private client(override?: Partial<OpenAIRuntimeSecrets>): ReturnType<typeof createOpenAIClient> {
    return createOpenAIClient(this.resolveSecrets(override));
  }

  async chat(req: ChatRequest, onStream?: (event: StreamEvent) => void, signal?: AbortSignal): Promise<ChatResponse> {
    this.requireCapability('chat');
    const defaultModel = resolveDefaultModel(this.definition, 'chat');
    if (!defaultModel) {
      throw new Error(`Provider ${this.id} is missing a default chat model`);
    }

    const overrideSecrets = (req.extras as any)?.secrets as Partial<OpenAIRuntimeSecrets> | undefined;
    const resolvedSecrets = this.resolveSecrets(overrideSecrets);

    return executeOpenAIChat(
      {
        client: this.client(overrideSecrets),
        request: req,
        providerId: this.id,
        defaultModel,
        configuredModel: resolvedSecrets.model
      },
      onStream,
      signal
    );
  }

  async embed(req: EmbeddingRequest): Promise<EmbeddingResponse> {
    this.requireCapability('embeddings');
    const defaultModel = resolveDefaultModel(this.definition, 'embeddings');
    if (!defaultModel) {
      throw new Error(`Provider ${this.id} is missing a default embeddings model`);
    }

    const overrideSecrets = (req as any)?.extras?.secrets as Partial<OpenAIRuntimeSecrets> | undefined;
    const resolvedSecrets = this.resolveSecrets(overrideSecrets);

    return executeOpenAIEmbedding({
      client: this.client(overrideSecrets),
      request: req,
      providerId: this.id,
      defaultModel,
      configuredModel: resolvedSecrets.model
    });
  }

  async transcribe(file: File | Blob | Buffer | ArrayBuffer, options?: TranscribeOptions): Promise<TranscriptionResponse> {
    this.requireCapability('transcribe');
    const defaultModel = resolveDefaultModel(this.definition, 'transcribe');
    if (!defaultModel) {
      throw new Error(`Provider ${this.id} is missing a default transcription model`);
    }

    return executeOpenAITranscription({
      client: this.client(options?.secrets as Partial<OpenAIRuntimeSecrets> | undefined),
      file,
      options,
      providerId: this.id,
      defaultModel
    });
  }

  async listModels(opts?: { secrets?: Partial<OpenAIRuntimeSecrets> }): Promise<Array<{ id: string }>> {
    if (!this.getCapabilities().modelListing) {
      return [];
    }

    const resolvedSecrets = this.resolveSecrets(opts?.secrets);
    return listOpenAIModels({
      client: this.client(opts?.secrets),
      providerId: this.id,
      configuredModel: resolvedSecrets.model,
      defaultModel: resolveDefaultModel(this.definition, 'chat')
    });
  }
}

class AnthropicPluginProvider extends DefinitionBackedPluginProvider {
  constructor(definition: ProviderDefinition) {
    super(definition, ANTHROPIC_DRIVER_CAPABILITIES);
  }

  private resolveSecrets(override?: Partial<AnthropicRuntimeSecrets>): AnthropicRuntimeSecrets {
    return this.resolveBaseSecrets<AnthropicRuntimeSecrets>(override);
  }

  async chat(req: ChatRequest, onStream?: (event: StreamEvent) => void, signal?: AbortSignal): Promise<ChatResponse> {
    this.requireCapability('chat');
    const defaultModel = resolveDefaultModel(this.definition, 'chat');
    if (!defaultModel) {
      throw new Error(`Provider ${this.id} is missing a default chat model`);
    }

    const overrideSecrets = (req.extras as any)?.secrets as Partial<AnthropicRuntimeSecrets> | undefined;
    const resolvedSecrets = this.resolveSecrets(overrideSecrets);

    return executeAnthropicChat(
      {
        client: createAnthropicClient(resolvedSecrets),
        request: req,
        providerId: this.id,
        defaultModel,
        configuredModel: resolvedSecrets.model
      },
      onStream,
      signal
    );
  }

  async listModels(opts?: { secrets?: Partial<AnthropicRuntimeSecrets> }): Promise<Array<{ id: string }>> {
    if (!this.getCapabilities().modelListing) {
      return [];
    }

    const resolvedSecrets = this.resolveSecrets(opts?.secrets);
    return listAnthropicModels({
      providerId: this.id,
      configuredModel: resolvedSecrets.model,
      defaultModel: resolveDefaultModel(this.definition, 'chat')
    });
  }
}

class GeminiPluginProvider extends DefinitionBackedPluginProvider {
  constructor(definition: ProviderDefinition) {
    super(definition, GEMINI_DRIVER_CAPABILITIES);
  }

  private resolveSecrets(override?: Partial<GeminiRuntimeSecrets>): GeminiRuntimeSecrets {
    return this.resolveBaseSecrets<GeminiRuntimeSecrets>(override);
  }

  async chat(req: ChatRequest, onStream?: (event: StreamEvent) => void, signal?: AbortSignal): Promise<ChatResponse> {
    this.requireCapability('chat');
    const defaultModel = resolveDefaultModel(this.definition, 'chat');
    if (!defaultModel) {
      throw new Error(`Provider ${this.id} is missing a default chat model`);
    }

    const overrideSecrets = (req.extras as any)?.secrets as Partial<GeminiRuntimeSecrets> | undefined;
    const resolvedSecrets = this.resolveSecrets(overrideSecrets);

    return executeGeminiChat(
      {
        client: createGeminiClient(resolvedSecrets),
        request: req,
        providerId: this.id,
        defaultModel,
        configuredModel: resolvedSecrets.model
      },
      onStream,
      signal
    );
  }

  async listModels(opts?: { secrets?: Partial<GeminiRuntimeSecrets> }): Promise<Array<{ id: string }>> {
    if (!this.getCapabilities().modelListing) {
      return [];
    }

    const resolvedSecrets = this.resolveSecrets(opts?.secrets);
    return listGeminiModels({
      providerId: this.id,
      configuredModel: resolvedSecrets.model,
      defaultModel: resolveDefaultModel(this.definition, 'chat')
    });
  }
}

class OllamaPluginProvider extends DefinitionBackedPluginProvider {
  constructor(definition: ProviderDefinition) {
    super(definition, OLLAMA_DRIVER_CAPABILITIES);
  }

  private resolveSecrets(override?: Partial<OllamaRuntimeSecrets>): OllamaRuntimeSecrets {
    return this.resolveBaseSecrets<OllamaRuntimeSecrets>(override);
  }

  private client(override?: Partial<OllamaRuntimeSecrets>): ReturnType<typeof createOllamaClient> {
    return createOllamaClient(this.resolveSecrets(override));
  }

  async chat(req: ChatRequest, onStream?: (event: StreamEvent) => void, signal?: AbortSignal): Promise<ChatResponse> {
    this.requireCapability('chat');
    const defaultModel = resolveDefaultModel(this.definition, 'chat');
    if (!defaultModel) {
      throw new Error(`Provider ${this.id} is missing a default chat model`);
    }

    const overrideSecrets = (req.extras as any)?.secrets as Partial<OllamaRuntimeSecrets> | undefined;
    const resolvedSecrets = this.resolveSecrets(overrideSecrets);

    return executeOllamaChat(
      {
        client: this.client(overrideSecrets),
        request: req,
        providerId: this.id,
        defaultModel,
        configuredModel: resolvedSecrets.model
      },
      onStream,
      signal
    );
  }

  async embed(req: EmbeddingRequest): Promise<EmbeddingResponse> {
    this.requireCapability('embeddings');
    const defaultModel = resolveDefaultModel(this.definition, 'embeddings');
    if (!defaultModel) {
      throw new Error(`Provider ${this.id} is missing a default embeddings model`);
    }

    const overrideSecrets = (req as any)?.extras?.secrets as Partial<OllamaRuntimeSecrets> | undefined;
    const resolvedSecrets = this.resolveSecrets(overrideSecrets);

    return executeOllamaEmbedding({
      client: this.client(overrideSecrets),
      request: req,
      providerId: this.id,
      defaultModel,
      configuredModel: resolvedSecrets.model
    });
  }

  async listModels(opts?: { secrets?: Partial<OllamaRuntimeSecrets> }): Promise<Array<{ id: string }>> {
    if (!this.getCapabilities().modelListing) {
      return [];
    }

    const resolvedSecrets = this.resolveSecrets(opts?.secrets);
    return listOllamaModels({
      client: this.client(opts?.secrets),
      providerId: this.id,
      configuredModel: resolvedSecrets.model,
      defaultModel: resolveDefaultModel(this.definition, 'chat')
    });
  }
}

function resolveDriverCapabilities(kind: ProviderDefinition['protocol']['kind']): ProviderCapabilities | undefined {
  switch (kind) {
    case 'openai':
    case 'openai-compatible':
      return OPENAI_DRIVER_CAPABILITIES;
    case 'anthropic':
      return ANTHROPIC_DRIVER_CAPABILITIES;
    case 'gemini':
      return GEMINI_DRIVER_CAPABILITIES;
    case 'ollama':
      return OLLAMA_DRIVER_CAPABILITIES;
    default:
      return undefined;
  }
}

async function resolveRuntimeModule(definition: ProviderDefinition): Promise<ProviderRuntimeModule> {
  const runtime = definition.runtime;
  if (!runtime?.modulePath) {
    throw new Error(`plugin provider "${definition.id}" is missing runtime.modulePath`);
  }

  let runtimeModuleNs: Record<string, unknown>;
  try {
    runtimeModuleNs = (await import(resolveModuleImportTarget(runtime.modulePath))) as Record<string, unknown>;
  } catch (error) {
    throw new Error(`plugin provider "${definition.id}" failed to import runtime module "${runtime.modulePath}": ${toErrorMessage(error)}`);
  }

  const exportName = runtime.exportName || 'createProviderRuntime';
  const defaultExport = runtimeModuleNs.default;
  const exported =
    (runtimeModuleNs[exportName] as ProviderRuntimeModuleExport | undefined) ||
    (exportName === 'default'
      ? (defaultExport as ProviderRuntimeModuleExport | undefined)
      : isRecord(defaultExport)
        ? (defaultExport[exportName] as ProviderRuntimeModuleExport | undefined)
        : undefined);

  if (exported == null) {
    throw new Error(`plugin provider "${definition.id}" runtime module is missing export "${exportName}"`);
  }

  if (isProviderRuntimeModule(exported)) {
    return exported;
  }

  if (typeof exported === 'function') {
    const runtimeModule = await exported(definition);
    if (isProviderRuntimeModule(runtimeModule)) {
      return runtimeModule;
    }

    throw new Error(`plugin provider "${definition.id}" export "${exportName}" must return an object with createAdapter()`);
  }

  throw new Error(`plugin provider "${definition.id}" export "${exportName}" must be a runtime module or a factory function`);
}

function validatePluginAdapter(definition: ProviderDefinition, adapter: unknown): ProviderAdapter {
  if (!isProviderAdapter(adapter)) {
    throw new Error(`plugin provider "${definition.id}" runtime createAdapter() must return a valid ProviderAdapter`);
  }

  const adapterId = adapter.id.trim().toLowerCase();
  if (!adapterId) {
    throw new Error(`plugin provider "${definition.id}" adapter id is required`);
  }

  if (adapterId !== definition.id) {
    throw new Error(`plugin provider "${definition.id}" adapter id "${adapter.id}" must match definition id "${definition.id}"`);
  }

  if (!adapter.label.trim()) {
    throw new Error(`plugin provider "${definition.id}" adapter label is required`);
  }

  return adapter;
}

async function createModulePluginProviderAdapter(definition: ProviderDefinition): Promise<PluginProviderAdapterResult> {
  try {
    const runtimeModule = await resolveRuntimeModule(definition);
    const adapter = validatePluginAdapter(definition, await runtimeModule.createAdapter(definition));
    return {
      adapter,
      warnings: []
    };
  } catch (error) {
    return {
      warnings: [toErrorMessage(error)]
    };
  }
}

export async function createPluginProviderAdapter(definition: ProviderDefinition): Promise<PluginProviderAdapterResult> {
  const runtimeMode = definition.runtime?.mode || 'driver';
  if (runtimeMode === 'module') {
    return createModulePluginProviderAdapter(definition);
  }

  const driverCapabilities = resolveDriverCapabilities(definition.protocol.kind);
  if (!driverCapabilities) {
    return {
      warnings: [`plugin provider "${definition.id}" uses unsupported driver protocol "${definition.protocol.kind}"`]
    };
  }

  const warnings: string[] = [];
  const unsupportedCapabilities = listUnsupportedCapabilities(definition.capabilities, driverCapabilities);
  if (unsupportedCapabilities.length > 0) {
    warnings.push(`plugin provider "${definition.id}" declares capabilities not supported by the ${definition.protocol.kind} driver: ${unsupportedCapabilities.join(', ')}`);
  }

  switch (definition.protocol.kind) {
    case 'openai':
    case 'openai-compatible':
      return {
        adapter: new OpenAIStylePluginProvider(definition),
        warnings
      };
    case 'anthropic':
      return {
        adapter: new AnthropicPluginProvider(definition),
        warnings
      };
    case 'gemini':
      return {
        adapter: new GeminiPluginProvider(definition),
        warnings
      };
    case 'ollama':
      return {
        adapter: new OllamaPluginProvider(definition),
        warnings
      };
    default:
      return {
        warnings: [...warnings, `plugin provider "${definition.id}" has no adapter factory for protocol "${definition.protocol.kind}"`]
      };
  }
}
