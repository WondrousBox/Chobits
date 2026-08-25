import { afterEach, describe, expect, it } from 'vitest';

import type { DimensionDef } from '../../packages/sprite-core/character-service';
import { mergeActivityRewards, resolveActivityReward, resolveConversationEventRules, resolveConversationReward, resolveConversationRewardBonus } from '../../packages/sprite-core/config/persona-rules';
import {
  getConversationRewardEventRules as getRuntimeConversationRewardEventRules,
  getPersonaRuleDimensionSchema,
  getPersonaRulesSnapshot,
  getResolvedActivityPersonaReward as getRuntimeResolvedActivityPersonaReward,
  getResolvedConversationPersonaRewardBonus as getRuntimeResolvedConversationPersonaRewardBonus,
  registerConversationBonusMatcher,
  resetPersonaRulesRuntime,
  setPersonaRulesProvider,
  upsertPersonaRulesLayer
} from '../../packages/sprite-core/persona-rules';

const dimensionSchema: DimensionDef[] = [
  {
    id: 'conversation',
    name: 'Conversation',
    icon: 'chat',
    description: 'conversation',
    maxValue: 100,
    initialValue: 0,
    growthSources: ['conversation'],
    custom: false
  },
  {
    id: 'tooling',
    name: 'Tooling',
    icon: 'wrench',
    description: 'tooling',
    maxValue: 80,
    initialValue: 0,
    growthSources: ['tool-usage', 'task-completion'],
    custom: false
  }
];

