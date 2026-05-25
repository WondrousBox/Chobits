import { CHAT_API_CONFIGURED_GUIDE_GOAL, ensureGuideGoal, resetGuideGoalStateForTest, type GuideGoalEnsureResult } from '@/lib/guide-goals';

export type ChatApiConfigGuideTrigger = 'assistant-double-click' | 'assistant-menu-chat' | 'assistant-window-open' | 'chat-window-open' | 'chat-window-focus' | 'chat-send' | 'sidebar-open' | 'sidebar-send';

export interface ChatApiConfigGuideOptions {
  providerId?: string;
  preferredPresetId?: string;
  trigger: ChatApiConfigGuideTrigger;
  force?: boolean;
}

export interface ChatApiConfigGuideResult {
  guided: boolean;
  configured: boolean;
  blocked: boolean;
  providerId?: string;
  presetId?: string;
  reason?: GuideGoalEnsureResult['reason'];
}

export async function guideChatApiConfigIfNeeded(options: ChatApiConfigGuideOptions): Promise<ChatApiConfigGuideResult> {
  const result = await ensureGuideGoal({
    goal: CHAT_API_CONFIGURED_GUIDE_GOAL,
    trigger: options.trigger,
    providerId: options.providerId,
    preferredPresetId: options.preferredPresetId,
    forceGuide: options.force
  });

  return {
    guided: result.guided,
    configured: result.achieved,
    blocked: result.blocked,
    ...(result.providerId ? { providerId: result.providerId } : {}),
    ...(result.presetId ? { presetId: result.presetId } : {}),
    reason: result.reason
  };
}

export async function ensureChatApiConfigGoal(options: ChatApiConfigGuideOptions): Promise<ChatApiConfigGuideResult> {
  return guideChatApiConfigIfNeeded({ ...options, force: options.force ?? true });
}

export function resetChatApiConfigGuideStateForTest(): void {
  resetGuideGoalStateForTest();
}
