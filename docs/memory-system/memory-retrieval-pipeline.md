# 无向量记忆检索流程设计 v1

> 本文档定义 Chobits 记忆系统在不依赖向量服务时的完整检索流水线。
> 核心策略：结构化元数据过滤 + FTS5 全文检索 + 主题图谱扩展 + 渐进式定点读取。
> 向量检索仅作为未来可插拔增强层，不影响本文档描述的基础检索能力。

## 当前实现状态（2026-04-13）

- 已实现：`analyzeQuery`、`recallTopics`、`recallNotes`、`recallSections`、`targetedRead`、`assembleContext`、`search`、`get`、`browseTopics`、`searchWithContent`。
- `search()` 是稳定的对外主入口，实际执行 Stage 1-3；当 `includeContent=true` 时，只补充 note 的 section 摘要，不自动执行 Stage 4-6。
- `searchWithContent()` 执行完整的 Stage 1-6 流程，当前被 auto-recall enricher 作为正文级检索入口使用。
- 当前检索层已实现 `topicFilter`、LLM 辅助查询分析、LIKE fallback（弥补中文 FTS 分词不足）和 broad recall fallback（无有效搜索词时回退最近记忆）。
- **检索词扩展已实现**（O1）：显式检索现在会在 FTS / LIKE fallback 前做轻量 query rewriting，包括中文 bigram 扩展、分隔词拆分和小范围同义词扩展，提升中文查询与证据型查询的召回率。
- **检索能力对齐已完成**：Electron auto-recall 与 Pi memory tools 现已共享 `searchNotesByTerms`、`listRecentImportant` 等可选检索能力，避免入口间召回能力漂移。
- **Canonical topic alias 写回已实现**：topic 归一化现在会把原始 topic 表述写入 `memory_topics.aliases` / `memory_notes.aliases`，并把 `memory_keywords.primaryTopicId` 绑定到 canonical topic；因此 Stage 2 的 topic recall 和 Route C 的 LIKE fallback 都能更稳定地命中近义 topic。
- **O3 延迟优化已实现**：检索层现支持 `listNotesByIds` / `listSectionsByNoteIds` 批量读取；Stage 3/4 会优先走批量 note/section 加载，Stage 5 会缓存已读 Markdown 文件内容，降低 N+1 DB / 文件读取开销。
- **Auto-recall analysis 复用已实现**：auto-recall 在关键词提取后会直接把已准备好的 `QueryAnalysisResult` 传给 `searchWithContent()`，避免对同一请求再做一轮查询分析。
- **新会话预加载已实现**：`performAutoRecall()` 中当检测到首轮对话（`userMessages.length <= 1`）且 `db.listRecentImportant` 可用时，自动注入近 7 天高重要度（≥ 0.7）记忆摘要 + `MEMORY.md` 的 always-loaded layer（`Critical Facts` / `User Preferences` / `Active Projects`，5 分钟缓存 TTL），无需关键词搜索。
- **Domain 命名空间过滤已实现**（I-4）：Stage 2 Step 2d 会根据查询中的人名/项目名尝试匹配 `person:Name` 或 `project:Name` 域的主题，提升召回准确度。
- **实体事实图谱扩展已实现**（I-3）：Stage 2 Step 2e 会查询 `entity_fact` 边关联的 `evidenceNoteId`，并将它们写入 `factNoteIds`。Stage 3 再直接把这些 note ids 合并进 note candidate 集，不再把 note id 误当作 topic id 走 topic expansion。
- **检索评分透明度已实现**（P2-4）：`search({ debug: true })`、`memory:search(debug=true)` 和 `memorySearchTool(debug=true)` 现在都会返回 `debug.analysis`、`debug.weights`、`debug.topicRecall`、`debug.noteRanking`，并在每条 note 上附带 `scoreBreakdown.matchReasons`。
- 当前运行时已注册 5 个 memory tools：`memorySearchTool`、`memoryGetTool`、`memoryTopicsTool`、`memorySaveTool`、`memoryDiaryTool`。其中前 4 个进入 `DEFAULT_SESSION_TOOL_IDS`；`memoryDiaryTool` 只完成注册与写文件，当前不在默认 session tool 列表中，也不参与索引/检索闭环。
- **自动记忆召回已实现**：通过 `memory-auto-recall` enricher，在每轮对话的 system prompt 构建阶段自动检索并注入相关记忆。支持通过 `memory-config.json` 中的 `autoRecallEnabled` 开关控制。详见下方「自动记忆召回」章节。

---

## 1. 检索总览

```
用户提问 / Agent 需要记忆
        │
        ▼
  ┌─────────────────┐
  │ Stage 1          │  Query Analysis（查询分析）
  │ 拆解查询意图      │  → 主题词、实体词、时间词、动作词
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │ Stage 2          │  Topic Recall（主题召回）
  │ 图谱导航          │  → 命中 topic 节点 + 子主题扩展
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │ Stage 3          │  Note Recall（笔记召回）
  │ 元数据 + FTS      │  → 候选 note 列表 + 排序
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │ Stage 4          │  Section Recall（段落召回）
  │ 段落级精确命中     │  → 命中的 section 摘要 + 行号
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │ Stage 5          │  Targeted Read（定点读取）
  │ 从 Markdown 读取  │  → 精确段落正文
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │ Stage 6          │  Context Assembly（上下文组装）
  │ token 预算裁剪    │  → 注入到对话上下文
  └─────────────────┘
```

---

## 2. Stage 1: Query Analysis（查询分析）

### 2.1 目标

把用户的自然语言查询拆解为结构化检索信号，减少对语义匹配的依赖。

### 2.2 拆解维度

