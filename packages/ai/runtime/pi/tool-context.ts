import { ChatRepo, ResourcesRepo } from '../../../common/db';
import { pushCardToWindows } from '../../card-push';
import type { ResolvedPiRequest } from './contracts';

export interface PiSessionToolContext {
  chatRepo: typeof ChatRepo;
  conversationId?: string;
  pushCardToWindows: typeof pushCardToWindows;
  resolved: ResolvedPiRequest;
  resourcesRepo: typeof ResourcesRepo;
  targetWindowId?: number;
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
    conversationId: resolveConversationId(resolved),
    pushCardToWindows,
    resolved,
    resourcesRepo: ResourcesRepo,
    targetWindowId: resolveTargetWindowId(resolved)
  };
}
