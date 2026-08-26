/**
 * Memory Auto-Recall Service
 *
 * 在每次对话回复前，自动检索相关记忆并注入到对话上下文中。
 *
 * findRelevantMemories 机制：
 * - 扫描记忆文件头（name + description），用 Sonnet 选最相关的 5 个
 * - 复用已有的 6 阶段检索流水线，由 AI 评估最优搜索关键词
 *
 * 核心流程（3 阶段）:
 *   1. 规则分诊（Rule-based Triage）— 快速跳过无需记忆的消息（问候、感谢等）
 *   2. 关键词提取（Keyword Extraction）— AI 评估是否需要搜索记忆 + 提取最优关键词；
 *      若 AI 不可用或已禁用，降级为规则提取
 *   3. 结构化检索 + 上下文组装 — 复用 searchWithContent()（FTS + 主题图谱 + 定点读取）
 *
 * 性能设计:
 *   - 每个对话维护一个召回缓存，避免同一对话反复搜索
 *   - AI 关键词提取使用 maxTokens=256 的轻量调用（~100ms 级别）
 *   - 规则分诊在 0ms 内完成，大部分无关消息直接跳过
 *   - 缓存 TTL 30 分钟，同一对话默认每 3 轮才重新检索
 *
 * 集成方式:
 *   通过 SystemPromptEnricher 注册，在 buildPiContext() 阶段自动注入。
 *   由 electron/main/handlers/memory/ipc-main.ts 提供 DB 依赖和 chatFn。
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import type { ChatMessage } from '../types';
import { analyzeQuery, type RetrievalDbDeps, searchWithContent } from './memory-retrieval-service';
import { logMemoryTrace, shortTraceId } from './memory-trace';
import type { MemoryChatFn, MemoryUsageEvent } from './memory-types';

// ━━ Types ━━

export interface AutoRecallConfig {
  /** 是否启用自动记忆召回 */
  enabled: boolean;
  /** 召回上下文的最大字符预算 */
  maxContextChars: number;
  /** 同一对话中两次召回之间的最小轮次间隔 */
  recallInterval: number;
  /** 是否使用 AI 提取关键词（false 则降级为纯规则提取） */
  useLlmKeywords: boolean;
}

export const DEFAULT_AUTO_RECALL_CONFIG: AutoRecallConfig = {
  enabled: true,
  maxContextChars: 3000,
  recallInterval: 3,
  useLlmKeywords: true
};

export interface AutoRecallDeps {
  db: RetrievalDbDeps;
  /** 用于 AI 关键词提取的轻量聊天函数（可选，缺失时降级为规则提取） */
  chatFn?: MemoryChatFn;
  /** 记录真实 provider usage（可选） */
  onUsageEvent?: (event: MemoryUsageEvent) => void | Promise<void>;
  /** 获取当前工作区 ID */
  getWorkspaceId: () => Promise<string | undefined>;
  /** 配置覆盖 */
  config?: Partial<AutoRecallConfig>;
}

export interface AutoRecallResult {
  /** 组装后的记忆上下文文本（注入到 system prompt） */
  context: string;
  /** 实际使用的搜索关键词 */
  keywords: string[];
  /** 匹配的记忆笔记数量 */
  noteCount: number;
  /** 是否跳过了召回 */
  skipped: boolean;
  /** 跳过原因 */
  skipReason?: string;
}

type AutoRecallUsageContext = Pick<MemoryUsageEvent, 'metadata' | 'operationKey' | 'usageStage'> & {
  onUsageEvent?: (event: MemoryUsageEvent) => void | Promise<void>;
};

// ━━ Conversation Recall Cache ━━

interface RecallCacheEntry {
  result: AutoRecallResult;
  messageCount: number;
  timestamp: number;
}

const recallCache = new Map<string, RecallCacheEntry>();
const MAX_CACHE_SIZE = 50;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ━━ Stage 1: Rule-based Triage ━━

/**
 * 快速跳过明显无需记忆检索的消息。
 * 设计原则：宁可多搜（false negative 可接受），不可漏搜（false positive 不可接受）。
 */
