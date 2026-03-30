import { ChatRepo, ResourcesRepo } from '../../../common/db';
import { pushCardToWindows } from '../../card-push';
import type { UserChoiceRequest, UserChoiceResponse } from '../../types';
import type { PiCodingWorkspaceContext, ResolvedPiRequest } from './contracts';

export interface PiSessionToolContext {
  chatRepo: typeof ChatRepo;
  coding?: PiCodingWorkspaceContext;
  conversationId?: string;
  pushCardToWindows: typeof pushCardToWindows;
  reportProgress?: (callId: string, progress: number, message?: string) => void;
  resolved: ResolvedPiRequest;
  resourcesRepo: typeof ResourcesRepo;
  targetWindowId?: number;
  /** Emit a user choice request to the stream (set by session-service) */
  emitUserChoiceRequest?: (request: UserChoiceRequest) => void;
  /** Wait for user's choice response (set by session-service, resolves when user responds) */
  waitForUserChoiceResponse?: (choiceId: string) => Promise<UserChoiceResponse>;
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
    pushCardToWindows,
    resolved,
    resourcesRepo: ResourcesRepo,
    targetWindowId: resolveTargetWindowId(resolved)
  };
}
