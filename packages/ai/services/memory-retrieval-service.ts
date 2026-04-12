/**
 * Memory Retrieval Service
 * 6 阶段检索流水线：Query Analysis → Topic Recall → Note Recall → Section Recall → Targeted Read → Context Assembly
 * 核心策略：结构化元数据过滤 + FTS5 全文检索 + 主题图谱扩展 + 渐进式定点读取。
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { formatMemoryDate, getRelativeMemoryDate } from './memory-date';
import { readLines } from './memory-note-parser';

// ━━ Types ━━

export interface QueryAnalysisResult {
  topicTerms: string[];
  entityTerms: string[];
  keywordTerms: string[];
  timeHint?: { type: 'recent' | 'range' | 'specific'; days?: number; start?: string; end?: string };
  actionHint?: 'recall' | 'decision' | 'open_loop' | 'evidence' | 'contradiction' | 'general';
  broadRecall?: boolean;
  originalQuery: string;
}

export interface TopicHit {
  id: string;
  label: string;
  heat: number;
  matchType: 'label' | 'alias' | 'keyword';
}

export interface TopicRecallResult {
  directHits: TopicHit[];
  expanded: Array<{ id: string; label: string; heat: number; depth: number }>;
  factNoteIds: string[];
  allTopicIds: string[];
}

export interface RetrievalScoreWeights {
  fts: number;
  graph: number;
  metadata: number;
  importance: number;
  recency: number;
  action: number;
}

export interface NoteScoreBreakdown {
  weights: RetrievalScoreWeights;
  raw: {
    fts: number;
    graph: number;
    metadata: number;
    importance: number;
    recency: number;
    action: number;
  };
  weighted: {
    fts: number;
    graph: number;
    metadata: number;
    importance: number;
    recency: number;
    action: number;
  };
  ageInDays: number;
  matchReasons: string[];
  finalScore: number;
}

export interface NoteCandidate {
  noteId: string;
  summary: string;
  date: string;
  importance: number;
  stability: number;
  topics: string[];
  keywords: string[];
  filePath?: string;
  workspaceId?: string;
  ftsScore: number;
  graphScore: number;
  metadataScore: number;
  matchReasons: string[];
  scoreBreakdown?: NoteScoreBreakdown;
  finalScore: number;
}

export interface NoteRecallResult {
  candidates: NoteCandidate[];
  totalFound: number;
}

export interface SectionCandidate {
  sectionId: string;
  noteId: string;
  heading: string;
  headingLevel: number;
  summary: string;
  lineStart: number;
  lineEnd: number;
  charCount: number;
  matchType: 'fts' | 'action_hint' | 'keyword';
  score: number;
}

export interface ReadSection {
  noteId: string;
  heading: string;
  content: string;
  lineStart: number;
  lineEnd: number;
  truncated: boolean;
}

export interface TargetedReadResult {
  sections: ReadSection[];
  totalCharsRead: number;
  budgetExhausted: boolean;
}

/** 统一搜索结果（给 Agent tool 用） */
export interface MemorySearchDebugNote {
  rank: number;
  noteId: string;
  date: string;
  topics: string[];
  summary: string;
  importance: number;
  stability: number;
  scoreBreakdown: NoteScoreBreakdown;
}

export interface MemorySearchDebugInfo {
  analysis: QueryAnalysisResult;
  weights: RetrievalScoreWeights;
  topicRecall: TopicRecallResult;
  noteRanking: MemorySearchDebugNote[];
}

export interface MemorySearchResult {
  topics: Array<{ label: string; heat: number }>;
  notes: Array<{
    id: string;
    date: string;
    topics: string[];
    summary: string;
    importance: number;
    sections?: Array<{ heading: string; summary: string }>;
    scoreBreakdown?: NoteScoreBreakdown;
  }>;
  totalFound: number;
  debug?: MemorySearchDebugInfo;
}

/** 精确读取结果 */
export interface MemoryGetResult {
  noteId: string;
  date: string;
  topics: string[];
  content?: string;
  heading?: string;
  lineRange?: { start: number; end: number };
  outline?: Array<{ heading: string; level: number; summary: string; charCount: number }>;
}

/** 主题浏览结果 */
export interface MemoryTopicsResult {
  topic?: { id: string; label: string; description?: string; heat: number; noteCount: number };
  children?: Array<{ id: string; label: string; heat: number; noteCount: number }>;
  related?: Array<{ id: string; label: string; heat: number; relationType: string }>;
  notes?: Array<{ id: string; date: string; summary: string; importance: number }>;
}

// ━━ DB Dependency Interface (注入，避免直接依赖 electron/main/db) ━━

export interface RetrievalDbDeps {
  // Topic
  searchTopics: (
    term: string,
    workspaceId?: string,
    limit?: number
  ) => Promise<Array<{ id: string; label: string; slug: string; heat: number; noteCount: number; aliases?: string | null; description?: string | null }>>;
  getTopicById: (id: string) => Promise<any>;
  listTopicChildren: (parentId: string) => Promise<any[]>;
  listTopicRoots: (workspaceId?: string, limit?: number) => Promise<any[]>;
  // Keyword → Topic
  findKeywordsByTopic: (topicId: string) => Promise<any[]>;
  findKeywordByCanonical: (canonical: string, workspaceId?: string) => Promise<any>;
  findKeywordByAlias: (alias: string, workspaceId?: string) => Promise<any[]>;
  // Edges
  findAdjacentTopics: (topicIds: string[], limit?: number) => Promise<any[]>;
  findEdgesBySource: (sourceType: string, sourceId: string, relationType?: string) => Promise<any[]>;
  // Entity facts (I-3: temporal KG)
  queryEntityFacts?: (entity: string, opts?: { asOf?: number; workspaceId?: string; limit?: number }) => Promise<any[]>;
  // Domain filtering (I-4)
  findTopicsByDomain?: (domain: string, workspaceId?: string, limit?: number) => Promise<any[]>;
  // Notes
  getNoteById: (id: string) => Promise<any>;
  listNotesByIds?: (ids: string[]) => Promise<any[]>;
  listNotesByWorkspace: (workspaceId: string, limit?: number, offset?: number) => Promise<any[]>;
  listNotesByDateRange: (start: string, end: string, workspaceId?: string) => Promise<any[]>;
  listNotesByTopicId: (topicId: string, workspaceId?: string, limit?: number) => Promise<any[]>;
  // Direct search (LIKE-based, for CJK fallback)
  searchNotesByTerms?: (terms: string[], workspaceId?: string, limit?: number) => Promise<any[]>;
  // Sections
  listSectionsByNote: (noteId: string) => Promise<any[]>;
  listSectionsByNoteIds?: (noteIds: string[]) => Promise<any[]>;
  // FTS
  ftsSearch: (query: string, opts?: { entryType?: 'note' | 'section'; noteIds?: string[]; limit?: number }) => Array<{ entry_id: string; entry_type: string; note_id: string; rank: number }>;
  // Workspace
  getWorkspaceRoot: (workspaceId: string) => Promise<string | null>;
  // Recent important notes (for new session preload)
  listRecentImportant?: (
    workspaceId: string,
    minImportance?: number,
    days?: number,
    limit?: number
  ) => Promise<Array<{ id: string; date: string; summary: string | null; importance: number; topics?: string }>>;
}

// ━━ Stop Words (filtered from search terms) ━━

const STOP_WORDS = new Set([
  // Chinese stop words
  '我',
  '你',
  '他',
  '她',
  '它',
  '我们',
  '你们',
  '他们',
  '我和你',
  '你和我',
  '咱们',
  '咱',
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
  '哪个',
  '怎么',
  '如何',
  '为何',
  '这',
  '那',
  '这些',
  '那些',
  '这个',
  '那个',
  '一些',
  '一下',
  '一个',
  '和',
  '与',
  '或',
  '及',
  '过',
  '话题',
  '内容',
  '东西',
  '事情',
  '事',
  // English stop words
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
  'does'
]);

