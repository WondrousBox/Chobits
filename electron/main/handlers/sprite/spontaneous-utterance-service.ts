import 'dayjs/locale/zh-cn';

import { randomUUID } from 'node:crypto';
import * as fsSync from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { ChatRepo, WorkspacesRepo } from '@packages/common/db/repositories';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { app } from 'electron';

import { getPreset } from '../../../../packages/ai/preset-service';
import { createPiTaskChatRuntimeFromRequest } from '../../../../packages/ai/runtime/pi/task-chat';
import { logMemoryTrace } from '../../../../packages/ai/services/memory-trace';
import type { AgentLoopCompletePayload } from '../../../../packages/ai/services/memory-types';
import { extractSnapshot, extractTopFacts, parsePersonaMarkdown } from '../../../../packages/ai/services/persona-document';
import { PERSONA_FILENAME } from '../../../../packages/ai/services/persona-types';
import { collectTaskChatText, createActivityAwareTaskTimeoutController, type TaskChatActivityKind } from '../../../../packages/ai/services/task-chat-runner';
import { eventManager } from '../../../../packages/event';
import { AppEvent } from '../../../../packages/event/events';
import { buildCharacterPersonaPrompt } from '../../../../packages/sprite-core/character-service';
import type {
  SpriteSpontaneousUtteranceExecutionReport,
  SpriteSpontaneousUtteranceExecutor,
  SpriteSpontaneousUtteranceHistoryItem,
  SpriteSpontaneousUtteranceHistoryQuery,
  SpriteSpontaneousUtteranceIntentCategory,
  SpriteSpontaneousUtterancePreferences,
  SpriteSpontaneousUtteranceRequest,
  SpriteSpontaneousUtteranceResult,
  SpriteSpontaneousUtteranceTonePreference
} from '../../../../packages/sprite-core/manager';
import { getStoredCharacterProfile } from '../status';
import {
  buildSpontaneousPurposeRetrospectiveContext,
  formatSpontaneousPurposeRetrospectiveContext,
  SPONTANEOUS_PURPOSE_RETROSPECTIVE_LIMIT,
  SPONTANEOUS_PURPOSE_RETROSPECTIVE_MIN_WORTHINESS,
  type SpontaneousPurposeRetrospectiveContext,
  type SpontaneousPurposeRetrospectiveProvider
} from './purpose-retrospective-context';
import { buildSpontaneousUtteranceRuntimeRequest } from './spontaneous-utterance-runtime';

const TAG = '[SpriteSpontaneousUtterance]';
const MESSAGE_LIMIT = 16;
const RECENT_MESSAGE_SLICE = 12;
const MAX_MESSAGE_CHARS = 240;
const MAX_PROFILE_FACTS = 6;
const EXECUTION_CONTEXT_TTL_MS = 15 * 60 * 1000;
const HISTORY_FILE_PREFIX = 'sprite-spontaneous-utterances-';
const HISTORY_FILE_SUFFIX = '.jsonl';
const DEFAULT_HISTORY_LIMIT = 80;
const RECENT_TEXT_DEDUPE_LIMIT = 20;
const RECENT_INTENT_WINDOW = 5;
const RECENT_INTENT_SKIP_MIN_COUNT = 3;
const MAX_GENERATION_TIMEOUT_MS = 3 * 60 * 1000;

const TONE_VALUES = ['gentle', 'playful', 'calm', 'firm', 'curious', 'tender'] as const;
const EMOTION_VALUES = ['warm', 'hopeful', 'amused', 'thoughtful', 'soothing', 'bright'] as const;
const INTENT_VALUES = ['philosophy', 'encouragement', 'playful', 'reminder', 'planning', 'empathy', 'reflection'] as const satisfies readonly SpriteSpontaneousUtteranceIntentCategory[];
const TONE_PREFERENCE_VALUES = ['auto', ...TONE_VALUES] as const satisfies readonly SpriteSpontaneousUtteranceTonePreference[];

const DEFAULT_SPONTANEOUS_UTTERANCE_PREFERENCES: SpriteSpontaneousUtterancePreferences = {
  enabled: true,
  cooldownMinutes: 20,
  dailyLimit: 8,
  preferredTone: 'auto',
  allowedIntentCategories: [...INTENT_VALUES]
};

dayjs.extend(relativeTime);

type ActiveConversationHint = {
  conversationId?: string;
  providerId?: string;
  providerPresetId?: string;
  updatedAt: number;
};

type GeneratedUtterancePayload = {
  text?: unknown;
  intentCategory?: unknown;
  tone?: unknown;
  emotion?: unknown;
  recommendedAction?: unknown;
  whyThisFits?: unknown;
};

type RecentMessage = {
  role: 'user' | 'assistant';
  content: string;
  createdAt?: number;
};

type ResolvedConversationContext = {
  conversationId?: string;
  workspaceId?: string;
  workspaceRoot?: string;
  providerId?: string;
  providerPresetId?: string;
  recentMessages: RecentMessage[];
};

type PersonaSummary = {
  snapshot: string | null;
  facts: string[];
};

type PersistentMemorySource = 'targeted_search' | 'broad_recall' | 'memory_index' | 'combined';

type PersistentMemoryContext = {
  query: string;
  keywords: string[];
  context: string;
  noteCount: number;
  topicCount: number;
  source?: PersistentMemorySource;
};

export interface SpriteSpontaneousUtteranceServiceOptions {
  purposeRetrospectiveProvider?: SpontaneousPurposeRetrospectiveProvider;
}

type ImportantDialogueDigest = {
  source: 'recent-chat' | 'memory-note';
  reason: 'recent_goal' | 'recent_struggle' | 'recent_commitment' | 'recent_reflection' | 'important_memory';
  freshness: 'current' | 'recent' | 'background';
  relativeTime?: string;
  summary: string;
};

type PendingExecutionContext = {
  workspaceId?: string;
  workspaceRoot?: string;
  conversationId?: string;
  providerId?: string;
  providerPresetId?: string;
  createdAt: number;
};

type HistoryLogContext = Pick<ResolvedConversationContext, 'workspaceId' | 'workspaceRoot' | 'conversationId' | 'providerId' | 'providerPresetId'>;

