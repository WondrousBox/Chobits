# 项目跟踪记忆系统规划 v0.1

> 本文设计 Chobits 的项目级记忆层：Project Tracking Memory，简称“项目跟踪”。
> 它位于长期记忆、会话线路记忆和日程提醒之间，负责识别用户正在推进的项目，并跨会话持续维护项目目标、关键时间点、协议、计划变更、里程碑与完成状态。

## 当前状态

- 当前文档是项目跟踪系统的产品、架构与实施总计划，也是本轮实现状态的同步记录。
- 已完成第一版端到端闭环：类型、配置、schema/migration、repository、IPC/preload、设置开关、项目信号识别、确认浮窗、当前会话项目条、项目事件/里程碑/提醒链接数据模型、项目快照归约、prompt 注入、跨会话匹配、已关联会话事件抽取、`projectTrackingTool`、项目中心基础 UI。
- 当前第一版默认保持低侵入：`enabled` 默认开启，但自动识别、自动关联、prompt 注入、提醒建议仍由设置开关控制，避免未经用户确认就改变对话行为。
- 后续增强聚焦治理和外部系统桥接：重复项目合并/拆分、删除与深度清理、scheduler 真实提醒创建、基于 LLM 的高质量项目 delta 提取、专项自动化测试。
- 设计会复用现有 `memory-system` 的长期记忆、会话线路、用户画像、自动召回与调度能力。
- 未来如涉及数据库表字段变更，必须先更新 schema 定义，再执行 `db:generate`，保持与项目数据库约定一致。
- 深入风险和后续增强方案见：[项目跟踪记忆系统风险与增强设计](./project-tracking-memory-risk-and-enhancement-design.md)。

---

## 0. 整体完成情况评估

当前状态可以定义为“第一版端到端闭环已完成，但尚未达到成熟项目管理系统”。系统已经具备真实创建、关联、查询和持续跟进跨会话项目的能力；剩余工作主要集中在抽取质量、治理能力、提醒桥接和自动化验证。

| 模块 | 完成情况 | 说明 |
| --- | --- | --- |
| 设计文档 | 已完成 | 主设计文档已覆盖产品目标、核心概念、数据模型、流程、实施计划和第一版完成边界 |
| 数据模型 | 已完成 | 已包含项目、候选、关联、快照、事件、里程碑、提醒链接 |
| 数据迁移 | 已完成 | schema 先行，已生成 migration，`drizzle-kit generate` 确认无新增差异 |
| 候选识别 | 第一版完成 | 使用规则识别项目、任务、时间、会议、协议、持续跟进信号 |
| 用户确认浮窗 | 已完成 | 支持编辑项目名/目标、创建、dismiss |
| 当前会话关联 | 已完成 | 确认候选后自动写入 conversation link，并在聊天页展示当前项目条 |
| 项目持续跟进 | 第一版完成 | 已关联会话结束后可增量抽取项目事件、里程碑并重算快照 |
| 跨会话匹配 | 第一版完成 | 支持项目名、别名、目标、快照事项、显式延续词匹配，高置信可自动关联 |
| Prompt 注入 | 已完成 | 按配置注入已关联或高置信匹配项目的压缩快照 |
| Agent Tool | 已完成 | `projectTrackingTool` 可查询项目/快照/时间线/里程碑，写事件，关联/解除会话，归档和重建快照 |
| 项目中心 UI | 第一版完成 | 可查看项目列表、详情、快照、时间线、里程碑、关联对象，支持编辑、手动事件、归档 |
| 提醒能力 | 部分完成 | 已有 reminder link 数据模型；尚未真正调用 scheduler 创建可触发提醒 |
| 治理能力 | 部分完成 | 已支持归档和解除会话关联；删除、合并、拆分、深度清理仍待设计实现 |
| 测试验证 | 基础验证完成 | `drizzle-kit generate`、`tsc --noEmit`、目标文件 lint 已通过；专项单元/集成/UI 自动化测试待补 |

### 0.1 可用闭环

第一版已经可以支持这些真实使用路径：

- 用户在聊天中表达持续性项目，系统异步生成项目候选。
- 用户通过确认浮窗创建项目，并把当前会话关联到项目。
- 当前会话显示“正在跟进”的项目状态。
- 后续已关联会话结束后，系统抽取任务、会议、协议、决策、计划变更、阻塞、风险等项目事件。
- 项目快照持续归约开放事项、近期进展、关键时间点、决策、协议、阻塞、风险和变更。
- Agent 可通过 `projectTrackingTool` 查询或补写项目状态。
- 用户可在项目中心查看和编辑项目，并回看时间线与来源关联。

### 0.2 当前不足总览

| 不足 | 影响 | 当前策略 | 后续方向 |
| --- | --- | --- | --- |
| 规则型事件抽取不够聪明 | 复杂会议纪要、隐式协议、模糊计划变更可能漏提或误提 | 低成本、可控、可回滚 | 引入 LLM Project Delta extractor 和质量门控 |
| 自动开关默认关闭 | 用户不打开配置时，只能使用手动或显式路径 | 避免误打扰、误关联 | 通过设置引导和低风险提示逐步放开 |
| 治理能力较弱 | 重复项目、误关联、误拆分后清理成本高 | 先支持归档和解除关联 | 设计合并、拆分、硬删除、回收站和审计日志 |
| 提醒未真正接 scheduler | deadline/meeting 还不会变成真实触发提醒 | 先保留数据模型和 suggestion | 增加 reminder bridge、用户确认和撤销 |
| 缺专项测试 | 复杂项目记忆链路回归风险较高 | 已做类型、lint、migration 验证 | 增加 signal/matcher/reducer/repo/worker/UI 测试 |
| 项目中心仍是基础版 | 能管理核心状态，但缺对比、筛选、批量操作 | 信息密度优先 | 增加筛选、来源跳转、治理操作和提醒视图 |

## 1. 背景

用户和 AI 的多次对话常常不是孤立问题，而是在共同推进一个更大的项目。例如：

- 准备一次产品发布。
- 设计并实现某个功能模块。
- 跟进一场合作、会议、合同或研究计划。
- 规划学习、写作、旅行、装修、求职等长期任务。

