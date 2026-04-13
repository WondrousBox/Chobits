# Memory System 编码实现计划

## 现状分析

设计文档已完成 4 份，覆盖 DB schema、Note 规范、检索流水线、增量同步提取。项目使用 Drizzle ORM \+ better\-sqlite3 \+ FTS5，IPC 按 `domain:action` 模式，Repository pattern 集中在 `electron/main/db/repositories.ts`。
OpenClaw 生态的记忆系统核心模式可供参考：

- **Markdown 为事实源** \+ DB 做结构索引（与我们的设计一致）
- **Daily sync \+ weekly tidy** 的分层时间策略（OpenClaw 用 cron，我们用 DailyCare tick）
- **BM25/FTS \+ 可选向量** 的混合检索（openclaw\-memory\-final 项目验证了可行性）
- **memory_search \+ memory_get 两段式读取**（与我们的 Agent tool 设计吻合）
- **幂等游标（processed\-sessions / watermark）** 保证增量安全

## 实现顺序

按你建议的：DB schema → Repository → Extraction service → Retrieval service → IPC handlers → Agent tools

## 当前实现状态（2026-04-12）

- Phase 1 DB Schema：已完成。`memory_notes` 已持久化 `domain`，并包含 `timeRange`、`parentTopicId`、`relatedTopicIds`、`aliases`、`entities` 等 note 级字段。
- Phase 2 Repository：已完成。除 `MemoryTopicRepo.applyHeatDecay()`、`MemorySyncJobRepo.findByWorkspace()/getAll()` 外，还包含 `MemoryEdgeRepo.addEntityFact()/invalidateEntityFact()/queryEntityFacts()/entityTimeline()`、`MemoryTopicRepo.findByDomain()/findByDomainType()`。FTS 已拆为独立的 `memory-fts.ts` / `memory-fts-repo.ts`，当前采用 note-scoped 增量维护，并在启动时把旧 contentless FTS 自动迁移为 row-mutable FTS。
- Phase 3 Extraction Service：已完成。`conversation_close` 主链路、队列、worker、merge/write、`daily_extraction`、漏跑补偿、Open Loop 智能合并、`Recall Cues`、`Source Excerpts`、实体关系写边、`fileChecksum` / `timeRange` / `sections.keywords` 均已落地。新增 canonical topic resolution：提取后先做本地 topic 归一化，再复用 workspace 内已有 canonical topic，并把原始表述写入 `aliases`、把 keyword 的 `primaryTopicId` 绑定到 canonical topic。`memory-config.json` 中的 `minNewMessagesForExtraction`、`extractionCooldownMinutes`、`maxTokensPerExtraction`、`periodicSaveInterval` 现已真实接到 runtime worker。
- Phase 4 Retrieval Service：已完成。`search` / `get` / `browseTopics` / `searchWithContent` 已实现；`topicFilter`、LLM 查询分析、新会话预加载、Domain 过滤、实体事实扩展、LIKE fallback、broad recall fallback 均已接入。`entity_fact.evidenceNoteId` 当前通过 `factNoteIds` 直达 Stage 3 note 候选，不再混入 topic expansion。Electron auto-recall 与 Pi memory tools 的 retrieval deps 能力已对齐。
- Phase 5 IPC Handlers：已完成，现包含 `memory:stats`、`memory:cleanupForConversations`、`memory:clearAll`、`memory:cancelSync`、`memory:getMetrics`、`memory:getConfig` / `memory:setConfig`、`memory:generateDailyIndex`、`memory:generateTopicArchives`、`memory:generateMemoryIndex`、`memory:backfillRecallCues` 等入口。
- Phase 6 Agent Tools：已完成。实际代码位于 `packages/ai/runtime/pi/tools/`，当前注册了 5 个工具：`memorySearchTool`、`memoryGetTool`、`memoryTopicsTool`、`memorySaveTool`、`memoryDiaryTool`。其中前 4 个进入 `DEFAULT_SESSION_TOOL_IDS`；`memoryDiaryTool` 只完成注册与写文件，当前不是默认 session tool，也不进入检索闭环。
- Phase 7 对话删除 → 记忆清理联动：已完成。
- Repair wave 状态：`P0-1` ~ `P0-4`、`P1-1`、`P1-2`、`P1-4` 已完成；当前剩余的高优先事项是 `P1-3 diary` 产品方向收口。

## Phase 1: DB Schema

**目标**：在 `electron/main/db/schema.ts` 中新增 7 张 memory 表 \+ FTS5 虚拟表
**文件改动**：

