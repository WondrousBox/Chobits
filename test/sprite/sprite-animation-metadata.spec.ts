import { describe, expect, it } from 'vitest';

import {
  compileSpriteAnimationCondition,
  getPrimarySpriteAnimationTrigger,
  getSpriteAnimationTriggerAliases,
  getSpriteAnimationTriggers,
  isBuiltinSpriteAnimationTrigger,
  matchesSpriteAnimationCondition,
  normalizeSpriteAnimationCondition,
  normalizeSpriteAnimationMeta,
  normalizeSpriteAnimationMetaPatch,
  SpriteEventGroups
} from '../../packages/sprite-core/types';

describe('sprite animation metadata helpers', () => {
  it('declares talk as a built-in action trigger', () => {
    expect(SpriteEventGroups.action).toContain('talk');
    expect(isBuiltinSpriteAnimationTrigger('talk')).toBe(true);
  });

  it('upgrades legacy eventType to primaryTrigger without persisting a mirror field', () => {
    const meta = normalizeSpriteAnimationMeta({
      id: 'idle-default',
      title: 'Idle',
      eventType: 'idle'
    });

    expect(meta.primaryTrigger).toBe('idle');
    expect(meta).not.toHaveProperty('eventType');
    expect(getSpriteAnimationTriggers(meta)).toEqual(['idle']);
  });

  it('treats mismatched legacy eventType as an alias during normalization', () => {
    const meta = normalizeSpriteAnimationMeta({
      id: 'celebrate-complete',
      title: 'Celebrate',
      eventType: 'workflow:complete',
      primaryTrigger: 'celebrate',
      triggerAliases: ['workflow:done', 'workflow:complete']
    });

    expect(getPrimarySpriteAnimationTrigger(meta)).toBe('celebrate');
    expect(getSpriteAnimationTriggerAliases(meta)).toEqual(['workflow:done', 'workflow:complete']);
    expect(getSpriteAnimationTriggers(meta)).toEqual(['celebrate', 'workflow:done', 'workflow:complete']);
    expect(meta).not.toHaveProperty('eventType');
  });

  it('keeps eventType-only meta patches compatible while dropping the mirror field', () => {
    expect(
      normalizeSpriteAnimationMetaPatch({
        eventType: 'success'
      })
    ).toEqual({
      primaryTrigger: 'success'
    });
  });

  it('folds mismatched legacy eventType patch input into trigger aliases', () => {
    expect(
      normalizeSpriteAnimationMetaPatch({
        primaryTrigger: 'celebrate',
        eventType: 'workflow:complete',
        triggerAliases: ['workflow:done']
      })
    ).toEqual({
      primaryTrigger: 'celebrate',
      triggerAliases: ['workflow:done', 'workflow:complete']
    });
  });

  it('normalizes serialized character conditions and compiles them for runtime matching', () => {
    const meta = normalizeSpriteAnimationMeta({
      id: 'celebrate-bestie',
      title: 'Celebrate Bestie',
      primaryTrigger: 'celebrate',
      condition: {
        type: 'all',
        conditions: [
          { type: 'compare', field: 'favor', operator: 'gte', value: 80 },
          { type: 'compare', field: 'mood', operator: 'eq', value: 'joyful' }
        ]
      }
    });

    expect(meta.condition).toEqual({
      type: 'all',
      conditions: [
        { type: 'compare', field: 'favor', operator: 'gte', value: 80 },
        { type: 'compare', field: 'mood', operator: 'eq', value: 'joyful' }
      ]
    });

    const condition = compileSpriteAnimationCondition(meta.condition);
    expect(condition?.({ favor: 85, mood: 'joyful' } as any)).toBe(true);
    expect(matchesSpriteAnimationCondition(meta.condition, { favor: 85, mood: 'neutral' } as any)).toBe(false);
  });

  it('drops invalid serialized conditions during normalization', () => {
    expect(
      normalizeSpriteAnimationCondition({
        type: 'compare',
        field: 'favor',
        operator: 'gte',
        value: ['80']
      })
    ).toBeUndefined();
  });
});
