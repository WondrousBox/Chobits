# 会话线路记忆设计 v0.1

> 本文设计 Chobits 的会话级记忆层：Conversation Route Memory，简称“会话线路”。
> 它不是长期记忆，也不是用户画像，而是为每个对话维护一条可查询、可注入、可晋升的过程时间线。

## 0. 背景

现有记忆系统已经覆盖三类能力：

- 长期记忆：从对话中提取可长期复用的事实、决策、偏好和项目线索，写入 Markdown note 与索引。
- 自动召回：在主模型调用前检索长期记忆，并把相关内容注入 system prompt。
- 用户画像：维护 workspace 级别的 `USER_PERSONA.md`，用于稳定偏好和沟通风格注入。

但这些能力仍然缺少一个更贴近“当前对话过程”的层级。长对话中，用户的目标、话题转折、临时待办、关键纠正、未解决问题和推进方向会一点一点形成。如果只依赖最近几条消息或事后长期记忆，agent 很容易丢失“这场对话正在如何展开”的感觉。

因此需要新增一层会话级线路记忆：

```text
用户逐轮问答
  -> 会话线路事件 timeline
  -> 当前线路快照 snapshot
  -> 下一轮对话前注入短上下文
  -> 必要时晋升为长期记忆或跨会话线路
```

这个设计接近文字游戏中的任务日志、剧情节点和当前状态板：不是把所有对话压缩成一段摘要，而是把会话的推进轨迹结构化保存下来。

## 1. 目标

Conversation Route Memory 要解决以下问题：

- 让 agent 随时知道当前会话的主要目标、正在讨论的主题和下一步推进方向。
- 保留用户目的、话题转折、待办状态、关键线索、用户纠正、约束和决策。
- 允许用户和 agent 随时查看这场会话的线路时间线。
- 在 prompt 中只注入短快照，完整时间线按需查询，避免上下文膨胀。
- 让高价值线路节点未来可以晋升到长期记忆，或在多个相关会话之间共享。

## 2. 非目标

第一版不做这些事情：

- 不替代长期记忆提取流水线。
- 不替代用户画像。
- 不把完整会话线路每轮都塞进 prompt。
- 不强制所有线路节点跨会话共享。
- 不要求每轮都调用大模型做复杂总结。

## 3. 分层关系

```text
┌──────────────────────────────────────────────┐
│ 主对话上下文                                  │
│ profile + instruction + route snapshot + memory│
└──────────────────────────────────────────────┘
                    ▲
                    │ 短上下文注入
                    │
┌──────────────────────────────────────────────┐
│ Conversation Route Memory                     │
│ 当前会话的目标、转折、待办、纠正、关键线索     │
└──────────────────────────────────────────────┘
        ▲                         │
        │ 对话后异步更新           │ 高价值节点晋升
        │                         ▼
┌───────────────────┐       ┌──────────────────┐
│ chat_messages      │       │ Long-term Memory │
│ 原始对话记录        │       │ Markdown notes   │
└───────────────────┘       └──────────────────┘
```

会话线路是“过程记忆”。长期记忆是“沉淀事实”。用户画像是“用户稳定特征”。

三者的边界：

| 层级 | 作用 | 生命周期 | 注入方式 |
| --- | --- | --- | --- |
| Conversation Route | 当前会话的进展地图 | 会话级，未来可关联成跨会话线路 | 注入短 snapshot，完整 timeline 按需查 |
| Long-term Memory | 可长期复用的事实、决策、偏好 | workspace 级长期保存 | 自动召回相关 note |
| User Persona | 用户稳定画像 | workspace 级长期维护 | 注入 top facts |

## 4. 核心概念

### 4.1 Route Event

Route Event 是会话线路的原子节点。它必须可追溯到原始消息范围。

事件类型建议：

```ts
export type ConversationRouteEventType =
  | 'user_goal'
  | 'topic_shift'
  | 'task_added'
  | 'task_progress'
  | 'task_done'
  | 'open_question'
  | 'decision'
  | 'key_clue'
  | 'user_correction'
  | 'constraint'
  | 'preference'
  | 'blocker'
  | 'assumption'
  | 'summary_checkpoint';
```

第一版建议只实现这些类型：

- `user_goal`：用户本轮或当前阶段想达成的目的。
- `topic_shift`：话题发生明显转向。
- `task_added`：新增待办、实现项、检查项。
- `task_done`：已有待办完成。
- `user_correction`：用户纠正 agent 的理解、方向或约束。
- `key_clue`：后续推进需要持续记住的关键线索。