const SKIP_PATTERNS = [
  /^(hi|hello|hey|你好|嗨|哈喽|早|晚上好|早安|晚安|morning|afternoon|evening)\s*[!！.。~]?\s*$/i,
  /^(thanks|thank you|谢谢|感谢|thx|ty)\s*[!！.。~]?\s*$/i,
  /^(ok|好的|好|行|嗯|嗯嗯|明白|知道了|了解|收到|roger|got it|sure|okay)\s*[!！.。~]?\s*$/i,
  /^(bye|goodbye|再见|拜拜|回头见)\s*[!！.。~]?\s*$/i,
  /^(继续|接着|go on|continue|next)\s*[!！.。]?\s*$/i
];

/** 显式引用过去对话/记忆的信号词 */
const MEMORY_HINT_PATTERNS = [
  /之前|上次|以前|过去|earlier|previously|last time|remember|记得|回忆|提到过|说过|聊过|讨论过/i,
  /我的偏好|我的习惯|我喜欢|我不喜欢|my preference|i prefer|i like|i don't like/i,
  /一直以来|通常|我们之前|we discussed|we talked|you mentioned|你说过|你提过/i
];

export function shouldAttemptRecall(messages: ChatMessage[], config: AutoRecallConfig): { should: boolean; reason: string } {
  if (!config.enabled) {
    return { should: false, reason: 'disabled' };
  }

  const userMessages = messages.filter((m) => m.role === 'user');
  if (userMessages.length === 0) {
    return { should: false, reason: 'no_user_message' };
  }

  const lastUserMsg = userMessages[userMessages.length - 1];
  const content = typeof lastUserMsg.content === 'string' ? lastUserMsg.content : '';

  if (!content.trim()) {
    return { should: false, reason: 'empty_message' };
  }
  if (content.trim().length < 3) {
    return { should: false, reason: 'too_short' };
  }

  // Skip greetings/pleasantries
  for (const pattern of SKIP_PATTERNS) {
    if (pattern.test(content.trim())) {
      return { should: false, reason: 'greeting_or_pleasantry' };
    }
  }

  return { should: true, reason: 'proceed' };
}

// ━━ Stage 2: Keyword Extraction ━━

/**
 * AI 关键词提取 Prompt
 *
 * 设计要点：
 * - 输出 JSON 格式，方便解析
 * - needsRecall 判断是否真的需要记忆（避免不必要的搜索）
 * - keywords 提取 2-5 个搜索关键词（名词/实体/技术术语为主）
 * - 中英文都支持，关键词可混合语言
 */
const KEYWORD_EXTRACTION_PROMPT = `You are a memory recall assistant for an AI desktop assistant. Given the user's current message and recent conversation context, determine:

1. Whether searching long-term memory would help provide a better response
2. If yes, extract the most effective search keywords

Output ONLY valid JSON in this exact format (no markdown, no explanation):
{"needsRecall": true, "reasoning": "brief reason", "keywords": ["keyword1", "keyword2"]}

Guidelines:
- needsRecall=true: message references past conversations, user preferences, personal info, ongoing projects, previously discussed decisions, or the user's identity/background
- needsRecall=true: first message in a new conversation (to load user context and preferences)
- needsRecall=false: pure greetings, math/logic puzzles, general knowledge questions, or self-contained code/technical questions with no personal context
- Extract 2-5 keywords: prefer specific nouns, proper names, technical terms, project names
- Do NOT use verbs, adjectives, or generic words as keywords
- Include both Chinese and English variants if the topic might be stored in either language`;

export async function extractRecallKeywords(
  userMessage: string,
  recentContext: string,
  chatFn: MemoryChatFn,
  signal?: AbortSignal,
  usageContext?: AutoRecallUsageContext
): Promise<{ needsRecall: boolean; keywords: string[]; reasoning?: string }> {
  const prompt = `${KEYWORD_EXTRACTION_PROMPT}

Recent conversation:
${recentContext || '(new conversation, this is the first message)'}

User's current message:
${userMessage}`;

  try {
    const response = await runAutoRecallChat(chatFn, prompt, signal, usageContext);

    // Parse JSON from response (tolerant of wrapping text/markdown)
    const jsonMatch = response.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      console.warn('[AutoRecall] LLM returned non-JSON response, falling back to rule-based');
      return { needsRecall: true, keywords: [] };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      needsRecall: !!parsed.needsRecall,
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.filter((k: any) => typeof k === 'string' && k.trim().length > 0) : [],
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : undefined
    };
  } catch (e) {
    console.warn('[AutoRecall] LLM keyword extraction failed, falling back to rule-based:', e instanceof Error ? e.message : e);
    // 降级：假设需要搜索，使用规则提取关键词
    return { needsRecall: true, keywords: [] };
  }
}