| 维度             | 说明                           | 示例                             |
| ---------------- | ------------------------------ | -------------------------------- |
| `topicTerms`     | 主题词，用于 topic graph 匹配  | "科技"、"AI Agent"               |
| `entityTerms`    | 实体词（产品名、人名、技术名） | "OpenClaw"、"sqlite-vec"         |
| `keywordTerms`   | 普通关键词，用于 FTS 检索      | "记忆检索"、"渐进式召回"         |
| `timeHint`       | 时间信号                       | "最近"、"上周"、"3月"            |
| `actionHint`     | 动作意图                       | "聊过"、"决定了"、"待确认"       |
| `topicDrillPath` | 链式钻取路径                   | ["科技", "AI Agent", "记忆系统"] |

### 2.3 实现方式

**方案 A：规则解析（低成本，第一阶段推荐）**

```typescript
export interface QueryAnalysisResult {
  topicTerms: string[];
  entityTerms: string[];
  keywordTerms: string[];
  timeHint?: { type: 'recent' | 'range' | 'specific'; days?: number; start?: string; end?: string };
  actionHint?: 'recall' | 'decision' | 'open_loop' | 'evidence' | 'general';
  topicDrillPath?: string[];
  originalQuery: string;
}

function analyzeQuery(query: string): QueryAnalysisResult {
  // 1. 时间词提取
  const timePatterns = [
    { regex: /最近|近期|lately/i, type: 'recent' as const, days: 7 },
    { regex: /上周|last\s*week/i, type: 'recent' as const, days: 14 },
    { regex: /上个月|last\s*month/i, type: 'recent' as const, days: 30 },
    { regex: /今天|today/i, type: 'recent' as const, days: 1 },
    { regex: /(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})/, type: 'specific' as const }
  ];

  // 2. 动作词提取
  const actionPatterns = [
    { regex: /聊过|讨论过|谈到|mentioned|discussed/i, hint: 'recall' as const },
    { regex: /决定|定了|确认|decided|confirmed/i, hint: 'decision' as const },
    { regex: /待|要做|未完成|todo|pending/i, hint: 'open_loop' as const }
  ];

  // 3. 剥离时间词和动作词后，剩余部分按空格/标点拆为 keyword terms
  // 4. 从 keyword terms 中识别已知 entity（匹配 memory_keywords 表）
  // 5. 从 keyword terms 中识别已知 topic（匹配 memory_topics 表）

  // ... 规则实现
}
```

**当前实现补充**：

- `analyzeQuery()` 内置了中英文 stop words 过滤，避免把“之前”“我们”“一下”“the”等弱信号词直接塞进检索 token。
- 如果剥离时间词、动作词后没有剩余有效 token，当前实现会标记 `broadRecall = true`，交给后续召回阶段走“最近记忆兜底”。

**方案 B：LLM 辅助解析（高质量，第二阶段可选）**

当规则解析效果不足时，可用一次轻量 LLM 调用做查询分析：

```typescript
const QUERY_ANALYSIS_PROMPT = `
你是一个查询分析器。把用户的查询拆解为以下 JSON 格式：
{
  "topicTerms": ["主题词1", "主题词2"],
  "entityTerms": ["产品名/人名/技术名"],
  "keywordTerms": ["其他关键词"],
  "timeHint": { "type": "recent|range|specific", "days": 7 },
  "actionHint": "recall|decision|open_loop|evidence|general",
  "topicDrillPath": ["大主题", "子主题", "更细的主题"]
}
只输出 JSON，不要解释。
`;
```

### 2.4 输出

`QueryAnalysisResult` 作为后续所有 Stage 的输入信号。

---

## 3. Stage 2: Topic Recall（主题召回）

### 3.1 目标

从 topic graph 中找到与查询相关的主题节点，并沿图谱扩展到子主题和邻接主题。

### 3.2 流程

```
topicTerms + entityTerms
        │
        ▼
  ┌────────────────────────────────┐
  │ Step 2a: 直接匹配              │
  │ label / slug / aliases         │
  │ LIKE 或精确匹配                │
  └──────────┬─────────────────────┘
             │ 命中的 topic IDs
             ▼
  ┌────────────────────────────────┐
  │ Step 2b: 关键词关联匹配        │
  │ memory_keywords.canonical      │
  │ → primaryTopicId               │
  └──────────┬─────────────────────┘
             │ 补充 topic IDs
             ▼
  ┌────────────────────────────────┐
  │ Step 2c: 图谱扩展              │
  │ ① 子主题（parentId = ?）       │
  │ ② 邻接主题（edge 关联）        │
  │ 最多扩展 2 层，热度优先         │
  └──────────┬─────────────────────┘
             │ 扩展后的 topic set
             ▼
         输出：TopicRecallResult
```

### 3.3 SQL 片段

```sql
-- Step 2a: 直接匹配 topic
SELECT id, label, slug, heat, noteCount
FROM memory_topics
WHERE workspaceId = :wsId AND deletedAt IS NULL
  AND (
    label LIKE :term
    OR slug LIKE :slugTerm
    OR aliases LIKE :aliasTerm
  )
ORDER BY heat DESC
LIMIT 10;

-- Step 2b: 关键词 → 主题
SELECT DISTINCT mt.id, mt.label, mt.heat
FROM memory_keywords mk
JOIN memory_topics mt ON mk.primaryTopicId = mt.id
WHERE mk.workspaceId = :wsId
  AND (mk.canonical LIKE :term OR mk.aliases LIKE :term)
LIMIT 10;

-- Step 2c: 子主题扩展（1 层）
SELECT id, label, heat, noteCount
FROM memory_topics
WHERE parentId IN (:hitTopicIds) AND deletedAt IS NULL
ORDER BY heat DESC
LIMIT 20;

-- Step 2c: 邻接主题扩展
SELECT DISTINCT e.targetId, mt.label, mt.heat
FROM memory_edges e
JOIN memory_topics mt ON e.targetId = mt.id
WHERE e.sourceType = 'topic' AND e.sourceId IN (:hitTopicIds)
  AND e.targetType = 'topic'
  AND e.relationType IN ('parent_topic_of', 'related_to_topic')
LIMIT 20;
```