// ━━ Stage 1: Query Analysis ━━

export function analyzeQuery(query: string): QueryAnalysisResult {
  const result: QueryAnalysisResult = {
    topicTerms: [],
    entityTerms: [],
    keywordTerms: [],
    originalQuery: query
  };

  let remaining = query;

  // 时间词提取
  const timePatterns: Array<{ regex: RegExp; type: 'recent' | 'specific'; days?: number }> = [
    { regex: /最近|近期|lately/i, type: 'recent', days: 7 },
    { regex: /上周|last\s*week/i, type: 'recent', days: 14 },
    { regex: /上个月|last\s*month/i, type: 'recent', days: 30 },
    { regex: /今天|today/i, type: 'recent', days: 1 },
    { regex: /昨天|yesterday/i, type: 'recent', days: 2 },
    { regex: /这周|this\s*week/i, type: 'recent', days: 7 }
  ];
  for (const tp of timePatterns) {
    if (tp.regex.test(remaining)) {
      result.timeHint = { type: tp.type, days: tp.days };
      remaining = remaining.replace(tp.regex, '').trim();
      break;
    }
  }
  // 具体日期
  const dateMatch = remaining.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (dateMatch) {
    const y = dateMatch[1];
    const m = dateMatch[2].padStart(2, '0');
    const d = dateMatch[3].padStart(2, '0');
    result.timeHint = { type: 'specific', start: `${y}-${m}-${d}`, end: `${y}-${m}-${d}` };
    remaining = remaining.replace(dateMatch[0], '').trim();
  }

  // 动作词提取
  const actionPatterns: Array<{ regex: RegExp; hint: QueryAnalysisResult['actionHint'] }> = [
    { regex: /矛盾|冲突|conflict|contradiction/i, hint: 'contradiction' },
    { regex: /聊过|聊了|讨论过|谈到|提到|mentioned|discussed/i, hint: 'recall' },
    { regex: /决定|定了|确认|decided|confirmed/i, hint: 'decision' },
    { regex: /待|要做|未完成|todo|pending|没做完/i, hint: 'open_loop' },
    { regex: /证据|依据|原因|为什么|evidence|why/i, hint: 'evidence' }
  ];
  for (const ap of actionPatterns) {
    if (ap.regex.test(remaining)) {
      result.actionHint = ap.hint;
      remaining = remaining.replace(ap.regex, '').trim();
      break;
    }
  }
  if (!result.actionHint) result.actionHint = 'general';

  // 剩余部分拆为关键词（按空格、逗号、顿号分割）
  const tokens = remaining
    .split(/[\s,，、;；]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .filter((t) => !STOP_WORDS.has(t));

  // 所有 token 同时作为 topicTerms 和 keywordTerms（由后续阶段区分）
  result.topicTerms = tokens;
  result.keywordTerms = tokens;

  // 广泛召回标记：当无有效搜索词时，标记为广泛召回（列出最近记忆）
  if (tokens.length === 0) {
    result.broadRecall = true;
  }

  return result;
}

// ━━ Stage 2: Topic Recall ━━

export async function recallTopics(analysis: QueryAnalysisResult, workspaceId: string, db: RetrievalDbDeps): Promise<TopicRecallResult> {
  const directHits: TopicHit[] = [];
  const hitTopicIds = new Set<string>();
  const factNoteIds = new Set<string>();
  const expanded: TopicRecallResult['expanded'] = [];
  const expandedTopicIds = new Set<string>();

  const addDirectHit = (topic: any, matchType: TopicHit['matchType']): void => {
    if (!topic?.id || hitTopicIds.has(topic.id)) {
      return;
    }
    hitTopicIds.add(topic.id);
    directHits.push({ id: topic.id, label: topic.label, heat: topic.heat ?? 0, matchType });
  };

  const addExpandedTopic = (topic: any, depth: number): void => {
    if (!topic?.id || hitTopicIds.has(topic.id) || expandedTopicIds.has(topic.id)) {
      return;
    }
    expandedTopicIds.add(topic.id);
    expanded.push({ id: topic.id, label: topic.label, heat: topic.heat ?? 0, depth });
  };

  // Step 2a: 直接匹配 topic (label/slug/aliases)
  const topicSearchTerms = dedupStrings([...analysis.topicTerms, ...analysis.entityTerms]);
  if (topicSearchTerms.length > 0) {
    const topicBatches = await Promise.all(topicSearchTerms.map((term) => db.searchTopics(term, workspaceId, 5)));
    for (const topics of topicBatches) {
      for (const topic of topics) {
        addDirectHit(topic, 'label');
      }
    }
  }

  // Step 2b: 关键词 → 主题
  const keywordTerms = dedupStrings(analysis.keywordTerms);
  if (keywordTerms.length > 0) {
    const [canonicalHits, aliasHitBatches] = await Promise.all([
      Promise.all(keywordTerms.map((term) => db.findKeywordByCanonical(term, workspaceId))),
      Promise.all(keywordTerms.map((term) => db.findKeywordByAlias(term, workspaceId)))
    ]);

    const orderedTopicMatches: Array<{ topicId: string; matchType: TopicHit['matchType'] }> = [];
    const seenKeywordTopicIds = new Set<string>();

    for (const keywordHit of canonicalHits) {
      const topicId = keywordHit?.primaryTopicId;
      if (!topicId || hitTopicIds.has(topicId) || seenKeywordTopicIds.has(topicId)) {
        continue;
      }
      seenKeywordTopicIds.add(topicId);
      orderedTopicMatches.push({ topicId, matchType: 'keyword' });
    }

    for (const aliasHits of aliasHitBatches) {
      for (const aliasHit of aliasHits) {
        const topicId = aliasHit?.primaryTopicId;
        if (!topicId || hitTopicIds.has(topicId) || seenKeywordTopicIds.has(topicId)) {
          continue;
        }
        seenKeywordTopicIds.add(topicId);
        orderedTopicMatches.push({ topicId, matchType: 'alias' });
      }
    }

    if (orderedTopicMatches.length > 0) {
      const resolvedTopics = await Promise.all(orderedTopicMatches.map((match) => db.getTopicById(match.topicId)));
      for (const [index, topic] of resolvedTopics.entries()) {
        if (topic) {
          addDirectHit(topic, orderedTopicMatches[index].matchType);
        }
      }
    }
  }
  for (const term of [] as string[]) {
    const kw = await db.findKeywordByCanonical(term, workspaceId);
    if (kw?.primaryTopicId && !hitTopicIds.has(kw.primaryTopicId)) {
      const topic = await db.getTopicById(kw.primaryTopicId);
      if (topic) {
        hitTopicIds.add(topic.id);
        directHits.push({ id: topic.id, label: topic.label, heat: topic.heat ?? 0, matchType: 'keyword' });
      }
    }
    // alias 匹配
    const aliasHits = await db.findKeywordByAlias(term, workspaceId);
    for (const ak of aliasHits) {
      if (ak?.primaryTopicId && !hitTopicIds.has(ak.primaryTopicId)) {
        const topic = await db.getTopicById(ak.primaryTopicId);
        if (topic) {
          hitTopicIds.add(topic.id);
          directHits.push({ id: topic.id, label: topic.label, heat: topic.heat ?? 0, matchType: 'alias' });
        }
      }
    }
  }

  // Step 2c: 图谱扩展（子主题 + 邻接主题，最多 1 层）
  if (hitTopicIds.size > 0) {
    const hitIds = Array.from(hitTopicIds);

    const childBatches = await Promise.all(hitIds.slice(0, 5).map((parentId) => db.listTopicChildren(parentId)));
    for (const children of childBatches) {
      for (const child of children.slice(0, 5)) {
        addExpandedTopic(child, 1);
      }
    }

    const adjacentEdges = await db.findAdjacentTopics(hitIds, 10);
    const adjacentTopicIds = dedupStrings(
      adjacentEdges
        .map((edge) => edge.targetId || edge.target_id)
        .filter((targetId) => targetId && !hitTopicIds.has(targetId) && !expandedTopicIds.has(targetId))
    );
    if (adjacentTopicIds.length > 0) {
      const adjacentTopics = await Promise.all(adjacentTopicIds.map((topicId) => db.getTopicById(topicId)));
      for (const topic of adjacentTopics) {
        addExpandedTopic(topic, 1);
      }
    }
  }

  const entityTerms = dedupStrings(analysis.entityTerms);
  if (db.findTopicsByDomain && entityTerms.length > 0) {
    const domainQueries = entityTerms.flatMap((term) => ['person', 'project'].map((prefix) => `${prefix}:${term}`));
    const domainTopicBatches = await Promise.all(domainQueries.map((domainKey) => db.findTopicsByDomain!(domainKey, workspaceId, 5)));
    for (const domainTopics of domainTopicBatches) {
      for (const topic of domainTopics) {
        addDirectHit(topic, 'label');
      }
    }
  }

  if (db.queryEntityFacts && entityTerms.length > 0) {
    const factBatches = await Promise.all(entityTerms.map((term) => db.queryEntityFacts!(term, { workspaceId, limit: 10 })));
    for (const facts of factBatches) {
      for (const fact of facts) {
        const noteId = fact.evidenceNoteId || fact.evidence_note_id;
        if (noteId) {
          factNoteIds.add(noteId);
        }
      }
    }
  }

  // Legacy serial expansion path kept inert below while the new parallelized path settles.
  if (false && hitTopicIds.size > 0) {
    const hitIds = Array.from(hitTopicIds);

    // 子主题
    for (const parentId of hitIds.slice(0, 5)) {
      const children = await db.listTopicChildren(parentId);
      for (const child of children.slice(0, 5)) {
        if (!hitTopicIds.has(child.id)) {
          expanded.push({ id: child.id, label: child.label, heat: child.heat ?? 0, depth: 1 });
        }
      }
    }

    // 邻接主题
    const adjacentEdges = await db.findAdjacentTopics(hitIds, 10);
    for (const edge of adjacentEdges) {
      const targetId = edge.targetId || edge.target_id;
      if (targetId && !hitTopicIds.has(targetId) && !expanded.some((e) => e.id === targetId)) {
        const topic = await db.getTopicById(targetId);
        if (topic) {
          expanded.push({ id: topic.id, label: topic.label, heat: topic.heat ?? 0, depth: 1 });
        }
      }
    }
  }

  // Step 2d: Domain-based filtering (I-4)
  // If entityTerms match a "person:Name" or "project:Name" domain, pull in domain-scoped topics
  if (false && db.findTopicsByDomain) {
    for (const term of analysis.entityTerms) {
      if (!term) continue;
      for (const prefix of ['person', 'project']) {
        const domainKey = `${prefix}:${term}`;
        const domainTopics = await db.findTopicsByDomain(domainKey, workspaceId, 5);
        for (const t of domainTopics) {
          if (!hitTopicIds.has(t.id)) {
            hitTopicIds.add(t.id);
            directHits.push({ id: t.id, label: t.label, heat: t.heat ?? 0, matchType: 'label' });
          }
        }
      }
    }
  }

  // Step 2e: Entity fact graph expansion (I-3)
  // If entityTerms match entity facts, pull in related notes via evidenceNoteId
  if (false && db.queryEntityFacts) {
    for (const term of analysis.entityTerms) {
      if (!term) continue;
      const facts = await db.queryEntityFacts(term, { workspaceId, limit: 10 });
      for (const fact of facts) {
        const noteId = fact.evidenceNoteId || fact.evidence_note_id;
        if (noteId) {
          // Entity facts link directly to notes.
          // Keep them out of topic expansion so Stage 3 does not misroute note IDs
          // through listNotesByTopicId().
          factNoteIds.add(noteId);
        }
      }
    }
  }

  const allTopicIds = [...Array.from(hitTopicIds), ...expanded.map((e) => e.id)];
  return { directHits, expanded, factNoteIds: Array.from(factNoteIds), allTopicIds };
}

// ━━ Stage 3: Note Recall ━━

export async function recallNotes(analysis: QueryAnalysisResult, topicResult: TopicRecallResult, workspaceId: string, db: RetrievalDbDeps, maxResults = 10): Promise<NoteRecallResult> {
  const candidateMap = new Map<string, NoteCandidate>();

  // Route A: 图谱关联 note
  if (topicResult.allTopicIds.length > 0) {
    const topicIds = topicResult.allTopicIds.slice(0, 10);
    const noteBatches = await Promise.all(topicIds.map((topicId) => db.listNotesByTopicId(topicId, workspaceId, 20)));
    for (const [index, topicId] of topicIds.entries()) {
      const notes = noteBatches[index] || [];
      for (const note of notes) {
        const graphScore = topicResult.directHits.some((h) => h.id === topicId) ? 1.0 : 0.5;
        const relation = topicResult.directHits.some((h) => h.id === topicId) ? 'direct' : 'expanded';
        mergeNoteCandidate(candidateMap, note, { graphScore }, [`topic:${topicId}:${relation}`]);
      }
    }
  }

  // Route A2: 实体事实命中的 evidence notes
  if (topicResult.factNoteIds.length > 0) {
    const factNoteIds = topicResult.factNoteIds.slice(0, 10);
    const factNotes = await loadNotesByIds(factNoteIds, db);
    for (const noteId of factNoteIds) {
      const note = factNotes.get(noteId);
      if (note) {
        mergeNoteCandidate(candidateMap, note, { graphScore: 0.9 }, ['entity_fact']);
      }
    }
  }

  // Route B: FTS 全文命中
  const ftsQuery = buildFtsQuery(analysis);
  if (ftsQuery) {
    const ftsHits = db.ftsSearch(ftsQuery, { entryType: 'note', limit: 30 });
    // 归一化 FTS rank
    const maxRank = ftsHits.length > 0 ? Math.abs(ftsHits[0].rank) : 1;
    const missingNotes = await loadNotesByIds(
      dedupStrings(ftsHits.map((hit) => hit.note_id).filter((noteId) => noteId && !candidateMap.has(noteId))),
      db
    );
    for (const hit of ftsHits) {
      const noteId = hit.note_id;
      const ftsScore = maxRank > 0 ? Math.abs(hit.rank) / maxRank : 0;
      if (candidateMap.has(noteId)) {
        candidateMap.get(noteId)!.ftsScore = Math.max(candidateMap.get(noteId)!.ftsScore, ftsScore);
        addMatchReasons(candidateMap.get(noteId)!, ['fts:note']);
      } else {
        const note = missingNotes.get(noteId);
        if (note) {
          mergeNoteCandidate(candidateMap, note, { ftsScore }, ['fts:note']);
        }
      }
    }
  }

  // Route B2: 直接 LIKE 搜索（弥补 FTS unicode61 对中文分词不足）
  if (db.searchNotesByTerms) {
    const uniqueTerms = collectSearchTerms(analysis);
    if (uniqueTerms.length > 0) {
      const likeHits = await db.searchNotesByTerms(uniqueTerms, workspaceId, 20);
      for (const note of likeHits) {
        mergeNoteCandidate(candidateMap, note, { ftsScore: 0.6 }, ['like_fallback']);
      }
    }
  }

  // Route C: 元数据过滤（时间范围）
  if (analysis.timeHint) {
    const { start, end } = resolveTimeRange(analysis.timeHint);
    if (start && end) {
      const notes = await db.listNotesByDateRange(start, end, workspaceId);
      for (const note of notes.slice(0, 30)) {
        mergeNoteCandidate(candidateMap, note, { metadataScore: 0.5 }, ['date_range']);
      }
    }
  }

  // Route D: 广泛召回兜底——当没有具体搜索词时，返回最近的记忆
  if (analysis.broadRecall && candidateMap.size === 0) {
    const recentNotes = await db.listNotesByWorkspace(workspaceId, maxResults * 2, 0);
    for (const note of recentNotes) {
      mergeNoteCandidate(candidateMap, note, { metadataScore: 0.3 }, ['broad_recall']);
    }
  }

  // 融合排序
  const candidates = Array.from(candidateMap.values()).map((c) => {
    const breakdown = computeScoreBreakdown(c, analysis);
    c.scoreBreakdown = breakdown;
    c.finalScore = breakdown.finalScore;
    return c;
  });
  candidates.sort((a, b) => b.finalScore - a.finalScore);

  return {
    candidates: candidates.slice(0, maxResults),
    totalFound: candidates.length
  };
}

// ━━ Stage 4: Section Recall ━━

export async function recallSections(analysis: QueryAnalysisResult, noteIds: string[], db: RetrievalDbDeps, maxResults = 20): Promise<SectionCandidate[]> {
  if (!noteIds.length) return [];
  const candidates: SectionCandidate[] = [];
  const limitedNoteIds = noteIds.slice(0, 10);
  const sectionsByNoteId = await loadSectionsByNoteIds(limitedNoteIds, db);
  const sectionById = new Map<string, any>();
  for (const sections of sectionsByNoteId.values()) {
    for (const section of sections) {
      sectionById.set(section.id, section);
    }
  }

  // Step 4a: actionHint 优先匹配段落类型
  const actionHeadingMap: Record<string, string[]> = {
    decision: ['Key Points'],
    open_loop: ['Open Items'],
    evidence: ['Source Excerpts', 'Key Points'],
    contradiction: ['Contradictions'],
    recall: ['Key Points']
  };
  if (analysis.actionHint && analysis.actionHint !== 'general') {
    const targetHeadings = actionHeadingMap[analysis.actionHint];
    if (targetHeadings?.length) {
      for (const noteId of limitedNoteIds) {
        const sections = sectionsByNoteId.get(noteId) || [];
        for (const sec of sections) {
          const heading = sec.heading || sec.heading;
          const targetIndex = heading ? targetHeadings.findIndex((target) => heading.includes(target)) : -1;
          if (targetIndex >= 0) {
            candidates.push({
              sectionId: sec.id,
              noteId: sec.noteId || sec.note_id,
              heading,
              headingLevel: sec.headingLevel || sec.heading_level || 2,
              summary: sec.summary || '',
              lineStart: sec.lineStart || sec.line_start,
              lineEnd: sec.lineEnd || sec.line_end,
              charCount: sec.charCount || sec.char_count || 0,
              matchType: 'action_hint',
              score: 1.0 - targetIndex * 0.05
            });
          }
        }
      }
    }
  }

  // Step 4b: Section FTS 命中
  const ftsQuery = buildFtsQuery(analysis);
  if (ftsQuery) {
    const ftsHits = db.ftsSearch(ftsQuery, { entryType: 'section', noteIds: limitedNoteIds, limit: 20 });
    for (const hit of ftsHits) {
      if (!candidates.some((c) => c.sectionId === hit.entry_id)) {
        const sec = sectionById.get(hit.entry_id);
        if (sec) {
          candidates.push({
            sectionId: sec.id,
            noteId: hit.note_id,
            heading: sec.heading,
            headingLevel: sec.headingLevel || sec.heading_level || 2,
            summary: sec.summary || '',
            lineStart: sec.lineStart || sec.line_start,
            lineEnd: sec.lineEnd || sec.line_end,
            charCount: sec.charCount || sec.char_count || 0,
            matchType: 'fts',
            score: Math.abs(hit.rank)
          });
        }
      }
    }
  }

  // 排序
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, maxResults);
}

