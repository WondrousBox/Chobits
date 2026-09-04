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

export type ToolCallDisplayMode = 'default' | 'hidden' | 'content-only';

export type ToolCallDisplay = {
  mode?: ToolCallDisplayMode;
};

export type ToolSpeech = {
  text: string;
  bubbleEnabled?: boolean;
  bubbleDuration?: number;
  delayMs?: number;
};

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
  explicitSkillInvocation?: ExplicitSkillInvocationInput;
  realtimeSpeechScope?: 'mainChat';
  realtimeSpeech?: {
    enabled?: boolean;
    providerId?: string;
    model?: string;
    voiceId?: string;
  };
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

export const LONG_TASK_BACKGROUND_CHOICE_QUESTION_ID = '__long_task_background__';
export const LONG_TASK_BACKGROUND_CHOICE_VALUE = '__background__';

export type StreamEvent =
  | { type: 'connected' }
  | { type: 'delta'; data: { text?: string; toolCall?: any } }
  | { type: 'message_completed'; data: { message: ChatMessage; usage?: TokenUsage } }
  | { type: 'tool_call'; data: { name: string; args: any; callId: string; label?: string; display?: ToolCallDisplay } }
  | { type: 'tool_result'; data: { callId: string; result: any; speech?: ToolSpeech } }
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
  responseFormat?: 'url' | 'b64_json';
  outputFormat?: 'png' | 'jpeg' | 'webp';
  outputCompression?: number;
  partialImages?: number;
  sessionId?: string;
  extras?: Record<string, any>;
};
export type GeneratedImageArtifact = {
  filePath?: string;
  imageUrl?: string;
  mimeType?: string;
  revisedPrompt?: string;
  sizeBytes?: number;
};
export type GeneratedAudioArtifact = {
  audioUrl?: string;
  audioBase64?: string;
  audioHex?: string;
  filePath?: string;
  mimeType?: string;
  format?: string;
  durationMs?: number;
  sampleRate?: number;
  bitrate?: number;
  channels?: number;
  sizeBytes?: number;
  title?: string;
  seed?: number;
  timestamps?: Array<{
    type: 'word' | 'sentence' | 'ssml_mark' | 'phoneme' | string;
    text?: string;
    startMs: number;
    endMs?: number;
  }>;
  metadata?: Record<string, any>;
};
export type MusicGenerationMode = 'text-to-music' | 'lyrics-to-song' | 'instrumental' | 'cover';
export type MusicGenerationAudioSetting = {
  sampleRate?: number;
  bitrate?: number;
  format?: string;
};
export type MusicGenerationRequest = ProviderScopedRequest & {
  model: string;
  prompt: string;
  lyrics?: string;
  mode?: MusicGenerationMode;
  durationMs?: number;
  negativePrompt?: string;
  seed?: number;
  sampleCount?: number;
  outputFormat?: 'url' | 'hex' | string;
  stream?: boolean;
  audioSetting?: MusicGenerationAudioSetting;
  isInstrumental?: boolean;
  lyricsOptimizer?: boolean;
  referenceAudioUrl?: string;
  referenceAudioBase64?: string;
  coverFeatureId?: string;
  extras?: Record<string, any>;
};
export type MusicGenerationResponse = {
  artifacts: GeneratedAudioArtifact[];
  audioUrl?: string;
  audioBase64?: string;
  filePath?: string;
  model?: string;
  providerId?: string;
  usage?: TokenUsage;
  rawUsage?: unknown;
  rawResponse?: unknown;
};
export type SpeechSynthesisMode = 'complete' | 'output-stream' | 'duplex-stream' | 'async-job';
export type SpeechSynthesisTransportPreference = 'auto' | 'http' | 'http-stream' | 'sse' | 'websocket' | 'webrtc';
export type SpeechSynthesisAudioSetting = {
  sampleRate?: number;
  bitrate?: number;
  format?: string;
  channels?: number;
};
export type SpeechSynthesisRequest = ProviderScopedRequest & {
  model: string;
  text?: string;
  mode?: SpeechSynthesisMode;
  transportPreference?: SpeechSynthesisTransportPreference;
  voice?: string;
  voiceId?: string;
  language?: string;
  inputFormat?: 'text' | 'ssml' | string;
  outputFormat?: 'hex' | 'url' | 'mp3' | 'wav' | 'flac' | 'pcm' | 'opus' | string;
  audioSetting?: SpeechSynthesisAudioSetting;
  speed?: number;
  rate?: number;
  pitch?: number;
  volume?: number;
  emotion?: string;
  returnTimestamps?: boolean;
  subtitle?: {
    enabled?: boolean;
    type?: 'sentence' | 'word' | 'word_streaming' | string;
  };
  pronunciationDict?: Record<string, any>;
  extras?: Record<string, any>;
};
export type SpeechSynthesisResponse = {
  artifacts: GeneratedAudioArtifact[];
  audioUrl?: string;
  audioBase64?: string;
  filePath?: string;
  model?: string;
  providerId?: string;
  voice?: string;
  voiceId?: string;
  usage?: TokenUsage;
  rawUsage?: unknown;
  rawResponse?: unknown;
};
export type SpeechSynthesisStreamEvent =
  | {
      type: 'started';
      data: {
        requestId?: string;
        providerRequestId?: string;
        mode?: SpeechSynthesisMode;
        transport?: string;
        format?: string;
        sampleRate?: number;
        channels?: number;
        sampleFormat?: 's16le' | 'f32le' | string;
      };
    }
  | {
      type: 'audio_delta';
      data: {
        chunk: ArrayBuffer | Buffer;
        format?: string;
        mimeType?: string;
        sampleRate?: number;
        channels?: number;
        sampleFormat?: 's16le' | 'f32le' | string;
        sequence?: number;
        isHeaderChunk?: boolean;
        encoding?: 'binary' | 'base64' | 'hex';
      };
    }
  | { type: 'text_delta'; data: { text?: string; timestamps?: GeneratedAudioArtifact['timestamps'] } }
  | { type: 'metadata'; data: Record<string, any> }
  | { type: 'completed'; data: SpeechSynthesisResponse }
  | { type: 'error'; data: { message: string; code?: string; cause?: any } }
  | { type: 'done' };
