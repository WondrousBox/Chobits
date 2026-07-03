# 项目跟踪记忆系统下一阶段实施计划

> 本文是 `project-tracking-memory-design.md` 和 `project-tracking-memory-risk-and-enhancement-design.md` 的执行版计划。
> 目标不是重新描述愿景，而是把下一步补充完善拆成可以直接进入开发的任务包、文件落点、验收标准和验证命令。
> 完整能力边界、成熟度路线和终局验收见：[项目跟踪记忆系统完整能力蓝图](./project-tracking-complete-capability-blueprint.md)。本文中的 Phase A-D 是近期实施入口，不代表整体能力边界。

## 0. 和完整蓝图的关系

完整蓝图把项目跟踪定义为“跨会话项目伙伴层”，覆盖发现、确认、跟踪、审核、提醒、治理、完成、复盘、长期记忆晋升、隐私退出和观测运维。本文负责把其中最紧急、最容易影响可信度的部分落成工程任务。

范围约束：

- Phase A-D 解决近期最大风险：自动事件质量、治理能力、scheduler 提醒桥接和 LLM 抽取质量。
- Phase E-I 解决长期运行能力：观测审计、隐私数据生命周期、完成复盘、项目智能和外部生态协作。
- 每个 phase 完成后都要回到完整蓝图检查覆盖状态，不能把局部功能完成误判为整体完成。
- 涉及数据库表字段变更时，必须先更新 schema 定义，再执行 `db:generate`。

## 0.1 2026-07-03 Phase A-G 落地记录

本轮已经按“schema 先行 -> `drizzle-kit generate` -> repo/IPC/preload -> UI/tool/test/doc”的顺序，把 Phase A-G 推进到可运行的最小完整实现。它不是终局完整系统，但已经不再只是第一版小闭环。

| Phase | 当前状态 | 已落地能力 | 仍需深化 |
| --- | --- | --- | --- |
| Phase A | 已落地 | `project_events` 质量字段、自动事件 draft、手动/tool 事件 accepted、待确认队列、snapshot 仅归约 accepted、服务测试 | 编辑后接受、来源片段展示、worker/enricher 集成测试 |
| Phase B | 已落地 + R1 深化 | 项目中心支持导出、软删除、恢复、硬删除、合并、拆分、解除 conversation link；repo 提供迁移 events/milestones/links/reminders；治理 tab 展示 impact preview 和 orphan report | 撤销一次治理操作、合并/拆分独立 dry-run、批量筛选 |
| Phase C | 已落地 + R2 深化 | `reminder-bridge` 接入 scheduler owner，提醒建议、创建、取消、编辑、重同步、手动完成、触发后状态回写和审计；项目中心显示最近同步/触发时间 | 提前量、触发时系统通知、外部日历连接器 |
| Phase D | 已落地 + R3 深化 | `extractProjectDelta` 支持可选 LLM chatFn、JSON schema prompt、标准化、质量门控和规则回退；worker 已接入默认关闭的 Pi task LLM 调用路径和复杂度阈值；补 mock chatFn 回归测试 | supersede/cancel 精准匹配、更多会议纪要样本 |
| Phase E | 已落地 + R1/R5 深化 | `project_audit_logs`、治理/提醒/隐私/完成/导出审计、项目中心审计 tab、snapshot rebuild 入口、orphan report、service/extractor 测试 | analytics 指标、worker error dashboard、repo/scheduler/UI 集成测试 |
| Phase F | 已落地 + R4 深化 | 项目级隐私设置、敏感项目策略、自动关联/注入/提醒/长期记忆晋升开关、导出/软删/恢复/硬删字段与 UI；硬删除前展示 Memory Note 引用并审计 `unlink_project_only` 策略 | 保留周期策略、可选“同时删除 Memory Note”策略设计 |
| Phase G | 已落地 + R4 深化 | 完成/重开、完成总结生成、复盘文本、受隐私开关控制的 Memory Note 晋升、memory note link 和审计；晋升前展示并提交当前编辑内容预览 | 复盘模板、长期事实去噪、晋升 diff 更细粒度展示 |

本轮新增或扩展的主要工程落点：

```text
electron/main/db/schema.ts
electron/main/db/project-tracking-repositories.ts
electron/main/handlers/project-tracking/ipc-main.ts
electron/main/handlers/project-tracking/reminder-bridge.ts
electron/main/handlers/project-tracking/worker.ts
electron/preload/apis/project-tracking.ts
packages/ai/services/project-tracking-types.ts
packages/ai/services/project-tracking-service.ts
packages/ai/services/project-tracking-extractor.ts
packages/ai/runtime/pi/tools/project-tracking.ts
src/pages/ProjectTrackingPage/index.tsx
test/project-tracking-service.spec.ts
```

本轮验证命令：

```bash
./node_modules/.bin/drizzle-kit generate
./node_modules/.bin/vitest run test/project-tracking-service.spec.ts
./node_modules/.bin/tsc --noEmit
```

后续继续开发时，不要再把 Phase B-G 当成“未开始”，而应按本节状态推进深化项和回归测试。

## 0.2 2026-07-03 R 阶段落地记录

本轮已完成 R0-R5 的可用落地，R6 明确保留为后续产品阶段。实现边界如下：