// ━━ Stage 5: Targeted Read ━━

export async function targetedRead(
  sections: SectionCandidate[],
  noteFileMap: Map<string, string>, // noteId → absolute file path
  maxChars = 2800
): Promise<TargetedReadResult> {
  const result: ReadSection[] = [];
  const fileContentCache = new Map<string, string>();
  let totalChars = 0;
  let budgetExhausted = false;

  for (const section of sections) {
    if (totalChars >= maxChars) {
      budgetExhausted = true;
      break;
    }

    const filePath = noteFileMap.get(section.noteId);
    if (!filePath) continue;

    let fileContent = fileContentCache.get(filePath);
    if (!fileContent) {
      try {
        fileContent = await fs.readFile(filePath, 'utf-8');
        fileContentCache.set(filePath, fileContent);
      } catch {
        continue;
      }
    }

    const content = readLines(fileContent, section.lineStart, section.lineEnd);
    const remaining = maxChars - totalChars;

    if (content.length <= remaining) {
      result.push({
        noteId: section.noteId,
        heading: section.heading,
        content,
        lineStart: section.lineStart,
        lineEnd: section.lineEnd,
        truncated: false
      });
      totalChars += content.length;
    } else {
      result.push({
        noteId: section.noteId,
        heading: section.heading,
        content: content.slice(0, remaining),
        lineStart: section.lineStart,
        lineEnd: section.lineEnd,
        truncated: true
      });
      totalChars += remaining;
      budgetExhausted = true;
      break;
    }
  }

  return { sections: result, totalCharsRead: totalChars, budgetExhausted };
}