这些项目通常不会在一次会话里完成。用户可能今天先讨论目标，明天补充时间点，过几天确认协议，又在另一个聊天窗口里问“之前那个项目下一步该干什么”。如果 agent 只依赖当前会话上下文或普通长期记忆，就很难持续理解：

- 用户到底在推进哪个项目。
- 当前项目有哪些关键节点。
- 哪些节点已经完成，哪些变更过。
- 哪些承诺、协议、会议、提醒需要后续跟进。
- 新的一段对话是否应该关联到已有项目。

因此需要一个“项目跟踪能力”：让系统能从对话中识别项目线索，在获得用户确认后创建项目，并在后续对话中自动或半自动关联到该项目，持续维护项目状态。

## 2. 目标

项目跟踪记忆需要解决这些问题：

- 从自然对话中识别“用户正在推进一个项目”的信号。
- 在高置信但尚未确认时，向用户发出轻量确认浮窗，询问是否创建项目。
- 创建项目后，跨会话关联相关对话、记忆、会话线路事件和日程提醒。
- 结构化沉淀项目目标、范围、时间节点、会议、协议、计划、变更、里程碑、风险、阻塞和完成情况。
- 在用户后续提问时，判断该问题是否属于某个项目，并把项目摘要注入上下文。
- 支持项目状态面板、时间线、待办、提醒、推荐下一步和复盘。
- 允许用户编辑、合并、拆分、归档或禁用项目跟踪。

## 3. 非目标

第一版不做这些事情：

- 不自动把所有长期目标都创建为项目，必须有足够强的项目信号或用户确认。
- 不替代现有长期记忆；项目跟踪只维护项目状态，长期事实仍沉淀到 Memory Note。
- 不替代会话线路；会话线路关注单个 conversation 的推进轨迹，项目跟踪关注跨会话项目状态。
- 不强制把完整项目历史每轮都注入 prompt。
- 不直接替代日历或任务管理工具；提醒能力先通过 Chobits 内部 scheduler 抽象接入。

## 4. 分层关系

```text
用户多轮对话
  -> Conversation Route Memory
     单会话目标、待办、纠正、关键线索
  -> Project Tracking Memory
     跨会话项目目标、节点、协议、计划、进度
  -> Long-term Memory
     可长期复用的事实、决策、偏好
  -> Scheduler / Reminder
     时间触发、会议提醒、跟进提醒
```

更完整的关系：

```text
┌──────────────────────────────────────────────┐
│ Chat / Agent Runtime                          │
│ 当前用户请求、工具调用、模型回复               │
└───────────────────────┬──────────────────────┘
                        │
                        ▼
┌──────────────────────────────────────────────┐
│ Conversation Route Memory                     │
│ 单会话时间线、目标、待办、用户纠正             │
└───────────────────────┬──────────────────────┘
                        │ 项目信号候选
                        ▼
┌──────────────────────────────────────────────┐
│ Project Tracking Memory                       │
│ 项目实体、关键节点、跨会话关联、项目快照       │
└──────────────┬───────────────────┬───────────┘
               │                   │
               ▼                   ▼
┌──────────────────────┐   ┌──────────────────────┐
│ Long-term Memory      │   │ Scheduler / Reminder  │
│ 决策、协议、关键事实   │   │ 时间点、提醒、跟进     │
└──────────────────────┘   └──────────────────────┘
```

边界建议：

| 层级 | 关注点 | 生命周期 | 典型内容 |
| --- | --- | --- | --- |
| Conversation Route | 当前会话如何推进 | 单会话 | 当前目标、待办、纠正、线索 |
| Project Tracking | 某个项目如何推进 | 跨会话 | 项目目标、时间节点、协议、进度 |
| Long-term Memory | 稳定事实与长期决策 | 长期 | 用户偏好、项目决策、关键事实 |
| Scheduler | 到时触发的动作 | 时间驱动 | 会议提醒、交付提醒、跟进提醒 |

## 5. 核心体验

### 5.1 项目识别

当用户连续或明确讨论以下内容时，系统应生成项目候选：

- 有持续目标：例如“我要做一个功能”“我们要推进一个合作”“帮我跟进这个计划”。
- 有明确产出：文档、产品、协议、会议、发布、作品、研究、合同等。
- 有多个阶段：调研、设计、开发、评审、上线、复盘。
- 有关键时间点：截止日期、会议日期、交付日期、回访日期。
- 有外部参与者：客户、合作方、团队成员、老师、面试官等。
- 有持续待办：下一步、阻塞、风险、待确认事项。
- 用户反复在不同会话中提到同一目标或同一实体。

系统不要因为一次普通问答就创建项目。例如“帮我解释一个概念”通常不是项目；“接下来一个月帮我做考研英语复习计划”更像项目。

### 5.2 创建确认浮窗

当系统检测到高置信项目候选时，向用户展示确认浮窗：

```text
检测到你可能正在推进一个项目

项目名：Chobits 项目跟踪记忆系统
目标：设计并实现跨会话的项目跟踪能力
已识别信息：
- 需要识别项目并让用户确认创建
- 需要跨会话关联相关对话
- 需要总结关键时间节点、计划、变更、里程碑和完成情况

[创建项目] [稍后提醒我] [不是项目]
```

交互原则：

- 浮窗不打断当前回复主流程，可以在回复后轻量出现。
- 默认只在置信度高、价值高或用户明确表达持续跟进时出现。
- 用户选择“不是项目”后，短期内降低同类候选的提示频率。
- 用户可以修改项目名、目标、所属领域和提醒偏好后再创建。
- 如果用户直接说“把这个作为项目跟进”，可以跳过浮窗或展示更短确认。

### 5.3 项目关联

项目创建后，后续会话需要判断是否关联：

- 用户显式引用：例如“继续上次那个记忆项目”“这个项目下一步呢”。
- 语义命中项目名、别名、实体、关键目标。
- 命中项目未完成待办、时间节点或近期会议。
- 当前会话线路和某个项目高度相似。
- 自动召回命中该项目相关 Memory Note 或 Project Event。

关联分三种级别：

| 级别 | 说明 | 行为 |
| --- | --- | --- |
| `explicit` | 用户明确说当前对话属于项目 | 直接关联 |
| `suggested` | 系统高置信判断相关 | 可展示轻量确认 |
| `weak` | 有弱相关信号 | 只用于候选排序，不写强关联 |

当存在多个候选项目时，应避免自动误绑，优先询问用户。