| R 阶段 | 当前状态 | 已落地能力 | 后续仍可深化 |
| --- | --- | --- | --- |
| R0 文档状态去重 | 已完成 | 主设计、完整蓝图、风险文档和实施计划统一为 Phase A-G + R 阶段口径 | 后续每次实现后继续同步完成状态 |
| R1 治理 dry-run/orphan | 已完成基础 | `ProjectImpactPreview`、`ProjectOrphanReport`、IPC/preload/API、项目中心治理预检、Pi tool 只读查询、硬删除前 scheduler job 清理和 Memory Note 策略审计 | 合并/拆分专属 dry-run、撤销一次治理操作 |
| R2 提醒编辑/重同步/完成 | 已完成基础 | 已创建提醒可编辑标题、kind、时间、原因；支持 resync、mark done、cancel；trigger/update/resync/done 写审计；UI 展示最近同步/触发时间 | 提前量、触发通知、外部日历同步 |
| R3 LLM Delta 接线与回归 | 已完成基础 | 配置中新增默认关闭的 `llmProjectDelta`；worker 按复杂度阈值调用 Pi task chat runtime；LLM 失败回退规则 extractor；新增 mock chatFn 回归测试 | 更多真实会议纪要样本、supersede/cancel 精准识别 |
| R4 长期记忆引用清理 | 已完成基础 | impact preview 展示 Memory Note id；hard delete 默认只解除项目引用、不删除 Memory Note，并写审计策略；晋升前展示并提交当前编辑内容预览；orphan report 检查 memory_note link 状态不一致 | 可选同时删除 Memory Note、引用保留周期和 diff UI |
| R5 测试矩阵补齐 | 已完成基础 | 新增 `test/project-tracking-extractor.spec.ts`，保留 service 测试；已通过 vitest、tsc、target eslint、drizzle generate | repo/worker/scheduler/UI 集成测试 |

本轮新增或扩展的主要工程落点：

```text
electron/main/db/project-tracking-repositories.ts
electron/main/handlers/project-tracking/ipc-main.ts
electron/main/handlers/project-tracking/reminder-bridge.ts
electron/main/handlers/project-tracking/worker.ts
electron/preload/apis/project-tracking.ts
packages/ai/runtime/pi/tools/project-tracking.ts
packages/ai/services/project-tracking-extractor.ts
packages/ai/services/project-tracking-service.ts
packages/ai/services/project-tracking-types.ts
src/pages/ProjectTrackingPage/index.tsx
src/pages/SettingsPage/components/MemoryManagementSettings.tsx
test/project-tracking-extractor.spec.ts
```

本轮验证命令：

```bash
./node_modules/.bin/drizzle-kit generate
./node_modules/.bin/vitest run test/project-tracking-service.spec.ts test/project-tracking-extractor.spec.ts
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint packages/ai/services/project-tracking-types.ts packages/ai/services/project-tracking-service.ts packages/ai/services/project-tracking-extractor.ts electron/main/db/schema.ts electron/main/db/project-tracking-repositories.ts electron/main/handlers/project-tracking/ipc-main.ts electron/main/handlers/project-tracking/reminder-bridge.ts electron/main/handlers/project-tracking/worker.ts electron/preload/apis/project-tracking.ts packages/ai/runtime/pi/tools/project-tracking.ts src/pages/ProjectTrackingPage/index.tsx src/pages/SettingsPage/components/MemoryManagementSettings.tsx test/project-tracking-service.spec.ts test/project-tracking-extractor.spec.ts
```

注意：R 阶段已补齐可信运行的基础缺口，但不等于完整成熟系统。Phase H 的项目智能层和 Phase I 的外部生态协作仍保留为后续产品阶段。

## 0.3 当前未完成项与后续规划

本节是后续开发入口。它不再把 R 阶段基础能力列为“未完成”，而是明确当前真正剩余的深化项、产品规划和验收口径。

### 0.3.1 近期未完成项

| 优先级 | 未完成项 | 当前基础 | 下一步落地内容 | 验收标准 |
| --- | --- | --- | --- | --- |
| P0 | repo/worker/scheduler/UI 集成测试 | 已有 service/extractor 测试，目标 lint/tsc/drizzle 通过 | 增加 repository 级治理测试、worker 已关联会话抽取测试、scheduler bridge create/update/cancel/resync/trigger 测试、项目中心关键路径 UI 测试 | R 阶段能力在真实链路中可回归，失败不会污染项目事实 |
| P0 | 撤销一次治理操作 | 已有审计日志、导出、软删/恢复、硬删、合并、拆分 | 设计治理 undo journal，优先支持软删恢复、合并回滚、拆分回滚；硬删除只允许从导出恢复，不做静默撤销 | 用户误操作后有明确恢复路径；撤销本身写审计 |
| P1 | 合并/拆分专属 dry-run | 已有项目级 impact preview 和 orphan report | 在 merge/split 前显示将移动的 events/milestones/links/reminders、目标项目快照影响和潜在冲突 | 合并/拆分前能看到具体迁移清单，不只看到项目总量 |
| P1 | supersede/cancel 精准识别 | 事件模型已有 `supersedesEventIds`，LLM Delta 有默认关闭调用路径 | 增加规则和 LLM 回归样本，识别“这个不用做了”“改成 B 方案”“延期到 X”等覆盖/取消关系 | 旧开放事项能被标记 superseded/cancelled，不继续进入 snapshot open tasks |
| P1 | LLM 真实样本回归集 | 已有 mock chatFn 测试 | 补真实会议纪要、多行动项、取消事项、模糊日期、外部承诺和高风险变更样本 | LLM 开启后仍保持高风险 draft、source seq 正确、失败自动回退 |
| P1 | 长期记忆保留周期和可选删除策略 | hard delete 默认只解除项目引用，不删除 Memory Note，并写审计策略 | 设计 Memory Note 引用保留周期、可选同步删除、删除前 diff 和二次确认 | 项目退出后长期记忆引用可解释、可导出、可选择清理 |
| P2 | 观测指标与 debug 面板 | 已有审计日志和 snapshot rebuild | 增加 candidate 确认率、自动关联解除率、事件接受/拒绝率、提醒取消率、worker/scheduler 错误指标 | 能定位项目状态错误来源，支持调阈值 |

