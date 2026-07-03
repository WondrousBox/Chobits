# 项目跟踪记忆系统风险与增强设计

> 本文承接 `project-tracking-memory-design.md`，聚焦第一版完成后的风险、不足和更深入的增强设计。
> 当前第一版已经打通“识别候选 -> 用户确认 -> 项目关联 -> 事件沉淀 -> 快照注入 -> agent tool -> 项目中心”的闭环；后续目标是让它从“可用”走向“可信、可治理、可长期运行”。

## 1. 总体判断

第一版完成度可以评估为：

| 维度 | 当前等级 | 判断 |
| --- | --- | --- |
| 端到端可用性 | 高 | 用户已经可以真实创建和跟进跨会话项目 |
| 自动化智能程度 | 中 | 识别、匹配、抽取都是规则型第一版，成本低但理解深度有限 |
| 数据完整性 | 中高 | 核心表和来源字段已具备，但缺审计、删除治理和重复项目处理 |
| 用户控制 | 中高 | 有确认、dismiss、归档、解除关联；缺合并/拆分/硬删除/回收站 |
| 提醒闭环 | 中低 | 有提醒链接模型，但还未接 scheduler 真实触发 |
| 可测试性 | 中 | 类型、lint、migration 通过；缺专项自动化测试 |
| 长期运行稳定性 | 中 | worker 异步且低侵入，但缺更细的节流、质量门控和监控指标 |

核心结论：

- 第一版适合进入真实使用和小范围试用。
- 不建议立刻默认开启强自动关联、强 prompt 注入和自动提醒。
- 下一阶段应该优先补“质量门控 + 治理能力 + 测试”，再提高自动化程度。

## 2. 风险分层

### 2.1 P0 风险：错误记忆污染

风险表现：

- 普通问答被误识别为项目。
- 新会话被误绑到错误项目。
- 项目事件把用户没有确认的内容记成协议、决策或 deadline。
- 快照里长期保留已完成或已取消事项。

影响：

- 用户会觉得 agent “自作主张”。
- 项目状态失真，后续 prompt 注入会放大错误。
- 如果错误进入长期记忆或提醒系统，清理成本会变高。

当前已有缓解：

- 自动识别、自动关联、prompt 注入默认关闭。
- 项目候选需要用户确认。
- 事件记录保留 `sourceConversationId` 和 seq 范围。
- snapshot 是派生数据，可重建。

增强设计：

1. 给项目事件增加质量状态：
   - `draft`：系统自动提取但未确认。
   - `accepted`：用户确认或 agent tool 明确写入。
   - `rejected`：用户否定。
   - `superseded`：被后续事件覆盖。

2. 对高风险事件类型要求确认：
   - `agreement_reached`
   - `decision_made`
   - `deadline_changed`
   - `status_changed`
   - `reminder_scheduled`

3. 在项目中心增加“待确认事件”队列：
   - 展示来源对话片段。
   - 支持接受、编辑、拒绝。
   - 拒绝后反馈到 extractor 的降权规则。

4. 对 prompt 注入做可信度过滤：
   - 默认只注入 `accepted` 或用户/agent tool 显式创建的事件归约结果。
   - `draft` 事件最多进入“可能的线索”，不能作为事实陈述。

## 3. Project Delta 抽取增强设计

### 3.1 当前不足

第一版 `project-tracking-extractor.ts` 使用规则识别：

- 优点：快、便宜、可解释、不会额外调用模型。
- 缺点：语义理解弱，复杂表达容易漏掉或误判。

典型失败场景：

- 用户说“那就按 B 方案来，A 先不管”，规则可能只识别成进展，没识别成决策和范围变更。
- 用户上传/讨论会议纪要，多条行动项混在一段文本里，规则只能提取一两个粗粒度事件。
- 用户说“周五之前先把 demo 稳住”，如果没有标准日期，dueAt 可能无法归一化。
- 用户说“这个就不用做了”，需要取消或 supersede 旧任务，规则很难找到被取消对象。

### 3.2 LLM Extractor 方案

新增内部 worker：`project-tracking-extraction-agent`。

输入：

```ts
interface ProjectExtractionJob {
  workspaceId: string;
  project: TrackedProject;
  currentSnapshot: ProjectSnapshot;
  recentEvents: ProjectEvent[];
  conversationId: string;
  messages: ConversationRouteMessage[];
  routeSnapshot?: ConversationRouteSnapshot;
}
```

输出：