type SpontaneousUtteranceLogEntry = {
  timestamp?: number;
  eventType?: string;
  utteranceId?: string;
  workspaceId?: string;
  conversationId?: string;
  behaviorId?: string;
  skipped?: boolean;
  reason?: string;
  triggerReason?: string;
  providerId?: string;
  providerPresetId?: string;
  model?: string;
  latencyMs?: number;
  result?: {
    text?: string;
    intentCategory?: SpriteSpontaneousUtteranceIntentCategory;
    tone?: string;
    emotion?: string;
    whyThisFits?: string;
  };
  executedAction?: string;
  fallbackAction?: string;
  actionSource?: SpriteSpontaneousUtteranceHistoryItem['actionSource'];
  spoken?: boolean;
  fallbackUsed?: boolean;
  error?: string;
};

type HistoryAccumulator = SpriteSpontaneousUtteranceHistoryItem & {
  sortTimestamp: number;
};

type FavorLevel = 'stranger' | 'acquaintance' | 'friend' | 'close-friend' | 'bestie' | 'soulmate';

function getPreferencesFilePath(): string {
  return path.join(app.getPath('userData'), 'data', 'sprite-spontaneous-utterance-preferences.json');
}

function createEmptyMemoryContext(): PersistentMemoryContext {
  return {
    query: '',
    keywords: [],
    context: '',
    noteCount: 0,
    topicCount: 0
  };
}

function createGenerationTimeoutController(): {
  signal: AbortSignal;
  noteActivity: (activity: TaskChatActivityKind) => void;
  getAbortReason: () => string | undefined;
  dispose: () => void;
} {
  return createActivityAwareTaskTimeoutController({
    tag: TAG,
    timeouts: {
      maxTimeoutMs: MAX_GENERATION_TIMEOUT_MS,
      maxTimeoutReason: 'generation_max_timeout'
    }
  });
}

function safeParseJson<T>(text: string): T | null {
  const trimmed = text.trim();
  const candidates = [trimmed, ...(trimmed.match(/```json\s*([\s\S]*?)```/i)?.slice(1) ?? []), ...(trimmed.match(/(\{[\s\S]*\})/)?.slice(1) ?? [])]
    .map((candidate) => candidate.trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      // keep trying
    }
  }

  return null;
}

function truncateText(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function normalizeSingleLine(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim();
}

function normalizeEnumValue<T extends readonly string[]>(value: unknown, allowedValues: T): T[number] | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = normalizeSingleLine(value).toLowerCase();
  return allowedValues.find((item) => item === normalized);
}

function normalizeIntentCategory(value: unknown): SpriteSpontaneousUtteranceIntentCategory | undefined {
  return normalizeEnumValue(value, INTENT_VALUES);
}

function normalizeTonePreference(value: unknown): SpriteSpontaneousUtteranceTonePreference {
  return normalizeEnumValue(value, TONE_PREFERENCE_VALUES) ?? DEFAULT_SPONTANEOUS_UTTERANCE_PREFERENCES.preferredTone;
}

function normalizePositiveInteger(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeIntentCategories(value: unknown): SpriteSpontaneousUtteranceIntentCategory[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_SPONTANEOUS_UTTERANCE_PREFERENCES.allowedIntentCategories];
  }

  const categories = value.map((item) => normalizeIntentCategory(item)).filter((item): item is SpriteSpontaneousUtteranceIntentCategory => !!item);

  return deduplicateStrings(categories).length ? (deduplicateStrings(categories) as SpriteSpontaneousUtteranceIntentCategory[]) : [...DEFAULT_SPONTANEOUS_UTTERANCE_PREFERENCES.allowedIntentCategories];
}

function normalizeSpontaneousUtterancePreferences(value: unknown): SpriteSpontaneousUtterancePreferences {
  const payload = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

  return {
    enabled: typeof payload.enabled === 'boolean' ? payload.enabled : DEFAULT_SPONTANEOUS_UTTERANCE_PREFERENCES.enabled,
    cooldownMinutes: normalizePositiveInteger(payload.cooldownMinutes, DEFAULT_SPONTANEOUS_UTTERANCE_PREFERENCES.cooldownMinutes, 5, 180),
    dailyLimit: normalizePositiveInteger(payload.dailyLimit, DEFAULT_SPONTANEOUS_UTTERANCE_PREFERENCES.dailyLimit, 1, 20),
    preferredTone: normalizeTonePreference(payload.preferredTone),
    allowedIntentCategories: normalizeIntentCategories(payload.allowedIntentCategories)
  };
}

function readPreferencesSync(): SpriteSpontaneousUtterancePreferences {
  try {
    const filePath = getPreferencesFilePath();
    if (!fsSync.existsSync(filePath)) {
      return { ...DEFAULT_SPONTANEOUS_UTTERANCE_PREFERENCES };
    }

    const raw = fsSync.readFileSync(filePath, 'utf-8');
    return normalizeSpontaneousUtterancePreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_SPONTANEOUS_UTTERANCE_PREFERENCES };
  }
}

function formatLocalDateStamp(ts = Date.now()): string {
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatRelativeTimeLabel(value?: number | string | null): string | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') {
    return undefined;
  }

  const parsed = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? dayjs(`${value.trim()}T12:00:00`) : dayjs(value);
  if (!parsed.isValid()) {
    return undefined;
  }

  const diffSeconds = Math.abs(dayjs().diff(parsed, 'second'));
  if (diffSeconds < 90) {
    return '刚刚';
  }

  return parsed.locale('zh-cn').fromNow();
}

function resolveFavorLevel(favor: number): FavorLevel {
  if (favor >= 95) return 'soulmate';
  if (favor >= 80) return 'bestie';
  if (favor >= 60) return 'close-friend';
  if (favor >= 40) return 'friend';
  if (favor >= 20) return 'acquaintance';
  return 'stranger';
}

function deduplicateStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeSingleLine(value);
    if (!normalized) continue;
    const dedupeKey = normalized.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    result.push(normalized);
  }

  return result;
}

