# 增量同步与记忆提取流程设计 v1

> 本文档定义 Chobits 记忆系统的增量同步策略、记忆提取流水线、后台任务编排，以及观测与验证指标。
> 核心约束：提取任务不阻塞聊天主链路，对话数据只进不出（幂等、可重试），Markdown 为最终事实源。

## 当前实现状态（2026-04-03）

- 已完成：主触发链路、提取队列与 worker、增量水位线、提取进度事件、手动触发同步、FTS 重建、对话删除后的记忆清理。
- 当前主触发源是 `AppEvent.AGENT_LOOP_COMPLETE`；`AppEvent.SPRITE_AI_COMPLETE` 仅作为兼容旧路径保留。触发后会延迟 5 秒再做脏检查和入队。
- 已实现的调度细节包括：`conversationWatermarks` 内存水位线、`extractingConversations` + `pendingTrailingRun` 的 coalescing/trailing-run 机制、有工具调用时把新增消息阈值从 4 降到 2。
- 提取模型当前会优先尝试 provider 对应的 fast model，失败后回退到该 provider / preset 的默认模型配置。
- 尚未实现：`daily_extraction` 定时任务、漏跑补偿、窗口关闭/会话切换触发、`memory:cancelSync`、`memory:getMetrics`、`memory:validateIndex`、配置 UI。
- `memory:rebuildIndex` 当前只重建 FTS 索引，不会重新执行整套提取流水线。

---

## 1. 触发入口总览

```
┌──────────────────────────────────────────────────────────────┐
│                     记忆提取触发源                            │
├─────────────────────┬──────────────────┬─────────────────────┤
│  ① 会话结束触发      │  ② 日终批量提取   │  ③ 手动触发         │
│  conversation_close  │  daily_extraction │  manual_reindex     │
│                     │                  │                     │
│  时机：AI 响应完成后 │  时机：跨日检测    │  时机：用户手动操作  │
│       窗口关闭/切换  │       或定时周期   │       设置页面按钮   │
│                     │                  │                     │
│  粒度：单会话增量    │  粒度：当日全部    │  粒度：指定范围      │
│  延迟：即时（异步）  │  延迟：后台批处理  │  延迟：可观测进度    │
└─────────────────────┴──────────────────┴─────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Extraction Queue  │
                    │ 提取任务队列       │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ Extraction Worker │
                    │ 提取执行器        │
                    └──────────────────┘
```

> 注：截至 2026-04-03，图中的“日终批量提取”“窗口关闭/切换触发”仍未落地。当前实际运行的是
> `AGENT_LOOP_COMPLETE` / `SPRITE_AI_COMPLETE` 两条会话完成入口，以及 `memory:triggerSync` 手动触发。

---

## 2. 触发入口详细设计

### 2.1 入口 ①：会话结束触发（conversation_close）

**触发时机**

| 场景 | 触发条件 | 说明 |
| --- | --- | --- |
| Agent 工具循环结束 | `AppEvent.AGENT_LOOP_COMPLETE` 事件 | 当前主路径；Pi runtime 回合完成后触发 |
| 普通对话完成（兼容） | `AppEvent.SPRITE_AI_COMPLETE` 事件 | 旧路径 / 非 Pi runtime 的兼容入口 |

**判定逻辑：是否需要提取**

不是每次对话完成都直接入队。当前实现的核心判断如下：

```typescript
const MIN_NEW_MESSAGES = 4;
const MIN_TRIGGER_COOLDOWN = 15 * 1000; // 15 秒

async function onConversationComplete(payload: {
  conversationId: string;
  persisted?: boolean;
  hasToolCalls?: boolean;
}) {
  if (!payload.conversationId || payload.persisted === false) return;
  if (recentlyTriggered(payload.conversationId, MIN_TRIGGER_COOLDOWN)) return;

  // 如果同一会话仍在提取中，不丢弃，先挂成 trailing run
  if (extractingConversations.has(payload.conversationId)) {
    pendingTrailingRun.add(payload.conversationId);
    return;
  }

  // 当前实现会延迟 5 秒再检查，尽量等消息持久化完整
  setTimeout(async () => {
    const watermark = conversationWatermarks.get(payload.conversationId) ?? 0;
    const newMessages = await listUserAssistantMessagesAfter(payload.conversationId, watermark);

    // 带 tool call 的回合信息密度更高，阈值会从 4 降到 2
    const threshold = payload.hasToolCalls ? 2 : MIN_NEW_MESSAGES;
    if (newMessages.length < threshold) return;

    await enqueueConversationCloseJob(payload.conversationId);
  }, 5000);
}
```

**接入点：Extraction Worker 事件监听（当前实现）**

```typescript
// electron/main/handlers/memory/extraction-worker.ts
// 当前主路径：Agent 工具循环结束后触发
eventManager.on(AppEvent.AGENT_LOOP_COMPLETE, onAgentLoopComplete);

// 兼容路径：普通对话完成后触发
eventManager.on(AppEvent.SPRITE_AI_COMPLETE, onConversationComplete);
```

### 2.2 入口 ②：日终批量提取（daily_extraction）

> 截至 2026-04-03，此入口仍是设计目标，代码尚未接入 `DailyCareService`，也没有漏跑补偿逻辑。

**触发时机**

复用 `DailyCareService` 的定时 tick 机制（30 秒间隔检测）：

```typescript
// electron/main/daily/service.ts — tick() 中增加记忆检查

async function checkDailyMemoryExtraction(): Promise<void> {
  const today = formatDate(new Date()); // YYYY-MM-DD
  const state = loadMemorySyncState();

  // 已完成今天的提取 → 跳过
  if (state.lastDailyExtractionDate === today) return;

  // 当前有正在运行的提取任务 → 跳过
  const runningJobs = await MemorySyncJobRepo.findByStatus('running');
  if (runningJobs.length > 0) return;

  // 检查昨天（或上次提取以来）是否有新会话数据
  const pendingDate = state.lastDailyExtractionDate ? getNextDate(state.lastDailyExtractionDate) : today;

  const conversations = await ChatRepo.listConversationsByDateRange(pendingDate, today);

  if (conversations.length === 0) {
    state.lastDailyExtractionDate = today;
    saveMemorySyncState(state);
    return;
  }

  // 创建日终提取任务
  await memoryExtractionQueue.enqueue({
    jobType: 'daily_extraction',
    workspaceId: currentWorkspaceId,
    targetDate: pendingDate,
    targetConversationIds: conversations.map((c) => c.id)
  });
}
```

