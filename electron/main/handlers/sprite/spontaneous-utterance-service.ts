import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { getPreset } from '../../../../packages/ai/preset-service';
import { getPiAgentProfile } from '../../../../packages/ai/runtime/pi/profile-registry';
import { createPiTaskChatRuntimeFromRequest, type PiTaskChatFunction } from '../../../../packages/ai/runtime/pi/task-chat';
import { extractKeywordsFromMessage } from '../../../../packages/ai/services/memory-auto-recall';
import { searchWithContent, type RetrievalDbDeps } from '../../../../packages/ai/services/memory-retrieval-service';
import type { AgentLoopCompletePayload } from '../../../../packages/ai/services/memory-types';
import { extractSnapshot, extractTopFacts, parsePersonaMarkdown } from '../../../../packages/ai/services/persona-document';
import { PERSONA_FILENAME } from '../../../../packages/ai/services/persona-types';
import { eventManager } from '../../../../packages/event';
import { AppEvent } from '../../../../packages/event/events';
import type { SpriteSpontaneousUtteranceExecutor, SpriteSpontaneousUtteranceRequest, SpriteSpontaneousUtteranceResult } from '../../../../packages/sprite-core/manager';
import { ChatRepo, WorkspacesRepo } from '../../db/repositories';
import { buildRetrievalDbDeps } from '../memory/retrieval-db-deps';
import { getStoredRoleProfile } from '../status';

const TAG = '[SpriteAIUtterance]';
const COOLDOWN_MS = 20 * 60 * 1000;
const DAILY_LIMIT = 8;
const MESSAGE_LIMIT = 16;
const RECENT_MESSAGE_SLICE = 12;
const MAX_MESSAGE_CHARS = 240;
const MAX_PROFILE_FACTS = 6;
const MAX_PROFILE_INSTRUCTION_LINES = 10;
const MEMORY_CONTEXT_MAX_CHARS = 1800;
const MAX_MEMORY_KEYWORDS = 10;
const RECENT_DIALOGUE_DIGEST_LIMIT = 3;
const IMPORTANT_MEMORY_DIGEST_LIMIT = 3;
const IMPORTANT_DIGEST_LIMIT = 5;

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
  bubbleDurationMs?: unknown;
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

type PersistentMemoryContext = {
  query: string;
  keywords: string[];
  context: string;
  noteCount: number;
  topicCount: number;
};

type ImportantDialogueDigest = {
  source: 'recent-chat' | 'memory-note';
  reason: 'recent_goal' | 'recent_struggle' | 'recent_commitment' | 'recent_reflection' | 'important_memory';
  freshness: 'current' | 'recent' | 'background';
  summary: string;
};

type ImportantMemoryNote = {
  date?: string | null;
  summary?: string | null;
  importance?: number;
  topics?: string | string[] | null;
};

function createEmptyMemoryContext(): PersistentMemoryContext {
  return {
    query: '',
    keywords: [],
    context: '',
    noteCount: 0,
    topicCount: 0
  };
}

function adaptChatFn(piChatFn: PiTaskChatFunction) {
  return async (prompt: string, signal?: AbortSignal): Promise<string> => {
    let fullText = '';
    let errorMessage: string | undefined;

    await piChatFn(
      prompt,
      (event) => {
        if (event.type === 'delta' && event.data.text) fullText += event.data.text;
        if (event.type === 'error') errorMessage = event.data.message;
      },
      signal
    );

    if (errorMessage) {
      throw new Error(errorMessage);
    }

    return fullText;
  };
}

function safeParseJson<T>(text: string): T | null {
  const trimmed = text.trim();
  const candidates = [
    trimmed,
    ...(trimmed.match(/```json\s*([\s\S]*?)```/i)?.slice(1) ?? []),
    ...(trimmed.match(/(\{[\s\S]*\})/)?.slice(1) ?? [])
  ]
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
  return text.replace(/\s+/g, ' ').replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
}

function clampBubbleDuration(text: string, value?: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(3000, Math.min(9000, Math.round(value)));
  }
  return Math.max(3500, Math.min(8500, text.length * 220));
}

function localDateStamp(ts = Date.now()): string {
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function summarizeAssistantInstructions(instructions?: string): string[] {
  if (!instructions) return [];
  return instructions
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== '---')
    .slice(0, MAX_PROFILE_INSTRUCTION_LINES);
}

function uniqueStrings(values: string[]): string[] {
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

function parseStringArray(value: string | string[] | null | undefined): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(value.filter((item): item is string => typeof item === 'string'));
  }

  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? uniqueStrings(parsed.filter((item): item is string => typeof item === 'string')) : [];
  } catch {
    return [];
  }
}

