import type { BrowserWindow } from 'electron';

// Core message primitives
export type Role = 'system' | 'user' | 'assistant' | 'tool';

export type ChatMessage = {
  id?: string;
  role: Role;
  content: string;
  name?: string;
  toolCallId?: string;
  metadata?: Record<string, any>;
  createdAt?: number;
};

export type ChatRequest = {
  conversationId?: string;
  messages: ChatMessage[];
  agentId: string; // which agent to use
  providerId: string; // which provider adapter to use
  providerInstanceId?: string; // which provider instance to use
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  abortId?: string; // used to cancel via IPC
  extras?: Record<string, any>; // agent/provider specific
  requestId?: string; // for streaming identification
  persist?: boolean; // whether to persist conversation/messages (default true)
};

export type StreamEvent =
  | { type: 'connected' }
  | { type: 'delta'; data: { text?: string; toolCall?: any } }
  | { type: 'message_completed'; data: { message: ChatMessage } }
  | { type: 'tool_call'; data: { name: string; args: any; callId: string } }
  | { type: 'tool_result'; data: { callId: string; result: any } }
  | { type: 'metadata'; data: Record<string, any> }
  | { type: 'error'; data: { message: string; code?: string; cause?: any } }
  | { type: 'done' };

export type ChatResponse = {
  message: ChatMessage;
  usage?: { inputTokens?: number; outputTokens?: number; cost?: number };
  providerId?: string;
  agentId?: string;
  metadata?: Record<string, any>;
};

// Embeddings
export type EmbeddingRequest = { texts: string[]; providerId?: string; model?: string; normalize?: boolean };
export type EmbeddingResponse = { vectors: number[][]; dim: number; model?: string; providerId?: string };

// Provider configuration (API keys etc.)
export type ProviderSecrets = Record<string, string | undefined>; // e.g. { apiKey: 'sk-...' }
export type ProviderConfig = {
  id: string;
  label: string;
  enabled: boolean;
  // Optional icon path; can be absolute, a res:// URL, or a resource-relative path resolved by renderer
  icon?: string;
  // Optional i18n locales: e.g., { en: { label: 'OpenAI', fields: { apiKey: 'API Key' } }, zh: { label: '开放AI', fields: { apiKey: 'API 密钥' } }
  locales?: Record<string, { label?: string; fields?: Record<string, string> }>;
  fields: Array<{
    key: string;
    label: string;
    type: 'text' | 'password' | 'select';
    required?: boolean;
    options?: Array<{ label: string; value: string }>;
  }>;
};

// Provider adapter contracts (chat + embeddings are optional capabilities)
export interface ProviderAdapter {
  readonly id: string; // unique ID, e.g. 'openai', 'anthropic', 'ollama'
  readonly label: string;
  isConfigured(): Promise<boolean> | boolean;
  getConfigSchema(): ProviderConfig;
  setSecrets(secrets: ProviderSecrets): Promise<void> | void;
  getSecrets(): Promise<ProviderSecrets> | ProviderSecrets;
  // Chat
  chat?(req: ChatRequest, onStream?: (event: StreamEvent) => void, signal?: AbortSignal): Promise<ChatResponse>;
  // Embeddings
  embed?(req: EmbeddingRequest): Promise<EmbeddingResponse>;
  // Models: return id + optional metadata; UI will use label if provided
  listModels?(opts?: { secrets?: ProviderSecrets }): Promise<Array<{ id: string; label?: string;[k: string]: any }>>;
  // ASR
  transcribe?(file: File | Blob | Buffer, options?: { model?: string; language?: string; prompt?: string }): Promise<{ text: string }>;
}

// Agent contracts
export interface AgentContext {
  window?: BrowserWindow;
  emit?: (event: StreamEvent) => void; // agent can emit custom metadata/tool events
  getProvider: (id?: string) => ProviderAdapter | undefined;
}

export interface AgentDefinition {
  id: string;
  label: string;
  description?: string;
  defaultProviderId?: string;
  handleChat: (ctx: AgentContext, req: ChatRequest, signal?: AbortSignal) => Promise<ChatResponse>;
}

export type StartStreamPayload = { requestId: string; eventsChannel: string } & ChatRequest;