**补偿机制**

如果某天应用未启动（漏提取），下次启动时自动追补：

```typescript
// 启动时检查
async function compensateMissedExtractions(): Promise<void> {
  const state = loadMemorySyncState();
  if (!state.lastDailyExtractionDate) return;

  const missedDays = getDaysBetween(state.lastDailyExtractionDate, today());
  if (missedDays <= 1) return; // 没有漏提取

  // 按天逐个补提取，不一次处理太多
  const nextMissedDate = getNextDate(state.lastDailyExtractionDate);
  await memoryExtractionQueue.enqueue({
    jobType: 'daily_extraction',
    workspaceId: currentWorkspaceId,
    targetDate: nextMissedDate,
    targetConversationIds: [] // 空 = 自动查该日全部会话
  });
}
```

### 2.3 入口 ③：手动触发（manual_reindex）

```typescript
// IPC: memory:triggerSync
ipcMain.handle('memory:triggerSync', async (_, params) => {
  const { workspaceId, date, conversationIds, force } = params;

  // force = true 时忽略脏检查，强制重新提取
  await memoryExtractionQueue.enqueue({
    jobType: force ? 'manual_reindex' : 'daily_extraction',
    workspaceId,
    targetDate: date,
    targetConversationIds: conversationIds || []
  });

  return { queued: true };
});
```

---

## 3. 提取任务队列

### 3.1 队列设计

复用 codebase 中 `EmbeddingQueue` 的模式（见 `electron/main/handlers/embedding/queue.ts`）：

```typescript
interface ExtractionJob {
  id: string; // UUID
  jobType: MemorySyncJobType;
  workspaceId: string;
  targetDate?: string;
  targetConversationIds: string[];
  status: 'queued' | 'running' | 'completed' | 'error';
  priority: number; // 越小越优先：manual=0, conv_close=1, daily=2
  createdAt: number;
  abortController?: AbortController;
}

class MemoryExtractionQueue {
  private queue: ExtractionJob[] = [];
  private running: ExtractionJob | null = null;
  private maxConcurrent = 1; // 串行执行，避免 LLM 并发冲突

  async enqueue(params: Omit<ExtractionJob, 'id' | 'status' | 'createdAt'>): Promise<string> {
    // 去重：同一会话不重复入队
    const duplicate = this.queue.find((j) => j.jobType === params.jobType && j.targetDate === params.targetDate && j.workspaceId === params.workspaceId);
    if (duplicate) return duplicate.id;

    const job: ExtractionJob = {
      ...params,
      id: randomUUID(),
      status: 'queued',
      priority: params.jobType === 'manual_reindex' ? 0 : params.jobType === 'conversation_close' ? 1 : 2,
      createdAt: Date.now()
    };

    this.queue.push(job);
    this.queue.sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);

    // 持久化到 memory_sync_jobs 表
    await MemorySyncJobRepo.create({
      id: job.id,
      jobType: job.jobType,
      workspaceId: job.workspaceId,
      targetDate: job.targetDate,
      targetConversationIds: JSON.stringify(job.targetConversationIds),
      status: 'pending'
    });

    this.processNext();
    return job.id;
  }

  private async processNext(): Promise<void> {
    if (this.running) return;
    const next = this.queue.shift();
    if (!next) return;

    this.running = next;
    next.status = 'running';
    next.abortController = new AbortController();

    await MemorySyncJobRepo.updateStatus(next.id, 'running', { startedAt: Date.now() });

    try {
      const result = await executeExtraction(next, next.abortController.signal);
      await MemorySyncJobRepo.updateStatus(next.id, 'completed', {
        completedAt: Date.now(),
        ...result.stats
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        await MemorySyncJobRepo.updateStatus(next.id, 'cancelled');
      } else {
        await MemorySyncJobRepo.updateStatus(next.id, 'failed', {
          errorMessage: err.message
        });
      }
    } finally {
      this.running = null;
      this.processNext(); // 处理下一个
    }
  }

  cancel(jobId: string): boolean {
    const inQueue = this.queue.findIndex((j) => j.id === jobId);
    if (inQueue >= 0) {
      this.queue.splice(inQueue, 1);
      return true;
    }
    if (this.running?.id === jobId) {
      this.running.abortController?.abort();
      return true;
    }
    return false;
  }
}
```

### 3.2 幂等保证

每次提取任务通过以下机制保证幂等：

| 机制                | 说明                                                   |
| ------------------- | ------------------------------------------------------ |
| 会话消息 seq 水位   | 记录每个 conversation 已提取到的最大 message seq       |
| note ID 确定性      | 同日期 + 同 topic slug → 同 note ID，重复提取是 upsert |
| sync_job 去重       | 同类型 + 同日期 + 同 workspace 不重复入队              |
| Markdown 文件覆盖写 | 同 ID note 的重复提取会覆盖旧文件                      |

**已提取水位追踪**：

```typescript
// 在 memory_notes 表或独立表中记录
interface ExtractionWatermark {
  conversationId: string;
  lastExtractedSeq: number; // 已提取到的最大消息序号
  lastExtractedAt: number; // 上次提取时间
}
```

---

## 4. 记忆提取流水线（Extraction Pipeline）

### 4.1 整体流程

```
conversation messages
        │
        ▼
  ┌──────────────────┐
  │ Step 1            │  Collect — 收集原始数据
  │ 读取消息 + 合并   │  → 完整对话文本
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ Step 2            │  Split — 主题拆分
  │ LLM 识别主题簇    │  → N 个主题块
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ Step 3            │  Extract — 结构化抽取
  │ 对每个主题块提取   │  → MemoryExtractionOutput
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ Step 4            │  Merge — 合并去重
  │ 与已有 note 合并  │  → 合并后的 note 内容
  └────────┬─────────┘
           │
           ▼
  ┌──────────────────┐
  │ Step 5            │  Write — 落盘 + 建索引
  │ Markdown + DB     │  → 文件 + 索引 + 图谱
  └──────────────────┘
```

### 4.2 Step 1: Collect（收集原始数据）