- `electron/main/db/schema.ts` — 追加 `memory_notes`, `memory_sections`, `memory_topics`, `memory_edges`, `memory_keywords`, `memory_note_keywords`, `memory_sync_jobs` 表定义，完全按 `memory-db-schema.md` 中的 Drizzle 代码
- `electron/main/db/index.ts` — 在 `initSchema()` 末尾调用 `ensureMemoryFTS(db)` 创建 FTS5 虚拟表（raw SQL，因为 Drizzle 不支持 FTS5 声明）
- 运行 `pnpm db:generate` 生成 migration
  **注意**：
- 所有新表用 `memory_` 前缀，与现有表完全隔离
- FTS5 当前使用可行级删除/插入的 row-mutable 表定义；旧的 `content=''` contentless 版本会在启动时自动迁移并从派生源重建
- `memory_notes.workspaceId` 引用现有 `workspaces.id`

## Phase 2: Repository

**目标**：为 7 张表各建 Repository，加 FTS 读写辅助函数
**文件改动**：

- `electron/main/db/memory-repositories.ts`（新文件）— 独立文件避免现有 `repositories.ts` 过大
  _ `MemoryNoteRepo` — upsert / getById / listByDate / listByWorkspace / softDelete / search by metadata
  _ `MemorySectionRepo` — rebuildForNote\(先删后插\) / listByNote / getById
  _ `MemoryTopicRepo` — upsert / findBySlug / findByLabel / listChildren / updateHeat
  _ `MemoryEdgeRepo` — upsert / findBySource / findByTarget / deleteByNote
  _ `MemoryKeywordRepo` — upsertCanonical / findByCanonical / findByAlias
  _ `MemoryNoteKeywordRepo` — bulkUpsert / deleteByNote
  _ `MemorySyncJobRepo` — create / updateStatus / updateProgress / findByStatus / getLatest
  _ `MemoryFTSRepo` — 已演进到 `electron/main/db/memory-fts-repo.ts`，支持 `insertNoteEntry` / `insertSectionEntry` / `deleteByNote` / `rebuildForNote` / `rebuildAll` / `search(match query)`
  **模式**：复用现有 Repository 模式（`getOrm()` / Drizzle query builder / 事务用 `(db as any).transaction()`）

## Phase 3: Extraction Service

**目标**：实现 6 步提取流水线 \+ 任务队列
**文件结构**：

- `packages/ai/services/memory-extraction-service.ts`（新）— 核心提取逻辑
  - `collect()` — 从 `chat_messages` 按 watermark 读取增量消息
  - `splitTopics()` — LLM 调用做主题拆分（prompt 定义在设计文档中）
  - `extractMemory()` — 对每个 TopicCluster 调用 LLM 结构化抽取
  - `canonicalizeTopic()` — 本地 topic 归一化 + 复用已有 canonical topic + 回填 aliases
  - `mergeMemory()` — 与已有 note 合并（增量 frontmatter \+ section 合并）
  - `writeMemory()` — Markdown 写文件 \+ DB 事务（upsert notes/sections/topics/edges/keywords/FTS）
- `electron/main/handlers/memory/extraction-queue.ts`（新）— 任务队列，参考 `EmbeddingQueue` 模式
  - 串行执行、优先级排序（manual=0, conv_close=1, daily=2）、去重、AbortController
- `electron/main/handlers/memory/extraction-worker.ts`（新）— 对接 queue 和 service
  **辅助工具**：
- `packages/ai/services/memory-note-writer.ts`（新）— Markdown 渲染（frontmatter YAML \+ section body）
- `packages/ai/services/memory-note-parser.ts`（新）— Markdown 解析（读 frontmatter \+ 拆 section \+ 行号定位）
- TypeScript 类型定义（`MemoryNoteFrontmatter`, `MemoryExtractionOutput` 等）放在 `packages/ai/services/memory-types.ts`

## Phase 4: Retrieval Service

**目标**：实现 6 阶段检索流水线
**文件**：

- `packages/ai/services/memory-retrieval-service.ts`（新）
  - `analyzeQuery()` — 规则解析（Phase 1），拆 topicTerms / entityTerms / keywordTerms / timeHint / actionHint
  - `recallTopics()` — Stage 2：label/slug/alias 匹配 → keyword→topic 关联 → 子主题 \+ 邻接扩展（最多 2 层）
  - `recallNotes()` — Stage 3：三路候选（图谱/FTS/元数据）→ 融合排序
  - `recallSections()` — Stage 4：section FTS \+ actionHint \+ keyword 匹配
  - `targetedRead()` — Stage 5：按行号从 Markdown 文件读取段落正文，token 预算裁剪
  - `assembleContext()` — Stage 6：组装三层结构（主题概览 \+ note 摘要 \+ 段落正文）
  - `search()` — 当前对外主入口，稳定提供 Stage 1-3 结果；`includeContent` 仅附带 section 摘要
  - `searchWithContent()` — 服务层 helper，一步到位执行 Stage 1-6 风格流程
  - `get()` — 按 noteId \+ section 精确读取
  - `browseTopics()` — 主题图谱浏览