// ━━ Stage 6: Context Assembly ━━

export function assembleContext(topicResult: TopicRecallResult, noteResult: NoteRecallResult, readResult: TargetedReadResult): string {
  const parts: string[] = [];

  // 第一层：主题概览
  if (topicResult.directHits.length > 0) {
    parts.push('## 相关记忆主题');
    for (const topic of topicResult.directHits.slice(0, 5)) {
      parts.push(`- **${topic.label}**（活跃度: ${topic.heat.toFixed(2)}）`);
    }
    parts.push('');
  }

  // 第二层：note 摘要
  if (noteResult.candidates.length > 0) {
    parts.push('## 相关记忆摘要');
    for (const note of noteResult.candidates.slice(0, 5)) {
      parts.push(`### ${note.topics.join(', ')}（${note.date}）`);
      parts.push(note.summary);
      parts.push('');
    }
  }

  // 第三层：命中段落正文
  if (readResult.sections.length > 0) {
    parts.push('## 记忆详情');
    for (const section of readResult.sections) {
      parts.push(`### ${section.heading}`);
      parts.push(section.content);
      if (section.truncated) {
        parts.push('> （内容已截断）');
      }
      parts.push('');
    }
  }

  return parts.join('\n');
}

// ━━ High-Level Entry Points ━━

/**
 * search — 统一搜索入口，串联 Stage 1-6
 */
export async function search(
  query: string,
  workspaceId: string,
  db: RetrievalDbDeps,
  opts: SearchOptions = {}
): Promise<MemorySearchResult> {
  if (!shouldUseMemorySearchCache(opts)) {
    return runSearchPipeline(query, workspaceId, db, opts);
  }

  pruneExpiredMemorySearchCache();
  const cacheKey = buildMemorySearchCacheKey(query, workspaceId, opts);
  const globalGeneration = memorySearchCacheGlobalGeneration;
  const workspaceGeneration = getMemorySearchCacheWorkspaceGeneration(workspaceId);
  const cached = memorySearchCache.get(cacheKey);
  const now = Date.now();

  if (cached) {
    const generationMatches = cached.globalGeneration === globalGeneration && cached.workspaceGeneration === workspaceGeneration;
    if (!generationMatches) {
      memorySearchCache.delete(cacheKey);
    } else if (cached.value && cached.expiresAt > now) {
      return cloneMemorySearchResult(cached.value);
    } else if (cached.promise) {
      return cloneMemorySearchResult(await cached.promise);
    } else {
      memorySearchCache.delete(cacheKey);
    }
  }

  const pendingSearch = runSearchPipeline(query, workspaceId, db, opts);
  const pendingEntry: MemorySearchCacheEntry = {
    workspaceId,
    globalGeneration,
    workspaceGeneration,
    expiresAt: 0,
    promise: pendingSearch
  };
  memorySearchCache.set(cacheKey, pendingEntry);

  try {
    const result = await pendingSearch;
    const cacheStillValid =
      memorySearchCacheGlobalGeneration === globalGeneration && getMemorySearchCacheWorkspaceGeneration(workspaceId) === workspaceGeneration;

    if (cacheStillValid) {
      memorySearchCache.set(cacheKey, {
        workspaceId,
        globalGeneration,
        workspaceGeneration,
        expiresAt: Date.now() + MEMORY_SEARCH_CACHE_TTL_MS,
        value: cloneMemorySearchResult(result)
      });
    } else if (memorySearchCache.get(cacheKey) === pendingEntry) {
      memorySearchCache.delete(cacheKey);
    }

    return cloneMemorySearchResult(result);
  } catch (error) {
    if (memorySearchCache.get(cacheKey) === pendingEntry) {
      memorySearchCache.delete(cacheKey);
    }
    throw error;
  }
}

