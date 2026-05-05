# 主进程统一调度系统规划

## 背景

现在系统里至少有三套“到点触发动作”的机制：

1. 精灵自主行为：`packages/sprite-core/behavior-engine.ts`
2. 日常关心模式：`electron/main/daily/*`
3. 工作流自动化：`electron/main/handlers/automation/*` 与 `electron/main/handlers/scheduler.ts`

它们都在主进程链路里运行或被主进程驱动，但各自维护时间、冷却、幂等、启停和执行记录。继续分别修补会让行为越来越散：自动行走、日常提醒、工作流 cron 都会有自己的计时器、自己的跳过逻辑、自己的恢复策略。

目标不是把业务都塞进同一个类里，而是做一个主进程的统一调度基础设施：时间与触发统一，业务判断与执行仍留在各自领域服务里。

## 当前实现结论

### 精灵自主行为

`BehaviorDefinition.schedule` 已经定义了 `interval`、`random`、`cron-like`，并带有条件、概率、冷却、每日上限、状态约束、等级和好感度约束。

当前 Electron main 会在 `initSpriteManagerIPC()` 中把 `getMainSchedulerService()` 注入 `SpriteManager`，因此默认行为会注册为 `sprite.behavior:*` scheduler jobs。scheduler 到点后调用 `BehaviorEngine.tryRunBehavior(id, { ignoreSchedule: true, force: context.force === true })`；普通唤醒仍由 `BehaviorEngine` 判断行为条件、概率、状态、等级、冷却、每日上限，调度中心强制触发则额外绕过条件、概率和时间窗口这类 due 过滤。

`BehaviorEngine.start()` 的 legacy polling 仍保留给测试或非 Electron main 注入场景；在主应用里，有 scheduler 注入时不再启动这套全局轮询。日志里的：

```text
behavior triggered: ❤❤❤❤❤ 自动行走 ❤❤❤❤❤
behavior completed: ❤❤❤❤❤ 自动行走 ❤❤❤❤❤
```

是主进程里的 `BehaviorEngine` 打出来的，不是 renderer 定时器。renderer 只是通过 IPC 上报 click、hover、context-menu 等交互。

右键菜单处理已经进入 scheduler admission：`AssistantMenuPage` 打开菜单时上报 `sprite.interact('context-menu', { open: true })`，`SpriteManager.reportInteraction()` 将 `context-menu` 放入 `movementSuspensionReasons`，自动行走 job 的 `sprite.canAutoMove` gate 会返回 `movement-suspended`，不会触发行走。

### 日常关心模式

`DailyCareService` 是 Electron main 单例，由 `initDailyCare()` 创建。当前它不再维护全局 `setInterval`，而是在 `start()` 后把 routine 注册到 `MainSchedulerService`：

- interval routine 注册为每分钟唤醒一次，再由 daily-care 自己判断具体分钟间隔、active window、oncePerDay、snooze。
- fixed routine 转成 cron，例如 `09:15` -> `15 9 * * *`。
- calendar routine 转成每日 cron 唤醒，具体日期、提前提醒、年度重复仍由 daily-care 语义判断。
- 系统 idle、resume/unlock 冷却、persistent notice、daily-care 到 Sprite Purpose 的桥接仍保留在 `DailyCareService`。

`MINUTE` 已恢复为真实 `60 * 1000`。如果后续需要开发加速，应单独做 dev timeScale，而不是混在业务分钟语义里。

### 工作流自动化

工作流自动化现在通过 `electron/main/handlers/scheduler.ts` 作为 automation adapter 接入 `MainSchedulerService`：

- 启动时读取 enabled automation rules。
- schedule rule 注册为 `cron` job。
- manual/resource_event/system_event rule 注册为无排期的 `manual` / `event` job，调度中心可见但 `active=false`。
- cron、manual、resource_event、system_event 都通过 scheduler handler 进入 `executeAutomationRule()`，从而统一 owner pause、并发控制、runtime state 和 audit log。