```typescript
interface CollectInput {
  conversationIds: string[];
  /** 增量模式：只取 seq > watermark 的消息 */
  watermarks?: Map<string, number>;
}

interface CollectOutput {
  conversations: Array<{
    conversationId: string;
    title?: string;
    messages: Array<{
      role: 'user' | 'assistant';
      content: string;
      seq: number;
      createdAt: number;
    }>;
    metadata?: Record<string, unknown>;
  }>;
  totalMessageCount: number;
  dateRange: { start: string; end: string };
}

async function collect(input: CollectInput): Promise<CollectOutput> {
  const conversations = [];

  for (const convId of input.conversationIds) {
    const conv = await ChatRepo.getConversation(convId);
    if (!conv) continue;

    const watermark = input.watermarks?.get(convId) ?? 0;
    const messages = await ChatRepo.listMessages(convId);

    // 增量：只取新消息
    const newMessages = messages.filter((m) => m.seq > watermark);
    if (newMessages.length === 0) continue;

    conversations.push({
      conversationId: convId,
      title: conv.title,
      messages: newMessages.map((m) => ({
        role: m.role,
        content: m.content,
        seq: m.seq,
        createdAt: m.createdAt
      })),
      metadata: conv.metadata ? JSON.parse(conv.metadata) : undefined
    });
  }

  return {
    conversations,
    totalMessageCount: conversations.reduce((sum, c) => sum + c.messages.length, 0),
    dateRange: computeDateRange(conversations)
  };
}
```

### 4.3 Step 2: Split（主题拆分）

**目标**：将一次或多次对话的消息按主题聚类，产出 N 个主题块。

```typescript
const TOPIC_SPLIT_PROMPT = `
你是一个对话分析器。分析以下对话内容，将其按讨论主题拆分为若干个主题块。

规则：
1. 每个主题块应包含一组围绕同一主题的连续消息
2. 一个主题块可以跨越多次对话（如果不同对话讨论了同一话题）
3. 短暂的、无实质内容的消息可以忽略（问候、确认等）
4. 输出每个主题块的标题、描述、和涉及的消息范围

输出格式（JSON）：
{
  "topicClusters": [
    {
      "topicLabel": "AI Agent 记忆系统设计",
      "topicSlug": "ai-agent-memory-system",
      "description": "讨论了记忆系统的整体架构，包括无向量检索策略...",
      "messageRanges": [
        { "conversationId": "conv-xxx", "seqStart": 1, "seqEnd": 20 },
        { "conversationId": "conv-yyy", "seqStart": 5, "seqEnd": 12 }
      ],
      "estimatedImportance": 0.9
    }
  ]
}
只输出 JSON，不要解释。
`;

interface TopicCluster {
  topicLabel: string;
  topicSlug: string;
  description: string;
  messageRanges: Array<{
    conversationId: string;
    seqStart: number;
    seqEnd: number;
  }>;
  estimatedImportance: number;
}
```

**Token 管理**：

- 如果对话总 token 数超过模型窗口，先按对话分批，每批独立做 topic split
- 使用 `maxTokens` 估算保护，拒绝过长输入
- 典型对话长度（20~100 条消息）通常在一次调用内完成

### 4.4 Step 3: Extract（结构化抽取）

对每个 TopicCluster 调用 LLM，产出 `MemoryExtractionOutput`（定义见 memory-note-spec.md）：

```typescript
const EXTRACTION_PROMPT = `
你是一个记忆提取器。根据以下对话片段，为指定的主题提取结构化记忆。

主题：{topicLabel}
主题描述：{description}

规则：
1. 提取的记忆应是对话的精华，不是逐句转录
2. 重点提取：关键事实、技术决策、用户偏好、待办事项、有价值的上下文
3. 跳过：闲聊、重复内容、过程性操作（如"我来搜索一下"）
4. entities 应包含提到的产品名、技术名、人名、项目名等
5. aliases 应包含主题的中英文变体、缩写
6. relatedTopics 只列与本主题有直接关联的其他主题

输出格式（JSON）—— MemoryExtractionOutput：
{
  "topicLabel": "string",
  "topicSlug": "string",
  "summary": "2~3 句话概要",
  "importance": 0.0~1.0,
  "stability": 0.0~1.0,
  "keywords": ["kw1", "kw2"],
  "aliases": ["别名1", "alias2"],
  "entities": [
    { "name": "OpenClaw", "type": "product" },
    { "name": "sqlite-vec", "type": "technology" }
  ],
  "relatedTopics": ["主题A", "主题B"],
  "sections": {
    "overview": "概述内容...",
    "keyFacts": ["事实1", "事实2"],
    "decisions": ["决策1 及其理由"],
    "openLoops": ["待确认/待实现的事项"],
    "evidence": ["对话中的关键引语或数据"],
    "relatedTopicsDetail": "与其他主题的关联说明"
  }
}
只输出 JSON，不要解释。
`;
```

**AbortSignal 传播**：

```typescript
async function extractTopicMemory(cluster: TopicCluster, messages: ChatMessage[], signal: AbortSignal): Promise<MemoryExtractionOutput> {
  // 拼接消息范围内的对话文本
  const relevantMessages = filterMessagesByRanges(messages, cluster.messageRanges);
  const conversationText = formatMessagesAsText(relevantMessages);

  // LLM 调用
  const result = await llmCall({
    prompt: EXTRACTION_PROMPT.replace('{topicLabel}', cluster.topicLabel).replace('{description}', cluster.description),
    content: conversationText,
    responseFormat: 'json',
    signal // AbortSignal 传递给 LLM 调用
  });

  return JSON.parse(result) as MemoryExtractionOutput;
}
```

### 4.5 Step 4: Merge（合并去重）

**场景**：同一主题在不同日期可能已有 note，需要与已有内容合并。