async function runSearchPipeline(
  query: string,
  workspaceId: string,
  db: RetrievalDbDeps,
  opts: SearchOptions = {}
): Promise<MemorySearchResult> {
  // Stage 1
  const analysis = await resolveQueryAnalysis(query, opts.analysis, opts.llmAnalyzer);

  // 应用外部过滤
  if (opts.dateRange?.start && opts.dateRange?.end) {
    analysis.timeHint = { type: 'range', start: opts.dateRange.start, end: opts.dateRange.end };
  }

  // Stage 2
  const topicResult = await recallTopics(analysis, workspaceId, db);

  // Stage 3
  const noteResult = await recallNotes(analysis, topicResult, workspaceId, db, opts.maxResults ?? 5);

  // 应用 topicFilter：过滤候选 notes，只保留包含指定 topic 的结果
  if (opts.topicFilter && opts.topicFilter.length > 0) {
    const filterSet = new Set(opts.topicFilter.map((t) => t.toLowerCase()));
    noteResult.candidates = noteResult.candidates.filter((n) => n.topics.some((t) => filterSet.has(t.toLowerCase())));
    noteResult.totalFound = noteResult.candidates.length;
  }

  // 构建结果
  const result: MemorySearchResult = {
    topics: topicResult.directHits.map((t) => ({ label: t.label, heat: t.heat })),
    notes: noteResult.candidates.map((n) => ({
      id: n.noteId,
      date: n.date,
      topics: n.topics,
      summary: n.summary,
      importance: n.importance,
      ...(opts.debug ? { scoreBreakdown: n.scoreBreakdown } : {})
    })),
    totalFound: noteResult.totalFound
  };

  // 可选：附加 section 摘要
  if (opts.includeContent) {
    const sectionsByNoteId = await loadSectionsByNoteIds(
      result.notes.map((note) => note.id),
      db
    );
    for (const note of result.notes) {
      const sections = sectionsByNoteId.get(note.id) || [];
      note.sections = sections.map((s: any) => ({
        heading: s.heading,
        summary: s.summary || ''
      }));
    }
  }

  if (opts.debug) {
    result.debug = {
      analysis,
      weights: { ...RETRIEVAL_SCORE_WEIGHTS },
      topicRecall: {
        directHits: topicResult.directHits.map((hit) => ({ ...hit })),
        expanded: topicResult.expanded.map((entry) => ({ ...entry })),
        factNoteIds: [...topicResult.factNoteIds],
        allTopicIds: [...topicResult.allTopicIds]
      },
      noteRanking: noteResult.candidates.map((candidate, index) => ({
        rank: index + 1,
        noteId: candidate.noteId,
        date: candidate.date,
        topics: [...candidate.topics],
        summary: candidate.summary,
        importance: candidate.importance,
        stability: candidate.stability,
        scoreBreakdown: candidate.scoreBreakdown || computeScoreBreakdown(candidate, analysis)
      }))
    };
  }

  return result;
}

export function clearMemorySearchCache(workspaceId?: string): void {
  if (!workspaceId) {
    memorySearchCache.clear();
    memorySearchCacheWorkspaceGenerations.clear();
    memorySearchCacheGlobalGeneration += 1;
    return;
  }

  memorySearchCacheWorkspaceGenerations.set(workspaceId, getMemorySearchCacheWorkspaceGeneration(workspaceId) + 1);
  for (const [cacheKey, entry] of memorySearchCache.entries()) {
    if (entry.workspaceId === workspaceId) {
      memorySearchCache.delete(cacheKey);
    }
  }
}

/**
 * get — 按 noteId + section 精确读取
 */
export async function get(noteId: string, db: RetrievalDbDeps, opts: { section?: string; lineRange?: { start: number; end: number } } = {}): Promise<MemoryGetResult | null> {
  const note = await db.getNoteById(noteId);
  if (!note) return null;

  const topics = safeJsonParse(note.topics, []);
  const result: MemoryGetResult = {
    noteId: note.id,
    date: note.date,
    topics
  };

  const wsRoot = await db.getWorkspaceRoot(note.workspaceId);
  if (!wsRoot) return result;
  const filePath = path.join(wsRoot, note.filePath);

  let fileContent: string;
  try {
    fileContent = await fs.readFile(filePath, 'utf-8');
  } catch {
    return result;
  }

  if (opts.section) {
    // 按段落名读取
    const sections = await db.listSectionsByNote(noteId);
    const sec = sections.find((s: any) => s.heading === opts.section || s.heading?.includes(opts.section!));
    if (sec) {
      const lineStart = sec.lineStart || sec.line_start;
      const lineEnd = sec.lineEnd || sec.line_end;
      result.content = readLines(fileContent, lineStart, lineEnd);
      result.heading = sec.heading;
      result.lineRange = { start: lineStart, end: lineEnd };
    }
  } else if (opts.lineRange) {
    result.content = readLines(fileContent, opts.lineRange.start, opts.lineRange.end);
    result.lineRange = opts.lineRange;
  } else {
    // 返回标题树
    const sections = await db.listSectionsByNote(noteId);
    result.outline = sections.map((s: any) => ({
      heading: s.heading,
      level: s.headingLevel || s.heading_level || 2,
      summary: s.summary || '',
      charCount: s.charCount || s.char_count || 0
    }));
  }

  return result;
}

/**
 * browseTopics — 主题图谱浏览
 */
export async function browseTopics(db: RetrievalDbDeps, opts: { topicId?: string; action?: 'children' | 'related' | 'notes'; workspaceId?: string; limit?: number } = {}): Promise<MemoryTopicsResult> {
  const limit = opts.limit ?? 10;
  const result: MemoryTopicsResult = {};

  if (!opts.topicId) {
    // 返回根主题列表
    const roots = await db.listTopicRoots(opts.workspaceId, limit);
    result.children = roots.map((t: any) => ({
      id: t.id,
      label: t.label,
      heat: t.heat ?? 0,
      noteCount: t.noteCount || t.note_count || 0
    }));
    return result;
  }

  // 查指定 topic
  const topic = await db.getTopicById(opts.topicId);
  if (topic) {
    result.topic = {
      id: topic.id,
      label: topic.label,
      description: topic.description,
      heat: topic.heat ?? 0,
      noteCount: topic.noteCount || topic.note_count || 0
    };
  }

  const action = opts.action ?? 'children';

  if (action === 'children') {
    const children = await db.listTopicChildren(opts.topicId);
    result.children = children.slice(0, limit).map((t: any) => ({
      id: t.id,
      label: t.label,
      heat: t.heat ?? 0,
      noteCount: t.noteCount || t.note_count || 0
    }));
  } else if (action === 'related') {
    const edges = await db.findAdjacentTopics([opts.topicId], limit);
    const related: MemoryTopicsResult['related'] = [];
    for (const edge of edges) {
      const targetId = edge.targetId || edge.target_id;
      const t = await db.getTopicById(targetId);
      if (t) {
        related.push({
          id: t.id,
          label: t.label,
          heat: t.heat ?? 0,
          relationType: edge.relationType || edge.relation_type || 'related'
        });
      }
    }
    result.related = related;
  } else if (action === 'notes') {
    const notes = await db.listNotesByTopicId(opts.topicId, opts.workspaceId, limit);
    result.notes = notes.map((n: any) => ({
      id: n.id,
      date: n.date,
      summary: n.summary || '',
      importance: n.importance ?? 0.5
    }));
  }

  return result;
}