`automation:create/update/delete/toggle` 仍调用 `scheduleRule/unscheduleRule` 这个兼容命名的 adapter API，但内部已经先 remove 旧 job，再按新 triggerType upsert 新 job，因此 disabled 或 triggerType 改变不会留下旧 cron job。

## 设计原则

1. 调度必须在 Electron main process 里运行，renderer 只负责配置和交互事件上报。
2. 统一“什么时候触发”，不统一“业务应该做什么”。
3. `BehaviorEngine` 不消失，它保留行为条件、概率、冷却、状态约束等领域判断；只是把“每秒全量扫描”迁到统一调度器按 job 唤醒。
4. `DailyCareService` 不消失，它保留消息模板、snooze、persistent notice、routine 状态和 daily-care purpose bridge；只是把“30 秒轮询”迁到统一调度器按 routine 唤醒。
5. 工作流自动化保留 `automation_rules` 作为规则来源；统一调度器接管 schedule 注册、启停、并发和审计。
6. `node-schedule` 可以作为 cron/date 的底层引擎，但不能直接散落在业务模块里。业务只注册 `ScheduleSpec`，底层库由 `MainSchedulerService` 包装。
7. Purpose/Routine 仍是“触发后的角色表现编排”，不是调度系统。Scheduler 决定到点；Behavior/DailyCare/Automation 决定是否执行；Purpose/Routine 决定角色怎么表现。

## 目标架构

```mermaid
flowchart TD
  Renderer["Renderer 配置/交互"] --> IPC["IPC handlers"]
  IPC --> MainScheduler["MainSchedulerService"]

  MainScheduler --> Engine["node-schedule + one-shot date jobs"]
  MainScheduler --> State["SchedulerStateStore"]
  MainScheduler --> Runtime["Run Queue / Admission / Audit"]

  SpriteAdapter["SpriteBehaviorSchedulerAdapter"] --> MainScheduler
  DailyCareAdapter["DailyCareSchedulerAdapter"] --> MainScheduler
  AutomationAdapter["WorkflowAutomationSchedulerAdapter"] --> MainScheduler

  MainScheduler --> SpriteBehavior["BehaviorEngine.tryRun"]
  MainScheduler --> DailyCare["DailyCareService.dispatchDueRoutine"]
  MainScheduler --> AutomationExec["runAutomationRule / executeAutomationRule"]

  DailyCare --> Purpose["SpritePurposeManager"]
  SpriteBehavior --> Purpose
  AutomationExec --> Workflow["WorkflowEngine"]
  Workflow --> Purpose
```

## 核心模块

### MainSchedulerService

建议路径：`electron/main/scheduler/`

职责：

- 注册、更新、移除调度 job
- 把不同 schedule 类型转换到底层 `node-schedule` 或一次性 Date job
- 统一处理 enabled、job pause、owner pause、cooldown、dailyLimit、singleton、maxConcurrent
- 统一执行记录、错误日志和 audit log
- 提供 IPC 查询和控制调度状态，支撑“调度中心”界面

尚未统一到 scheduler 核心的职责：

- app 启动依赖、workflow ready、sprite runtime ready 等 dependency gate
- 休眠、唤醒、锁屏、解锁这类生命周期信号的统一调度策略
- retry/backoff、coalesce、interval window/daysOfWeek 的核心执行语义

不负责：

- 不决定精灵该不该自动走
- 不决定日常关心提醒文案
- 不解析工作流节点
- 不替代 Sprite Purpose/Routine

### ScheduleSpec

当前已经落地的 schedule DSL 是：

```ts
type ScheduleSpec =
  | { kind: 'cron'; expression: string; timezone?: string }
  | { kind: 'date'; at: number; timezone?: string }
  | { kind: 'interval'; everyMs: number; window?: TimeWindow; daysOfWeek?: number[] }
  | { kind: 'randomInterval'; minMs: number; maxMs: number; window?: TimeWindow; daysOfWeek?: number[] }
  | { kind: 'event'; eventType: string }
  | { kind: 'manual' };
```