### 0.3.2 中期规划：Phase H 项目智能层

| 方向 | 内容 | 依赖 |
| --- | --- | --- |
| 下一步建议 | 基于 accepted snapshot、开放事项、阻塞、临近时间点生成可解释建议 | R 阶段事实源、质量门控、推荐 dismiss 反馈 |
| 项目健康度 | 评估长期未推进、延期、阻塞、风险堆积、提醒逾期 | 观测指标、稳定的 reminder 状态 |
| 项目组合视图 | 跨项目展示活跃项目、风险、临近时间点、阻塞和优先级 | 项目中心单项目治理稳定、筛选和排序能力 |
| 跨项目依赖 | 识别一个项目的决策/阻塞是否影响另一个项目 | 更强 project link 和 evidence 模型 |

Phase H 不能绕过质量门控。所有建议都必须标注来源，不能把 draft 事件当作用户承诺。

### 0.3.3 远期规划：Phase I 外部生态协作

| 方向 | 内容 | 权限和回滚要求 |
| --- | --- | --- |
| 外部日历 | 将 confirmed meeting/deadline 同步到用户选择的日历 | 每次外部写入需确认或明确授权；保存 external id、sync state、lastSyncedAt、error |
| 任务系统 | 同步开放事项到任务工具，支持完成/取消状态回写 | 必须有冲突处理、撤销路径和项目级开关 |
| 文档系统 | 将项目复盘、会议纪要、交付物关联到项目 | 不自动公开敏感内容；导出和删除要覆盖外部引用 |
| 团队协作 | 支持协作空间、项目共享和多人审阅 | 需要单独账号、权限、审计和敏感项目策略 |

Phase I 需要单独权限设计，不在当前 R 阶段基础包中实现。

## 0.4 R 阶段原设计与验收基线（历史记录）

Phase A-G 已经有可用实现后，剩余工作不能继续按“再补几个按钮”推进，而要围绕可信长期运行补齐四类能力：

1. 抽取可信度：真实 LLM Project Delta 接线、回归集、supersede/cancel 识别。
2. 治理可靠性：dry-run 预览、orphan 检查、删除影响范围、治理结果可解释。
3. 提醒可控性：提醒时间/标题/原因编辑、触发通知或至少可见状态、scheduler/link 一致性修复。
4. 生命周期闭环：长期记忆引用清理、晋升前确认内容、文档状态去重、集成测试覆盖。

### R0：文档状态去重

当前主设计文档尾部仍保留第一版实施表述，例如“治理能力部分完成”“提醒桥接部分完成”。本轮落地前必须先完成文档去重：

- 将 `project-tracking-memory-design.md` 的 `15.11 本轮交付清单与剩余 Backlog` 更新为 Phase A-G 后状态。
- 把旧的“第一版完成边界”改为“历史边界”，避免和当前状态冲突。
- 在完整蓝图和风险文档里维持同一个剩余项口径。

验收：

- 文档中不再把已落地的删除、合并、拆分、scheduler bridge、完成复盘写成“后续增强”。
- 剩余项明确落在 R1-R6 或 Phase H/I。

### R1：治理 dry-run、orphan 检查与一致性修复

目标：所有高影响治理动作在执行前可预览，执行后可检查。

新增 repository/service 能力：

```ts
interface ProjectImpactPreview {
  projectId: string;
  events: number;
  milestones: number;
  links: number;
  reminderLinks: number;
  auditLogs: number;
  schedulerTasks: number;
  promotedMemoryNoteIds: string[];
  warnings: string[];
}

interface ProjectOrphanReport {
  projectId: string;
  missingSchedulerTasks: ProjectReminderLink[];
  staleSchedulerTasks: ProjectReminderLink[];
  danglingMemoryLinks: ProjectLink[];
  deletedProjectActiveLinks: ProjectLink[];
  warnings: string[];
}
```

落点：

```text
electron/main/db/project-tracking-repositories.ts
electron/main/handlers/project-tracking/ipc-main.ts
electron/preload/apis/project-tracking.ts
src/pages/ProjectTrackingPage/index.tsx
packages/ai/runtime/pi/tools/project-tracking.ts
```

验收：

- 项目中心治理 tab 能在硬删除、合并前显示影响范围。
- orphan 检查能列出 scheduler link 不一致、长期记忆悬挂引用、deleted project 仍活跃的 link。
- hard delete 前必须经过 preview 或 UI 二次确认。

### R2：提醒编辑、重同步与触发可见性

目标：提醒不是只能创建/取消，还能修正和诊断。

能力：

- updateProjectReminder(linkId, patch)：允许改标题、时间、原因、kind。
- resyncProjectReminder(linkId)：scheduler task 丢失时重建。
- markProjectReminderDone(linkId)：用户手动标记完成。
- reminder trigger 后写入审计，并可在项目中心看到最近触发时间。