async function emitAutoRecallUsage(chatFn: MemoryChatFn, usageContext?: AutoRecallUsageContext): Promise<void> {
  if (!usageContext?.onUsageEvent) {
    return;
  }

  const invocation = chatFn.consumeLastInvocation?.();
  if (!invocation) {
    return;
  }

  await usageContext.onUsageEvent({
    ...invocation,
    metadata: usageContext.metadata,
    operationKey: usageContext.operationKey,
    usageStage: usageContext.usageStage
  });
}

async function runAutoRecallChat(chatFn: MemoryChatFn, prompt: string, signal?: AbortSignal, usageContext?: AutoRecallUsageContext): Promise<string> {
  try {
    const response = await chatFn(prompt, signal);
    await emitAutoRecallUsage(chatFn, usageContext);
    return response;
  } catch (error) {
    await emitAutoRecallUsage(chatFn, usageContext);
    throw error;
  }
}

/**
 * 规则关键词提取（降级方案）
 * 从用户消息中提取可能的搜索词，过滤停用词。
 */
const RULE_STOP_WORDS = new Set([
  // Chinese
  '我',
  '你',
  '他',
  '她',
  '它',
  '我们',
  '你们',
  '他们',
  '的',
  '了',
  '吗',
  '呢',
  '吧',
  '啊',
  '哦',
  '嗯',
  '是',
  '在',
  '有',
  '没有',
  '不',
  '也',
  '都',
  '就',
  '什么',
  '哪些',
  '怎么',
  '如何',
  '这',
  '那',
  '一个',
  '和',
  '与',
  '或',
  '请',
  '帮',
  '告诉',
  '回答',
  '可以',
  '能',
  '想',
  '要',
  '会',
  '做',
  '让',
  '给',
  '把',
  '被',
  '对',
  '到',
  '从',
  '过',
  '着',
  '地',
  '得',
  // English
  'i',
  'me',
  'my',
  'you',
  'your',
  'we',
  'us',
  'our',
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'what',
  'which',
  'who',
  'how',
  'about',
  'have',
  'has',
  'had',
  'do',
  'did',
  'does',
  'can',
  'could',
  'would',
  'should',
  'will',
  'shall',
  'may',
  'might',
  'this',
  'that',
  'these',
  'those',
  'it',
  'its',
  'with',
  'for',
  'from',
  'of',
  'on',
  'in',
  'at',
  'to',
  'by',
  'and',
  'or',
  'but',
  'not',
  'if',
  'then',
  'so',
  'just',
  'also',
  'too',
  'very',
  'much',
  'more',
  'some',
  'any',
  'all',
  'each',
  'every',
  'no',
  'yes',
  'please',
  'help',
  'tell',
  'want',
  'need',
  'know',
  'think',
  'make'
]);

export function extractKeywordsFromMessage(content: string): string[] {
  const tokens = content
    .replace(/[，。！？、；：""''（）【】《》\n\r\t]/g, ' ')
    .split(/[\s,;:!?]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1)
    .filter((t) => !RULE_STOP_WORDS.has(t.toLowerCase()));

  return [...new Set(tokens)].slice(0, 8);
}

// ━━ Stage 3: Search + Context Assembly ━━

/**
 * 执行自动记忆召回。
 *
 * @param messages - 当前对话的消息列表（包含最新的用户消息）
 * @param deps - 依赖注入（DB、chatFn、workspaceId）
 * @param conversationId - 对话 ID（用于缓存，可选）
 * @param signal - AbortSignal（用于取消 LLM 调用）
 */
