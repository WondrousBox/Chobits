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

import type { SpriteAnimationCondition } from './animation-condition';
import { resolvePackRelativeAssetPath } from './character-pack-paths';
import { DEFAULT_CONVERSATION_REWARDS, mergeActivityRewards } from './config/persona-rules';
import type { MoodType } from './persona-state';

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

export type BuiltinActivityRewardId =
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

export type ActivityRewardId = BuiltinActivityRewardId | (string & {});

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

export interface CharacterXPSourceDefinition {
  id: string;
  event: string;
  baseXP: number;
  dailyLimit?: number;
}

export interface CharacterFavorModifierDefinition {
  id: string;
  event: string;
  delta: number;
  dailyLimit?: number;
  cooldown?: number;
}

export interface CharacterMoodRuleDefinition {
  id: string;
  when: SpriteAnimationCondition;
  targetMood: MoodType;
  intensity: number;
  priority: number;
}

export interface CharacterConversationBonusMatcherDefinition {
  when: SpriteAnimationCondition;
}

export interface CharacterCapabilityPersonaFlagDefinition {
  id: string;
  when: SpriteAnimationCondition;
}

export interface CharacterCapabilityFlagsConfig {
  featureFlags?: string[];
  personaFlags?: CharacterCapabilityPersonaFlagDefinition[];
}

export interface CharacterPersonaRulesConfig {
  xpSources?: CharacterXPSourceDefinition[];
  favorModifiers?: CharacterFavorModifierDefinition[];
  moodRules?: CharacterMoodRuleDefinition[];
  conversationBonusMatchers?: Record<string, CharacterConversationBonusMatcherDefinition>;
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
  personaRules?: CharacterPersonaRulesConfig;
  capabilityFlags?: CharacterCapabilityFlagsConfig;
  /** Per-tool display label overrides with placeholder support */
  toolLabels?: Record<string, ToolLabelDefinition>;
  meta: CharacterMeta;
}

export interface CharacterPackAssets {
  character?: string;
  animations?: string;
  voices?: string;
  preview?: {
    avatar?: string;
    gif?: string;
    video?: string;
  };
}

export interface CharacterPackCapabilities {
  hasVoice?: boolean;
  hasCustomAnimations?: boolean;
  has3DModel?: boolean;
  supportedLanguages?: string[];
  dimensionExtensions?: string[];
}

export interface CharacterPackProvenance {
  channel?: string;
  publisher?: string;
  homepage?: string;
  repository?: string;
  support?: string;
  canonicalUrl?: string;
}

export interface CharacterPackSignature {
  algorithm?: string;
  keyId?: string;
  digest?: string;
  value?: string;
}

export interface CharacterPackDefinition {
  formatVersion: number;
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  license: string;
  tags: string[];
  minAppVersion?: string;
  platform?: string[];
  assets?: CharacterPackAssets;
  capabilities?: CharacterPackCapabilities;
  provenance?: CharacterPackProvenance;
  signature?: CharacterPackSignature;
}

// ━━ Service ━━

let cachedCharacter: CharacterDefinition | null = null;
let cachedCharacterPack: CharacterPackDefinition | null = null;
let characterFilePath: string | null = null;
let characterPackFilePath: string | null = null;