注意：`fixedTime` 和 `calendar` 没有进入 scheduler 核心 DSL，而是在 daily-care adapter 层转换成 cron 唤醒；日期语义仍留在 daily-care 内部。这个边界更清晰，也避免 scheduler 变成业务日历引擎。

映射关系：

| 现有系统 | 当前字段 | 目标 ScheduleSpec |
| --- | --- | --- |
| BehaviorEngine | `schedule.type = interval` | `interval` |
| BehaviorEngine | `schedule.type = random` | `randomInterval` |
| BehaviorEngine | `schedule.type = cron-like` | 暂未正式映射；当前 adapter 会按 interval 兜底 |
| DailyCare | `RoutineSchedule.interval` | `interval` |
| DailyCare | `RoutineSchedule.fixed` | adapter 转成 `cron` |
| DailyCare | `RoutineSchedule.calendar` | adapter 转成每日 `cron`，业务日期仍由 daily-care 判断 |
| Automation | `triggerConfig.cron` | `cron` |
| Automation | `resource_event/system_event/manual` | `event` / `manual` |

### SchedulerJobDefinition

```ts
interface SchedulerJobDefinition<TPayload = unknown> {
  id: string;
  owner: 'sprite.behavior' | 'dailyCare' | 'automation' | string;
  name: string;
  enabled: boolean;
  schedule: ScheduleSpec;
  payload: TPayload;
  runPolicy?: {
    singletonKey?: string;
    cooldownMs?: number;
    dailyLimit?: number;
    maxConcurrent?: number;
    misfire?: 'skip' | 'run-once' | 'catch-up';
    retry?: { maxAttempts: number; backoffMs: number };
  };
  admission?: {
    customGate?: string;
  };
}
```

`customGate` 不直接序列化函数。业务 adapter 在注册时绑定 gate handler。当前已落地的 gate 包括：

- `sprite.canAutoMove`
- `dailyCare.canDispatch`

workflow/sprite runtime ready 这类依赖 gate 尚未进入 scheduler 核心，仍列在未完成清单里。

### SchedulerStateStore

调度定义仍由业务模块持有：

- sprite behavior 定义在 code/角色配置里
- daily-care 定义在 constants 和 daily-care json 里
- automation rule 定义在 `automation_rules` 表里

Scheduler 只持久化运行态：

```ts
interface SchedulerRuntimeState {
  jobId: string;
  owner: string;
  enabled: boolean;
  lastRunAt?: number;
  nextRunAt?: number;
  lastFinishedAt?: number;
  lastStatus?: 'success' | 'skipped' | 'failed';
  lastSkipReason?: string;
  dailyRunCount?: number;
  dailyResetDate?: string;
  consecutiveFailures?: number;
  updatedAt: number;
}
```

第一阶段可以放在 `app.getPath('userData')/scheduler-state.json`，避免和工作空间 DB 生命周期纠缠。后续如果要做调度中心、运行历史、跨空间自动化审计，再迁到 SQLite 表。

## 三条业务线如何接入

### 1. SpriteBehaviorSchedulerAdapter

目标不是删除 `BehaviorEngine`，而是让它不再拥有自己的全局 `setInterval`。

迁移后：

1. `registerDefaultBehaviors(mgr)` 仍注册行为定义。
2. `BehaviorEngine.register()` 只保存定义和运行态。
3. adapter 为每个 behavior 注册一个 scheduler job。
4. 到点后 scheduler 调用 `behaviorEngine.tryRunBehavior(id, { ignoreSchedule: true, force })`。
5. 普通唤醒时 `tryRunBehavior()` 内部继续执行原来的条件、概率、状态、等级、冷却、dailyLimit 检查；强制触发只绕过 due 过滤，不绕过核心安全约束。