/**
 * searchWithContent — 搜索并自动读取命中段落的正文（一步到位的 search+read）
 */
export interface SearchWithContentResult {
  context: string;
  noteCount: number;
  topicCount: number;
}

export interface SearchOptions {
  maxResults?: number;
  includeContent?: boolean;
  topicFilter?: string[];
  dateRange?: { start?: string; end?: string };
  debug?: boolean;
  analysis?: QueryAnalysisResult;
  llmAnalyzer?: LlmQueryAnalyzer;
}

export interface SearchWithContentOptions {
  analysis?: QueryAnalysisResult;
  llmAnalyzer?: LlmQueryAnalyzer;
}

interface MemorySearchCacheEntry {
  workspaceId: string;
  globalGeneration: number;
  workspaceGeneration: number;
  expiresAt: number;
  promise?: Promise<MemorySearchResult>;
  value?: MemorySearchResult;
}

const MEMORY_SEARCH_CACHE_TTL_MS = 5000;
const memorySearchCache = new Map<string, MemorySearchCacheEntry>();
const memorySearchCacheWorkspaceGenerations = new Map<string, number>();
let memorySearchCacheGlobalGeneration = 0;

const RETRIEVAL_SCORE_WEIGHTS: RetrievalScoreWeights = {
  fts: 0.35,
  graph: 0.25,
  metadata: 0,
  importance: 0.15,
  recency: 0.15,
  action: 0.1
};

/** LLM 辅助查询分析函数（可选增强） */
export type LlmQueryAnalyzer = (query: string) => Promise<QueryAnalysisResult | null>;

const LLM_QUERY_ANALYSIS_PROMPT = `你是一个查询分析器。把用户的查询拆解为以下 JSON 格式：
{
  "topicTerms": ["主题词1", "主题词2"],
  "entityTerms": ["产品名/人名/技术名"],
  "keywordTerms": ["其他关键词"],
  "timeHint": { "type": "recent", "days": 7 },
  "actionHint": "recall"
}

timeHint.type: "recent"(最近N天，含days字段）| "range"（含start/end字段）| "specific"（含start/end字段）| null（无时间信号）
actionHint: "recall"（回忆）| "decision"（决定/确认）| "open_loop"（待办/未完成）| "evidence"（证据/原因）| "contradiction"（矛盾/冲突）| "general"（通用）
topicTerms: 提取查询中的主题/领域词
entityTerms: 提取专有名词（产品、人名、技术名等）
keywordTerms: 提取用于全文搜索的关键词

只输出 JSON，不要解释。

用户查询：`;

/**
 * 创建 LLM 辅助查询分析器
 */
export function createLlmQueryAnalyzer(chatFn: (prompt: string) => Promise<string>): LlmQueryAnalyzer {
  return async (query: string): Promise<QueryAnalysisResult | null> => {
    try {
      const response = await chatFn(`${LLM_QUERY_ANALYSIS_PROMPT}${query}`);
      const parsed = JSON.parse(
        response
          .replace(/```json?\n?/g, '')
          .replace(/```/g, '')
          .trim()
      );
      return {
        topicTerms: parsed.topicTerms || [],
        entityTerms: parsed.entityTerms || [],
        keywordTerms: parsed.keywordTerms || [],
        timeHint: parsed.timeHint || undefined,
        actionHint: parsed.actionHint || 'general',
        originalQuery: query
      };
    } catch {
      return null; // 回退到规则解析
    }
  };
}

function normalizeSearchWithContentOptions(options?: LlmQueryAnalyzer | SearchWithContentOptions): SearchWithContentOptions {
  if (typeof options === 'function') {
    return { llmAnalyzer: options };
  }
  return options ?? {};
}

async function resolveQueryAnalysis(query: string, analysis?: QueryAnalysisResult, llmAnalyzer?: LlmQueryAnalyzer): Promise<QueryAnalysisResult> {
  if (analysis) {
    return { ...analysis };
  }
  if (llmAnalyzer) {
    const llmResult = await llmAnalyzer(query);
    if (llmResult) {
      return llmResult;
    }
  }
  return analyzeQuery(query);
}

async function buildNoteFileMap(noteCandidates: NoteCandidate[], workspaceId: string, db: RetrievalDbDeps): Promise<Map<string, string>> {
  const noteFileMap = new Map<string, string>();
  if (noteCandidates.length === 0) return noteFileMap;

  const noteMeta = new Map<string, { filePath?: string; workspaceId?: string }>();
  const missingNoteIds: string[] = [];
  for (const note of noteCandidates) {
    if (note.filePath) {
      noteMeta.set(note.noteId, { filePath: note.filePath, workspaceId: note.workspaceId || workspaceId });
    } else {
      missingNoteIds.push(note.noteId);
    }
  }

  const missingNotes = await loadNotesByIds(missingNoteIds, db);
  for (const [noteId, note] of missingNotes) {
    noteMeta.set(noteId, {
      filePath: note.filePath || note.file_path,
      workspaceId: note.workspaceId || note.workspace_id || workspaceId
    });
  }

  const workspaceRootCache = new Map<string, string | null>();
  const getCachedWorkspaceRoot = async (targetWorkspaceId: string): Promise<string | null> => {
    if (workspaceRootCache.has(targetWorkspaceId)) {
      return workspaceRootCache.get(targetWorkspaceId) ?? null;
    }
    const root = await db.getWorkspaceRoot(targetWorkspaceId);
    workspaceRootCache.set(targetWorkspaceId, root);
    return root;
  };

  for (const [noteId, meta] of noteMeta) {
    if (!meta.filePath) continue;
    const targetWorkspaceId = meta.workspaceId || workspaceId;
    const workspaceRoot = await getCachedWorkspaceRoot(targetWorkspaceId);
    if (!workspaceRoot) continue;
    noteFileMap.set(noteId, path.join(workspaceRoot, meta.filePath));
  }

  return noteFileMap;
}