### 3.4 输出

```typescript
export interface TopicRecallResult {
  directHits: Array<{ id: string; label: string; heat: number; matchType: 'label' | 'alias' | 'keyword' }>;
  expanded: Array<{ id: string; label: string; heat: number; depth: number }>;
  factNoteIds: string[]; // I-3: entity_fact -> evidenceNoteId 的直连 note ids
  allTopicIds: string[]; // directHits + expanded 的去重 topic ids
}
```

### 3.5 Step 2d: Domain 命名空间过滤（I-4）

如果查询中包含人名或项目名，尝试匹配 `memory_topics.domain` 字段，获取该领域下所有主题：

```typescript
// 检测查询中的人名/项目名
// 如果 entityTerms 中有 "Alice"，构造 domainKey = "person:Alice"
// 如果 entityTerms 中有 "chobits"，构造 domainKey = "project:chobits"

const domainTopics = await db.findTopicsByDomain(domainKey, workspaceId);
// 将命中的 topic 加入 allTopicIds
```

域匹配的主题权重略低于直接匹配（heat × 0.8），避免对非相关主题的过度扩展。

### 3.6 Step 2e: 实体事实图谱扩展（I-3）

如果查询中包含已知实体名，查询 `memory_edges` 中的 `entity_fact` 边，获取关联的 note 作为额外候选：

```typescript
// 查询实体相关的事实边
const entityFacts = await db.queryEntityFacts(entityName, { workspaceId, limit: 10 });
const factNoteIds = entityFacts
  .map((fact) => fact.evidenceNoteId)
  .filter(Boolean);

// 注意：这些 evidence note 不进入 allTopicIds，
// 而是在 Stage 3 中通过 getNoteById(noteId) 直接并入候选集
```

支持 point-in-time 查询：通过 `validFrom <= asOf` 且 `(validTo IS NULL OR validTo > asOf)` 过滤，只返回当前有效的事实。

---

## 4. Stage 3: Note Recall（笔记召回）

### 4.1 目标

综合元数据过滤 + FTS 全文命中 + 图谱关联，产出一个排序后的候选 note 列表。

### 4.2 候选生成（当前实现额外包含广泛召回兜底）

```
          TopicRecallResult.allTopicIds + TopicRecallResult.factNoteIds
          QueryAnalysisResult.*
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
  ┌──────────┐ ┌──────────┐ ┌──────────┐
  │ Route A  │ │ Route B  │ │ Route C  │
  │ 图谱关联 │ │ FTS 命中 │ │ 元数据   │
  │ note     │ │ note     │ │ 过滤note │
  └────┬─────┘ └────┬─────┘ └────┬─────┘
       │            │            │
       └────────────┼────────────┘
                    ▼
            候选合并 + 融合排序
                    │
                    ▼
            Top-N note 列表
```

#### Route A: 图谱关联

```sql
-- 从命中的 topic 出发，查归属的 note
SELECT DISTINCT mn.id, mn.summary, mn.date, mn.importance,
       mn.stability, mn.topics, mn.keywords
FROM memory_edges me
JOIN memory_notes mn ON me.targetId = mn.id
WHERE me.sourceType = 'topic'
  AND me.sourceId IN (:allTopicIds)
  AND me.targetType = 'note'
  AND me.relationType IN ('belongs_to_topic', 'related_to_topic')
  AND mn.deletedAt IS NULL
  AND mn.workspaceId = :wsId
ORDER BY mn.date DESC
LIMIT 50;
```

#### Route A2: 实体事实 evidence note 直连

```typescript
for (const noteId of topicResult.factNoteIds) {
  const note = await db.getNoteById(noteId);
  if (note) {
    mergeNoteCandidate(candidateMap, note, { graphScore: 0.9 });
  }
}
```

这一路不会调用 `listNotesByTopicId()`，避免把 note id 误路由成 topic id。

#### Route B: FTS 全文命中

```sql
-- 用关键词在 FTS5 中搜索 note 级条目
SELECT entry_id AS noteId, rank
FROM memory_notes_fts
WHERE memory_notes_fts MATCH :ftsQuery  -- 拼接的 FTS5 查询表达式
  AND entry_type = 'note'
ORDER BY rank
LIMIT 50;
```

FTS 查询表达式构建规则：

```typescript
function buildFtsQuery(analysis: QueryAnalysisResult): string {
  const parts: string[] = [];

  // 所有主题词和关键词用 OR 连接
  const allTerms = [...analysis.topicTerms, ...analysis.entityTerms, ...analysis.keywordTerms].filter(Boolean);

  if (allTerms.length > 0) {
    // 多个词用 OR 连接，让 FTS5 做宽召回
    parts.push(allTerms.map((t) => `"${t}"`).join(' OR '));
  }

  return parts.join(' ') || '*';
}
```

#### Route C: 元数据过滤

```sql
-- 时间范围 + 重要度 + 关键词 JSON 匹配
SELECT id, summary, date, importance, stability, topics, keywords
FROM memory_notes
WHERE workspaceId = :wsId AND deletedAt IS NULL
  AND (:dateStart IS NULL OR date >= :dateStart)
  AND (:dateEnd IS NULL OR date <= :dateEnd)
  AND importance >= :minImportance
  -- JSON 关键词匹配（补充 FTS 没命中的情况）
  AND (
    keywords LIKE :kwLike1
    OR keywords LIKE :kwLike2
    OR topics LIKE :topicLike1
    OR aliases LIKE :aliasLike1
  )
ORDER BY date DESC, importance DESC
LIMIT 50;
```

