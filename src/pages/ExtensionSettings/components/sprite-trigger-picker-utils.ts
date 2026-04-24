import type { SpriteAnimationTrigger, SpriteBuiltinAnimationTrigger } from '../../../../packages/sprite-core/types';
import { isBuiltinSpriteAnimationTrigger, SpriteEventGroups } from '../../../../packages/sprite-core/types';

export interface SpriteTriggerPresentation {
  detail?: string;
  kind: 'builtin' | 'custom' | 'empty';
  label: string;
  value: SpriteAnimationTrigger | '';
}

export interface SpriteTriggerGroupOption {
  group: string;
  items: readonly SpriteBuiltinAnimationTrigger[];
}

export const SPRITE_TRIGGER_GROUP_OPTIONS = (Object.entries(SpriteEventGroups) as Array<[string, readonly SpriteBuiltinAnimationTrigger[]]>).map(([group, items]) => ({
  group,
  items
}));

export function normalizeSpriteTriggerInput(value?: string | null): SpriteAnimationTrigger | '' {
  const normalized = value?.trim() ?? '';
  return normalized ? (normalized as SpriteAnimationTrigger) : '';
}

export function getSpriteTriggerGroup(trigger: SpriteBuiltinAnimationTrigger): string | undefined {
  return SPRITE_TRIGGER_GROUP_OPTIONS.find((option) => option.items.includes(trigger))?.group;
}

export function getSpriteTriggerPresentation(value?: string | null, emptyLabel = '未分类'): SpriteTriggerPresentation {
  const normalized = normalizeSpriteTriggerInput(value);
  if (!normalized) {
    return {
      kind: 'empty',
      label: emptyLabel,
      value: ''
    };
  }

  if (isBuiltinSpriteAnimationTrigger(normalized)) {
    return {
      kind: 'builtin',
      label: normalized,
      detail: getSpriteTriggerGroup(normalized),
      value: normalized
    };
  }

  return {
    kind: 'custom',
    label: normalized,
    detail: '自定义',
    value: normalized
  };
}