落点：

```text
electron/main/handlers/project-tracking/reminder-bridge.ts
electron/main/db/project-tracking-repositories.ts
electron/main/handlers/project-tracking/ipc-main.ts
electron/preload/apis/project-tracking.ts
src/pages/ProjectTrackingPage/index.tsx
```

验收：

- 已创建提醒可编辑标题和触发时间。
- scheduler task 丢失时可一键重同步。
- completed/archived/deleted 项目的提醒不会继续触发为 active 提醒。

### R3：真实 LLM Project Delta 接线和回归集

目标：`extractProjectDelta` 已有 chatFn 入口后，补齐真实调用路径和测试集。

能力：

- Worker 根据配置决定是否启用 LLM delta。
- LLM 只对已确认项目、长消息、会议纪要、多行动项、复杂计划变更触发。
- LLM 失败自动回退规则 extractor。
- 高风险事件仍默认 `draft`，不能因为 LLM 输出就直接进入 accepted snapshot。

验收：

- 有 mock chatFn 单元测试覆盖 JSON 标准化、高风险确认、source seq、fallback。
- 未配置 LLM 时行为与当前规则 extractor 一致。
- 文档明确成本阈值和触发条件。

### R4：长期记忆引用清理与晋升确认

目标：项目和长期记忆之间不留下不可解释引用。

能力：

- export/preview/delete 中展示 `promotedMemoryNoteId` 和 memory_note links。
- hard delete 时默认只解除项目引用，不删除 Memory Note；提供可扩展的“同时删除”策略设计。
- 晋升长期记忆前展示即将写入的 note 内容和来源。

验收：

- 删除项目不会留下 project link 指向不存在项目。
- 项目级关闭长期记忆晋升后，promotion 按钮禁用，tool/IPC 也拒绝。
- 审计记录包含晋升 noteId 和删除时引用处理策略。

### R5：测试矩阵补齐

优先测试：

- service：LLM delta normalize/fallback、reminder update/resync helper、impact preview 数据结构。
- repository：merge/delete preview、orphan report、reminder update。
- scheduler bridge：create/update/cancel/resync/trigger 状态。
- UI：治理 preview、提醒编辑、隐私开关、完成晋升按钮状态。

验收命令：

```bash
./node_modules/.bin/vitest run test/project-tracking-service.spec.ts test/project-tracking-extractor.spec.ts
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint <changed-files>
```

### R6：Phase H/I 仍保留为后续产品阶段

本轮不把外部生态和项目智能强行塞入 R 阶段：

- Phase H：下一步推荐、健康度、组合视图。
- Phase I：外部日历、任务系统、文档和团队协作 connector。

原因：

- H 依赖 R1-R5 的可信事实源和指标。
- I 需要单独权限、账号、外部失败回滚和隐私设计。

## 1. 下一阶段目标

第一版已经完成端到端闭环。下一阶段重点从“能跑通”转向“可信、可治理、可回归”。

优先级顺序：

1. 质量与测试：先避免回归，并给自动提取加质量边界。
2. 事件确认与治理：让用户能修正系统自动产生的项目状态。
3. 提醒桥接：把 deadline/meeting/follow-up 变成真实 scheduler 任务。
4. LLM 增强：在有质量门控后，再提升复杂项目理解能力。

不建议马上做：

- 默认开启自动识别、自动关联和 prompt 注入。
- 直接自动创建提醒。
- 直接把 LLM 抽取结果写入 accepted 项目事实。
- 在缺少治理 UI 前大规模自动写入事件。

## 2. 阶段总览

| 阶段 | 名称 | 目标 | schema 影响 | 推荐优先级 |
| --- | --- | --- | --- | --- |
| Phase A | 质量状态与测试底座 | 给自动事件加质量边界，补核心测试 | 可能需要 | P0 |
| Phase B | 项目治理 UI 与操作 | 删除、解除关联、合并、拆分、导出 | 可能需要 | P1 |
| Phase C | Scheduler 提醒桥接 | 提醒建议、确认、创建、撤销、状态回写 | 不一定需要 | P1 |
| Phase D | LLM Project Delta | 高质量复杂事件抽取与确认 | 可能需要 | P2 |
| Phase E | 观测、审计与运维 | analytics、审计日志、worker 指标、debug/rebuild 工具 | 可能需要 | P1 |
| Phase F | 隐私与数据生命周期 | 敏感项目、导出/删除完善、长期记忆引用清理 | 可能需要 | P1 |
| Phase G | 完成、复盘与长期记忆晋升 | 完成流程、复盘摘要、Memory Note 晋升控制 | 可能需要 | P2 |
| Phase H | 项目智能与组合视图 | 下一步推荐、风险趋势、跨项目依赖、项目组合面板 | 可能需要 | P3 |
| Phase I | 外部生态协作 | 日历、任务系统、文档和团队协作连接器 | 需要单独设计 | P3 |

## 3. Phase A：质量状态与测试底座

### 3.1 目标

- 自动抽取的事件不能直接污染可信项目状态。
- 核心服务有单元测试，worker/enricher 有集成测试。
- snapshot 归约的关键行为可回归。

### 3.2 任务 A1：项目事件质量状态

当前 `project_events.status` 表示事件生命周期：`active/resolved/superseded/cancelled`。它不表达“这个事件是否经过用户确认”。下一步需要增加质量维度。

