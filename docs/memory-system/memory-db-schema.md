# Memory System 数据库 Schema 草案 v1

> 本文档定义 Chobits 记忆系统的数据库表结构。
> 设计原则：Markdown 为事实源，数据库只存结构索引与关系，不承担最终真相。
> 第一阶段不依赖向量服务，以 FTS5 + 元数据过滤 + 图谱扩展为主检索路径。

---

## 1. 表清单与职责

| 表名                   | 职责                                         | 新增/复用        |
| ---------------------- | -------------------------------------------- | ---------------- |
| `memory_notes`         | 记忆 note 的结构索引（Frontmatter 镜像）     | **新增**         |
| `memory_sections`      | note 内段落索引（标题树 + 摘要 + 行号）      | **新增**         |
| `memory_topics`        | 主题节点（图谱核心）                         | **新增**         |
| `memory_edges`         | 图谱边（topic-topic、topic-note、note-note） | **新增**         |
| `memory_keywords`      | 关键词/别名/实体规范化表                     | **新增**         |
| `memory_note_keywords` | note 与 keyword 的多对多关联                 | **新增**         |
| `memory_sync_jobs`     | 记忆提取任务的调度与状态跟踪                 | **新增**         |
| `memory_notes_fts`     | FTS5 虚拟表，全文检索 note/section           | **新增（FTS5）** |
| `documents`            | 可选：向量扩展时复用                         | 现有（保留位）   |

> **为什么不复用 documents 表？**
> documents 表的核心设计围绕"正文 + 向量"，字段语义（sourceId → resources、docType 枚举、
> embedding 必要性）与记忆系统差异较大。独立建表可以：
>
> 1. 避免 docType 枚举膨胀和语义混淆
> 2. 让记忆系统在无向量时完全独立运行
> 3. 未来接入向量时，通过 memory_notes.id → documents.sourceId 桥接即可

---

## 2. 表定义

### 2.1 memory_notes — 记忆 Note 索引

存储每个 Memory Note 的 Frontmatter 镜像，是检索主入口。

```typescript
export const memory_notes = sqliteTable(
  'memory_notes',
  {
    // ━━ 身份 ━━
    id: text('id').primaryKey(), // 与 Frontmatter id 一致，如 mem_2026-03-26_xxx_a1b2c3
    version: integer('version').notNull().default(1), // 修订版本号

    // ━━ 归属 ━━
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    date: text('date').notNull(), // YYYY-MM-DD
    timeRangeStart: integer('time_range_start'), // 毫秒时间戳
    timeRangeEnd: integer('time_range_end'),

    // ━━ 文件路径 ━━
    filePath: text('file_path').notNull(), // workspace 相对路径，如 memory/daily/2026/03/2026-03-26-xxx.md
    fileChecksum: text('file_checksum'), // 文件内容 sha256，用于变更检测

    // ━━ 主题 ━━
    topics: text('topics').notNull(), // JSON string[]，如 ["AI Agent","记忆系统"]
    parentTopicId: text('parent_topic_id').references((): AnySQLiteColumn => memory_topics.id, { onDelete: 'set null' }),
    relatedTopicIds: text('related_topic_ids'), // JSON string[]

    // ━━ 关键词与实体（冗余存储用于快速过滤） ━━
    keywords: text('keywords').notNull(), // JSON string[]
    aliases: text('aliases'), // JSON string[]
    entities: text('entities'), // JSON Entity[]

    // ━━ 摘要 ━━
    summary: text('summary').notNull(),

    // ━━ 溯源 ━━
    sourceConversationIds: text('source_conversation_ids').notNull(), // JSON string[]
    sourceMessageRange: text('source_message_range'), // JSON MessageRange[]

    // ━━ 权重 ━━
    importance: real('importance').notNull().default(0.5), // 0.0 ~ 1.0
    stability: real('stability').notNull().default(0.5), // 0.0 ~ 1.0

    // ━━ 统计 ━━
    sectionCount: integer('section_count').default(0), // 段落数
    charCount: integer('char_count').default(0), // 总字符数
    tokenEstimate: integer('token_estimate').default(0), // 估算 token 数

    // ━━ 生命周期 ━━
    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`),
    updatedAt: integer('updated_at').default(sql`(unixepoch('now')*1000)`),
    deletedAt: integer('deleted_at') // 软删除
  },
  (t) => ({
    idxMemNotesWorkspace: index('idx_mem_notes_workspace').on(t.workspaceId),
    idxMemNotesDate: index('idx_mem_notes_date').on(t.date),
    idxMemNotesImportance: index('idx_mem_notes_importance').on(t.importance),
    idxMemNotesStability: index('idx_mem_notes_stability').on(t.stability),
    idxMemNotesParentTopic: index('idx_mem_notes_parent_topic').on(t.parentTopicId),
    idxMemNotesCreated: index('idx_mem_notes_created').on(t.createdAt),
    idxMemNotesDeleted: index('idx_mem_notes_deleted').on(t.deletedAt),
    uqMemNotesFilePath: uniqueIndex('uq_mem_notes_file_path').on(t.filePath)
  })
);

