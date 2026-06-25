import { formatConversationRouteSnapshotForPrompt } from '../../../../packages/ai/services/conversation-route-service';
import { registerSystemPromptEnricher } from '../../../../packages/ai/system-prompt-enricher';
import type { ChatRequest } from '../../../../packages/ai/types';
import { ConversationRouteSnapshotRepo } from '../../db/conversation-route-repositories';

const TAG = '[ConversationRouteEnricher]';

const INTERNAL_AGENT_IDS = new Set(['conversation-route', 'memory-extraction', 'memory-auto-recall', 'memory-recall-cue-backfill', 'title-generation', 'user-persona-check', 'user-persona-update']);

function shouldSkip(request: ChatRequest): string | null {
  if (request.persist === false) return 'not_persisted';
  if (!request.conversationId) return 'no_conversation_id';
  if (request.agentId && INTERNAL_AGENT_IDS.has(request.agentId)) return 'internal_agent';
  return null;
}

export function initConversationRouteEnricher(): void {
  registerSystemPromptEnricher({
    id: 'conversation-route',
    resolve: async ({ request }) => {
      const skipReason = shouldSkip(request);
      if (skipReason) {
        return null;
      }

      try {
        const snapshot = await ConversationRouteSnapshotRepo.get(request.conversationId!);
        if (!snapshot) return null;
        const segment = formatConversationRouteSnapshotForPrompt(snapshot);
        if (!segment.trim()) return null;
        console.log(`${TAG} injecting snapshot for ${request.conversationId}: ${segment.length} chars`);
        return segment;
      } catch (error) {
        console.warn(`${TAG} failed:`, error instanceof Error ? error.message : error);
        return null;
      }
    }
  });

  console.log(`${TAG} registered`);
}