### 5.4 项目快照注入

每轮对话前只注入短快照，而不是完整项目历史：

```xml
<active_project>
项目：Chobits 项目跟踪记忆系统
状态：planning
目标：设计跨会话项目跟踪能力，覆盖识别、确认、时间线、提醒和进度维护。
当前重点：先完成规划文档，再拆分数据模型、worker、prompt 注入和 UI。
关键节点：
- 2026-07-03：完成系统规划文档
开放事项：
- 定义项目候选识别器和确认浮窗
- 设计项目事件、里程碑和提醒模型
最近变化：
- 用户明确提出需要“项目跟踪能力”作为 agent 记忆设计的一部分
</active_project>
```

注入原则：

- 当前会话明确关联一个项目时注入该项目。
- 多项目相关时最多注入 2 个最相关项目的压缩摘要。
- 默认字符预算建议 1200-1800 字符。
- 完整项目时间线通过工具按需查询。

## 6. 核心概念

### 6.1 Project

Project 是可长期跟踪的目标容器。

```ts
export type ProjectStatus =
  | 'candidate'
  | 'active'
  | 'paused'
  | 'completed'
  | 'archived'
  | 'rejected';

export interface TrackedProject {
  id: string;
  workspaceId: string;

  name: string;
  aliases: string[];
  summary: string;
  goal: string;
  scope?: string;
  status: ProjectStatus;

  ownerUserId?: string;
  stakeholders: ProjectStakeholder[];
  domains: string[];
  tags: string[];

  startedAt?: number;
  targetEndAt?: number;
  completedAt?: number;

  confidence: number;
  createdBy: 'user' | 'agent_suggestion' | 'import';
  createdAt: number;
  updatedAt: number;
  archivedAt?: number;
}
```

### 6.2 Project Candidate

Project Candidate 是尚未被用户确认的项目候选。

```ts
export interface ProjectCandidate {
  id: string;
  workspaceId: string;
  conversationId: string;
  seqStart: number;
  seqEnd: number;

  proposedName: string;
  proposedGoal: string;
  evidenceSummary: string;
  evidenceMessageIds: string[];

  signalScore: number;
  reasons: ProjectSignalReason[];
  suggestedMilestones: ProjectMilestoneDraft[];
  suggestedReminders: ProjectReminderDraft[];

  status: 'pending' | 'confirmed' | 'dismissed' | 'expired' | 'merged';
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
}
```

候选应有过期机制，避免历史旧提示一直干扰用户。

### 6.3 Project Event

Project Event 是项目时间线的原子节点。

```ts
export type ProjectEventType =
  | 'goal_defined'
  | 'scope_defined'
  | 'task_added'
  | 'task_progress'
  | 'task_done'
  | 'milestone_added'
  | 'milestone_reached'
  | 'deadline_changed'
  | 'meeting_scheduled'
  | 'meeting_done'
  | 'agreement_reached'
  | 'decision_made'
  | 'plan_changed'
  | 'blocker_found'
  | 'blocker_resolved'
  | 'risk_identified'
  | 'reminder_scheduled'
  | 'status_changed'
  | 'summary_checkpoint';
```

事件必须可追溯到来源：

```ts
export interface ProjectEvent {
  id: string;
  projectId: string;
  workspaceId: string;

  type: ProjectEventType;
  title: string;
  content: string;
  status: 'active' | 'resolved' | 'superseded' | 'cancelled';
  importance: number;
  confidence: number;

  eventTime?: number;
  dueAt?: number;
  sourceConversationId?: string;
  sourceMessageRange?: { seqStart: number; seqEnd: number };
  sourceRouteEventIds?: string[];
  sourceMemoryNoteIds?: string[];

  relatedEventIds?: string[];
  supersedesEventIds?: string[];
  metadata?: Record<string, unknown>;

  createdAt: number;
  updatedAt: number;
}
```

### 6.4 Project Milestone

Milestone 是比事件更稳定的阶段性目标。

```ts
export interface ProjectMilestone {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: 'planned' | 'in_progress' | 'done' | 'missed' | 'cancelled';
  targetAt?: number;
  completedAt?: number;
  evidenceEventIds: string[];
  createdAt: number;
  updatedAt: number;
}
```

### 6.5 Project Snapshot

Snapshot 是项目当前状态的压缩缓存，用于 UI 和 prompt 注入。

```ts
export interface ProjectSnapshot {
  projectId: string;
  version: number;
  updatedAt: number;

  status: ProjectStatus;
  summary: string;
  goal: string;
  currentFocus?: string;
  nextSuggestedAction?: string;

  upcomingDates: ProjectDateBrief[];
  openTasks: ProjectTaskBrief[];
  recentProgress: string[];
  decisions: string[];
  agreements: string[];
  blockers: string[];
  risks: string[];
  changes: string[];
  completedMilestones: string[];
}
```

Snapshot 是派生数据。项目事件、里程碑、提醒、关联关系变更后，应重算 snapshot。

### 6.6 辅助类型

```ts
export interface ProjectStakeholder {
  id?: string;
  name: string;
  role?: string;
  relation?: 'owner' | 'collaborator' | 'client' | 'reviewer' | 'external' | 'other';
  notes?: string;
}

export type ProjectSignalReason =
  | 'explicit_project_tracking_request'
  | 'recurring_goal'
  | 'multi_step_plan'
  | 'deadline_or_meeting'
  | 'external_stakeholder'
  | 'agreement_or_decision'
  | 'cross_conversation_reference'
  | 'active_project_similarity';

export interface ProjectMilestoneDraft {
  title: string;
  description?: string;
  targetAt?: number | string; // 识别阶段可保留原始日期；确认后归一化为毫秒时间戳。
  confidence?: number;
}

export interface ProjectReminderDraft {
  kind: ProjectReminderKind;
  title: string;
  dueAt?: number | string;
  reason: string;
  needsConfirmation: boolean;
  sourceEventId?: string;
}

export interface ProjectDateBrief {
  title: string;
  at: number;
  kind: 'deadline' | 'meeting' | 'follow_up' | 'milestone' | 'review';
  status: 'upcoming' | 'due' | 'missed' | 'done';
}

export interface ProjectTaskBrief {
  eventId: string;
  title: string;
  status: 'active' | 'in_progress' | 'blocked' | 'done' | 'cancelled';
  dueAt?: number;
}
```