### 4.2 Route Snapshot

Route Snapshot 是当前线路状态的压缩版，用于每轮对话前注入。

它应该短、稳定、面向行动，而不是完整摘要。

```ts
export interface ConversationRouteSnapshot {
  conversationId: string;
  workspaceId?: string;
  version: number;
  updatedAt: number;

  currentGoal?: string;
  currentTopic?: string;
  activeThreads: string[];

  openTasks: ConversationRouteTaskBrief[];
  resolvedTasks: ConversationRouteTaskBrief[];
  keyConstraints: string[];
  userCorrections: string[];
  keyClues: string[];
  decisions: string[];
  blockers: string[];

  nextSuggestedFocus?: string;
  summary: string;
}

export interface ConversationRouteTaskBrief {
  eventId: string;
  title: string;
  status: 'active' | 'in_progress' | 'resolved' | 'blocked' | 'abandoned';
}
```

### 4.3 Route Timeline

Timeline 是按 `seqStart` / `seqEnd` / `createdAt` 排序的事件列表，用于 UI 展示和工具查询。

它必须 append-first，不应该频繁覆盖旧事件。状态变化通过新事件或关系字段表达。

### 4.4 Promotion

Promotion 是把高价值会话线路节点晋升为长期记忆候选。

不是所有线路事件都需要进入长期记忆。只有满足以下条件的事件才应该晋升：

- 稳定用户偏好或长期目标。
- 明确项目决策。
- 未来会继续影响多个会话的约束。
- 用户显式要求记住。
- 重要纠正，且会影响以后 agent 行为。

## 5. 数据模型

### 5.1 conversation_route_events

建议新增 DB 表：

```ts
export interface ConversationRouteEventRow {
  id: string;
  workspaceId?: string | null;
  conversationId: string;

  seqStart: number;
  seqEnd: number;
  createdAt: number;
  updatedAt: number;

  type: ConversationRouteEventType;
  title: string;
  content: string;
  evidence?: string | null;

  status: 'active' | 'resolved' | 'superseded' | 'abandoned';
  importance: number;
  confidence: number;

  tags?: string | null;
  relatedEventIds?: string | null;
  resolvesEventIds?: string | null;
  supersedesEventIds?: string | null;

  promotedMemoryNoteId?: string | null;
  metadata?: string | null;
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| `seqStart` / `seqEnd` | 对应原始消息范围，便于回溯 |
| `type` | 线路事件类型 |
| `status` | 当前节点是否仍有效 |
| `importance` | 是否值得注入、展示或晋升 |
| `confidence` | LLM 或规则判断置信度 |
| `resolvesEventIds` | 本事件解决了哪些旧事件 |
| `supersedesEventIds` | 本事件取代了哪些旧事件 |
| `promotedMemoryNoteId` | 晋升到长期记忆后的 note id |

### 5.2 conversation_route_snapshots

建议新增 DB 表：

```ts
export interface ConversationRouteSnapshotRow {
  conversationId: string;
  workspaceId?: string | null;
  version: number;
  updatedAt: number;

  summary: string;
  currentGoal?: string | null;
  currentTopic?: string | null;
  nextSuggestedFocus?: string | null;

  activeThreads: string;
  openTasks: string;
  resolvedTasks: string;
  keyConstraints: string;
  userCorrections: string;
  keyClues: string;
  decisions: string;
  blockers: string;

  metadata?: string | null;
}
```

数组字段以 JSON string 存储，方便 SQLite 初期落地。后续需要全文搜索时，可为 `summary`、`currentGoal`、`currentTopic` 和事件 `content` 建 FTS。

### 5.3 conversation_route_links

为未来跨会话共享预留关系表：

```ts
export interface ConversationRouteLinkRow {
  id: string;
  workspaceId: string;
  sourceConversationId: string;
  targetConversationId?: string | null;
  topicId?: string | null;
  memoryNoteId?: string | null;

  relationType:
    | 'same_user_goal'
    | 'same_project'
    | 'follow_up'
    | 'continues_topic'
    | 'references_memory';