function normalizeHistoryTextKey(text: string): string {
  return normalizeSingleLine(text)
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '');
}

function computeStableDecisionScore(seed: string): number {
  let hash = 0;

  for (const char of seed) {
    hash = (hash * 33 + char.codePointAt(0)!) % 1000;
  }

  return hash / 1000;
}

function evaluateHistoryNoise(candidate: SpriteSpontaneousUtteranceResult, history: SpriteSpontaneousUtteranceHistoryItem[]): { shouldSkip: false } | { shouldSkip: true; reason: string } {
  const comparable = history.filter((item) => item.status !== 'skipped' && !!item.text).slice(0, RECENT_TEXT_DEDUPE_LIMIT);
  const candidateTextKey = normalizeHistoryTextKey(candidate.text);

  if (candidateTextKey && comparable.some((item) => normalizeHistoryTextKey(item.text || '') === candidateTextKey)) {
    return { shouldSkip: true, reason: 'duplicate_text' };
  }

  if (!candidate.intentCategory) {
    return { shouldSkip: false };
  }

  const recentIntentItems = comparable.slice(0, RECENT_INTENT_WINDOW).filter((item) => item.intentCategory === candidate.intentCategory);
  if (recentIntentItems.length < RECENT_INTENT_SKIP_MIN_COUNT) {
    return { shouldSkip: false };
  }

  const sameToneCount = candidate.tone ? recentIntentItems.filter((item) => item.tone === candidate.tone).length : 0;
  const score = computeStableDecisionScore(`${candidate.intentCategory}:${candidate.tone || 'auto'}:${candidate.text}`);
  const threshold = recentIntentItems.length >= 4 ? 0.85 : sameToneCount >= 2 ? 0.7 : 0.55;

  if (score < threshold) {
    return { shouldSkip: true, reason: 'intent_overrepresented' };
  }

  return { shouldSkip: false };
}

function formatRecentMessages(messages: RecentMessage[]): string {
  if (!messages.length) {
    return '无近期聊天可用。';
  }

  return messages
    .map((message) => {
      const relativeTime = formatRelativeTimeLabel(message.createdAt);
      return `${message.role === 'user' ? '用户' : '助手'}${relativeTime ? `（${relativeTime}）` : ''}: ${message.content}`;
    })
    .join('\n');
}

function formatPersistentMemoryContext(memory: PersistentMemoryContext): string {
  if (!memory.context) {
    return '暂无匹配到可用的持久记忆。';
  }

  const sourceLabel =
    memory.source === 'combined'
      ? 'memory/MEMORY.md 摘要 + 定向检索'
      : memory.source === 'broad_recall'
        ? '最近记忆兜底'
        : memory.source === 'memory_index'
          ? 'memory/MEMORY.md 摘要'
          : memory.source === 'targeted_search'
            ? '定向检索'
            : null;

  return [`- 检索线索: ${memory.query || '无'}`, ...(sourceLabel ? [`- 记忆来源: ${sourceLabel}`] : []), `- 命中笔记: ${memory.noteCount}`, memory.context].join('\n');
}

function formatImportantDialogueDigests(digests: ImportantDialogueDigest[]): string {
  if (!digests.length) {
    return '暂无提炼出的重点对话。';
  }

  return digests.map((digest) => `- [${digest.source}/${digest.reason}/${digest.freshness}${digest.relativeTime ? `/${digest.relativeTime}` : ''}] ${digest.summary}`).join('\n');
}

function buildPrompt(
  input: SpriteSpontaneousUtteranceRequest,
  ctx: ResolvedConversationContext,
  persona: PersonaSummary,
  characterProfileSummary: string[],
  persistentMemory: PersistentMemoryContext,
  importantDialogueDigests: ImportantDialogueDigest[],
  purposeRetrospective: SpontaneousPurposeRetrospectiveContext | null,
  preferences: SpriteSpontaneousUtterancePreferences
): string {
  const preset = ctx.providerPresetId ? getPreset(ctx.providerPresetId) : undefined;
  const characterPersonaPrompt = buildCharacterPersonaPrompt(
    {
      favorLevel: resolveFavorLevel(input.sprite.favor),
      mood: input.sprite.mood,
      level: input.sprite.level
    },
    {
      identityFields: ['name', 'background'],
      sections: ['identity', 'relationship', 'speechStyle', 'mood'],
      speechStyleFields: ['tone', 'firstPerson', 'quirks']
    }
  );
  const personaSection = persona.snapshot || persona.facts.length ? [`## 用户画像\n ${persona.snapshot || '无'}`, ...persona.facts.map((fact) => `- ${fact}`)].join('\n') : '';
  const allowedIntentLine = preferences.allowedIntentCategories.join('|');
  const preferredToneLine = preferences.preferredTone === 'auto' ? 'auto' : preferences.preferredTone;

  return `人都需要被关心和被爱，你会努力给用户提供情绪价值。

## 你的任务
根据你知道的信息，抒发想法，表达关心，文本要简短，有哲理或诗意或者复函人文气息，其中不乏旅游、美食、历史、文化、健康、生活的见解和思考。

${characterPersonaPrompt ? truncateText(characterPersonaPrompt, 1800) : ''}

你的状态: ${input.sprite.state}
- 心情: ${input.sprite.mood}
- 好感度: ${input.sprite.favor}
- 等级: ${input.sprite.level}

硬性要求：
1. tone / emotion 要和这句话的口气一致，也要贴合用户当前状态，让人觉得被理解、提醒或鼓舞。
2. 如果没有更强的上下文信号，语气尽量向这个偏好靠拢：${preferredToneLine}。
请输出这个 JSON 结构，不要解释：
{
  "text": "你要说的简短的一句话，要自然、有温度，不做作，不说教",
  "intentCategory": "只能从里面选择你的意图：${allowedIntentLine}",
  "tone": "gentle|playful|calm|firm|curious|tender",
  "emotion": "warm|hopeful|amused|thoughtful|soothing|bright",
  "recommendedAction": "必须从给定候选动作中选择；如果都不合适，输出空字符串，动作候选: ${input.actionCandidates.join('|')}",
  "whyThisFits": "表达你为什么那样说"
}

## 已知信息

用户画像:
${personaSection}

精灵当前角色状态:
${characterProfileSummary.join('\n') || '暂无'}


当前 preset system prompt:
${preset?.systemPrompt ? truncateText(preset.systemPrompt, 1000) : '暂无'}

最近聊天:
${formatRecentMessages(ctx.recentMessages)}

持久记忆检索:
${formatPersistentMemoryContext(persistentMemory)}

重要对话摘要:
${formatImportantDialogueDigests(importantDialogueDigests)}

Sprite purpose retrospective:
${formatSpontaneousPurposeRetrospectiveContext(purposeRetrospective)}

Use the sprite purpose retrospective as quiet self-awareness about what you already helped with today. Do not mention internal purpose ids or technical routine names unless the user directly asked about implementation.
`;
}

