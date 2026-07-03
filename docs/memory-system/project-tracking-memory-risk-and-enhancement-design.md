# 项目跟踪记忆系统风险与增强设计

> 本文承接 `project-tracking-memory-design.md`，聚焦第一版完成后的风险、不足和更深入的增强设计。
> 当前第一版已经打通“识别候选 -> 用户确认 -> 项目关联 -> 事件沉淀 -> 快照注入 -> agent tool -> 项目中心”的闭环；后续目标是让它从“可用”走向“可信、可治理、可长期运行”。
> 完整目标态、成熟度路线和终局验收见：[项目跟踪记忆系统完整能力蓝图](./project-tracking-complete-capability-blueprint.md)。
> 可执行任务拆解见：[项目跟踪记忆系统下一阶段实施计划](./project-tracking-next-implementation-plan.md)。

## 1. 总体判断

第一版完成度曾经可以评估为：

| 维度 | 当前等级 | 判断 |
| --- | --- | --- |
| 端到端可用性 | 高 | 用户已经可以真实创建和跟进跨会话项目 |
| 自动化智能程度 | 中 | 识别、匹配、抽取都是规则型第一版，成本低但理解深度有限 |
| 数据完整性 | 中高 | 核心表和来源字段已具备，但缺审计、删除治理和重复项目处理 |
| 用户控制 | 中高 | 有确认、dismiss、归档、解除关联；缺合并/拆分/硬删除/回收站 |
| 提醒闭环 | 中低 | 有提醒链接模型，但还未接 scheduler 真实触发 |
| 可测试性 | 中 | 类型、lint、migration 通过；缺专项自动化测试 |
| 长期运行稳定性 | 中 | worker 异步且低侵入，但缺更细的节流、质量门控和监控指标 |
| 隐私与数据生命周期 | 中 | 有归档/解除关联基础能力；缺敏感项目策略、软删除/硬删除、导出恢复和长期记忆引用清理 |
| 观测与审计 | 中低 | 目前可从来源字段追溯部分数据；缺完整 analytics、审计日志和 debug/rebuild 工具 |
| 完成与复盘 | 低 | 项目可归档，但缺 completed 流程、复盘摘要和长期记忆晋升确认 |

核心结论：

- 第一版适合进入真实使用和小范围试用。
- 不建议立刻默认开启强自动关联、强 prompt 注入和自动提醒。
- 下一阶段应该优先补“质量门控 + 治理能力 + 测试”，再提高自动化程度。
- 从完整蓝图看，当前只达到 V1 端到端可用；至少补齐 V2 可信治理和 V3 提醒/智能抽取后，才能称为成熟项目跟踪能力。

### 1.1 2026-07-03 Phase A-G + R 基础落地后的再评估

本轮已补齐质量门控、项目治理 UI、内部 Scheduler 桥接、LLM Delta 可插拔入口与默认关闭的真实调用路径、审计日志、项目级隐私设置、完成复盘、长期记忆晋升控制、治理 impact preview / orphan report、提醒编辑/重同步/完成、晋升前内容预览和基础 extractor 回归测试。当前风险从“缺少治理/提醒/LLM 接线能力”转移为“这些能力需要更强集成测试、观测、撤销和外部生态边界”。

| 维度 | 当前等级 | 判断 |
| --- | --- | --- |
| 端到端可用性 | 高 | V1 闭环保留，项目中心已扩展为 B-G 控制台 |
| 自动化智能程度 | 中 | 规则抽取仍是默认；LLM Delta 接口、prompt、标准化、质量门控和默认关闭的 Pi task 调用路径已落地 |
| 数据完整性 | 中高 | 已有删除、合并、拆分、提醒、完成、隐私、审计字段；impact preview 和 orphan report 已落地基础 |
| 用户控制 | 高 | 项目中心可审核事件、解除关联、导出、软删/恢复/硬删、合并、拆分、完成/重开、更新隐私 |
| 提醒闭环 | 中高 | 内部 scheduler task 创建、编辑、取消、重同步、完成、触发状态回写已落地；仍缺提前量、触发系统通知和外部日历 |
| 可测试性 | 中 | 服务层测试覆盖质量、提醒建议和完成总结；仍缺 repo/worker/UI/scheduler 集成测试 |
| 长期运行稳定性 | 中 | 审计日志和重建入口已落地；仍缺 analytics、错误指标和定期健康检查 |
| 隐私与数据生命周期 | 中高 | 项目级自动化开关、敏感项目、导出、软删、恢复、硬删、Memory Note 引用预览和默认保留策略审计已落地；保留周期和可选同步删除仍待设计 |
| 观测与审计 | 中高 | 审计表和主要治理/提醒/隐私/完成操作日志已落地；缺指标看板和 debug 工具 |
| 完成与复盘 | 中高 | completed/reopen、completion summary、retrospective、Memory Note 晋升控制和晋升前内容预览已落地；缺复盘模板和更细 diff |

