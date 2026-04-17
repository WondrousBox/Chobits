import type { AimSegments } from '@aim-packages/subtitle';

// Core message primitives
export type Role = 'system' | 'user' | 'assistant' | 'tool';

export type TokenUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  totalTokens?: number;
  billableInputTokens?: number;
  billableOutputTokens?: number;
  billableTotalTokens?: number;
  cost?: number;
};

export type ChatMessage = {
  id?: string;
  role: Role;
  content: string;
  name?: string;
  toolCallId?: string;
  metadata?: Record<string, any>;
  usage?: TokenUsage;
  createdAt?: number;
};

export const CHAT_MESSAGE_DISPLAY_PARTS_METADATA_KEY = 'displayParts';

export type ChatMessageDisplayPart = { type: 'text'; text: string } | { type: 'thinking'; thinking: string } | { type: 'tool'; callId: string };

export type ExplicitSkillInvocationInput = {
  matchedReference: string;
  remainingQuery?: string;
  source?: 'input' | 'slash-command';
};

export type ProviderPresetFields = {
  providerPresetId?: string;
};

export type ProviderScopedRequest = ProviderPresetFields & {
  providerId: string;
};

export type OptionalProviderScopedRequest = ProviderPresetFields & {
  providerId?: string;
};

export type ChatRequestExtras = Record<string, any> & {
  codingWorkspaceRoot?: string;
  codingWorkspaceLabel?: string;
  codingMode?: 'safe';
  workspaceId?: string;
  explicitSkillInvocation?: ExplicitSkillInvocationInput;
};

export type ChatRequest = ProviderScopedRequest & {
  conversationId?: string;
  messages: ChatMessage[];
  agentId?: string; // which agent to use (optional, can be inferred from preset overrides)
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  abortId?: string; // used to cancel via IPC
  extras?: ChatRequestExtras; // agent/provider specific
  requestId?: string; // for streaming identification
  persist?: boolean; // whether to persist conversation/messages (default true)
};

// ==================== 交互式选项 ====================

/** 单个选项 */
export interface UserChoiceOption {
  /** 选项唯一标识（返回给 agent） */
  value: string;
  /** 显示文本 */
  label: string;
  /** 可选的描述 */
  description?: string;
}

/** 一道选择题 */
export interface UserChoiceQuestion {
  /** 题目唯一 ID */
  id: string;
  /** 题目标题 */
  title: string;
  /** 可选的说明文本 */
  description?: string;
  /** 选项列表 */
  options: UserChoiceOption[];
  /** 是否多选，默认 false（单选） */
  multiple?: boolean;
}

/** 由 agent 推送给 UI 的选择请求 */
export interface UserChoiceRequest {
  /** 本次选择请求的唯一 ID，UI 回传时需带上 */
  choiceId: string;
  /** 关联的 tool call ID */
  toolCallId: string;
  /** 一组题目，支持多题滑动（swipe） */
  questions: UserChoiceQuestion[];
  /** 可选的顶部提示文本 */
  prompt?: string;
}

/** 用户的回答 */
export interface UserChoiceResponse {
  /** 对应的选择请求 ID */
  choiceId: string;
  /** 每题的回答，key 为 questionId，value 为选中的 value 数组 */
  answers: Record<string, string[]>;
}

export type StreamEvent =
  | { type: 'connected' }
  | { type: 'delta'; data: { text?: string; toolCall?: any } }
  | { type: 'message_completed'; data: { message: ChatMessage; usage?: TokenUsage } }
  | { type: 'tool_call'; data: { name: string; args: any; callId: string; label?: string } }
  | { type: 'tool_result'; data: { callId: string; result: any } }
  | { type: 'tool_progress'; data: { callId: string; progress: number; message?: string } }
  | { type: 'thinking_delta'; data: { text: string } }
  | { type: 'user_choice_request'; data: UserChoiceRequest }
  | { type: 'metadata'; data: Record<string, any> }
  | { type: 'error'; data: { message: string; code?: string; cause?: any } }
  | { type: 'done' };