export async function performAutoRecall(messages: ChatMessage[], deps: AutoRecallDeps, conversationId?: string, signal?: AbortSignal): Promise<AutoRecallResult> {
  const TAG = '[AutoRecall] 🧠🔍';
  const config: AutoRecallConfig = { ...DEFAULT_AUTO_RECALL_CONFIG, ...deps.config };
  const conversationKey = shortTraceId(conversationId);
  const userMessageCount = messages.filter((m) => m.role === 'user').length;

  // ─── Stage 1: Triage ───
  const triage = shouldAttemptRecall(messages, config);
  if (!triage.should) {
    console.log(`${TAG} Stage 1 triage: skipped (${triage.reason})`);
    logMemoryTrace({
      conversationId: conversationKey,
      event: 'auto_recall.triage.skip',
      messageCount: messages.length,
      reason: triage.reason,
      userMessageCount
    });
    return { context: '', keywords: [], noteCount: 0, skipped: true, skipReason: triage.reason };
  }
  console.log(`${TAG} Stage 1 triage: proceed`);
  logMemoryTrace({
    conversationId: conversationKey,
    event: 'auto_recall.triage.proceed',
    messageCount: messages.length,
    userMessageCount
  });

  // ─── Cache check ───
  if (conversationId) {
    const cached = recallCache.get(conversationId);
    if (cached) {
      const turnsSinceRecall = userMessageCount - cached.messageCount;
      const isExpired = Date.now() - cached.timestamp > CACHE_TTL_MS;

      // 在间隔轮次内复用缓存，除非用户显式引用了记忆
      if (turnsSinceRecall < config.recallInterval && !isExpired) {
        const lastUserMsg = messages.filter((m) => m.role === 'user').pop();
        const content = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : '';
        const hasMemoryHint = MEMORY_HINT_PATTERNS.some((p) => p.test(content));

        if (!hasMemoryHint) {
          console.log(`${TAG} Cache hit for conv=${conversationId?.slice(0, 8)} (turnsSince=${turnsSinceRecall})`);
          logMemoryTrace({
            cacheAgeMs: Date.now() - cached.timestamp,
            conversationId: conversationKey,
            event: 'auto_recall.cache.hit',
            reason: 'interval_reuse',
            turnsSinceRecall,
            userMessageCount
          });
          return cached.result;
        }
      }
    }
  }

  // ─── Workspace check ───
  const workspaceId = await deps.getWorkspaceId();
  if (!workspaceId) {
    console.log(`${TAG} Skipped: no workspace ID available`);
    logMemoryTrace({
      conversationId: conversationKey,
      event: 'auto_recall.workspace.missing',
      messageCount: messages.length,
      userMessageCount
    });
    return { context: '', keywords: [], noteCount: 0, skipped: true, skipReason: 'no_workspace' };
  }
  logMemoryTrace({
    conversationId: conversationKey,
    event: 'auto_recall.workspace.resolved',
    userMessageCount,
    workspaceId: shortTraceId(workspaceId)
  });

  // ─── New Session Preload: 新会话首轮自动注入近期高重要度记忆 ───
  const userMessages = messages.filter((m) => m.role === 'user');
  if (userMessages.length <= 1 && deps.db.listRecentImportant) {
    console.log(`${TAG} New session detected (userMessages=${userMessages.length}), preloading recent important memories`);
    logMemoryTrace({
      conversationId: conversationKey,
      event: 'auto_recall.preload.start',
      thresholdDays: 7,
      thresholdImportance: 0.7,
      userMessageCount
    });
    try {
      // Load critical facts from MEMORY.md (always-loaded layer)
      let criticalFactsBlock = '';
      if (deps.db.getWorkspaceRoot) {
        const wsRoot = await deps.db.getWorkspaceRoot(workspaceId);
        if (wsRoot) {
          const alwaysLoaded = await loadAlwaysLoadedMemory(wsRoot);
          const facts = formatAlwaysLoadedMemoryContext(alwaysLoaded);
          if (facts) {
            criticalFactsBlock = `长期关键记忆：\n${facts}`;
            logMemoryTrace({
              alwaysLoadedSectionCount: countAlwaysLoadedSections(alwaysLoaded),
              conversationId: conversationKey,
              criticalFactsChars: facts.length,
              event: 'auto_recall.preload.critical_facts'
            });
          }
        }
      }

      const recentNotes = await deps.db.listRecentImportant(workspaceId, 0.7, 7, 5);
      if (recentNotes.length > 0) {
        const summaries = recentNotes
          .map((n) => {
            let topicStr = '';
            try {
              const parsed = typeof n.topics === 'string' ? JSON.parse(n.topics) : n.topics;
              if (Array.isArray(parsed) && parsed.length) topicStr = ` [${parsed.join(', ')}]`;
            } catch {
              /* ignore */
            }
            return `- (${n.date}${topicStr}) ${n.summary || '(no summary)'}`;
          })
          .join('\n');
        const recentBlock = `近期重要记忆摘要（最近 7 天，重要度 ≥ 0.7）：\n${summaries}`;
        const preloadContext = criticalFactsBlock ? `${criticalFactsBlock}\n\n${recentBlock}` : recentBlock;

        const result: AutoRecallResult = {
          context: preloadContext,
          keywords: [],
          noteCount: recentNotes.length,
          skipped: false
        };
        if (conversationId) {
          updateCache(conversationId, result, userMessages.length);
        }
        console.log(`${TAG} Preloaded ${recentNotes.length} recent important notes`);
        logMemoryTrace({
          contextChars: preloadContext.length,
          conversationId: conversationKey,
          event: 'auto_recall.preload.hit',
          noteCount: recentNotes.length,
          userMessageCount
        });
        return result;
      }
      console.log(`${TAG} No recent important notes found, falling through to keyword search`);
      logMemoryTrace({
        conversationId: conversationKey,
        event: 'auto_recall.preload.miss',
        userMessageCount
      });
      // Even without recent notes, inject critical facts if available
      if (criticalFactsBlock) {
        const result: AutoRecallResult = {
          context: criticalFactsBlock,
          keywords: [],
          noteCount: 0,
          skipped: false
        };
        if (conversationId) {
          updateCache(conversationId, result, userMessages.length);
        }
        console.log(`${TAG} Injecting critical facts only (no recent notes)`);
        logMemoryTrace({
          contextChars: criticalFactsBlock.length,
          conversationId: conversationKey,
          event: 'auto_recall.preload.critical_facts_only',
          userMessageCount
        });
        return result;
      }
    } catch (err) {
      console.warn(`${TAG} Session preload failed, falling through:`, err);
      logMemoryTrace(
        {
          conversationId: conversationKey,
          error: err instanceof Error ? err.message : String(err),
          event: 'auto_recall.preload.error',
          userMessageCount
        },
        'warn'
      );
    }
  }

  // ─── Stage 2: Keyword Extraction ───
  const lastUserMsg = userMessages[userMessages.length - 1];
  const userContent = typeof lastUserMsg.content === 'string' ? lastUserMsg.content : '';

  let keywords: string[] = [];
  let needsRecall = true;

  if (config.useLlmKeywords && deps.chatFn) {
    // 构建近几轮对话上下文（限制长度，降低 token 消耗）
    const recentMsgs = messages
      .slice(-6)
      .map((m) => {
        const c = typeof m.content === 'string' ? m.content : '';
        return `${m.role}: ${c.slice(0, 200)}`;
      })
      .join('\n');

    console.log(`${TAG} Extracting keywords via LLM...`);
    logMemoryTrace({
      conversationId: conversationKey,
      event: 'auto_recall.keywords.llm.start',
      recentContextChars: recentMsgs.length,
      userMessageCount
    });
    const llmResult = await extractRecallKeywords(userContent, recentMsgs, deps.chatFn, signal, {
      metadata: {
        conversationId: conversationId || null,
        memoryRecallMode: 'auto',
        recentContextChars: recentMsgs.length,
        userMessageChars: userContent.length
      },
      onUsageEvent: deps.onUsageEvent,
      operationKey: 'keyword_extraction',
      usageStage: 'analyze'
    });
    needsRecall = llmResult.needsRecall;
    keywords = llmResult.keywords;

    if (!needsRecall) {
      console.log(`${TAG} LLM says no recall needed: ${llmResult.reasoning || '(no reason)'}`);
      logMemoryTrace({
        conversationId: conversationKey,
        event: 'auto_recall.keywords.llm.skip',
        reason: llmResult.reasoning || 'not_relevant',
        userMessageCount
      });
      const result: AutoRecallResult = {
        context: '',
        keywords: [],
        noteCount: 0,
        skipped: true,
        skipReason: `llm_skip: ${llmResult.reasoning || 'not relevant'}`
      };
      if (conversationId) {
        updateCache(conversationId, result, userMessages.length);
      }
      return result;
    }
    console.log(`${TAG} LLM keywords: [${keywords.join(', ')}] (reason: ${llmResult.reasoning || '-'})`);
    logMemoryTrace({
      conversationId: conversationKey,
      event: 'auto_recall.keywords.llm.result',
      keywordCount: keywords.length,
      keywords,
      reason: llmResult.reasoning || '-',
      userMessageCount
    });
  }

  // 降级：规则提取
  if (keywords.length === 0) {
    keywords = extractKeywordsFromMessage(userContent);
    console.log(`${TAG} Rule-based keywords: [${keywords.join(', ')}]`);
    logMemoryTrace({
      conversationId: conversationKey,
      event: 'auto_recall.keywords.rule.result',
      keywordCount: keywords.length,
      keywords,
      userMessageCount
    });
  }

  if (keywords.length === 0) {
    logMemoryTrace({
      conversationId: conversationKey,
      event: 'auto_recall.keywords.empty',
      userMessageCount
    });
    const result: AutoRecallResult = {
      context: '',
      keywords: [],
      noteCount: 0,
      skipped: true,
      skipReason: 'no_keywords'
    };
    if (conversationId) {
      updateCache(conversationId, result, userMessages.length);
    }
    return result;
  }

  // ─── Stage 3: Search ───
  const searchQuery = keywords.join(' ');
  const baseAnalysis = analyzeQuery(userContent);
  const recallAnalysis = {
    ...baseAnalysis,
    originalQuery: searchQuery,
    topicTerms: [...keywords],
    keywordTerms: [...keywords],
    broadRecall: keywords.length === 0 ? baseAnalysis.broadRecall : false
  };

  // 如果有 chatFn，创建 LLM 查询分析器增强搜索
  // Reuse the analysis prepared above so auto-recall does not pay for a second query-analysis pass.

  try {
    console.log(`${TAG} Searching memories: query="${searchQuery}", ws=${workspaceId?.slice(0, 8)}`);
    const searchStartedAt = Date.now();
    logMemoryTrace({
      conversationId: conversationKey,
      event: 'auto_recall.search.start',
      keywordCount: keywords.length,
      keywords,
      query: searchQuery,
      userMessageCount,
      workspaceId: shortTraceId(workspaceId)
    });

    // 使用 searchWithContent 执行 Stage 1-6 完整流水线（含元数据）
    const searchResult = await searchWithContent(searchQuery, workspaceId, deps.db, config.maxContextChars, {
      analysis: recallAnalysis
    });

    const { context, noteCount, topicCount } = searchResult;
    console.log(`${TAG} Found ${noteCount} notes, ${topicCount} topics` + (context ? `, context=${context.length} chars` : ', no context content'));
    logMemoryTrace({
      contextChars: context?.length || 0,
      conversationId: conversationKey,
      durationMs: Date.now() - searchStartedAt,
      event: 'auto_recall.search.result',
      keywordCount: keywords.length,
      noteCount,
      topicCount,
      userMessageCount
    });

    const result: AutoRecallResult = {
      context: context || '',
      keywords,
      noteCount,
      skipped: false
    };

    if (conversationId) {
      updateCache(conversationId, result, userMessages.length);
    }

    return result;
  } catch (e) {
    console.error(`${TAG} Search failed:`, e instanceof Error ? e.message : e);
    logMemoryTrace(
      {
        conversationId: conversationKey,
        error: e instanceof Error ? e.message : String(e),
        event: 'auto_recall.search.error',
        keywordCount: keywords.length,
        keywords,
        userMessageCount
      },
      'error'
    );
    return { context: '', keywords, noteCount: 0, skipped: true, skipReason: 'search_error' };
  }
}

