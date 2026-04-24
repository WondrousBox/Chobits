import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { initCharacterService } from '../packages/sprite-core/character-service';
import { getPersonaRulesSnapshot, getResolvedActivityPersonaReward, getResolvedConversationPersonaRewardBonus, resetPersonaRulesRuntime } from '../packages/sprite-core/persona-rules';
import { reloadCharacterPersonaRuntime, syncCharacterPersonaRuntime } from '../packages/sprite-core/character-runtime';

function writeCharacterFile(rootDir: string, payload: unknown): void {
  writeFileSync(path.join(rootDir, 'character.json'), JSON.stringify(payload, null, 2), 'utf-8');
}

function createCharacterPayload(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    version: 1,
    id: 'character-a',
    name: 'Character A',
    nameAliases: ['A'],
    identity: {
      tagline: 'tagline',
      background: 'background',
      coreTraits: ['warm'],
      boundaries: ['kind']
    },
    speechStyle: {
      tone: 'gentle',
      language: 'zh-CN',
      firstPerson: '我',
      addressUser: '你',
      examples: [],
      quirks: []
    },
    favorPersona: {
      friend: {
        range: [40, 59],
        style: 'friendly',
        systemPromptOverlay: 'friendly'
      }
    },
    moodExpressions: {
      neutral: {
        animation: 'idle',
        messageStyle: 'neutral'
      },
      joyful: {
        animation: 'celebrate',
        messageStyle: 'joyful'
      }
    },
    dimensions: {
      schema: [
        {
          id: 'conversation',
          name: 'Conversation',
          icon: 'chat',
          description: 'conversation',
          maxValue: 100,
          initialValue: 0,
          growthSources: ['conversation']
        },
        {
          id: 'tooling',
          name: 'Tooling',
          icon: 'wrench',
          description: 'tooling',
          maxValue: 80,
          initialValue: 0,
          growthSources: ['tool-usage', 'task-completion']
        }
      ],
      extensible: true
    },
    conversationRewards: {
      xpPerConversation: 10,
      favorPerConversation: 0.6,
      cooldownMs: 45_000,
      bonusConditions: [
        {
          id: 'character-deep-tooling',
          description: 'tool calls >= 2',
          xpBonus: 4,
          favorBonus: 0.2
        }
      ]
    },
    activityRewards: {
      'quest-bonus': {
        xp: 14,
        favor: 0.7,
        dimensionGrowth: {
          conversation: 0.4,
          'tool-usage': 0.5
        }
      }
    },
    meta: {
      author: 'test',
      version: '1.0.0',
      license: 'MIT',
      description: 'test character',
      tags: ['test'],
      createdAt: '2026-04-22',
      updatedAt: '2026-04-22'
    },
    ...overrides
  };
}

describe('character runtime persona bridge', () => {
  let tempDir: string | null = null;

  afterEach(() => {
    resetPersonaRulesRuntime();
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it('hydrates persona layers and custom bonus matchers from character.json', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'character-runtime-test-'));
    writeCharacterFile(
      tempDir,
      createCharacterPayload({
        personaRules: {
          xpSources: [
            {
              id: 'character-session',
              event: 'character:session',
              baseXP: 9
            }
          ],
          favorModifiers: [
            {
              id: 'character-bond',
              event: 'character:session',
              delta: 0.5
            }
          ],
          moodRules: [
            {
              id: 'character-joy',
              when: {
                type: 'compare',
                field: 'favor',
                operator: 'gte',
                value: 60
              },
              targetMood: 'joyful',
              intensity: 88,
              priority: 10
            }
          ],
          conversationBonusMatchers: {
            'character-deep-tooling': {
              when: {
                type: 'all',
                conditions: [
                  { type: 'compare', field: 'toolCallCount', operator: 'gte', value: 2 },
                  { type: 'compare', field: 'assistantContentLength', operator: 'gte', value: 200 }
                ]
              }
            }
          }
        }
      })
    );

    initCharacterService(tempDir);
    const result = syncCharacterPersonaRuntime();

    expect(result).toEqual({
      characterId: 'character-a',
      layerApplied: true,
      matcherIds: ['character-deep-tooling']
    });

    const snapshot = getPersonaRulesSnapshot();
    expect(snapshot.xpSources).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'character-session', baseXP: 9 })]));
    expect(snapshot.favorModifiers).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'character-bond', delta: 0.5 })]));
    expect(snapshot.moodRules.map((rule) => rule.id)).toContain('character-joy');

    expect(getResolvedConversationPersonaRewardBonus({ toolCallCount: 3, assistantContentLength: 320 })).toEqual({
      xp: 4,
      favor: 0.2,
      dimensions: [
        { id: 'conversation', delta: 1, maxValue: 100 },
        { id: 'tooling', delta: 0.8, maxValue: 80 }
      ]
    });

    expect(getResolvedActivityPersonaReward('quest-bonus')).toEqual({
      xp: 14,
      favor: 0.7,
      dimensions: [
        { id: 'conversation', delta: 0.4, maxValue: 100 },
        { id: 'tooling', delta: 0.5, maxValue: 80 }
      ]
    });
  });

  it('reload clears stale character matchers and layers before applying the new character', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'character-runtime-test-'));
    writeCharacterFile(
      tempDir,
      createCharacterPayload({
        personaRules: {
          xpSources: [
            {
              id: 'character-session',
              event: 'character:session',
              baseXP: 9
            }
          ],
          conversationBonusMatchers: {
            'character-deep-tooling': {
              when: {
                type: 'compare',
                field: 'toolCallCount',
                operator: 'gte',
                value: 2
              }
            }
          }
        }
      })
    );

    initCharacterService(tempDir);
    syncCharacterPersonaRuntime();

    writeCharacterFile(
      tempDir,
      createCharacterPayload({
        id: 'character-b',
        conversationRewards: {
          xpPerConversation: 6,
          favorPerConversation: 0.2,
          cooldownMs: 10_000,
          bonusConditions: []
        },
        activityRewards: {},
        personaRules: undefined
      })
    );

    const result = reloadCharacterPersonaRuntime();
    expect(result).toEqual({
      characterId: 'character-b',
      layerApplied: false,
      matcherIds: []
    });

    const snapshot = getPersonaRulesSnapshot();
    expect(snapshot.xpSources.find((entry) => entry.id === 'character-session')).toBeUndefined();
    expect(getResolvedConversationPersonaRewardBonus({ toolCallCount: 3 })).toEqual({
      xp: 0,
      favor: 0,
      dimensions: [
        { id: 'conversation', delta: 1, maxValue: 100 },
        { id: 'tooling', delta: 0.8, maxValue: 80 }
      ]
    });
    expect(getResolvedActivityPersonaReward('quest-bonus')).toEqual({
      xp: 0,
      favor: 0,
      dimensions: []
    });
  });
});
