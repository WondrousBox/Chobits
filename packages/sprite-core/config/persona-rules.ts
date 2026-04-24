import type { ActivityReward, ActivityRewardId, ConversationBonusCondition, ConversationRewards, DimensionDef } from '../character-service';
import type { FavorModifier, MoodRule, PersonaState, XPSource } from '../persona-state';

export const DEFAULT_XP_SOURCES: XPSource[] = [
  { id: 'click', event: 'interact:click', baseXP: 2, dailyLimit: 50 },
  { id: 'drag', event: 'interact:drag:end', baseXP: 3, dailyLimit: 30 },
  { id: 'file-drop', event: 'interact:file-drop', baseXP: 10, dailyLimit: 20 },
  { id: 'conversation', event: 'ai:message-sent', baseXP: 15, dailyLimit: 100 },
  { id: 'daily-login', event: 'persona:daily-login', baseXP: 50 },
  { id: 'streak-bonus', event: 'persona:streak-bonus', baseXP: 25, multiplier: (state: PersonaState) => Math.min(state.loginStreak, 7) }
];

export const DEFAULT_FAVOR_MODIFIERS: FavorModifier[] = [
  { id: 'click', event: 'interact:click', delta: 0.5, dailyLimit: 10, cooldown: 5000 },
  { id: 'drag-play', event: 'interact:drag:end', delta: 0.3, dailyLimit: 10 },
  { id: 'file-share', event: 'interact:file-drop', delta: 1, dailyLimit: 5 },
  { id: 'conversation', event: 'ai:message-sent', delta: 1.5, dailyLimit: 20 },
  { id: 'daily-login', event: 'persona:daily-login', delta: 2 },
  { id: 'long-absence', event: 'persona:long-absence', delta: -5 },
  { id: 'ignored-reminder', event: 'reminder:dismissed', delta: -0.5, dailyLimit: 5 }
];

export const DEFAULT_MOOD_RULES: MoodRule[] = [
  {
    id: 'night-sleepy',
    trigger: () => {
      const hour = new Date().getHours();
      return hour >= 23 || hour < 5;
    },
    targetMood: 'sleepy',
    intensity: 70,
    priority: 5
  },
  {
    id: 'post-interaction-joy',
    trigger: (state) => state.favor >= 60,
    targetMood: 'joyful',
    intensity: 60,
    priority: 3
  },
  {
    id: 'low-favor-sad',
    trigger: (state) => state.favor < 20,
    targetMood: 'sad',
    intensity: 40,
    priority: 4
  },
  {
    id: 'idle-bored',
    trigger: () => false,
    targetMood: 'bored',
    intensity: 50,
    priority: 2
  }
];

export const DEFAULT_CONVERSATION_REWARDS: ConversationRewards = {
  xpPerConversation: 15,
  favorPerConversation: 1.5,
  cooldownMs: 60_000,
  bonusConditions: []
};

export const DEFAULT_ACTIVITY_REWARDS: Record<ActivityRewardId, ActivityReward> = {
  'workflow-complete': {
    xp: 12,
    favor: 0.4,
    dimensionGrowth: {
      'workflow-usage': 1.0,
      'task-completion': 0.6
    }
  },
  'resource-import-complete': {
    xp: 8,
    favor: 0.2,
    dimensionGrowth: {
      'task-completion': 0.5
    }
  },
  'download-complete': {
    xp: 8,
    favor: 0.2,
    dimensionGrowth: {
      'task-completion': 0.4
    }
  },
  'plugin-install': {
    xp: 10,
    favor: 0.3,
    dimensionGrowth: {
      'tool-usage': 0.8,
      'task-completion': 0.5
    }
  },
  'plugin-update': {
    xp: 6,
    favor: 0.2,
    dimensionGrowth: {
      'tool-usage': 0.6,
      'task-completion': 0.4
    }
  },
  'plugin-remove': {
    xp: 4,
    favor: 0,
    dimensionGrowth: {
      'tool-usage': 0.4
    }
  },
  'media-process-complete': {
    xp: 9,
    favor: 0.2,
    dimensionGrowth: {
      'task-completion': 0.5,
      'tool-usage': 0.3
    }
  },
  'memory-extraction-completed': {
    xp: 3,
    favor: 0.1,
    dimensionGrowth: {
      conversation: 0.3,
      'task-completion': 0.2
    }
  },
  'user-persona-update-completed': {
    xp: 5,
    favor: 0.3,
    dimensionGrowth: {
      conversation: 0.4,
      'task-completion': 0.3
    }
  },
  'trash-restore': {
    xp: 4,
    favor: 0.1,
    dimensionGrowth: {
      'task-completion': 0.2
    }
  }
};