function formatRecentMessages(messages: RecentMessage[]): string {
  if (!messages.length) {
    return '无近期聊天可用。';
  }
  return messages.map((message) => `${message.role === 'user' ? '用户' : '助手'}: ${message.content}`).join('\n');
}

function formatPersistentMemoryContext(memory: PersistentMemoryContext): string {
  if (!memory.context) {
    return '暂无匹配到可用的持久记忆。';
  }

  return [`- 检索线索: ${memory.query || '无'}`, `- 命中笔记: ${memory.noteCount}`, memory.context].join('\n');
}

function formatImportantDialogueDigests(digests: ImportantDialogueDigest[]): string {
  if (!digests.length) {
    return '暂无提炼出的重点对话。';
  }

  return digests.map((digest) => `- [${digest.source}/${digest.reason}/${digest.freshness}] ${digest.summary}`).join('\n');
}

function inferRecentDialogueReason(text: string): ImportantDialogueDigest['reason'] | null {
  if (
    /(焦虑|担心|压力|烦|累|卡住|难受|崩溃|没状态|纠结|拖延|stress|anxious|stuck|tired|burnout|overwhelmed|frustrated)/i.test(
      text
    )
  ) {
    return 'recent_struggle';
  }

  if (/(我要|我会|先做|先把|接下来|马上|今晚|今天先|准备开始|开始做|立刻|我打算先|i will|i'm going to|next i'll)/i.test(text)) {
    return 'recent_commitment';
  }

  if (/(计划|安排|打算|准备|目标|下一步|明天|本周|下周|todo|待办|截止|deadline|roadmap|milestone|launch)/i.test(text)) {
    return 'recent_goal';
  }

  if (/(感觉|发现|意识到|想明白|原来|突然明白|好像|似乎|我发现|i realized|i noticed|it feels like)/i.test(text)) {
    return 'recent_reflection';
  }

  return null;
}

function buildRecentDialogueDigests(messages: RecentMessage[]): ImportantDialogueDigest[] {
  const userMessages = messages.filter((message) => message.role === 'user').slice(-6).reverse();
  const digests: ImportantDialogueDigest[] = [];

  for (let index = 0; index < userMessages.length; index += 1) {
    const message = userMessages[index];
    const summary = truncateText(normalizeSingleLine(message.content), 72);
    const reason = inferRecentDialogueReason(summary);

    if (!summary || !reason) continue;

    digests.push({
      source: 'recent-chat',
      reason,
      freshness: index < 2 ? 'current' : 'recent',
      summary
    });

    if (digests.length >= RECENT_DIALOGUE_DIGEST_LIMIT) {
      break;
    }
  }

  return digests;
}

function buildImportantMemoryDigests(notes: ImportantMemoryNote[]): ImportantDialogueDigest[] {
  const digests: ImportantDialogueDigest[] = [];

  for (const note of notes) {
    const summary = normalizeSingleLine(note.summary || '');
    if (!summary) continue;

    const topics = parseStringArray(note.topics);
    const topicPrefix = topics.length ? `[${topics.slice(0, 2).join(' / ')}] ` : '';
    const freshness: ImportantDialogueDigest['freshness'] =
      note.date && localDateStamp(Date.now() - 3 * 24 * 60 * 60 * 1000) <= note.date ? 'recent' : 'background';

    digests.push({
      source: 'memory-note',
      reason: 'important_memory',
      freshness,
      summary: truncateText(`${topicPrefix}${summary}`, 72)
    });

    if (digests.length >= IMPORTANT_MEMORY_DIGEST_LIMIT) {
      break;
    }
  }

  return digests;
}

function dedupeDigests(digests: ImportantDialogueDigest[]): ImportantDialogueDigest[] {
  const seen = new Set<string>();
  const result: ImportantDialogueDigest[] = [];

  for (const digest of digests) {
    const key = normalizeSingleLine(digest.summary).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(digest);
  }

  return result;
}

function buildMemorySearchQuery(recentMessages: RecentMessage[], persona: PersonaSummary): { query: string; keywords: string[] } {
  const userSignals = recentMessages.filter((message) => message.role === 'user').slice(-4).map((message) => message.content);
  const personaSignals = [persona.snapshot || '', ...persona.facts.slice(0, 2)];

  const keywordPool = uniqueStrings(
    [...userSignals, ...personaSignals]
      .flatMap((text) => extractKeywordsFromMessage(text))
      .map((keyword) => keyword.slice(0, 24))
  );

  const fallbackPool = uniqueStrings(
    [...userSignals, ...personaSignals]
      .map((text) => normalizeSingleLine(text))
      .filter(Boolean)
      .map((text) => text.slice(0, 24))
  );

  const keywords = (keywordPool.length ? keywordPool : fallbackPool).slice(0, MAX_MEMORY_KEYWORDS);
  return {
    query: keywords.join(' '),
    keywords
  };
}