## 7. 数据模型规划

> 本节是规划草案。真实实现时需要先修改 `electron/main/db/schema.ts` 等 schema 源文件，再执行 `db:generate`。

建议新增表：

| 表名 | 职责 |
| --- | --- |
| `tracked_projects` | 项目主体 |
| `project_candidates` | 待用户确认的项目候选 |
| `project_events` | 项目时间线事件 |
| `project_milestones` | 项目里程碑 |
| `project_links` | 项目与 conversation、route event、memory note、resource 的关联 |
| `project_snapshots` | 项目状态派生快照 |
| `project_reminder_links` | 项目与 scheduler/reminder 的桥接关系 |

### 7.1 tracked_projects

```ts
export interface TrackedProjectRow {
  id: string;
  workspaceId: string;

  name: string;
  aliases: string; // JSON string[]
  summary: string;
  goal: string;
  scope?: string | null;
  status: ProjectStatus;

  stakeholders: string; // JSON ProjectStakeholder[]
  domains: string; // JSON string[]
  tags: string; // JSON string[]

  startedAt?: number | null;
  targetEndAt?: number | null;
  completedAt?: number | null;

  confidence: number;
  createdBy: 'user' | 'agent_suggestion' | 'import';
  createdAt: number;
  updatedAt: number;
  archivedAt?: number | null;
}
```

建议索引：

- `(workspaceId, status)`
- `(workspaceId, updatedAt)`
- `(workspaceId, name)`
- `(workspaceId, targetEndAt)`

### 7.2 project_candidates

```ts
export interface ProjectCandidateRow {
  id: string;
  workspaceId: string;
  conversationId: string;
  seqStart: number;
  seqEnd: number;

  proposedName: string;
  proposedGoal: string;
  evidenceSummary: string;
  evidenceMessageIds: string; // JSON string[]
  signalScore: number;
  reasons: string; // JSON ProjectSignalReason[]
  suggestedMilestones: string; // JSON ProjectMilestoneDraft[]
  suggestedReminders: string; // JSON ProjectReminderDraft[]

  status: 'pending' | 'confirmed' | 'dismissed' | 'expired' | 'merged';
  confirmedProjectId?: string | null;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
}
```

### 7.3 project_events

```ts
export interface ProjectEventRow {
  id: string;
  projectId: string;
  workspaceId: string;

  type: ProjectEventType;
  title: string;
  content: string;
  status: 'active' | 'resolved' | 'superseded' | 'cancelled';
  importance: number;
  confidence: number;

  eventTime?: number | null;
  dueAt?: number | null;

  sourceConversationId?: string | null;
  sourceSeqStart?: number | null;
  sourceSeqEnd?: number | null;
  sourceRouteEventIds?: string | null; // JSON string[]
  sourceMemoryNoteIds?: string | null; // JSON string[]

  relatedEventIds?: string | null; // JSON string[]
  supersedesEventIds?: string | null; // JSON string[]
  metadata?: string | null;

  createdAt: number;
  updatedAt: number;
}
```

### 7.4 project_links

用于把项目与其他系统对象关联起来：

```ts
export interface ProjectLinkRow {
  id: string;
  workspaceId: string;
  projectId: string;

  targetType:
    | 'conversation'
    | 'conversation_route_event'
    | 'memory_note'
    | 'resource'
    | 'scheduler_task'
    | 'file'
    | 'external_url';
  targetId: string;

  relationType:
    | 'source'
    | 'evidence'
    | 'follow_up'
    | 'decision_record'
    | 'deliverable'
    | 'meeting'
    | 'reminder'
    | 'related_context';

  strength: number;
  confidence: number;
  createdBy: 'user' | 'agent' | 'system';
  createdAt: number;
}
```

### 7.5 project_snapshots

```ts
export interface ProjectSnapshotRow {
  projectId: string;
  workspaceId: string;
  version: number;
  updatedAt: number;

  status: ProjectStatus;
  summary: string;
  goal: string;
  currentFocus?: string | null;
  nextSuggestedAction?: string | null;

  upcomingDates: string; // JSON ProjectDateBrief[]
  openTasks: string; // JSON ProjectTaskBrief[]
  recentProgress: string; // JSON string[]
  decisions: string; // JSON string[]
  agreements: string; // JSON string[]
  blockers: string; // JSON string[]
  risks: string; // JSON string[]
  changes: string; // JSON string[]
  completedMilestones: string; // JSON string[]

  metadata?: string | null;
}
```

## 8. 项目识别与确认流程

### 8.1 触发时机

项目识别不应该阻塞主对话。建议在以下事件后异步触发：

```text
AGENT_LOOP_COMPLETE / SPRITE_AI_COMPLETE
  -> Conversation Route Update
  -> Project Signal Check
  -> Project Candidate / Project Event Update
```

触发条件：

- 新增消息达到最小阈值。
- 当前 conversation route 出现 `user_goal`、`task_added`、`decision`、`key_clue`、`constraint` 等事件。
- 用户显式提到“项目”“计划”“跟进”“下次提醒”“什么时候完成”等持续推进词。
- 当前对话与已有项目候选或活跃项目高度相似。

### 8.2 项目信号评分

建议采用规则 + LLM 混合评分：

| 信号 | 分值倾向 |
| --- | --- |
| 用户明确说“作为项目跟进” | 极高 |
| 有目标 + 多个待办 + 时间点 | 高 |
| 有会议、协议、截止日期 | 高 |
| 有持续外部参与者 | 中高 |
| 只是一次普通问答 | 低 |
| 只是闲聊或知识解释 | 极低 |

输出协议：

```ts
export interface ProjectSignalDecision {
  shouldCreateCandidate: boolean;
  shouldLinkExistingProject: boolean;
  linkProjectId?: string;
  needsUserConfirmation: boolean;
  signalScore: number;
  reasons: ProjectSignalReason[];
  candidate?: {
    proposedName: string;
    proposedGoal: string;
    evidenceSummary: string;
    suggestedMilestones: ProjectMilestoneDraft[];
    suggestedReminders: ProjectReminderDraft[];
  };
}
```

### 8.3 候选确认策略

根据置信度采取不同策略：

