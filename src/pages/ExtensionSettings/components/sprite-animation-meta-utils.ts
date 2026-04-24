import { normalizeSpriteAnimationCondition, type SpriteAnimationCondition, type SpriteAnimationMeta, type SpriteAnimationTrigger } from '../../../../packages/sprite-core/types';
import { normalizeSpriteTriggerInput } from './sprite-trigger-picker-utils';

export function formatSpriteTriggerAliasesInput(aliases?: readonly string[] | null): string {
  return aliases?.join(', ') ?? '';
}

export function parseSpriteTriggerAliasesInput(value?: string | null, primaryTrigger?: string | null): SpriteAnimationTrigger[] {
  const normalizedPrimary = normalizeSpriteTriggerInput(primaryTrigger);
  const entries = value
    ?.split(/[\n,，]/g)
    .map((entry) => normalizeSpriteTriggerInput(entry))
    .filter((entry): entry is SpriteAnimationTrigger => !!entry && entry !== normalizedPrimary);

  return entries ? Array.from(new Set(entries)) : [];
}

export function normalizeSpriteAnimationPriorityInput(value?: string | number | null): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  const normalized = value?.trim() ?? '';
  if (!normalized) return undefined;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function formatSpriteAnimationConditionInput(condition?: SpriteAnimationCondition | null): string {
  return condition ? JSON.stringify(condition, null, 2) : '';
}

export function parseSpriteAnimationConditionInput(value?: string | null): { condition?: SpriteAnimationCondition; error?: string } {
  const normalized = value?.trim() ?? '';
  if (!normalized) return {};

  try {
    const parsed = JSON.parse(normalized);
    const condition = normalizeSpriteAnimationCondition(parsed);
    if (!condition) {
      return { error: '条件规则格式无效，请检查 type / field / operator / value。' };
    }

    return { condition };
  } catch (error) {
    return { error: error instanceof Error ? `条件规则 JSON 解析失败：${error.message}` : '条件规则 JSON 解析失败。' };
  }
}

export function createSpriteAnimationMetaDraft(input: {
  conditionInput?: string | null;
  primaryTrigger?: string | null;
  priority?: string | number | null;
  triggerAliasesInput?: string | null;
}): Pick<SpriteAnimationMeta, 'condition' | 'primaryTrigger' | 'triggerAliases' | 'priority'> {
  const primaryTrigger = normalizeSpriteTriggerInput(input.primaryTrigger);
  const triggerAliases = parseSpriteTriggerAliasesInput(input.triggerAliasesInput, primaryTrigger);
  const condition = parseSpriteAnimationConditionInput(input.conditionInput).condition;

  return {
    condition,
    primaryTrigger: primaryTrigger || undefined,
    triggerAliases: triggerAliases.length > 0 ? triggerAliases : undefined,
    priority: normalizeSpriteAnimationPriorityInput(input.priority)
  };
}