  confidence: number;
  createdAt: number;
}
```

第一版可以不实现这张表，但文档先保留设计位置。

## 6. 更新流程

### 6.1 触发时机

主路径使用现有 `AppEvent.AGENT_LOOP_COMPLETE`：

```text
assistant 最终回复完成
  -> emit AGENT_LOOP_COMPLETE
  -> conversation-route worker 异步执行
  -> 读取本轮新增 user/assistant messages
  -> 抽取 route events
  -> 合并更新 route snapshot
```

兼容路径可监听 `SPRITE_AI_COMPLETE`，但需要节流，避免和主路径重复。

### 6.2 增量范围

每个 conversation 维护 route watermark：

- `lastProcessedSeq`：已经分析到的最后一条消息。
- 每次只处理 `seq > lastProcessedSeq` 的新消息。
- 如果本轮消息太少，可以仅用规则更新，或延迟到下一轮。

### 6.3 更新策略

更新分两步：

```text
Step 1: Extract route delta
  输入：最近新消息 + 当前 snapshot
  输出：新增事件、状态变更、应解决/取代的旧事件

Step 2: Reduce snapshot
  输入：旧 snapshot + route delta + 仍活跃事件
  输出：新 snapshot
```

`conversation_route_events` 是 timeline 的事实源；`conversation_route_snapshots` 是可重建的派生缓存。任何入口修改事件状态、标题、内容、重要性或晋升标记后，都必须触发 snapshot recompute，避免 UI 时间线、Pi tool 查询结果和下一轮 prompt 注入读到不同状态。

状态归约规则：

- 只有 `status = active` 的 task/progress/blocker 类事件进入 `openTasks`。
- `status = resolved` 或 `type = task_done` 的任务进入 `resolvedTasks`。
- `abandoned`、`superseded` 不进入活跃待办，但事件仍保留在 timeline 中用于回溯。
- `lastProcessedSeq` 不因手动编辑回退；重算 snapshot 只更新派生字段和版本。

第一版可以使用一个轻量 LLM 调用完成两步。后续可拆成规则 + LLM 混合：

- 明确词触发的 task/user correction 用规则先提取。
- 复杂话题转折和 next focus 用 LLM 判断。

## 7. LLM 输出协议

### 7.1 Route Delta Prompt 输出

建议 LLM 只输出 JSON：

```ts
export interface ConversationRouteDelta {
  events: Array<{
    type: ConversationRouteEventType;
    title: string;
    content: string;
    seqStart: number;
    seqEnd: number;
    status?: 'active' | 'resolved' | 'superseded' | 'abandoned';
    importance: number;
    confidence: number;
    tags?: string[];
    resolvesEventIds?: string[];
    supersedesEventIds?: string[];
  }>;

  snapshotPatch: Partial<{
    currentGoal: string;
    currentTopic: string;
    activeThreads: string[];
    keyConstraints: string[];
    userCorrections: string[];
    keyClues: string[];
    decisions: string[];
    blockers: string[];
    nextSuggestedFocus: string;
    summary: string;
  }>;
}
```

### 7.2 Prompt 约束

LLM 判断必须遵守：

- 不记录闲聊、礼貌语、重复确认。
- 用户纠正优先级高于 assistant 自己的总结。
- 当前对话事实优先于长期记忆和旧 snapshot。
- 不把 assistant 的推测当成用户事实。
- 每个事件必须指向 seq 范围。
- 对不确定内容降低 `confidence`，不要强行写成决定。

## 8. Prompt 注入

### 8.1 SystemPromptEnricher

新增 `conversation-route` enricher。

注入条件：

- `request.persist !== false`
- 存在 `conversationId`
- 非内部 agent，例如跳过 `memory-extraction`、`memory-auto-recall`、`user-persona-check`、`user-persona-update`、`title-generation`
- snapshot 存在且非空

### 8.2 注入格式

只注入短 snapshot：

```xml
<conversation_route>
当前目标：为 Chobits 设计会话级记忆系统
当前话题：Conversation Route Memory
活跃线路：
- 设计会话线路 timeline 与 snapshot
- 让线路可被 UI 和 agent 随时查询
待办：
- 完成设计文档
- 后续拆分 DB、worker、enricher、tool 和 UI
用户纠正：
- 用户希望它不是普通摘要，而是类似文字游戏的逐步线路
关键线索：
- 关注用户目的、话题转折、待办实现、关键线索、用户纠正
下一步建议：先落文档，再按最小闭环实现
</conversation_route>
```

### 8.3 token 预算

第一版建议：

- 默认最大 1200 字符。
- `openTasks` 最多 6 条。
- `userCorrections` 最多 5 条。
- `keyClues` 最多 8 条。
- `decisions` 最多 5 条。
- 超出时按 importance、recency、status 裁剪。

## 9. 工具与 IPC

### 9.1 Agent Tool

建议新增 Pi tool：`conversationRouteTool`。

能力：

```ts
type ConversationRouteToolAction =
  | 'getSnapshot'
  | 'listEvents'
  | 'searchEvents'
  | 'addEvent'
  | 'resolveEvent'
  | 'promoteEvent';
