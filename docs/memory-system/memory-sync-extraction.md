# 增量同步与记忆提取流程设计 v1

> 本文档定义 Chobits 记忆系统的增量同步策略、记忆提取流水线、后台任务编排，以及观测与验证指标。
> 核心约束：提取任务不阻塞聊天主链路，对话数据只进不出（幂等、可重试），Markdown 为最终事实源。

## 当前实现状态（2026-04-13）

- 已完成：主触发链路、提取队列与 worker、增量水位线、提取进度事件、手动触发同步、FTS 索引增量维护、对话删除后的记忆清理。
- 当前主触发源是 `AppEvent.AGENT_LOOP_COMPLETE`；`AppEvent.SPRITE_AI_COMPLETE` 仅作为兼容旧路径保留。触发后会延迟 5 秒再做脏检查和入队。
- 已实现的调度细节包括：`conversationWatermarks` 内存水位线、`extractingConversations` + `pendingTrailingRun` 的 coalescing/trailing-run 机制，以及运行时配置驱动的消息阈值 / cooldown / periodic save 判定。
- 提取模型当前会优先尝试 provider 对应的 fast model，失败后回退到该 provider / preset 的默认模型配置。
- 已实现：`daily_extraction` 定时任务（30 分钟间隔维护 tick）、漏跑补偿（启动时检查并回溯）、`memory:cancelSync`（取消当前/指定提取任务）、`memory:getMetrics`（提取统计与索引计数）。
- 已实现：配置 UI（`MemoryManagementSettings` 中的记忆系统总开关、自动提取开关、自动召回开关），配置存储于 `memory-config.json`，并通过 `resolveExtractionRuntimeConfig()` 真正影响 worker 运行时行为。
- 已实现：Open Loop 智能合并 — `mergeMemory()` 中对 "Open Items" section 使用 LLM 判断已有待办是否被新对话解决。
- 已实现：note merge compaction — `mergeMemory()` 现在会刷新 `summary`，并对 `Key Points` / `Open Items` / `Recall Cues` 做去重压缩；有新 `Source Excerpts` 时直接覆盖旧摘录，避免长期 append 膨胀。
- 已实现：canonical topic resolution — `extractMemory()` 之后会先做本地 topic 归一化，再查 workspace 内已有 topic 候选；命中已有 canonical topic 时复用其 label / slug，并把原始表述写入 note/topic `aliases`，同时把 note keywords 的 `primaryTopicId` 回填到 canonical topic。
- 已实现：3 种边类型创建（`belongs_to_topic`、`related_to_topic`、`contains_section`）。
- 已实现：`fileChecksum`（sha256）、`timeRange`（消息时间戳范围）、`sections.keywords`（段落级关键词）字段自动填充。
- 已实现：heat 衰减（指数衰减因子 0.95，每日执行一次）。
- 已实现：`recall_cue_backfill` 历史回填任务，复用长任务 LLM 执行机制，为旧 note 渐进式补写 `Recall Cues`，并在成功后自动刷新 `memory/MEMORY.md`。
- 已实现：手动入口 `memory:backfillRecallCues`，可指定 noteIds 或 limit 做回填测试。
- 已实现：核心回归测试覆盖提取、清理、内容生成、检索与 runtime config 接线。
- 记忆 FTS 现为 note-scoped 增量维护；启动时若检测到旧的 contentless `memory_notes_fts`，会自动重建为可行级删除/插入的 row-mutable FTS 表并从派生源重建。
- 已实现：高重要度 note 的矛盾处理从 `Key Points` 内联 warning 升级为结构化 `frontmatter.contradictions[]` + 独立 `Contradictions` 段，并为矛盾查询增加定向召回。
- 已实现：`memory:validateIndex`，按 Markdown 真值源只读校验 `memory_notes` / `memory_sections` / `memory_notes_fts` 是否与派生索引一致，并返回 mismatch report。
- 尚未实现：窗口关闭/会话切换触发。
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

> 注：截至 2026-04-12，图中的“窗口关闭/切换触发”仍未落地。当前实际运行的是
> `AGENT_LOOP_COMPLETE` / `SPRITE_AI_COMPLETE` 两条会话完成入口、`memoryDailyMaintenanceTick()` 中的渐进式 `Recall Cues` 回填检查，以及 `memory:triggerSync` / `memory:backfillRecallCues` 两个手动入口。

---

## 2. 触发入口详细设计

### 2.1 入口 ①：会话结束触发（conversation_close）