export type AIApi = {
  getProviders(): Promise<any[]>;
  getAgents(): Promise<any[]>;
  listModels(providerId: string, instanceId?: string): Promise<Array<{ id: string; label?: string;[k: string]: any }>>;
  getProviderSecrets(providerId: string): Promise<Record<string, string>>;
  setProviderSecrets(providerId: string, secrets: Record<string, string>): Promise<{ ok: boolean }>;
  clearProviderSecrets(providerId: string): Promise<{ ok: boolean }>;
  // Multiple API Keys Management
  getProviderApiKeys(providerId: string, key: string): Promise<Array<{ name: string; value: string; isDefault?: boolean }>>;
  setProviderApiKeys(providerId: string, key: string, keys: Array<{ name: string; value: string; isDefault?: boolean }>): Promise<{ ok: boolean }>;
  addProviderApiKey(providerId: string, key: string, apiKey: { name: string; value: string }): Promise<{ ok: boolean }>;
  updateProviderApiKey(providerId: string, key: string, apiKeyName: string, updates: Partial<{ name: string; value: string; isDefault?: boolean }>): Promise<{ ok: boolean }>;
  removeProviderApiKey(providerId: string, key: string, apiKeyName: string): Promise<{ ok: boolean }>;
  setDefaultProviderApiKey(providerId: string, key: string, apiKeyName: string): Promise<{ ok: boolean }>;
  clearAllSecrets(): Promise<{ ok: boolean }>;
  chat(payload: any): Promise<{ message: { role: string; content: string } }>;
  // Stateless chat (no history persistence)
  chatEphemeral(payload: ChatRequest): Promise<{ message: { role: string; content: string } }>;
  chatStream(payload: ChatRequest, onEvent: (ev: { type: string; data?: any }) => void): Promise<{ requestId: string; dispose: () => void; cancel: () => Promise<any> }>;
  // Subtitle translation: handled in main process, sends messages to all windows
  translate(payload: {
    providerId: string;
    model: string;
    segments?: Array<{ text: string; index: number }>;
    resourceId?: string;
    targetLanguage: string;
    languageNames: Record<string, string>;
    metadata?: Record<string, any>;
    options?: {
      /** 最大并发请求数 */
      maxConcurrency?: number;
      /** 每个分块的最大字符数 */
      chunkSize?: number;
      /** 失败后最大重试次数 */
      maxRetries?: number;
      /** 自定义提示词模板 */
      promptTemplate?: string;
      /** 是否生成 summary */
      generateSummary?: boolean;
      /** 术语表/热词词典
       * 支持格式:
       * - 数组: Array<{ source: string; target: string; note?: string }>
       * - 对象: Record<string, string> (source -> target)
       * - 带说明的对象: Record<string, { target: string; note?: string }>
       */
      glossary?: any;
    };
  }): Promise<{ requestId: string }>;
  cancelTranslate(requestId: string): Promise<{ ok: boolean }>;
  getTranslationTasks(): Promise<Array<{ requestId: string; providerId: string; model: string; startTime: number; metadata?: Record<string, any> }>>;
  getTranslatedSegments(requestId: string): Promise<any[]>;
  getResourceTranslations(resourceId: string): Promise<Array<{ id: string; language?: string; title?: string; filePath?: string; segments?: Array<{ index: number; text: string }> }>>;
  updateTranslationSegment(payload: { translationResourceId: string; segmentIndex: number; patch: { st?: string; et?: string; text?: string } }): Promise<{ success: boolean; message?: string }>;
  insertTranslationSegment(payload: { translationResourceId: string; insertIndex: number; segment: { st: string; et: string; text: string } }): Promise<{ success: boolean; message?: string }>;
  deleteTranslationSegment(payload: { translationResourceId: string; segmentIndex: number }): Promise<{ success: boolean; message?: string }>;
  getAllTranslationHistory(
    resourceId: string
  ): Promise<Array<{ id: string; language?: string; title?: string; filePath?: string; segments?: Array<{ index: number; text: string }>; createdAt?: number; updatedAt?: number }>>;
  transcribe(payload: { providerId: string; file: Blob | Buffer; model?: string; language?: string; prompt?: string }): Promise<{ text: string }>;
  embed(payload: { texts: string[]; providerId?: string; model?: string; normalize?: boolean }): Promise<{ vectors: number[][]; dim: number }>;
  // Instances
  listInstances(providerId?: string): Promise<any[]>;
  createInstance(payload: { providerId: string; name: string; model?: string; systemPrompt?: string; config?: Record<string, any> }): Promise<any>;
  updateInstance(id: string, patch: any): Promise<any>;
  deleteInstance(id: string): Promise<{ ok: boolean }>;
  getInstanceSecrets(instanceId: string): Promise<Record<string, string>>;
  setInstanceSecrets(instanceId: string, secrets: Record<string, string>): Promise<{ ok: boolean }>;
  // Prompt templates
  listPromptTemplates(): Promise<any[]>;
  createPromptTemplate(payload: { name: string; type: 'system' | 'user'; content: string; tags?: string[] }): Promise<any>;
  updatePromptTemplate(id: string, patch: any): Promise<any>;
  deletePromptTemplate(id: string): Promise<{ ok: boolean }>;
  // Conversations
  listConversations(payload?: { includeDeleted?: boolean; limit?: number; offset?: number }): Promise<any[]>;
  listMessages(conversationId: string, limit?: number, offset?: number): Promise<any[]>;
  renameConversation(id: string, title: string): Promise<{ ok: boolean; row?: any }>;
  deleteConversation(id: string): Promise<{ ok: boolean }>;
  restoreConversation(id: string): Promise<{ ok: boolean }>;
  // Glossary management
  listGlossaryCategories(): Promise<Array<{ id: string; name: string; description?: string; createdAt: number; updatedAt: number }>>;
  createGlossaryCategory(payload: { name: string; description?: string }): Promise<{ id: string; name: string; description?: string; createdAt: number; updatedAt: number }>;
  updateGlossaryCategory(id: string, patch: { name?: string; description?: string }): Promise<{ id: string; name: string; description?: string; createdAt: number; updatedAt: number } | undefined>;
  deleteGlossaryCategory(id: string): Promise<{ ok: boolean }>;
  listGlossaries(categoryId?: string): Promise<
    Array<{
      id: string;
      categoryId: string;
      name: string;
      description?: string;
      entries: Array<{ source: string; target: string; note?: string }>;
      sourceFile?: string;
      sourceFormat?: string;
      createdAt: number;
      updatedAt: number;
    }>
  >;
  getGlossary(id: string): Promise<
    | {
      id: string;
      categoryId: string;
      name: string;
      description?: string;
      entries: Array<{ source: string; target: string; note?: string }>;
      sourceFile?: string;
      sourceFormat?: string;
      createdAt: number;
      updatedAt: number;
    }
    | undefined
  >;
  createGlossary(payload: {
    categoryId: string;
    name: string;
    description?: string;
    entries: Array<{ source: string; target: string; note?: string }>;
    sourceFile?: string;
    sourceFormat?: string;
  }): Promise<{
    id: string;
    categoryId: string;
    name: string;
    description?: string;
    entries: Array<{ source: string; target: string; note?: string }>;
    sourceFile?: string;
    sourceFormat?: string;
    createdAt: number;
    updatedAt: number;
  }>;
  updateGlossary(
    id: string,
    patch: { categoryId?: string; name?: string; description?: string; entries?: Array<{ source: string; target: string; note?: string }> }
  ): Promise<
    | {
      id: string;
      categoryId: string;
      name: string;
      description?: string;
      entries: Array<{ source: string; target: string; note?: string }>;
      sourceFile?: string;
      sourceFormat?: string;
      createdAt: number;
      updatedAt: number;
    }
    | undefined
  >;
  deleteGlossary(id: string): Promise<{ ok: boolean }>;
  addGlossaryEntries(
    glossaryId: string,
    entries: Array<{ source: string; target: string; note?: string }>
  ): Promise<
    | {
      id: string;
      categoryId: string;
      name: string;
      description?: string;
      entries: Array<{ source: string; target: string; note?: string }>;
      sourceFile?: string;
      sourceFormat?: string;
      createdAt: number;
      updatedAt: number;
    }
    | undefined
  >;
  removeGlossaryEntry(
    glossaryId: string,
    source: string
  ): Promise<
    | {
      id: string;
      categoryId: string;
      name: string;
      description?: string;
      entries: Array<{ source: string; target: string; note?: string }>;
      sourceFile?: string;
      sourceFormat?: string;
      createdAt: number;
      updatedAt: number;
    }
    | undefined
  >;
  updateGlossaryEntry(
    glossaryId: string,
    oldSource: string,
    newEntry: { source: string; target: string; note?: string }
  ): Promise<
    | {
      id: string;
      categoryId: string;
      name: string;
      description?: string;
      entries: Array<{ source: string; target: string; note?: string }>;
      sourceFile?: string;
      sourceFormat?: string;
      createdAt: number;
      updatedAt: number;
    }
    | undefined
  >;
  parseGlossaryContent(
    content: string,
    fileName?: string
  ): Promise<{ success: boolean; entries: Array<{ source: string; target: string; note?: string }>; format: string; error?: string; suggestedName?: string }>;
  mergeGlossaries(ids: string[]): Promise<Array<{ source: string; target: string; note?: string }>>;

  // ==================== 总结相关 ====================

  getResourceSummary(resourceId: string): Promise<any | null>;
  summarize(payload: {
    providerId: string;
    model: string;
    content?: string;
    segments?: any[];
    resourceId?: string;
    targetLanguage: string;
    languageNames: Record<string, string>;
    options?: {
      maxChars?: number;
      extractKeyPoints?: boolean;
      extractTimeline?: boolean;
      keywordCount?: number;
      promptTemplate?: string;
    };
    metadata?: Record<string, any>;
  }): Promise<{ requestId: string }>;
  cancelSummary(requestId: string): Promise<{ ok: boolean }>;
  getSummaryTasks(): Promise<Array<{ requestId: string; providerId: string; model: string; startTime: number; metadata?: Record<string, any> }>>;

  // ==================== 脑图相关 ====================

  generateMindmap(payload: {
    providerId: string;
    model: string;
    content?: string;
    segments?: any[];
    resourceId?: string;
    targetLanguage: string;
    languageNames?: Record<string, string>;
    options?: any;
    metadata?: any;
  }): Promise<{ requestId: string }>;
  cancelMindmap(requestId: string): Promise<{ ok: boolean }>;
};