function buildPrompt(
  input: SpriteSpontaneousUtteranceRequest,
  ctx: ResolvedConversationContext,
  persona: PersonaSummary,
  roleSummary: string[],
  persistentMemory: PersistentMemoryContext,
  importantDialogueDigests: ImportantDialogueDigest[]
): string {
  const preset = ctx.providerPresetId ? getPreset(ctx.providerPresetId) : undefined;
  const assistantRole = getPiAgentProfile('assistant');
  const personaSection =
    persona.snapshot || persona.facts.length
      ? [`用户画像摘要: ${persona.snapshot || '无'}`, ...persona.facts.map((fact) => `- ${fact}`)].join('\n')
      : '用户画像摘要: 暂无';

  return `你是桌面精灵助手的“自发一句话生成器”。
你的任务：根据给定上下文，生成一句适合让桌面精灵主动说出口的话。
硬性要求：
1. 只输出 JSON，不要解释。
2. text 必须是一句中文短句，适合气泡和 TTS。
3. text 要自然、有温度，不要套模板鸡汤，不要生硬说教。
4. 优先从这些方向里选一种最适合当前上下文的表达：哲理、鼓励、轻提醒、有趣、计划感、安抚、反思。
5. 不要编造用户没说过的重要事实。
6. 不要直接提“根据你的画像/记忆/数据”。
7. 最近聊天优先于长期记忆；长期记忆只用于补充语气、主题与提醒方向。
8. recommendedAction 必须从给定候选动作中选择；如果都不合适，输出空字符串。
9. tone / emotion 要和这句话的口气一致，也要贴合用户当前状态，尽量让人觉得被理解、被轻轻提醒或被鼓舞到。
10. whyThisFits 用一句简短的话说明这句话为什么适合当前上下文，点出你参考的是哪些信号。
11. 语气要像熟悉用户的精灵助手，长度尽量控制在 8-36 个汉字之间。
请输出这个 JSON 结构：
{
  "text": "一句话",
  "intentCategory": "philosophy|encouragement|playful|reminder|planning|empathy|reflection",
  "tone": "gentle|playful|calm|firm|curious|tender",
  "emotion": "warm|hopeful|amused|thoughtful|soothing|bright",
  "recommendedAction": "动作名或空字符串",
  "bubbleDurationMs": 5200,
  "whyThisFits": "一句简短说明"
}

上下文如下：

精灵触发信息:
- behaviorId: ${input.behaviorId}
- 当前状态: ${input.sprite.state}
- 心情: ${input.sprite.mood}
- 心情强度: ${input.sprite.moodIntensity}
- favor: ${input.sprite.favor}
- level: ${input.sprite.level}
- idleDurationMs: ${input.sprite.idleDurationMs}
- 动作候选: ${input.actionCandidates.join(', ')}

用户画像:
${personaSection}

精灵当前角色:
${roleSummary.join('\n') || '暂无'}

基础助手身份:
- profile: ${assistantRole.label}
- description: ${assistantRole.description || '暂无'}
${summarizeAssistantInstructions(assistantRole.instructions)
  .map((line) => `- ${line}`)
  .join('\n')}

当前 preset system prompt:
${preset?.systemPrompt ? truncateText(preset.systemPrompt, 1000) : '暂无'}

最近聊天:
${formatRecentMessages(ctx.recentMessages)}

持久记忆检索:
${formatPersistentMemoryContext(persistentMemory)}

重要对话摘要:
${formatImportantDialogueDigests(importantDialogueDigests)}
`;
}

function normalizeGeneratedUtterance(
  payload: GeneratedUtterancePayload | null,
  input: SpriteSpontaneousUtteranceRequest
): SpriteSpontaneousUtteranceResult | null {
  if (!payload || typeof payload.text !== 'string') return null;

  const text = normalizeSingleLine(payload.text);
  if (!text) return null;

  const recommendedAction =
    typeof payload.recommendedAction === 'string' && input.actionCandidates.includes(payload.recommendedAction)
      ? payload.recommendedAction
      : undefined;

  return {
    text: truncateText(text, 80),
    ...(typeof payload.intentCategory === 'string' ? { intentCategory: payload.intentCategory } : {}),
    ...(typeof payload.tone === 'string' ? { tone: payload.tone } : {}),
    ...(typeof payload.emotion === 'string' ? { emotion: payload.emotion } : {}),
    ...(recommendedAction ? { recommendedAction } : {}),
    bubbleDurationMs: clampBubbleDuration(text, typeof payload.bubbleDurationMs === 'number' ? payload.bubbleDurationMs : undefined),
    ...(typeof payload.whyThisFits === 'string' ? { whyThisFits: truncateText(payload.whyThisFits, 160) } : {})
  };
}