| 置信度 | 行为 |
| --- | --- |
| `>= 0.86` 且用户强表达 | 展示确认浮窗，默认建议创建 |
| `0.70 - 0.86` | 建立候选，可在侧边栏或会话底部轻提示 |
| `0.50 - 0.70` | 只作为内部候选，不主动打扰 |
| `< 0.50` | 不创建候选 |

如果用户已关闭项目跟踪或对同类候选多次 dismiss，应提高提示阈值。

## 9. 项目更新流程

### 9.1 增量更新

项目创建后，每次相关会话结束时更新项目：

```text
读取新增消息
  -> 判断是否关联项目
  -> 提取 Project Delta
  -> 写入 project_events / milestones / links
  -> 更新 reminder links
  -> 重算 project_snapshot
  -> 必要时写入长期记忆候选
```

### 9.2 Project Delta

```ts
export interface ProjectDelta {
  projectId: string;
  sourceConversationId: string;
  sourceSeqStart: number;
  sourceSeqEnd: number;

  events: Array<{
    type: ProjectEventType;
    title: string;
    content: string;
    status?: 'active' | 'resolved' | 'superseded' | 'cancelled';
    eventTime?: number;
    dueAt?: number;
    importance: number;
    confidence: number;
    supersedesEventIds?: string[];
    relatedEventIds?: string[];
  }>;

  milestonePatches: Array<{
    action: 'create' | 'update' | 'complete' | 'cancel';
    milestoneId?: string;
    title: string;
    targetAt?: number;
    completedAt?: number;
    evidenceEventIds?: string[];
  }>;

  reminderSuggestions: ProjectReminderDraft[];
  snapshotPatch: Partial<ProjectSnapshot>;
}
```

### 9.3 事件归约规则

- 新计划覆盖旧计划时，不删除旧事件，而是把旧事件标记为 `superseded`。
- 时间变更用 `deadline_changed`，并关联被取代的旧 deadline。
- 会议完成后，`meeting_scheduled` 可保留，新增 `meeting_done` 和会议结论。
- 协议和决策默认进入 `decisions` / `agreements`，高重要度时可晋升长期记忆。
- 待办完成后，相关 `task_added` 或 `task_progress` 标记为 resolved。
- 已归档项目默认不再自动更新，除非用户显式恢复。

## 10. 提醒与推荐

### 10.1 提醒类型

```ts
export type ProjectReminderKind =
  | 'deadline'
  | 'meeting'
  | 'follow_up'
  | 'review'
  | 'milestone_check'
  | 'stale_project_check';
```

提醒来源：

- 用户明确要求：“下周三提醒我发邮件”。
- 项目自然时间点：“7 月 10 日前完成方案”。
- 会议安排：“明天下午三点开会”。
- 系统推荐：“项目 14 天没有进展，是否提醒复盘？”

所有自动推荐提醒都应用户确认后创建。用户明确命令式提醒可以直接创建，并提供可撤销提示。

### 10.2 与 Scheduler 集成

项目提醒不直接实现一套新定时器，而是桥接现有 scheduler：

```text
Project Event / Milestone
  -> Reminder Suggestion
  -> User Confirm
  -> Scheduler Task
  -> project_reminder_links
```

提醒触发时，agent 应携带项目快照：

```text
提醒：今天需要跟进“Chobits 项目跟踪记忆系统”
原因：计划在 2026-07-03 完成规划文档
当前开放事项：拆分数据模型、worker、prompt 注入和 UI
```

### 10.3 推荐下一步

项目快照中可以维护 `nextSuggestedAction`：

- 根据最近阻塞推荐“先确认缺失信息”。
- 根据临近 deadline 推荐“优先完成交付物”。
- 根据长期无进展推荐“是否归档或重新规划”。
- 根据会议完成推荐“整理纪要并确认待办”。

推荐不应替用户做承诺，只能提出可接受、可拒绝、可编辑的建议。

## 11. UI 设计建议

### 11.1 确认浮窗

浮窗展示：

- 候选项目名。
- 一句话目标。
- 识别到的关键节点。
- 可能的提醒。
- 操作按钮：创建、编辑后创建、不是项目、稍后。

注意：如果按钮使用 shadcn Button 且只有图标，需要遵守项目 Button 规范：原 `size="sm"` 改单图标时添加 `w-8 h-8`，图标不手写 `w-`、`h-`、`mr-`、`ml-`，去掉文本时把含义放进 tooltip。

### 11.2 项目中心

可以新增一个项目中心页面或侧栏：

- 活跃项目列表。
- 每个项目的状态、下一节点、最近进展。
- 项目详情页：
  - 项目快照。
  - 时间线。
  - 里程碑。
  - 待办与阻塞。
  - 决策与协议。
  - 关联对话与记忆。
  - 提醒设置。

### 11.3 聊天中的项目上下文

当当前对话已关联项目时，聊天页可以展示轻量项目条：

```text
正在跟进：Chobits 项目跟踪记忆系统 · planning · 3 个开放事项
```

用户可以点击查看项目详情、解除当前会话关联、切换项目或归档项目。

## 12. Prompt 注入与工具

### 12.1 Project Context Enricher

新增 `project-context` enricher：

注入条件：

- 当前请求可持久化。
- 存在 conversationId / workspaceId。
- 当前会话显式或高置信关联项目。
- 不属于内部 agent，例如 memory extraction、project extraction、title generation。

注入内容：

- 项目名、状态、目标。
- 当前重点和下一步建议。
- 临近时间点。
- 开放待办、阻塞、最近变化。
- 关键决策和协议。

### 12.2 Project Tool

建议新增 Pi tool：`projectTrackingTool`。

```ts
type ProjectTrackingToolAction =
  | 'listProjects'
  | 'getProject'
  | 'searchProjects'
  | 'getSnapshot'
  | 'listEvents'
  | 'addEvent'
  | 'updateEvent'
  | 'linkConversation'
  | 'unlinkConversation'
  | 'createProject'
  | 'updateProject'
  | 'archiveProject'
  | 'suggestReminder'
  | 'createReminder';
```

用途：

- agent 回答“这个项目现在进展如何”。
- agent 查询完整项目时间线。
- 用户明确说“把这件事记到项目里”时直接写入事件。
- 用户要求提醒时，创建项目相关 reminder。

工具写操作应记录来源和证据，重要变更需要用户确认或可撤销。

## 13. 与长期记忆的关系

