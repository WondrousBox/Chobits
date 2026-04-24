import type { SpriteAnimationCompareCondition, SpriteAnimationCondition, SpriteAnimationConditionOperator } from '@packages/sprite-core/types';

type SpriteAnimationConditionBuilderOperator = Extract<SpriteAnimationConditionOperator, 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'includes' | 'notIncludes'>;
type SpriteAnimationConditionBuilderFieldKind = 'enum' | 'number' | 'string';

export interface SpriteAnimationConditionBuilderFieldOption {
  field: string;
  key: string;
  kind: SpriteAnimationConditionBuilderFieldKind;
  label: string;
  operators: SpriteAnimationConditionBuilderOperator[];
  placeholder?: string;
  valueOptions?: Array<{ label: string; value: string }>;
}

export interface SpriteAnimationConditionBuilderCompareNode {
  type: 'compare';
  field: string;
  operator: SpriteAnimationConditionBuilderOperator;
  value: string;
}

export interface SpriteAnimationConditionBuilderGroupNode {
  type: 'group';
  match: 'all' | 'any';
  children: SpriteAnimationConditionBuilderNode[];
}

export interface SpriteAnimationConditionBuilderNotNode {
  type: 'not';
  child: SpriteAnimationConditionBuilderNode;
}

export type SpriteAnimationConditionBuilderNode = SpriteAnimationConditionBuilderCompareNode | SpriteAnimationConditionBuilderGroupNode | SpriteAnimationConditionBuilderNotNode;

export interface SpriteAnimationConditionBuilderDraft {
  match: 'all' | 'any';
  children: SpriteAnimationConditionBuilderNode[];
}

export interface SpriteAnimationConditionPreset {
  condition: SpriteAnimationCondition;
  description: string;
  id: string;
  label: string;
}

const FAVOR_LEVEL_OPTIONS = [
  { label: '陌生人', value: 'stranger' },
  { label: '认识', value: 'acquaintance' },
  { label: '朋友', value: 'friend' },
  { label: '好友', value: 'close-friend' },
  { label: '挚友', value: 'bestie' },
  { label: '灵魂伴侣', value: 'soulmate' }
];

const MOOD_OPTIONS: Array<{ label: string; value: string }> = [
  { label: '开心 joyful', value: 'joyful' },
  { label: '满足 content', value: 'content' },
  { label: '平静 neutral', value: 'neutral' },
  { label: '无聊 bored', value: 'bored' },
  { label: '难过 sad', value: 'sad' },
  { label: '困倦 sleepy', value: 'sleepy' },
  { label: '兴奋 excited', value: 'excited' },
  { label: '好奇 curious', value: 'curious' },
  { label: '烦躁 annoyed', value: 'annoyed' }
];

export const SPRITE_ANIMATION_CONDITION_FIELD_OPTIONS: SpriteAnimationConditionBuilderFieldOption[] = [
  {
    key: 'favor',
    field: 'favor',
    kind: 'number',
    label: '好感度 favor',
    operators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
    placeholder: '例如 80'
  },
  {
    key: 'level',
    field: 'level',
    kind: 'number',
    label: '等级 level',
    operators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
    placeholder: '例如 10'
  },
  {
    key: 'loginStreak',
    field: 'loginStreak',
    kind: 'number',
    label: '连续登录 loginStreak',
    operators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte'],
    placeholder: '例如 7'
  },
  {
    key: 'mood',
    field: 'mood',
    kind: 'enum',
    label: '心情 mood',
    operators: ['eq', 'neq'],
    valueOptions: MOOD_OPTIONS
  },
  {
    key: 'favorLevel',
    field: 'favorLevel',
    kind: 'enum',
    label: '好感阶段 favorLevel',
    operators: ['eq', 'neq'],
    valueOptions: FAVOR_LEVEL_OPTIONS
  },
  {
    key: 'achievements',
    field: 'achievements',
    kind: 'string',
    label: '成就 achievements',
    operators: ['includes', 'notIncludes'],
    placeholder: '例如 first-chat'
  },
  {
    key: 'custom',
    field: '',
    kind: 'string',
    label: '自定义 persona 路径',
    operators: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'includes', 'notIncludes'],
    placeholder: '例如 dimensions.focus'
  }
];

