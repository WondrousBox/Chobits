/**
 * CharacterService — 角色人格配置服务
 *
 * 从 character.json 加载角色人格定义，提供：
 * - 角色身份、性格、说话风格等配置
 * - 基于当前好感度的人格渐变层
 * - 对话奖励配置
 * - 维度定义
 *
 * Phase 2+ 将扩展：动态系统提示词生成、角色包管理等。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// ━━ Type Definitions ━━

export interface CharacterIdentity {
  tagline: string;
  background: string;
  coreTraits: string[];
  boundaries: string[];
}

export interface SpeechExample {
  situation: string;
  response: string;
}

export interface CharacterSpeechStyle {
  tone: string;
  language: string;
  firstPerson: string;
  addressUser: string;
  examples: SpeechExample[];
  quirks: string[];
}

export interface FavorPersonaEntry {
  range: [number, number];
  style: string;
  systemPromptOverlay: string;
}

export interface MoodExpression {
  animation: string;
  messageStyle: string;
}

export interface DimensionDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  maxValue: number;
  initialValue: number;
  growthSources: string[];
  custom?: boolean;
}

export interface ConversationBonusCondition {
  id: string;
  description: string;
  xpBonus: number;
  favorBonus: number;
}

export interface ConversationRewards {
  xpPerConversation: number;
  favorPerConversation: number;
  cooldownMs: number;
  bonusConditions: ConversationBonusCondition[];
}

export type ActivityRewardId =
  | 'workflow-complete'
  | 'resource-import-complete'
  | 'download-complete'
  | 'plugin-install'
  | 'plugin-update'
  | 'plugin-remove'
  | 'media-process-complete'
  | 'memory-extraction-completed'
  | 'user-persona-update-completed'
  | 'trash-restore';

export interface ActivityReward {
  xp: number;
  favor: number;
  dimensionGrowth?: Record<string, number>;
}

export interface ToolLabelTemplate {
  calling: string;
  done: string;
}

export interface ConditionalToolLabel {
  when: Record<string, string>;
  calling: string;
  done: string;
}

export interface ToolLabelDefinition {
  default: ToolLabelTemplate;
  conditions?: ConditionalToolLabel[];
}

export interface CharacterMeta {
  author: string;
  version: string;
  license: string;
  description: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CharacterDefinition {
  version: number;
  id: string;
  name: string;
  nameAliases: string[];
  identity: CharacterIdentity;
  speechStyle: CharacterSpeechStyle;
  favorPersona: Record<string, FavorPersonaEntry>;
  moodExpressions: Record<string, MoodExpression>;
  dimensions: {
    schema: DimensionDef[];
    extensible: boolean;
  };
  conversationRewards: ConversationRewards;
  activityRewards?: Partial<Record<ActivityRewardId, ActivityReward>>;
  /** Per-tool display label overrides with placeholder support */
  toolLabels?: Record<string, ToolLabelDefinition>;
  meta: CharacterMeta;
}

// ━━ Service ━━

let cachedCharacter: CharacterDefinition | null = null;
let characterFilePath: string | null = null;

const DEFAULT_ACTIVITY_REWARDS: Record<ActivityRewardId, ActivityReward> = {
  'workflow-complete': {
    xp: 12,
    favor: 0.4,
    dimensionGrowth: {
      'workflow-usage': 1.0,
      'task-completion': 0.6
    }
  },
  'resource-import-complete': {
    xp: 8,
    favor: 0.2,
    dimensionGrowth: {
      'task-completion': 0.5
    }
  },
  'download-complete': {
    xp: 8,
    favor: 0.2,
    dimensionGrowth: {
      'task-completion': 0.4
    }
  },
  'plugin-install': {
    xp: 10,
    favor: 0.3,
    dimensionGrowth: {
      'tool-usage': 0.8,
      'task-completion': 0.5
    }
  },
  'plugin-update': {
    xp: 6,
    favor: 0.2,
    dimensionGrowth: {
      'tool-usage': 0.6,
      'task-completion': 0.4
    }
  },
  'plugin-remove': {
    xp: 4,
    favor: 0,
    dimensionGrowth: {
      'tool-usage': 0.4
    }
  },
  'media-process-complete': {
    xp: 9,
    favor: 0.2,
    dimensionGrowth: {
      'task-completion': 0.5,
      'tool-usage': 0.3
    }
  },
  'memory-extraction-completed': {
    xp: 3,
    favor: 0.1,
    dimensionGrowth: {
      conversation: 0.3,
      'task-completion': 0.2
    }
  },
  'user-persona-update-completed': {
    xp: 5,
    favor: 0.3,
    dimensionGrowth: {
      conversation: 0.4,
      'task-completion': 0.3
    }
  },
  'trash-restore': {
    xp: 4,
    favor: 0.1,
    dimensionGrowth: {
      'task-completion': 0.2
    }
  }
};