项目跟踪不应该把所有过程细节都写成长期记忆。晋升规则：

| 内容 | 是否晋升长期记忆 | 说明 |
| --- | --- | --- |
| 项目目标 | 条件晋升 | 活跃且长期项目应进入 Active Projects |
| 关键决策 | 是 | 影响后续行为 |
| 协议达成 | 是 | 需要未来可靠回忆 |
| 普通待办 | 否 | 留在项目事件里 |
| 已过期提醒 | 否 | 除非它代表重要历史节点 |
| 计划变更 | 条件晋升 | 重大变更才晋升 |
| 项目完成复盘 | 是 | 可形成长期总结 |

`memory/MEMORY.md` 的 `Active Projects` 段可以从 project snapshots 中生成或补充，但不应成为项目系统的唯一事实源。

## 14. 隐私、控制与防噪音

项目跟踪会保存更强的长期结构，因此需要明确控制：

- 用户可以关闭自动项目识别。
- 用户可以要求某个会话不参与项目跟踪。
- 用户可以删除项目及其派生事件。
- 用户可以合并重复项目。
- 用户可以把误关联的对话从项目中移除。
- 用户可以查看每条项目事件的来源消息。
- 对低置信推断必须标记 confidence，不把猜测写成事实。
- 对外部人物、协议、合同、医疗、法律、财务等高风险内容，建议更多使用确认流程。

防噪音规则：

- 候选创建需要阈值。
- 浮窗有冷却时间。
- 已 dismiss 的候选相似内容短期不重复提示。
- 项目快照有严格预算。
- 归档项目默认不参与自动召回，除非用户显式提到。

## 15. 实施计划

### 15.1 落地原则

- 先做“用户确认创建项目”的闭环，再做自动关联和自动提醒。
- 先让项目状态可查看、可编辑、可撤销，再让 agent 自动写入更多事件。
- 先把 project snapshot 做成派生缓存，避免 prompt 注入直接依赖长时间线。
- 数据库变更必须先改 schema 定义，再执行 `pnpm db:generate`，不要手写迁移绕过 schema。
- 与 `conversation-route`、`memory`、`scheduler` 集成时保持异步，不阻塞主聊天链路。

### 15.2 建议模块落点

```text
packages/ai/services/
  project-tracking-types.ts          # 类型、枚举、prompt 输出协议
  project-tracking-signal.ts         # 项目信号识别与候选生成
  project-tracking-extractor.ts      # Project Delta 提取
  project-tracking-service.ts        # reducer、snapshot、formatForPrompt
  project-tracking-matcher.ts        # 新会话与已有项目匹配
  project-tracking-reminder.ts       # reminder suggestion 生成与归一化

electron/main/db/
  project-tracking-repositories.ts   # projects/events/milestones/links/snapshots CRUD

electron/main/handlers/project-tracking/
  ipc-main.ts                        # Renderer IPC
  worker.ts                          # AGENT_LOOP_COMPLETE 后台更新
  enricher.ts                        # project-context prompt 注入
  reminder-bridge.ts                 # scheduler 桥接

packages/ai/runtime/pi/tools/
  project-tracking.ts                # projectTrackingTool

src/pages/ChatPage/components/
  ProjectCandidatePrompt.tsx         # 创建确认浮窗
  ProjectContextBar.tsx              # 当前项目条

src/pages/ProjectTrackingPage/
  index.tsx                          # 项目中心
  components/ProjectTimeline.tsx
  components/ProjectSnapshotPanel.tsx
  components/ProjectMilestones.tsx
```

现有 `electron/main/handlers/conversation-route` 已经具备 worker、IPC、enricher 的参考形态，项目跟踪实现可以沿用它的事件监听、内部 agent skip、coalescing/trailing-run 和 snapshot 注入模式。

### 15.3 Phase 0：基础开关与类型

目标：先准备配置、类型和空实现，不改变业务行为。

任务：

- 新增 `project-tracking-types.ts`，落地本文的核心 type。
- 新增项目跟踪配置，至少包含：
  - `enabled`
  - `autoDetectEnabled`
  - `autoLinkEnabled`
  - `promptInjectionEnabled`
  - `reminderSuggestionEnabled`
  - `candidateCooldownMinutes`
- 在设置页预留“项目跟踪”开关。
- 定义内部 agent id：`project-tracking`，并加入 conversation route / memory enricher 的 skip 列表，避免内部任务互相污染。

验收：

- 默认配置不改变现有对话行为。
- 关闭项目跟踪时，不触发候选识别、事件提取和 prompt 注入。

### 15.4 Phase 1：Schema、Repository 与最小数据闭环

目标：完成项目主体和候选的持久化。

任务：

- 在 schema 源文件中新增：
  - `tracked_projects`
  - `project_candidates`
  - `project_links`
  - `project_snapshots`
- 执行 `pnpm db:generate` 生成迁移。
- 新增 `ProjectRepo`、`ProjectCandidateRepo`、`ProjectLinkRepo`、`ProjectSnapshotRepo`。
- 实现 snapshot 的空态创建、upsert、delete、按 workspace/list 查询。
- 新增 IPC：
  - `projectTracking:listProjects`
  - `projectTracking:getProject`
  - `projectTracking:createProject`
  - `projectTracking:updateProject`
  - `projectTracking:archiveProject`
  - `projectTracking:listCandidates`
  - `projectTracking:confirmCandidate`
  - `projectTracking:dismissCandidate`

验收：

- 用户可以通过 IPC 创建一个项目，读取列表和详情。
- dismiss 的候选不会再次作为待确认候选展示。
- 删除或归档项目后，snapshot 不再参与 prompt 注入。

### 15.5 Phase 2：项目信号识别与确认浮窗

目标：用户提出持续性项目需求后，系统能给出候选并请求确认。

任务：

- 实现 `project-tracking-signal.ts`：
  - 规则信号：项目词、跟进词、时间词、会议词、协议词、持续待办。
  - LLM 判定：输出 `ProjectSignalDecision`。
  - 与已有项目做轻量匹配，避免重复创建候选。
- 新增 `project-tracking/worker.ts`：
  - 监听 `AGENT_LOOP_COMPLETE`。
  - 跳过内部 agent 和未持久化请求。
  - 读取本轮新增消息和当前 conversation route snapshot。
  - 写入 `project_candidates`。
  - 对同一 conversation 做 coalescing，避免并发重复分析。