export type ChatResponse = {
  message: ChatMessage;
  usage?: TokenUsage;
  providerId?: string;
  agentId?: string;
  metadata?: Record<string, any>;
};

// Embeddings
export type EmbeddingRequest = OptionalProviderScopedRequest & {
  texts: string[];
  model?: string;
  normalize?: boolean;
  extras?: Record<string, any>;
};
export type EmbeddingResponse = {
  vectors: number[][];
  dim: number;
  model?: string;
  providerId?: string;
  usage?: TokenUsage;
  rawUsage?: unknown;
};
export type TranscribeOptions = {
  model?: string;
  language?: string;
  prompt?: string;
  secrets?: ProviderSecrets;
};
export type TranscriptionResponse = {
  text: string;
  model?: string;
  providerId?: string;
  usage?: TokenUsage;
  rawUsage?: unknown;
};
export type TranscriptionRequest = ProviderScopedRequest & {
  file: File | Blob | Buffer | ArrayBuffer;
  model?: string;
  language?: string;
  prompt?: string;
  extras?: Record<string, any>;
};
export type ImageGenerationRequest = ProviderScopedRequest & {
  model: string;
  prompt: string;
  size?: string;
  quality?: string;
  extras?: Record<string, any>;
};
export type ImageGenerationResponse = {
  imageUrl: string;
  model?: string;
  providerId?: string;
  revisedPrompt?: string;
  usage?: TokenUsage;
  rawUsage?: unknown;
};
export type TranslateRequest = ProviderScopedRequest & {
  model: string;
  segments?: AimSegments[];
  resourceId?: string;
  targetLanguage: string;
  sourceLanguage?: string;
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
};
export type SummarizeRequest = ProviderScopedRequest & {
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
};
export type MindmapRequest = ProviderScopedRequest & {
  model: string;
  content?: string;
  segments?: any[];
  resourceId?: string;
  targetLanguage: string;
  languageNames?: Record<string, string>;
  options?: any;
  metadata?: any;
};
export type ActiveAiTaskSnapshot = {
  requestId: string;
  providerId: string;
  model: string;
  startTime: number;
  taskLabel?: string;
  metadata?: Record<string, any>;
};
export type TranslatedSegmentSnapshot = AimSegments & {
  index: number;
  summary?: string;
  startIndex?: number;
  endIndex?: number;
};
export type ProviderPresetOverrides = Record<string, any>;
export type ProviderPresetCreatePayload = {
  providerId: string;
  name: string;
  systemPrompt?: string;
  overrides?: ProviderPresetOverrides;
  // Legacy alias kept for compatibility while callers migrate to overrides.
  config?: ProviderPresetOverrides;
  enabledTools?: string[];
};
export type ProviderPresetUpdatePatch = Partial<{
  providerId: string;
  name: string;
  systemPrompt: string;
  overrides: ProviderPresetOverrides;
  config: ProviderPresetOverrides;
  enabledTools: string[];
}>;
export type ProviderPresetRecord = {
  id: string;
  providerId: string;
  name: string;
  systemPrompt?: string;
  overrides?: ProviderPresetOverrides;
  // Legacy alias kept for compatibility while callers migrate to overrides.
  config?: ProviderPresetOverrides;
  enabledTools?: string[];
  createdAt?: number;
  updatedAt?: number;
};
export type ConversationRecord = {
  id: string;
  title?: string | null;
  workspaceId?: string | null;
  agentId?: string | null;
  providerId?: string | null;
  providerPresetId?: string | null;
  messagesCount?: number | null;
  lastMessageAt?: number | null;
  pinned?: number | null;
  metadata?: string | null;
  createdAt?: number | null;
  updatedAt?: number | null;
  deletedAt?: number | null;
};
export type ProviderCapabilityKey = 'chat' | 'modelListing' | 'embeddings' | 'transcribe' | 'imageGeneration';
export type ProviderCapabilities = Record<ProviderCapabilityKey, boolean>;
export type ProviderDefaultModels = {
  chat?: string;
  embeddings?: string;
  transcribe?: string;
  imageGeneration?: string;
};
export type ProviderRecord = {
  id: string;
  aliases?: string[];
  label: string;
  source?: 'builtin' | 'plugin';
  configured?: boolean;
  kind?: string;
  defaultModel?: string;
  capabilities?: ProviderCapabilities;
  defaultModels?: ProviderDefaultModels;
  schema?: {
    icon?: string;
    locales?: Record<string, { label?: string; fields?: Record<string, string> }>;
    fields?: Array<{ key: string; label: string; type: string; required?: boolean; options?: any[] }>;
  };
};

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
  getCapabilities?(): ProviderCapabilities;
  getDefaultModels?(): ProviderDefaultModels;
  getConfigSchema?(): ProviderConfig;
  setSecrets(secrets: ProviderSecrets): Promise<void> | void;
  getSecrets(): Promise<ProviderSecrets> | ProviderSecrets;
  // Chat
  chat?(req: ChatRequest, onStream?: (event: StreamEvent) => void, signal?: AbortSignal): Promise<ChatResponse>;
  // Embeddings
  embed?(req: EmbeddingRequest): Promise<EmbeddingResponse>;
  // Models: return id + optional metadata; UI will use label if provided
  listModels?(opts?: { secrets?: ProviderSecrets }): Promise<Array<{ id: string; label?: string; [k: string]: any }>>;
  // ASR
  transcribe?(file: File | Blob | Buffer | ArrayBuffer, options?: TranscribeOptions): Promise<TranscriptionResponse>;
}