```

用途：

- agent 可主动查看完整时间线。
- agent 可在用户明确说“记住这条线路”时手动追加事件。
- agent 可把完成的待办标记为 resolved。

### 9.2 Renderer IPC

建议新增 IPC：

```ts
conversationRoute:getSnapshot(conversationId)
conversationRoute:listEvents({ conversationId, type?, status?, limit?, offset? })
conversationRoute:searchEvents({ conversationId?, workspaceId?, query, limit? })
conversationRoute:rebuild(conversationId)
conversationRoute:updateEvent(eventId, patch)
conversationRoute:deleteEvent(eventId)
conversationRoute:promoteEvent(eventId)
```

`updateEvent`、`deleteEvent` 和 `promoteEvent` 成功后应重算对应 conversation 的 snapshot，并返回或允许前端重新读取最新 snapshot。否则“标记完成”一类操作只会改变 timeline，不会改变下一轮注入给模型的待办状态。

## 10. UI 设计建议

第一版 UI 可以放在聊天页右侧或顶部弹层，名称为“会话线路”。

需要展示：

- 当前目标。
- 当前话题。
- 活跃待办。
- 时间线事件。
- 用户纠正。
- 关键线索。
- 已完成项。

交互能力：

- 按事件类型筛选。
- 跳转到原始消息 seq。
- 手动标记任务完成或废弃。
- 手动将事件晋升到长期记忆。

UI 执行状态变更后需要刷新 snapshot 区块和 timeline 区块，确保“活跃待办”“已完成项”和事件 badge 同步。

UI 不应变成另一个记事本。它应该是当前会话的路线图。

## 11. 与长期记忆的晋升关系

会话线路默认只属于当前 conversation。晋升规则建议：

| 事件类型 | 默认是否晋升 | 说明 |
| --- | --- | --- |
| `user_goal` | 条件晋升 | 长期目标或跨会话项目目标才晋升 |
| `topic_shift` | 否 | 通常只用于当前会话导航 |
| `task_added` | 条件晋升 | 长期待办或项目待办可晋升 |
| `task_done` | 条件晋升 | 重要完成结论可晋升 |
| `decision` | 是 | 项目决策通常有长期价值 |
| `user_correction` | 条件晋升 | 影响未来行为的纠正可晋升 |
| `constraint` | 是 | 稳定约束应进入长期记忆 |
| `key_clue` | 条件晋升 | 跨会话有用才晋升 |

晋升方式：

```text
route event
  -> promotion candidate
  -> memory-save/writeMemory
  -> promotedMemoryNoteId 回写 route event