function mapToneToAction(tone: SpriteSpontaneousUtteranceResult['tone'], emotion: SpriteSpontaneousUtteranceResult['emotion'], actionCandidates: string[]): string | undefined {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const push = (...actions: string[]): void => {
    for (const action of actions) {
      if (!actionCandidates.includes(action) || seen.has(action)) {
        continue;
      }
      seen.add(action);
      ordered.push(action);
    }
  };

  switch (tone) {
    case 'gentle':
    case 'tender':
      push('nod', 'wave', 'sit', 'stand');
      break;
    case 'playful':
      push('wave', 'jump', 'dance', 'spin', 'nod');
      break;
    case 'calm':
      push('nod', 'sit', 'stand', 'lookRight', 'lookLeft');
      break;
    case 'firm':
      push('point', 'stand', 'nod', 'wave');
      break;
    case 'curious':
      push('lookLeft', 'lookRight', 'point', 'nod');
      break;
  }

  switch (emotion) {
    case 'warm':
    case 'soothing':
      push('nod', 'wave', 'sit');
      break;
    case 'hopeful':
      push('stand', 'point', 'nod', 'wave');
      break;
    case 'amused':
    case 'bright':
      push('wave', 'jump', 'dance', 'spin');
      break;
    case 'thoughtful':
      push('lookRight', 'lookLeft', 'nod', 'sit');
      break;
  }

  return ordered[0];
}

function normalizeGeneratedUtterance(
  payload: GeneratedUtterancePayload | null,
  input: SpriteSpontaneousUtteranceRequest,
  preferences: SpriteSpontaneousUtterancePreferences
): SpriteSpontaneousUtteranceResult | null {
  if (!payload || typeof payload.text !== 'string') return null;

  const text = normalizeSingleLine(payload.text);
  if (!text) return null;

  const intentCategory = normalizeIntentCategory(payload.intentCategory);
  const tone = normalizeEnumValue(payload.tone, TONE_VALUES);
  const emotion = normalizeEnumValue(payload.emotion, EMOTION_VALUES);

  if (intentCategory && !preferences.allowedIntentCategories.includes(intentCategory)) {
    return null;
  }

  const effectiveTone = tone ?? (preferences.preferredTone !== 'auto' ? preferences.preferredTone : undefined);
  const modelRecommendedAction = typeof payload.recommendedAction === 'string' && input.actionCandidates.includes(payload.recommendedAction) ? payload.recommendedAction : undefined;
  const recommendedAction = modelRecommendedAction || mapToneToAction(effectiveTone, emotion, input.actionCandidates);

  return {
    text: truncateText(text, 80),
    ...(intentCategory ? { intentCategory } : {}),
    ...(tone ? { tone } : {}),
    ...(emotion ? { emotion } : {}),
    ...(recommendedAction ? { recommendedAction } : {}),
    ...(recommendedAction ? { actionSource: modelRecommendedAction ? 'model' : 'style-map' } : {}),
    ...(typeof payload.whyThisFits === 'string' ? { whyThisFits: truncateText(payload.whyThisFits, 160) } : {})
  };
}

function clonePreferences(preferences: SpriteSpontaneousUtterancePreferences): SpriteSpontaneousUtterancePreferences {
  return {
    ...preferences,
    allowedIntentCategories: [...preferences.allowedIntentCategories]
  };
}

function createEmptyHistoryAccumulator(entry: SpontaneousUtteranceLogEntry): HistoryAccumulator {
  const timestamp = typeof entry.timestamp === 'number' ? entry.timestamp : Date.now();
  return {
    utteranceId: entry.utteranceId,
    timestamp,
    workspaceId: entry.workspaceId,
    conversationId: entry.conversationId,
    behaviorId: entry.behaviorId,
    status: entry.skipped ? 'skipped' : 'generated',
    reason: entry.reason,
    fallbackAction: entry.fallbackAction,
    triggerReason: entry.triggerReason,
    providerId: entry.providerId,
    providerPresetId: entry.providerPresetId,
    model: entry.model,
    latencyMs: entry.latencyMs,
    sortTimestamp: timestamp
  };
}

function applyHistoryLogEntry(base: HistoryAccumulator, entry: SpontaneousUtteranceLogEntry): HistoryAccumulator {
  const timestamp = typeof entry.timestamp === 'number' ? entry.timestamp : base.timestamp;
  const next: HistoryAccumulator = {
    ...base,
    timestamp: Math.max(base.timestamp, timestamp),
    sortTimestamp: Math.max(base.sortTimestamp, timestamp),
    workspaceId: entry.workspaceId ?? base.workspaceId,
    conversationId: entry.conversationId ?? base.conversationId,
    behaviorId: entry.behaviorId ?? base.behaviorId,
    triggerReason: entry.triggerReason ?? base.triggerReason,
    providerId: entry.providerId ?? base.providerId,
    providerPresetId: entry.providerPresetId ?? base.providerPresetId,
    model: entry.model ?? base.model,
    latencyMs: entry.latencyMs ?? base.latencyMs
  };

  next.fallbackAction = entry.fallbackAction ?? next.fallbackAction;

  if (entry.result) {
    next.text = entry.result.text ?? next.text;
    next.intentCategory = entry.result.intentCategory ?? next.intentCategory;
    next.tone = entry.result.tone ?? next.tone;
    next.emotion = entry.result.emotion ?? next.emotion;
    next.whyThisFits = entry.result.whyThisFits ?? next.whyThisFits;
  }

  if (entry.eventType === 'execution') {
    next.executedAction = entry.executedAction ?? next.executedAction;
    next.actionSource = entry.actionSource ?? next.actionSource;
    next.spoken = entry.spoken ?? next.spoken;
    next.fallbackUsed = entry.fallbackUsed ?? next.fallbackUsed;
    if (!next.fallbackAction && entry.fallbackUsed && entry.executedAction) {
      next.fallbackAction = entry.executedAction;
    }
    next.status = entry.spoken ? 'spoken' : 'failed';
    if (!entry.spoken) {
      next.reason = entry.reason ?? entry.error ?? next.reason;
    }
  } else if (entry.skipped) {
    next.skipped = true;
    next.reason = entry.reason ?? next.reason;
    next.status = 'skipped';
  } else if (next.status !== 'spoken' && next.status !== 'failed') {
    next.status = 'generated';
  }

  return next;
}