// ━━ Cache Management ━━

function updateCache(conversationId: string, result: AutoRecallResult, messageCount: number): void {
  // Evict old entries when cache is full
  if (recallCache.size >= MAX_CACHE_SIZE) {
    const oldest = [...recallCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < Math.floor(MAX_CACHE_SIZE / 4); i++) {
      recallCache.delete(oldest[i][0]);
    }
  }
  recallCache.set(conversationId, { result, messageCount, timestamp: Date.now() });
}

/** 清除指定对话或全部的召回缓存 */
export function clearRecallCache(conversationId?: string): void {
  if (conversationId) {
    recallCache.delete(conversationId);
  } else {
    recallCache.clear();
  }
}

// ━━ Critical Facts Loader ━━

/**
 * 从 MEMORY.md 中的 "## Critical Facts" 段落加载关键事实摘要。
 *
 * 这些是最稳定的 ongoing/decision/principle 回忆线索，
 * 会在每次新对话时注入，让 AI 从第一个 token 就了解用户。
 *
 * 设计：
 * - 读取 MEMORY.md，提取 ## Critical Facts 到下一个 ## 之间的内容
 * - 5 分钟缓存，避免每次对话都读磁盘
 * - 如果文件不存在或无 Critical Facts 段落，返回空字符串
 */

