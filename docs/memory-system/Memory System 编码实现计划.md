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

## Phase 1: DB Schema

**目标**：在 `electron/main/db/schema.ts` 中新增 7 张 memory 表 \+ FTS5 虚拟表
**文件改动**：

- `electron/main/db/schema.ts` — 追加 `memory_notes`, `memory_sections`, `memory_topics`, `memory_edges`, `memory_keywords`, `memory_note_keywords`, `memory_sync_jobs` 表定义，完全按 `memory-db-schema.md` 中的 Drizzle 代码
- `electron/main/db/index.ts` — 在 `initSchema()` 末尾调用 `ensureMemoryFTS(db)` 创建 FTS5 虚拟表（raw SQL，因为 Drizzle 不支持 FTS5 声明）
- 运行 `pnpm db:generate` 生成 migration
  **注意**：
- 所有新表用 `memory_` 前缀，与现有表完全隔离
- FTS5 用 `content=''` contentless 模式，正文回到 Markdown 读取
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
  _ `MemoryFTSRepo` — insertNoteEntry / insertSectionEntry / deleteByNote / rebuildAll / search\(match query\)
  **模式**：复用现有 Repository 模式（`getOrm()` / Drizzle query builder / 事务用 `(db as any).transaction()`）

## Phase 3: Extraction Service

**目标**：实现 5 步提取流水线 \+ 任务队列
**文件结构**：

- `packages/ai/services/memory-extraction-service.ts`（新）— 核心提取逻辑
  - `collect()` — 从 `chat_messages` 按 watermark 读取增量消息
  - `splitTopics()` — LLM 调用做主题拆分（prompt 定义在设计文档中）
  - `extractMemory()` — 对每个 TopicCluster 调用 LLM 结构化抽取
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
  - `search()` — 统一入口，串联 Stage 1\-6
  - `get()` — 按 noteId \+ section 精确读取
  - `browseTopics()` — 主题图谱浏览

## Phase 5: IPC Handlers

**目标**：注册 `memory:*` IPC channels
**文件**：

- `electron/main/handlers/memory/ipc-main.ts`（新）— `initMemoryHandlers()`
  - `memory:search` / `memory:get` / `memory:topics` / `memory:listNotes`
  - `memory:syncStatus` / `memory:triggerSync` / `memory:rebuildIndex` / `memory:deleteNote`
  - `memory:graphData`（预留）
- `electron/main/handlers/index.ts` — 注册 `initMemoryHandlers()`
- `electron/preload/apis/memory.ts`（新）— preload bridge，暴露 `window.YUA.memory.*`
- `electron/preload/index.ts` — 注册 memory API
  **事件扩展**：
- `packages/event/events.ts` — 新增 `MEMORY_EXTRACTION_STARTED / PROGRESS / COMPLETED / FAILED`

## Phase 6: Agent Tools

**目标**：在 AI agent 框架中注册 3 个 memory tool
**文件**：

- `packages/ai-agent/` 下注册工具定义：
  - `memorySearchTool` — 调用 `memory:search` IPC
  - `memoryGetTool` — 调用 `memory:get` IPC
  - `memoryTopicsTool` — 调用 `memory:topics` IPC
- System prompt 扩展：在 AI chat 中注入记忆系统使用指南段
- 自动注入策略：新会话开始时预加载近 7 天高重要度记忆摘要

## 建议先启动 Phase 1

Phase 1（DB Schema）是最安全的切入点，因为：

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