function buildStandaloneHistoryItem(entry: SpontaneousUtteranceLogEntry): HistoryAccumulator {
  return applyHistoryLogEntry(createEmptyHistoryAccumulator(entry), entry);
}

function matchesHistoryQuery(item: SpriteSpontaneousUtteranceHistoryItem, query: SpriteSpontaneousUtteranceHistoryQuery): boolean {
  if (query.status && query.status !== 'all' && item.status !== query.status) {
    return false;
  }

  if (query.intentCategory && query.intentCategory !== 'all' && item.intentCategory !== query.intentCategory) {
    return false;
  }

  if (!query.query?.trim()) {
    return true;
  }

  const needle = query.query.trim().toLowerCase();
  return [item.text, item.whyThisFits, item.executedAction, item.fallbackAction, item.reason, item.intentCategory, item.tone, item.emotion]
    .filter((value): value is string => typeof value === 'string' && !!value)
    .some((value) => value.toLowerCase().includes(needle));
}

export class SpriteSpontaneousUtteranceService implements SpriteSpontaneousUtteranceExecutor {
  private activeHint?: ActiveConversationHint;
  private isGenerating = false;
  private lastSuccessAt = 0;
  private dailyDate = formatLocalDateStamp();
  private dailyCount = 0;
  private pendingExecutionContexts = new Map<string, PendingExecutionContext>();
  private spontaneousUtterancePreferences = readPreferencesSync();
  private lastResolvedContextHint?: HistoryLogContext;

  constructor(private readonly options: SpriteSpontaneousUtteranceServiceOptions = {}) {
    eventManager.on(AppEvent.AGENT_LOOP_COMPLETE, (payload: AgentLoopCompletePayload) => {
      if (!payload?.conversationId) return;
      this.activeHint = {
        conversationId: payload.conversationId,
        providerId: payload.providerId,
        providerPresetId: payload.providerPresetId,
        updatedAt: Date.now()
      };
    });

    eventManager.on(AppEvent.SPRITE_AI_COMPLETED, (payload: { conversationId?: string }) => {
      if (!payload?.conversationId) return;
      this.activeHint = {
        conversationId: payload.conversationId,
        providerId: this.activeHint?.providerId,
        providerPresetId: this.activeHint?.providerPresetId,
        updatedAt: Date.now()
      };
    });
  }