自动行走的统一准入：

- capability `movement` 必须解锁，当前已降到 1 级
- `autoWalkEnabled === true`
- sprite state 允许 idle/bored
- `movementSuspensionReasons` 为空
- 右键菜单打开时 `movementSuspensionReasons` 包含 `context-menu`，`sprite.canAutoMove` gate 返回 `movement-suspended`，job 被 skip，不产生行走

这样“右键菜单展开时不要自由行走”不再是自动行走行为的特殊补丁，而是所有移动类行为共享的准入规则。

### 2. DailyCareSchedulerAdapter

`DailyCareService` 保留 routine 状态和 dispatch 逻辑，但移除全局 tick：

1. `rebuildRuntimes()` 后为每个 enabled routine 注册 scheduler job。
2. interval/fixed/calendar 转换为 ScheduleSpec。
3. 到点后 scheduler 调用 `dispatchRoutineByIdIfDue(routineId, triggeredAt)`；调度中心强制触发时调用 `triggerRoutineById(routineId)`。
4. 普通唤醒时 `DailyCareService` 继续检查 snooze、idle、resume cooldown、oncePerDay、lastTriggeredOn。
5. dispatch 后继续发 notice，并通过 existing bridge 转成 Sprite Purpose。

关键变化：

- 不再用 30 秒轮询所有 routine。
- fixed/calendar 可以精确注册下一次时间。
- interval 可显式选择是否 align。
- `MINUTE` 已恢复为真实 `60 * 1000`；后续如需开发加速，应单独引入 `timeScale`。

### 3. WorkflowAutomationSchedulerAdapter

当前 `electron/main/handlers/scheduler.ts` 已作为 automation adapter 接入：

1. 启动时读取 `automation_rules`。
2. schedule rule 注册为 `cron` job。
3. resource/system/manual 不一定有时间表，但也通过统一 `runAutomationRule()` / `executeAutomationRule()` 执行，保证并发、日志和错误处理一致。
4. create/update/delete/toggle 时调用 scheduler registry 的 `upsert/remove`，先取消旧 job，再按新配置注册。
5. rule disabled 或 triggerType 改变时必须取消旧 job。

这样工作流自动化的“定时触发”和“事件触发”不再分裂成两套执行路径。

## 主进程生命周期

目标启动顺序：

1. App ready 后初始化数据库、协议、窗口基础能力。
2. 创建 `MainSchedulerService`，但先处于 paused/booting 状态。
3. 初始化 workflow engine，保证 scheduled workflow 能执行。
4. 初始化 IPC handlers，并把 scheduler 注入 daily-care、automation、sprite manager 初始化链路。
5. 各 adapter 注册 job。
6. scheduler `start()`，计算 nextRunAt 并激活底层 jobs。
7. renderer ready 后发 `APP_STARTED`，system_event automation 也通过统一 executor 触发。

当前代码尚未实现 scheduler 级 booting/dependency gate。后续如果调整 `createWindow()` 内部的 handler 初始化顺序，可以做过渡方案：

- `MainSchedulerService` 先全局初始化。
- `DailyCareService` 和 automation handler 先注册 definition。
- `initWorkflowSystem()` 完成后调用 `scheduler.markDependencyReady('workflow')`。
- 依赖 workflow 的 job 在依赖 ready 前只登记不运行。

## 错过触发与恢复策略

不同业务默认策略不同：

| 业务 | App 关闭期间错过 | 休眠/锁屏后恢复 | 系统 idle |
| --- | --- | --- | --- |
| 自动行走/idle 小动作 | skip | skip 到下一次随机时间 | skip |
| 普通 daily-care | 默认 skip | resume cooldown 后 run-once 可选 | skip |
| urgent/nightGuard | run-once 可选 | 可绕过普通 cooldown | allow |
| workflow cron | 默认 skip | 下一次 cron | 不关心 idle |
| 用户手动触发 | 立即执行 | 立即执行 | 不关心 idle |