export const SPRITE_ANIMATION_CONDITION_PRESETS: SpriteAnimationConditionPreset[] = [
  {
    id: 'favor-high',
    label: '高好感',
    description: 'favor >= 80',
    condition: { type: 'compare', field: 'favor', operator: 'gte', value: 80 }
  },
  {
    id: 'favor-low',
    label: '低好感',
    description: 'favor < 20',
    condition: { type: 'compare', field: 'favor', operator: 'lt', value: 20 }
  },
  {
    id: 'mood-joyful',
    label: '开心时',
    description: 'mood == joyful',
    condition: { type: 'compare', field: 'mood', operator: 'eq', value: 'joyful' }
  },
  {
    id: 'bestie-joyful',
    label: '挚友且开心',
    description: 'favor >= 80 && mood == joyful',
    condition: {
      type: 'all',
      conditions: [
        { type: 'compare', field: 'favor', operator: 'gte', value: 80 },
        { type: 'compare', field: 'mood', operator: 'eq', value: 'joyful' }
      ]
    }
  },
  {
    id: 'level-10',
    label: '10级解锁',
    description: 'level >= 10',
    condition: { type: 'compare', field: 'level', operator: 'gte', value: 10 }
  },
  {
    id: 'not-sleepy',
    label: '非困倦时',
    description: 'NOT mood == sleepy',
    condition: {
      type: 'not',
      condition: { type: 'compare', field: 'mood', operator: 'eq', value: 'sleepy' }
    }
  },
  {
    id: 'bestie-or-joyful',
    label: '挚友或开心',
    description: 'favor >= 80 || mood == joyful',
    condition: {
      type: 'any',
      conditions: [
        { type: 'compare', field: 'favor', operator: 'gte', value: 80 },
        { type: 'compare', field: 'mood', operator: 'eq', value: 'joyful' }
      ]
    }
  }
];

function isBuilderOperator(value: SpriteAnimationConditionOperator): value is SpriteAnimationConditionBuilderOperator {
  return ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'includes', 'notIncludes'].includes(value);
}

function createDefaultRuleValue(field: string): string {
  const option = getSpriteAnimationConditionFieldOption(field);
  return option.kind === 'enum' ? (option.valueOptions?.[0]?.value ?? '') : option.placeholder === '例如 first-chat' ? 'first-chat' : option.kind === 'number' ? '80' : '';
}

export function createEmptySpriteAnimationConditionBuilderCompareNode(): SpriteAnimationConditionBuilderCompareNode {
  return {
    type: 'compare',
    field: 'favor',
    operator: 'gte',
    value: '80'
  };
}

export function createEmptySpriteAnimationConditionBuilderGroupNode(match: 'all' | 'any' = 'all'): SpriteAnimationConditionBuilderGroupNode {
  return {
    type: 'group',
    match,
    children: [createEmptySpriteAnimationConditionBuilderCompareNode()]
  };
}

export function createEmptySpriteAnimationConditionBuilderNotNode(): SpriteAnimationConditionBuilderNotNode {
  return {
    type: 'not',
    child: createEmptySpriteAnimationConditionBuilderCompareNode()
  };
}

export function createSpriteAnimationConditionBuilderNode(type: SpriteAnimationConditionBuilderNode['type']): SpriteAnimationConditionBuilderNode {
  switch (type) {
    case 'compare':
      return createEmptySpriteAnimationConditionBuilderCompareNode();
    case 'group':
      return createEmptySpriteAnimationConditionBuilderGroupNode();
    case 'not':
      return createEmptySpriteAnimationConditionBuilderNotNode();
  }
}

export function createEmptySpriteAnimationConditionBuilderDraft(): SpriteAnimationConditionBuilderDraft {
  return {
    match: 'all',
    children: [createEmptySpriteAnimationConditionBuilderCompareNode()]
  };
}

