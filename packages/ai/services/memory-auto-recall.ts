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

import type { ChatMessage } from '../types';
import type { RetrievalDbDeps } from './memory-retrieval-service';
import type { MemoryChatFn } from './memory-types';

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
  signal?: AbortSignal
): Promise<{ needsRecall: boolean; keywords: string[]; reasoning?: string }> {
  const prompt = `${KEYWORD_EXTRACTION_PROMPT}

Recent conversation:
${recentContext || '(new conversation, this is the first message)'}

User's current message:
${userMessage}`;

  try {
    const response = await chatFn(prompt, signal);

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
  const TAG = '[AutoRecall]';
  const config: AutoRecallConfig = { ...DEFAULT_AUTO_RECALL_CONFIG, ...deps.config };

  // ─── Stage 1: Triage ───
  const triage = shouldAttemptRecall(messages, config);
  if (!triage.should) {
    return { context: '', keywords: [], noteCount: 0, skipped: true, skipReason: triage.reason };
  }

  // ─── Cache check ───
  if (conversationId) {
    const cached = recallCache.get(conversationId);
    if (cached) {
      const messageCount = messages.filter((m) => m.role === 'user').length;
      const turnsSinceRecall = messageCount - cached.messageCount;
      const isExpired = Date.now() - cached.timestamp > CACHE_TTL_MS;

      // 在间隔轮次内复用缓存，除非用户显式引用了记忆
      if (turnsSinceRecall < config.recallInterval && !isExpired) {
        const lastUserMsg = messages.filter((m) => m.role === 'user').pop();
        const content = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : '';
        const hasMemoryHint = MEMORY_HINT_PATTERNS.some((p) => p.test(content));

        if (!hasMemoryHint) {
          console.log(`${TAG} Cache hit for conv=${conversationId?.slice(0, 8)} (turnsSince=${turnsSinceRecall})`);
          return cached.result;
        }
      }
    }
  }

  // ─── Workspace check ───
  const workspaceId = await deps.getWorkspaceId();
  if (!workspaceId) {
    return { context: '', keywords: [], noteCount: 0, skipped: true, skipReason: 'no_workspace' };
  }

  // ─── Stage 2: Keyword Extraction ───
  const userMessages = messages.filter((m) => m.role === 'user');
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
    const llmResult = await extractRecallKeywords(userContent, recentMsgs, deps.chatFn, signal);
    needsRecall = llmResult.needsRecall;
    keywords = llmResult.keywords;

    if (!needsRecall) {
      console.log(`${TAG} LLM says no recall needed: ${llmResult.reasoning || '(no reason)'}`);
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
  }

  // 降级：规则提取
  if (keywords.length === 0) {
    keywords = extractKeywordsFromMessage(userContent);
    console.log(`${TAG} Rule-based keywords: [${keywords.join(', ')}]`);
  }

  if (keywords.length === 0) {
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
  const { searchWithContent, search } = await import('./memory-retrieval-service');
  const searchQuery = keywords.join(' ');

  try {
    console.log(`${TAG} Searching memories: query="${searchQuery}", ws=${workspaceId?.slice(0, 8)}`);

    // 使用 searchWithContent 执行 Stage 1-6 完整流水线
    const context = await searchWithContent(searchQuery, workspaceId, deps.db, config.maxContextChars);

    // 同时获取结构化结果用于日志/元数据
    const searchResult = await search(searchQuery, workspaceId, deps.db, { maxResults: 5 });

    const noteCount = searchResult.notes.length;
    console.log(`${TAG} Found ${noteCount} notes, ${searchResult.topics.length} topics` + (context ? `, context=${context.length} chars` : ', no context content'));

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