```ts
interface ProjectDeltaCandidate {
  events: Array<ProjectEventDraft & {
    quality: 'draft' | 'accepted';
    extractionReason: string;
    evidenceQuotes: string[];
    needsUserConfirmation: boolean;
  }>;
  milestonePatches: ProjectMilestonePatch[];
  reminderSuggestions: ProjectReminderDraft[];
  supersedeHints: Array<{
    oldEventId: string;
    reason: string;
    confidence: number;
  }>;
}
```

质量门控：

- 必须包含来源 conversation 和 seq 范围。
- 事件标题不能是泛化词，如“项目更新”“继续推进”，除非 content 有明确事实。
- 高风险事件必须 `needsUserConfirmation=true`。
- 置信度低于阈值只写入候选，不进入 snapshot。
- 与已有事件高度相似时合并或 supersede，不新增重复事件。

### 3.3 双通道策略

推荐保留规则 extractor，并增加 LLM extractor：

| 通道 | 使用场景 | 行为 |
| --- | --- | --- |
| 规则 extractor | 简单任务、明确 deadline、显式会议/协议词 | 直接写低风险事件或 draft |
| LLM extractor | 长文本、会议纪要、复杂计划变更、多行动项 | 输出候选事件，走质量门控 |

这样可控制成本，同时提升复杂场景质量。

## 4. 项目匹配与自动关联增强

### 4.1 当前不足

第一版 matcher 主要依据：

- 项目名、别名。
- 目标、摘要、标签、领域。
- snapshot 中的 open tasks、upcoming dates、decisions。
- “继续/上次/那个项目”等显式延续词。

风险：

- 多个项目名称相似时可能误绑。
- 用户说“那个项目”但最近活跃项目不止一个时，需要消歧。
- 项目别名不完整，导致漏匹配。

### 4.2 增强方案

新增 `ProjectMatchCandidate`：

```ts
interface ProjectMatchCandidate {
  projectId: string;
  score: number;
  confidenceBand: 'high' | 'medium' | 'low';
  matchedSignals: Array<{
    type: 'name' | 'alias' | 'task' | 'date' | 'stakeholder' | 'route' | 'memory';
    text: string;
    weight: number;
  }>;
  disambiguationReason?: string;
}
```

自动关联规则：

- 单候选且 `score >= 0.85`：可自动关联。
- 多候选且 top 与 second 差值 `< 0.2`：必须询问用户。
- 只有弱关键词命中：只推荐，不写 link。
- 用户明确指定项目名：直接关联，但仍记录来源。

UI 消歧：

```text
这段对话可能属于以下项目：
1. Chobits 项目跟踪记忆系统
2. Chobits 记忆图谱优化

[关联第 1 个] [关联第 2 个] [都不是]
```

## 5. 治理能力设计

### 5.1 为什么治理是 P1

项目跟踪会长期保存结构化状态。只要有自动识别、自动关联、自动抽取，就一定会出现：

- 重复项目。
- 错误关联。
- 错误事件。
- 项目合并后需要迁移历史。
- 项目拆分后需要重新分配事件和会话。

没有治理能力，系统越用越脏。

### 5.2 合并项目

合并动作：

- 选择 source project 和 target project。
- 将 source 的 links/events/milestones/reminder_links 迁移到 target。
- source 标记为 `archived` 或 `merged`。
- target 重算 snapshot。
- 写入 merge audit event。

建议新增状态：

```ts
type ProjectStatus = 'candidate' | 'active' | 'paused' | 'completed' | 'archived' | 'rejected' | 'merged';
```

也可不改 enum，先在 metadata 中记录：

```json
{
  "mergedIntoProjectId": "...",
  "mergedAt": 1780000000000
}
```

### 5.3 拆分项目

拆分动作：

- 创建新 project。
- 用户选择要迁移的 events、links、milestones。
- 迁移后两个项目分别重算 snapshot。
- 保留 split audit event。

UI 要求：

- 按来源会话、事件类型、时间范围筛选。
- 迁移前展示预览。
- 支持撤销一次拆分。

### 5.4 删除与深度清理

删除分三层：

| 操作 | 行为 |
| --- | --- |
| 归档 | 项目不再主动注入 prompt，数据保留 |
| 软删除 | 标记 deleted/archived，隐藏默认视图，可恢复 |
| 硬删除 | 删除 project、events、milestones、links、snapshots、reminder links |

硬删除必须：

- 二次确认。
- 展示将删除的数据量。
- 不删除原始聊天消息，只删除 project 派生数据。
- 删除前可导出 JSON。

## 6. Scheduler 提醒桥接设计

### 6.1 当前状态

已有：

- `project_reminder_links`
- `ProjectReminderDraft`
- `ProjectReminderKind`

缺少：

- 从项目事件生成 reminder suggestion 的服务。
- 用户确认 UI。
- 调用 scheduler 创建任务。
- 提醒触发时携带项目快照。