**触发时机**

| 场景                 | 触发条件                            | 说明                                  |
| -------------------- | ----------------------------------- | ------------------------------------- |
| Agent 工具循环结束   | `AppEvent.AGENT_LOOP_COMPLETE` 事件 | 当前主路径；Pi runtime 回合完成后触发 |
| 普通对话完成（兼容） | `AppEvent.SPRITE_AI_COMPLETE` 事件  | 旧路径 / 非 Pi runtime 的兼容入口     |

**判定逻辑：是否需要提取**

不是每次对话完成都直接入队。当前实现的核心判断如下：

```typescript
const runtimeConfig = resolveExtractionRuntimeConfig(loadMemoryConfig());

async function onConversationComplete(payload: { conversationId: string; persisted?: boolean; hasToolCalls?: boolean }) {
  if (!payload.conversationId || payload.persisted === false) return;

  const cooldown = getCooldownState(lastTriggeredAt.get(payload.conversationId), Date.now(), runtimeConfig);
  if (cooldown.active) return;

  // 如果同一会话仍在提取中，不丢弃，先挂成 trailing run
  if (extractingConversations.has(payload.conversationId)) {
    pendingTrailingRun.add(payload.conversationId);
    return;
  }

  // 当前实现会延迟 5 秒再检查，尽量等消息持久化完整
  setTimeout(async () => {
    const watermark = conversationWatermarks.get(payload.conversationId) ?? 0;
    const newMessages = await listUserAssistantMessagesAfter(payload.conversationId, watermark);
    const accumulatedMessageCount = messagesSinceLastExtraction.get(payload.conversationId) ?? newMessages.length;

    const decision = evaluateExtractionTrigger({
      config: runtimeConfig,
      hasToolCalls: !!payload.hasToolCalls,
      newMessageCount: newMessages.length,
      accumulatedMessageCount
    });
    if (!decision.shouldEnqueue) return;

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

**周期性保存（I-6: Periodic Save）**：

长对话中，`onAgentLoopComplete` 会追踪每个会话的累计消息数。当消息数达到 `periodicSaveInterval`（默认 20 条）时，`evaluateExtractionTrigger()` 会把这次触发标记为 `periodicTrigger=true`，从而强制入队一次提取，无论是否达到常规阈值。这防止了长对话中间的信息丢失。

```typescript
const decision = evaluateExtractionTrigger({
  config: runtimeConfig,
  hasToolCalls,
  newMessageCount,
  accumulatedMessageCount
});

