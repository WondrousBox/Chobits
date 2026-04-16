import type { ChatMessage, ChatRequest, ProviderPresetRecord } from '../../types';
import type { ExplicitSkillInvocation, RequestedSkillInvocation } from './skills/types';

export type PiRuntimeId = 'legacy' | 'pi';

export type PiExecutionMode = 'session' | 'one-shot';

export type PiProfileId = 'chat' | 'assistant' | 'coder' | (string & {});

export type PiToolCategory = 'query' | 'content' | 'background-task' | 'ui-side-effect' | 'integration' | 'file' | 'shell' | 'meta';

export type PiToolStatus = 'legacy-only' | 'scaffolded' | 'ready-for-pi-runtime';

/** Tool injection mode: 'all' = inject all tools upfront, 'dynamic' = toolbox-based on-demand activation */
export type PiToolInjectionMode = 'all' | 'dynamic';

export interface PiAgentProfile {
  id: PiProfileId;
  label: string;
  description?: string;
  instructions?: string;
  executionMode: PiExecutionMode;
  supportsToolCalls: boolean;
  defaultToolIds: string[];
  /** Tool injection mode (default: 'dynamic' for assistant, 'all' for others) */
  toolInjectionMode: PiToolInjectionMode;
}

/** Pi profile 完整描述（含系统提示），由 `profiles.md` 解析或代码组装 */
export interface PiProfileDescriptor {
  id: string;
  label: string;
  description?: string;
  instructions: string;
  defaultToolIds: string[];
  executionMode: PiExecutionMode;
  supportsToolCalls: boolean;
  toolInjectionMode: PiToolInjectionMode;
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

export interface PiCodingWorkspaceContext {
  rootPath: string;
  label?: string;
  mode: 'safe';
  source: 'manual';
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
  coding?: PiCodingWorkspaceContext;
  requestedSkillInvocation?: RequestedSkillInvocation;
  explicitSkillInvocation?: ExplicitSkillInvocation;
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