- 实现 `ProjectCandidatePrompt`：
  - 展示项目名、目标、识别依据、建议里程碑。
  - 支持创建、编辑后创建、不是项目、稍后。
  - 遵守 Button 图标与 tooltip 规范。
- 创建项目时自动写入：
  - `tracked_projects`
  - 初始 `project_snapshots`
  - 当前 conversation 的 `project_links`

验收：

- 用户明确说“把这个作为项目跟进”时，候选置信度应进入确认路径。
- 用户点击创建后，当前 conversation 关联该项目。
- 用户点击“不是项目”后，同一候选不会反复出现。

### 15.6 Phase 3：项目事件、里程碑与快照归约

目标：项目能持续记录进度，而不是只有一个静态项目名。

任务：

- 在 schema 源文件中新增：
  - `project_events`
  - `project_milestones`
  - `project_reminder_links`
- 执行 `pnpm db:generate` 生成迁移。
- 新增 `ProjectEventRepo`、`ProjectMilestoneRepo`、`ProjectReminderLinkRepo`。
- 实现 `project-tracking-extractor.ts`：
  - 输入：新增消息、当前 project snapshot、相关 conversation route events。
  - 输出：`ProjectDelta`。
  - 严格要求 source conversation 与 seq 范围。
- 实现 `project-tracking-service.ts`：
  - `materializeProjectEvents()`
  - `applyMilestonePatches()`
  - `reduceProjectSnapshot()`
  - `formatProjectSnapshotForPrompt()`
- 写操作后统一重算 snapshot，避免事件状态和 prompt 注入不一致。
- 新增 IPC：
  - `projectTracking:listEvents`
  - `projectTracking:updateEvent`
  - `projectTracking:listMilestones`
  - `projectTracking:updateMilestone`
  - `projectTracking:rebuildSnapshot`

验收：

- 用户在项目对话中新增 deadline、会议、协议或计划变更后，项目时间线出现对应事件。
- 待办完成后，不再出现在 snapshot 的 open tasks。
- 下一次相关对话能注入项目当前目标、开放事项和最近变化。

### 15.7 Phase 4：项目匹配、Prompt 注入与 Agent Tool

目标：新会话能延续旧项目，agent 可以按需查询项目状态。

任务：

- 实现 `project-tracking-matcher.ts`：
  - 项目名、别名、实体和关键词匹配。
  - 活跃待办和近期时间点匹配。
  - conversation route snapshot 相似度匹配。
  - 多候选时返回 disambiguation，不自动误绑。
- 新增 `project-tracking/enricher.ts`：
  - 注册 `project-context` enricher。
  - 只注入最相关 1-2 个 active project snapshot。
  - 内部 agent、未持久化请求、禁用配置时跳过。
- 新增 `projectTrackingTool`：
  - 读操作：list/search/get snapshot/list events。
  - 写操作：add event、link conversation、archive project。
  - 写操作记录来源，重要变更提供可撤销路径。
- 聊天页新增 `ProjectContextBar`：
  - 展示当前关联项目。
  - 支持解除关联、切换项目、打开项目详情。

验收：

- 用户在新会话中说“继续上次那个项目”，系统能命中候选项目。
- 多个项目都可能相关时，系统询问用户选择。
- agent 回答“这个项目现在进展如何”时，能查询项目快照和时间线。

### 15.8 Phase 5：提醒、项目中心与治理

目标：项目可以被长期管理，而不是只在聊天中隐式存在。

任务：

- 实现 `project-tracking-reminder.ts`：
  - 从 deadline、meeting、follow-up、stale project 生成 reminder suggestion。
  - 用户确认后桥接 scheduler。
  - 写入 `project_reminder_links`。
- 实现 `ProjectTrackingPage`：
  - 活跃项目列表。
  - 项目详情。
  - 时间线。
  - 里程碑。
  - 待办、阻塞、风险。
  - 决策与协议。
  - 关联对话与记忆。
- 支持治理操作：
  - 合并重复项目。
  - 拆分误合并项目。
  - 归档项目。
  - 删除项目及派生事件。
  - 解除 conversation / memory note / reminder 关联。
- 项目完成后生成复盘候选，并按规则晋升长期记忆。

验收：

- 用户创建的提醒能在触发时携带项目快照。
- 项目中心能查看完整项目历史和来源。
- 归档项目默认不再主动注入 prompt。

### 15.9 测试计划

单元测试：

- `project-tracking-signal`：普通问答不生成候选，持续目标生成候选。
- `project-tracking-matcher`：显式引用优先，弱相关不强绑。
- `reduceProjectSnapshot`：事件完成、计划变更、deadline 变更能正确归约。
- `formatProjectSnapshotForPrompt`：预算裁剪稳定，空 snapshot 不注入。

Repository 测试：

- CRUD、分页、状态过滤。
- project 删除/归档后的 link 与 snapshot 行为。
- `updateEvent` 后 snapshot recompute。

集成测试：

- 模拟 `AGENT_LOOP_COMPLETE` 后生成 candidate。
- candidate confirm 后创建 project + link conversation。
- 相关会话结束后写入 project event。
- enricher 能注入项目快照，并跳过内部 agent。

UI 验证：

- 确认浮窗在窄屏和桌面都不遮挡主对话。
- 图标 Button 的 tooltip 与尺寸符合项目规范。
- 项目条文本过长时不溢出。
- 项目详情页的时间线、里程碑、提醒状态一致。

建议命令：

```bash
pnpm db:generate
pnpm test
pnpm lint
```

如仅改文档，不需要执行以上命令；涉及 schema、服务或 UI 后再按影响范围执行。

### 15.10 发布与回滚

- 第一版默认开启手动创建，自动检测可配置。
- 自动关联和自动提醒建议先默认关闭或仅提示确认。
- 所有 project worker 失败只记录 warning，不影响聊天主链路。
- 保留 `projectTracking:clearProjectData(projectId)` 或内部调试入口，方便清理误生成数据。
- 为候选创建、确认、dismiss、自动关联、提醒创建记录 analytics event，便于调阈值。

### 15.11 本轮交付清单与剩余 Backlog