```typescript
interface MergeInput {
  newExtraction: MemoryExtractionOutput;
  existingNote?: {
    id: string;
    filePath: string;
    frontmatter: MemoryNoteFrontmatter;
    sections: Map<string, string>; // heading → content
  };
}

async function mergeMemory(input: MergeInput): Promise<MergedNote> {
  const { newExtraction, existingNote } = input;

  if (!existingNote) {
    // 全新 note，直接使用提取结果
    return {
      action: 'create',
      noteId: generateNoteId(newExtraction.topicSlug),
      frontmatter: buildFrontmatter(newExtraction),
      sections: buildSections(newExtraction)
    };
  }

  // ━━ 已有 note → 增量合并 ━━

  // 策略 1：Frontmatter 字段合并
  const mergedFrontmatter = {
    ...existingNote.frontmatter,
    version: existingNote.frontmatter.version + 1,
    keywords: dedup([...existingNote.frontmatter.keywords, ...newExtraction.keywords]),
    aliases: dedup([...existingNote.frontmatter.aliases, ...newExtraction.aliases]),
    entities: mergeEntities(existingNote.frontmatter.entities, newExtraction.entities),
    importance: Math.max(existingNote.frontmatter.importance, newExtraction.importance),
    stability: newExtraction.stability, // 稳定度以最新判定为准
    sourceConversationIds: dedup([...existingNote.frontmatter.sourceConversationIds, ...newExtraction.sourceConversationIds]),
    updatedAt: Date.now()
  };

  // 策略 2：Section 内容合并
  // keyFacts: 追加新事实（去重）
  // decisions: 追加新决策
  // openLoops: 根据新信息关闭已解决的事项，追加新事项
  // evidence: 追加新证据
  const mergedSections = mergeSections(existingNote.sections, newExtraction.sections);

  return {
    action: 'update',
    noteId: existingNote.id,
    frontmatter: mergedFrontmatter,
    sections: mergedSections
  };
}
```

**Open Loop 智能合并**：

```typescript
// 用 LLM 判断已有 openLoops 是否被新对话解决
const OPEN_LOOP_MERGE_PROMPT = `
已有的 Open Loops：
{existingLoops}

新的对话内容涉及的决策和事实：
{newDecisions}
{newFacts}

判断每个 Open Loop 的现状，输出 JSON：
[
  { "loop": "原文", "status": "resolved" | "still_open" | "updated", "note": "更新说明" }
]
`;
```

### 4.6 Step 5: Write（落盘 + 建索引）

```
MergedNote
    │
    ├── 5a. 写 Markdown 文件
    │   └── memory/daily/YYYY/MM/YYYY-MM-DD-topic-slug.md
    │
    ├── 5b. 写 memory_notes 表
    │   └── upsert frontmatter 镜像
    │
    ├── 5c. 写 memory_sections 表
    │   └── 解析 Markdown 标题树 → section 索引
    │
    ├── 5d. 更新 memory_topics 表
    │   └── upsert 主题节点 + 更新 heat/noteCount
    │
    ├── 5e. 更新 memory_edges 表
    │   └── topic→note, topic→topic, note→note 边
    │
    ├── 5f. 更新 memory_keywords / memory_note_keywords 表
    │   └── 关键词/别名规范化 + 关联
    │
    ├── 5g. 更新 FTS5 索引
    │   └── INSERT/REPLACE into memory_notes_fts
    │
    └── 5h. 更新水位和任务状态
        └── 记录 lastExtractedSeq + 更新 sync_job
```

**事务保证**：

```typescript
async function writeMemory(merged: MergedNote, job: ExtractionJob): Promise<WriteResult> {
  const stats = { notesCreated: 0, notesUpdated: 0, topicsCreated: 0, edgesCreated: 0, keywordsCreated: 0 };

  // 5a. 写 Markdown（事务外，文件系统）
  const filePath = buildNotePath(merged.frontmatter);
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, renderNoteMarkdown(merged), 'utf-8');

  // 5b ~ 5g. 数据库操作放在事务内
  await db.transaction(async (tx) => {
    // 5b. upsert memory_notes
    const existed = await tx.select().from(memory_notes).where(eq(memory_notes.id, merged.noteId)).get();
    if (existed) {
      await tx.update(memory_notes).set(toNoteRow(merged)).where(eq(memory_notes.id, merged.noteId));
      stats.notesUpdated++;
    } else {
      await tx.insert(memory_notes).values(toNoteRow(merged));
      stats.notesCreated++;
    }

    // 5c. rebuild sections（删除旧的，插入新的）
    await tx.delete(memory_sections).where(eq(memory_sections.noteId, merged.noteId));
    const sections = parseSections(filePath, merged.sections);
    for (const sec of sections) {
      await tx.insert(memory_sections).values(sec);
    }

    // 5d. upsert topics
    for (const topicLabel of merged.frontmatter.topics) {
      const existing = await tx
        .select()
        .from(memory_topics)
        .where(eq(memory_topics.slug, slugify(topicLabel)))
        .get();
      if (existing) {
        await tx
          .update(memory_topics)
          .set({
            heat: sql`heat + 0.1`,
            noteCount: sql`note_count + 1`,
            lastSeenAt: Date.now()
          })
          .where(eq(memory_topics.id, existing.id));
      } else {
        await tx.insert(memory_topics).values({
          label: topicLabel,
          slug: slugify(topicLabel),
          workspaceId: merged.frontmatter.workspaceId,
          heat: 1.0,
          noteCount: 1,
          firstSeenAt: Date.now(),
          lastSeenAt: Date.now()
        });
        stats.topicsCreated++;
      }
    }

    // 5e. upsert edges
    // ... topic→note, topic→topic 边（省略细节，参见 memory-db-schema.md）
    stats.edgesCreated += await upsertEdges(tx, merged);

    // 5f. upsert keywords
    stats.keywordsCreated += await upsertKeywords(tx, merged);

    // 5g. FTS5 索引
    await rebuildNoteFTS(tx, merged.noteId, merged);
  });

  return stats;
}
```

---

## 5. 进度报告与 UI 反馈

### 5.1 progress JSON 结构

```typescript
interface ExtractionProgress {
  stage: 'collect' | 'split' | 'extract' | 'merge' | 'write';
  current: number; // 当前处理的主题块序号
  total: number; // 总主题块数
  currentTopic?: string; // 当前处理的主题名
  message?: string; // 可读描述
}
```

### 5.2 实时推送

```typescript
// 通过 broadcastToAllWindows 推送进度
function reportProgress(jobId: string, progress: ExtractionProgress): void {
  broadcastToAllWindows('memory:extraction-progress', {
    jobId,
    ...progress
  });

  // 同时持久化到 DB（用于查询历史任务状态）
  MemorySyncJobRepo.updateProgress(jobId, JSON.stringify(progress));
}

// Renderer 监听
window.YUA.events.on('memory:extraction-progress', (data) => {
  // 更新 UI 进度条、通知等
});
```

---

## 6. 增量同步状态管理

### 6.1 状态数据