export type MemoryNoteRow = InferSelectModel<typeof memory_notes>;
export type NewMemoryNote = InferInsertModel<typeof memory_notes>;
```

### 2.2 memory_sections — 段落索引

存储 note 内每个 `##` / `###` 段落的结构信息，用于 section 级渐进召回。

```typescript
export const memory_sections = sqliteTable(
  'memory_sections',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    noteId: text('note_id')
      .references(() => memory_notes.id, { onDelete: 'cascade', onUpdate: 'cascade' })
      .notNull(),

    // ━━ 标题信息 ━━
    heading: text('heading').notNull(), // 标题路径，如 "Key Facts" 或 "Key Facts > 技术选型"
    headingLevel: integer('heading_level').notNull(), // 2 = ##, 3 = ###
    sectionOrder: integer('section_order').notNull(), // 段落在 note 内的顺序（从 0 开始）

    // ━━ 内容摘要 ━━
    summary: text('summary'), // 段落摘要（从 blockquote 提取）
    keywords: text('keywords'), // JSON string[]，段落级关键词

    // ━━ 定位 ━━
    lineStart: integer('line_start').notNull(), // 起始行号（1-based）
    lineEnd: integer('line_end').notNull(), // 结束行号（1-based）
    charCount: integer('char_count').default(0), // 段落字符数

    // ━━ 生命周期 ━━
    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`),
    updatedAt: integer('updated_at').default(sql`(unixepoch('now')*1000)`)
  },
  (t) => ({
    idxMemSectionsNote: index('idx_mem_sections_note').on(t.noteId),
    idxMemSectionsHeading: index('idx_mem_sections_heading').on(t.heading),
    idxMemSectionsOrder: index('idx_mem_sections_order').on(t.noteId, t.sectionOrder)
  })
);

