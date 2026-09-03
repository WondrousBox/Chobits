export type SpriteRoutineGuideGoalKind = 'ai.chat-provider-configured' | 'achievement.unlocked' | (string & {});

interface BaseSpriteRoutineGuideGoalDefinition<TKind extends SpriteRoutineGuideGoalKind> {
  /** Stable goal id used by guide evaluators and tests. */
  id: string;
  /** Declarative evaluator key. Runtime layers bind this kind to an environment-specific predicate. */
  kind: TKind;
  /** Human readable intent for diagnostics, planner summaries, and docs. */
  description: string;
  /** True when the original user action should wait until this goal is achieved. */
  blocking?: boolean;
}

/** Goal: a chat-capable AI provider preset has usable secrets configured. */
export interface ChatApiConfiguredGuideGoalDefinition extends BaseSpriteRoutineGuideGoalDefinition<'ai.chat-provider-configured'> {}

/** Goal: a durable character achievement has already been unlocked. */
export interface AchievementUnlockedGuideGoalDefinition extends BaseSpriteRoutineGuideGoalDefinition<'achievement.unlocked'> {
  /** Character achievement id used as the persistent completion marker. */
  achievementId: string;
}

/** Extension point for future guide goals whose evaluator lives outside sprite-core. */
export interface CustomSpriteRoutineGuideGoalDefinition extends BaseSpriteRoutineGuideGoalDefinition<string & {}> {
  [key: string]: unknown;
}

export type SpriteRoutineGuideGoalDefinition = ChatApiConfiguredGuideGoalDefinition | AchievementUnlockedGuideGoalDefinition | CustomSpriteRoutineGuideGoalDefinition;

export const CHAT_API_CONFIGURED_GUIDE_GOAL: SpriteRoutineGuideGoalDefinition = {
  id: 'ai.chat-provider-configured',
  kind: 'ai.chat-provider-configured',
  description: '至少有一个可用于聊天的 AI 服务商预设已经配置 API Key；发送时会收窄到当前服务商和预设。',
  blocking: true
};

export function createAchievementUnlockedGuideGoal(input: { achievementId: string; id?: string; description?: string; blocking?: boolean }): AchievementUnlockedGuideGoalDefinition {
  const achievementId = input.achievementId.trim();
  return {
    id: input.id ?? `achievement.${achievementId}`,
    kind: 'achievement.unlocked',
    achievementId,
    description: input.description ?? `成就 ${achievementId} 已解锁。`,
    ...(input.blocking !== undefined ? { blocking: input.blocking } : {})
  };
}

export const FIRST_CHAT_GUIDE_GOAL = createAchievementUnlockedGuideGoal({
  achievementId: 'first-chat',
  description: '首次完成一次 AI 聊天回复的成就已解锁。'
});