type AlwaysLoadedMemoryKey = 'criticalFacts' | 'userPreferences' | 'activeProjects';

export interface AlwaysLoadedMemorySections {
  criticalFacts: string;
  userPreferences: string;
  activeProjects: string;
}

const ALWAYS_LOADED_SECTION_SPECS: Array<{ heading: string; key: AlwaysLoadedMemoryKey }> = [
  { heading: 'Critical Facts', key: 'criticalFacts' },
  { heading: 'User Preferences', key: 'userPreferences' },
  { heading: 'Active Projects', key: 'activeProjects' }
];

const ALWAYS_LOADED_MEMORY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const alwaysLoadedMemoryCache = new Map<string, { content: AlwaysLoadedMemorySections; loadedAt: number }>();

function createEmptyAlwaysLoadedMemory(): AlwaysLoadedMemorySections {
  return {
    criticalFacts: '',
    userPreferences: '',
    activeProjects: ''
  };
}

function extractMemorySection(content: string, heading: string): string {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return content.match(new RegExp(`^##\\s+${escapedHeading}\\s*$\\n([\\s\\S]*?)(?=^##\\s+|\\n*$)`, 'm'))?.[1]?.trim() ?? '';
}

function countAlwaysLoadedSections(sections: AlwaysLoadedMemorySections): number {
  return ALWAYS_LOADED_SECTION_SPECS.reduce((count, section) => count + (sections[section.key] ? 1 : 0), 0);
}