#### Route D: 广泛召回兜底（当前实现）

当 `analyzeQuery()` 没有得到有效搜索词，且 Route A-C 也没有产生命中候选时，当前实现会回退到“最近记忆”：

```typescript
if (analysis.broadRecall && candidateMap.size === 0) {
  const recentNotes = await db.listNotesByWorkspace(workspaceId, maxResults * 2, 0);
  for (const note of recentNotes) {
    if (!candidateMap.has(note.id)) {
      candidateMap.set(note.id, noteToCandidate(note, { metadataScore: 0.3 }));
    }
  }
}
```

### 4.3 融合排序

候选集合合并后去重，按加权分数排序：

```typescript
const RETRIEVAL_SCORE_WEIGHTS = {
  fts: 0.35,
  graph: 0.25,
  metadata: 0,
  importance: 0.15,
  recency: 0.15,
  action: 0.1
};

export interface NoteScoreBreakdown {
  weights: typeof RETRIEVAL_SCORE_WEIGHTS;
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

function computeScoreBreakdown(candidate: NoteCandidate, analysis: QueryAnalysisResult): NoteScoreBreakdown {
  const ageInDays = daysSince(candidate.date);
  const recencyScore = Math.exp(-0.023 * ageInDays); // 半衰期 ≈ 30 天
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
    weights: RETRIEVAL_SCORE_WEIGHTS,
    raw,
    weighted,
    ageInDays,
    matchReasons: candidate.matchReasons,
    finalScore: weighted.fts + weighted.graph + weighted.metadata + weighted.importance + weighted.recency + weighted.action
  };
}
```

当前实现中，`matchReasons` 会保留候选是通过哪条召回路径进入排序的，例如：

- `topic:topic_runtime:direct`
- `topic:topic_memory:expanded`
- `entity_fact`
- `fts:note`
- `like_fallback`
- `date_range`
- `broad_recall`

### 4.4 输出

```typescript
export interface NoteRecallResult {
  candidates: NoteCandidate[]; // 已排序，Top-N
  totalFound: number;
}

export interface MemorySearchDebugInfo {
  analysis: QueryAnalysisResult;
  weights: RetrievalScoreWeights;
  topicRecall: TopicRecallResult;
  noteRanking: Array<{
    rank: number;
    noteId: string;
    scoreBreakdown: NoteScoreBreakdown;
  }>;
}
```

默认 Top-N = 10，可根据 token 预算调整。显式搜索入口在 `debug=true` 时，会把 `scoreBreakdown` 挂到每条返回 note 上，并额外返回 `MemorySearchDebugInfo`，方便对排序结果做可解释性排查。

---

## 5. Stage 4: Section Recall（段落召回）

### 5.1 目标

对 Top-N note 做段落级精确命中，找到与查询最相关的具体段落。

### 5.2 流程

```
Top-N note IDs + 原始查询
        │
        ▼
  ┌────────────────────────────────┐
  │ Step 4a: Section 元数据过滤    │
  │ 按 actionHint 优先匹配段落类型 │
  │ decision → "Key Points" 段          │
  │ evidence → "Source Excerpts" 优先   │
  │ open_loop → "Open Items" 段         │
  │ contradiction → "Contradictions" 段 │
  └──────────┬─────────────────────┘
             │
             ▼
  ┌────────────────────────────────┐
  │ Step 4b: Section FTS 命中      │
  │ 在 memory_notes_fts 中搜索     │
  │ entry_type = 'section'         │
  │ note_id IN (Top-N)            │
  └──────────┬─────────────────────┘
             │
             ▼
  ┌────────────────────────────────┐
  │ Step 4c: Section 关键词匹配    │
  │ memory_sections.keywords       │
  │ JSON LIKE 匹配                 │
  └──────────┬─────────────────────┘
             │
             ▼
        合并 + 排序
             │
             ▼
     SectionRecallResult
```

### 5.3 SQL 片段

```sql
-- Step 4b: section FTS 命中
SELECT entry_id AS sectionId, note_id AS noteId, rank
FROM memory_notes_fts
WHERE memory_notes_fts MATCH :ftsQuery
  AND entry_type = 'section'
  AND note_id IN (:topNNoteIds)
ORDER BY rank
LIMIT 30;

-- Step 4a: actionHint 优先匹配
SELECT id, noteId, heading, summary, lineStart, lineEnd, charCount
FROM memory_sections
WHERE noteId IN (:topNNoteIds)
  AND heading LIKE :actionHeading  -- 如 '%Source Excerpts%' / '%Key Points%' / '%Contradictions%'
ORDER BY sectionOrder;

-- Step 4c: 关键词匹配
SELECT id, noteId, heading, summary, lineStart, lineEnd, charCount
FROM memory_sections
WHERE noteId IN (:topNNoteIds)
  AND (keywords LIKE :kw1 OR keywords LIKE :kw2)
ORDER BY sectionOrder;
```

### 5.4 输出

```typescript
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

export interface SectionRecallResult {
  sections: SectionCandidate[]; // 已排序
  noteIds: string[]; // 涉及的 note ID 集合
}
```

---

## 6. Stage 5: Targeted Read（定点读取）

### 6.1 目标

从 Markdown 文件中精确读取命中段落的正文内容。

### 6.2 流程

