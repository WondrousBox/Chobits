/**
 * Memory Retrieval Service
 * 6 阶段检索流水线：Query Analysis → Topic Recall → Note Recall → Section Recall → Targeted Read → Context Assembly
 * 核心策略：结构化元数据过滤 + FTS5 全文检索 + 主题图谱扩展 + 渐进式定点读取。
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

import { readLines } from './memory-note-parser';

// ━━ Types ━━

export interface QueryAnalysisResult {
  topicTerms: string[];
  entityTerms: string[];
  keywordTerms: string[];
  timeHint?: { type: 'recent' | 'range' | 'specific'; days?: number; start?: string; end?: string };
  actionHint?: 'recall' | 'decision' | 'open_loop' | 'evidence' | 'general';
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
  allTopicIds: string[];
}

export interface NoteCandidate {
  noteId: string;
  summary: string;
  date: string;
  importance: number;
  stability: number;
  topics: string[];
  keywords: string[];
  ftsScore: number;
  graphScore: number;
  metadataScore: number;
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
export interface MemorySearchResult {
  topics: Array<{ label: string; heat: number }>;
  notes: Array<{
    id: string;
    date: string;
    topics: string[];
    summary: string;
    importance: number;
    sections?: Array<{ heading: string; summary: string }>;
  }>;
  totalFound: number;
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
  // Notes
  getNoteById: (id: string) => Promise<any>;
  listNotesByWorkspace: (workspaceId: string, limit?: number, offset?: number) => Promise<any[]>;
  listNotesByDateRange: (start: string, end: string, workspaceId?: string) => Promise<any[]>;
  listNotesByTopicId: (topicId: string, workspaceId?: string, limit?: number) => Promise<any[]>;
  // Sections
  listSectionsByNote: (noteId: string) => Promise<any[]>;
  // FTS
  ftsSearch: (query: string, opts?: { entryType?: 'note' | 'section'; noteIds?: string[]; limit?: number }) => Array<{ entry_id: string; entry_type: string; note_id: string; rank: number }>;
  // Workspace
  getWorkspaceRoot: (workspaceId: string) => Promise<string | null>;
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

  // Step 2a: 直接匹配 topic (label/slug/aliases)
  const allTerms = [...analysis.topicTerms, ...analysis.entityTerms];
  for (const term of allTerms) {
    if (!term) continue;
    const topics = await db.searchTopics(term, workspaceId, 5);
    for (const t of topics) {
      if (!hitTopicIds.has(t.id)) {
        hitTopicIds.add(t.id);
        directHits.push({ id: t.id, label: t.label, heat: t.heat ?? 0, matchType: 'label' });
      }
    }
  }

  // Step 2b: 关键词 → 主题
  for (const term of analysis.keywordTerms) {
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
  const expanded: TopicRecallResult['expanded'] = [];
  if (hitTopicIds.size > 0) {
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

  const allTopicIds = [...Array.from(hitTopicIds), ...expanded.map((e) => e.id)];
  return { directHits, expanded, allTopicIds };
}

// ━━ Stage 3: Note Recall ━━

export async function recallNotes(analysis: QueryAnalysisResult, topicResult: TopicRecallResult, workspaceId: string, db: RetrievalDbDeps, maxResults = 10): Promise<NoteRecallResult> {
  const candidateMap = new Map<string, NoteCandidate>();

  // Route A: 图谱关联 note
  if (topicResult.allTopicIds.length > 0) {
    for (const topicId of topicResult.allTopicIds.slice(0, 10)) {
      const notes = await db.listNotesByTopicId(topicId, workspaceId, 20);
      for (const note of notes) {
        if (!candidateMap.has(note.id)) {
          const isDirectHit = topicResult.directHits.some((h) => topicResult.allTopicIds.includes(h.id));
          candidateMap.set(note.id, noteToCandidate(note, { graphScore: isDirectHit ? 1.0 : 0.5 }));
        }
      }
    }
  }

  // Route B: FTS 全文命中
  const ftsQuery = buildFtsQuery(analysis);
  if (ftsQuery) {
    const ftsHits = db.ftsSearch(ftsQuery, { entryType: 'note', limit: 30 });
    // 归一化 FTS rank
    const maxRank = ftsHits.length > 0 ? Math.abs(ftsHits[0].rank) : 1;
    for (const hit of ftsHits) {
      const noteId = hit.note_id;
      const ftsScore = maxRank > 0 ? Math.abs(hit.rank) / maxRank : 0;
      if (candidateMap.has(noteId)) {
        candidateMap.get(noteId)!.ftsScore = Math.max(candidateMap.get(noteId)!.ftsScore, ftsScore);
      } else {
        const note = await db.getNoteById(noteId);
        if (note) {
          candidateMap.set(noteId, noteToCandidate(note, { ftsScore }));
        }
      }
    }
  }

  // Route C: 元数据过滤（时间范围）
  if (analysis.timeHint) {
    const { start, end } = resolveTimeRange(analysis.timeHint);
    if (start && end) {
      const notes = await db.listNotesByDateRange(start, end, workspaceId);
      for (const note of notes.slice(0, 30)) {
        if (!candidateMap.has(note.id)) {
          candidateMap.set(note.id, noteToCandidate(note, { metadataScore: 0.5 }));
        } else {
          candidateMap.get(note.id)!.metadataScore = 0.5;
        }
      }
    }
  }

  // Route D: 广泛召回兜底——当没有具体搜索词时，返回最近的记忆
  if (analysis.broadRecall && candidateMap.size === 0) {
    const recentNotes = await db.listNotesByWorkspace(workspaceId, maxResults * 2, 0);
    for (const note of recentNotes) {
      if (!candidateMap.has(note.id)) {
        candidateMap.set(note.id, noteToCandidate(note, { metadataScore: 0.3 }));
      }
    }
  }

  // 融合排序
  const candidates = Array.from(candidateMap.values()).map((c) => {
    c.finalScore = computeFinalScore(c, analysis);
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

  // Step 4a: actionHint 优先匹配段落类型
  const actionHeadingMap: Record<string, string> = {
    decision: 'Decisions',
    open_loop: 'Open Loops',
    evidence: 'Evidence',
    recall: 'Overview'
  };
  if (analysis.actionHint && analysis.actionHint !== 'general') {
    const targetHeading = actionHeadingMap[analysis.actionHint];
    if (targetHeading) {
      for (const noteId of noteIds.slice(0, 10)) {
        const sections = await db.listSectionsByNote(noteId);
        for (const sec of sections) {
          const heading = sec.heading || sec.heading;
          if (heading?.includes(targetHeading)) {
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
              score: 1.0
            });
          }
        }
      }
    }
  }

  // Step 4b: Section FTS 命中
  const ftsQuery = buildFtsQuery(analysis);
  if (ftsQuery) {
    const ftsHits = db.ftsSearch(ftsQuery, { entryType: 'section', noteIds, limit: 20 });
    for (const hit of ftsHits) {
      if (!candidates.some((c) => c.sectionId === hit.entry_id)) {
        const sections = await db.listSectionsByNote(hit.note_id);
        const sec = sections.find((s: any) => s.id === hit.entry_id);
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
  let totalChars = 0;
  let budgetExhausted = false;

  for (const section of sections) {
    if (totalChars >= maxChars) {
      budgetExhausted = true;
      break;
    }

    const filePath = noteFileMap.get(section.noteId);
    if (!filePath) continue;

    let fileContent: string;
    try {
      fileContent = await fs.readFile(filePath, 'utf-8');
    } catch {
      continue;
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
  opts: { maxResults?: number; includeContent?: boolean; topicFilter?: string[]; dateRange?: { start?: string; end?: string } } = {}
): Promise<MemorySearchResult> {
  // Stage 1
  const analysis = analyzeQuery(query);

  // 应用外部过滤
  if (opts.dateRange?.start && opts.dateRange?.end) {
    analysis.timeHint = { type: 'range', start: opts.dateRange.start, end: opts.dateRange.end };
  }

  // Stage 2
  const topicResult = await recallTopics(analysis, workspaceId, db);

  // Stage 3
  const noteResult = await recallNotes(analysis, topicResult, workspaceId, db, opts.maxResults ?? 5);

  // 构建结果
  const result: MemorySearchResult = {
    topics: topicResult.directHits.map((t) => ({ label: t.label, heat: t.heat })),
    notes: noteResult.candidates.map((n) => ({
      id: n.noteId,
      date: n.date,
      topics: n.topics,
      summary: n.summary,
      importance: n.importance
    })),
    totalFound: noteResult.totalFound
  };

  // 可选：附加 section 摘要
  if (opts.includeContent) {
    for (const note of result.notes) {
      const sections = await db.listSectionsByNote(note.id);
      note.sections = sections.map((s: any) => ({
        heading: s.heading,
        summary: s.summary || ''
      }));
    }
  }

  return result;
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
export async function searchWithContent(query: string, workspaceId: string, db: RetrievalDbDeps, maxChars = 4000): Promise<string> {
  const analysis = analyzeQuery(query);
  const topicResult = await recallTopics(analysis, workspaceId, db);
  const noteResult = await recallNotes(analysis, topicResult, workspaceId, db, 10);

  if (noteResult.candidates.length === 0) return '';

  const noteIds = noteResult.candidates.map((c) => c.noteId);
  const sectionCandidates = await recallSections(analysis, noteIds, db, 15);

  // 构建 noteId → filePath 映射
  const noteFileMap = new Map<string, string>();
  for (const noteId of noteIds) {
    const note = await db.getNoteById(noteId);
    if (note?.filePath && note?.workspaceId) {
      const wsRoot = await db.getWorkspaceRoot(note.workspaceId);
      if (wsRoot) {
        noteFileMap.set(noteId, path.join(wsRoot, note.filePath));
      }
    }
  }

  const readResult = await targetedRead(sectionCandidates, noteFileMap, Math.round(maxChars * 0.7));
  return assembleContext(topicResult, noteResult, readResult);
}

// ━━ Helpers ━━

function buildFtsQuery(analysis: QueryAnalysisResult): string {
  const allTerms = [...analysis.topicTerms, ...analysis.entityTerms, ...analysis.keywordTerms].filter(Boolean);
  const unique = [...new Set(allTerms)];
  if (unique.length === 0) return '';
  return unique.map((t) => `"${t}"`).join(' OR ');
}

function resolveTimeRange(hint: QueryAnalysisResult['timeHint']): { start: string; end: string } {
  if (!hint) return { start: '', end: '' };
  const today = new Date().toISOString().slice(0, 10);

  if (hint.type === 'specific' && hint.start) {
    return { start: hint.start, end: hint.end || hint.start };
  }
  if (hint.type === 'recent' && hint.days) {
    const start = new Date(Date.now() - hint.days * 86400000).toISOString().slice(0, 10);
    return { start, end: today };
  }
  if (hint.type === 'range' && hint.start && hint.end) {
    return { start: hint.start, end: hint.end };
  }
  return { start: '', end: '' };
}

function noteToCandidate(note: any, scores: { ftsScore?: number; graphScore?: number; metadataScore?: number } = {}): NoteCandidate {
  return {
    noteId: note.id,
    summary: note.summary || '',
    date: note.date || '',
    importance: note.importance ?? 0.5,
    stability: note.stability ?? 0.5,
    topics: safeJsonParse(note.topics, []),
    keywords: safeJsonParse(note.keywords, []),
    ftsScore: scores.ftsScore ?? 0,
    graphScore: scores.graphScore ?? 0,
    metadataScore: scores.metadataScore ?? 0,
    finalScore: 0
  };
}

function computeFinalScore(candidate: NoteCandidate, analysis: QueryAnalysisResult): number {
  const W_FTS = 0.35;
  const W_GRAPH = 0.25;
  const W_IMPORTANCE = 0.15;
  const W_RECENCY = 0.15;
  const W_ACTION = 0.1;

  // 时效性衰减（半衰期 ≈ 30 天）
  const ageInDays = candidate.date ? (Date.now() - new Date(candidate.date).getTime()) / 86400000 : 30;
  const recencyScore = Math.exp(-0.023 * Math.max(0, ageInDays));

  // 动作意图加权
  let actionScore = 0;
  if (analysis.actionHint === 'decision') {
    actionScore = candidate.topics.some((t) => t.toLowerCase().includes('decision')) ? 1.0 : 0;
  } else if (analysis.actionHint === 'open_loop') {
    actionScore = candidate.topics.some((t) => t.toLowerCase().includes('open')) ? 1.0 : 0;
  }

  return W_FTS * candidate.ftsScore + W_GRAPH * candidate.graphScore + W_IMPORTANCE * candidate.importance + W_RECENCY * recencyScore + W_ACTION * actionScore;
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