export async function searchWithContent(
  query: string,
  workspaceId: string,
  db: RetrievalDbDeps,
  maxChars = 4000,
  llmAnalyzerOrOptions?: LlmQueryAnalyzer | SearchWithContentOptions
): Promise<SearchWithContentResult> {
  const TAG = '[MemorySearch] 🧠🔎';
  const t0 = Date.now();
  const options = normalizeSearchWithContentOptions(llmAnalyzerOrOptions);

  // Stage 1: Query Analysis（优先 LLM，失败回退规则解析）
  let analysis: QueryAnalysisResult;
  if (options.analysis) {
    analysis = { ...options.analysis };
  } else if (options.llmAnalyzer) {
    const llmResult = await options.llmAnalyzer(query);
    analysis = llmResult ?? analyzeQuery(query);
  } else {
    analysis = analyzeQuery(query);
  }
  console.log(`${TAG} ── Stage 1: Query Analysis ──
  query: "${query}"
  topicTerms: [${analysis.topicTerms.join(', ')}]
  entityTerms: [${analysis.entityTerms.join(', ')}]
  keywordTerms: [${analysis.keywordTerms.join(', ')}]
  timeHint: ${analysis.timeHint ? JSON.stringify(analysis.timeHint) : 'none'}
  actionHint: ${analysis.actionHint || 'none'}
  broadRecall: ${!!analysis.broadRecall}`);

  // Stage 2: Topic Recall
  const t1 = Date.now();
  const topicResult = await recallTopics(analysis, workspaceId, db);
  console.log(`${TAG} ── Stage 2: Topic Recall (${Date.now() - t1}ms) ──
  directHits: [${topicResult.directHits.map((t) => `${t.label}(heat=${t.heat.toFixed(2)})`).join(', ')}]
  expanded: [${topicResult.expanded.map((t) => `${t.label}(depth=${t.depth})`).join(', ')}]
  factNoteIds: [${topicResult.factNoteIds.join(', ')}]
  allTopicIds: ${topicResult.allTopicIds.length} total`);

  // Stage 3: Note Recall
  const t2 = Date.now();
  const noteResult = await recallNotes(analysis, topicResult, workspaceId, db, 10);
  console.log(`${TAG} ── Stage 3: Note Recall (${Date.now() - t2}ms) ──
  candidates: ${noteResult.candidates.length} / totalFound: ${noteResult.totalFound}
${noteResult.candidates
      .slice(0, 5)
      .map(
        (n, i) => `  [${i}] ${n.date} | topics=[${n.topics.join(',')}] | ${formatScoreBreakdownForLog(n)} | reasons=[${n.matchReasons.join(', ')}] | "${n.summary.slice(0, 60)}"`
      )
      .join('\n')}`);

  if (noteResult.candidates.length === 0) {
    console.log(`${TAG} ── No candidates found, skipping stages 4-6 (total ${Date.now() - t0}ms) ──`);
    return { context: '', noteCount: 0, topicCount: topicResult.directHits.length };
  }

  // Stage 4: Section Recall
  const noteIds = noteResult.candidates.map((c) => c.noteId);
  const t3 = Date.now();
  const sectionCandidates = await recallSections(analysis, noteIds, db, 15);
  console.log(`${TAG} ── Stage 4: Section Recall (${Date.now() - t3}ms) ──
  sections: ${sectionCandidates.length}
${sectionCandidates
      .slice(0, 8)
      .map((s, i) => `  [${i}] noteId=${s.noteId.slice(0, 8)}… | heading="${s.heading}" | score=${s.score.toFixed(2)}`)
      .join('\n')}`);

  // 构建 noteId → filePath 映射
  const noteFileMap = await buildNoteFileMap(noteResult.candidates, workspaceId, db);

  // Stage 5: Targeted Read
  const t4 = Date.now();
  const readResult = await targetedRead(sectionCandidates, noteFileMap, Math.round(maxChars * 0.7));
  console.log(`${TAG} ── Stage 5: Targeted Read (${Date.now() - t4}ms) ──
  sections read: ${readResult.sections.length} | chars: ${readResult.totalCharsRead} | budgetExhausted: ${readResult.budgetExhausted}
${readResult.sections
      .slice(0, 5)
      .map((s, i) => `  [${i}] "${s.heading}" → ${s.content.length} chars${s.truncated ? ' (truncated)' : ''}`)
      .join('\n')}`);

  // Stage 6: Context Assembly
  const context = assembleContext(topicResult, noteResult, readResult);
  console.log(`${TAG} ── Stage 6: Context Assembly (total ${Date.now() - t0}ms) ──
  output: ${context.length} chars`);

  return { context, noteCount: noteResult.candidates.length, topicCount: topicResult.directHits.length };
}

// ━━ Helpers ━━

function buildFtsQuery(analysis: QueryAnalysisResult): string {
  return buildExpandedFtsQuery(analysis);
  const allTerms = [...analysis.topicTerms, ...analysis.entityTerms, ...analysis.keywordTerms].filter(Boolean);
  const unique = [...new Set(allTerms)];
  if (unique.length === 0) return '';

  // Use both phrase match and individual token match for better Chinese recall.
  // Phrase "AB" matches exact sequence; individual A OR B broadens recall.
  const parts: string[] = [];
  for (const t of unique) {
    // Phrase match (high precision)
    parts.push(`"${t}"`);
    // For multi-char Chinese terms, also add individual chars as fallback
    // so "命运石之门" can match even if tokenized differently
    if (t.length > 2 && /[\u4e00-\u9fff]/.test(t)) {
      // Split into bigrams for better CJK matching
      for (let i = 0; i < t.length - 1; i++) {
        const bigram = t.slice(i, i + 2);
        parts.push(`"${bigram}"`);
      }
    }
  }
  return parts.join(' OR ');
}

const QUERY_TERM_SYNONYMS: Record<string, string[]> = {
  evidence: ['reason', 'quote', 'source excerpt'],
  reason: ['why', 'evidence'],
  why: ['reason', 'evidence'],
  '\u8bc1\u636e': ['\u539f\u8bdd', '\u5f15\u7528', '\u6458\u5f55'],
  '\u4f9d\u636e': ['\u8bc1\u636e', '\u539f\u8bdd', '\u6458\u5f55'],
  '\u539f\u8bdd': ['\u8bc1\u636e', '\u6458\u5f55'],
  '\u6458\u5f55': ['\u539f\u8bdd', '\u5f15\u7528'],
  vector: ['embedding', '\u5411\u91cf'],
  embedding: ['vector', '\u5411\u91cf'],
  '\u5411\u91cf': ['vector', 'embedding'],
  memory: ['\u8bb0\u5fc6'],
  '\u8bb0\u5fc6': ['memory'],
  '\u68c0\u7d22': ['\u53ec\u56de', '\u641c\u7d22'],
  '\u53ec\u56de': ['\u68c0\u7d22', '\u56de\u5fc6']
};

function buildExpandedFtsQuery(analysis: QueryAnalysisResult): string {
  const terms = collectSearchTerms(analysis);
  if (terms.length === 0) return '';
  return terms.map((term) => `"${term}"`).join(' OR ');
}

function collectSearchTerms(analysis: QueryAnalysisResult, maxTerms = 24): string[] {
  const baseTerms = [...analysis.topicTerms, ...analysis.entityTerms, ...analysis.keywordTerms];
  const queue = baseTerms.map((term) => normalizeSearchTerm(term)).filter(Boolean);
  const seen = new Set<string>();
  const collected: string[] = [];

  while (queue.length > 0 && collected.length < maxTerms) {
    const term = normalizeSearchTerm(queue.shift());
    if (!term) continue;

    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    collected.push(term);

    for (const variant of expandSearchTerm(term)) {
      const normalizedVariant = normalizeSearchTerm(variant);
      if (normalizedVariant && !seen.has(normalizedVariant.toLowerCase())) {
        queue.push(normalizedVariant);
      }
    }
  }

  return collected;
}

function expandSearchTerm(term: string): string[] {
  const variants = new Set<string>();

  for (const part of term.split(/[\s/_-]+/)) {
    const normalized = normalizeSearchTerm(part);
    if (normalized && normalized !== term) variants.add(normalized);
  }

  for (const match of term.match(/[\u4e00-\u9fff]{2,}/g) || []) {
    for (let i = 0; i < match.length - 1; i++) {
      variants.add(match.slice(i, i + 2));
    }
  }

  const synonymKey = term.toLowerCase();
  for (const synonym of QUERY_TERM_SYNONYMS[synonymKey] || []) {
    const normalized = normalizeSearchTerm(synonym);
    if (normalized && normalized !== term) variants.add(normalized);
  }

  return Array.from(variants);
}