function formatAlwaysLoadedMemoryContext(sections: AlwaysLoadedMemorySections): string {
  return ALWAYS_LOADED_SECTION_SPECS.map((section) => (sections[section.key] ? `## ${section.heading}\n${sections[section.key]}` : ''))
    .filter(Boolean)
    .join('\n\n');
}

export async function loadAlwaysLoadedMemory(workspaceRoot: string): Promise<AlwaysLoadedMemorySections> {
  const cached = alwaysLoadedMemoryCache.get(workspaceRoot);
  if (cached && Date.now() - cached.loadedAt < ALWAYS_LOADED_MEMORY_CACHE_TTL_MS) {
    return cached.content;
  }

  try {
    const memoryMdPath = path.join(workspaceRoot, 'memory', 'MEMORY.md');
    const content = await fs.readFile(memoryMdPath, 'utf-8');
    const sections = createEmptyAlwaysLoadedMemory();

    for (const section of ALWAYS_LOADED_SECTION_SPECS) {
      sections[section.key] = extractMemorySection(content, section.heading);
    }

    alwaysLoadedMemoryCache.set(workspaceRoot, { content: sections, loadedAt: Date.now() });
    return sections;
  } catch {
    const emptySections = createEmptyAlwaysLoadedMemory();
    alwaysLoadedMemoryCache.set(workspaceRoot, { content: emptySections, loadedAt: Date.now() });
    return emptySections;
  }
}

export async function loadCriticalFacts(workspaceRoot: string): Promise<string> {
  return (await loadAlwaysLoadedMemory(workspaceRoot)).criticalFacts;

  /*
  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const memoryMdPath = path.join(workspaceRoot, 'memory', 'MEMORY.md');
    const content = await fs.readFile(memoryMdPath, 'utf-8');

    // Extract ## Critical Facts section
    const sectionMatch = content.match(/^## Critical Facts\s*\n([\s\S]*?)(?=^## |\n*$)/m);
    if (!sectionMatch || !sectionMatch[1].trim()) {
      criticalFactsCache = { content: '', loadedAt: Date.now() };
      return '';
    }

    const facts = sectionMatch[1].trim();
    criticalFactsCache = { content: facts, loadedAt: Date.now() };
    return facts;
  } catch {
    // File doesn't exist yet or read error — not a problem
    criticalFactsCache = { content: '', loadedAt: Date.now() };
    return '';
  }
  */
}

/** Clear the critical facts cache (e.g. after MEMORY.md regeneration) */
export function clearCriticalFactsCache(): void {
  alwaysLoadedMemoryCache.clear();
}

// ━━ Prefetch API ━━

/**
 * 预取句柄 — 借鉴 claude-code 的 prefetch 模式。
 *
 * 允许在 chatStream 入口处提前启动记忆搜索，
 * 当 enricher 的 resolve() 被调用时直接 await 已经在运行的 promise，
 * 从而将记忆检索延迟与 preview / model 加载并行。
 */
export interface AutoRecallPrefetch {
  /** 异步结果 promise */
  promise: Promise<AutoRecallResult>;
  /** 完成时间戳（null 表示仍在进行） */
  settledAt: number | null;
  /** 中止控制器 */
  abort: () => void;
}