/**
 * Initialize the character service with the sprites directory path.
 * Call this once during app bootstrap (after sprite assets are initialized).
 */
export function initCharacterService(spritesDir: string): void {
  characterFilePath = path.join(spritesDir, 'character.json');
  cachedCharacter = null; // force reload on next access
}

/**
 * Load and return the current character definition.
 * Returns null if character.json doesn't exist or is invalid.
 */
export function getCharacterDefinition(): CharacterDefinition | null {
  if (cachedCharacter) return cachedCharacter;

  if (!characterFilePath || !fs.existsSync(characterFilePath)) {
    console.warn('[CharacterService] character.json not found at:', characterFilePath);
    return null;
  }

  try {
    const raw = fs.readFileSync(characterFilePath, 'utf-8');
    cachedCharacter = JSON.parse(raw) as CharacterDefinition;
    console.log(`[CharacterService] Loaded character: ${cachedCharacter.name} (${cachedCharacter.id})`);
    return cachedCharacter;
  } catch (e) {
    console.error('[CharacterService] Failed to load character.json:', e);
    return null;
  }
}

/**
 * Get the conversation reward config from the current character.
 * Returns defaults if character is not loaded.
 */
export function getConversationRewards(): ConversationRewards {
  const char = getCharacterDefinition();
  if (char?.conversationRewards) return char.conversationRewards;

  // Fallback defaults
  return {
    xpPerConversation: 15,
    favorPerConversation: 1.5,
    cooldownMs: 60_000,
    bonusConditions: []
  };
}

/**
 * Get the activity reward config for non-conversation user-visible completions.
 * Returns defaults if character is not loaded, and merges per-activity overrides.
 */
export function getActivityRewards(): Record<ActivityRewardId, ActivityReward> {
  const char = getCharacterDefinition();
  const overrides = char?.activityRewards ?? {};
  const activityIds = Object.keys(DEFAULT_ACTIVITY_REWARDS) as ActivityRewardId[];

  return activityIds.reduce(
    (acc, activityId) => {
      const base = DEFAULT_ACTIVITY_REWARDS[activityId];
      const override = overrides[activityId];
      acc[activityId] = {
        ...base,
        ...override,
        dimensionGrowth: {
          ...(base.dimensionGrowth ?? {}),
          ...(override?.dimensionGrowth ?? {})
        }
      };
      return acc;
    },
    {} as Record<ActivityRewardId, ActivityReward>
  );
}

/**
 * Get the favor persona overlay for a given favor level.
 */
export function getFavorPersonaOverlay(favorLevel: string): FavorPersonaEntry | null {
  const char = getCharacterDefinition();
  return char?.favorPersona?.[favorLevel] ?? null;
}

/**
 * Get the dimension definitions from the current character.
 */
export function getDimensionSchema(): DimensionDef[] {
  const char = getCharacterDefinition();
  return char?.dimensions?.schema ?? [];
}

/**
 * Reload character definition from disk (e.g., after character pack switch).
 */
export function reloadCharacter(): CharacterDefinition | null {
  cachedCharacter = null;
  return getCharacterDefinition();
}

// ━━ Persona Prompt Builder (Phase 2) ━━

export interface PersonaPromptContext {
  favorLevel: string; // e.g. 'stranger', 'friend', 'bestie'
  mood: string; // e.g. 'neutral', 'joyful', 'curious'
  level: number;
}

export type PersonaPromptSection = 'identity' | 'coreTraits' | 'relationship' | 'speechStyle' | 'mood' | 'boundaries';
export type PersonaIdentityField = 'name' | 'background' | 'tagline';
export type PersonaSpeechStyleField = 'tone' | 'language' | 'firstPerson' | 'addressUser' | 'quirks' | 'examples';

export interface PersonaPromptBuildOptions {
  sections?: PersonaPromptSection[];
  identityFields?: PersonaIdentityField[];
  speechStyleFields?: PersonaSpeechStyleField[];
}

const DEFAULT_PERSONA_PROMPT_SECTIONS: PersonaPromptSection[] = ['identity', 'coreTraits', 'relationship', 'speechStyle', 'mood', 'boundaries'];
const DEFAULT_IDENTITY_FIELDS: PersonaIdentityField[] = ['name', 'background'];
const DEFAULT_SPEECH_STYLE_FIELDS: PersonaSpeechStyleField[] = ['tone', 'firstPerson', 'quirks', 'examples'];

/**
 * Build a character persona system prompt based on the current character definition
 * and the user's persona state (favor level, mood, etc.).
 *
 * Returns null if no character is loaded.
 */