| 优先级 | 模块 | 状态 | 已完成 / 剩余 |
| --- | --- | --- | --- |
| P0 | 项目信号识别 | 已完成 | `project-tracking-signal.ts` 规则识别项目/任务/时间/协议信号，会话结束后写入 `project_candidates` |
| P0 | 候选确认 UI | 已完成 | `ProjectCandidatePrompt` 支持编辑项目名/目标、创建、dismiss |
| P0 | 当前会话项目关联 | 已完成 | 确认候选后写 `project_links`，`ProjectContextBar` 展示当前关联项目 |
| P0 | 项目事件 schema | 已完成 | `project_events` 支持任务、会议、协议、决策、变更、阻塞、风险等事件 |
| P0 | 项目快照归约 | 已完成 | 从事件归约 open tasks、dates、recent progress、decisions、agreements、blockers、risks、changes，并过滤已完成事项 |
| P1 | 里程碑与提醒 schema | 已完成 | `project_milestones`、`project_reminder_links` 已建模并有 repo/IPC 基础能力 |
| P1 | Project Delta 提取 | 第一版完成 | `project-tracking-extractor.ts` 用规则从已关联会话增量提取事件和里程碑；后续可升级 LLM 提取 |
| P1 | 项目匹配器 | 第一版完成 | `project-tracking-matcher.ts` 支持项目名、别名、目标、快照事项和显式延续词匹配，高置信时可自动关联 |
| P1 | Prompt 注入完善 | 已完成 | `project-context` enricher 对已关联项目注入快照；开启自动关联时，新会话高置信匹配也可写 link 并注入 |
| P1 | Agent Tool | 已完成 | `projectTrackingTool` 支持查询项目/快照/事件/里程碑，写事件，关联/解除会话，归档和重建快照 |
| P2 | 项目中心 UI | 第一版完成 | `ProjectTrackingPage` 支持项目列表、详情编辑、快照、时间线、里程碑、关联对象、手动事件、归档 |
| P2 | 治理能力 | 部分完成 | 已支持归档、解除 conversation 关联；删除、合并、拆分、深度清理留作后续增强 |
| P2 | 提醒桥接 | 部分完成 | 已有提醒链接数据模型；scheduler 真实创建和提醒触发携带项目快照留作后续增强 |
| P2 | 测试与验证 | 进行中 | 本轮需跑 `tsc --noEmit` 和目标文件 lint；后续补单元/集成/UI 自动化测试 |

### 15.12 端到端完成定义

这个系统只有满足以下条件，才算完成：

- 用户在真实聊天中表达一个持续性项目后，系统能异步生成项目候选。
- 用户能通过确认浮窗创建项目，或明确 dismiss 该候选。
- 项目创建后，当前会话会显示项目关联状态。
- 后续相关对话能写入项目事件，项目快照能反映开放事项、近期进展、关键时间点、决策、协议和阻塞。
- 新会话提到旧项目时，系统能建议关联，或者在明确引用时自动关联。
- prompt 注入只发生在当前会话已关联项目或高置信匹配项目时，不把无关项目塞进上下文。
- agent 能通过 `projectTrackingTool` 查询项目状态和时间线。
- 用户能在项目中心查看、编辑、归档和清理项目数据。
- 所有数据库变更都从 schema 生成迁移，`tsc` 和相关 lint 通过。

第一版完成边界：

- “清理项目数据”第一版先覆盖归档和解除会话关联；硬删除、合并、拆分属于治理增强。
- “提醒”第一版先保留 project reminder link 和 suggestion 模型；真正调用 scheduler 创建提醒属于外部桥接增强。
- “自动提取”第一版用规则型 extractor，保证低成本和可控；高质量复杂事件抽取后续可接内部 LLM worker。

## 16. 风险与缓解

| 风险 | 表现 | 缓解 |
| --- | --- | --- |
| 误创建项目 | 普通问答被当成项目 | 候选阈值 + 用户确认 |
| 误关联项目 | 新对话绑到错误项目 | 多候选时询问用户 |
| 记忆噪音 | 项目时间线充满低价值事件 | 事件重要度与类型过滤 |
| prompt 膨胀 | 项目历史过长 | 只注入 snapshot，完整时间线工具查询 |
| 状态不一致 | 事件完成但 snapshot 未更新 | 写操作后强制重算 snapshot |
| 提醒骚扰 | 自动推荐太频繁 | 冷却、用户偏好、项目级提醒开关 |
| 隐私过度保存 | 敏感项目被长期记录 | 用户控制、来源透明、删除能力 |

## 17. 验收标准

第一版完整闭环应满足：

- 用户可以把一段对话确认成项目。
- 系统可以为项目维护目标、状态、时间节点、待办、决策和变更。
- 新会话中，系统能识别与已有项目相关的请求，并建议或自动关联。
- 项目快照能被注入对话上下文，帮助 agent 延续项目推进。
- 用户能查看项目时间线并回溯来源对话。
- 用户能删除、归档、取消关联或关闭项目跟踪。
- 项目提醒必须可确认、可撤销、可追溯。

## 18. 示例

用户说：

```text
在对话过程中，agent 的记忆能力我觉得要有一个设计，就是项目跟踪能力...
```

可能生成候选：

```json
{
  "proposedName": "Agent 项目跟踪记忆系统",
  "proposedGoal": "设计跨会话的项目跟踪能力，让 AI 能识别用户正在推进的项目，并持续维护关键时间点、计划、变更、里程碑和提醒。",
  "signalScore": 0.91,
  "reasons": ["explicit_project_tracking_request", "long_term_memory_design", "cross_conversation_follow_up"],
  "suggestedMilestones": [
    {
      "title": "完成项目跟踪记忆系统规划文档",
      "targetAt": "2026-07-03"
    },
    {
      "title": "拆分 schema、worker、UI、prompt 注入实现任务"
    }
  ],
  "suggestedReminders": []
}
```

确认后生成项目快照：

```text
项目：Agent 项目跟踪记忆系统
状态：planning
目标：设计跨会话项目跟踪能力，覆盖项目识别、确认创建、关联对话、时间线、提醒和进度总结。
当前重点：完成 docs 规划文档。
开放事项：
- 定义项目候选识别与确认浮窗
- 设计项目事件、里程碑、提醒与快照数据模型
- 规划与长期记忆、会话线路和 scheduler 的集成
最近变化：
- 用户明确提出项目跟踪能力应成为 agent 记忆设计的一部分
```