```typescript
interface MemorySyncState {
  /** 最近一次日终提取的日期 */
  lastDailyExtractionDate?: string;
  /** 每个会话的消息水位：conversationId → lastExtractedSeq */
  conversationWatermarks: Record<string, number>;
  /** 最近一次成功提取的时间 */
  lastSuccessfulExtractionAt?: number;
  /** 统计 */
  totalNotesCreated: number;
  totalExtractionRuns: number;
}
```

### 6.2 存储位置

两种方案：

| 方案      | 存储                                 | 优点                 | 缺点                 |
| --------- | ------------------------------------ | -------------------- | -------------------- |
| A（推荐） | memory_sync_jobs + memory_notes 表   | 数据库一致性，可查询 | 需要额外查询         |
| B         | JSON 文件（memory/.sync-state.json） | 简单直接             | 文件与 DB 可能不一致 |

**推荐方案 A**：水位信息从 `memory_notes.sourceConversationIds` + `memory_sync_jobs` 反推，不维护额外状态文件。

```typescript
// 查询某个会话的已提取水位
async function getConversationWatermark(conversationId: string): Promise<number> {
  // 从最近一次成功提取的 sync_job 中获取
  const lastJob = await db
    .select()
    .from(memory_sync_jobs)
    .where(and(eq(memory_sync_jobs.status, 'completed'), like(memory_sync_jobs.targetConversationIds, `%${conversationId}%`)))
    .orderBy(desc(memory_sync_jobs.completedAt))
    .limit(1)
    .get();

  if (!lastJob) return 0;

  // 从 job 的结果元数据中获取水位（存在 progress 或新增字段中）
  return lastJob.maxExtractedSeq ?? 0;
}
```

### 6.3 增量 vs 全量判断

```
收到提取请求
    │
    ├── targetConversationIds 为空？
    │   ├── 是 → 查询 targetDate 当天所有会话 → 全量提取
    │   └── 否 → 对每个会话查水位 → 增量提取
    │
    ├── jobType = 'manual_reindex'？
    │   ├── 是 → 忽略水位，全量重提
    │   └── 否 → 常规增量
    │
    ▼
  选择模式后进入 Step 1: Collect
```

---

## 7. 容错与恢复

### 7.1 错误分类

| 错误类型          | 处理策略                           | 是否重试          |
| ----------------- | ---------------------------------- | ----------------- |
| LLM 调用超时      | 记录失败，标记任务 failed          | 可重试（backoff） |
| LLM 返回非法 JSON | 尝试 JSON 修复，失败则跳过当前主题 | 自动重试 1 次     |
| 文件系统写入失败  | 回滚事务，标记任务 failed          | 可手动重试        |
| 数据库事务失败    | 自动回滚，不影响已写入的文件       | 可重试            |
| AbortSignal 取消  | 标记 cancelled，保留已完成的部分   | 需手动重新触发    |

### 7.2 部分成功处理

```typescript
// 一次提取可能有 N 个主题块，某些可能失败
interface ExtractionResult {
  succeeded: Array<{ topicSlug: string; noteId: string }>;
  failed: Array<{ topicSlug: string; error: string }>;
  stats: WriteStats;
}

// 失败的主题块不阻塞成功的
// 记录到 sync_job.errorMessage 中，供后续查看
```

### 7.3 崩溃恢复

```typescript
// 应用启动时检查未完成的任务
async function recoverInFlightJobs(): Promise<void> {
  const stuckJobs = await MemorySyncJobRepo.findByStatus('running');

  for (const job of stuckJobs) {
    // 所有 'running' 状态但应用已重启的任务 → 标记为 failed
    await MemorySyncJobRepo.updateStatus(job.id, 'failed', {
      errorMessage: 'Application crashed during extraction, needs manual retry'
    });
  }
}
```

---

## 8. 资源消耗控制

### 8.1 LLM 调用预算

| 步骤                | 预估 token 消耗                        | 控制措施           |
| ------------------- | -------------------------------------- | ------------------ |
| Topic Split         | 输入：对话全文，输出：~500 tokens      | 对话过长时分批     |
| Extract (per topic) | 输入：主题相关消息，输出：~1000 tokens | 每主题独立调用     |
| Open Loop Merge     | 输入：~500 tokens，输出：~200 tokens   | 仅在有已有 note 时 |
| **单次日终提取**    | **~3k~15k tokens（取决于对话量）**     | 可配置上限         |

### 8.2 配置项

```typescript
interface MemoryExtractionConfig {
  /** 是否启用自动记忆提取 */
  enabled: boolean;
  /** 触发提取的最少新增消息数 */
  minNewMessages: number; // default: 4
  /** 会话结束触发的最小间隔（毫秒） */
  minTriggerInterval: number; // default: 30 * 60 * 1000
  /** 单次提取的最大 token 预算 */
  maxTokensPerExtraction: number; // default: 20000
  /** 使用的 AI provider 和 model（可独立配置，不绑定聊天 provider） */
  providerId?: string;
  model?: string;
  /** 日终提取的目标时间（HH:mm） */
  dailyExtractionTime?: string; // default: "02:00"
}
```

### 8.3 智能跳过

```typescript
function shouldSkipConversation(conv: Conversation): boolean {
  // 跳过：agent 自动对话
  if (conv.metadata?.isAutomated) return true;
  // 跳过：纯工具调用对话（无实质性讨论）
  if (conv.messagesCount < 4) return true;
  // 跳过：标题为空或自动生成的调试对话
  if (conv.title?.startsWith('[DEBUG]')) return true;

  return false;
}
```

---

## 9. 服务边界与模块划分

```
┌─────────────────────────────────────────────────┐
│  electron/main/handlers/memory/                  │
│  ├── ipc-main.ts          — IPC handler 注册     │
│  ├── extraction-queue.ts  — 提取任务队列          │
│  └── extraction-worker.ts — 提取执行器            │
├─────────────────────────────────────────────────┤
│  packages/ai/services/                           │
│  ├── memory-extraction-service.ts — 提取流水线    │
│  │   ├── collect()                               │
│  │   ├── splitTopics()                           │
│  │   ├── extractMemory()                         │
│  │   ├── mergeMemory()                           │
│  │   └── writeMemory()                           │
│  └── memory-retrieval-service.ts — 检索（已设计） │
├─────────────────────────────────────────────────┤
│  electron/main/db/repositories.ts （扩展）        │
│  ├── MemoryNoteRepo                              │
│  ├── MemorySectionRepo                           │
│  ├── MemoryTopicRepo                             │
│  ├── MemoryEdgeRepo                              │
│  ├── MemoryKeywordRepo                           │
│  └── MemorySyncJobRepo                           │
├─────────────────────────────────────────────────┤
│  packages/event/events.ts （扩展）                │
│  ├── AppEvent.MEMORY_EXTRACTION_STARTED          │
│  ├── AppEvent.MEMORY_EXTRACTION_PROGRESS         │
│  ├── AppEvent.MEMORY_EXTRACTION_COMPLETED        │
│  └── AppEvent.MEMORY_EXTRACTION_FAILED           │
└─────────────────────────────────────────────────┘
```