export interface PersonaDimensionReward {
  id: string;
  delta: number;
  maxValue: number;
}

export interface PersonaRewardGrant {
  xp: number;
  favor: number;
  dimensions: PersonaDimensionReward[];
}

export interface ConversationRewardContext {
  assistantContentLength?: number;
  toolCallCount?: number;
}

export type ConversationBonusMatcher = (context: ConversationRewardContext, condition: ConversationBonusCondition) => boolean;

const DEFAULT_CONVERSATION_XP_SOURCE = DEFAULT_XP_SOURCES.find((source) => source.id === 'conversation') ?? {
  id: 'conversation',
  event: 'ai:message-sent',
  baseXP: DEFAULT_CONVERSATION_REWARDS.xpPerConversation
};

const DEFAULT_CONVERSATION_FAVOR_MODIFIER = DEFAULT_FAVOR_MODIFIERS.find((modifier) => modifier.id === 'conversation') ?? {
  id: 'conversation',
  event: 'ai:message-sent',
  delta: DEFAULT_CONVERSATION_REWARDS.favorPerConversation
};

const DEFAULT_REWARD_GRANT: PersonaRewardGrant = {
  xp: 0,
  favor: 0,
  dimensions: []
};

const DEFAULT_CONVERSATION_BONUS_MATCHERS: Record<string, ConversationBonusMatcher> = {
  'long-conversation': (context) => (context.assistantContentLength ?? 0) >= 500,
  'tool-usage': (context) => (context.toolCallCount ?? 0) > 0
};

const conversationBonusMatchers = new Map<string, ConversationBonusMatcher>(Object.entries(DEFAULT_CONVERSATION_BONUS_MATCHERS));

export function registerConversationBonusMatcher(id: string, matcher: ConversationBonusMatcher): void {
  const normalizedId = id.trim();
  if (!normalizedId) {
    throw new Error('[persona-rules] conversation bonus matcher id is required');
  }
  conversationBonusMatchers.set(normalizedId, matcher);
}

export function unregisterConversationBonusMatcher(id: string): void {
  conversationBonusMatchers.delete(id);
}

export function resetConversationBonusMatchers(): void {
  conversationBonusMatchers.clear();
  for (const [id, matcher] of Object.entries(DEFAULT_CONVERSATION_BONUS_MATCHERS)) {
    conversationBonusMatchers.set(id, matcher);
  }
}

function matchesConversationBonusCondition(condition: ConversationBonusCondition, context: ConversationRewardContext): boolean {
  const matcher = conversationBonusMatchers.get(condition.id);
  return matcher ? matcher(context, condition) : false;
}

export function resolveDimensionRewards(growthBySource: Record<string, number> | undefined, dimensionSchema: DimensionDef[]): PersonaDimensionReward[] {
  if (!growthBySource || dimensionSchema.length === 0) {
    return [];
  }

  const rewards: PersonaDimensionReward[] = [];

  for (const dimension of dimensionSchema) {
    let delta = 0;
    for (const [source, amount] of Object.entries(growthBySource)) {
      if (amount > 0 && dimension.growthSources.includes(source)) {
        delta += amount;
      }
    }

    if (delta > 0) {
      rewards.push({
        id: dimension.id,
        delta,
        maxValue: dimension.maxValue
      });
    }
  }

  return rewards;
}

