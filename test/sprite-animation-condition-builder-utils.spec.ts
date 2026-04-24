import { describe, expect, it } from 'vitest';

import {
  appendSpriteAnimationConditionBuilderChild,
  buildSpriteAnimationConditionFromBuilderDraft,
  createSpriteAnimationConditionBuilderNode,
  getSpriteAnimationConditionBuilderDraft,
  removeSpriteAnimationConditionBuilderNodeAtPath,
  SPRITE_ANIMATION_CONDITION_PRESETS
} from '../src/pages/ExtensionSettings/components/sprite-animation-condition-builder-utils';

describe('sprite animation condition builder utils', () => {
  it('maps simple grouped conditions into builder draft', () => {
    expect(
      getSpriteAnimationConditionBuilderDraft({
        type: 'all',
        conditions: [
          { type: 'compare', field: 'favor', operator: 'gte', value: 80 },
          { type: 'compare', field: 'mood', operator: 'eq', value: 'joyful' }
        ]
      })
    ).toEqual({
      supported: true,
      draft: {
        match: 'all',
        children: [
          { type: 'compare', field: 'favor', operator: 'gte', value: '80' },
          { type: 'compare', field: 'mood', operator: 'eq', value: 'joyful' }
        ]
      }
    });
  });

  it('builds serialized conditions back from builder draft', () => {
    expect(
      buildSpriteAnimationConditionFromBuilderDraft({
        match: 'all',
        children: [
          { type: 'compare', field: 'favor', operator: 'gte', value: '80' },
          {
            type: 'group',
            match: 'any',
            children: [
              { type: 'compare', field: 'dimensions.focus', operator: 'gte', value: '50' },
              { type: 'compare', field: 'achievements', operator: 'includes', value: 'first-chat' }
            ]
          }
        ]
      })
    ).toEqual({
      type: 'all',
      conditions: [
        { type: 'compare', field: 'favor', operator: 'gte', value: 80 },
        {
          type: 'any',
          conditions: [
            { type: 'compare', field: 'dimensions.focus', operator: 'gte', value: 50 },
            { type: 'compare', field: 'achievements', operator: 'includes', value: 'first-chat' }
          ]
        }
      ]
    });
  });

  it('supports NOT and nested group rules in builder draft', () => {
    expect(
      getSpriteAnimationConditionBuilderDraft({
        type: 'all',
        conditions: [
          {
            type: 'not',
            condition: { type: 'compare', field: 'mood', operator: 'eq', value: 'sleepy' }
          },
          {
            type: 'any',
            conditions: [
              { type: 'compare', field: 'favor', operator: 'gte', value: 80 },
              { type: 'compare', field: 'level', operator: 'gte', value: 10 }
            ]
          }
        ]
      })
    ).toEqual({
      supported: true,
      draft: {
        match: 'all',
        children: [
          {
            type: 'not',
            child: { type: 'compare', field: 'mood', operator: 'eq', value: 'sleepy' }
          },
          {
            type: 'group',
            match: 'any',
            children: [
              { type: 'compare', field: 'favor', operator: 'gte', value: '80' },
              { type: 'compare', field: 'level', operator: 'gte', value: '10' }
            ]
          }
        ]
      }
    });
  });

  it('supports builder tree mutation helpers and keeps presets available', () => {
    const nextDraft = appendSpriteAnimationConditionBuilderChild(
      {
        match: 'all',
        children: [
          {
            type: 'group',
            match: 'all',
            children: [{ type: 'compare', field: 'favor', operator: 'gte', value: '80' }]
          }
        ]
      },
      [0],
      createSpriteAnimationConditionBuilderNode('group')
    );

    expect(removeSpriteAnimationConditionBuilderNodeAtPath(nextDraft, [0, 1])).toEqual({
      match: 'all',
      children: [
        {
          type: 'group',
          match: 'all',
          children: [
            {
              type: 'compare',
              field: 'favor',
              operator: 'gte',
              value: '80'
            }
          ]
        }
      ]
    });

    expect(SPRITE_ANIMATION_CONDITION_PRESETS.map((preset) => preset.id)).toEqual(['favor-high', 'favor-low', 'mood-joyful', 'bestie-joyful', 'level-10', 'not-sleepy', 'bestie-or-joyful']);
  });
});