更新后的核心结论：

- 现在可以称为“V2/V3 可信运行基础已落地”，但不能称为完整成熟系统。
- 不足不再是“没有治理/提醒/复盘/LLM 接线”，而是“撤销、复杂变更识别、集成测试、外部生态和长期观测还不够深”。
- 后续最应优先补的不是再做新按钮，而是：worker/scheduler/repository/UI 集成测试、LLM 真实样本回归集、撤销一次治理操作、supersede/cancel、长期记忆保留周期和可选删除策略。

### 1.2 R 阶段风险控制顺序

R 阶段基础已经落地，后续不要直接把外部生态或项目智能作为“默认自动化”铺开。建议深化顺序：

1. 先补 worker/scheduler/repository/UI 集成测试，验证 R 阶段能力在真实链路中稳定。
2. 再做撤销一次治理操作和合并/拆分专属 dry-run，进一步降低误治理成本。
3. 再扩充真实 LLM delta 样本回归集，重点覆盖会议纪要、取消事项、supersede/cancel 和模糊日期。
4. 再做长期记忆保留周期、可选同步删除策略和更细晋升 diff。
5. 最后进入 Phase H/I 的项目智能和外部生态连接器。

R 阶段风险边界：

- 不引入外部日历/任务写操作。
- 不默认开启 LLM 抽取。
- 不把 LLM 输出直接写入 accepted。
- 不把长期记忆删除做成默认行为，默认只解除项目引用。

### 1.3 当前未完成项风险摘要

| 未完成项 | 主要风险 | 风险控制规划 |
| --- | --- | --- |
| repo/worker/scheduler/UI 集成测试 | R 阶段能力在真实链路中可能出现状态漂移 | 优先补测试，覆盖治理预检、提醒同步、LLM fallback、硬删除清理 |
| 撤销一次治理操作 | 合并、拆分、误删后的恢复成本高 | 基于 audit/export/undo journal 设计可解释撤销 |
| 合并/拆分专属 dry-run | 只看项目总量，不知道具体迁移冲突 | 展示迁移清单、目标 snapshot 影响和潜在冲突 |
| supersede/cancel 精准识别 | 已取消事项继续作为开放任务影响 prompt 和建议 | 补规则和 LLM 样本，标记旧事件 superseded/cancelled |
| LLM 真实样本回归集 | 开启 LLM 后复杂场景质量不可量化 | 建立会议纪要、多行动项、模糊日期、高风险承诺回归集 |
| 长期记忆保留周期和可选删除 | 项目退出后 Memory Note 保留策略不够细 | 设计保留周期、删除前 diff 和可选同步删除 |
| 观测指标与 debug 面板 | 出错后难以定位候选、关联、抽取还是提醒的问题 | 建立确认率、解除率、接受/拒绝率、取消率和错误指标 |
| Phase H/I | 项目智能或外部写入过早自动化 | 等事实源、测试和权限边界稳定后再进入 |

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

## 9. 长期运行风险补充

### 9.1 观测与审计不足

风险表现：

- 线上使用后，只知道项目状态错了，但不知道是哪一次候选、关联、抽取或注入导致的。
- 自动关联质量无法量化，只能靠用户反馈猜测阈值。
- worker 失败、snapshot 重建失败或 scheduler 同步失败没有统一指标。
- 合并、拆分、删除后缺少操作历史，后续难以解释数据变化。

影响：

- 系统越智能，错误越难复盘。
- 很难判断应该降低自动化阈值还是修 extractor/matcher。
- 用户质疑项目状态时，无法给出可信解释。

增强设计：

- 增加 analytics 事件，覆盖 candidate、link、event、snapshot、prompt injection、reminder、governance。
- 增加 `project_audit_logs` 或等价审计机制，记录用户/agent/system 对项目事实源的修改。
- 增加 debug/rebuild 工具，支持 inspect signal、inspect links、rebuild snapshot、dry-run merge/delete。
- 质量指标至少包括候选确认率、自动关联解除率、事件接受/拒绝率、提醒取消率、snapshot 重建失败率。

### 9.2 隐私与数据生命周期不足

风险表现：

- 用户要求删除项目时，系统只归档，未清理事件、link、reminder 和长期记忆引用。
- 敏感项目被自动注入 prompt 或自动建议提醒。
- 项目导出不完整，无法让用户带走或审查项目数据。
- 软删除、硬删除、恢复、导出之间缺少明确语义。

影响：

- 用户无法真正控制长期结构化数据。
- 敏感项目可能在无意中被带入后续对话。
- 长期记忆和项目系统之间出现悬挂引用。

