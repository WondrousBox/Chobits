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
  meta: CharacterMeta;
}

// ━━ Service ━━

let cachedCharacter: CharacterDefinition | null = null;
let characterFilePath: string | null = null;

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

/**
 * Build a character persona system prompt based on the current character definition
 * and the user's persona state (favor level, mood, etc.).
 *
 * Returns null if no character is loaded.
 */
export function buildCharacterPersonaPrompt(ctx: PersonaPromptContext): string | null {
  const char = getCharacterDefinition();
  if (!char) return null;

  const sections: string[] = [];

  // Identity
  sections.push(`## 你的身份\n你的名字是 ${char.name}。${char.identity.background}`);

  // Core traits
  sections.push(`## 性格特征\n${char.identity.coreTraits.map((t) => `- ${t}`).join('\n')}`);

  // Favor-based persona overlay
  const favorEntry = char.favorPersona[ctx.favorLevel];
  if (favorEntry) {
    sections.push(`## 当前关系\n${favorEntry.systemPromptOverlay}`);
  }

  // Speech style
  const style = char.speechStyle;
  const quirksText = style.quirks.map((q) => `- ${q}`).join('\n');
  const examplesText = style.examples.map((e) => `- ${e.situation}：「${e.response}」`).join('\n');
  sections.push(`## 说话风格\n语气：${style.tone}\n自称：${style.firstPerson}\n\n说话习惯：\n${quirksText}\n\n参考示例：\n${examplesText}`);

  // Mood modifier (only if not neutral)
  if (ctx.mood !== 'neutral') {
    const moodExpr = char.moodExpressions[ctx.mood];
    if (moodExpr) {
      sections.push(`## 当前心情\n你现在的心情是「${ctx.mood}」。${moodExpr.messageStyle}`);
    }
  }

  // Boundaries
  sections.push(`## 行为边界\n${char.identity.boundaries.map((b) => `- ${b}`).join('\n')}`);

  console.log(sections.join('\n\n'));

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