export type MemorySectionRow = InferSelectModel<typeof memory_sections>;
export type NewMemorySection = InferInsertModel<typeof memory_sections>;
```

### 2.3 memory_topics — 主题节点

图谱的核心节点表。支持层级（父子主题）和别名。

```typescript
export const memory_topics = sqliteTable(
  'memory_topics',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => `topic_${randomUUID().slice(0, 8)}`), // 如 topic_a1b2c3d4

    // ━━ 标识 ━━
    label: text('label').notNull(), // 规范化主题名，如 "AI Agent"
    slug: text('slug').notNull(), // URL-safe slug，如 "ai-agent"
    aliases: text('aliases'), // JSON string[]，别名列表
    description: text('description'), // 主题简述（1~2 句）

    // ━━ 层级 ━━
    parentId: text('parent_id').references((): AnySQLiteColumn => memory_topics.id, { onDelete: 'set null' }),

    // ━━ 关联关键词 ━━
    keywords: text('keywords'), // JSON string[]，强关联关键词

    // ━━ 归属 ━━
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null', onUpdate: 'cascade' }),

    // ━━ 活跃度与统计（用于图谱可视化预留） ━━
    noteCount: integer('note_count').default(0), // 关联 note 数量
    heat: real('heat').default(0), // 近期活跃度分（0.0~1.0）
    centralityHint: real('centrality_hint').default(0), // 图中心度提示（未来可视化用）
    firstSeenAt: integer('first_seen_at'), // 首次出现时间
    lastSeenAt: integer('last_seen_at'), // 最近出现时间

    // ━━ 生命周期 ━━
    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`),
    updatedAt: integer('updated_at').default(sql`(unixepoch('now')*1000)`),
    deletedAt: integer('deleted_at')
  },
  (t) => ({
    uqMemTopicsSlugWs: uniqueIndex('uq_mem_topics_slug_ws').on(t.slug, t.workspaceId),
    idxMemTopicsLabel: index('idx_mem_topics_label').on(t.label),
    idxMemTopicsParent: index('idx_mem_topics_parent').on(t.parentId),
    idxMemTopicsWorkspace: index('idx_mem_topics_workspace').on(t.workspaceId),
    idxMemTopicsHeat: index('idx_mem_topics_heat').on(t.heat),
    idxMemTopicsLastSeen: index('idx_mem_topics_last_seen').on(t.lastSeenAt)
  })
);

export type MemoryTopicRow = InferSelectModel<typeof memory_topics>;
export type NewMemoryTopic = InferInsertModel<typeof memory_topics>;
```

### 2.4 memory_edges — 图谱边

支持多种关系类型，连接 topic、note、section 三类节点。

```typescript
export const memory_edges = sqliteTable(
  'memory_edges',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),

    // ━━ 端点 ━━
    sourceType: text('source_type', { enum: ['topic', 'note', 'section'] }).notNull(),
    sourceId: text('source_id').notNull(),
    targetType: text('target_type', { enum: ['topic', 'note', 'section'] }).notNull(),
    targetId: text('target_id').notNull(),

    // ━━ 关系描述 ━━
    relationType: text('relation_type', {
      enum: [
        'parent_topic_of', // topic -> topic（父子）
        'belongs_to_topic', // note -> topic（归属）
        'related_to_topic', // note -> topic（关联）
        'related_to_note', // note -> note（相关）
        'contains_section', // note -> section（包含）
        'derived_from_conversation', // note -> conversation（溯源）
        'shares_keyword', // note -> note（共享关键词）
        'references_note' // note -> note（引用）
      ]
    }).notNull(),

    // ━━ 权重与证据 ━━
    weight: real('weight').default(1.0), // 边权重（检索排序用）
    evidenceNoteId: text('evidence_note_id'), // 证据来源 note ID
    evidenceSnippet: text('evidence_snippet'), // 关系证据摘要（<200 字）
    origin: text('origin', {
      enum: ['llm_extracted', 'rule_inferred', 'user_manual']
    }).default('llm_extracted'), // 关系来源

    // ━━ 归属 ━━
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null', onUpdate: 'cascade' }),

    // ━━ 生命周期 ━━
    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`),
    updatedAt: integer('updated_at').default(sql`(unixepoch('now')*1000)`)
  },
  (t) => ({
    // 从某节点出发查所有邻居
    idxMemEdgesSource: index('idx_mem_edges_source').on(t.sourceType, t.sourceId),
    // 到某节点的所有入边
    idxMemEdgesTarget: index('idx_mem_edges_target').on(t.targetType, t.targetId),
    // 按关系类型过滤
    idxMemEdgesRelation: index('idx_mem_edges_relation').on(t.relationType),
    // 防重复边
    uqMemEdgesLink: uniqueIndex('uq_mem_edges_link').on(t.sourceType, t.sourceId, t.targetType, t.targetId, t.relationType),
    idxMemEdgesWorkspace: index('idx_mem_edges_workspace').on(t.workspaceId)
  })
);