调度器只做通用 misfire 策略；具体要不要补一次由 job policy 配置。

## 与前面几个体验问题的关系

1. 自由移动 1 级解锁：这是 capability 定义问题，不应由 scheduler 决定等级。scheduler 只读取 capability runtime 的结果做准入。
2. 右键菜单打开不自由行走：这是 scheduler admission 的典型场景。context-menu open 进入 `movementSuspensionReasons`，移动类 job 到点时 skip。

## 分阶段实施

### Phase 0：补齐安全修复（已完成）

- 修复 automation rule disabled/type change 后旧 cron job 不取消的问题。
- 明确 daily-care `MINUTE = 30 * 1000` 是否是调试倍率；如果不是，改成真实分钟。
- 给 `BehaviorEngine` 增加 `tryRunBehavior(id, options?)`，先复用现有 tick 内部逻辑。

### Phase 1：建立主进程调度基础设施（已完成）

- 新增 `electron/main/scheduler/`
- 封装 `node-schedule`
- 支持 `cron`、`date`、`interval`、`randomInterval`
- 支持 upsert/remove/start/stop/status
- 支持 `scheduler-state.json`
- 新增基础测试：注册、更新、取消、disabled、random reschedule、cron invalid

### Phase 2：迁移工作流自动化（已完成）

- 将 `electron/main/handlers/scheduler.ts` 改为 adapter 或删除旧 jobs map。
- `automation:create/update/delete/toggle` 走 scheduler registry。
- 统一 `runAutomationRule()` / `executeAutomationRule()`，manual/resource/system/schedule 共用。
- 加测试覆盖 disabled 后不再触发。

### Phase 3：迁移 daily-care（已完成）

- `DailyCareService.start()` 不再创建全局 interval。
- `rebuildRuntimes()` 后 upsert routine jobs，并在设置/自定义提醒变更后重建注册。
- 到点后由 `MainSchedulerService` 通过 `dailyCare` owner handler 触发原有 dispatch 逻辑。
- 保留 daily-care storage 和 IPC API。
- 已修复真实分钟语义；后续如需要开发加速，应单独引入 dev timeScale。

当前实现说明：

- interval routine 由主进程 scheduler 每分钟唤醒对应 routine，再由 `DailyCareService` 检查原有 interval、active window、snooze、idle、resume cooldown 与 oncePerDay 规则。
- fixed routine 映射为 cron job，例如 `09:15` 映射为 `15 9 * * *`。
- calendar routine 映射为每日一次的 cron 唤醒，实际是否命中日期仍由 daily-care 的 calendar 语义判断，避免把节日、生日、提前提醒等业务规则塞进 scheduler。
- automation 与 daily-care 现在共用同一个 `MainSchedulerService` 单例，scheduler 仍只负责时间、注册、准入和运行态。

### Phase 4：迁移 sprite behavior（已完成）

- `BehaviorEngine.start()` 保留 legacy polling；`SpriteManager` 注入主进程 scheduler 时改走 scheduler mode。
- `SpriteManager` 将所有默认 behavior 注册为 `sprite.behavior:*` jobs。
- 自动行走、idle-action、emotion、ambient、seasonal 等都由 scheduler 唤醒，再由 `BehaviorEngine.tryRunBehavior()` 做领域判断。
- 自动行走使用 `sprite.canAutoMove` gate，右键菜单打开、movement capability 锁定、自动行走关闭或窗口控制器不可用时直接 skip。

当前实现说明：

- `sprite-core` 只定义 scheduler 抽象接口，由 Electron main 的 `getMainSchedulerService()` 注入，避免业务包反向依赖 Electron scheduler 实现。
- scheduler 负责唤醒行为 job；行为是否满足状态、idle、概率、每日上限、冷却、等级等条件仍由 `BehaviorEngine` 判断。
- 没有注入 scheduler 的测试或非 Electron 场景仍保留 `BehaviorEngine.start()` 轮询模式，方便低耦合使用。