export class SpriteSpontaneousUtteranceService implements SpriteSpontaneousUtteranceExecutor {
  private activeHint?: ActiveConversationHint;
  private isGenerating = false;
  private lastSuccessAt = 0;
  private dailyDate = localDateStamp();
  private dailyCount = 0;

  constructor() {
    eventManager.on(AppEvent.AGENT_LOOP_COMPLETE, (payload: AgentLoopCompletePayload) => {
      if (!payload?.conversationId) return;
      this.activeHint = {
        conversationId: payload.conversationId,
        providerId: payload.providerId,
        providerPresetId: payload.providerPresetId,
        updatedAt: Date.now()
      };
    });

    eventManager.on(AppEvent.SPRITE_AI_COMPLETE, (payload: { conversationId?: string }) => {
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
    if (this.isGenerating) {
      console.log(`${TAG} skipped: generation already running`);
      return null;
    }

    this.refreshDailyCounter();
    if (this.dailyCount >= DAILY_LIMIT) {
      console.log(`${TAG} skipped: daily limit reached (${this.dailyCount}/${DAILY_LIMIT})`);
      return null;
    }

    if (this.lastSuccessAt && Date.now() - this.lastSuccessAt < COOLDOWN_MS) {
      console.log(`${TAG} skipped: cooldown active`);
      return null;
    }

    this.isGenerating = true;
    const startedAt = Date.now();
    let ctx: ResolvedConversationContext | undefined;
    let persona: PersonaSummary = { snapshot: null, facts: [] };
    let persistentMemory = createEmptyMemoryContext();
    let importantDialogueDigests: ImportantDialogueDigest[] = [];

    try {
      ctx = await this.resolveConversationContext();
      if (!ctx.providerId) {
        console.log(`${TAG} skipped: no provider context`);
        return null;
      }

      const roleProfilePromise = getStoredRoleProfile();
      persona = await this.loadPersonaSummary(ctx.workspaceId);
      const db = buildRetrievalDbDeps();
      const [roleProfile, resolvedMemory, resolvedDigests] = await Promise.all([
        roleProfilePromise,
        this.collectPersistentMemoryContext(ctx, persona, db),
        this.collectImportantDialogueDigests(ctx, db)
      ]);

      persistentMemory = resolvedMemory;
      importantDialogueDigests = resolvedDigests;

      const roleSummary = [
        `- 当前角色名: ${roleProfile.name}`,
        ...(roleProfile.mood ? [`- 当前角色心情: ${roleProfile.mood}`] : []),
        ...(typeof roleProfile.level === 'number' ? [`- 当前角色等级: ${roleProfile.level}`] : []),
        ...(typeof roleProfile.favor === 'number' ? [`- 当前角色 favor: ${roleProfile.favor}`] : []),
        ...(roleProfile.description ? [`- 当前角色描述: ${truncateText(roleProfile.description, 300)}`] : [])
      ];

      const prompt = buildPrompt(input, ctx, persona, roleSummary, persistentMemory, importantDialogueDigests);
      const runtime = await createPiTaskChatRuntimeFromRequest({
        providerId: ctx.providerId,
        providerPresetId: ctx.providerPresetId,
        agentId: 'assistant',
        extras: ctx.workspaceId ? { workspaceId: ctx.workspaceId } : undefined,
        maxTokens: 260,
        temperature: 0.9
      });
      const chatFn = adaptChatFn(runtime.chatFn);

      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), 5000);

      let raw = '';
      try {
        raw = await chatFn(prompt, abortController.signal);
      } finally {
        clearTimeout(timeout);
      }

      const logContextDigest = this.buildContextDigest(ctx, persona, persistentMemory, importantDialogueDigests);
      const normalized = normalizeGeneratedUtterance(safeParseJson<GeneratedUtterancePayload>(raw), input);

      if (!normalized) {
        await this.appendLog(ctx.workspaceRoot, {
          timestamp: Date.now(),
          workspaceId: ctx.workspaceId,
          conversationId: ctx.conversationId,
          behaviorId: input.behaviorId,
          skipped: true,
          reason: 'parse_failed',
          providerId: ctx.providerId,
          providerPresetId: ctx.providerPresetId,
          contextDigest: logContextDigest,
          memoryKeywords: persistentMemory.keywords,
          importantDialogueDigests,
          raw: truncateText(raw, 300)
        });
        return null;
      }

      this.lastSuccessAt = Date.now();
      this.dailyCount += 1;

      await this.appendLog(ctx.workspaceRoot, {
        timestamp: Date.now(),
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
        result: normalized
      });

      return normalized;
    } catch (error) {
      console.warn(`${TAG} generation failed:`, error instanceof Error ? error.message : error);
      await this.appendLog(ctx?.workspaceRoot, {
        timestamp: Date.now(),
        workspaceId: ctx?.workspaceId,
        conversationId: ctx?.conversationId,
        behaviorId: input.behaviorId,
        skipped: true,
        reason: error instanceof Error ? error.name || 'generation_failed' : 'generation_failed',
        providerId: ctx?.providerId,
        providerPresetId: ctx?.providerPresetId,
        contextDigest: this.buildContextDigest(ctx, persona, persistentMemory, importantDialogueDigests),
        memoryKeywords: persistentMemory.keywords,
        importantDialogueDigests
      });
      return null;
    } finally {
      this.isGenerating = false;
    }
  }