```
SectionRecallResult.sections
        │
        ▼
  ┌────────────────────────────────┐
  │ Step 5a: 解析 note 文件路径    │
  │ memory_notes.filePath          │
  │ → workspace 绝对路径           │
  └──────────┬─────────────────────┘
             │
             ▼
  ┌────────────────────────────────┐
  │ Step 5b: 按行号读取            │
  │ 读取 lineStart ~ lineEnd      │
  │ 跳过 frontmatter 区域          │
  └──────────┬─────────────────────┘
             │
             ▼
  ┌────────────────────────────────┐
  │ Step 5c: token 预算检查        │
  │ 累积字符数 ≤ maxChars          │
  │ 超预算时截断或跳过低分段落      │
  └──────────┬────────────────────-┘
             │
             ▼
       TargetedReadResult
```

### 6.3 实现

```typescript
import * as fs from 'node:fs/promises';

export interface ReadSection {
  noteId: string;
  heading: string;
  content: string; // 读取到的正文
  lineStart: number;
  lineEnd: number;
  truncated: boolean; // 是否被 token 预算截断
}

export interface TargetedReadResult {
  sections: ReadSection[];
  totalCharsRead: number;
  budgetExhausted: boolean;
}

async function targetedRead(
  sections: SectionCandidate[],
  notePathMap: Map<string, string>, // noteId → 绝对路径
  maxChars: number = 4000
): Promise<TargetedReadResult> {
  const result: ReadSection[] = [];
  let totalChars = 0;
  let budgetExhausted = false;

  for (const section of sections) {
    if (totalChars >= maxChars) {
      budgetExhausted = true;
      break;
    }

    const filePath = notePathMap.get(section.noteId);
    if (!filePath) continue;

    const content = await readLines(filePath, section.lineStart, section.lineEnd);
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
      // 截断到预算内
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

async function readLines(filePath: string, startLine: number, endLine: number): Promise<string> {
  const fileContent = await fs.readFile(filePath, 'utf-8');
  const lines = fileContent.split('\n');
  // 行号 1-based
  return lines.slice(startLine - 1, endLine).join('\n');
}
```

---

## 7. Stage 6: Context Assembly（上下文组装）

### 7.1 目标

把检索结果组装成可注入对话上下文的结构化文本。

### 7.2 注入格式

```typescript
function assembleMemoryContext(topicResult: TopicRecallResult, noteResult: NoteRecallResult, sectionResult: SectionRecallResult, readResult: TargetedReadResult): string {
  const parts: string[] = [];

  // ━━ 第一层：主题概览 ━━
  if (topicResult.directHits.length > 0) {
    parts.push('## 相关记忆主题');
    for (const topic of topicResult.directHits.slice(0, 5)) {
      parts.push(`- **${topic.label}**（活跃度: ${topic.heat.toFixed(2)}）`);
    }
    parts.push('');
  }

  // ━━ 第二层：note 摘要 ━━
  if (noteResult.candidates.length > 0) {
    parts.push('## 相关记忆摘要');
    for (const note of noteResult.candidates.slice(0, 5)) {
      parts.push(`### ${note.topics.join(', ')}（${note.date}）`);
      parts.push(note.summary);
      parts.push('');
    }
  }

  // ━━ 第三层：命中段落正文 ━━
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
```

### 7.3 Token 预算分配

| 层级      | 预算占比 | 默认字符数 | 说明                   |
| --------- | -------- | ---------- | ---------------------- |
| 主题概览  | 5%       | ~200       | 只列出主题名和活跃度   |
| note 摘要 | 25%      | ~1000      | summary 字段，不含正文 |
| 段落正文  | 70%      | ~2800      | 命中段落的实际内容     |
| **总计**  | **100%** | **~4000**  | 默认上限，可配置       |

> 4000 字符 ≈ 1500~2000 tokens（中文），保守控制在模型上下文的 10~15%。

### 7.4 注入时机

| 场景           | 注入方式                  | 触发条件           |
| -------------- | ------------------------- | ------------------ |
| 对话开始       | 预加载最近高重要度记忆    | 新会话且有历史记忆 |
| 用户提问       | 按查询实时检索并注入      | Agent 判断需要回忆 |
| Agent 主动调用 | 通过 memory tool 手动检索 | Agent 使用 tool    |

---

## 8. Agent 工具接口定义

### 8.1 memory_search — 记忆搜索

Agent 可调用的主搜索工具，返回摘要级结果。

```typescript
import { Type } from '@sinclair/typebox';