function readJsonFile<T>(filePath: string | null, options: { label: string; warnMissing?: boolean }): T | null {
  if (!filePath || !fs.existsSync(filePath)) {
    if (options.warnMissing !== false) {
      console.warn(`[CharacterService] ${options.label} not found at:`, filePath);
    }
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (e) {
    console.error(`[CharacterService] Failed to load ${options.label}:`, e);
    return null;
  }
}

function getDefaultCharacterFilePathForPack(packFile: string): string {
  return path.join(path.dirname(packFile), 'character.json');
}

function resolvePackRelativePath(packFile: string, candidate: unknown): string | null {
  return resolvePackRelativeAssetPath(path.dirname(packFile), candidate);
}

function resolveCharacterFilePathFromPack(pack: CharacterPackDefinition | null | undefined, packFile: string | null): string | null {
  if (!packFile) return null;
  return resolvePackRelativePath(packFile, pack?.assets?.character) ?? getDefaultCharacterFilePathForPack(packFile);
}

function resolvePackAssetPath(pack: CharacterPackDefinition | null | undefined, packFile: string | null, asset: keyof CharacterPackAssets): string | null {
  if (!packFile) return null;

  const resolved = resolvePackRelativePath(packFile, pack?.assets?.[asset]);
  if (resolved) {
    return resolved;
  }

  if (asset === 'character') {
    return getDefaultCharacterFilePathForPack(packFile);
  }

  return null;
}

export function setCharacterFilePath(filePath: string | null): void {
  characterFilePath = filePath ? path.resolve(filePath) : null;
  cachedCharacter = null;
}

export function setCharacterPackFilePath(filePath: string | null): void {
  characterPackFilePath = filePath ? path.resolve(filePath) : null;
  cachedCharacterPack = null;
}

export function getCharacterPackFilePath(): string | null {
  return characterPackFilePath;
}

export function getCharacterPackRootDir(): string | null {
  return characterPackFilePath ? path.dirname(characterPackFilePath) : null;
}

/**
 * Initialize the character service with the sprites directory path.
 * Call this once during app bootstrap (after sprite assets are initialized).
 */
export function initCharacterService(spritesDir: string): void {
  const resolvedSpritesDir = path.resolve(spritesDir);
  setCharacterPackFilePath(path.join(resolvedSpritesDir, 'pack.json'));
  const characterPath = resolveCharacterFilePathFromPack(getCharacterPackDefinition(), characterPackFilePath) ?? path.join(resolvedSpritesDir, 'character.json');
  setCharacterFilePath(characterPath);
}

/**
 * Load and return the current character pack definition.
 * Returns null if pack.json doesn't exist or is invalid.
 */
export function getCharacterPackDefinition(): CharacterPackDefinition | null {
  if (cachedCharacterPack) return cachedCharacterPack;

  const pack = readJsonFile<CharacterPackDefinition>(characterPackFilePath, {
    label: 'pack.json',
    warnMissing: false
  });
  if (!pack) {
    return null;
  }

  cachedCharacterPack = pack;
  console.log(`[CharacterService] Loaded character pack: ${pack.name} (${pack.id})`);
  return cachedCharacterPack;
}

export function getCharacterPackAssetPath(asset: keyof CharacterPackAssets): string | null {
  return resolvePackAssetPath(getCharacterPackDefinition(), characterPackFilePath, asset);
}

/**
 * Load and return the current character definition.
 * Returns null if character.json doesn't exist or is invalid.
 */
export function getCharacterDefinition(): CharacterDefinition | null {
  if (cachedCharacter) return cachedCharacter;

  const character = readJsonFile<CharacterDefinition>(characterFilePath, {
    label: 'character.json'
  });
  if (!character) {
    return null;
  }

  cachedCharacter = character;
  console.log(`[CharacterService] Loaded character: ${cachedCharacter.name} (${cachedCharacter.id})`);
  return cachedCharacter;
}

/**
 * Get the conversation reward config from the current character.
 * Returns defaults if character is not loaded.
 */
export function getConversationRewards(): ConversationRewards {
  const char = getCharacterDefinition();
  if (char?.conversationRewards) return char.conversationRewards;
  return { ...DEFAULT_CONVERSATION_REWARDS, bonusConditions: [...DEFAULT_CONVERSATION_REWARDS.bonusConditions] };
}

/**
 * Get the activity reward config for non-conversation user-visible completions.
 * Returns defaults if character is not loaded, and merges per-activity overrides.
 */
export function getActivityRewards(): Record<ActivityRewardId, ActivityReward> {
  const char = getCharacterDefinition();
  return mergeActivityRewards(char?.activityRewards);
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
  cachedCharacterPack = null;
  const resolvedCharacterPath = resolveCharacterFilePathFromPack(getCharacterPackDefinition(), characterPackFilePath);
  if (resolvedCharacterPath) {
    characterFilePath = resolvedCharacterPath;
  }
  return getCharacterDefinition();
}

export function reloadCharacterPack(): CharacterPackDefinition | null {
  cachedCharacterPack = null;
  const pack = getCharacterPackDefinition();
  const resolvedCharacterPath = resolveCharacterFilePathFromPack(pack, characterPackFilePath);
  if (resolvedCharacterPath && resolvedCharacterPath !== characterFilePath) {
    characterFilePath = resolvedCharacterPath;
    cachedCharacter = null;
  }
  return pack;
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