  private buildContextDigest(
    ctx: ResolvedConversationContext | undefined,
    persona: PersonaSummary,
    persistentMemory: PersistentMemoryContext,
    importantDialogueDigests: ImportantDialogueDigest[]
  ) {
    return {
      personaUsed: !!persona.snapshot || persona.facts.length > 0,
      recentMessageCount: ctx?.recentMessages.length ?? 0,
      memoryQuery: persistentMemory.query || undefined,
      memoryKeywordCount: persistentMemory.keywords.length,
      memoryNoteCount: persistentMemory.noteCount,
      memoryTopicCount: persistentMemory.topicCount,
      importantDigestCount: importantDialogueDigests.length
    };
  }

  private refreshDailyCounter(): void {
    const today = localDateStamp();
    if (today !== this.dailyDate) {
      this.dailyDate = today;
      this.dailyCount = 0;
    }
  }

  private async collectPersistentMemoryContext(
    ctx: ResolvedConversationContext,
    persona: PersonaSummary,
    db: RetrievalDbDeps
  ): Promise<PersistentMemoryContext> {
    if (!ctx.workspaceId) {
      return createEmptyMemoryContext();
    }

    const { query, keywords } = buildMemorySearchQuery(ctx.recentMessages, persona);
    if (!query) {
      return createEmptyMemoryContext();
    }

    try {
      const result = await searchWithContent(query, ctx.workspaceId, db, MEMORY_CONTEXT_MAX_CHARS);
      return {
        query: truncateText(query, 160),
        keywords,
        context: truncateText(result.context, MEMORY_CONTEXT_MAX_CHARS),
        noteCount: result.noteCount,
        topicCount: result.topicCount
      };
    } catch (error) {
      console.warn(`${TAG} memory recall failed:`, error instanceof Error ? error.message : error);
      return {
        query: truncateText(query, 160),
        keywords,
        context: '',
        noteCount: 0,
        topicCount: 0
      };
    }
  }

  private async collectImportantDialogueDigests(
    ctx: ResolvedConversationContext,
    db: RetrievalDbDeps
  ): Promise<ImportantDialogueDigest[]> {
    const recentDigests = buildRecentDialogueDigests(ctx.recentMessages);

    if (!ctx.workspaceId || !db.listRecentImportant) {
      return recentDigests.slice(0, IMPORTANT_DIGEST_LIMIT);
    }

    try {
      const recentImportantNotes = await db.listRecentImportant(ctx.workspaceId, 0.7, 14, IMPORTANT_MEMORY_DIGEST_LIMIT);
      return dedupeDigests([...recentDigests, ...buildImportantMemoryDigests(recentImportantNotes)]).slice(0, IMPORTANT_DIGEST_LIMIT);
    } catch (error) {
      console.warn(`${TAG} important digest recall failed:`, error instanceof Error ? error.message : error);
      return recentDigests.slice(0, IMPORTANT_DIGEST_LIMIT);
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
    const logPath = path.join(logDir, `sprite-spontaneous-utterances-${localDateStamp()}.jsonl`);
    await fs.mkdir(logDir, { recursive: true });
    await fs.appendFile(logPath, `${JSON.stringify(payload)}\n`, 'utf-8');
  }
}