export function getSpriteAnimationConditionFieldOption(field?: string | null): SpriteAnimationConditionBuilderFieldOption {
  const normalizedField = field?.trim() ?? '';
  return SPRITE_ANIMATION_CONDITION_FIELD_OPTIONS.find((option) => option.field === normalizedField && option.key !== 'custom') ?? SPRITE_ANIMATION_CONDITION_FIELD_OPTIONS.at(-1)!;
}

export function getSpriteAnimationConditionOperatorOptions(field?: string | null): SpriteAnimationConditionBuilderOperator[] {
  return getSpriteAnimationConditionFieldOption(field).operators;
}

function serializeConditionValue(value: SpriteAnimationCompareCondition['value']): string {
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function toBuilderNode(condition: SpriteAnimationCondition): SpriteAnimationConditionBuilderNode | undefined {
  switch (condition.type) {
    case 'compare':
      if (!isBuilderOperator(condition.operator) || Array.isArray(condition.value)) return undefined;
      return {
        type: 'compare',
        field: condition.field,
        operator: condition.operator,
        value: serializeConditionValue(condition.value)
      };
    case 'all':
    case 'any': {
      const children = condition.conditions.map((entry) => toBuilderNode(entry)).filter((entry): entry is SpriteAnimationConditionBuilderNode => !!entry);
      if (children.length !== condition.conditions.length || children.length === 0) return undefined;
      return {
        type: 'group',
        match: condition.type,
        children
      };
    }
    case 'not': {
      const child = toBuilderNode(condition.condition);
      return child
        ? {
            type: 'not',
            child
          }
        : undefined;
    }
  }
}

export function getSpriteAnimationConditionBuilderDraft(condition?: SpriteAnimationCondition | null): { draft: SpriteAnimationConditionBuilderDraft; supported: boolean } {
  if (!condition) {
    return {
      draft: createEmptySpriteAnimationConditionBuilderDraft(),
      supported: true
    };
  }

  const rootNode = toBuilderNode(condition);
  if (!rootNode) {
    return {
      draft: createEmptySpriteAnimationConditionBuilderDraft(),
      supported: false
    };
  }

  if (rootNode.type === 'group') {
    return {
      draft: {
        match: rootNode.match,
        children: rootNode.children.length > 0 ? rootNode.children : [createEmptySpriteAnimationConditionBuilderCompareNode()]
      },
      supported: true
    };
  }

  return {
    draft: {
      match: 'all',
      children: [rootNode]
    },
    supported: true
  };
}

function normalizeBuilderCompareValue(node: SpriteAnimationConditionBuilderCompareNode): string | number | undefined {
  const normalizedValue = node.value.trim();
  if (!normalizedValue) return undefined;

  const option = getSpriteAnimationConditionFieldOption(node.field);
  if (option.kind === 'number') {
    const parsed = Number(normalizedValue);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  if (option.key === 'custom' && ['gt', 'gte', 'lt', 'lte'].includes(node.operator)) {
    const parsed = Number(normalizedValue);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return normalizedValue;
}

function buildSpriteAnimationConditionFromBuilderNode(node: SpriteAnimationConditionBuilderNode): SpriteAnimationCondition | undefined {
  switch (node.type) {
    case 'compare': {
      const field = node.field.trim();
      const value = normalizeBuilderCompareValue(node);
      if (!field || value === undefined) return undefined;

      return {
        type: 'compare',
        field,
        operator: node.operator,
        value
      };
    }
    case 'group': {
      const conditions = node.children.map((child) => buildSpriteAnimationConditionFromBuilderNode(child)).filter((entry): entry is SpriteAnimationCondition => !!entry);

      if (conditions.length === 0) return undefined;
      return {
        type: node.match,
        conditions
      };
    }
    case 'not': {
      const child = buildSpriteAnimationConditionFromBuilderNode(node.child);
      return child
        ? {
            type: 'not',
            condition: child
          }
        : undefined;
    }
  }
}

export function buildSpriteAnimationConditionFromBuilderDraft(draft: SpriteAnimationConditionBuilderDraft): SpriteAnimationCondition | undefined {
  const conditions = draft.children.map((child) => buildSpriteAnimationConditionFromBuilderNode(child)).filter((entry): entry is SpriteAnimationCondition => !!entry);

  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];

  return {
    type: draft.match,
    conditions
  };
}

function updateNodeAtPath(
  node: SpriteAnimationConditionBuilderNode,
  path: number[],
  updater: (node: SpriteAnimationConditionBuilderNode) => SpriteAnimationConditionBuilderNode
): SpriteAnimationConditionBuilderNode {
  if (path.length === 0) return updater(node);

  const [index, ...rest] = path;
  if (node.type === 'group') {
    return {
      ...node,
      children: node.children.map((child, childIndex) => (childIndex === index ? updateNodeAtPath(child, rest, updater) : child))
    };
  }

  if (node.type === 'not' && index === 0) {
    return {
      ...node,
      child: updateNodeAtPath(node.child, rest, updater)
    };
  }

  return node;
}

export function updateSpriteAnimationConditionBuilderNodeAtPath(
  draft: SpriteAnimationConditionBuilderDraft,
  path: number[],
  updater: (node: SpriteAnimationConditionBuilderNode) => SpriteAnimationConditionBuilderNode
): SpriteAnimationConditionBuilderDraft {
  if (path.length === 0) return draft;

  const [index, ...rest] = path;
  return {
    ...draft,
    children: draft.children.map((child, childIndex) => (childIndex === index ? updateNodeAtPath(child, rest, updater) : child))
  };
}

export function appendSpriteAnimationConditionBuilderChild(
  draft: SpriteAnimationConditionBuilderDraft,
  path: number[] | null,
  child: SpriteAnimationConditionBuilderNode
): SpriteAnimationConditionBuilderDraft {
  if (!path || path.length === 0) {
    return {
      ...draft,
      children: [...draft.children, child]
    };
  }

  return updateSpriteAnimationConditionBuilderNodeAtPath(draft, path, (node) => {
    if (node.type !== 'group') return node;
    return {
      ...node,
      children: [...node.children, child]
    };
  });
}

function removeChildFromArray(children: SpriteAnimationConditionBuilderNode[], index: number): SpriteAnimationConditionBuilderNode[] {
  const nextChildren = children.filter((_, childIndex) => childIndex !== index);
  return nextChildren.length > 0 ? nextChildren : [createEmptySpriteAnimationConditionBuilderCompareNode()];
}

function removeNodeAtPath(node: SpriteAnimationConditionBuilderNode, path: number[]): SpriteAnimationConditionBuilderNode {
  if (path.length === 0) return createEmptySpriteAnimationConditionBuilderCompareNode();

  const [index, ...rest] = path;
  if (node.type === 'group') {
    if (rest.length === 0) {
      return {
        ...node,
        children: removeChildFromArray(node.children, index)
      };
    }

    return {
      ...node,
      children: node.children.map((child, childIndex) => (childIndex === index ? removeNodeAtPath(child, rest) : child))
    };
  }

  if (node.type === 'not' && index === 0) {
    if (rest.length === 0) {
      return {
        ...node,
        child: createEmptySpriteAnimationConditionBuilderCompareNode()
      };
    }

    return {
      ...node,
      child: removeNodeAtPath(node.child, rest)
    };
  }

  return node;
}

export function removeSpriteAnimationConditionBuilderNodeAtPath(draft: SpriteAnimationConditionBuilderDraft, path: number[]): SpriteAnimationConditionBuilderDraft {
  if (path.length === 0) return draft;

  const [index, ...rest] = path;
  if (rest.length === 0) {
    return {
      ...draft,
      children: removeChildFromArray(draft.children, index)
    };
  }

  return {
    ...draft,
    children: draft.children.map((child, childIndex) => (childIndex === index ? removeNodeAtPath(child, rest) : child))
  };
}

export function replaceSpriteAnimationConditionBuilderNodeAtPath(
  draft: SpriteAnimationConditionBuilderDraft,
  path: number[],
  type: SpriteAnimationConditionBuilderNode['type']
): SpriteAnimationConditionBuilderDraft {
  return updateSpriteAnimationConditionBuilderNodeAtPath(draft, path, () => createSpriteAnimationConditionBuilderNode(type));
}

export function createSpriteAnimationConditionBuilderCompareValueForField(field: string): string {
  return createDefaultRuleValue(field);
}
