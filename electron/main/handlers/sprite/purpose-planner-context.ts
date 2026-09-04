import { ChatRepo } from '@packages/common/db/repositories';

import { getPreset } from '../../../../packages/ai/preset-service';
import type { AgentLoopCompletePayload } from '../../../../packages/ai/services/agent-loop-types';
import { eventManager } from '../../../../packages/event';
import { AppEvent } from '../../../../packages/event/events';
import type { SpritePurposePlannerRuntimeContext } from './purpose-planner-runtime';

const CONVERSATION_CONTEXT_LIMIT = 20;

type ActivePlannerContextHint = {
  conversationId?: string;
  providerId?: string;
  providerPresetId?: string;
  updatedAt: number;
};

export class SpritePurposePlannerRuntimeContextTracker {
  private activeHint?: ActivePlannerContextHint;

  constructor() {
    eventManager.on(AppEvent.AGENT_LOOP_COMPLETE, (payload: AgentLoopCompletePayload) => {
      if (!payload?.conversationId) return;
      this.activeHint = {
        conversationId: payload.conversationId,
        providerId: payload.providerId,
        providerPresetId: payload.providerPresetId,
        updatedAt: Date.now()
      };
    });

    eventManager.on(AppEvent.SPRITE_AI_COMPLETED, (payload: { conversationId?: string }) => {
      if (!payload?.conversationId) return;
      this.activeHint = {
        conversationId: payload.conversationId,
        providerId: this.activeHint?.providerId,
        providerPresetId: this.activeHint?.providerPresetId,
        updatedAt: Date.now()
      };
    });
  }

  async resolve(): Promise<SpritePurposePlannerRuntimeContext | null> {
    const conversations = await ChatRepo.listConversations({}, CONVERSATION_CONTEXT_LIMIT, 0);
    const hintedConversation = this.activeHint?.conversationId ? conversations.find((item) => item.id === this.activeHint?.conversationId) : undefined;
    const chosenConversation = hintedConversation || conversations.find((item) => !!item.providerId || !!item.providerPresetId);
    const effectiveHint = hintedConversation ? this.activeHint : undefined;

    const providerPresetId = effectiveHint?.providerPresetId ?? chosenConversation?.providerPresetId ?? undefined;
    const providerId = effectiveHint?.providerId || chosenConversation?.providerId || (providerPresetId ? getPreset(providerPresetId)?.providerId : undefined);
    if (!providerId) {
      return null;
    }

    return {
      providerId,
      ...(providerPresetId ? { providerPresetId } : {})
    };
  }
}