if (decision.periodicTrigger) {
  await enqueueConversationCloseJob(conversationId);
}
```

`periodicSaveInterval`、`minNewMessagesForExtraction`、`extractionCooldownMinutes`、`maxTokensPerExtraction` 均可通过 `memory-config.json` 配置，并在 worker 启动时打印 effective config。

### 2.2 入口 ②：日终批量提取（daily_extraction）

> 截至 2026-04-12，此入口已接入 `DailyCareService`，且包含漏跑补偿逻辑。下面保留的是最终落地后的结构说明。

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

> 当前实际实现比上面的伪码多了一层 canonical topic 写回：
> `upsert topics` 时会合并 `aliases` / `keywords`，`upsert keywords` 时会把 `primaryTopicId` 回填到主 canonical topic，
> 并且 `topic→note` / `topic→topic` 边会优先使用真实 topic ID，而不是只依赖 `topic_${slug}` 约定。

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
5. 判断每个主题块的最可能领域属性（domain）：如果主要围绕某个人就写 "person:名字"，某个项目就写 "project:名称"，否则写 "general"

输出格式（JSON）：
{
  "topicClusters": [
    {
      "topicLabel": "AI Agent 记忆系统设计",
      "topicSlug": "ai-agent-memory-system",
      "description": "讨论了记忆系统的整体架构，包括无向量检索策略...",
      "domain": "project:chobits",
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
  domain?: string; // 领域标识，如 "person:Alice"、"project:chobits"、"general"
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

> 说明：这里抽取的是面向检索与合并的 Memory Note 事实源，不直接等价于 `MEMORY.md`。
> `MEMORY.md` 在内容生成阶段会优先消费 note 中的 `Recall Cues`，再结合 `importance`、`stability`、`Open Items` 和近期性做长期记忆摘要整理。

```typescript
const EXTRACTION_PROMPT = `
从对话中提取记忆索引，用于日后快速检索。记忆是索引而非转录，完整内容可通过 sourceConversationIds 回溯原始对话。

主题：{topicLabel}
主题描述：{description}

规则：
1. 只提取有长期价值的信息：用户偏好、关键事实、技术决策、重要结论
2. 跳过：闲聊、重复内容、过程性操作、助手的推理过程、通用知识
3. summary 用 1-2 句话概括核心要点，不要复述对话过程
4. keywords 应包含适合搜索的关键词（中英文均可），3-6 个
5. entities 只列对话中明确提到的专有名词（产品、人名、技术等）
6. sections.keyPoints 用精炼的要点列表，每条一行，格式为 "- 要点内容"，合并事实和决策
7. sections.openItems 只在有明确待办/未解决问题时才填写，否则省略
8. sections.recallCues 只记录“未来值得回忆”的重点，不要流水账；每条必须使用 "- [kind] 内容"
9. kind 只能是：ongoing（正在延续的事情）、decision（关键决定）、principle（长期原则）、event（值得记住的事件）、follow_up（重要待跟进）
10. 如果当前主题没有足够强的长期记忆候选，可以省略 sections.recallCues
11. 如果 importance > 0.8，还需提取用户的原始话语作为 sourceExcerpts（最多 3 条，每条不超过 200 字符）
12. entities 中如果存在实体间关系，请用 relations 字段描述（如 {"name":"Alice","type":"person","relations":[{"target":"Project X","predicate":"works_on","validFrom":"2026-01"}]}）

输出格式（JSON）—— MemoryExtractionOutput：
{
  "topicLabel": "string",
  "topicSlug": "string",
  "summary": "1~2 句话概要",
  "importance": 0.0~1.0,
  "stability": 0.0~1.0,
  "keywords": ["kw1", "kw2"],
  "entities": [
    { "name": "OpenClaw", "type": "product" },
    { "name": "Alice", "type": "person", "relations": [{"target": "Chobits", "predicate": "works_on", "validFrom": "2026-04"}] }
  ],
  "sections": {
    "keyPoints": "- 要点1\n- 要点2",
    "openItems": "- 待办1（可选，无则省略此字段）",
    "recallCues": "- [decision] 关键决定（可选，无则省略此字段）"
  },
  "sourceExcerpts": ["user original quote 1", "user original quote 2"]
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

### 4.5 Step 4: Canonicalize Topic（主题归一化）

**目标**：尽量把“概念相同但表述略有差异”的主题收敛到同一个 canonical topic，减少 topic graph 冗余，降低后续检索和汇总成本。

当前实现采用“两段式、低 token”策略：

1. **本地规则归一化**
   - 清洗空白、括号等表面噪音
   - 去掉明显的泛化后缀，如 `推荐`、`总结`、`指南`、`notes`、`summary`
   - 示例：`厦门美食推荐` → `厦门美食`
2. **小候选集复用**
   - 不把全库 topic 喂给 LLM
   - 只在当前 workspace（必要时同 domain）下查 `slug / label / aliases` 候选
   - 若已有 topic 与 compact label 高置信匹配，则直接复用已有 canonical topic
   - 若没有高置信候选，则创建新的 compact topic，并把原始表述写入 `aliases`

```typescript
const canonicalTopic = await canonicalizeTopic({
  topicLabel: extraction.topicLabel,
  topicSlug: extraction.topicSlug,
  workspaceId,
  domain
});

extraction.topicLabel = canonicalTopic.label;
extraction.topicSlug = canonicalTopic.slug;
extraction.topicAliases = canonicalTopic.aliases;
```

**这样做的原因**：

- 比“先把所有已有 topic 发给 LLM 再判断”更快、更省 token
- 可以在写入前就收敛 topic，避免同一天生成多个近义 note
- 原始表述仍保存在 `aliases` 中，不会丢失检索入口

### 4.6 Step 5: Merge（合并去重）

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
    summary: newExtraction.summary, // 摘要以最新提取为准
    keywords: dedup([...existingNote.frontmatter.keywords, ...newExtraction.keywords]),
    entities: mergeEntities(existingNote.frontmatter.entities, newExtraction.entities),
    importance: Math.max(existingNote.frontmatter.importance, newExtraction.importance),
    stability: newExtraction.stability, // 稳定度以最新判定为准
    sourceConversationIds: dedup([...existingNote.frontmatter.sourceConversationIds, ...newExtraction.sourceConversationIds]),
    updatedAt: Date.now()
  };

  // 策略 2：Section 内容合并
  // keyPoints: 去重合并并限制条数，避免长期追加膨胀
  // openItems: 根据新信息关闭已解决的事项，再回到去重后的 bullet 列表
  // recallCues: 归一化 kind 并限制条数
  // sourceExcerpts: 有新摘录时用最新摘录覆盖旧摘录
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
// 用 LLM 判断已有 openItems 是否被新对话解决
const OPEN_ITEMS_MERGE_PROMPT = `
已有的 Open Items：
{existingItems}