export type MemoryEdgeRow = InferSelectModel<typeof memory_edges>;
export type NewMemoryEdge = InferInsertModel<typeof memory_edges>;
```

### 2.5 memory_keywords — 关键词规范化表

每个关键词/实体/别名一条记录。支持同义映射与主题亲和度。

```typescript
export const memory_keywords = sqliteTable(
  'memory_keywords',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),

    // ━━ 关键词本体 ━━
    canonical: text('canonical').notNull(), // 规范形式，如 "记忆系统"
    aliases: text('aliases'), // JSON string[]，同义词列表
    language: text('language'), // 主要语言，如 "zh-CN", "en"

    // ━━ 实体类型（可选） ━━
    entityType: text('entity_type', {
      enum: ['person', 'product', 'technology', 'organization', 'concept', 'location', 'event', 'keyword', 'other']
    }).default('keyword'),

    // ━━ 主题亲和 ━━
    primaryTopicId: text('primary_topic_id').references(() => memory_topics.id, { onDelete: 'set null' }), // 最强关联主题

    // ━━ 统计 ━━
    occurrenceCount: integer('occurrence_count').default(0), // 出现次数
    lastSeenAt: integer('last_seen_at'), // 最近出现时间

    // ━━ 归属 ━━
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null', onUpdate: 'cascade' }),

    // ━━ 生命周期 ━━
    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`),
    updatedAt: integer('updated_at').default(sql`(unixepoch('now')*1000)`)
  },
  (t) => ({
    uqMemKeywordsCanonicalWs: uniqueIndex('uq_mem_keywords_canonical_ws').on(t.canonical, t.workspaceId),
    idxMemKeywordsEntityType: index('idx_mem_keywords_entity_type').on(t.entityType),
    idxMemKeywordsTopic: index('idx_mem_keywords_topic').on(t.primaryTopicId),
    idxMemKeywordsWorkspace: index('idx_mem_keywords_workspace').on(t.workspaceId),
    idxMemKeywordsOccurrence: index('idx_mem_keywords_occurrence').on(t.occurrenceCount)
  })
);

export type MemoryKeywordRow = InferSelectModel<typeof memory_keywords>;
export type NewMemoryKeyword = InferInsertModel<typeof memory_keywords>;
```

### 2.6 memory_note_keywords — Note ↔ Keyword 关联表

多对多关系。一个 note 有多个关键词，一个关键词出现在多个 note 中。

```typescript
export const memory_note_keywords = sqliteTable(
  'memory_note_keywords',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    noteId: text('note_id')
      .references(() => memory_notes.id, { onDelete: 'cascade', onUpdate: 'cascade' })
      .notNull(),
    keywordId: text('keyword_id')
      .references(() => memory_keywords.id, { onDelete: 'cascade', onUpdate: 'cascade' })
      .notNull(),

    // ━━ 来源层级 ━━
    scope: text('scope', {
      enum: ['note', 'section'] // 关键词来自 note 级还是 section 级
    }).default('note'),
    sectionId: text('section_id') // 如果 scope=section，关联到具体段落
      .references(() => memory_sections.id, { onDelete: 'set null' }),

    // ━━ 权重 ━━
    relevance: real('relevance').default(1.0), // 该关键词在该 note 中的相关度

    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`)
  },
  (t) => ({
    uqMemNoteKeyword: uniqueIndex('uq_mem_note_keyword').on(t.noteId, t.keywordId, t.sectionId),
    idxMemNoteKeywordsNote: index('idx_mem_note_keywords_note').on(t.noteId),
    idxMemNoteKeywordsKeyword: index('idx_mem_note_keywords_keyword').on(t.keywordId),
    idxMemNoteKeywordsSection: index('idx_mem_note_keywords_section').on(t.sectionId)
  })
);