增强设计：

- 增加项目级隐私设置：敏感标记、是否允许 prompt 注入、自动关联、提醒建议、长期记忆晋升。
- 删除分层：归档、软删除、硬删除。硬删除前必须支持影响预览和可选导出。
- 导出包含 project、events、milestones、links、snapshot、reminder links、audit logs。
- 记录 Memory Note 与 project/event 的引用，删除项目时提示保留、解除引用或一起删除。

### 9.3 项目完成与复盘缺失

风险表现：

- 项目完成后仍保持 active，后续相似对话继续被关联。
- stale reminder 对已完成项目继续出现。
- 完成项目没有复盘摘要，长期记忆只剩零散事件。
- 用户无法区分“暂停”“完成”“归档”“删除”。

影响：

- 项目列表越来越脏，active 状态失真。
- agent 难以在未来回答“这个项目最后怎么样了”。
- 高价值经验没有沉淀，低价值过程噪音反而长期存在。

增强设计：

- 增加 completed 流程：mark completed、reopen、archive completed。
- 完成页展示目标达成、里程碑、遗留事项、关键决策、风险处理和复盘摘要。
- completed 项目默认不自动关联、不生成 stale reminder、不自动注入。
- 复盘摘要由 accepted events、completed milestones 和用户补充生成，用户确认后才可晋升长期记忆。

### 9.4 外部生态协作风险

风险表现：

- scheduler、外部日历、任务系统和文档工具之间状态不同步。
- 外部写操作没有用户确认，造成错误会议或任务。
- 外部系统失败后，本地项目状态误以为同步成功。

影响：

- 项目事实源不再可信。
- 用户需要在多个系统里手动清理错误。
- 外部权限和隐私边界变复杂。

增强设计：

- 先稳定内部 scheduler bridge，再设计外部连接器。
- 每个外部对象必须有 sync state、external id、lastSyncedAt、error 和撤销路径。
- 外部写操作必须确认，外部读入内容只能作为 draft 或 review item。
- 外部连接器需要单独权限设计，不和本地项目跟踪混为一个开关。

## 10. 分阶段实施路线

本节描述阶段方向。更细的任务包、文件落点、schema 影响、验收标准和验证命令见：[下一阶段实施计划](./project-tracking-next-implementation-plan.md)。完整路线图还包括观测运维、隐私数据生命周期、项目完成复盘、长期记忆晋升、项目智能和外部生态协作，详见：[完整能力蓝图](./project-tracking-complete-capability-blueprint.md#14-完整路线图)。

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

### Phase E：观测、审计与运维

目标：让项目状态变化可解释、可衡量、可调试。

任务：

- analytics 事件。
- audit log。
- worker error 指标。
- snapshot rebuild/debug 工具。
- merge/delete dry-run。

### Phase F：隐私与数据生命周期

目标：让用户能控制项目数据如何保存、注入、导出和删除。

任务：

- 敏感项目策略。
- 项目级自动化开关。
- export/soft delete/restore/hard delete。
- 长期记忆引用清理。

### Phase G：完成、复盘与长期记忆晋升

目标：让项目有明确结束和高质量沉淀。

任务：

- completed/reopen 流程。
- completion summary。
- retrospective note。
- Memory Note 晋升确认。

### Phase H：项目智能与组合视图

目标：在可信事实源上提供下一步建议和跨项目概览。

任务：

- next action recommendation。
- project health signals。
- portfolio view。
- risk/blocker rollup。

### Phase I：外部生态协作

目标：在权限清楚的前提下连接外部日历、任务、文档和协作系统。

任务：

- external sync state。
- connector 权限模型。
- 外部读入 draft 化。
- 外部写操作确认和撤销。

## 11. 下一版完成定义

下一版不只是“能用”，而是要满足：

- 自动提取事件有质量状态和用户确认路径。
- 用户能合并、拆分、删除和导出项目。
- scheduler 提醒从建议到触发形成闭环。
- 项目注入有可信度层级，不把低置信事件当事实。
- 有覆盖核心服务、worker 和 UI 的自动化测试。
- 项目中心可以处理错误关联和重复项目，而不是只能查看。

下一版完成仍不是完整系统完成。完整完成还需要覆盖：

- 项目完成与复盘流程。
- 长期记忆晋升和删除引用清理。
- 敏感项目策略和项目级隐私控制。
- analytics、审计日志、debug/rebuild 工具和质量指标。
- 数据生命周期的导出、软删除、硬删除、恢复和回滚策略。

完整验收口径以：[项目跟踪记忆系统完整能力蓝图](./project-tracking-complete-capability-blueprint.md#15-完整完成定义) 为准。