// Agent contracts are now represented by Pi profiles and provider adapters.

export type StartStreamPayload = { requestId: string; eventsChannel: string } & ChatRequest;

export type ToolInfo = {
  id: string;
  name: string;
  description: string;
};

export type SkillInfo = {
  name: string;
  description: string;
  aliases: string[];
  argumentHint?: string;
  whenToUse?: string;
  source: string;
  sourceDetail?: string;
  sourceLabel?: string;
  trustNote?: string;
  trustLevel?: 'trusted' | 'workspace' | 'plugin' | 'compatibility';
};

// ==================== 卡片推送类型 ====================

/** 卡片类型 */
export type ChatCardType = 'resource' | 'video' | 'audio' | 'image' | 'document' | 'link' | 'file';

/** 推送的卡片数据 */
export interface PushedCard {
  /** 卡片类型 */
  type: ChatCardType;
  /** 资源 ID（用于从数据库加载完整资源信息） */
  resourceId?: string;
  /** 内嵌的资源数据（用于临时卡片，无需从数据库加载） */
  data?: Record<string, any> & { id: string };
  /** 关联的会话 ID（可选，用于定向推送到特定会话） */
  conversationId?: string;
  /** 可选的文本说明 */
  text?: string;
  /** 时间戳 */
  timestamp: number;
}