```

第一版不建议自动全部晋升。可以先做手动晋升和高置信度自动候选。

## 12. 跨会话共享设计

未来可以把多个会话串成更大的线路：

```text
Conversation A: 需求提出
Conversation B: 方案细化
Conversation C: 实现与调试
Conversation D: 复盘与长期沉淀
```

共享依据：

- 同一 workspace。
- 命中相同 project/topic。
- 用户显式说“继续上次那个话题”。
- 自动召回命中某个 route event 晋升后的 memory note。

跨会话共享不应直接把旧 timeline 全部注入。更好的方式是：

- 当前会话注入自己的 route snapshot。
- 自动召回注入相关长期记忆。
- agent 需要时通过 `conversationRouteTool.searchEvents()` 查询历史线路。

## 13. 与现有模块集成点

建议新增模块：

```text
packages/ai/services/conversation-route-types.ts
packages/ai/services/conversation-route-service.ts
packages/ai/services/conversation-route-extractor.ts
electron/main/handlers/conversation-route/ipc-main.ts
electron/main/handlers/conversation-route/enricher.ts
electron/main/handlers/conversation-route/worker.ts
packages/ai/runtime/pi/tools/conversation-route.ts
```

集成点：

- `ChatService`：无需直接改主链路，只依赖 `AGENT_LOOP_COMPLETE`。
- `SystemPromptEnricher`：注册 `conversation-route` 注入 snapshot。
- `Pi tools`：注册 `conversationRouteTool`。
- `Memory Extraction`：晋升时复用 `writeMemory()` 或 memory save tool 的写入逻辑。
- `Analytics`：记录 `conversation_route_extract`、`conversation_route_inject`、`conversation_route_promote`。

## 14. 第一版最小闭环

MVP 范围：

1. DB 表：`conversation_route_events`、`conversation_route_snapshots`。
2. Worker：监听 `AGENT_LOOP_COMPLETE`，增量分析最近消息。
3. Extractor：用轻量 LLM 输出 route delta。
4. Snapshot reducer：把事件合并成短 snapshot。
5. Enricher：每轮主对话前注入 snapshot。
6. IPC：读取 snapshot 和 events，并在事件状态变更后重算 snapshot。
7. UI：聊天页可查看会话线路，可标记事件完成并刷新快照。

暂不做：

- 跨会话 route links。
- 自动晋升长期记忆。
- 复杂事件图谱。
- 完整 FTS 搜索。

## 15. 后续阶段

### Phase 1：会话内线路

- 完成数据表、worker、extractor、snapshot 注入。
- UI 可查看当前会话线路。
- 支持任务完成、用户纠正、关键线索。

### Phase 2：工具化与可编辑

- 增加 `conversationRouteTool`。
- UI 支持手动修正事件。
- 支持事件状态变更和跳转原始消息。

### Phase 3：晋升长期记忆

- 重要 route event 生成 promotion candidate。
- 手动或半自动晋升为长期记忆 note。
- route event 回写 `promotedMemoryNoteId`。

### Phase 4：跨会话线路

- 引入 `conversation_route_links`。
- 支持 project/topic 级线路聚合。
- 新会话可按需查询历史线路。

## 16. 风险与约束

- 过度记录会制造噪音：需要严格跳过低价值事件。
- LLM 误判用户意图：所有事件必须有 seq 证据，且允许用户编辑。
- prompt 膨胀：只注入 snapshot，不注入 timeline。
- 与长期记忆重复：晋升必须有门槛。
- 多 worker 并发：同一 conversation 需要队列或 coalescing。
- 派生状态不一致：手动编辑事件后必须重算 snapshot，尤其是 task resolved/abandoned 不能继续出现在 openTasks。
- 隐私与可控性：用户应能清空、删除或禁用会话线路。

## 17. 验收标准

第一版完成后，应满足：

- 长对话中，agent 能在下一轮看到当前目标、待办和用户纠正。
- 用户能打开 UI 查看当前会话线路。
- 每条线路事件可回溯到原始消息范围。
- 内部 agent 的任务不会污染用户会话线路。
- prompt 注入有明确 token 上限。
- 用户或 agent 标记事件完成后，下一次读取 snapshot 和 prompt 注入不再把该事件展示为活跃待办。
- 删除会话时，对应 route events 和 snapshot 可被清理。

## 18. 示例

用户说：

```text
我认为还需要一个会话级的记忆，也就是围绕着用户一直讨论的主题和用户问题的时间线记忆...
```

可能生成事件：

```json
{
  "type": "user_goal",
  "title": "设计会话级记忆层",
  "content": "用户希望为每个会话维护一条围绕主题、问题和时间线推进的会话线路。",
  "status": "active",
  "importance": 0.9,
  "confidence": 0.92,
  "tags": ["memory-system", "conversation-route"]
}
```

```json
{
  "type": "key_clue",
  "title": "会话线路应类似文字游戏任务日志",
  "content": "用户希望会话线路基于逐轮问答逐步建立，包含用户目的、话题转折、待办实现、关键线索和用户纠正，并且进入对话后可随时查询。",
  "status": "active",
  "importance": 0.88,
  "confidence": 0.9,
  "tags": ["route-snapshot", "timeline"]
}
```

对应 snapshot：

```text
当前目标：为 Chobits 设计会话级记忆系统。
当前话题：Conversation Route Memory。
关键线索：它应像文字游戏任务日志，记录逐轮问答形成的线路。
待办：先完成设计文档，再拆分实现。
下一步建议：落地 DB、worker、enricher、tool 和 UI 的 MVP。
```
