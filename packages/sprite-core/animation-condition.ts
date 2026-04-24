import type { PersonaState } from './persona-state';

export type SpriteAnimationConditionScalar = string | number | boolean;
export type SpriteAnimationConditionValue = SpriteAnimationConditionScalar | SpriteAnimationConditionScalar[];
export type SpriteAnimationConditionOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'includes' | 'notIncludes' | 'in' | 'notIn';

export interface SpriteAnimationCompareCondition {
  type: 'compare';
  field: string;
  operator: SpriteAnimationConditionOperator;
  value: SpriteAnimationConditionValue;
}

export interface SpriteAnimationConditionGroup {
  type: 'all' | 'any';
  conditions: SpriteAnimationCondition[];
}

export interface SpriteAnimationNotCondition {
  type: 'not';
  condition: SpriteAnimationCondition;
}

export type SpriteAnimationCondition = SpriteAnimationCompareCondition | SpriteAnimationConditionGroup | SpriteAnimationNotCondition;

const CONDITION_OPERATORS = new Set<SpriteAnimationConditionOperator>(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'includes', 'notIncludes', 'in', 'notIn']);

function isConditionScalar(value: unknown): value is SpriteAnimationConditionScalar {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function normalizeConditionScalar(value: unknown): SpriteAnimationConditionScalar | undefined {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized ? normalized : undefined;
  }

  return isConditionScalar(value) ? value : undefined;
}

function normalizeConditionValue(value: unknown, operator: SpriteAnimationConditionOperator): SpriteAnimationConditionValue | undefined {
  if (operator === 'in' || operator === 'notIn') {
    const entries = (Array.isArray(value) ? value : [value]).map((entry) => normalizeConditionScalar(entry)).filter((entry): entry is SpriteAnimationConditionScalar => entry !== undefined);
    return entries.length > 0 ? Array.from(new Set(entries)) : undefined;
  }

  if (Array.isArray(value)) return undefined;
  return normalizeConditionScalar(value);
}

export function normalizeSpriteAnimationCondition(condition: unknown): SpriteAnimationCondition | undefined {
  if (!condition || typeof condition !== 'object') return undefined;

  const candidate = condition as Partial<SpriteAnimationCondition>;
  switch (candidate.type) {
    case 'all':
    case 'any': {
      const conditions = (Array.isArray(candidate.conditions) ? candidate.conditions : [])
        .map((entry) => normalizeSpriteAnimationCondition(entry))
        .filter((entry): entry is SpriteAnimationCondition => !!entry);

      return conditions.length > 0 ? { type: candidate.type, conditions } : undefined;
    }
    case 'not': {
      const normalizedCondition = normalizeSpriteAnimationCondition(candidate.condition);
      return normalizedCondition ? { type: 'not', condition: normalizedCondition } : undefined;
    }
    case 'compare': {
      const field = typeof candidate.field === 'string' ? candidate.field.trim() : '';
      const operator = candidate.operator;
      if (!field || !operator || !CONDITION_OPERATORS.has(operator)) return undefined;

      const value = normalizeConditionValue(candidate.value, operator);
      if (value === undefined) return undefined;

      return {
        type: 'compare',
        field,
        operator,
        value
      };
    }
    default:
      return undefined;
  }
}

function getPersonaConditionFieldValue(personaState: PersonaState, field: string): unknown {
  return field.split('.').reduce<unknown>((current, segment) => {
    if (current == null || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, personaState as unknown);
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

function compareLeafCondition(condition: SpriteAnimationCompareCondition, personaState: PersonaState): boolean {
  const actualValue = getPersonaConditionFieldValue(personaState, condition.field);
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

export function matchesSpriteAnimationCondition(condition: SpriteAnimationCondition | null | undefined, personaState: PersonaState): boolean {
  if (!condition) return true;

  switch (condition.type) {
    case 'all':
      return condition.conditions.every((entry) => matchesSpriteAnimationCondition(entry, personaState));
    case 'any':
      return condition.conditions.some((entry) => matchesSpriteAnimationCondition(entry, personaState));
    case 'not':
      return !matchesSpriteAnimationCondition(condition.condition, personaState);
    case 'compare':
      return compareLeafCondition(condition, personaState);
  }
}

export function compileSpriteAnimationCondition(condition: SpriteAnimationCondition | null | undefined): ((personaState: PersonaState) => boolean) | undefined {
  const normalizedCondition = normalizeSpriteAnimationCondition(condition);
  if (!normalizedCondition) return undefined;

  return (personaState: PersonaState) => matchesSpriteAnimationCondition(normalizedCondition, personaState);
}