新的对话内容涉及的要点：
{newKeyPoints}

判断每个 Open Loop 的现状，输出 JSON：
[
  { "loop": "原文", "status": "resolved" | "still_open" | "updated", "note": "更新说明" }
]
`;
```

**矛盾检测（I-5: Contradiction Detection）**：

更新合并时，如果 note 的 importance > 0.8，会执行轻量级 LLM 矛盾检查：

```typescript
const CONTRADICTION_CHECK_PROMPT = `
以下是一条已有记忆的要点和即将合并的新要点。
请检查新旧信息之间是否存在事实矛盾。

已有要点：
{existingKeyPoints}

新要点：
{newKeyPoints}

如果存在矛盾，输出 JSON 数组：
[
  { "existing": "已有内容原文", "incoming": "新内容原文", "description": "矛盾描述" }
]
如果没有矛盾，输出空数组 []
`;
```

检测到的矛盾现在会进入结构化 `frontmatter.contradictions[]`，并同步渲染为独立的 `Contradictions` 段。旧事实会尽量从 `Key Points` 中移除，避免 canonical facts 与 conflict annotations 混在一起：

```
## Key Points

- 现在决定使用 SQLite + FTS
- 其他正常要点...

## Contradictions

- [decision_change] old: "之前说用 PostgreSQL" -> new: "现在改成 SQLite + FTS" (detected: 2026-04-12)
```

### 4.7 Step 6: Write（落盘 + 建索引）

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
    │   └── upsert canonical 主题节点 + 合并 aliases/keywords + 更新 heat/noteCount + 写入 domain/domainType
    │
    ├── 5e. 更新 memory_edges 表
    │   ├── 5e-1. 使用实际 topic ID 建立 topic→note, topic→topic, note→section 边
    │   └── 5e-2. 实体事实边（entity_fact / entity_attribute / entity_relation）
    │         └── 从 entities.relations 创建带 validFrom/validTo 时序字段的边
    │
    ├── 5f. 更新 memory_keywords / memory_note_keywords 表
    │   └── 关键词/别名规范化 + 关联 + 把 primaryTopicId 绑定到 canonical topic
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
interface MemoryConfig {
  memoryEnabled: boolean;
  autoExtractionEnabled: boolean;
  autoRecallEnabled: boolean;
  extractionProviderId?: string;
  extractionModel?: string;
  minNewMessagesForExtraction: number; // default: 4
  extractionCooldownMinutes: number; // default: 5
  maxTokensPerExtraction: number; // default: 4000
  periodicSaveInterval: number; // default: 20
}
```

Worker 启动时会通过 `resolveExtractionRuntimeConfig()` 把这组持久化配置规范化为运行时参数，例如把 `extractionCooldownMinutes` 转成 `cooldownMs`，并打印 effective config。

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
  { query: '我们决定不用向量检索的原因', expectedSections: ['Key Points'] },

  // 类别 5：待办查询
  { query: '还有哪些事情没做完', expectedSections: ['Open Items'] },

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
 * 当前已实现的只读审计入口：
 * IPC `memory:validateIndex`
 *
 * 设计目标：
 * 1. 以 Markdown 为真值源重建“期望状态”
 * 2. 对比 memory_notes / memory_sections / memory_notes_fts
 * 3. 仅报告漂移，不做写入修复
 */
async function validateMemoryIndex(workspaceId: string, issueLimit = 200): Promise<MemoryIndexAuditReport> {
  const markdownNotes = await scanMarkdownNotes(workspaceId);
  const dbNotes = await MemoryNoteRepo.listByWorkspace(workspaceId, 200, 0);

  const issues: MemoryIndexAuditIssue[] = [];

  for (const note of markdownNotes) {
    compareNoteSnapshot(note, dbNotes, issues);
    compareSections(note, issues);
    compareFtsEntries(note, issues);
  }

  return {
    ok: issues.length === 0,
    workspaceId,
    scannedFiles: markdownNotes.length,
    issueCount: issues.length,
    issueLimit,
    summary: {
      markdownIssues: countIssues(issues, 'markdown'),
      noteIssues: countIssues(issues, 'note'),
      sectionIssues: countIssues(issues, 'section'),
      ftsIssues: countIssues(issues, 'fts')
    },
    issues: issues.slice(0, issueLimit)
  };
}
```