---

## 10. 观测与验证指标

### 10.1 核心指标体系

```
┌──────────────────────────────────────────────────────────────┐
│                     观测指标三层体系                           │
├──────────────────┬──────────────────┬────────────────────────┤
│   提取质量指标    │    检索效果指标   │    系统运行指标         │
│   (Extraction)   │   (Retrieval)    │   (Operational)        │
├──────────────────┼──────────────────┼────────────────────────┤
│ • 主题拆分准确度  │ • 召回命中率     │ • 提取延迟             │
│ • 抽取完整度     │ • 排序相关度      │ • LLM token 消耗       │
│ • 去重率         │ • 段落精确度      │ • 队列等待时间          │
│ • 合并成功率     │ • 无向量召回满意度 │ • 索引一致性            │
│ • 实体抽取率     │ • 首页命中率      │ • FTS5 索引大小         │
│ • 关键词覆盖度   │ • 上下文利用率    │ • 任务成功率            │
└──────────────────┴──────────────────┴────────────────────────┘
```

### 10.2 提取质量指标（Extraction Quality）

| 指标                     | 定义                                     | 计算方式                                         | 目标值               |
| ------------------------ | ---------------------------------------- | ------------------------------------------------ | -------------------- |
| **主题拆分准确度**       | 自动拆分的主题数 vs 人工判断的合理主题数 | 人工抽样 10 次提取，对比主题粒度                 | ≥ 80% 合理           |
| **抽取完整度**           | 重要信息是否被提取                       | 人工标注对话中的关键事实，检查是否出现在 note 中 | ≥ 85% 关键事实被捕获 |
| **去重率**               | 重复内容占比                             | `重复段落数 / 总段落数`                          | ≤ 10%                |
| **合并成功率**           | 增量合并时不丢信息                       | `合并后保留的旧信息数 / 合并前旧信息数`          | ≥ 95%                |
| **Open Loop 状态准确度** | resolved/still_open 判断准确率           | 人工验证                                         | ≥ 80%                |
| **实体抽取率**           | 对话中提到的实体被识别的比例             | 人工标注 vs 自动提取                             | ≥ 75%                |

**自动化度量**（可编程度量）：

```typescript
interface ExtractionMetrics {
  jobId: string;

  // ━━ 可自动计算 ━━
  topicCount: number; // 拆分出的主题数
  avgSectionsPerNote: number; // 平均每个 note 的 section 数
  avgKeywordsPerNote: number; // 平均每个 note 的关键词数
  avgEntitiesPerNote: number; // 平均每个 note 的实体数
  duplicateKeywordRate: number; // 跨 note 重复关键词比例
  mergeConflicts: number; // 合并冲突次数
  emptyNotes: number; // 内容为空的 note 数（异常信号）

  // ━━ 需人工标注 ━━
  topicSplitAccuracy?: number; // 人工评估
  extractionCompleteness?: number;
}
```

### 10.3 检索效果指标（Retrieval Quality）

| 指标                               | 定义                                  | 计算方式                                     | 目标值 |
| ---------------------------------- | ------------------------------------- | -------------------------------------------- | ------ |
| **召回命中率 (Recall@5)**          | Top-5 结果中包含相关 note 的比例      | 标注 20 组测试查询 + 期望 note，运行检索比对 | ≥ 70%  |
| **首页命中率 (Hit@1)**             | 第一条结果就是最相关 note             | 同上                                         | ≥ 50%  |
| **段落精确度 (Section Precision)** | 返回的 section 中实际相关的比例       | 人工判断返回段落的相关性                     | ≥ 60%  |
| **排序质量 (NDCG@5)**              | 排序是否合理                          | 标注相关度等级 (0/1/2)，计算 NDCG            | ≥ 0.65 |
| **无向量满意度**                   | 与向量检索对比的满意度差距            | 未来增加向量后 A/B 对比                      | 基线   |
| **上下文利用率**                   | 注入的记忆内容被 Agent 实际使用的比例 | 检查 Agent 回答是否引用了注入的记忆          | ≥ 40%  |

**测试查询集**：

```typescript
const RETRIEVAL_TEST_QUERIES = [
  // 类别 1：模糊主题查询
  { query: '最近聊过哪些科技相关内容', expectedTopics: ['AI Agent', '记忆系统'] },

  // 类别 2：精确词查询
  { query: 'sqlite-vec 的使用方式', expectedKeywords: ['sqlite-vec', 'vector'] },

  // 类别 3：时间范围查询
  { query: '上周讨论了什么', expectedDateRange: 'last_week' },

  // 类别 4：决策回忆
  { query: '我们决定不用向量检索的原因', expectedSections: ['Decisions'] },

  // 类别 5：待办查询
  { query: '还有哪些事情没做完', expectedSections: ['Open Loops'] },

  // 类别 6：实体关联
  { query: 'OpenClaw 的记忆系统是怎么设计的', expectedEntities: ['OpenClaw'] },

  // 类别 7：跨主题关联
  { query: 'AI Agent 和记忆系统的关系', expectedTopics: ['AI Agent', '记忆系统'] }
];
```

### 10.4 系统运行指标（Operational）

| 指标               | 定义                            | 采集方式                                  | 告警阈值         |
| ------------------ | ------------------------------- | ----------------------------------------- | ---------------- |
| **提取延迟**       | 从触发到完成的耗时              | sync_job.completedAt - startedAt          | > 60s 警告       |
| **队列等待时间**   | 从入队到开始的耗时              | sync_job.startedAt - createdAt            | > 5min 警告      |
| **LLM token 消耗** | 单次提取的 token 总数           | sync_job.tokensUsed                       | > 20k 审查       |
| **任务成功率**     | 完成任务 / 总任务               | `completed / (completed + failed)`        | < 90% 要调查     |
| **FTS5 索引大小**  | 索引占用的磁盘空间              | SQLite page_count × page_size             | > 50MB 审查      |
| **note 文件数**    | 总记忆文件数                    | `find memory/daily -name '*.md' \| wc -l` | > 1000 考虑归档  |
| **图谱节点数**     | topic + edge 总数               | `SELECT COUNT(*) FROM memory_topics`      | 监控趋势         |
| **索引一致性**     | DB 索引与 Markdown 文件的一致率 | 定期校验                                  | < 95% 需 reindex |