建议新增字段：

```ts
quality: 'draft' | 'accepted' | 'rejected';
needsUserConfirmation: boolean;
reviewedAt?: number | null;
reviewedBy?: 'user' | 'agent' | 'system' | null;
```

数据规则：

- worker 自动抽取事件默认 `quality='draft'`。
- agent tool 手动写入事件默认 `quality='accepted'`。
- 用户在项目中心确认后改为 `accepted`。
- rejected 事件不参与 snapshot 归约。
- 高风险事件必须 `needsUserConfirmation=true`：
  - `agreement_reached`
  - `decision_made`
  - `deadline_changed`
  - `status_changed`
  - `reminder_scheduled`

涉及文件：

```text
electron/main/db/schema.ts
electron/main/db/project-tracking-repositories.ts
packages/ai/services/project-tracking-types.ts
packages/ai/services/project-tracking-service.ts
packages/ai/services/project-tracking-extractor.ts
packages/ai/runtime/pi/tools/project-tracking.ts
electron/main/handlers/project-tracking/ipc-main.ts
electron/preload/apis/project-tracking.ts
src/pages/ProjectTrackingPage/index.tsx
```

数据库步骤：

1. 先改 `electron/main/db/schema.ts`。
2. 再执行：

```bash
./node_modules/.bin/drizzle-kit generate
```

验收：

- 自动抽取事件默认进入待确认，不直接污染 snapshot。
- `accepted` 事件参与 snapshot。
- `rejected` 事件不参与 snapshot。
- agent tool 写入的事件可直接作为 accepted。

### 3.3 任务 A2：待确认事件 UI

项目中心新增一个 tab：`待确认`。

展示字段：

- 事件标题、类型、内容。
- 来源 conversationId 和 seq 范围。
- 提取原因或 metadata。
- 置信度、重要度。

操作：

- 接受：`quality -> accepted`，重算 snapshot。
- 编辑后接受：更新 title/content/type/dueAt/eventTime，`quality -> accepted`。
- 拒绝：`quality -> rejected`，重算 snapshot。

涉及文件：

```text
src/pages/ProjectTrackingPage/index.tsx
electron/main/handlers/project-tracking/ipc-main.ts
electron/preload/apis/project-tracking.ts
electron/main/db/project-tracking-repositories.ts
```

验收：

- 项目中心能看到 draft 事件。
- 用户接受后事件进入时间线事实区。
- 用户拒绝后事件不再出现在 snapshot。

### 3.4 任务 A3：核心单元测试

建议测试文件：

```text
packages/ai/services/__tests__/project-tracking-signal.test.ts
packages/ai/services/__tests__/project-tracking-matcher.test.ts
packages/ai/services/__tests__/project-tracking-extractor.test.ts
packages/ai/services/__tests__/project-tracking-service.test.ts
```

覆盖：

- 普通问答不生成项目候选。
- 明确“作为项目跟进”生成候选。
- 多项目相似时不自动关联。
- 已完成任务不再出现在 openTasks。
- deadline 进入 upcomingDates。
- rejected/draft 事件的 snapshot 行为符合质量策略。

验收：

```bash
pnpm test -- project-tracking
./node_modules/.bin/tsc --noEmit
```

如项目当前没有对应 test runner pattern，先按现有测试框架落最近似命令，并在 PR/提交说明中记录。

### 3.5 任务 A4：worker/enricher 集成测试

建议覆盖：

- `AGENT_LOOP_COMPLETE` 后生成 candidate。
- confirm candidate 后创建 project + link。
- linked conversation 后新增“下周开会”，生成 draft meeting event。
- prompt injection 只在 linked 或高置信匹配时出现。
- archived project 不注入。

如果 Electron DB 测试成本过高，可以先做 repository/service 层集成测试，再补 E2E。

## 4. Phase B：项目治理 UI 与操作

### 4.1 目标

让用户能修正项目跟踪系统的错误，而不是只能归档。

### 4.2 任务 B1：解除关联 UI

当前已有 `unlinkConversation` IPC，但项目中心没有直接操作。

实现：

- 项目中心 `关联` tab 中，每个 conversation link 增加解除按钮。
- 解除后刷新 links。
- 如果当前聊天页解除的是当前会话，`ProjectContextBar` 消失。

涉及文件：

```text
src/pages/ProjectTrackingPage/index.tsx
src/pages/ChatPage/components/ProjectContextBar.tsx
```

验收：

- 用户可从项目中心解除 conversation link。
- 解除关联不会删除原始聊天消息。
- 解除后 prompt injection 不再因为该 conversation 注入该项目。

### 4.3 任务 B2：项目软删除与导出

建议先做软删除，不马上硬删除。

方案一：复用 `archived`：

- 增加“归档并隐藏”筛选。
- 导出 JSON 包含 project、snapshot、events、milestones、links、reminderLinks。

方案二：新增字段：

```ts
deletedAt?: number | null;
```

如果采用方案二，需要 schema 迁移。

推荐第一步：

- 先做导出 JSON。
- 继续用 `archived` 作为默认隐藏状态。
- 等合并/拆分设计稳定后再新增 `deletedAt`。

涉及文件：

```text
electron/main/db/project-tracking-repositories.ts
electron/main/handlers/project-tracking/ipc-main.ts
electron/preload/apis/project-tracking.ts
src/pages/ProjectTrackingPage/index.tsx
```

