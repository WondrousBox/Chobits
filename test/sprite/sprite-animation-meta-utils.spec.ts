import { describe, expect, it } from 'vitest';

import {
  createSpriteAnimationMetaDraft,
  formatSpriteAnimationConditionInput,
  formatSpriteTriggerAliasesInput,
  normalizeSpriteAnimationPriorityInput,
  parseSpriteAnimationConditionInput,
  parseSpriteTriggerAliasesInput
} from '../../src/pages/ExtensionSettings/components/sprite-animation-meta-utils';

describe('sprite animation meta utils', () => {
  it('parses aliases from comma and newline separated input while excluding primary trigger', () => {
    expect(parseSpriteTriggerAliasesInput('workflow:complete,\npersona:daily-login, celebrate', 'celebrate')).toEqual(['workflow:complete', 'persona:daily-login']);
  });

  it('formats aliases for editor hydration', () => {
    expect(formatSpriteTriggerAliasesInput(['workflow:complete', 'persona:daily-login'])).toBe('workflow:complete, persona:daily-login');
  });

  it('creates normalized metadata draft for editor output', () => {
    expect(
      createSpriteAnimationMetaDraft({
        conditionInput: '{"type":"compare","field":"favor","operator":"gte","value":80}',
        primaryTrigger: 'celebrate',
        triggerAliasesInput: 'workflow:complete, workflow:complete, celebrate',
        priority: '7'
      })
    ).toEqual({
      condition: {
        type: 'compare',
        field: 'favor',
        operator: 'gte',
        value: 80
      },
      primaryTrigger: 'celebrate',
      triggerAliases: ['workflow:complete'],
      priority: 7
    });
    expect(normalizeSpriteAnimationPriorityInput('')).toBeUndefined();
  });

  it('formats and parses condition JSON for editor hydration', () => {
    const input = formatSpriteAnimationConditionInput({
      type: 'all',
      conditions: [
        { type: 'compare', field: 'favor', operator: 'gte', value: 80 },
        { type: 'compare', field: 'mood', operator: 'eq', value: 'joyful' }
      ]
    });

    expect(parseSpriteAnimationConditionInput(input)).toEqual({
      condition: {
        type: 'all',
        conditions: [
          { type: 'compare', field: 'favor', operator: 'gte', value: 80 },
          { type: 'compare', field: 'mood', operator: 'eq', value: 'joyful' }
        ]
      }
    });
    expect(parseSpriteAnimationConditionInput('{')).toEqual({
      error: expect.stringContaining('JSON 解析失败')
    });
  });
});
