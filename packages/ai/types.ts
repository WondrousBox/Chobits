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
  agentId?: string; // which agent to use
  providerId?: string; // which provider adapter to use
  providerInstanceId?: string; // which provider instance to use
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  abortId?: string; // used to cancel via IPC
  extras?: Record<string, any>; // agent/provider specific
};

export type StreamEvent =
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
  // Optional i18n locales: e.g., { en: { label: 'OpenAI', fields: { apiKey: 'API Key' } }, zh: { label: '开放AI' } }
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
  clearAllSecrets(): Promise<{ ok: boolean }>;
  chat(payload: any): Promise<{ message: { role: string; content: string } }>;
  // Stateless chat (no history persistence)
  chatEphemeral(payload: ChatRequest): Promise<{ message: { role: string; content: string } }>;
  // Stateless streaming chat (no history persistence)
  chatStreamEphemeral(payload: any, onEvent: (ev: { type: string; data?: any }) => void): Promise<{ requestId: string; dispose: () => void; cancel: () => Promise<any> }>;
  chatStream(payload: ChatRequest, onEvent: (ev: { type: string; data?: any }) => void): Promise<{ requestId: string; dispose: () => void; cancel: () => Promise<any> }>;
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
};