验收：

- 用户能导出项目完整数据。
- 归档项目默认不在 active 列表中突出展示。
- 不做硬删除时不破坏任何原始数据。

### 4.4 任务 B3：合并项目

合并操作：

1. 选择 source project。
2. 选择 target project。
3. 预览将迁移的 events、milestones、links、reminderLinks。
4. 确认后迁移。
5. source project 归档，并在 metadata 记录 mergedIntoProjectId。
6. target project 重算 snapshot。

建议先不改 enum，使用 metadata：

```json
{
  "mergedIntoProjectId": "target_project_id",
  "mergedAt": 1780000000000
}
```

涉及文件：

```text
electron/main/db/project-tracking-repositories.ts
electron/main/handlers/project-tracking/ipc-main.ts
electron/preload/apis/project-tracking.ts
src/pages/ProjectTrackingPage/index.tsx
```

验收：

- source 的 links/events/milestones 能迁移到 target。
- target snapshot 重算正确。
- source 不再主动注入 prompt。
- 合并动作可在项目中心回看。

### 4.5 任务 B4：拆分项目

拆分是更高风险操作，建议在合并之后做。

最小实现：

- 用户创建新项目。
- 从原项目选择 events/links/milestones 迁移。
- 迁移后两个项目分别重算 snapshot。

验收：

- 被迁移事件不再影响原项目 snapshot。
- 新项目获得迁移事件和关联。
- 操作前有预览，防止误拆。

## 5. Phase C：Scheduler 提醒桥接

### 5.1 目标

把项目中的 deadline、meeting、follow-up、stale check 变成可确认、可撤销、可追溯的真实提醒。

### 5.2 任务 C1：Reminder Suggestion 服务

新增：

```text
packages/ai/services/project-tracking-reminder.ts
```

输入：

```ts
interface BuildProjectReminderSuggestionsInput {
  project: TrackedProject;
  snapshot: ProjectSnapshot;
  events: ProjectEvent[];
  now?: number;
}
```

输出：

```ts
interface ProjectReminderSuggestion {
  kind: ProjectReminderKind;
  title: string;
  dueAt: number;
  reason: string;
  sourceEventId?: string;
  needsConfirmation: true;
}
```

规则：

- deadline/meeting 必须有时间。
- 已有 reminder link 的事件不重复建议。
- 过期太久的事件不建议。
- stale project check 需要项目 active 且 openTasks 非空。

### 5.3 任务 C2：Reminder Bridge IPC

新增：

```text
electron/main/handlers/project-tracking/reminder-bridge.ts
```

能力：

- listSuggestions(projectId)
- createReminderFromSuggestion(projectId, suggestion)
- cancelProjectReminder(linkId)
- syncReminderStatus(projectId)

注意：

- 必须走 scheduler 现有 API/handler，不手写独立提醒系统。
- 创建成功后写 `project_reminder_links`。
- 取消后同步 status。

验收：

- 项目中心能看到提醒建议。
- 用户确认后创建 scheduler task。
- reminder link 可回溯到 project event。
- 取消提醒后状态同步。

### 5.4 任务 C3：提醒触发上下文

提醒触发时应携带项目快照，而不是孤立标题。

触发文案结构：

```text
项目提醒：{project.name}
事项：{reminder.title}
时间：{dueAt}
当前项目快照：
- 当前重点：...
- 开放事项：...
- 最近进展：...
```

验收：

- 提醒触发时用户能看到为什么提醒。
- 归档项目的 stale reminder 不再继续触发。

## 6. Phase D：LLM Project Delta 增强

### 6.1 前置条件

必须先完成：

- Phase A 的质量状态。
- 待确认事件 UI。
- 基础测试。

否则 LLM 抽取会扩大错误写入风险。

### 6.2 LLM Extractor Worker

新增内部 agent：

```text
agentId: project-tracking-extraction
```

流程：

1. worker 检测 linked project conversation。
2. 如果消息简单，规则 extractor 处理。
3. 如果消息长、包含会议纪要、多条行动项或多个日期，调用 LLM extractor。
4. LLM 输出 draft events / reminder suggestions / supersede hints。
5. 高风险事件进入待确认 UI。

### 6.3 Prompt 结构

LLM extractor prompt 必须包含：

- 项目当前 goal/summary。
- 当前 snapshot。
- 最近事件列表。
- 本轮新增消息。
- 输出 JSON schema。
- 严格要求 source seq。
- 不允许创造用户未提到的事实。

验收：

- 会议纪要能拆出多个行动项。
- “不用做了/改成 B 方案”能生成 supersede/cancel hint。
- 高风险事件不直接进入 accepted。

## 7. 实施顺序建议

推荐按下面顺序开工：

1. A3/A4：先补测试底座，锁住现有行为。
2. A1：增加事件质量状态。
3. A2：项目中心待确认事件 UI。
4. B1：解除关联 UI。
5. B2：导出项目 JSON，优化归档筛选。
6. C1/C2：提醒建议与 scheduler bridge。
7. B3/B4：合并/拆分项目。
8. D：LLM Project Delta。
9. E：analytics、审计日志、worker 指标、debug/rebuild 工具。
10. F：敏感项目策略、删除/导出完善、长期记忆引用清理。
11. G：项目完成流程、复盘摘要、长期记忆晋升确认。
12. H：下一步推荐、项目健康度、组合视图。
13. I：外部日历、任务系统、文档和团队协作连接器。