**自动采集**：

```typescript
interface OperationalMetrics {
  // 每次提取后自动记录到 sync_job
  extractionDurationMs: number;
  queueWaitMs: number;
  tokensUsed: number;

  // 定期采集（可在 DailyCare tick 中）
  totalNotes: number;
  totalTopics: number;
  totalEdges: number;
  totalKeywords: number;
  ftsIndexSizeBytes: number;
  oldestPendingJobAge?: number; // 最老的 pending 任务等待时间
}

async function collectOperationalMetrics(): Promise<OperationalMetrics> {
  const [notes, topics, edges, keywords] = await Promise.all([
    db
      .select({ count: sql`count(*)` })
      .from(memory_notes)
      .get(),
    db
      .select({ count: sql`count(*)` })
      .from(memory_topics)
      .get(),
    db
      .select({ count: sql`count(*)` })
      .from(memory_edges)
      .get(),
    db
      .select({ count: sql`count(*)` })
      .from(memory_keywords)
      .get()
  ]);

  // FTS 索引大小
  const ftsSize = db.all(sql`
    SELECT sum(s) FROM (
      SELECT pageno * ${pageSize} AS s FROM memory_notes_fts_data
    )
  `);

  return {
    totalNotes: notes.count,
    totalTopics: topics.count,
    totalEdges: edges.count,
    totalKeywords: keywords.count,
    ftsIndexSizeBytes: ftsSize[0]?.sum ?? 0,
    extractionDurationMs: 0,
    queueWaitMs: 0,
    tokensUsed: 0
  };
}
```

### 10.5 索引一致性校验

```typescript
/**
 * 定期验证 DB 索引与文件系统的一致性。
 * 可在 DailyCare 中每天运行一次。
 */
async function validateIndexConsistency(workspaceId: string): Promise<ConsistencyReport> {
  const report = { total: 0, consistent: 0, missingFile: 0, missingIndex: 0, stale: 0 };

  // 1. DB 中有索引但文件不存在
  const indexedNotes = await db.select().from(memory_notes).where(eq(memory_notes.workspaceId, workspaceId));
  for (const note of indexedNotes) {
    report.total++;
    if (!(await fileExists(note.filePath))) {
      report.missingFile++;
    } else {
      // 检查文件内容 checksum 是否与索引一致
      const fileChecksum = await computeChecksum(note.filePath);
      if (fileChecksum !== note.checksum) {
        report.stale++;
      } else {
        report.consistent++;
      }
    }
  }

  // 2. 文件系统有文件但 DB 中无索引
  const mdFiles = await glob('memory/daily/**/*.md', { cwd: workspacePath });
  for (const file of mdFiles) {
    if (file.endsWith('.index.md')) continue;
    const frontmatter = parseFrontmatter(file);
    if (frontmatter?.id && !indexedNotes.find((n) => n.id === frontmatter.id)) {
      report.missingIndex++;
    }
  }

  return report;
}
```

### 10.6 验证流程

```
┌────────────────────────────────────────────────────────────────┐
│                      验证流程                                   │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  Level 1: 自动验证（每次提取后）                                 │
│  ├── 检查提取产出是否为空                                       │
│  ├── 检查 JSON 解析是否成功                                     │
│  ├── 检查 note 文件是否成功写入                                  │
│  ├── 检查 DB 索引是否与文件一致                                  │
│  └── 记录自动度量指标到 sync_job                                 │
│                                                                │
│  Level 2: 定期验证（每日/按配置）                                │
│  ├── 索引一致性校验                                             │
│  ├── FTS5 索引大小与 note 数量比例                               │
│  ├── topic graph 孤岛检测（无关联的 topic 节点）                  │
│  ├── 运行测试查询集并比较命中率                                   │
│  └── 采集运行指标 → 存入度量日志                                  │
│                                                                │
│  Level 3: 人工验证（按需）                                       │
│  ├── 抽样检查 note 内容质量                                      │
│  ├── 标注测试查询集的期望结果                                     │
│  ├── 对比无向量 vs 有向量召回差异                                 │
│  └── 调整权重和阈值                                              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## 11. 完整时序示例

### 11.1 会话结束触发

```
用户与 AI 完成一次对话（共 20 条消息）
        │
        ▼
  AppEvent.SPRITE_AI_COMPLETE
        │
        ▼
  shouldTriggerExtraction()
  ├── newMessages=20, ≥4 ✓
  ├── totalMessages=20, ≥6 ✓
  └── lastExtraction=null, 间隔满足 ✓
        │
        ▼
  memoryExtractionQueue.enqueue({
    jobType: 'conversation_close',
    conversationIds: ['conv-xxx'],
    priority: 1,
  })
        │
        ▼ （异步，不阻塞用户）
  processNext()
        │
        ▼
  Step 1: collect() — 读取 20 条消息
        │
        ▼
  Step 2: splitTopics() — LLM 拆分为 2 个主题
     ├── "记忆系统架构设计"（消息 1~15）
     └── "SQLite FTS5 使用"（消息 16~20）
        │
        ▼
  Step 3: extractMemory() × 2
     ├── 主题 1 → MemoryExtractionOutput
     └── 主题 2 → MemoryExtractionOutput
        │
        ▼
  Step 4: mergeMemory() × 2
     ├── 主题 1：已有 note → 增量合并
     └── 主题 2：新主题 → 创建新 note
        │
        ▼
  Step 5: writeMemory() × 2
     ├── 写 2 个 Markdown 文件
     ├── upsert 2 条 memory_notes
     ├── rebuild sections
     ├── upsert topics + edges
     └── 更新 FTS5
        │
        ▼
  sync_job.status = 'completed'
  记录 metrics: {
    duration: 12.3s,
    tokensUsed: 4500,
    notesCreated: 1,
    notesUpdated: 1,
    topicsCreated: 1,
  }