export type SpeechTextInputChunk = { type: 'text'; text: string } | { type: 'flush' } | { type: 'close' };
export type SpeechSynthesisStreamHandle = {
  requestId: string;
  appendText: (text: string) => Promise<any>;
  dispose: () => void;
  cancel: () => Promise<any>;
  finish: () => Promise<any>;
  flush: () => Promise<any>;
  on: (cb: (ev: SpeechSynthesisStreamEvent) => void) => () => boolean;
  off: (cb: (ev: SpeechSynthesisStreamEvent) => void) => void;
};
export type LyricsGenerationMode = 'write_full_song' | 'edit';
export type LyricsGenerationRequest = ProviderScopedRequest & {
  mode?: LyricsGenerationMode;
  model?: string;
  prompt?: string;
  lyrics?: string;
  extras?: Record<string, any>;
};
export type LyricsGenerationResponse = {
  lyrics: string;
  songTitle?: string;
  styleTags?: string;
  model?: string;
  providerId?: string;
  usage?: TokenUsage;
  rawUsage?: unknown;
  rawResponse?: unknown;
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
export type ProviderCapabilityKey = 'chat' | 'modelListing' | 'embeddings' | 'transcribe' | 'imageGeneration' | 'musicGeneration' | 'speechSynthesis';
export type ProviderCapabilities = Record<ProviderCapabilityKey, boolean>;
export type ProviderDefaultModels = {
  chat?: string;
  embeddings?: string;
  transcribe?: string;
  imageGeneration?: string;
  musicGeneration?: string;
  speechSynthesis?: string;
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
  // 内置默认配置（如自托管 provider 的默认 baseUrl/apiKey），用于设置页表单预填
  defaultConfig?: Record<string, string>;
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
  // 清空内存中的用户秘钥，回落到 provider 内置默认值（clear 路径专用，区别于合并语义的 setSecrets）
  clearSecrets?(): Promise<void> | void;
  getSecrets(): Promise<ProviderSecrets> | ProviderSecrets;
  // Chat
  chat?(req: ChatRequest, onStream?: (event: StreamEvent) => void, signal?: AbortSignal): Promise<ChatResponse>;
  // Embeddings
  embed?(req: EmbeddingRequest): Promise<EmbeddingResponse>;
  // Models: return id + optional metadata; UI will use label if provided
  listModels?(opts?: { secrets?: ProviderSecrets }): Promise<Array<{ id: string; label?: string; [k: string]: any }>>;
  // ASR
  transcribe?(file: File | Blob | Buffer | ArrayBuffer, options?: TranscribeOptions): Promise<TranscriptionResponse>;
  // Music generation
  generateMusic?(req: MusicGenerationRequest, signal?: AbortSignal): Promise<MusicGenerationResponse>;
  generateLyrics?(req: LyricsGenerationRequest, signal?: AbortSignal): Promise<LyricsGenerationResponse>;
  // Speech synthesis
  synthesizeSpeech?(req: SpeechSynthesisRequest, signal?: AbortSignal): Promise<SpeechSynthesisResponse>;
  streamSpeechSynthesis?(
    req: SpeechSynthesisRequest,
    onEvent: (event: SpeechSynthesisStreamEvent) => void,
    signal?: AbortSignal,
    input?: AsyncIterable<SpeechTextInputChunk>
  ): Promise<SpeechSynthesisResponse>;
}

// Agent contracts are now represented by Pi profiles and provider adapters.

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

export type AIApi = {
  getProviders(): Promise<ProviderRecord[]>;
  getAgents(): Promise<any[]>;
  listSkills(payload?: { agentId?: string; workspaceRoot?: string }): Promise<SkillInfo[]>;
  listModels(providerId: string, presetId?: string): Promise<Array<{ id: string; label?: string; [k: string]: any }>>;
  getProviderSecrets(providerId: string): Promise<Record<string, string>>;
  setProviderSecrets(providerId: string, secrets: Record<string, string>): Promise<{ ok: boolean }>;
  // Multiple API Keys Management
  getProviderApiKeys(providerId: string, key: string): Promise<Array<{ name: string; value: string; isDefault?: boolean }>>;
  clearAllSecrets(): Promise<{ ok: boolean }>;
  chat(payload: any): Promise<{ message: { role: string; content: string } }>;
  chatStream(payload: ChatRequest, onEvent: (ev: { type: string; data?: any }) => void): Promise<{ requestId: string; dispose: () => void; cancel: () => Promise<any> }>;
  transcribe(payload: TranscriptionRequest): Promise<TranscriptionResponse>;
  synthesizeSpeech(payload: SpeechSynthesisRequest): Promise<SpeechSynthesisResponse>;
  streamSpeechSynthesis(payload: SpeechSynthesisRequest, onEvent: (ev: SpeechSynthesisStreamEvent) => void): Promise<SpeechSynthesisStreamHandle>;
  // Presets
  listPresets(providerId?: string): Promise<ProviderPresetRecord[]>;
  resolveUsablePreset(providerId: string, preferredPresetId?: string): Promise<ProviderPresetRecord | null>;
  createPreset(payload: ProviderPresetCreatePayload): Promise<ProviderPresetRecord>;
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
  hardDeleteConversation(id: string): Promise<{ ok: boolean }>;
  /** Subscribe to conversation title updates pushed from main process */
  onConversationTitleUpdated(callback: (data: { conversationId: string; title: string | null; status: 'generating' | 'done' | 'error' }) => void): () => void;
  /** Send user's choice response back to main process (for ask-user tool) */
  sendUserChoiceResponse(response: UserChoiceResponse): Promise<{ ok: boolean; error?: string }>;
};