原因：

- 测试先行能保护后续 schema/UI 改动。
- 质量状态是 LLM 和提醒自动化的安全前提。
- 治理能力要早于强自动化。
- LLM 增强要放在质量状态、治理 UI 和提醒确认路径之后，避免把不可控输出直接注入项目状态。
- 观测、隐私和数据生命周期要在扩大自动化使用前补齐，否则长期运行后错误成本会累积。
- 项目智能和外部生态协作依赖前面已经建立的可信项目事实源，不应提前做。

## 8. Phase E：观测、审计与运维

### 8.1 目标

让系统能回答“为什么创建/关联/抽取/注入了这个项目状态”，并能长期观测质量。

### 8.2 任务 E1：Analytics 事件

建议覆盖：

- `project_candidate_generated`
- `project_candidate_confirmed`
- `project_candidate_dismissed`
- `project_auto_link_suggested`
- `project_auto_link_created`
- `project_link_removed`
- `project_event_extracted`
- `project_event_reviewed`
- `project_snapshot_rebuilt`
- `project_prompt_context_injected`
- `project_reminder_suggested`
- `project_reminder_created`
- `project_reminder_cancelled`
- `project_merged`
- `project_split`
- `project_exported`
- `project_deleted`
- `project_extraction_error`

验收：

- 每个自动动作都有对应 analytics 或 structured log。
- 能按 projectId / conversationId 追踪一次项目状态变化。
- worker 失败只记录错误，不阻塞聊天主链路。

### 8.3 任务 E2：审计日志

新增或复用审计存储，记录：

- 创建、编辑、归档、删除项目。
- 接受、编辑接受、拒绝事件。
- 解除、自动创建、手动创建 link。
- 合并、拆分项目。
- 创建、取消 scheduler reminder。
- 导出项目数据。

建议数据字段：

```ts
interface ProjectAuditLog {
  id: string;
  projectId: string;
  action: string;
  actor: 'user' | 'agent' | 'system';
  targetType: 'project' | 'event' | 'link' | 'milestone' | 'reminder' | 'snapshot';
  targetId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  createdAt: number;
}
```

涉及 schema 时必须先改 schema，再 `db:generate`。

验收：

- 项目中心能查看关键治理操作历史。
- 合并、拆分、删除前后有可追踪记录。
- 审计日志不会进入 prompt 注入正文，只用于治理和调试。

### 8.4 任务 E3：Debug 与 Rebuild 工具

能力：

- rebuildProjectSnapshot(projectId)
- inspectProjectSignals(conversationId)
- inspectProjectLinks(projectId)
- clearTestProjectData(projectId)
- dryRunMergeProjects(sourceProjectId, targetProjectId)
- dryRunDeleteProject(projectId)

验收：

- 开发者能定位误候选、误关联、误抽取和 snapshot 不一致。
- 所有 destructive 操作都有 dry-run 或确认。

## 9. Phase F：隐私与数据生命周期

### 9.1 目标

让用户能控制项目数据如何保存、注入、导出、删除和与长期记忆关联。

### 9.2 任务 F1：敏感项目策略

项目增加敏感标记和项目级自动化设置：

```ts
interface ProjectPrivacySettings {
  sensitive: boolean;
  allowPromptInjection: boolean;
  allowAutoLinking: boolean;
  allowReminderSuggestions: boolean;
  allowLongTermMemoryPromotion: boolean;
}
```

默认策略：

- 敏感项目不自动注入，除非用户开启。
- 敏感项目的高风险事件全部进入 draft。
- 敏感项目不自动创建提醒，只生成可确认 suggestion。

验收：

- 用户能在项目详情中打开/关闭项目级自动化。
- 关闭 prompt 注入后，相关项目不再进入 `ProjectContextEnricher`。

### 9.3 任务 F2：删除、导出与恢复

补齐：

- exportProjectData(projectId)
- softDeleteProject(projectId)
- restoreProject(projectId)
- hardDeleteProject(projectId)
- previewProjectDeletion(projectId)

删除预览必须展示影响范围：

- project
- events
- milestones
- links
- reminder links
- audit logs
- scheduler tasks
- 已晋升长期记忆引用

验收：

- 用户能导出完整项目数据。
- soft delete 后停止抽取、关联、注入和提醒建议。
- hard delete 前有影响预览。
- 删除不会留下 orphan prompt injection、orphan reminder link 或不可解释 snapshot。

### 9.4 任务 F3：长期记忆引用清理

如果项目事件或复盘已晋升为 Memory Note，需要保存引用关系。

验收：

- 删除项目时能提示相关长期记忆。
- 用户可选择保留长期记忆、取消项目引用或一起删除。
- 项目关闭长期记忆晋升后，不再产生新的 Memory Note 候选。

## 10. Phase G：完成、复盘与长期记忆晋升

### 10.1 目标

项目不应永远停留在 active。完成后应该形成结果、经验和遗留事项的可控沉淀。

### 10.2 任务 G1：项目完成流程

能力：

- markProjectCompleted(projectId)
- reopenProject(projectId)
- archiveCompletedProject(projectId)
- generateCompletionSummary(projectId)

完成流程展示：

- 达成目标。
- 已完成里程碑。
- 未完成遗留事项。
- 关键决策和协议。
- 风险与阻塞如何解决。
- 是否建议晋升长期记忆。

验收：