### Phase 5：可视化和运维（基础已完成，运维增强继续推进）

- 增加主进程 IPC：`scheduler:listJobs`、`scheduler:getJob`、`scheduler:getRuntimeState`、`scheduler:triggerNow`。
- 增加主进程控制 IPC：`scheduler:pauseJob`、`scheduler:resumeJob`、`scheduler:pauseOwner`、`scheduler:resumeOwner`、`scheduler:getOwnerPauseState`。
- 增加主进程历史 IPC：`scheduler:listAuditLog`、`scheduler:cleanupAuditLog`。
- 增加主进程事件推送：`scheduler:updated`，用于通知 renderer 刷新调度中心状态。
- 扩展设置页增加“调度中心”，展示 job、nextRunAt、lastStatus、skipReason、owner pause state 与 audit log。
- 将运行历史从 state 扩展为 audit log。

当前实现说明：

- scheduler handler 可以显式返回 `success` / `skipped` / `failed`，业务内部不满足条件时不会再被误记为成功。
- IPC 返回的 job snapshot 会隐藏 payload，避免把 automation rule inputs 等业务负载直接暴露给调试页面。
- `triggerNow(id)` 走同一套 admission + handler + runtime state 记录，因此可以用于统一调试 automation、daily-care 与 sprite behavior；它表示“按规则触发一次”。
- `triggerNow(id, { force: true })` 表示“强制触发一次”：scheduler 会绕过 `customGate`，但仍保留 disabled、job/owner pause、dailyLimit、cooldown、maxConcurrent、singleton 等调度安全检查；audit log 会记录 `force: true`。
- 对 daily-care 来说，普通立即触发仍会经过 `dailyCare.canDispatch` gate 和 `DailyCareService.shouldTrigger()`。因此在当前分钟不命中 fixed time、interval 未到间隔、active window 不匹配、snooze/oncePerDay 命中等场景下，最近结果会显示 `skipped`，并带有 `fixed-time-not-matched`、`interval-not-elapsed`、`outside-active-window`、`snoozed` 等细粒度原因。这说明 scheduler 正常唤醒并记录了业务拒绝，而不是 job 没有排期。
- daily-care 的强制触发由 adapter 显式处理：handler 收到 `context.force` 后调用 `triggerRoutineById()`，用于调试“无视 due gate 立即发一条提醒”的路径。
- sprite behavior 的强制触发由 adapter 显式传给 `BehaviorEngine.tryRunBehavior({ force: true })`：会绕过行为层的条件、概率、时间窗口等 due 过滤，但仍保留 disabled、already-running、状态约束、冷却和每日上限等安全检查。
- 单个 job 支持 paused runtime state，暂停后取消当前排期，恢复后按 scheduler 统一重新排期。
- owner 级暂停支持阻断某个业务域，例如一次性暂停 `sprite.behavior` 下所有自由行为；该状态已写入 `scheduler-state.json`，应用重启后仍会恢复。
- audit log 记录 run/control 事件，包含 trigger、force、status、reason/error、开始/结束时间和 job 元信息，不记录 payload。
- audit log 使用按天 JSONL 文件，默认保留 30 天且最多保留 60 个文件，写入与 scheduler 初始化时都会执行清理。
- renderer 通过 `window.YUA.scheduler` 访问主进程调度 IPC；调度中心只消费 sanitized snapshot，不接触 job payload。
- renderer 通过 `window.YUA.scheduler.onUpdated()` 订阅 `scheduler:updated`，调度状态变化时自动刷新；不再依赖固定 5 秒轮询。

调度中心当前已经具备：