function normalizeSearchTerm(term: string | undefined): string {
  if (!term) return '';
  return term
    .replace(/["'`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shouldUseMemorySearchCache(opts: SearchOptions): boolean {
  return !opts.analysis && !opts.llmAnalyzer;
}

function buildMemorySearchCacheKey(query: string, workspaceId: string, opts: SearchOptions): string {
  return JSON.stringify({
    workspaceId,
    query: normalizeSearchTerm(query),
    maxResults: opts.maxResults ?? 5,
    includeContent: !!opts.includeContent,
    debug: !!opts.debug,
    topicFilter: dedupStrings((opts.topicFilter || []).map((term) => normalizeSearchTerm(term).toLowerCase()).filter(Boolean)).sort(),
    dateRange: {
      start: opts.dateRange?.start ?? null,
      end: opts.dateRange?.end ?? null
    }
  });
}

function cloneMemorySearchResult(result: MemorySearchResult): MemorySearchResult {
  return JSON.parse(JSON.stringify(result)) as MemorySearchResult;
}

function pruneExpiredMemorySearchCache(now = Date.now()): void {
  for (const [cacheKey, entry] of memorySearchCache.entries()) {
    if (!entry.promise && entry.expiresAt <= now) {
      memorySearchCache.delete(cacheKey);
    }
  }
}

function getMemorySearchCacheWorkspaceGeneration(workspaceId: string): number {
  return memorySearchCacheWorkspaceGenerations.get(workspaceId) ?? 0;
}

function resolveTimeRange(hint: QueryAnalysisResult['timeHint']): { start: string; end: string } {
  if (!hint) return { start: '', end: '' };
  const today = formatMemoryDate();

  if (hint.type === 'specific' && hint.start) {
    return { start: hint.start, end: hint.end || hint.start };
  }
  if (hint.type === 'recent' && hint.days) {
    const start = getRelativeMemoryDate(-hint.days);
    return { start, end: today };
  }
  if (hint.type === 'range' && hint.start && hint.end) {
    return { start: hint.start, end: hint.end };
  }
  return { start: '', end: '' };
}

async function loadNotesByIds(noteIds: string[], db: RetrievalDbDeps): Promise<Map<string, any>> {
  const uniqueIds = dedupStrings(noteIds);
  if (uniqueIds.length === 0) return new Map();

  const notes = db.listNotesByIds ? await db.listNotesByIds(uniqueIds) : await Promise.all(uniqueIds.map((noteId) => db.getNoteById(noteId)));
  const noteMap = new Map<string, any>();
  for (const note of notes) {
    if (note?.id) {
      noteMap.set(note.id, note);
    }
  }
  return noteMap;
}

async function loadSectionsByNoteIds(noteIds: string[], db: RetrievalDbDeps): Promise<Map<string, any[]>> {
  const uniqueIds = dedupStrings(noteIds);
  const grouped = new Map<string, any[]>();
  if (uniqueIds.length === 0) return grouped;

  const sections = db.listSectionsByNoteIds
    ? await db.listSectionsByNoteIds(uniqueIds)
    : (await Promise.all(uniqueIds.map((noteId) => db.listSectionsByNote(noteId)))).flat();

  for (const noteId of uniqueIds) {
    grouped.set(noteId, []);
  }
  for (const section of sections) {
    const noteId = section.noteId || section.note_id;
    if (!noteId) continue;
    const bucket = grouped.get(noteId);
    if (bucket) bucket.push(section);
    else grouped.set(noteId, [section]);
  }
  return grouped;
}

function noteToCandidate(note: any, scores: { ftsScore?: number; graphScore?: number; metadataScore?: number } = {}, matchReasons: string[] = []): NoteCandidate {
  return {
    noteId: note.id,
    summary: note.summary || '',
    date: note.date || '',
    importance: note.importance ?? 0.5,
    stability: note.stability ?? 0.5,
    topics: safeJsonParse(note.topics, []),
    keywords: safeJsonParse(note.keywords, []),
    filePath: note.filePath || note.file_path,
    workspaceId: note.workspaceId || note.workspace_id,
    ftsScore: scores.ftsScore ?? 0,
    graphScore: scores.graphScore ?? 0,
    metadataScore: scores.metadataScore ?? 0,
    matchReasons: dedupStrings(matchReasons),
    finalScore: 0
  };
}

function mergeNoteCandidate(candidateMap: Map<string, NoteCandidate>, note: any, scores: { ftsScore?: number; graphScore?: number; metadataScore?: number } = {}, matchReasons: string[] = []): void {
  const existing = candidateMap.get(note.id);
  if (!existing) {
    candidateMap.set(note.id, noteToCandidate(note, scores, matchReasons));
    return;
  }

  if (scores.ftsScore !== undefined) {
    existing.ftsScore = Math.max(existing.ftsScore, scores.ftsScore);
  }
  if (scores.graphScore !== undefined) {
    existing.graphScore = Math.max(existing.graphScore, scores.graphScore);
  }
  if (scores.metadataScore !== undefined) {
    existing.metadataScore = Math.max(existing.metadataScore, scores.metadataScore);
  }
  if (!existing.filePath && (note.filePath || note.file_path)) {
    existing.filePath = note.filePath || note.file_path;
  }
  if (!existing.workspaceId && (note.workspaceId || note.workspace_id)) {
    existing.workspaceId = note.workspaceId || note.workspace_id;
  }
  addMatchReasons(existing, matchReasons);
}

function computeScoreBreakdown(candidate: NoteCandidate, analysis: QueryAnalysisResult): NoteScoreBreakdown {
  // 时效性衰减（半衰期 ≈ 30 天）
  const ageInDays = candidate.date ? (Date.now() - new Date(candidate.date).getTime()) / 86400000 : 30;
  const recencyScore = Math.exp(-0.023 * Math.max(0, ageInDays));

  // 动作意图加权
  const actionScore = computeActionScore(candidate, analysis);

  const raw = {
    fts: candidate.ftsScore,
    graph: candidate.graphScore,
    metadata: candidate.metadataScore,
    importance: candidate.importance,
    recency: recencyScore,
    action: actionScore
  };

  const weighted = {
    fts: raw.fts * RETRIEVAL_SCORE_WEIGHTS.fts,
    graph: raw.graph * RETRIEVAL_SCORE_WEIGHTS.graph,
    metadata: raw.metadata * RETRIEVAL_SCORE_WEIGHTS.metadata,
    importance: raw.importance * RETRIEVAL_SCORE_WEIGHTS.importance,
    recency: raw.recency * RETRIEVAL_SCORE_WEIGHTS.recency,
    action: raw.action * RETRIEVAL_SCORE_WEIGHTS.action
  };

  return {
    weights: { ...RETRIEVAL_SCORE_WEIGHTS },
    raw,
    weighted,
    ageInDays,
    matchReasons: [...candidate.matchReasons],
    finalScore: weighted.fts + weighted.graph + weighted.metadata + weighted.importance + weighted.recency + weighted.action
  };
}

function computeActionScore(candidate: NoteCandidate, analysis: QueryAnalysisResult): number {
  if (analysis.actionHint === 'decision') {
    return candidate.topics.some((t) => t.toLowerCase().includes('decision')) ? 1.0 : 0;
  }
  if (analysis.actionHint === 'open_loop') {
    return candidate.topics.some((t) => t.toLowerCase().includes('open')) ? 1.0 : 0;
  }
  return 0;
}

function addMatchReasons(candidate: NoteCandidate, matchReasons: string[]): void {
  candidate.matchReasons = dedupStrings([...candidate.matchReasons, ...matchReasons]);
}

function formatScoreBreakdownForLog(candidate: NoteCandidate): string {
  const breakdown = candidate.scoreBreakdown;
  if (!breakdown) {
    return `score=${candidate.finalScore.toFixed(3)}`;
  }
  return `score=${breakdown.finalScore.toFixed(3)} [fts=${breakdown.weighted.fts.toFixed(2)}, graph=${breakdown.weighted.graph.toFixed(2)}, importance=${breakdown.weighted.importance.toFixed(2)}, recency=${breakdown.weighted.recency.toFixed(2)}, action=${breakdown.weighted.action.toFixed(2)}, metadata=${breakdown.weighted.metadata.toFixed(2)}]`;
}

function dedupStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))];
}

function safeJsonParse(json: string | null | undefined, fallback: any[] = []): any[] {
  if (!json) return fallback;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}