```

### 11.2 日终批量提取

```
DailyCareService.tick() 检查
        │
        ▼
  checkDailyMemoryExtraction()
  ├── lastDailyExtractionDate ≠ today ✓
  └── 查询当天 5 个会话（其中 2 个已触发过 conversation_close）
        │
        ▼
  memoryExtractionQueue.enqueue({
    jobType: 'daily_extraction',
    targetDate: '2026-03-26',
    conversationIds: ['conv-a', 'conv-b', 'conv-c', 'conv-d', 'conv-e'],
    priority: 2,
  })
        │
        ▼
  processNext()
        │
        ▼
  Step 1: collect()
  ├── conv-a: watermark=20 → 读取 seq 21~35（增量）
  ├── conv-b: watermark=15 → 读取 seq 16~22（增量）
  ├── conv-c: watermark=0 → 读取全部 40 条（新会话）
  ├── conv-d: watermark=0 → 4 条消息 → shouldSkip ✓（太短）
  └── conv-e: watermark=0 → 读取全部 30 条
        │
        ▼
  Step 2-5: 拆分为 6 个主题，生成/更新 6 个 note
        │
        ▼
  更新 lastDailyExtractionDate = '2026-03-26'
  sync_job.status = 'completed'
```

---

## 12. IPC 接口汇总

| Channel | 请求参数 | 响应 | 说明 |
| --- | --- | --- | --- |
| `memory:search` | `{ query, workspaceId, topicFilter?, dateRange?, maxResults?, includeContent? }` | `MemorySearchResult` | 搜索记忆 |
| `memory:get` | `{ noteId, section?, lineRange? }` | `MemoryGetResult \| null` | 读取 note / 段落详情 |
| `memory:topics` | `{ topicId?, action?, workspaceId?, limit? }` | `MemoryTopicsResult` | 浏览主题图谱 |
| `memory:listNotes` | `{ workspaceId, limit?, offset? }` | `MemoryNoteRow[]` | 分页列出 note |
| `memory:syncStatus` | 无 | `{ queue, latestJob }` | 查询当前队列与最近任务状态 |
| `memory:triggerSync` | `{ workspaceId?, date?, conversationIds?, force? }` | `{ queued: boolean, jobId?, error? }` | 手动触发提取 |
| `memory:rebuildIndex` | 无 | `{ success: boolean, notesIndexed?, error? }` | 当前仅重建 FTS 索引 |
| `memory:deleteNote` | `noteId` | `{ success: boolean, error? }` | 删除单条记忆 note |
| `memory:graphData` | `{ topicId?, workspaceId?, includeNotes?, maxTopics?, maxEdges? }` | `{ topics, edges, notes }` | 获取图谱数据 |
| `memory:stats` | `{ workspaceId? }` | `{ noteCount, topicCount, edgeCount }` | 获取基础统计 |
| `memory:cleanupForConversations` | `{ conversationIds }` | `{ updated, deleted, errors }` | 按对话清理相关记忆 |
| `memory:clearAll` | `{ workspaceId? }` | `{ tablesCleared, filesDeleted, errors }` | 清空记忆数据 |

---

## 13. 新增 AppEvent 定义

```typescript
// packages/event/events.ts 追加

export enum AppEvent {
  // ... 现有事件 ...

  /** 记忆提取任务开始 */
  MEMORY_EXTRACTION_STARTED = 'MEMORY_EXTRACTION_STARTED',
  /** 记忆提取进度更新 */
  MEMORY_EXTRACTION_PROGRESS = 'MEMORY_EXTRACTION_PROGRESS',
  /** 记忆提取任务完成 */
  MEMORY_EXTRACTION_COMPLETED = 'MEMORY_EXTRACTION_COMPLETED',
  /** 记忆提取任务失败 */
  MEMORY_EXTRACTION_FAILED = 'MEMORY_EXTRACTION_FAILED'
}
```

---

## 14. 配置 UI 预留（尚未实现）

当前代码尚未接入这套 preferences；以下内容仍属于预留设计。

```typescript
interface MemoryPreferences {
  /** 记忆系统总开关 */
  memoryEnabled: boolean;
  /** 自动提取开关 */
  autoExtractionEnabled: boolean;
  /** 提取使用的 provider/model（独立于聊天 provider） */
  extractionProviderId?: string;
  extractionModel?: string;
  /** 最小触发消息数 */
  minNewMessagesForExtraction: number;
  /** 提取触发最小间隔（分钟） */
  extractionCooldownMinutes: number;
  /** 日终提取时间 */
  dailyExtractionTime: string;
  /** 单次最大 token 预算 */
  maxTokensPerExtraction: number;
}
```

---

## 15. 对话删除 → 记忆清理

### 15.1 问题

当用户删除对话后，从该对话提取的记忆如果继续保留，会产生"幽灵记忆"——
引用已不存在的对话，且可能包含用户希望遗忘的信息。

### 15.2 清理策略

```
对话被物理删除
       │
       ▼
  ┌────────────────────────┐
  │ MemoryNoteRepo          │
  │ .removeConversationSource│
  └───────────┬────────────┘
              │
    ┌─────────┴─────────┐
    ▼                   ▼
  还有其他来源？       所有来源被删？
  sourceConvIds.len>0  sourceConvIds.len=0
    │                   │
    ▼                   ▼
  更新 note            完整删除
  移除被删 ID          ┌─────────────────┐
                      │ fullDeleteNote   │
                      │ 1. 删 FTS        │
                      │ 2. 删图谱边      │
                      │ 3. 删关键词关联  │
                      │ 4. 删 note 行    │
                      │ 5. 删 MD 文件    │
                      └─────────────────┘
```

### 15.3 触发点

| 路径                        | 时机             | 方式                              |
| --------------------------- | ---------------- | --------------------------------- |
| `ai:hardDeleteConversation` | 用户直接硬删会话 | 异步 fire-and-forget              |
| `trash:purge`               | 从回收站清除     | 先收集 convIds → purge → 异步清理 |
| `trash:empty`               | 清空回收站       | 先收集 convIds → empty → 异步清理 |

> **软删除不清理**：`ai:deleteConversation`（移入回收站）不触发记忆清理，
> 与资源回收站设计一致——只有物理删除才是真正的删除意图。

### 15.4 实现文件

```
electron/main/handlers/memory/memory-cleanup.ts  ← 独立模块，无循环依赖
├── cleanupMemoryForConversations(convIds)        ← 主入口
└── fullDeleteMemoryNote(noteId, wsId, filePath)  ← 5 步级联
```