describe('persona rules', () => {
  afterEach(() => {
    resetPersonaRulesRuntime();
  });

  it('resolves conversation reward with configured bonus conditions and dimension growth', () => {
    const reward = resolveConversationReward({
      rewards: {
        xpPerConversation: 15,
        favorPerConversation: 1.5,
        cooldownMs: 60_000,
        bonusConditions: [
          { id: 'long-conversation', description: 'long', xpBonus: 5, favorBonus: 0.2 },
          { id: 'tool-usage', description: 'tool', xpBonus: 3, favorBonus: 0.1 }
        ]
      },
      dimensionSchema,
      context: {
        assistantContentLength: 640,
        toolCallCount: 2
      }
    });

    expect(reward).toEqual({
      xp: 23,
      favor: 1.8,
      dimensions: [
        { id: 'conversation', delta: 1, maxValue: 100 },
        { id: 'tooling', delta: 1.3, maxValue: 80 }
      ]
    });
  });

  it('splits conversation event rules from bonus-only reward payload', () => {
    const rewards = {
      xpPerConversation: 15,
      favorPerConversation: 1.5,
      cooldownMs: 45_000,
      bonusConditions: [
        { id: 'long-conversation', description: 'long', xpBonus: 5, favorBonus: 0.2 },
        { id: 'tool-usage', description: 'tool', xpBonus: 3, favorBonus: 0.1 }
      ]
    };

    expect(resolveConversationEventRules(rewards)).toEqual({
      xpSource: {
        id: 'conversation',
        event: 'ai:message-sent',
        baseXP: 15,
        dailyLimit: 100
      },
      favorModifier: {
        id: 'conversation',
        event: 'ai:message-sent',
        delta: 1.5,
        dailyLimit: 20
      },
      cooldownMs: 45_000
    });

    expect(
      resolveConversationRewardBonus({
        rewards,
        dimensionSchema,
        context: {
          assistantContentLength: 640,
          toolCallCount: 2
        }
      })
    ).toEqual({
      xp: 8,
      favor: 0.3,
      dimensions: [
        { id: 'conversation', delta: 1, maxValue: 100 },
        { id: 'tooling', delta: 1.3, maxValue: 80 }
      ]
    });
  });

  it('merges activity reward overrides before resolving persona reward output', () => {
    const rewards = mergeActivityRewards({
      'workflow-complete': {
        xp: 20,
        favor: 0.8,
        dimensionGrowth: {
          conversation: 0.4
        }
      }
    });

    const reward = resolveActivityReward({
      activityId: 'workflow-complete',
      rewards,
      dimensionSchema
    });

    expect(reward).toEqual({
      xp: 20,
      favor: 0.8,
      dimensions: [
        { id: 'conversation', delta: 0.4, maxValue: 100 },
        { id: 'tooling', delta: 0.6, maxValue: 80 }
      ]
    });
  });

  it('reads runtime rewards and dimensions through the injectable provider boundary', () => {
    setPersonaRulesProvider({
      getSnapshot: () => ({
        conversationRewards: {
          xpPerConversation: 9,
          favorPerConversation: 0.4,
          cooldownMs: 12_000,
          bonusConditions: [{ id: 'tool-usage', description: 'tool', xpBonus: 2, favorBonus: 0.1 }]
        },
        activityRewards: {
          'workflow-complete': {
            xp: 30,
            favor: 1.2,
            dimensionGrowth: {
              conversation: 0.5,
              'tool-usage': 0.7
            }
          }
        },
        dimensionSchema
      })
    });

    expect(getRuntimeConversationRewardEventRules()).toEqual({
      xpSource: {
        id: 'conversation',
        event: 'ai:message-sent',
        baseXP: 9,
        dailyLimit: 100
      },
      favorModifier: {
        id: 'conversation',
        event: 'ai:message-sent',
        delta: 0.4,
        dailyLimit: 20
      },
      cooldownMs: 12_000
    });

    expect(getRuntimeResolvedConversationPersonaRewardBonus({ toolCallCount: 1 })).toEqual({
      xp: 2,
      favor: 0.1,
      dimensions: [
        { id: 'conversation', delta: 1, maxValue: 100 },
        { id: 'tooling', delta: 0.8, maxValue: 80 }
      ]
    });

    expect(getRuntimeResolvedActivityPersonaReward('workflow-complete')).toEqual({
      xp: 30,
      favor: 1.2,
      dimensions: [
        { id: 'conversation', delta: 0.5, maxValue: 100 },
        { id: 'tooling', delta: 0.7, maxValue: 80 }
      ]
    });

    expect(getPersonaRuleDimensionSchema()).toEqual(dimensionSchema);
  });

  it('layers runtime registry entries on top of the provider snapshot', () => {
    setPersonaRulesProvider({
      getSnapshot: () => ({
        conversationRewards: {
          xpPerConversation: 9,
          favorPerConversation: 0.4,
          cooldownMs: 12_000,
          bonusConditions: []
        },
        xpSources: [
          {
            id: 'extension-session',
            event: 'extension:session',
            baseXP: 4
          }
        ],
        moodRules: [
          {
            id: 'provider-curious',
            trigger: () => false,
            targetMood: 'curious',
            intensity: 40,
            priority: 4
          }
        ],
        dimensionSchema
      })
    });

    registerConversationBonusMatcher('power-user', (context) => (context.toolCallCount ?? 0) >= 3);
    upsertPersonaRulesLayer('extension:power-user', {
      conversationRewards: {
        cooldownMs: 5_000,
        bonusConditions: [{ id: 'power-user', description: 'power user', xpBonus: 4, favorBonus: 0.2 }]
      },
      activityRewards: {
        'extension:quest-complete': {
          xp: 18,
          favor: 0.5,
          dimensionGrowth: {
            conversation: 0.2,
            'tool-usage': 0.4
          }
        }
      },
      xpSources: [
        {
          id: 'extension-task',
          event: 'extension:task',
          baseXP: 11
        }
      ],
      moodRules: [
        {
          id: 'layer-joy',
          trigger: () => true,
          targetMood: 'joyful',
          intensity: 88,
          priority: 20
        }
      ]
    });

    const snapshot = getPersonaRulesSnapshot();
    expect(snapshot.conversationRewards.cooldownMs).toBe(5_000);
    expect(snapshot.xpSources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'conversation', baseXP: 9 }),
        expect.objectContaining({ id: 'extension-session', baseXP: 4 }),
        expect.objectContaining({ id: 'extension-task', baseXP: 11 })
      ])
    );
    expect(snapshot.favorModifiers).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'conversation', delta: 0.4 })]));
    expect(snapshot.moodRules.map((rule) => rule.id)).toEqual(expect.arrayContaining(['provider-curious', 'layer-joy']));

    expect(getRuntimeResolvedConversationPersonaRewardBonus({ toolCallCount: 3 })).toEqual({
      xp: 4,
      favor: 0.2,
      dimensions: [
        { id: 'conversation', delta: 1, maxValue: 100 },
        { id: 'tooling', delta: 0.8, maxValue: 80 }
      ]
    });

    expect(getRuntimeResolvedActivityPersonaReward('extension:quest-complete')).toEqual({
      xp: 18,
      favor: 0.5,
      dimensions: [
        { id: 'conversation', delta: 0.2, maxValue: 100 },
        { id: 'tooling', delta: 0.4, maxValue: 80 }
      ]
    });
  });
});
