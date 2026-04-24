import { compileSpriteAnimationCondition, normalizeSpriteAnimationCondition, type SpriteAnimationCompareCondition, type SpriteAnimationCondition, type SpriteAnimationConditionOperator, type SpriteAnimationConditionScalar } from './animation-condition';
import {
  getCharacterDefinition,
  reloadCharacter,
  type CharacterConversationBonusMatcherDefinition,
  type CharacterDefinition,
  type CharacterFavorModifierDefinition,
  type CharacterMoodRuleDefinition,
  type CharacterXPSourceDefinition
} from './character-service';
import {
  registerConversationBonusMatcher,
  removePersonaRulesLayer,
  unregisterConversationBonusMatcher,
  upsertPersonaRulesLayer,
  type PersonaRulesLayer
} from './persona-rules';
import type { ConversationRewardContext } from './config/persona-rules';
import type { FavorModifier, MoodRule, XPSource } from './persona-state';

export interface CharacterPersonaRuntimeSyncResult {
  characterId: string | null;
  layerApplied: boolean;
  matcherIds: string[];
}

const ACTIVE_CHARACTER_PERSONA_LAYER_ID = 'character-runtime:active-character';
const activeCharacterConversationBonusMatcherIds = new Set<string>();

function normalizeCharacterXPSources(entries?: CharacterXPSourceDefinition[] | null): XPSource[] {
  return (entries ?? [])
    .map((entry) => {
      const id = entry.id.trim();
      const event = entry.event.trim();
      if (!id || !event || !Number.isFinite(entry.baseXP) || entry.baseXP <= 0) {
        return undefined;
      }

      return {
        id,
        event,
        baseXP: entry.baseXP,
        ...(entry.dailyLimit !== undefined && Number.isFinite(entry.dailyLimit) ? { dailyLimit: entry.dailyLimit } : {})
      } satisfies XPSource;
    })
    .filter((entry): entry is XPSource => !!entry);
}

function normalizeCharacterFavorModifiers(entries?: CharacterFavorModifierDefinition[] | null): FavorModifier[] {
  return (entries ?? [])
    .map((entry) => {
      const id = entry.id.trim();
      const event = entry.event.trim();
      if (!id || !event || !Number.isFinite(entry.delta)) {
        return undefined;
      }

      return {
        id,
        event,
        delta: entry.delta,
        ...(entry.dailyLimit !== undefined && Number.isFinite(entry.dailyLimit) ? { dailyLimit: entry.dailyLimit } : {}),
        ...(entry.cooldown !== undefined && Number.isFinite(entry.cooldown) ? { cooldown: entry.cooldown } : {})
      } satisfies FavorModifier;
    })
    .filter((entry): entry is FavorModifier => !!entry);
}

function normalizeCharacterMoodRules(entries?: CharacterMoodRuleDefinition[] | null): MoodRule[] {
  return (entries ?? [])
    .map((entry) => {
      const id = entry.id.trim();
      const compiledCondition = compileSpriteAnimationCondition(entry.when);
      if (!id || !compiledCondition || !Number.isFinite(entry.intensity) || !Number.isFinite(entry.priority)) {
        return undefined;
      }

      return {
        id,
        targetMood: entry.targetMood,
        intensity: entry.intensity,
        priority: entry.priority,
        trigger: (state) => compiledCondition(state)
      } satisfies MoodRule;
    })
    .filter((entry): entry is MoodRule => !!entry);
}