当前实现补充说明：

- 审计扫描 `memory/daily/**/*.md`，排除 `.index.md`。
- 它会从 Markdown 重新解析 frontmatter、sections、section id、`fileChecksum` 与段落关键词命中，再与 DB/FTS 实际状态逐项比对。
- 报告会区分四类问题：`markdownIssues`、`noteIssues`、`sectionIssues`、`ftsIssues`。
- 该入口是只读校验，不会修改 DB，也不会替代 `memory:rebuildIndex`。
- 当前已由 `test/memory-index-audit.spec.ts` 覆盖“完全一致”和“note / FTS 漂移可报出”两条核心路径。

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

| Channel                          | 请求参数                                                                         | 响应                                          | 说明                       |
| -------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------- |
| `memory:search`                  | `{ query, workspaceId, topicFilter?, dateRange?, maxResults?, includeContent?, debug? }` | `MemorySearchResult`                          | 搜索记忆                   |
| `memory:get`                     | `{ noteId, section?, lineRange? }`                                               | `MemoryGetResult \| null`                     | 读取 note / 段落详情       |
| `memory:topics`                  | `{ topicId?, action?, workspaceId?, limit? }`                                    | `MemoryTopicsResult`                          | 浏览主题图谱               |
| `memory:listNotes`               | `{ workspaceId, limit?, offset? }`                                               | `MemoryNoteRow[]`                             | 分页列出 note              |
| `memory:syncStatus`              | 无                                                                               | `{ queue, latestJob }`                        | 查询当前队列与最近任务状态 |
| `memory:triggerSync`             | `{ workspaceId?, date?, conversationIds?, force? }`                              | `{ queued: boolean, jobId?, error? }`         | 手动触发提取               |
| `memory:backfillRecallCues`      | `{ workspaceId?, noteIds?, limit?, providerId?, providerPresetId? }`             | `{ queued: boolean, jobId?, error? }`         | 手动触发 Recall Cues 回填  |
| `memory:rebuildIndex`            | 无                                                                               | `{ success: boolean, notesIndexed?, error? }` | 当前仅重建 FTS 索引        |
| `memory:validateIndex`           | `{ workspaceId?, issueLimit? }`                                                  | `{ ok: boolean, report?, error? }`            | 基于 Markdown 的只读索引审计 |
| `memory:deleteNote`              | `noteId`                                                                         | `{ success: boolean, error? }`                | 删除单条记忆 note          |
| `memory:graphData`               | `{ topicId?, workspaceId?, includeNotes?, maxTopics?, maxEdges? }`               | `{ topics, edges, notes }`                    | 获取图谱数据               |
| `memory:stats`                   | `{ workspaceId? }`                                                               | `{ noteCount, topicCount, edgeCount }`        | 获取基础统计               |
| `memory:cleanupForConversations` | `{ conversationIds }`                                                            | `{ updated, deleted, errors }`                | 按对话清理相关记忆         |
| `memory:clearAll`                | `{ workspaceId? }`                                                               | `{ tablesCleared, filesDeleted, errors }`     | 清空记忆数据               |

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

## 14. 配置 UI（已实现）

配置存储于 `electron/main/handlers/memory/memory-config.ts`，持久化为 `<userData>/data/memory-config.json`。

UI 位于 `src/pages/SettingsPage/components/MemoryManagementSettings.tsx`，提供以下开关：

- **记忆系统总开关** (`memoryEnabled`) — 关闭后自动提取和自动召回均停止
- **自动提取** (`autoExtractionEnabled`) — 控制对话结束后是否自动触发记忆提取
- **自动召回** (`autoRecallEnabled`) — 控制对话前是否自动检索并注入相关记忆

IPC 通道：`memory:getConfig` / `memory:setConfig`。

```typescript
interface MemoryConfig {
  memoryEnabled: boolean;
  autoExtractionEnabled: boolean;
  autoRecallEnabled: boolean;
  extractionProviderId?: string;
  extractionModel?: string;
  minNewMessagesForExtraction: number;
  extractionCooldownMinutes: number;
  maxTokensPerExtraction: number;
  periodicSaveInterval: number;
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