const memorySearchParameters = Type.Object({
  query: Type.String({ description: '搜索查询，自然语言描述想要回忆的内容' }),
  topicFilter: Type.Optional(
    Type.Array(Type.String(), {
      description: '限定搜索的主题范围，如 ["AI Agent", "记忆系统"]'
    })
  ),
  dateRange: Type.Optional(
    Type.Object({
      start: Type.Optional(Type.String({ description: '起始日期 YYYY-MM-DD' })),
      end: Type.Optional(Type.String({ description: '结束日期 YYYY-MM-DD' }))
    })
  ),
  maxResults: Type.Optional(
    Type.Number({
      description: '最大返回条数，默认 5',
      minimum: 1,
      maximum: 20
    })
  ),
  includeContent: Type.Optional(
    Type.Boolean({
      description: '是否附带各 note 的 section 摘要，默认 false（不自动读取段落正文）'
    })
  )
});
```

**返回格式**：

```typescript
interface MemorySearchResult {
  topics: Array<{ label: string; heat: number }>;
  notes: Array<{
    id: string;
    date: string;
    topics: string[];
    summary: string;
    importance: number;
    sections?: Array<{
      heading: string;
      summary: string;
    }>;
  }>;
  totalFound: number;
}
```

**Tool 注册**（在 tool-registry.ts 中）：

```typescript
// DEFAULT_TOOL_METADATA 中添加
'memory-search': {
  category: 'query',
  description: '搜索长期记忆，回忆过去的对话要点、决策和偏好。返回匹配的记忆摘要。',
  compatName: 'memorySearchTool',
  name: 'memorySearchTool',
  status: 'ready-for-pi-runtime',
},
```

### 8.2 memory_get — 记忆读取

按 note ID + section heading 精确读取正文，用于在 search 之后获取详细内容。

```typescript
const memoryGetParameters = Type.Object({
  noteId: Type.String({ description: '记忆 note ID（从 memory_search 结果获取）' }),
  section: Type.Optional(
    Type.String({
      description: '段落标题，如 "Key Points" 或 "Open Items"。不填则返回整篇 note 的标题树。'
    })
  ),
  lineRange: Type.Optional(
    Type.Object({
      start: Type.Number({ description: '起始行号（1-based）' }),
      end: Type.Number({ description: '结束行号（1-based）' })
    })
  )
});
```

**返回格式**：

```typescript
interface MemoryGetResult {
  noteId: string;
  date: string;
  topics: string[];
  // 如果请求了 section：
  content?: string; // 段落正文
  heading?: string;
  lineRange?: { start: number; end: number };
  // 如果没有请求 section（返回标题树）：
  outline?: Array<{
    heading: string;
    level: number;
    summary: string;
    charCount: number;
  }>;
}
```

**Tool 注册**：

```typescript
'memory-get': {
  category: 'content',
  description: '读取记忆 note 的具体段落内容。先用 memory_search 找到 note，再用 memory_get 读取详情。',
  compatName: 'memoryGetTool',
  name: 'memoryGetTool',
  status: 'ready-for-pi-runtime',
},
```

### 8.3 memory_topics — 主题浏览

浏览主题图谱，用于链式导航。

```typescript
const memoryTopicsParameters = Type.Object({
  topicId: Type.Optional(
    Type.String({
      description: '主题 ID。不填则返回根主题列表（按活跃度排序）。'
    })
  ),
  action: Type.Optional(
    Type.Union(
      [
        Type.Literal('children'), // 查看子主题
        Type.Literal('related'), // 查看关联主题
        Type.Literal('notes') // 查看该主题下的 note 列表
      ],
      { description: '操作类型，默认 children' }
    )
  ),
  limit: Type.Optional(
    Type.Number({
      description: '返回数量，默认 10',
      minimum: 1,
      maximum: 50
    })
  )
});
```

**返回格式**：

```typescript
interface MemoryTopicsResult {
  topic?: { id: string; label: string; description?: string; heat: number; noteCount: number };
  children?: Array<{ id: string; label: string; heat: number; noteCount: number }>;
  related?: Array<{ id: string; label: string; heat: number; relationType: string }>;
  notes?: Array<{ id: string; date: string; summary: string; importance: number }>;
}
```

**Tool 注册**：

```typescript
'memory-topics': {
  category: 'query',
  description: '浏览记忆主题图谱。查看主题层级、相关主题、某主题下的记忆列表。',
  compatName: 'memoryTopicsTool',
  name: 'memoryTopicsTool',
  status: 'ready-for-pi-runtime',
},
```

### 8.4 memory_save — 记忆写入

把重要信息主动写入长期记忆，适用于用户明确要求“记住”，或者对话中出现稳定偏好、重要决策、项目计划等长期有价值的信息。

```typescript
const memorySaveParameters = Type.Object({
  topic: Type.String({ description: '记忆主题标签，简短概括，如「用户偏好」「项目计划」「技术决策」' }),
  content: Type.String({ description: '要保存的记忆内容（Markdown 格式）' }),
  keywords: Type.Array(Type.String(), { description: '关键词列表，至少 2 个，用于日后检索', minItems: 2 }),
  importance: Type.Optional(Type.Number({ description: '重要度 0.0~1.0，默认 0.7', minimum: 0, maximum: 1 })),
  summary: Type.Optional(Type.String({ description: '一句话摘要；不提供时由系统根据 content 截取' }))
});
```

**当前实现说明**：

- 工具位于 `packages/ai/runtime/pi/tools/memory-save.ts`。
- 当前会创建一个单主题 note，并把 `content` 写入 `Key Points` 段。
- 如果当前对话有 `conversationId`，会写入 `sourceConversationIds` 作为溯源。

**Tool 注册**：

```typescript
'memory-save': {
  category: 'content',
  description: '将重要信息保存到长期记忆（用户要求记住或对话中出现重要内容时自主保存）',
  compatName: 'memorySaveTool',
  name: 'memorySaveTool',
  status: 'ready-for-pi-runtime',
},
```

### 8.5 memory_diary — Agent 日记（I-7，当前为日志面）

`memoryDiaryTool` 当前是一个已注册但部分接线的能力：AI 可以把观察、经验和处理策略追加写入 `memory/diary/YYYY-MM-DD.md`。这些 diary 文件当前不会进入 memory DB / FTS / topic graph，也不在 `DEFAULT_SESSION_TOOL_IDS` 中默认启用，因此它更接近日志面，而不是可检索的事实记忆面。

```typescript
const memoryDiaryParameters = Type.Object({
  entry: Type.String({ description: '日记内容：记录本次对话中的观察、学到的东西、处理策略等经验总结' }),
  tags: Type.Optional(
    Type.Array(Type.String(), {
      description: '可选标签，用于分类检索，如 ["调试技巧", "用户偏好"]'
    })
  )
});
```

**写入格式**：

```markdown
# Agent Diary — 2026-04-12

### 14:32:05 [调试技巧, 用户偏好]

