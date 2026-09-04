import { ChatRepo } from '../../../common/db';
import type { UserChoiceRequest, UserChoiceResponse } from '../../types';
import type { PiCodingWorkspaceContext, ResolvedPiRequest } from './contracts';
import type { SkillExecutionResult, SkillRegistry, SkillSessionState } from './skills';

type PiAgentThinkingLevel = import('@earendil-works/pi-agent-core').ThinkingLevel;

export interface PiForkedSkillToolCall {
  args?: unknown;
  callId: string;
  result?: unknown;
  toolName: string;
}

export interface PiForkedSkillResult {
  activeToolNames: string[];
  content: string;
  model?: string;
  thinkingLevel: PiAgentThinkingLevel;
  toolCalls: PiForkedSkillToolCall[];
}

export interface PiForkedSkillRunOptions {
  toolCallId?: string;
}

export interface PiSessionToolContext {
  chatRepo: typeof ChatRepo;
  coding?: PiCodingWorkspaceContext;
  conversationId?: string;
  reportProgress?: (callId: string, progress: number, message?: string) => void;
  resolved: ResolvedPiRequest;
  targetWindowId?: number;
  emitToolCall?: (name: string, args: unknown, callId: string) => void;
  emitToolResult?: (callId: string, result: unknown) => void;
  /** Emit a user choice request to the stream (set by session-service) */
  emitUserChoiceRequest?: (request: UserChoiceRequest) => void;
  /** Wait for user's choice response (set by session-service, resolves when user responds) */
  waitForUserChoiceResponse?: (choiceId: string) => Promise<UserChoiceResponse>;
  /** Cancel a pending user choice request (set by session-service) */
  cancelUserChoiceRequest?: (choiceId: string) => void;
  /** Session handle for dynamic tool activation (set after session creation) */
  session?: {
    getActiveToolNames: () => string[];
    setActiveToolsByName: (names: string[]) => void;
    getAllTools: () => Array<{ name: string; description: string }>;
  };
  runForkedSkill?: (execution: SkillExecutionResult, options?: PiForkedSkillRunOptions) => Promise<PiForkedSkillResult>;
  skillRegistry?: SkillRegistry;
  skillSessionState?: SkillSessionState;
}

function resolveConversationId(resolved: ResolvedPiRequest): string | undefined {
  const conversationId = resolved.request.conversationId?.trim();
  return conversationId ? conversationId : undefined;
}

function resolveTargetWindowId(resolved: ResolvedPiRequest): number | undefined {
  const rawTargetWindowId = resolved.request.extras?.piTargetWindowId;

  if (typeof rawTargetWindowId !== 'number' || !Number.isInteger(rawTargetWindowId)) {
    return undefined;
  }

  return rawTargetWindowId;
}

export function createPiSessionToolContext(resolved: ResolvedPiRequest): PiSessionToolContext {
  return {
    chatRepo: ChatRepo,
    coding: resolved.coding,
    conversationId: resolveConversationId(resolved),
    resolved,
    targetWindowId: resolveTargetWindowId(resolved)
  };
}