## Phase 5: IPC Handlers

**目标**：注册 `memory:*` IPC channels
**文件**：

- `electron/main/handlers/memory/ipc-main.ts`（新）— `initMemoryHandlers()`
  - `memory:search` / `memory:get` / `memory:topics` / `memory:listNotes`
  - `memory:syncStatus` / `memory:triggerSync` / `memory:rebuildIndex` / `memory:deleteNote`
  - `memory:graphData` / `memory:stats` / `memory:cleanupForConversations` / `memory:clearAll`
- `electron/main/handlers/index.ts` — 注册 `initMemoryHandlers()`
- `electron/preload/apis/memory.ts`（新）— preload bridge，暴露 `window.YUA.memory.*`
- `electron/preload/index.ts` — 注册 memory API
  **事件扩展**：
- `packages/event/events.ts` — 新增 `MEMORY_EXTRACTION_STARTED / PROGRESS / COMPLETED / FAILED`

## Phase 6: Agent Tools

**目标**：在 AI runtime 中注册 5 个 memory tool，其中 diary 作为按需日志工具保留
**文件**：

- `packages/ai/runtime/pi/tools/` 下注册工具定义：
  - `memorySearchTool` — 调用 `memory:search` IPC
  - `memoryGetTool` — 调用 `memory:get` IPC
  - `memoryTopicsTool` — 调用 `memory:topics` IPC
  - `memorySaveTool` — 将重要信息主动写入长期记忆
  - `memoryDiaryTool` — 追加写入 `memory/diary/YYYY-MM-DD.md`
- `packages/ai/runtime/pi/tool-registry.ts` — 注册 tool metadata；`memory-search` / `memory-get` / `memory-topics` / `memory-save` 进入 `DEFAULT_SESSION_TOOL_IDS`，`memory-diary` 仅注册 metadata、按需启用
- System prompt 扩展：在 AI chat 中注入记忆系统使用指南段
- 自动注入策略：system prompt 指导已接入；新会话自动预加载近 7 天高重要度记忆摘要 + `Critical Facts` 已实现

## 历史建议：先启动 Phase 1

这段是最初的实施建议，保留作历史上下文；截至 2026-04-03，Phase 1 已完成。

Phase 1（DB Schema）当时被认为是最安全的切入点，因为：

1. 纯 additive，不影响现有任何表
2. 可以立即 `pnpm db:generate` 验证
3. 后续所有 Phase 都依赖它

## Phase 7: 对话删除 → 记忆清理联动

**目标**：当对话被物理删除时，自动清理关联的记忆数据，避免孤立记忆。

**设计原则**：

- 按来源对话数区分处理：单一来源 → 完整删除；多来源 → 仅移除被删 ID
- 异步执行，不阻塞删除主流程
- 软删除不清理，只有物理删除才触发

**文件改动**：

- `electron/main/db/memory-repositories.ts` — `MemoryNoteRepo` 新增 `removeConversationSource(convId)` 方法
  - 从 `sourceConversationIds` 中移除指定 ID
  - 同步清理 `sourceMessageRange` 中对应 conversation 的条目
  - 返回 `{ updated: MemoryNoteRow[], orphaned: MemoryNoteRow[] }`
- `electron/main/handlers/memory/memory-cleanup.ts`（新文件）— 独立清理模块
  - `cleanupMemoryForConversations(convIds)` — 遍历每个 convId，调用 `removeConversationSource`，对 orphaned notes 执行 `fullDeleteMemoryNote`
  - `fullDeleteMemoryNote(noteId, wsId, filePath)` — 5 步级联清理：FTS → edges → note-keywords → note 行（cascade sections）→ Markdown 文件
- `packages/ai/ipc-main.ts` — `ai:hardDeleteConversation` 后追加异步 `cleanupMemoryForConversations([id])`
- `electron/main/handlers/trash/ipc-main.ts` — `trash:purge` 和 `trash:empty` 先收集 conversationIds，执行后异步清理
- `electron/preload/apis/memory.ts` — 新增 `cleanupForConversations` preload bridge
- `electron/main/handlers/memory/ipc-main.ts` — 注册 `memory:cleanupForConversations` IPC channel

**三条删除路径全覆盖**：
| 删除路径 | 触发位置 | 清理方式 |
| -------- | -------- | -------- |
| `ai:hardDeleteConversation` | `packages/ai/ipc-main.ts` | 异步 fire-and-forget |
| `trash:purge` | `electron/main/handlers/trash/ipc-main.ts` | 先收集 IDs → purge → 异步清理 |
| `trash:empty` | `electron/main/handlers/trash/ipc-main.ts` | 先收集 IDs → empty → 异步清理 |