内容文本
```

**Tool 注册状态**：

```typescript
'memory-diary': {
  category: 'content',
  description: '写入 AI 观察日记（行为模式、偏好变化、新发现等）',
  compatName: 'memoryDiaryTool',
  name: 'memoryDiaryTool',
  status: 'ready-for-pi-runtime',
},
```

说明：

- 已注册 tool metadata，并可按需调用。
- 当前未加入 `DEFAULT_SESSION_TOOL_IDS`。
- 当前不会被 memory 检索、auto-recall 或内容生成服务消费。

---

## 9. IPC 接口定义

Renderer 进程通过 IPC 访问记忆系统。

### 9.1 IPC Channel 清单

| Channel                          | 方向            | 说明                         |
| -------------------------------- | --------------- | ---------------------------- |
| `memory:search`                  | renderer → main | 搜索记忆                     |
| `memory:get`                     | renderer → main | 读取记忆详情                 |
| `memory:topics`                  | renderer → main | 浏览主题图谱                 |
| `memory:listNotes`               | renderer → main | 列出记忆 note（分页）        |
| `memory:syncStatus`              | renderer → main | 查询同步任务状态             |
| `memory:triggerSync`             | renderer → main | 手动触发记忆提取             |
| `memory:rebuildIndex`            | renderer → main | 当前仅重建 FTS 索引          |
| `memory:deleteNote`              | renderer → main | 删除记忆 note                |
| `memory:graphData`               | renderer → main | 获取图谱数据（未来 UI 用）   |
| `memory:stats`                   | renderer → main | 获取 note/topic/edge 统计    |
| `memory:cleanupForConversations` | renderer → main | 按 conversation 清理相关记忆 |
| `memory:clearAll`                | renderer → main | 清空记忆数据                 |

### 9.2 Preload Bridge

```typescript
// electron/preload/apis/memory.ts
export const memoryApi = {
  search: (params: MemorySearchParams) => ipcRenderer.invoke('memory:search', params),
  get: (params: MemoryGetParams) => ipcRenderer.invoke('memory:get', params),
  topics: (params: MemoryTopicsParams) => ipcRenderer.invoke('memory:topics', params),
  listNotes: (params: { workspaceId: string; limit?: number; offset?: number }) => ipcRenderer.invoke('memory:listNotes', params),
  syncStatus: () => ipcRenderer.invoke('memory:syncStatus'),
  triggerSync: (params?: { workspaceId?: string; date?: string; conversationIds?: string[]; force?: boolean }) => ipcRenderer.invoke('memory:triggerSync', params),
  rebuildIndex: () => ipcRenderer.invoke('memory:rebuildIndex'),
  deleteNote: (noteId: string) => ipcRenderer.invoke('memory:deleteNote', noteId),
  graphData: (params?: { topicId?: string; workspaceId?: string; includeNotes?: boolean; maxTopics?: number; maxEdges?: number }) => ipcRenderer.invoke('memory:graphData', params),
  cleanupForConversations: (params: { conversationIds: string[] }) => ipcRenderer.invoke('memory:cleanupForConversations', params),
  clearAll: (params?: { workspaceId?: string }) => ipcRenderer.invoke('memory:clearAll', params),
  stats: (params?: { workspaceId?: string }) => ipcRenderer.invoke('memory:stats', params)
};
```

其中 `MemorySearchParams` 现支持可选 `debug?: boolean`，用于返回显式检索的评分拆解和召回路径解释。

---

## 10. 自动记忆召回（Auto-Recall）

### 10.1 设计概览

自动记忆召回通过 `SystemPromptEnricher` 机制，在每轮对话的 system prompt 构建阶段自动检索并注入相关记忆。无需 Agent 显式调用 tool，用户的对话上下文中已包含相关记忆信息。

**设计灵感**：参考 Claude Code 的 `findRelevantMemories` 机制——扫描记忆文件头信息，用轻量模型选最相关的记忆注入上下文。Chobits 在此基础上结合已有的 6 阶段检索流水线，实现更精确的结构化检索。

**核心设计决策**：

- **AI 评估关键词**（pre-search）：由 AI 判断是否需要搜索记忆 + 提取最优搜索关键词
- **规则排序结果**（post-search）：搜索后的关联性判断由已有的 fusion scoring（FTS + 主题图谱 + 重要度 + 时效性）完成，不再额外调用 AI 评估结果
- **理由**：一次 AI 调用（关键词提取）比两次（关键词 + 结果筛选）更高效；已有的 scoring 算法对结构化数据的相关性排序已足够精确

### 10.2 召回流程

```
用户发送消息
    │
    ▼
┌──────────────────────────────┐
│ Stage 1: 规则分诊 (Triage)    │  ← 0ms，纯规则
│ 跳过：问候、感谢、太短、空消息  │
│ 通过：有实质内容的消息          │
└──────┬───────────────────────┘
       │ 通过
       ▼
┌──────────────────────────────┐
│ 缓存检查                      │
│ 同一对话每 N 轮才重新检索      │
│ 显式引用记忆的信号词绕过缓存    │
└──────┬───────────────────────┘
       │ 未命中 / 过期
       ▼
┌──────────────────────────────┐
│ Stage 2: 关键词提取           │
│ ┌─ AI 提取 (useLlmKeywords)  │  ← ~100ms, maxTokens=256
│ │  判断 needsRecall + 提取    │
│ │  2-5 个关键词               │
│ └─ 规则降级                   │  ← AI 不可用时使用
│    分词 + 停用词过滤           │
└──────┬───────────────────────┘
       │ keywords (non-empty)
       ▼