  async generateForIdleAction(input: SpriteSpontaneousUtteranceRequest): Promise<SpriteSpontaneousUtteranceResult | null> {
    this.prunePendingExecutionContexts();
    const preferences = this.spontaneousUtterancePreferences;

    if (this.isGenerating) {
      console.log(`${TAG} skipped: generation already running`);
      await this.appendSkippedGenerationLog(input, 'generation_in_progress');
      return null;
    }

    if (!preferences.enabled) {
      console.log(`${TAG} skipped: preferences disabled`);
      await this.appendSkippedGenerationLog(input, 'preferences_disabled');
      return null;
    }

    this.refreshDailyCounter();
    if (this.dailyCount >= preferences.dailyLimit) {
      console.log(`${TAG} skipped: daily limit reached (${this.dailyCount}/${preferences.dailyLimit})`);
      await this.appendSkippedGenerationLog(input, 'daily_limit_reached');
      return null;
    }

    const cooldownMs = preferences.cooldownMinutes * 60 * 1000;
    if (this.lastSuccessAt && Date.now() - this.lastSuccessAt < cooldownMs) {
      console.log(`${TAG} skipped: cooldown active`);
      await this.appendSkippedGenerationLog(input, 'cooldown_active');
      return null;
    }

    this.isGenerating = true;
    const startedAt = Date.now();
    let generationAbortReason: string | undefined;
    let ctx: ResolvedConversationContext | undefined;
    let persona: PersonaSummary = { snapshot: null, facts: [] };
    const persistentMemory = createEmptyMemoryContext();
    const importantDialogueDigests: ImportantDialogueDigest[] = [];
    let purposeRetrospective: SpontaneousPurposeRetrospectiveContext | null = null;

    try {
      ctx = await this.resolveConversationContext();
      this.rememberHistoryLogContext(ctx);
      if (!ctx.providerId) {
        console.log(`${TAG} skipped: no provider context`);
        await this.appendSkippedGenerationLog(input, 'no_provider_context', { context: ctx });
        return null;
      }

      const characterProfilePromise = getStoredCharacterProfile();
      persona = await this.loadPersonaSummary(ctx.workspaceId);
      const [characterProfile, resolvedPurposeRetrospective] = await Promise.all([characterProfilePromise, this.collectPurposeRetrospectiveContext()]);

      purposeRetrospective = resolvedPurposeRetrospective;

      const characterProfileSummary = [
        `- 当前角色名: ${characterProfile.name}`,
        ...(characterProfile.mood ? [`- 当前角色心情: ${characterProfile.mood}`] : []),
        ...(typeof characterProfile.level === 'number' ? [`- 当前角色等级: ${characterProfile.level}`] : []),
        ...(typeof characterProfile.favor === 'number' ? [`- 当前角色 favor: ${characterProfile.favor}`] : []),
        ...(characterProfile.description ? [`- 当前角色描述: ${truncateText(characterProfile.description, 300)}`] : [])
      ];

      const prompt = buildPrompt(input, ctx, persona, characterProfileSummary, persistentMemory, importantDialogueDigests, purposeRetrospective, preferences);
      const runtime = await createPiTaskChatRuntimeFromRequest(
        buildSpontaneousUtteranceRuntimeRequest({
          providerId: ctx.providerId,
          providerPresetId: ctx.providerPresetId,
          workspaceId: ctx.workspaceId
        })
      );
      let raw = '';
      const timeoutController = createGenerationTimeoutController();
      try {
        raw = await collectTaskChatText(runtime.chatFn, prompt, {
          noteActivity: timeoutController.noteActivity,
          signal: timeoutController.signal
        });
      } finally {
        generationAbortReason = timeoutController.getAbortReason();
        timeoutController.dispose();
      }

      console.log(raw);

      const logContextDigest = this.buildContextDigest(ctx, persona, persistentMemory, importantDialogueDigests, purposeRetrospective);
      const parsedPayload = safeParseJson<GeneratedUtterancePayload>(raw);
      const parsedIntent = normalizeIntentCategory(parsedPayload?.intentCategory);
      const normalized = normalizeGeneratedUtterance(parsedPayload, input, preferences);

      if (!normalized) {
        await this.appendSkippedGenerationLog(
          input,
          parsedPayload && preferences.allowedIntentCategories.length !== INTENT_VALUES.length && (!parsedIntent || !preferences.allowedIntentCategories.includes(parsedIntent))
            ? 'intent_filtered'
            : 'parse_failed',
          {
            context: ctx,
            contextDigest: logContextDigest,
            memoryKeywords: persistentMemory.keywords,
            importantDialogueDigests,
            purposeRetrospective,
            raw
          }
        );
        return null;
      }

      if (!normalized.intentCategory && preferences.allowedIntentCategories.length !== INTENT_VALUES.length) {
        await this.appendSkippedGenerationLog(input, 'intent_filtered', {
          context: ctx,
          contextDigest: logContextDigest,
          memoryKeywords: persistentMemory.keywords,
          importantDialogueDigests,
          purposeRetrospective,
          raw
        });
        return null;
      }

      const recentHistory = ctx.workspaceId ? await this.listSpontaneousUtterances({ workspaceId: ctx.workspaceId, limit: RECENT_TEXT_DEDUPE_LIMIT }) : [];
      const noiseDecision = evaluateHistoryNoise(normalized, recentHistory);
      if (noiseDecision.shouldSkip) {
        await this.appendSkippedGenerationLog(input, noiseDecision.reason, {
          context: ctx,
          contextDigest: logContextDigest,
          memoryKeywords: persistentMemory.keywords,
          importantDialogueDigests,
          purposeRetrospective,
          raw
        });
        return null;
      }

      this.lastSuccessAt = Date.now();
      this.dailyCount += 1;
      const utteranceId = randomUUID();
      const result = {
        ...normalized,
        utteranceId
      };
      this.pendingExecutionContexts.set(utteranceId, {
        workspaceId: ctx.workspaceId,
        workspaceRoot: ctx.workspaceRoot,
        conversationId: ctx.conversationId,
        providerId: ctx.providerId,
        providerPresetId: ctx.providerPresetId,
        createdAt: Date.now()
      });

      await this.appendLog(ctx.workspaceRoot, {
        timestamp: Date.now(),
        eventType: 'generation',
        utteranceId,
        workspaceId: ctx.workspaceId,
        conversationId: ctx.conversationId,
        behaviorId: input.behaviorId,
        triggerReason: 'small-action-idle',
        providerId: ctx.providerId,
        providerPresetId: ctx.providerPresetId,
        model: runtime.modelId,
        latencyMs: Date.now() - startedAt,
        spriteState: {
          mood: input.sprite.mood,
          moodIntensity: input.sprite.moodIntensity,
          favor: input.sprite.favor,
          level: input.sprite.level,
          idleDurationMs: input.sprite.idleDurationMs
        },
        contextDigest: logContextDigest,
        memoryKeywords: persistentMemory.keywords,
        importantDialogueDigests,
        ...(purposeRetrospective ? { purposeRetrospective } : {}),
        fallbackAction: input.fallbackAction,
        result
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const failureReason = generationAbortReason || (error instanceof Error ? error.name || 'generation_failed' : 'generation_failed');
      console.warn(`${TAG} generation failed:`, generationAbortReason ? `${errorMessage} (${generationAbortReason})` : errorMessage);
      await this.appendSkippedGenerationLog(input, failureReason, {
        context: ctx,
        contextDigest: this.buildContextDigest(ctx, persona, persistentMemory, importantDialogueDigests, purposeRetrospective),
        memoryKeywords: persistentMemory.keywords,
        importantDialogueDigests,
        purposeRetrospective
      });
      return null;
    } finally {
      this.isGenerating = false;
    }
  }

  async reportIdleActionExecution(report: SpriteSpontaneousUtteranceExecutionReport): Promise<void> {
    if (!report.utteranceId) {
      return;
    }

    this.prunePendingExecutionContexts();
    const pending = this.pendingExecutionContexts.get(report.utteranceId);
    if (!pending) {
      return;
    }

    this.pendingExecutionContexts.delete(report.utteranceId);
    await this.appendLog(pending.workspaceRoot, {
      timestamp: Date.now(),
      eventType: 'execution',
      utteranceId: report.utteranceId,
      workspaceId: pending.workspaceId,
      conversationId: pending.conversationId,
      behaviorId: report.behaviorId,
      triggeredAt: report.triggeredAt,
      providerId: pending.providerId,
      providerPresetId: pending.providerPresetId,
      result: {
        ...(report.text ? { text: report.text } : {}),
        ...(report.intentCategory ? { intentCategory: report.intentCategory } : {}),
        ...(report.tone ? { tone: report.tone } : {}),
        ...(report.emotion ? { emotion: report.emotion } : {}),
        ...(report.whyThisFits ? { whyThisFits: report.whyThisFits } : {})
      },
      executedAction: report.executedAction,
      ...(report.fallbackUsed ? { fallbackAction: report.executedAction } : {}),
      actionSource: report.actionSource,
      spoken: report.spoken,
      fallbackUsed: report.fallbackUsed,
      ...(report.error ? { error: truncateText(report.error, 240), reason: truncateText(report.error, 240) } : {})
    });
  }

  async getSpontaneousUtterancePreferences(): Promise<SpriteSpontaneousUtterancePreferences> {
    return clonePreferences(this.spontaneousUtterancePreferences);
  }

  async updateSpontaneousUtterancePreferences(patch: Partial<SpriteSpontaneousUtterancePreferences>): Promise<SpriteSpontaneousUtterancePreferences> {
    this.spontaneousUtterancePreferences = normalizeSpontaneousUtterancePreferences({
      ...this.spontaneousUtterancePreferences,
      ...patch
    });
    await this.saveSpontaneousUtterancePreferences();
    return clonePreferences(this.spontaneousUtterancePreferences);
  }

  async listSpontaneousUtterances(query: SpriteSpontaneousUtteranceHistoryQuery = {}): Promise<SpriteSpontaneousUtteranceHistoryItem[]> {
    const workspace = query.workspaceId != null ? await WorkspacesRepo.getById(query.workspaceId) : await WorkspacesRepo.getDefault();

    if (!workspace?.rootPath) {
      return [];
    }

    const logDir = path.join(workspace.rootPath, 'memory', 'logs');
    let fileNames: string[] = [];
    try {
      fileNames = (await fs.readdir(logDir)).filter((fileName) => fileName.startsWith(HISTORY_FILE_PREFIX) && fileName.endsWith(HISTORY_FILE_SUFFIX)).sort();
    } catch {
      return [];
    }

    const merged = new Map<string, HistoryAccumulator>();
    const standalone: HistoryAccumulator[] = [];

    for (const fileName of fileNames) {
      let content = '';
      try {
        content = await fs.readFile(path.join(logDir, fileName), 'utf-8');
      } catch {
        continue;
      }

      const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      for (const line of lines) {
        let entry: SpontaneousUtteranceLogEntry | null = null;
        try {
          entry = JSON.parse(line) as SpontaneousUtteranceLogEntry;
        } catch {
          continue;
        }

        if (!entry) {
          continue;
        }

        if (entry.utteranceId) {
          const current = merged.get(entry.utteranceId) ?? createEmptyHistoryAccumulator(entry);
          merged.set(entry.utteranceId, applyHistoryLogEntry(current, entry));
        } else {
          standalone.push(buildStandaloneHistoryItem(entry));
        }
      }
    }

    const limit = Math.max(1, Math.min(200, Math.round(query.limit ?? DEFAULT_HISTORY_LIMIT)));
    return [...merged.values(), ...standalone]
      .sort((left, right) => right.sortTimestamp - left.sortTimestamp)
      .filter((item) => matchesHistoryQuery(item, query))
      .slice(0, limit)
      .map((entry) => {
        const { sortTimestamp, ...item } = entry;
        void sortTimestamp;
        return item;
      });
  }

  private buildContextDigest(
    ctx: ResolvedConversationContext | undefined,
    persona: PersonaSummary,
    persistentMemory: PersistentMemoryContext,
    importantDialogueDigests: ImportantDialogueDigest[],
    purposeRetrospective: SpontaneousPurposeRetrospectiveContext | null
  ): {
    personaUsed: boolean;
    recentMessageCount: number;
    memoryQuery?: string;
    memoryKeywordCount: number;
    memoryNoteCount: number;
    memoryTopicCount: number;
    memorySource?: PersistentMemorySource;
    importantDigestCount: number;
    purposeRetrospectiveDate?: string;
    purposeRetrospectiveMemoryCandidates?: number;
    purposeRetrospectiveItemCount?: number;
  } {
    return {
      personaUsed: !!persona.snapshot || persona.facts.length > 0,
      recentMessageCount: ctx?.recentMessages.length ?? 0,
      memoryQuery: persistentMemory.query || undefined,
      memoryKeywordCount: persistentMemory.keywords.length,
      memoryNoteCount: persistentMemory.noteCount,
      memoryTopicCount: persistentMemory.topicCount,
      ...(persistentMemory.source ? { memorySource: persistentMemory.source } : {}),
      importantDigestCount: importantDialogueDigests.length,
      ...(purposeRetrospective
        ? {
            purposeRetrospectiveDate: purposeRetrospective.date,
            purposeRetrospectiveMemoryCandidates: purposeRetrospective.memoryCandidateCount,
            purposeRetrospectiveItemCount: purposeRetrospective.items.length
          }
        : {})
    };
  }

  private refreshDailyCounter(): void {
    const today = formatLocalDateStamp();
    if (today !== this.dailyDate) {
      this.dailyDate = today;
      this.dailyCount = 0;
    }
  }

  private prunePendingExecutionContexts(now = Date.now()): void {
    for (const [utteranceId, item] of this.pendingExecutionContexts.entries()) {
      if (now - item.createdAt > EXECUTION_CONTEXT_TTL_MS) {
        this.pendingExecutionContexts.delete(utteranceId);
      }
    }
  }

  private async saveSpontaneousUtterancePreferences(): Promise<void> {
    try {
      const filePath = getPreferencesFilePath();
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, `${JSON.stringify(this.spontaneousUtterancePreferences, null, 2)}\n`, 'utf-8');
    } catch (error) {
      console.warn(`${TAG} preferences save failed:`, error instanceof Error ? error.message : error);
    }
  }

  private async collectPurposeRetrospectiveContext(): Promise<SpontaneousPurposeRetrospectiveContext | null> {
    if (!this.options.purposeRetrospectiveProvider) {
      return null;
    }

    try {
      const retrospective = await this.options.purposeRetrospectiveProvider({
        limit: SPONTANEOUS_PURPOSE_RETROSPECTIVE_LIMIT,
        minMemoryWorthiness: SPONTANEOUS_PURPOSE_RETROSPECTIVE_MIN_WORTHINESS
      });
      const context = buildSpontaneousPurposeRetrospectiveContext(retrospective);
      if (context) {
        logMemoryTrace({
          event: 'spontaneous_purpose.retrospective.result',
          itemCount: context.items.length,
          memoryCandidateCount: context.memoryCandidateCount,
          purposeDate: context.date,
          recallCueCount: context.recallCues.length
        });
      }
      return context;
    } catch (error) {
      logMemoryTrace(
        {
          error: error instanceof Error ? error.message : String(error),
          event: 'spontaneous_purpose.retrospective.error'
        },
        'warn'
      );
      return null;
    }
  }

  private async resolveConversationContext(): Promise<ResolvedConversationContext> {
    const conversations = await ChatRepo.listConversations({}, 20, 0);
    const hintedConversation = this.activeHint?.conversationId ? conversations.find((item) => item.id === this.activeHint?.conversationId) : undefined;
    const chosenConversation = hintedConversation || conversations.find((item) => !!item.providerId) || conversations[0];
    const effectiveHint = hintedConversation ? this.activeHint : undefined;

    const providerPresetId = effectiveHint?.providerPresetId ?? chosenConversation?.providerPresetId ?? undefined;
    const providerId = effectiveHint?.providerId || chosenConversation?.providerId || (providerPresetId ? getPreset(providerPresetId)?.providerId : undefined);
    const workspaceId = chosenConversation?.workspaceId || (await WorkspacesRepo.getDefault())?.id || undefined;
    const workspace = workspaceId ? await WorkspacesRepo.getById(workspaceId) : undefined;

    const rawMessages = chosenConversation?.id ? await ChatRepo.listMessages(chosenConversation.id, MESSAGE_LIMIT, 0) : [];
    const recentMessages = rawMessages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .slice(-RECENT_MESSAGE_SLICE)
      .map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: truncateText(normalizeSingleLine(message.content || ''), MAX_MESSAGE_CHARS),
        createdAt: message.createdAt ?? undefined
      }))
      .filter((message) => message.content);

    return {
      conversationId: chosenConversation?.id,
      workspaceId,
      workspaceRoot: workspace?.rootPath || undefined,
      providerId,
      providerPresetId: providerPresetId || undefined,
      recentMessages
    };
  }

  private rememberHistoryLogContext(ctx: HistoryLogContext | undefined): void {
    if (!ctx) {
      return;
    }

    this.lastResolvedContextHint = {
      workspaceId: ctx.workspaceId,
      workspaceRoot: ctx.workspaceRoot,
      conversationId: ctx.conversationId,
      providerId: ctx.providerId,
      providerPresetId: ctx.providerPresetId
    };
  }

  private async resolveHistoryLogContext(): Promise<HistoryLogContext> {
    if (this.lastResolvedContextHint?.workspaceRoot) {
      return this.lastResolvedContextHint;
    }

    const workspace = await WorkspacesRepo.getDefault();
    const context = {
      workspaceId: workspace?.id,
      workspaceRoot: workspace?.rootPath
    };

    this.rememberHistoryLogContext(context);
    return context;
  }

  private async appendSkippedGenerationLog(
    input: SpriteSpontaneousUtteranceRequest,
    reason: string,
    options: {
      context?: HistoryLogContext;
      contextDigest?: Record<string, unknown>;
      memoryKeywords?: string[];
      importantDialogueDigests?: ImportantDialogueDigest[];
      purposeRetrospective?: SpontaneousPurposeRetrospectiveContext | null;
      raw?: string;
    } = {}
  ): Promise<void> {
    const fallbackContext = await this.resolveHistoryLogContext();
    const context = {
      ...fallbackContext,
      ...(options.context ?? {})
    };

    this.rememberHistoryLogContext(context);
    await this.appendLog(context.workspaceRoot, {
      timestamp: Date.now(),
      eventType: 'generation',
      workspaceId: context.workspaceId,
      conversationId: context.conversationId,
      behaviorId: input.behaviorId,
      triggerReason: 'small-action-idle',
      skipped: true,
      reason,
      providerId: context.providerId,
      providerPresetId: context.providerPresetId,
      spriteState: {
        mood: input.sprite.mood,
        moodIntensity: input.sprite.moodIntensity,
        favor: input.sprite.favor,
        level: input.sprite.level,
        idleDurationMs: input.sprite.idleDurationMs
      },
      fallbackAction: input.fallbackAction,
      ...(options.contextDigest ? { contextDigest: options.contextDigest } : {}),
      ...(options.memoryKeywords ? { memoryKeywords: options.memoryKeywords } : {}),
      ...(options.importantDialogueDigests ? { importantDialogueDigests: options.importantDialogueDigests } : {}),
      ...(options.purposeRetrospective ? { purposeRetrospective: options.purposeRetrospective } : {}),
      ...(options.raw ? { raw: truncateText(options.raw, 300) } : {})
    });
  }

  private async loadPersonaSummary(workspaceId?: string): Promise<PersonaSummary> {
    if (!workspaceId) {
      return { snapshot: null, facts: [] };
    }

    const workspace = await WorkspacesRepo.getById(workspaceId);
    if (!workspace?.rootPath) {
      return { snapshot: null, facts: [] };
    }

    try {
      const content = await fs.readFile(path.join(workspace.rootPath, 'memory', PERSONA_FILENAME), 'utf-8');
      const parsed = parsePersonaMarkdown(content);
      return {
        snapshot: extractSnapshot(parsed),
        facts: extractTopFacts(parsed).slice(0, MAX_PROFILE_FACTS)
      };
    } catch {
      return { snapshot: null, facts: [] };
    }
  }

  private async appendLog(workspaceRoot: string | undefined, payload: Record<string, any>): Promise<void> {
    if (!workspaceRoot) return;

    const logDir = path.join(workspaceRoot, 'memory', 'logs');
    const logPath = path.join(logDir, `${HISTORY_FILE_PREFIX}${formatLocalDateStamp()}${HISTORY_FILE_SUFFIX}`);
    await fs.mkdir(logDir, { recursive: true });
    await fs.appendFile(logPath, `${JSON.stringify(payload)}\n`, 'utf-8');
  }
}