export type AIApi = {
  getProviders(): Promise<ProviderRecord[]>;
  getAgents(): Promise<any[]>;
  listTools(): Promise<ToolInfo[]>;
  listSkills(payload?: { agentId?: string; workspaceRoot?: string }): Promise<SkillInfo[]>;
  listModels(providerId: string, presetId?: string): Promise<Array<{ id: string; label?: string; [k: string]: any }>>;
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
  translate(payload: TranslateRequest): Promise<{ requestId: string }>;
  cancelTranslate(requestId: string): Promise<{ ok: boolean }>;
  getTranslationTasks(): Promise<ActiveAiTaskSnapshot[]>;
  getTranslatedSegments(requestId: string): Promise<TranslatedSegmentSnapshot[]>;
  getResourceTranslations(resourceId: string): Promise<Array<{ id: string; language?: string; title?: string; filePath?: string; segments?: Array<{ index: number; text: string }> }>>;
  updateTranslationSegment(payload: { translationResourceId: string; segmentIndex: number; patch: { st?: string; et?: string; text?: string } }): Promise<{ success: boolean; message?: string }>;
  insertTranslationSegment(payload: { translationResourceId: string; insertIndex: number; segment: { st: string; et: string; text: string } }): Promise<{ success: boolean; message?: string }>;
  deleteTranslationSegment(payload: { translationResourceId: string; segmentIndex: number }): Promise<{ success: boolean; message?: string }>;
  getAllTranslationHistory(
    resourceId: string
  ): Promise<Array<{ id: string; language?: string; title?: string; filePath?: string; segments?: Array<{ index: number; text: string }>; createdAt?: number; updatedAt?: number }>>;
  transcribe(payload: TranscriptionRequest): Promise<TranscriptionResponse>;
  generateImage(payload: ImageGenerationRequest): Promise<ImageGenerationResponse>;
  embed(payload: EmbeddingRequest): Promise<{ vectors: number[][]; dim: number }>;
  // Presets
  listPresets(providerId?: string): Promise<ProviderPresetRecord[]>;
  resolveUsablePreset(providerId: string, preferredPresetId?: string): Promise<ProviderPresetRecord | null>;
  createPreset(payload: ProviderPresetCreatePayload): Promise<ProviderPresetRecord>;
  updatePreset(id: string, patch: ProviderPresetUpdatePatch): Promise<ProviderPresetRecord | undefined>;
  deletePreset(id: string): Promise<{ ok: boolean }>;
  getPresetSecrets(presetId: string): Promise<Record<string, string>>;
  setPresetSecrets(presetId: string, secrets: Record<string, string>): Promise<{ ok: boolean }>;
  // Prompt templates
  listPromptTemplates(): Promise<any[]>;
  createPromptTemplate(payload: { name: string; type: 'system' | 'user'; content: string; tags?: string[] }): Promise<any>;
  updatePromptTemplate(id: string, patch: any): Promise<any>;
  deletePromptTemplate(id: string): Promise<{ ok: boolean }>;
  // Conversations
  listConversations(payload?: { includeDeleted?: boolean; limit?: number; offset?: number }): Promise<ConversationRecord[]>;
  listMessages(conversationId: string, limit?: number, offset?: number): Promise<any[]>;
  renameConversation(id: string, title: string): Promise<{ ok: boolean; row?: ConversationRecord }>;
  deleteConversation(id: string): Promise<{ ok: boolean }>;
  restoreConversation(id: string): Promise<{ ok: boolean }>;
  hardDeleteConversation(id: string): Promise<{ ok: boolean }>;
  /** Subscribe to conversation title updates pushed from main process */
  onConversationTitleUpdated(callback: (data: { conversationId: string; title: string | null; status: 'generating' | 'done' | 'error' }) => void): () => void;
  /** Subscribe to card push events from main process */
  onCardPushed(callback: (card: PushedCard) => void): () => void;
  /** Send user's choice response back to main process (for ask-user tool) */
  sendUserChoiceResponse(response: UserChoiceResponse): Promise<{ success: boolean; error?: string }>;
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
  summarize(payload: SummarizeRequest): Promise<{ requestId: string }>;
  cancelSummary(requestId: string): Promise<{ ok: boolean; message?: string }>;
  getSummaryTasks(): Promise<ActiveAiTaskSnapshot[]>;

  // ==================== 脑图相关 ====================

  generateMindmap(payload: MindmapRequest): Promise<{ requestId: string }>;
  cancelMindmap(requestId: string): Promise<{ ok: boolean }>;

  // ==================== 笔记相关 ====================

  /**
   * 保存或更新笔记内容
   * @param resourceId 源资源ID
   * @param content 笔记内容（HTML或Markdown）
   * @param title 笔记标题（可选）
   * @returns 笔记资源ID
   */
  saveNote(payload: { resourceId: string; content: string; title?: string }): Promise<{ success: boolean; noteId?: string; message?: string }>;

  /**
   * 获取资源的笔记内容
   * @param resourceId 源资源ID
   * @returns 笔记数据
   */
  getResourceNote(resourceId: string): Promise<{ id: string; content: string; title?: string; filePath?: string; createdAt?: number; updatedAt?: number } | null>;
};