export function buildCharacterPersonaPrompt(ctx: PersonaPromptContext, options?: PersonaPromptBuildOptions): string | null {
  const char = getCharacterDefinition();
  if (!char) return null;

  const sections: string[] = [];
  const selectedSections = new Set(options?.sections ?? DEFAULT_PERSONA_PROMPT_SECTIONS);
  const selectedIdentityFields = new Set(options?.identityFields ?? DEFAULT_IDENTITY_FIELDS);
  const selectedSpeechStyleFields = new Set(options?.speechStyleFields ?? DEFAULT_SPEECH_STYLE_FIELDS);

  if (options?.identityFields?.length) {
    selectedSections.add('identity');
  }

  if (options?.speechStyleFields?.length) {
    selectedSections.add('speechStyle');
  }

  // Identity
  if (selectedSections.has('identity')) {
    const identityLines: string[] = [];
    if (selectedIdentityFields.has('name')) {
      identityLines.push(`- 名字：${char.name}`);
    }
    if (selectedIdentityFields.has('tagline') && char.identity.tagline) {
      identityLines.push(`- 角色标语：${char.identity.tagline}`);
    }
    if (selectedIdentityFields.has('background') && char.identity.background) {
      identityLines.push(`- 背景：${char.identity.background}`);
    }
    if (identityLines.length > 0) {
      sections.push(`## 你的身份\n${identityLines.join('\n')}`);
    }
  }

  // Core traits
  if (selectedSections.has('coreTraits') && char.identity.coreTraits.length > 0) {
    sections.push(`## 性格特征\n${char.identity.coreTraits.map((t) => `- ${t}`).join('\n')}`);
  }

  // Favor-based persona overlay
  const favorEntry = char.favorPersona[ctx.favorLevel];
  if (selectedSections.has('relationship') && favorEntry) {
    sections.push(`## 当前关系\n${favorEntry.systemPromptOverlay}`);
  }

  // Speech style
  const style = char.speechStyle;
  if (selectedSections.has('speechStyle')) {
    const speechParts: string[] = [];
    if (selectedSpeechStyleFields.has('tone')) {
      speechParts.push(`语气：${style.tone}`);
    }
    if (selectedSpeechStyleFields.has('language')) {
      speechParts.push(`语言：${style.language}`);
    }
    if (selectedSpeechStyleFields.has('firstPerson')) {
      speechParts.push(`自称：${style.firstPerson}`);
    }
    if (selectedSpeechStyleFields.has('addressUser')) {
      speechParts.push(`对用户称呼：${style.addressUser}`);
    }
    if (selectedSpeechStyleFields.has('quirks') && style.quirks.length > 0) {
      speechParts.push(`说话习惯：\n${style.quirks.map((q) => `- ${q}`).join('\n')}`);
    }
    if (selectedSpeechStyleFields.has('examples') && style.examples.length > 0) {
      speechParts.push(`参考示例：\n${style.examples.map((e) => `- ${e.situation}：「${e.response}」`).join('\n')}`);
    }
    if (speechParts.length > 0) {
      sections.push(`## 说话风格\n${speechParts.join('\n\n')}`);
    }
  }

  // Mood modifier (only if not neutral)
  if (selectedSections.has('mood') && ctx.mood !== 'neutral') {
    const moodExpr = char.moodExpressions[ctx.mood];
    if (moodExpr) {
      sections.push(`## 当前心情\n你现在的心情是「${ctx.mood}」。${moodExpr.messageStyle}`);
    }
  }

  // Boundaries
  if (selectedSections.has('boundaries') && char.identity.boundaries.length > 0) {
    sections.push(`## 核心原则\n${char.identity.boundaries.map((b) => `- ${b}`).join('\n')}`);
  }

  if (sections.length === 0) {
    return null;
  }

  console.log('角色的 Prompt ❤❤❤\n', sections.join('\n\n'));

  return sections.join('\n\n');
}

/**
 * Get a lightweight character info summary for the renderer process.
 * Returns null if no character is loaded.
 */
export function getCharacterInfo(): { id: string; name: string; nameAliases: string[]; tagline: string } | null {
  const char = getCharacterDefinition();
  if (!char) return null;

  return {
    id: char.id,
    name: char.name,
    nameAliases: char.nameAliases,
    tagline: char.identity.tagline
  };
}

/**
 * Get tool label overrides from the current character definition.
 * Returns undefined if no character is loaded or no toolLabels are defined.
 */
export function getCharacterToolLabels(): Record<string, ToolLabelDefinition> | undefined {
  const char = getCharacterDefinition();
  return char?.toolLabels ?? undefined;
}