function getFieldValue(target: Record<string, unknown>, field: string): unknown {
  return field.split('.').reduce<unknown>((current, segment) => {
    if (current == null || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, target);
}

function compareNumeric(left: unknown, right: unknown, operator: Extract<SpriteAnimationConditionOperator, 'gt' | 'gte' | 'lt' | 'lte'>): boolean {
  if (typeof left !== 'number' || typeof right !== 'number') return false;

  switch (operator) {
    case 'gt':
      return left > right;
    case 'gte':
      return left >= right;
    case 'lt':
      return left < right;
    case 'lte':
      return left <= right;
  }
}

function matchesGenericLeafCondition(condition: SpriteAnimationCompareCondition, target: Record<string, unknown>): boolean {
  const actualValue = getFieldValue(target, condition.field);
  const expectedValue = condition.value;

  switch (condition.operator) {
    case 'eq':
      return actualValue === expectedValue;
    case 'neq':
      return actualValue !== expectedValue;
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
      return compareNumeric(actualValue, expectedValue, condition.operator);
    case 'includes':
      return Array.isArray(actualValue) ? actualValue.includes(expectedValue) : typeof actualValue === 'string' && typeof expectedValue === 'string' ? actualValue.includes(expectedValue) : false;
    case 'notIncludes':
      return Array.isArray(actualValue) ? !actualValue.includes(expectedValue) : typeof actualValue === 'string' && typeof expectedValue === 'string' ? !actualValue.includes(expectedValue) : true;
    case 'in':
      return Array.isArray(expectedValue) ? expectedValue.includes(actualValue as SpriteAnimationConditionScalar) : false;
    case 'notIn':
      return Array.isArray(expectedValue) ? !expectedValue.includes(actualValue as SpriteAnimationConditionScalar) : true;
  }
}

function matchesGenericCondition(condition: SpriteAnimationCondition, target: Record<string, unknown>): boolean {
  switch (condition.type) {
    case 'all':
      return condition.conditions.every((entry) => matchesGenericCondition(entry, target));
    case 'any':
      return condition.conditions.some((entry) => matchesGenericCondition(entry, target));
    case 'not':
      return !matchesGenericCondition(condition.condition, target);
    case 'compare':
      return matchesGenericLeafCondition(condition, target);
  }
}

function createConversationBonusMatcher(definition: CharacterConversationBonusMatcherDefinition): ((context: ConversationRewardContext) => boolean) | undefined {
  const normalizedCondition = normalizeSpriteAnimationCondition(definition.when);
  if (!normalizedCondition) {
    return undefined;
  }

  return (context: ConversationRewardContext) => matchesGenericCondition(normalizedCondition, context as Record<string, unknown>);
}

function clearCharacterConversationBonusMatchers(): void {
  for (const id of activeCharacterConversationBonusMatcherIds) {
    unregisterConversationBonusMatcher(id);
  }
  activeCharacterConversationBonusMatcherIds.clear();
}

function buildCharacterPersonaRulesLayer(character: CharacterDefinition | null | undefined): PersonaRulesLayer | null {
  const rules = character?.personaRules;
  if (!rules) {
    return null;
  }

  const layer: PersonaRulesLayer = {
    xpSources: normalizeCharacterXPSources(rules.xpSources),
    favorModifiers: normalizeCharacterFavorModifiers(rules.favorModifiers),
    moodRules: normalizeCharacterMoodRules(rules.moodRules)
  };

  if ((layer.xpSources?.length ?? 0) === 0) {
    delete layer.xpSources;
  }
  if ((layer.favorModifiers?.length ?? 0) === 0) {
    delete layer.favorModifiers;
  }
  if ((layer.moodRules?.length ?? 0) === 0) {
    delete layer.moodRules;
  }

  return Object.keys(layer).length > 0 ? layer : null;
}

export function syncCharacterPersonaRuntime(character = getCharacterDefinition()): CharacterPersonaRuntimeSyncResult {
  clearCharacterConversationBonusMatchers();
  removePersonaRulesLayer(ACTIVE_CHARACTER_PERSONA_LAYER_ID);

  if (!character) {
    return {
      characterId: null,
      layerApplied: false,
      matcherIds: []
    };
  }

  for (const [id, definition] of Object.entries(character.personaRules?.conversationBonusMatchers ?? {})) {
    const normalizedId = id.trim();
    const matcher = normalizedId ? createConversationBonusMatcher(definition) : undefined;
    if (!normalizedId || !matcher) continue;

    registerConversationBonusMatcher(normalizedId, matcher);
    activeCharacterConversationBonusMatcherIds.add(normalizedId);
  }

  const layer = buildCharacterPersonaRulesLayer(character);
  if (layer) {
    upsertPersonaRulesLayer(ACTIVE_CHARACTER_PERSONA_LAYER_ID, layer);
  }

  return {
    characterId: character.id,
    layerApplied: !!layer,
    matcherIds: Array.from(activeCharacterConversationBonusMatcherIds)
  };
}

export function reloadCharacterPersonaRuntime(): CharacterPersonaRuntimeSyncResult {
  const character = reloadCharacter();
  return syncCharacterPersonaRuntime(character);
}