export type MemoryNoteKeywordRow = InferSelectModel<typeof memory_note_keywords>;
export type NewMemoryNoteKeyword = InferInsertModel<typeof memory_note_keywords>;
```

### 2.7 memory_sync_jobs — 记忆提取任务

跟踪每次记忆提取/索引任务的状态，支持断点续做和调试。

```typescript
export const memory_sync_jobs = sqliteTable(
  'memory_sync_jobs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),

    // ━━ 任务类型 ━━
    jobType: text('job_type', {
      enum: [
        'daily_extraction', // 日终批量提取
        'conversation_close', // 会话结束触发
        'manual_reindex', // 手动重建索引
        'file_change_reindex' // 文件变更触发重建
      ]
    }).notNull(),

    // ━━ 任务范围 ━━
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    targetDate: text('target_date'), // YYYY-MM-DD，日终提取的目标日期
    targetConversationIds: text('target_conversation_ids'), // JSON string[]

    // ━━ 状态 ━━
    status: text('status', {
      enum: ['pending', 'running', 'completed', 'failed', 'cancelled']
    })
      .notNull()
      .default('pending'),
    progress: text('progress'), // JSON：{ current, total, stage }
    errorMessage: text('error_message'),

    // ━━ 结果统计 ━━
    notesCreated: integer('notes_created').default(0),
    notesUpdated: integer('notes_updated').default(0),
    topicsCreated: integer('topics_created').default(0),
    edgesCreated: integer('edges_created').default(0),
    keywordsCreated: integer('keywords_created').default(0),

    // ━━ AI 调用元数据 ━━
    providerId: text('provider_id'), // 使用的 AI 服务商
    model: text('model'), // 使用的模型
    tokensUsed: integer('tokens_used').default(0), // 消耗的总 tokens

    // ━━ 生命周期 ━━
    startedAt: integer('started_at'),
    completedAt: integer('completed_at'),
    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`)
  },
  (t) => ({
    idxMemSyncJobsStatus: index('idx_mem_sync_jobs_status').on(t.status),
    idxMemSyncJobsType: index('idx_mem_sync_jobs_type').on(t.jobType),
    idxMemSyncJobsWorkspace: index('idx_mem_sync_jobs_workspace').on(t.workspaceId),
    idxMemSyncJobsDate: index('idx_mem_sync_jobs_date').on(t.targetDate),
    idxMemSyncJobsCreated: index('idx_mem_sync_jobs_created').on(t.createdAt)
  })
);

export type MemorySyncJobRow = InferSelectModel<typeof memory_sync_jobs>;
export type NewMemorySyncJob = InferInsertModel<typeof memory_sync_jobs>;
```

---

## 3. FTS5 虚拟表

FTS5 是第一阶段的主检索引擎，替代向量的语义召回能力。

### 3.1 memory_notes_fts

对 note 的 summary、keywords、aliases、topics 建全文索引。
对 section 的 heading、summary、keywords 也纳入同一张 FTS 表，通过 `entry_type` 区分。

```sql
-- 创建 FTS5 虚拟表（在 migration 或 initDB 中执行）
CREATE VIRTUAL TABLE IF NOT EXISTS memory_notes_fts USING fts5(
  entry_id,          -- note.id 或 section.id
  entry_type,        -- 'note' | 'section'
  note_id,           -- 所属 note ID（section 填写，note 填自己）
  title,             -- note: topics 拼接 | section: heading
  summary,           -- note 或 section 的摘要
  keywords,          -- 空格分隔的关键词字符串
  aliases,           -- 空格分隔的别名字符串
  entities,          -- 空格分隔的实体名字符串
  body,              -- note: overview 段正文 | section: 段落正文
  content='',        -- contentless 模式（正文回到 Markdown 读取）
  tokenize='unicode61 remove_diacritics 2'  -- 支持中英文混合分词
);
```

### 3.2 FTS 使用说明

| 场景                       | SQL 示例                                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| 按关键词搜 note            | `SELECT entry_id, rank FROM memory_notes_fts WHERE memory_notes_fts MATCH 'AI Agent' AND entry_type = 'note' ORDER BY rank LIMIT 10`               |
| 按关键词搜 section         | `SELECT entry_id, note_id, rank FROM memory_notes_fts WHERE memory_notes_fts MATCH '渐进式召回' AND entry_type = 'section' ORDER BY rank LIMIT 10` |
| 混合搜索（note + section） | `SELECT entry_id, entry_type, note_id, rank FROM memory_notes_fts WHERE memory_notes_fts MATCH '记忆系统 OR memory system' ORDER BY rank LIMIT 20` |
| 按标题搜                   | `SELECT entry_id FROM memory_notes_fts WHERE title MATCH '科技'`                                                                                   |

> **注意**：FTS5 的 `tokenize='unicode61'` 对中文的分词粒度是单字符级别，
> 搜索多字词组时会自动拆为单字匹配。这对中文检索来说可用但不完美。
> 后续如需更好的中文分词能力，可接入 `simple` tokenizer + 外挂 jieba 或换用 `trigram` tokenizer。
> 第一阶段先用 `unicode61`，配合 keyword/alias 冗余来保证基础召回率。

### 3.3 FTS 数据写入时机

| 事件                                 | 动作                                    |
| ------------------------------------ | --------------------------------------- |
| 记忆提取完成（新 note 生成）         | INSERT 该 note + 其所有 section 到 FTS  |
| 记忆 note 更新（重新提取或用户编辑） | DELETE old entries → INSERT new entries |
| 记忆 note 删除                       | DELETE from FTS                         |
| 手动重建索引                         | TRUNCATE FTS → 遍历所有存量 note 重建   |

---

## 4. 表关系图

```
┌─────────────────┐           ┌─────────────────┐
│  memory_topics  │◄─parent──│  memory_topics  │
│                 │           │    (children)    │
└────────┬────────┘           └─────────────────┘
         │
         │ belongs_to_topic / related_to_topic
         ▼
┌─────────────────┐    contains_section    ┌──────────────────┐
│  memory_notes   │──────────────────────►│ memory_sections  │
│                 │                        │                  │
│  filePath ──────┼── 指向 Markdown 文件    │  lineStart/End ──┼── 定点读取
│                 │                        └──────────────────┘
└────────┬────────┘
         │
         │  note ↔ keyword
         ▼
┌────────────────────────┐        ┌──────────────────┐
│ memory_note_keywords   │───────►│ memory_keywords  │
│                        │        │                  │
│  scope: note|section   │        │  canonical       │
│  relevance             │        │  aliases (JSON)  │
└────────────────────────┘        │  entityType      │
                                  │  primaryTopicId  │
                                  └──────────────────┘

┌─────────────────┐
│  memory_edges   │   sourceType + sourceId ─── targetType + targetId
│                 │   relationType: parent_topic_of | belongs_to_topic | ...
│                 │   weight, origin, evidence
└─────────────────┘

┌──────────────────┐
│ memory_sync_jobs │   jobType: daily_extraction | conversation_close | ...
│                  │   status: pending | running | completed | failed
└──────────────────┘

┌──────────────────┐
│ memory_notes_fts │   FTS5 虚拟表
│                  │   entry_type: note | section
│                  │   title, summary, keywords, aliases, entities, body
└──────────────────┘
```

---

## 5. 关键查询路径

### 5.1 检索主路径（无向量模式）

```
用户查询
  │
  ▼
① query normalization（拆主题词、实体词、时间词）
  │
  ▼
② 元数据过滤
   SELECT * FROM memory_notes
   WHERE workspaceId = ? AND deletedAt IS NULL
     AND date BETWEEN ? AND ?          -- 时间范围
     AND importance >= ?               -- 重要度下限
   ORDER BY importance DESC, date DESC
  │
  ▼
③ FTS5 关键词命中
   SELECT entry_id, entry_type, note_id, rank
   FROM memory_notes_fts
   WHERE memory_notes_fts MATCH ?
   ORDER BY rank
   LIMIT ?
  │
  ▼
④ 图谱扩展
   -- 从命中的 topic 出发，查子 topic 和邻接 note
   SELECT targetId FROM memory_edges
   WHERE sourceType = 'topic' AND sourceId IN (?)
     AND relationType IN ('parent_topic_of', 'belongs_to_topic', 'related_to_topic')

   -- keyword alias 扩展
   SELECT mn.id FROM memory_note_keywords mnk
   JOIN memory_keywords mk ON mnk.keywordId = mk.id
   JOIN memory_notes mn ON mnk.noteId = mn.id
   WHERE mk.canonical IN (?) OR mk.aliases LIKE ?
  │
  ▼
⑤ 融合排序
   score = w_fts * fts_rank
         + w_importance * importance
         + w_recency * recency_decay(date)
         + w_graph * graph_adjacency_score
         + w_stability * stability
  │
  ▼
⑥ Section 级精确命中
   SELECT * FROM memory_sections
   WHERE noteId IN (top_n_notes)
   -- 再对 section 做 FTS 或 keyword 匹配
  │
  ▼
⑦ Targeted Read
   -- 从 Markdown 文件读取 lineStart ~ lineEnd 的内容
   -- 按 token 预算裁剪注入上下文
```

### 5.2 图谱导航（主题钻取）

```sql
-- 1. 查找匹配主题
SELECT id, label, noteCount, heat
FROM memory_topics
WHERE label LIKE '%科技%' OR slug LIKE '%tech%'
  OR aliases LIKE '%technology%'
  AND workspaceId = ?
ORDER BY heat DESC;

-- 2. 查找子主题
SELECT t.id, t.label, t.noteCount
FROM memory_topics t
WHERE t.parentId = ?  -- 上一步命中的 topic ID
ORDER BY t.heat DESC;

-- 3. 查找主题下的 note
SELECT mn.id, mn.summary, mn.date, mn.importance
FROM memory_edges me
JOIN memory_notes mn ON me.targetId = mn.id
WHERE me.sourceType = 'topic' AND me.sourceId = ?
  AND me.relationType = 'belongs_to_topic'
  AND mn.deletedAt IS NULL
ORDER BY mn.date DESC, mn.importance DESC;
```

### 5.3 关键词同义扩展

```sql
-- 用户搜 "记忆系统" → 同时命中 "memory system", "长期记忆" 等
SELECT mk.canonical, mk.aliases
FROM memory_keywords mk
WHERE mk.canonical = '记忆系统'
  OR mk.aliases LIKE '%记忆系统%'
  AND mk.workspaceId = ?;

-- 拿到 canonical 后，查所有关联 note
SELECT DISTINCT mnk.noteId
FROM memory_note_keywords mnk
WHERE mnk.keywordId IN (
  SELECT id FROM memory_keywords
  WHERE canonical IN ('记忆系统', 'memory system', '长期记忆')
    AND workspaceId = ?
);
```

---

## 6. 向量扩展位（第二阶段）

当用户配置了 embedding 服务后，可通过以下方式接入，不改现有表结构：

```
memory_notes.id ──► documents 表（docType = 'memory_note'）
   └──► embedding, embedModel, embedDim, embedAt
   └──► searchVectors() 做语义召回
   └──► 结果与 FTS/graph 结果做 hybrid merge
```

接入方式：

1. 为每个 memory_note 在 documents 表创建一条镜像记录
2. 以 summary + keywords + overview 作为 embedding 输入
3. 语义召回结果与 FTS 结果做加权融合

需要新增的：

- `memory_notes` 表增加 `documentId` 字段指向 documents.id（可选外键）
- 或者 documents 表中 `sourceId` 指向 memory_notes.id，docType = 'memory_note'

**无论是否接入向量，基础检索能力不受影响。**

---

## 7. 迁移策略

### 7.1 新增表

所有表通过 Drizzle migration 创建。FTS5 虚拟表需要用 raw SQL migration。

```bash
# 生成迁移
pnpm db:generate

# 推送到数据库
pnpm db:push
```

### 7.2 FTS5 虚拟表

FTS5 虚拟表不在 Drizzle schema 中定义（Drizzle 不支持 FTS5 声明），
而是在 `electron/main/db/index.ts` 的 `initDB()` 中通过 raw SQL 创建：

```typescript
// 在 initDB / ensureSchema 中添加
function ensureMemoryFTS(db: BetterSqlite3.Database): void {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS memory_notes_fts USING fts5(
      entry_id,
      entry_type,
      note_id,
      title,
      summary,
      keywords,
      aliases,
      entities,
      body,
      content='',
      tokenize='unicode61 remove_diacritics 2'
    );
  `);
}
```

### 7.3 不影响现有数据

所有新表使用 `memory_` 前缀，与现有 documents、resources、conversations 等表完全隔离。
不修改任何现有表结构。

---

## 8. 记忆生命周期：对话删除联动

### 8.1 设计原则

记忆 note 通过 `sourceConversationIds` 字段溯源到原始对话。当对话被删除时，
关联的记忆数据需要同步清理，避免产生"幽灵记忆"（引用已不存在的对话）。

**核心策略：按来源对话数量分情况处理**

| 场景       | 条件                                           | 处理方式                                                          |
| ---------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| 单一来源   | note 的 `sourceConversationIds` 只包含被删对话 | **完整删除**：DB 索引 + FTS + 边 + 关键词关联 + Markdown 文件     |
| 多来源保留 | note 的 `sourceConversationIds` 还包含其他对话 | **部分更新**：仅从 `sourceConversationIds` 移除被删 ID，note 保留 |
| 来源清空   | 移除后 `sourceConversationIds` 变为空数组      | **完整删除**（同单一来源）                                        |

### 8.2 完整删除的级联清理顺序

当 note 需要完整删除时，按以下顺序执行：

```
1. 删除 FTS 条目           → memory_notes_fts WHERE note_id = ?
2. 删除图谱边              → memory_edges WHERE source/target = note
3. 删除 note-keyword 关联  → memory_note_keywords WHERE note_id = ?
4. 硬删除 note 行          → memory_notes WHERE id = ?（cascade 自动删 sections）
5. 删除 Markdown 文件      → unlink <workspace>/memory/daily/YYYY/MM/xxx.md
```

### 8.3 触发点

对话删除有三条路径，全部需要触发记忆清理：

| 删除路径                    | 触发位置                                   | 清理方式                                   |
| --------------------------- | ------------------------------------------ | ------------------------------------------ |
| `ai:hardDeleteConversation` | `packages/ai/ipc-main.ts`                  | 异步调用 `cleanupMemoryForConversations()` |
| `trash:purge`               | `electron/main/handlers/trash/ipc-main.ts` | 先收集 conversation IDs → purge → 异步清理 |
| `trash:empty`               | `electron/main/handlers/trash/ipc-main.ts` | 先收集 conversation IDs → empty → 异步清理 |

> **注意**：`ai:deleteConversation`（软删除）**不**触发记忆清理。
> 只有物理删除才清理记忆，与资源的回收站设计保持一致。

### 8.4 实现位置

- `MemoryNoteRepo.removeConversationSource(convId)` — 从 notes 的 `sourceConversationIds` 中移除指定 ID，返回 `{ updated, orphaned }`
- `cleanupMemoryForConversations(convIds)` — 独立模块 `electron/main/handlers/memory/memory-cleanup.ts`，串联分类 + 级联删除
- `fullDeleteMemoryNote(noteId, workspaceId, filePath)` — 执行上述 5 步级联清理