export function mergeActivityRewards(overrides?: Partial<Record<ActivityRewardId, ActivityReward>>): Record<ActivityRewardId, ActivityReward> {
  const activityIds = Array.from(new Set<ActivityRewardId>([...(Object.keys(DEFAULT_ACTIVITY_REWARDS) as ActivityRewardId[]), ...((Object.keys(overrides ?? {}) as ActivityRewardId[]) ?? [])]));

  return activityIds.reduce(
    (acc, activityId) => {
      const base = DEFAULT_ACTIVITY_REWARDS[activityId];
      const override = overrides?.[activityId];
      if (!base && !override) {
        return acc;
      }

      const mergedDimensionGrowth = {
        ...(base?.dimensionGrowth ?? {}),
        ...(override?.dimensionGrowth ?? {})
      };

      acc[activityId] = {
        ...(base ?? { xp: 0, favor: 0 }),
        ...override,
        dimensionGrowth: Object.keys(mergedDimensionGrowth).length > 0 ? mergedDimensionGrowth : undefined
      };
      return acc;
    },
    {} as Record<ActivityRewardId, ActivityReward>
  );
}

export function resolveActivityReward(params: { activityId: ActivityRewardId; rewards?: Record<ActivityRewardId, ActivityReward>; dimensionSchema?: DimensionDef[] }): PersonaRewardGrant {
  const reward = params.rewards?.[params.activityId];
  if (!reward) {
    return { ...DEFAULT_REWARD_GRANT };
  }

  return {
    xp: reward.xp ?? 0,
    favor: reward.favor ?? 0,
    dimensions: resolveDimensionRewards(reward.dimensionGrowth, params.dimensionSchema ?? [])
  };
}

export function resolveConversationReward(params?: { rewards?: ConversationRewards | null; dimensionSchema?: DimensionDef[]; context?: ConversationRewardContext }): PersonaRewardGrant {
  const rewards = params?.rewards ?? DEFAULT_CONVERSATION_REWARDS;
  const context = params?.context ?? {};

  let bonusXP = 0;
  let bonusFavor = 0;

  for (const condition of rewards.bonusConditions ?? []) {
    if (!matchesConversationBonusCondition(condition, context)) {
      continue;
    }
    bonusXP += condition.xpBonus;
    bonusFavor += condition.favorBonus;
  }

  return {
    xp: (rewards.xpPerConversation ?? 0) + bonusXP,
    favor: (rewards.favorPerConversation ?? 0) + bonusFavor,
    dimensions: resolveDimensionRewards(
      {
        conversation: 1.0,
        'tool-usage': (context.toolCallCount ?? 0) > 0 ? 0.8 : 0,
        'task-completion': (context.assistantContentLength ?? 0) >= 500 ? 0.5 : 0
      },
      params?.dimensionSchema ?? []
    )
  };
}

export function resolveConversationEventRules(rewards?: ConversationRewards | null): {
  xpSource: XPSource;
  favorModifier: FavorModifier;
  cooldownMs: number;
} {
  const resolvedRewards = rewards ?? DEFAULT_CONVERSATION_REWARDS;

  return {
    xpSource: {
      ...DEFAULT_CONVERSATION_XP_SOURCE,
      baseXP: resolvedRewards.xpPerConversation ?? DEFAULT_CONVERSATION_REWARDS.xpPerConversation
    },
    favorModifier: {
      ...DEFAULT_CONVERSATION_FAVOR_MODIFIER,
      delta: resolvedRewards.favorPerConversation ?? DEFAULT_CONVERSATION_REWARDS.favorPerConversation
    },
    cooldownMs: resolvedRewards.cooldownMs ?? DEFAULT_CONVERSATION_REWARDS.cooldownMs
  };
}

export function resolveConversationRewardBonus(params?: { rewards?: ConversationRewards | null; dimensionSchema?: DimensionDef[]; context?: ConversationRewardContext }): PersonaRewardGrant {
  const totalReward = resolveConversationReward(params);
  const baseRules = resolveConversationEventRules(params?.rewards);
  const favorBonus = totalReward.favor - baseRules.favorModifier.delta;

  return {
    xp: Math.max(0, totalReward.xp - baseRules.xpSource.baseXP),
    favor: Math.round(favorBonus * 1000) / 1000,
    dimensions: totalReward.dimensions
  };
}