/**
 * 启动记忆召回预取。
 *
 * 不会阻塞调用方 — 返回一个句柄，可以在后续 await。
 * 如果预取已在进行（同一 conversationId），复用已有 promise。
 */
const activePrefetches = new Map<string, AutoRecallPrefetch>();

export function startAutoRecallPrefetch(messages: ChatMessage[], deps: AutoRecallDeps, conversationId?: string): AutoRecallPrefetch | undefined {
  // 如果已有同一对话的 prefetch 且仍在运行，复用
  if (conversationId && activePrefetches.has(conversationId)) {
    const existing = activePrefetches.get(conversationId)!;
    if (!existing.settledAt) {
      logMemoryTrace({
        conversationId: shortTraceId(conversationId),
        event: 'auto_recall.prefetch.reuse'
      });
      return existing;
    }
    // 已完成的旧 prefetch — 清理后重新启动
    activePrefetches.delete(conversationId);
  }

  const controller = new AbortController();
  const firedAt = Date.now();

  const promise = performAutoRecall(messages, deps, conversationId, controller.signal).catch((e) => {
    if (e?.name !== 'AbortError') {
      console.warn('[AutoRecall:Prefetch] Failed:', e instanceof Error ? e.message : e);
    }
    return { context: '', keywords: [], noteCount: 0, skipped: true, skipReason: 'prefetch_error' } as AutoRecallResult;
  });

  const handle: AutoRecallPrefetch = {
    promise,
    settledAt: null,
    abort: () => controller.abort()
  };

  void promise.finally(() => {
    handle.settledAt = Date.now();
    console.log(`[AutoRecall:Prefetch] Settled in ${Date.now() - firedAt}ms`);
    logMemoryTrace({
      conversationId: shortTraceId(conversationId),
      durationMs: Date.now() - firedAt,
      event: 'auto_recall.prefetch.settled'
    });
    // 自动清理已完成的 prefetch（延迟 5s，给 enricher resolve 留时间）
    if (conversationId) {
      setTimeout(() => {
        const cur = activePrefetches.get(conversationId);
        if (cur === handle) activePrefetches.delete(conversationId);
      }, 5000);
    }
  });

  if (conversationId) {
    activePrefetches.set(conversationId, handle);
  }
  logMemoryTrace({
    conversationId: shortTraceId(conversationId),
    event: 'auto_recall.prefetch.started',
    messageCount: messages.length
  });

  return handle;
}

/**
 * 直接注册一个 prefetch handle（由外部构建 promise）。
 *
 * 与 startAutoRecallPrefetch 不同，此函数允许调用方自行构建 promise
 * 并立即（同步地）注册到 activePrefetches map 中，避免异步 deps 构建
 * 导致的注册延迟 / 竞态条件。
 */
export function registerPrefetch(conversationId: string, promise: Promise<AutoRecallResult>): AutoRecallPrefetch {
  // 如果已有同一对话的 prefetch 且仍在运行，复用
  if (activePrefetches.has(conversationId)) {
    const existing = activePrefetches.get(conversationId)!;
    if (!existing.settledAt) {
      logMemoryTrace({
        conversationId: shortTraceId(conversationId),
        event: 'auto_recall.prefetch.reuse'
      });
      return existing;
    }
    activePrefetches.delete(conversationId);
  }

  const firedAt = Date.now();
  const controller = new AbortController();

  const handle: AutoRecallPrefetch = {
    promise,
    settledAt: null,
    abort: () => controller.abort()
  };

  void promise.finally(() => {
    handle.settledAt = Date.now();
    console.log(`[AutoRecall:Prefetch] Settled in ${Date.now() - firedAt}ms`);
    logMemoryTrace({
      conversationId: shortTraceId(conversationId),
      durationMs: Date.now() - firedAt,
      event: 'auto_recall.prefetch.settled'
    });
    if (conversationId) {
      setTimeout(() => {
        const cur = activePrefetches.get(conversationId);
        if (cur === handle) activePrefetches.delete(conversationId);
      }, 5000);
    }
  });

  activePrefetches.set(conversationId, handle);
  logMemoryTrace({
    conversationId: shortTraceId(conversationId),
    event: 'auto_recall.prefetch.registered'
  });
  return handle;
}

/**
 * 获取已启动的预取句柄（如果存在）。
 */
export function getActivePrefetch(conversationId: string): AutoRecallPrefetch | undefined {
  return activePrefetches.get(conversationId);
}