- completed 项目默认不自动关联新会话，除非用户显式继续。
- completed 项目不再生成 stale reminder。
- 用户可以重新打开项目。

### 10.3 任务 G2：复盘摘要

复盘摘要来源：

- accepted events。
- completed milestones。
- 用户手动补充。
- agent tool 明确记录。

验收：

- 复盘摘要不包含 draft/rejected 事件。
- 用户能编辑复盘摘要。
- 复盘摘要可以导出。

### 10.4 任务 G3：长期记忆晋升控制

晋升候选类型：

- 项目目标和长期方向。
- 高价值稳定决策。
- 用户偏好或工作方式。
- 完成复盘结论。

验收：

- 晋升前展示候选内容和来源。
- 用户确认后才写入长期记忆。
- 用户关闭项目级晋升后不再提示。

## 11. Phase H：项目智能与组合视图

### 11.1 目标

在可信项目事实源之上，提供真正有用的项目推进建议，而不是根据未确认内容做推断。

### 11.2 任务 H1：下一步推荐

推荐来源：

- 临近 deadline。
- 长时间未推进的 open tasks。
- 阻塞事项。
- 未审核事件。
- 用户明确目标和项目状态。

验收：

- 推荐必须标注依据。
- 推荐不把 draft 当作用户承诺。
- 用户能 dismiss 推荐，dismiss 反馈进入降噪策略。

### 11.3 任务 H2：项目健康度

健康度信号：

- 逾期事项数量。
- 阻塞持续时间。
- 最近活跃时间。
- 未确认事件数量。
- 里程碑完成进度。

验收：

- 健康度只作为提示，不替代事实状态。
- 项目中心能按风险或活跃度筛选。

### 11.4 任务 H3：项目组合视图

能力：

- 全部 active 项目的开放事项概览。
- 本周关键时间点。
- 阻塞项目列表。
- 待确认队列聚合。
- 即将触发提醒。

验收：

- 用户能从组合视图进入单个项目治理。
- 组合视图不把 archived/deleted 项目混入 active 工作流。

## 12. Phase I：外部生态协作

### 12.1 目标

把 Chobits 内部项目状态和外部系统连接起来，但不能牺牲权限和可撤销性。

### 12.2 外部连接器候选

| 连接器 | 可能能力 | 前置条件 |
| --- | --- | --- |
| Calendar | 项目会议、deadline、follow-up 同步 | scheduler bridge 稳定 |
| Task app | open tasks 同步为外部任务 | 事件质量状态和治理稳定 |
| Docs | 从项目文档抽取计划和决策 | LLM extractor 和来源引用稳定 |
| Team collaboration | 分享项目摘要或提醒 | 多用户权限模型另行设计 |

验收：

- 外部写操作必须由用户确认。
- 每个外部对象都保存 sync state 和撤销路径。
- 外部系统错误不破坏本地项目事实源。

## 13. 每阶段验证命令

通用：

```bash
./node_modules/.bin/tsc --noEmit
```

涉及 schema：

```bash
./node_modules/.bin/drizzle-kit generate
```

目标 lint：

```bash
./node_modules/.bin/eslint <changed-files>
```

测试：

```bash
pnpm test -- project-tracking
```

如果现有 test runner 不支持该 pattern，需要在实际实施时按项目已有测试脚本调整，并在提交说明中记录。

按 phase 补充：

| Phase | 额外验证 |
| --- | --- |
| A | draft/accepted/rejected snapshot 行为测试，待确认 UI 操作测试 |
| B | 解除、导出、合并、拆分后的 orphan 检查和 snapshot 重建 |
| C | scheduler task 创建、取消、触发上下文和状态回写测试 |
| D | LLM 抽取 JSON schema、source seq、prompt injection 防护和高风险确认测试 |
| E | analytics/audit log 事件覆盖测试，worker 错误隔离测试 |
| F | 导出、软删除、恢复、硬删除 dry-run、长期记忆引用清理测试 |
| G | 完成、重开、复盘摘要、长期记忆晋升确认测试 |
| H | 推荐依据、dismiss 降噪、组合视图筛选测试 |
| I | 外部连接器权限、sync state、失败回滚测试 |

## 14. 近期开发建议从哪里开始

建议下一次直接从 Phase A 开始：

1. 先补 `project-tracking-service`、`signal`、`matcher`、`extractor` 单元测试。
2. 再给 `project_events` 增加质量字段。
3. 然后把项目中心扩展出“待确认事件” tab。

这是近期最稳的入口：它先把自动项目记忆变得可控、可回归。完成 Phase A 后，不要直接宣称项目跟踪完善；应继续推进 Phase B/C/E/F，让治理、提醒、观测和数据生命周期跟上，再进入更强的 LLM 和项目智能能力。

## 15. 实施覆盖检查清单

每次实现完成后，都要更新或检查：

- [ ] 是否更新了完整蓝图中的当前完成度映射。
- [ ] 是否更新了主设计文档的完成情况。
- [ ] 是否补充了风险文档中的新增风险或已缓解风险。
- [ ] 是否按 schema -> `db:generate` 顺序处理数据库变更。
- [ ] 是否有对应测试或明确记录暂缺测试的原因。
- [ ] 是否保留用户确认、撤销、导出或删除路径。
- [ ] 是否避免 draft/低置信内容进入事实快照和 prompt 注入。
- [ ] 是否有 analytics、审计或 debug 路径解释系统行为。
