import type { ChatMessage, ChatRequest, ProviderPresetRecord } from '../../types';

export type PiRuntimeId = 'legacy' | 'pi';

export type PiExecutionMode = 'session' | 'one-shot';

export type PiProfileId = 'chat' | 'assistant' | 'rag' | 'tagger' | 'translator' | (string & {});

export type PiToolCategory = 'query' | 'content' | 'background-task' | 'ui-side-effect' | 'integration';

export type PiToolStatus = 'legacy-only' | 'scaffolded' | 'ready-for-pi-runtime';

export interface PiAgentProfile {
  id: PiProfileId;
  label: string;
  description?: string;
  instructions?: string;
  executionMode: PiExecutionMode;
  supportsToolCalls: boolean;
  defaultToolIds: string[];
}

export interface ResolvedPiModelConfig {
  providerId: string;
  canonicalProviderId: string;
  providerLabel?: string;
  modelId: string;
  apiKey?: string;
  baseUrl?: string;
  presetId?: string;
  source: 'provider' | 'preset';
  secrets: Record<string, string>;
}

export interface ResolvedPiRequest {
  runtime: PiRuntimeId;
  runtimeRequested: boolean;
  request: ChatRequest;
  profile: PiAgentProfile;
  model: ResolvedPiModelConfig;
  messages: ChatMessage[];
  enabledToolIds: string[];
  preset?: ProviderPresetRecord;
}

export interface PiToolDescriptor {
  id: string;
  name: string;
  description: string;
  category: PiToolCategory;
  status: PiToolStatus;
  compatName?: string;
}

export interface PiRuntimeAvailability {
  requested: boolean;
  available: boolean;
  reason?: string;
  missingPackages?: string[];
}

export interface PiRuntimePreview {
  availability: PiRuntimeAvailability;
  resolved: ResolvedPiRequest;
  tools: PiToolDescriptor[];
}

export interface PiSessionPreview {
  kind: 'scaffold';
  reason: string;
  resolved: ResolvedPiRequest;
}