### 6.2 Reminder Bridge

新增模块：

```text
electron/main/handlers/project-tracking/reminder-bridge.ts
packages/ai/services/project-tracking-reminder.ts
```

生成规则：

- `deadline_changed` 且 dueAt 存在：建议 deadline reminder。
- `meeting_scheduled` 且 eventTime 存在：建议 meeting reminder。
- 项目超过 N 天无更新且仍有 openTasks：建议 stale project check。
- milestone targetAt 临近：建议 milestone check。

用户确认：

- 不自动创建提醒。
- 弹窗或项目中心中展示建议。
- 用户可修改时间、标题、提前量。

触发内容：

```text
项目提醒：Chobits 项目跟踪记忆系统
事项：完成项目中心基础 UI
项目快照：
- 当前重点：...
- 开放事项：...
- 最近变化：...
```

## 7. Prompt 注入安全设计

### 7.1 风险

Prompt 注入会放大项目记忆里的错误。如果错误项目被注入，agent 可能：

- 错误理解用户当前任务。
- 把旧计划当成新约束。
- 在回答中混入无关项目上下文。

### 7.2 增强策略

注入层级：

| 层级 | 条件 | 注入内容 |
| --- | --- | --- |
| L0 | 无关联、低匹配 | 不注入 |
| L1 | suggested match | 注入极短提示，并要求确认 |
| L2 | linked project | 注入 snapshot |
| L3 | explicit current project | 注入 snapshot + 近期事件摘要 |

预算控制：

- 单项目 1200-1800 字符。
- 多项目最多 2 个。
- draft 事件不进入事实区。
- 旧于 90 天且无近期更新的项目不自动注入，除非用户明确提及。

## 8. 测试策略补充

### 8.1 单元测试

必须补：

- `project-tracking-signal`
  - 普通问答不生成项目。
  - 明确“作为项目跟进”生成候选。
  - 有 deadline/meeting/多步骤计划时提高分数。

- `project-tracking-matcher`
  - 项目名命中高分。
  - 多项目近似时不自动关联。
  - 只有弱关键词时不写 link。

- `project-tracking-extractor`
  - 任务、会议、协议、决策、阻塞、风险识别。
  - 同一来源 seq 不重复写事件。
  - 完成事件能从 snapshot openTasks 中移除。

- `reduceProjectSnapshotFromEvents`
  - deadline 进入 upcomingDates。
  - task_done 过滤 openTasks。
  - plan_changed 进入 changes。

### 8.2 集成测试

场景：

1. 模拟会话结束，生成 project candidate。
2. confirm candidate 后创建 project + link。
3. 已关联会话新增“下周开会”，生成 `meeting_scheduled`。
4. snapshot 注入只在已关联或高置信匹配时出现。
5. 归档项目后不再注入。

### 8.3 UI 验证

项目中心：

- 窄窗口下列表和详情不重叠。
- 长项目名、长目标、长事件内容不溢出。
- 添加事件后时间线刷新，snapshot 更新。
- 归档后状态变化清晰。

聊天页：

- 候选浮窗不遮挡输入关键区域。
- 当前项目条长文本 truncate 正常。
- dismiss 后不反复弹同一候选。

## 9. 分阶段实施路线

### Phase A：质量和测试

目标：让第一版可稳定回归。

任务：

- 补 signal/matcher/extractor/reducer 单元测试。
- 补 worker 集成测试。
- 给自动事件增加质量状态或 metadata 标识。
- 项目中心增加待确认事件视图。

### Phase B：治理能力

目标：让用户能修正系统错误。

任务：

- 解除 link UI。
- 删除/软删除项目。
- 合并项目。
- 拆分项目。
- 导出项目 JSON。

### Phase C：提醒桥接

目标：让项目关键时间点真正可提醒。

任务：

- `project-tracking-reminder.ts`
- `reminder-bridge.ts`
- 提醒建议 UI。
- scheduler 创建、撤销、状态回写。
- 提醒触发携带 project snapshot。

### Phase D：LLM 增强

目标：提升复杂项目理解能力。

任务：

- LLM Project Delta extractor。
- 高风险事件确认。
- supersede/cancel 识别。
- meeting notes 多行动项抽取。

## 10. 下一版完成定义

下一版不只是“能用”，而是要满足：

- 自动提取事件有质量状态和用户确认路径。
- 用户能合并、拆分、删除和导出项目。
- scheduler 提醒从建议到触发形成闭环。
- 项目注入有可信度层级，不把低置信事件当事实。
- 有覆盖核心服务、worker 和 UI 的自动化测试。
- 项目中心可以处理错误关联和重复项目，而不是只能查看。