┌──────────────────────────────┐
│ Stage 3: 结构化检索           │  ← 复用 searchWithContent()
│ FTS5 + 主题图谱 + 定点读取    │    完整 Stage 1-6 流水线
└──────┬───────────────────────┘
       │ assembled context
       ▼
┌──────────────────────────────┐
│ Context Assembly              │
│ 包装为 <recalled_memories>    │
│ 注入 system prompt            │
└──────────────────────────────┘
```

### 10.3 文件结构

| 文件                                                           | 职责                                         |
| -------------------------------------------------------------- | -------------------------------------------- |
| `packages/ai/services/memory-auto-recall.ts`                   | 核心服务：分诊、关键词提取、搜索、缓存管理   |
| `electron/main/handlers/memory/memory-auto-recall-enricher.ts` | 桥接层：注册 enricher、提供 DB 依赖和 chatFn |

### 10.4 配置参数

```typescript
interface AutoRecallConfig {
  enabled: boolean; // 是否启用，默认 true
  maxContextChars: number; // 召回上下文最大字符数，默认 3000
  recallInterval: number; // 同一对话中两次召回的最小轮次间隔，默认 3
  useLlmKeywords: boolean; // 是否使用 AI 提取关键词，默认 true
}
```

### 10.5 缓存策略

- 每个对话维护一个 `RecallCacheEntry`（结果 + 消息计数 + 时间戳）
- 缓存命中条件：同一对话、轮次差 < `recallInterval`、未过期（30 分钟 TTL）
- 缓存绕过条件：用户消息包含记忆信号词（"之前"、"上次"、"remember" 等）
- 缓存容量：最多 50 个对话，超限时淘汰最旧的 25%

### 10.6 注入格式

```xml
以下是你想到的可能相关的信息：
<recalled_memories>
## 相关记忆主题
...
## 相关记忆摘要
...
## 记忆详情
</recalled_memories>
如果想到的内容与当前话题直接相关，可以自然地融入回复。
如果内容不太相关，可以忽略，记忆如果出现偏差，以当前对话为准。
```

### 10.7 与显式 Tool 调用的关系

自动召回和现有的 Agent tool（`memorySearchTool`、`memoryGetTool` 等）互补：

| 场景                     | 自动召回      | Agent Tool                     |
| ------------------------ | ------------- | ------------------------------ |
| 用户偏好/背景            | ✅ 自动注入   | 不需要                         |
| 用户主动问"之前说了什么" | ✅ 自动注入 + | Agent 可再调用 tool 补充       |
| 精确查找特定记忆         | 可能不够精确  | ✅ Agent 调用 memoryGetTool    |
| 浏览主题图谱             | ❌ 不支持     | ✅ Agent 调用 memoryTopicsTool |
| 保存新记忆               | ❌ 不相关     | ✅ Agent 调用 memorySaveTool   |

### 10.8 IPC 接口

| Channel                   | 方向            | 说明                               |
| ------------------------- | --------------- | ---------------------------------- |
| `memory:clearRecallCache` | renderer → main | 清除自动召回缓存（指定对话或全部） |

### 10.9 System Prompt 工具指导（仍保留）

即使有自动召回，system prompt 中仍保留 Agent tool 使用指导，供 Agent 在需要更精确检索时使用。

---

## 11. 完整调用时序图

```
用户："我们之前讨论的记忆系统架构方案是什么来着？"
        │
        ▼
  Agent 识别需要回忆 → 调用 memorySearchTool
        │
        ▼
  ┌─ Stage 1 ─┐  analyzeQuery("记忆系统架构方案")
  │            │  → topicTerms: ["记忆系统", "架构"]
  │            │  → keywordTerms: ["方案"]
  │            │  → actionHint: "recall"
  └─────┬──────┘
        │
        ▼
  ┌─ Stage 2 ─┐  topicRecall(topicTerms)
  │            │  → directHits: [{label:"记忆系统", heat:0.9}]
  │            │  → expanded: [{label:"AI Agent", heat:0.8}, {label:"记忆检索", heat:0.7}]
  └─────┬──────┘
        │
        ▼
  ┌─ Stage 3 ─┐  noteRecall(allTopicIds, ftsQuery, metadata)
  │            │  → candidates: [
  │            │      {id:"mem_2026-03-26_ai-agent-memory-system_a1b2c3",
  │            │       summary:"讨论了记忆系统的整体架构设计...", score:0.92},
  │            │      {id:"mem_2026-03-25_memory-retrieval_d4e5f6",
  │            │       summary:"设计了无向量检索流水线...", score:0.78}
  │            │    ]
  └─────┬──────┘
        │
        ▼
  返回 MemorySearchResult 给 Agent
        │
        ▼
  Agent 看到摘要后 → 调用 memoryGetTool(noteId, section:"Key Points")
        │
        ▼
  ┌─ Stage 5 ─┐  targetedRead(noteId, "Key Points")
  │            │  → content: "- 不依赖向量服务...\n- Markdown 为事实源..."
  └─────┬──────┘
        │
        ▼
  Agent 组织回答："根据我们之前的讨论，记忆系统架构的关键决策包括..."
```

---

## 12. 向量增强扩展位

当未来接入向量时，只需在 Stage 3 增加一路候选：

```
  Route A: 图谱关联 note       ─┐
  Route B: FTS 命中 note        ├─→ 候选合并 + 融合排序
  Route C: 元数据过滤 note      │
  Route D: 向量语义召回 note  ──┘   ← 新增

融合公式扩展：
  score = W_FTS * ftsScore
        + W_GRAPH * graphScore
        + W_IMPORTANCE * importance
        + W_RECENCY * recencyScore
        + W_ACTION * actionScore
        + W_VECTOR * vectorScore    ← 新增项
```

不改现有检索链路，只插入一路候选并调整权重。