- jobs 列表：展示 owner、job id、active/paused、nextRunAt、lastStatus、lastSkipReason/lastError。
- owner 控制：支持暂停/恢复某个 owner，并持久化 owner pause state。
- job 控制：支持单 job 暂停/恢复、按当前 admission 规则触发一次、强制绕过业务 gate 触发一次。
- job 详情：支持弹窗查看脱敏后的 schedule、runPolicy、admission、runtime 摘要，以及该 job 最近 12 条 audit log。
- 自动刷新：调度中心支持主进程事件推送刷新，也保留手动刷新入口。
- 历史审计：支持按 owner、job、eventType、status、时间范围过滤 run/control 记录，并支持导出当前结果。
- 历史清理：支持从 UI 输入保留天数和最大文件数，再调用 `cleanupAuditLog({ retentionDays, maxFiles })` 清理过期 JSONL 文件。

调度中心仍可增强：

- Phase 5 当前已覆盖调度中心主要运维能力；后续增强可转向更大的调度核心议题，例如 lifecycle/dependency gate、统一电源事件策略、retry/backoff 或 SQLite 存储演进。

## 当前未完成清单

1. Scheduler lifecycle/dependency gate：目前 workflow 初始化在 scheduler 初始化前完成，但 scheduler 没有显式的 `workflow-ready`、`sprite-ready`、`booting-paused` 状态。后续需要把依赖状态变成 scheduler admission 的一部分。
2. 统一休眠/恢复策略：daily-care 仍直接监听 Electron `powerMonitor` 处理 resume/suspend/lock/unlock。后续应让 scheduler 接收这些生命周期事件，业务只提供自己的 skip/run-once 策略。
3. Retry/backoff：`SchedulerRunPolicy.retry` 已在类型层预留，但 `MainSchedulerService.runEntry()` 目前只记录失败，不执行重试。
4. Interval window/daysOfWeek：`interval` 和 `randomInterval` 类型上已有 `window`、`daysOfWeek`，但核心调度目前只按间隔计算下一次运行。daily-care 的 active window 仍在业务 gate 中判断。
5. Behavior `cron-like`：默认 sprite behavior 当前主要使用 interval/random；`cron-like` 尚未正式映射到 scheduler cron，需要后续决定弃用还是转换。
6. 更长期的存储演进：当前运行态和 audit log 存在 userData JSON/JSONL。若要跨 workspace 查询、做长期统计或更强审计，需要迁移到 SQLite。

## 测试策略

- Scheduler unit tests：fake clock、invalid cron、update cancellation、random interval bounds、misfire policy。
- Automation integration tests：创建 schedule rule、禁用 rule、修改 triggerType、删除 rule。
- DailyCare tests：interval/fixed/calendar、snooze、oncePerDay、idle skip、resume cooldown。
- Sprite behavior tests：condition false skip、probability 0 skip、dailyLimit、movement suspended skip。
- Main-process boundary tests：确保 adapter 只在 Electron main 初始化，不从 renderer 直接创建 scheduler。
- Phase 5 运维测试：覆盖 `triggerNow({ force: true })` 绕过 custom gate 并写入 audit、`scheduler:cleanupAuditLog` IPC 透传、`scheduler:updated` 事件推送、daily-care 普通触发与强制触发语义拆分、sprite behavior force 过滤语义、audit log 保留 `force` 标记。

## 最终判断

可以统一，但统一点应该是“主进程调度基础设施”，不是把 `BehaviorEngine`、`DailyCareService` 和 `AutomationRules` 合并成一个巨大业务引擎。

这套方案会让三个方向共享：

- 同一套主进程调度入口
- 同一套注册、更新、取消、状态查询
- 同一套底层 `node-schedule` 包装
- 同一套 pause/admission/misfire/concurrency 规则

同时保留三个方向各自最重要的领域能力：

- BehaviorEngine 保留精灵行为判断
- DailyCare 保留关怀语义和提醒状态
- Automation 保留规则配置和工作流执行
