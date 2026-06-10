# Sprite Purpose/Routine 完整实施方案

> 状态：Phase 1-8 基础闭环已完成；受限 AI planner 默认关闭；剩余为真实 provider 手动冒烟、体验打磨与产品化 backlog。
> 日期：2026-05-03
> 前置文档：[sprite-purpose-routine-orchestration-plan.md](./sprite-purpose-routine-orchestration-plan.md)

## 0. 当前实施进度

截至 2026-05-03，Purpose/Routine 已按“不改写 `BehaviorEngine`、只在上层封装连续行为方案”的原则完成 Phase 1-8 基础闭环，并完成受限 AI planner 的默认关闭安全接入：

- 已新增 `packages/sprite-core/purpose/` 基础运行时：`SpritePurposeManager`、`SpriteRoutineRunner`、`SpriteRoutinePresetRegistry`、默认 preset、history writer 抽象。
- `SpriteManager` 已持有 PurposeManager，并暴露 `startPurpose()`、`cancelPurpose()`、`getPurposeSnapshot()`。
- preload / IPC 已接入 `sprite:purpose:start`、`sprite:purpose:cancel`、`sprite:purpose:getSnapshot`。
- 动画播放指令已支持 `playId`，渲染层完成上报可回传 `playId`。
- `playAnimation` step 已支持按 `playId` 等待 `waitFor: 'complete'`，并保留 `duration` / `timeoutMs` fallback。
- 已新增 `SpritePresentationLock`，高优先级 routine 动画/行走期间会阻止低优先级 ambient trigger 抢占展示。
- Phase 2.5 已把展示锁扩展到状态机驱动的动画解析链路，并新增 routine 生命周期级展示锁。
- routine 自己触发的行走状态会带 owner 上下文通过展示锁；routine 结束释放锁后会按当前状态刷新动画。
- Phase 3 基础版已新增 `PurposeEventWaiter`、`waitForEvent` step、`sprite:purpose:event`、`sprite:purpose:listHistory`、JSONL history store 与 step 生命周期历史。
- SpriteEventBus 事件与 AppEvent 已会转入 purpose-event 等待层；workflow 的 `SPRITE_WORKFLOW_*` payload 已带 `runId/workflowId/status/progress/resourceId` 等 correlation 字段。
- Phase 4/5 已完成文件投递与 workflow 等待链路：`file.drop.intake`、FileActionsMenu purpose event 回报、`branch` / `loopUntil`、`workflow.waiting`、progress/updateBusy、取消/失败/完成收尾、UI/e2e 风格验收与低频 speak/cooldown 均已接入。
- 文件投递已补齐 drop 前邀请段：`file.drop.invite` 会在 `file-drag-over` 时走向屏幕中心，等待 `interact:file-drop` / `interact:file-drag-leave`；drop 后沿用 `file.drop.intake` 接管菜单与处理链路。
- Phase 6 已完成目的仲裁与行为接入：priority arbitration、同类 purpose coalesce、默认 `idle.presence`、`night-sleepy` 升级为 `daily.rest-reminder`、critical step defer interrupt、队列策略、workflow/resource purpose 路由、DailyCare dispatch -> purpose bridge 均已覆盖。
- Phase 7 已完成 planner 接口、服务骨架、安全校验器、prompt/output digest、history 记录、AI draft -> routine helper、live planner 执行入口、Electron main 默认关闭接线、真实 Pi runtime executor/prompt、持久化 preferences + `sprite:purposePlanner:*` IPC/preload 入口、`SpritePurposeHistoryQuery.eventType` 过滤，以及扩展设置页目的规划器入口 / 最近结果 / planner 历史列表；默认仍关闭，启用后非法输出只会 fallback 到 preset。
- 长期记忆/复盘的数据面与首批消费入口已接入：`SpritePurposeHistoryStore.getDailyRetrospective()` 会生成每日目的摘要、高价值 purpose、Memory-compatible recall cues，并通过 `SpriteManager` / IPC / preload 暴露；状态页已展示“今日目的”摘要；Memory index / daily index 生成前会经由主进程组合层注册的 retrospective provider 把高价值复盘自动写成 `Sprite Purpose Retrospective` Memory Note；自发说话也通过注入的 provider 读取这层摘要作为安静上下文，避免 AI/Memory 模块直接依赖 sprite-core 实现。

当前剩余主要是真实 provider 手动冒烟与更细的运行态体验打磨；核心运行时仍保持默认 preset 行为不受影响。

## 1. 复查结论

现有设计方向是对的：不要重写 `BehaviorEngine`，而是在它之上增加 Purpose/Routine，用来封装“触发后的一整套连续表现”。下表是从原始设计里抽出的工程缺口，以及本轮对应的实现状态，保留为后续审计索引。

### 1.1 原始缺口与当前实现状态

| 类型 | 当前文档已有 | 当前实现状态 |
| --- | --- | --- |
| 行为边界 | 已明确不替换 `BehaviorEngine` | 已通过 preset purpose、DailyCare bridge、workflow/resource listener 和少量行为接入明确升级边界 |
| 动画等待 | 已提出 `playAnimationAndWait()` | 已用 `playId` 等待动画完成，并保留 duration / timeout fallback |
| 事件等待 | 已有 `waitForEvent` 概念 | 已区分 purpose event、SpriteEventBus、AppEvent，并支持 runId/workflowId/resourceId correlation |
| 并发控制 | 已有 priority / interruptPolicy | 已接入 priority arbitration、critical step defer interrupt 与 presentation lock |
| 文件菜单 | 已描述 `fileActionsMenu` | FileActionsMenu 已上报 selected / resolved / cancelled / failed，并由 routine 分支消费 |
| 工作流等待 | 已提到 workflow | `workflow.waiting` 已消费 runId/workflowId/status/progress payload，支持 progress/updateBusy 与 terminal 收尾 |
| 失败恢复 | 只提到失败状态 | 已覆盖 timeout、cancel、step failed、planner fallback 与菜单关闭/卸载兜底 |
| 历史记录 | 已有 JSONL 概念 | 已拆 snapshot 与 JSONL event log，并新增每日 retrospective 汇总面 |
| UI/IPC | 已列 IPC 名称 | preload 类型、状态广播、状态页、planner 设置页与 retrospective 面板已接入 |
| 测试 | 原始文档未展开 | 已补单测、集成测试、UI/e2e 风格测试与跨层 retrospective smoke |

### 1.2 不做的事

- 不重写 `BehaviorEngine`。
- 不迁移所有默认行为。
- 不把 workflow/resource/AI task 的业务逻辑塞进 sprite-core。
- 不让渲染进程成为编排权威。
- AI 自动规划只通过 Phase 7 受限 DSL 接入，默认关闭；非法输出或执行期失败会回退 preset routine。

## 2. 最终架构

```text
BehaviorEngine / 用户事件 / 系统事件 / AppEvent
  -> SpriteManager.startPurpose()
  -> PurposeManager 仲裁目的
  -> RoutinePresetRegistry 解析预设步骤
  -> RoutineRunner 顺序执行 steps
  -> SpriteManager 原子能力
     - playAnimationAndWait
     - walkTo
     - speak/showToast/showBusy/updateBusy
     - waitForEvent
     - openWindow adapter
  -> PurposeHistory 记录目的与步骤
```

职责边界：

| 模块 | 负责 | 不负责 |
| --- | --- | --- |
| `BehaviorEngine` | 什么时候触发行为 | 连续动作编排 |
| `PurposeManager` | 当前目的、优先级、打断/排队 | 定时 tick、概率、冷却 |
| `RoutineRunner` | 执行一串 step 并等待 | 决定行为是否该发生 |
| `SpriteManager` | 提供动画、移动、消息、语音等原子能力 | 直接写业务工作流 |
| Electron main service | AI planner、窗口打开、历史文件、跨系统事件适配 | 侵入 sprite-core 纯逻辑层 |

## 3. 文件与模块规划

### 3.1 sprite-core 新增模块

```text
packages/sprite-core/purpose/
  index.ts
  types.ts
  purpose-manager.ts
  routine-runner.ts
  routine-presets.ts
  purpose-history.ts
  purpose-event-waiter.ts
  presentation-lock.ts
  step-handlers.ts
```

说明：

- `types.ts`：Purpose、Routine、Step、事件、历史类型。
- `purpose-manager.ts`：目的仲裁、队列、当前 purpose snapshot。
- `routine-runner.ts`：串行执行 Routine，支持取消、超时、失败恢复。
- `routine-presets.ts`：第一批预设 Routine。
- `purpose-history.ts`：JSONL 写入接口，纯抽象，不直接依赖 Electron。
- `purpose-event-waiter.ts`：统一等待 EventBus/AppEvent/外部事件。
- `presentation-lock.ts`：高优先级 routine 执行时保护展示权。
- `step-handlers.ts`：step type 到执行函数的映射。

### 3.2 Electron main 新增模块

```text
electron/main/handlers/sprite/
  purpose-planner-service.ts
  purpose-planner-runtime.ts
  purpose-planner-context.ts
```

说明：

- `purpose-planner-service.ts`：实现 AI planner 服务骨架、校验/fallback、prompt/output digest、planner history、live routine planner adapter。
- `purpose-planner-runtime.ts`：实现真实 Pi task runtime executor 与 JSON-only planner prompt。
- `purpose-planner-context.ts`：从最近 AI 会话/provider 上下文解析 planner runtime 所需 provider/preset/workspace。

### 3.3 需要改动的现有文件

| 文件 | 改动 |
| --- | --- |
| `packages/sprite-core/manager/sprite-manager.ts` | 持有 PurposeManager，新增 start/cancel/get/list API，新增 playAnimationAndWait |
| `packages/sprite-core/manager/types.ts` | 扩展 SpriteManagerOptions，注入 purpose history/openWindow/event adapter |
| `packages/sprite-core/types.ts` | `SpritePlayCommand` 增加可选 `playId` |
| `src/features/sprite-assistant/renderers/VideoSprite.tsx` | `animComplete` 回传 `playId` |
| `src/features/sprite-assistant/renderers/video-sprite-driver.ts` | 完成回调透传 `playId` 所需上下文 |
| `packages/sprite-core/preload/sprite-bridge.ts` | 增加 `purpose` 相关 IPC |
| `packages/sprite-core/handler/sprite-manager-ipc.ts` | 注册 `sprite:purpose:*` IPC |
| `packages/sprite-core/handler/sprite-event-listener.ts` | workflow 事件可选升级为 Purpose/Routine |
| `src/features/sprite-assistant/hooks/useFileDropCollector.ts` | 阶段性保持现状；后续可改为 startPurpose |
| `src/pages/FileActionsMenu/FileActionsMenu.tsx` | 上报 action selected/cancelled/workflow started |
| `packages/workflow/index.ts` | workflow AppEvent payload 增加 runId/workflowId/status/progress |

## 4. 核心类型草案

### 4.1 Purpose

```ts
export type SpritePurposeSource = 'behavior' | 'user-event' | 'system-event' | 'app-event' | 'ai' | 'manual';

export type SpritePurposeStatus =
  | 'idle'
  | 'queued'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled'
  | 'superseded'
  | 'failed';

export interface StartSpritePurposeRequest {
  kind: string;
  reason: string;
  source: SpritePurposeSource;
  title?: string;
  priority?: number;
  interruptPolicy?: 'never' | 'cooperative' | 'interruptible' | 'urgent';
  presetId?: string;
  context?: Record<string, unknown>;
  correlationId?: string;
}
```

### 4.2 Routine step

```ts
export type SpriteRoutineStep =
  | {
      id: string;
      type: 'playAnimation';
      trigger?: string;
      animationId?: string;
      durationMs?: number;
      waitFor?: 'complete' | 'duration' | 'none';
      silent?: boolean;
      timeoutMs?: number;
      interruptible?: boolean;
    }
  | {
      id: string;
      type: 'walkTo';
      target: 'center' | 'corner' | 'previous' | { x: number; y: number };
      speed?: number;
      timeoutMs?: number;
      interruptible?: boolean;
    }
  | { id: string; type: 'wait'; durationMs: number; interruptible?: boolean }
  | {
      id: string;
      type: 'waitForEvent';
      event: string;
      source?: 'sprite-event-bus' | 'app-event' | 'purpose-event';
      timeoutMs?: number;
      match?: Record<string, unknown>;
      assignTo?: string;
      optional?: boolean;
      ignoreHistory?: boolean;
      interruptible?: boolean;
    }
  | { id: string; type: 'speak'; text: string; bubbleDuration?: number; timeoutMs?: number; cooldownMs?: number; cooldownKey?: string; waitAfter?: number | boolean }
  | { id: string; type: 'showToast'; content?: string; category?: string; duration?: number }
  | { id: string; type: 'showBusy'; content?: string; progress?: number }
  | { id: string; type: 'updateBusy'; content?: string; progress?: number; contentFrom?: string; progressFrom?: string }
  | { id: string; type: 'clearBusy' }
  | {
      id: string;
      type: 'openWindow';
      window: string;
      payload?: Record<string, unknown>;
      waitForEvent?: string;
      timeoutMs?: number;
    }
  | {
      id: string;
      type: 'loopUntil';
      untilEvent: string;
      source?: 'sprite-event-bus' | 'app-event' | 'purpose-event';
      body: SpriteRoutineStep[];
      maxDurationMs?: number;
    }
  | {
      id: string;
      type: 'branch';
      by: string;
      cases: Record<string, SpriteRoutineStep[]>;
      default?: SpriteRoutineStep[];
    };
```

普通 `speak` / `showToast` 只负责台词和轻量提示；多句台词用 step 顺序和 `waitAfter` 控制节奏，也可以用 `parallel` 表达边走边说。需要用户确认或选择时使用 `showNotice.buttons`，再通过 `bubble:action` 回到 routine。

#### 4.2.1 Preset shorthand 与等待写法

Preset 编写层可以使用 `SpriteRoutineStepInput` shorthand，`SpriteRoutinePresetRegistry.createRoutine()` 会统一标准化为完整 `SpriteRoutineStep` 后再交给 runner：

- 数字代表等待毫秒数，例如 `3600` 会变成 `{ id: 'wait-1', type: 'wait', durationMs: 3600 }`。
- 对象 step 可以省略 `id`，registry 会按 `type` 和位置生成稳定可读的 id，例如 `speak-2`。
- 所有 step 都支持 `waitAfter`：`waitAfter: true` 会复用该 step 的自然展示/执行时长，`waitAfter: 800` 则在 step 完成后额外等待 800ms。
- `loopUntil.body`、`parallel.body`、`branch.cases/default` 会递归标准化，最终 runner 看到的每个 step 仍然都有 id。
- AI planner 输出仍使用严格 `SpriteRoutineStep`，避免模型输出过度简写导致校验边界变模糊。

等待节奏有三种兼容写法：

```ts
// 旧完整写法：独立 wait step，适合需要明确 id 或 interruptEvent 的等待。
[
  { id: 'line-a', type: 'speak', text: '第一句', bubbleDuration: 3600 },
  { id: 'line-a-breath', type: 'wait', durationMs: 3600 }
]

// shorthand：数字代表独立 wait step。
[
  { id: 'line-a', type: 'speak', text: '第一句', bubbleDuration: 3600 },
  3600
]

// 推荐用于“说完再继续”：step 自己等待。
[
  { id: 'line-a', type: 'speak', text: '第一句', bubbleDuration: 3600, waitAfter: true },
  { id: 'line-b', type: 'speak', text: '第二句', bubbleDuration: 4200, waitAfter: true }
]
```

三种写法的执行记录差异：

| 写法 | 是否生成独立 step | 是否有独立 stepId | 是否出现在 `result.steps` | 适合场景 |
| --- | --- | --- | --- | --- |
| 完整 wait step | 是 | 是，使用显式 `id` | 是 | 需要明确日志、测试锚点、`interruptEvent` 或可读 step 名 |
| 数字 shorthand | 是，会标准化成 wait step | 是，自动生成如 `wait-2` | 是 | 简单固定停顿，不需要手写 id |
| `waitAfter` | 否，属于当前 step 的执行过程 | 否，沿用当前 stepId | 否，耗时计入当前 step 的 `elapsedMs` | 当前动作完成后自然停顿，例如“说完再继续” |

`waitAfter` 的取值规则：

- `waitAfter: true`：复用当前 step 的自然时长，如 `speak.bubbleDuration`、`showToast.duration`、`showNotice.duration`、`playAnimation.durationMs`、`wait.durationMs`，以及部分 step 的 `timeoutMs/maxDurationMs`。
- `waitAfter: 500`：当前 step 完成后额外等待 500ms。
- 不配置：不额外等待。

`waitAfter: true` 的自然时长映射：

| step type | 使用字段 |
| --- | --- |
| `speak` | `bubbleDuration`，没有时用 `timeoutMs` |
| `showToast` | `duration` |
| `showNotice` | `duration` |
| `playAnimation` | `durationMs`，没有时用 `timeoutMs` |
| `wait` | `durationMs` |
| `waitForEvent` | `timeoutMs` |
| `walkTo` | `timeoutMs` |
| `openWindow` | `timeoutMs` |
| `loopUntil` | `maxDurationMs` |
| 其他 step | 不自动等待；需要停顿时写 `waitAfter: <ms>` 或接独立 wait step |

注意：`waitAfter` 和后面的独立 wait step 会叠加。例如 `waitAfter: true` 后面再写 `3600`，会等待两次。

### 4.3 StepResult

```ts
export interface SpriteRoutineStepResult {
  ok: boolean;
  status: 'completed' | 'timeout' | 'cancelled' | 'failed' | 'skipped';
  stepId: string;
  value?: unknown;
  error?: string;
  elapsedMs: number;
}
```

## 5. 关键工程决策

### 5.1 动画等待必须加入 playId

当前 `sprite:anim-complete` 只回传 `animId` 和 phase。Routine 中连续播放同一个动画时，旧完成事件可能误唤醒新 step。

方案：

1. `SpritePlayCommand` 增加 `playId?: string`。
2. `SpriteManager.playAnimationAndWait()` 每次生成唯一 `playId`。
3. `VideoSprite` 调用 `window.YUA.sprite.animComplete(animationId, phase, playId)`。
4. 主进程等待时优先匹配 `playId`，旧调用无 `playId` 时继续按 `animId` 兼容。

### 5.2 EventBus 事件名要和 IPC 通道分开

`sprite:file-drop` 是 IPC 通道，内部交互事件是 `interact:file-drop`。Routine 的 `waitForEvent` 要明确 source：

```ts
{ type: 'waitForEvent', source: 'sprite-event-bus', event: 'interact:file-drop' }
{ type: 'waitForEvent', source: 'app-event', event: 'SPRITE_WORKFLOW_COMPLETE' }
{ type: 'waitForEvent', source: 'purpose-event', event: 'fileAction:selected' }
```

### 5.3 所有等待都要带 correlation

需要避免“别的窗口/别的任务”的事件唤醒当前 routine。

推荐匹配字段：

- `purposeId`
- `routineId`
- `correlationId`
- `resourceId`
- `workflowRunId`
- `windowKey`

第一版可最少支持 `correlationId` + `resourceId`。

### 5.4 presentation lock

高优先级 Routine 执行时，低优先级 idle trigger 不应该覆盖正在播放的引导/等待/完成动画。

方案：

- RoutineRunner 开始时获取 `presentationLock`。
- lock 包含 `ownerPurposeId`、`priority`、`expiresAt`。
- `SpriteManager.trigger()` 增加可选 `owner` / `priority`。
- 低优先级触发在 lock 存在时被忽略或只显示静默消息。
- 为了少动 BehaviorEngine，第一版只在少数改造后的 action 传 priority；未改造的旧 trigger 保持兼容。

### 5.5 openWindow 不应放进 sprite-core

`sprite-core` 不能依赖 Electron window manager。需要通过注入 adapter：

```ts
type SpritePurposeWindowAdapter = {
  open(windowKey: string, payload?: Record<string, unknown>): Promise<void>;
  close?(windowKey: string): Promise<void>;
};
```

`initSpriteManagerIPC()` 在主进程注入具体实现。

### 5.6 FileActionsMenu 必须上报选择事件

当前菜单只执行 action 并关闭。为了让 routine 等待用户选择，需要补：

- 用户点击 action：`sprite:purpose:event` -> `fileAction:selected`
- workflow 启动成功：`fileAction:workflow-started`，带 `workflowRunId`
- 菜单关闭未选择：`fileAction:cancelled`
- action 执行失败：`fileAction:failed`

### 5.7 workflow 事件需要带 runId

当前 workflow 已广播 `wf:run-status`，也会 emit `SPRITE_WORKFLOW_*`，但 sprite event listener 收到的 payload 不足以匹配某个 routine。

需要在 `AppEvent.SPRITE_WORKFLOW_*` 里带：

```ts
{
  runId: string;
  workflowId: string;
  workflowName?: string;
  status: 'running' | 'completed' | 'failed' | 'canceled';
  progress?: number;
  resourceId?: string;
}
```

## 6. 分阶段实施计划

### Phase 0：安全收口与文档对齐

目标：先把契约定稳，不改运行行为。

任务：

- 修正设计文档中的事件命名：IPC `sprite:file-drop` 对应内部 `interact:file-drop`。
- 在 README 同时链接设计文档和实施方案。
- 列出第一批 preset：`idle.presence`、`file.drop.intake`、`daily.rest-reminder`、`workflow.waiting`、`routine.return-corner`。

验收：

- 文档能直接指导 Phase 1 文件级开发。

### Phase 1：Purpose/Routine 基础运行时

状态：已完成第一版。

目标：不接文件菜单、不接 AI，先让预设 Routine 能从主进程跑完。

任务：

- [x] 新增 `packages/sprite-core/purpose/types.ts`。
- [x] 新增 `PurposeManager`，支持 current / queue / start / cancel / getSnapshot。
- [x] 新增 `RoutinePresetRegistry`，内置简单 preset。
- [x] 新增 `RoutineRunner`，支持 `wait`、`speak`、`showToast`、`showBusy`、`updateBusy`、`clearBusy`、`playAnimation(duration)`、`walkTo`。
- [x] 新增 `PurposeHistory` writer 抽象，先允许 no-op 实现。
- [x] `SpriteManager` 初始化 PurposeManager，并暴露：
  - `startPurpose()`
  - `cancelPurpose()`
  - `getPurposeSnapshot()`
- [x] IPC 增加：
  - `sprite:purpose:start`
  - `sprite:purpose:cancel`
  - `sprite:purpose:getSnapshot`

第一批 preset：

```text
daily.rest-reminder:
  walkTo(center)
  playAnimation(wave, duration)
  speak("该休息一下了。")
  wait(1000)
  walkTo(corner)
```

验收：

- 从 DevTools 或测试调用 `window.YUA.sprite.startPurpose({ presetId: 'daily.rest-reminder' })` 后，角色能连续走、播放、说话、回角落。
- 现有 idle 行为仍然正常。

测试：

- `test/sprite-purpose-routine.spec.ts`
- `test/sprite-manager-ipc.spec.ts`

### Phase 2：动画完成等待与 presentation lock

状态：已完成第一版。

目标：让动画等待可靠，不被低优先级动画覆盖。

任务：

- [x] `SpritePlayCommand` 增加 `playId`。
- [x] preload `animComplete()` 支持第三个参数 `playId`。
- [x] `VideoSprite` 和 `VideoSpriteDriver` 透传 `playId`。
- [x] Routine `playAnimation` step 支持：
  - `waitFor: 'duration'`
  - `waitFor: 'complete'`
  - `timeoutMs`
  - cancel token
- [x] 新增 `PresentationLock`。
- [x] RoutineRunner 执行动画/行走 step 时获取 lock，完成/失败/取消时释放。

验收：

- 连续播放同一个 animationId 不会互相唤醒。
- Routine 执行中，低优先级 idle ambient 不覆盖当前动画。

测试：

- `test/sprite-purpose-routine.spec.ts`
- `test/sprite-manager-regression.spec.ts`
- `test/sprite-bridge.spec.ts`
- `test/sprite-manager-ipc.spec.ts`
- `test/video-sprite-driver.spec.ts`
- `test/sprite-renderer-mount.spec.tsx`

### Phase 2.5：状态机动画也纳入 presentation lock

状态：已完成第一版。

目标：补齐 Phase 2 的展示锁边界，让 routine 运行期间不只保护显式 `trigger()` 动画，也保护状态机驱动的动画解析。

任务：

- [x] `PurposeManager` 增加 routine start / finish hook。
- [x] `SpriteManager` 在 routine 生命周期开始时获取 presentation lock，结束、取消或被打断后释放。
- [x] `resolveAndSendAnimation()` 走 `presentationLock.shouldAllow()`，状态机切换不会绕过展示锁覆盖当前 routine 动画。
- [x] routine 自己触发的行走状态携带 owner / priority 上下文，允许 `walk` 动画在 lifecycle lock 内正常播放。
- [x] lifecycle lock 释放后按当前状态重新解析动画，避免最后停留在被保护期间的旧动画上。
- [x] step 级 lock 在 lifecycle lock 已存在时不重复获取，避免同 owner 的短 step lock 覆盖整条 routine lock。

验收：

- routine lifecycle lock 期间，外部低优先级状态变化不会覆盖当前展示。
- routine 自己的 `walkTo` 仍能显示行走动画。
- routine 结束释放锁后，会回到当前状态应该显示的动画。

测试：

- `test/sprite-manager-regression.spec.ts`
- `test/sprite-purpose-routine.spec.ts`

### Phase 3：事件等待与历史记录

状态：已完成基础版。

目标：Routine 可以等待 EventBus/AppEvent/purpose-event，并写可查历史。

任务：

- [x] 新增 `PurposeEventWaiter`。
- [x] 支持 `waitForEvent` step。
- [x] 新增 `purpose:event` 内部事件入口。
- [x] IPC 增加：
  - [x] `sprite:purpose:event`
  - [x] `sprite:purpose:listHistory`
  - [x] `sprite:purpose:state` 下行广播
- [x] 实现 `purpose-history.ts` JSONL store：
  - 路径：`<userData>/data/sprite-purpose-history-YYYY-MM-DD.jsonl`
  - 支持 limit/status/kind 查询
- [x] PurposeManager / SpriteManager 写入：
  - [x] purpose created/started/completed/failed/cancelled/superseded
  - [x] routine started/completed/failed
  - [x] step started/completed/failed/timeout/cancelled

验收：

- [x] `waitForEvent` 能等到模拟事件继续。
- [x] history 可通过 IPC 查询。
- [x] 应用重启不会丢历史。

测试：

- `test/sprite-purpose-routine.spec.ts`
- `test/sprite-bridge.spec.ts`
- `test/sprite-manager-ipc.spec.ts`
- `test/sprite-event-listener.spec.ts`

### Phase 4：文件投递 Routine

状态：基础完成；已补齐 drop 前邀请段、drop 后菜单链路与 workflow 等待闭环。

目标：覆盖用户最关心的“拖文件给角色 -> 选择操作 -> 等待处理 -> 完成 -> 回角落”。

任务：

- [x] `useFileDropCollector` 上报 file-drop 后，启动 `file.drop.intake` purpose。
- [x] `useFileDropCollector` 在 `file-drag-over` 时启动 `file.drop.invite` purpose，角色先走到屏幕中心等待 drop / leave。
- [x] 保留资源导入逻辑，避免破坏当前文件流程。
- [x] `FileActionsMenu` 增加 purpose event 上报：
  - [x] `fileAction:selected`
  - [x] `fileAction:cancelled`
  - [x] `fileAction:workflow-started`
  - [x] `fileAction:failed`
  - [x] `fileAction:resolved`
- [x] `file.drop.intake` preset（基础完成）：
  - [x] `playAnimation(fileDrop / thinking)`
  - [x] `openWindow(fileActionsMenu)` adapter 化；renderer drop collector 仅保留 purpose 启动失败兜底
  - [x] `waitForEvent(fileAction:resolved)`
  - [x] branch：selected/cancelled/failed 基础结果分支
  - [x] workflow 分支进入等待 routine
- [x] `file.drop.invite` preset：
  - [x] `walkTo(center)`
  - [x] `waitForEvent(interact:file-drop | interact:file-drag-leave)`，通过 `loopUntil` 兼容两类结束事件
  - [x] drag leave 时取消/回角落；drop 时停留并交给 `file.drop.intake`
- 如果用户关闭菜单：
  - [x] 播放取消/困惑动画
  - [x] 回角落

验收：

- [x] 拖文件后角色行为不再只是单次 drop 动画，而是一串完整表现（基础链路已接入）。
- [x] 文件拖入但尚未放下时，角色先进入“文件投递等待”目的并移动到中心。
- [x] 用户选择 workflow 操作后，角色进入 waiting routine。
- [x] action 执行失败时，菜单发出 `fileAction:failed` + `fileAction:resolved(outcome=failed)`，routine 播放 failure 分支并回角落。
- [x] 用户关闭菜单时 routine 正常结束，不残留 busy/lock（菜单关闭/卸载 resolved 兜底 + cancelled 分支单测已覆盖；后续可补 UI e2e）。
- [x] file-drop 端到端集成测试覆盖 renderer hook startPurpose、core openWindow、purpose event 回流与 routine cleanup。

测试：

- `test/sprite-purpose-routine.spec.ts`
- `test/file-actions-purpose-events.spec.tsx`
- `test/file-drop-purpose.spec.tsx`

### Phase 5：workflow 等待与进度陪伴

状态：基础完成；已完成 `loopUntil`、`workflow.waiting` preset 基础版、进度事件消费/updateBusy、FileActionsMenu 启动 waiting purpose、active purpose 展示去重、UI/e2e 风格验收与低频 speak/cooldown。

目标：让角色能陪伴长任务，不只是开始/结束闪一下。

任务：

- [x] `packages/workflow/index.ts` 的 `SPRITE_WORKFLOW_*` payload 增加 runId/workflowId/progress/resourceId。
- [x] Purpose runtime 监听 AppEvent，转成 purpose-event。
- [x] 新增 `workflow.waiting` preset：
  - [x] showBusy
  - [x] 消费 `SPRITE_WORKFLOW_PROGRESS`，用 `updateBusy` 刷新进度与消息
  - [x] loopUntil workflow completed/failed/canceled
  - [x] 循环播放 waiting/thinking
  - [x] 低频 speak 提示，需 cooldown，不能刷屏
  - [x] 成功播放 success，失败播放 failure
  - [x] clearBusy
- [x] RoutineRunner 的 `loopUntil` 支持 maxDurationMs 与 body 间隔。
- [x] `waitForEvent` 支持 progress 场景的 `ignoreHistory` 与 optional timeout skip，避免旧进度反复命中或短暂无进度导致 routine 失败。
- [x] `FileActionsMenu` 在 workflow action 返回 runId 后启动 `workflow.waiting` purpose，并带上 `workflowRunId/workflowId/resourceId`。
- [x] legacy `sprite-event-listener` 在匹配的 `workflow.waiting` active purpose 存在时，仅转发 purpose event 与保留完成奖励，避免 busy/toast/动画双路展示。
- [x] FileActionsMenu workflow action 到真实 `SpriteManager` routine 的 UI/e2e 风格验收覆盖。

验收：

- [x] 长工作流执行期间，角色能持续但克制地表现等待。
- [x] workflow progress 事件能进入 routine history，并刷新 busy 进度。
- [x] 从 FileActionsMenu workflow action 到 `workflow.waiting` 启动有 renderer 集成覆盖。
- [x] manager 层 workflow waiting 能消费 progress，收到 terminal 后 clear busy、成功收尾并回角落。
- [x] FileActionsMenu 点击 workflow action 后，真实 `SpriteManager` 能启动 waiting、消费 progress、完成收尾并写入 history。
- [x] active `workflow.waiting` 接管展示时，legacy listener 不重复 `showBusy/updateBusy/clearBusy/trigger`。
- [x] workflow 成功/失败/取消都能正确收尾。
- [x] busy 状态不会残留。

测试：

- `test/sprite-purpose-routine.spec.ts`
- `test/sprite-event-listener.spec.ts`
- `test/file-actions-purpose-events.spec.tsx`
- `test/workflow-waiting-purpose.spec.ts`
- `test/file-actions-workflow-e2e.spec.tsx`

### Phase 6：目的仲裁与行为接入

状态：完成；已完成 `PurposeManager` 基础 priority arbitration、同类 active/queued purpose coalesce、默认 `idle.presence` semantic purpose、`night-sleepy` 升级为 `daily.rest-reminder` purpose、文件投递打断休息提醒与完成后恢复 idle、current critical step defer interrupt、低优先级 reject 与 queue limit/evict 策略、workflow/resource listener 可配置 purpose 路由、DailyCare dispatch -> purpose bridge 的回归覆盖。

目标：让不同目的能安全切换，同时保护 BehaviorEngine。

任务：

- [x] PurposeManager 完整实现 priority + interruptPolicy：
  - [x] higher priority interrupt
  - [x] lower priority queue
  - [x] same kind coalesce（active/queued 均覆盖；优先使用显式 `coalesceKey`、correlation/run/drop identity，`idle.presence` 与 `daily.rest-reminder` 作为 singleton 合并）
  - [x] lower priority ignore / queue limit 策略（默认低于 `minQueuedPriority` 的非 idle purpose 直接 rejected；队列满时更高优先级 purpose 可替换最低优先级 queued purpose）
  - [x] current critical step defer interrupt（`interruptible: false` step 执行中会暂缓更高优先级 purpose；critical step 完成后再启动 queued interrupt）
- [x] 默认创建 `idle.presence` semantic purpose。
- [x] 改造少量默认行为：
  - [x] 保持大多数单点行为不动。
  - [x] `night-sleepy` 升级为 `daily.rest-reminder` purpose，带 `coalesceKey: night-sleepy`。
  - [x] `idle-sleepy` 保持轻量 `playOnce('sleepy')` reaction。
  - [x] daily care 类行为按主进程 daily service 接入面桥接：DailyCare 继续负责调度/notice，dispatch event 启动 `daily.care.reminder` 或夜间 `daily.rest-reminder` purpose。
- [x] sprite-event-listener 中 workflow/resource 事件可根据配置选择 trigger 或 purpose（`workflow.waiting` / `resource.import.waiting` purpose mode）。

验收：

- [x] 文件投递能打断休息提醒。
- [x] idle ambient 不会打断文件处理。
- [x] 高优先级目的完成后能恢复 idle purpose。

测试：

- [x] `test/purpose-arbitration.spec.ts`
- [x] `test/purpose-idle-presence.spec.ts`
- [x] `test/sprite-manager-regression.spec.ts`
- [x] `test/sprite-event-listener.spec.ts`
- [x] `test/sprite-purpose-routine.spec.ts`
- [x] `test/daily-care-service.spec.ts`
- [x] `test/sprite-manager-ipc.spec.ts`

### Phase 7：AI planner 预留与安全接入

目标：让 AI 未来能生成 Routine，但第一步必须受限和可回退。

状态：安全接入基本完成（planner 接口、主进程服务骨架、安全校验器、prompt/output digest、planner history 记录、AI draft -> routine helper、live manager routine planner 执行入口、Electron main 默认关闭接线、真实 Pi runtime executor/prompt、持久化 preferences 与 IPC/preload 入口、history eventType 过滤、扩展设置页目的规划器入口 / 最近结果 / planner 历史列表 / 手动试跑入口，以及 AI routine 执行期失败后记录 fallback 并切回 preset 收尾均已完成）。

任务：

- [x] 定义 `SpritePurposePlannerExecutor`。
- [x] Electron main 实现 `SpritePurposePlannerService` 骨架。
- [x] AI 输入：
  - [x] 当前 purpose
  - [x] 可用 preset
  - [x] 可用 step schema
  - [x] 可用动画 trigger
  - [x] 当前窗口位置/屏幕尺寸
  - [x] 最近 purpose history 摘要
- [x] AI 输出：
  - [x] `routineDraft`
  - [x] `whyThisPlan`
  - [x] `fallbackPresetId`
- [x] 加校验器：
  - [x] step allowlist
  - [x] window allowlist
  - [x] event allowlist
  - [x] max steps
  - [x] max duration
  - [x] required timeout
- [x] 校验失败回退 preset（当前由 planner service 返回 fallback 结果，供后续接入历史记录）。
- [x] AI draft 可 materialize 为 `SpriteRoutine(source: 'ai')`。
- [x] 历史中记录 planner prompt digest、输出摘要、fallback 原因（`planner:planned` / `planner:fallback`）。
- [x] 将 planned AI routine 接入 live `PurposeManager` / `SpriteManager` 可注入执行路径，并保留 preset fallback。
- [x] Electron main 实例化默认关闭的 `SpritePurposePlannerService`，并通过 adapter 注入 `purposeRoutinePlanner`；disabled/fallback 时仍走 preset。
- [x] 接入真实 AI executor / runtime prompt：`purpose-planner-runtime.ts` 通过 Pi task runtime 生成 JSON-only draft，`purpose-planner-context.ts` 复用最近 AI 会话/provider 上下文，Electron main 默认关闭但已注入 executor。
- [x] 接入持久化 planner preferences 与观测状态：`sprite:purposePlanner:getPreferences`、`sprite:purposePlanner:updatePreferences`、`sprite:purposePlanner:getStatus`，preload bridge 同步暴露。
- [x] 接入扩展设置页 UI：`PurposePlannerSettings` / `usePurposePlannerSettings` 暴露 enabled、historyLimit、executor 状态与最近一次 planner 结果摘要。
- [x] 接入 planner 历史列表：`SpritePurposeHistoryQuery.eventType` 支持过滤 `planner:planned` / `planner:fallback`，设置页观测页展示 planner 历史 digest、fallback 原因、校验状态和错误/警告摘要。
- [x] 接入设置页手动试跑：触发低风险 `daily.care.reminder` purpose，用于验证真实 planner / fallback / history 链路。
- [x] AI planned routine 执行期失败时，记录执行期 `planner:fallback`，并启动对应 preset routine 收尾，避免整个 purpose 直接失败。

验收：

- [x] 关闭 AI planner 时所有 preset 正常。
- [x] AI 输出非法 step 时不会执行，并返回 fallback。
- [x] AI fallback 原因写入 PurposeHistory。
- [x] 主进程接线默认关闭，不影响当前 preset 行为。
- [x] 真实 provider executor 启用后，非法输出仍只走 fallback，不执行 draft。
- [x] planner 启用状态与 historyLimit 可持久化，状态查询能返回 executor 可用性和最近一次 planner 结果摘要。
- [x] 设置页可切换 planner、调整 historyLimit，并查看 executor 与最近结果状态。
- [x] 设置页可独立刷新 planner 历史，且后端 history store 支持按 eventType 查询 planner 记录。
- [x] 设置页可手动启动一次 planner smoke test purpose，完成后刷新状态和历史。
- [x] AI planned routine 执行期 step 失败时，会回退 preset，并最终按 preset 结果完成 / 失败 purpose。

测试：

- [x] `purpose-planner-validation.spec.ts`
- [x] `test/purpose-planner-ipc.spec.ts`
- [x] `test/purpose-planner-settings-hook.spec.tsx`
- [x] `test/sprite-bridge.spec.ts`
- [x] `test/sprite-purpose-routine.spec.ts`

### Phase 8：长期记忆与复盘数据面

状态：基础完成；已完成每日 retrospective 摘要、Memory-compatible recall cues、状态页“今日目的”展示、Memory index / daily index 前经 provider 注入的自动 Memory Note 写入，以及自发说话 prompt 对复盘摘要的消费。

目标：让角色能复盘“自己为什么做过这些行为”，并给长期记忆系统一个稳定、去噪后的消费面。

任务：

- [x] `SpritePurposeHistoryQuery` 支持 `date` / `since` / `until`，可按日期读取历史。
- [x] 新增 `buildSpritePurposeDailyRetrospective()`，从 PurposeHistory 汇总每日目的。
- [x] 复盘摘要包含：
  - [x] total / terminal / completed / cancelled / failed 统计
  - [x] kindCounts
  - [x] 每个 terminal purpose 的 duration、stepCount、完成/失败 step、planner fallback 原因
  - [x] `memoryWorthiness` 评分与 `memoryCandidate`
  - [x] Memory Note 可直接复用的 `recallCues`
- [x] `SpritePurposeHistoryStore.getDailyRetrospective()` 暴露 store 级查询。
- [x] `SpriteManager.getPurposeDailyRetrospective()`、`sprite:purpose:getDailyRetrospective`、preload `getPurposeDailyRetrospective()` 已接入。
- [x] 状态页接入 `PurposeRetrospectivePanel`，展示今日完成/异常/记忆候选统计与最近目的。
- [x] Memory index / daily index 生成前通过注册的 retrospective provider 自动同步 `Sprite Purpose Retrospective` Memory Note，写入高价值目的的 `Recall Cues`。
- [x] 自发说话服务通过构造注入的 retrospective provider 读取每日 retrospective，把高价值 purpose 与 recall cues 注入 prompt，并过滤 `idle.presence` 噪声。

验收：

- [x] 文件投递等高价值 purpose 会出现在 recall cues 中。
- [x] `idle.presence` 默认不进入展示 items，但仍参与总量/kind 统计。
- [x] IPC/preload 能查询指定日期复盘摘要。
- [x] 状态页能渲染高价值 purpose 与空状态。
- [x] 重复触发 Memory index 不会生成重复 note，而是按同一天固定路径更新同一条复盘 note。
- [x] 自发说话上下文能引用当天高价值目的，不暴露内部 purpose id / routine 噪声。
- [x] Memory/自发说话消费复盘时只调用 provider/hook，不直接 import sprite-core history store。

测试：

- [x] `test/sprite-purpose-routine.spec.ts`
- [x] `test/sprite-bridge.spec.ts`
- [x] `test/sprite-manager-ipc.spec.ts`
- [x] `test/purpose-retrospective-panel.spec.tsx`
- [x] `test/purpose-retrospective-memory-sync.spec.ts`
- [x] `test/memory-index-sync.spec.ts`
- [x] `test/spontaneous-utterance-purpose-retrospective.spec.ts`
- [x] `test/sprite-purpose-retrospective-smoke.spec.ts`

## 7. 第一版 preset 建议

### 7.1 `idle.presence`

语义目的，不一定执行 Routine。用于记录 idle 下发生的小动作与自发说话。

### 7.2 `daily.rest-reminder`

```text
walkTo(center)
playAnimation(wave, 1200ms)
speak("差不多该休息一下了。")
wait(800ms)
playAnimation(tired or sleep, 1800ms)
walkTo(corner)
```

### 7.3 `file.drop.intake`

```text
playAnimation(fileDrop, duration)
playAnimation(thinking, duration)
openWindow(fileActionsMenu)
waitForEvent(fileAction:selected | fileAction:cancelled)
branch:
  cancelled -> playAnimation(confused) -> walkTo(corner)
  workflow-started -> workflow.waiting
  assistant-opened -> playAnimation(success) -> walkTo(corner)
```

### 7.4 `workflow.waiting`

```text
showBusy
loopUntil(workflow completed/failed/canceled):
  waitForEvent(workflow progress, optional, ignoreHistory)
  updateBusy(progress/message from latest progress event)
  playAnimation(waiting, 2500ms)
  wait(5000ms)
  maybe speak short line
branch:
  completed -> clearBusy -> playAnimation(success) -> speak("完成了。")
  failed -> clearBusy -> playAnimation(failure) -> speak("这里好像失败了。")
  canceled -> clearBusy -> playAnimation(cancellation)
walkTo(corner)
```

## 8. 验收矩阵

| 场景 | 预期 |
| --- | --- |
| 调用 rest reminder | 连续走到中心、说话、播放动画、回角落 |
| Routine 中途取消 | 停止等待、释放 lock、回到 idle |
| 同一动画连续播放 | `playId` 保证不会串台 |
| 状态机动画切换发生在 routine 期间 | 低优先级状态动画不覆盖 active routine，routine 自己的 walk 动画可通过 owner 上下文播放 |
| 拖文件后选择 workflow | 进入等待 routine，workflow 完成后成功收尾 |
| FileActionsMenu workflow action e2e | 菜单点击 action 后真实 SpriteManager 启动 waiting，消费 progress，完成收尾并写 history |
| workflow progress 更新 | routine 消费进度事件，刷新 busy，history 记录 progress step |
| workflow waiting 已激活时收到 AppEvent | AppEvent 仍转 purpose event；legacy busy/toast/动画不重复执行 |
| 拖文件后关闭菜单 | 取消 routine，角色回角落 |
| workflow 失败 | clearBusy，播放失败动画，不残留 lock |
| idle ambient 触发 | 无 active 高优先级 purpose 时正常，有 lock 时不覆盖 |
| 历史查询 | 能看到 purpose/step 的开始、结束、失败原因 |
| 拖入文件但尚未放下 | `file.drop.invite` 先移动到中心并等待 drop / leave，真正 drop 后转 `file.drop.intake` |
| AI planner 输出非法或执行失败 | 记录 `planner:fallback`，回退 preset routine 收尾 |
| 每日目的复盘 | 汇总当天 terminal purpose、kind 分布、step/outcome 与高价值 recall cues，默认过滤 `idle.presence` 展示噪声 |
| Memory index / daily index 触发 | 通过注册的 provider 先同步固定路径 `Sprite Purpose Retrospective` Memory Note，重复触发更新同一 note |
| 自发说话生成 | 通过构造注入的 provider 读取当天 retrospective 作为 prompt 的安静自我感知，不暴露 purpose id / routine 内部噪声 |

## 8.1 2026-05-04 Rest Reminder Movement Correction

`daily.rest-reminder` no longer treats walking to the screen center as a fixed fallback preset step. The default preset should express the rest reminder in place: attention animation, short speech, brief pause, and tired animation.

The original "walk to center to remind the user to rest" wording is a planning example: spatial distance can be chosen by the AI planner or by a more specific routine when the context calls for it. It is not a hard requirement for every rest reminder.

Implementation notes:

- Removed `walkTo(center)` and `walkTo(corner)` from the default `daily.rest-reminder` preset.
- Updated the AI planner prompt so movement is optional expression, not a default requirement for rest reminders.
- Added regression coverage that `daily.rest-reminder` fallback routines contain no `walkTo` steps.
- `file.drop.invite` still walks to center because the center position is the explicit drop target affordance for that interaction.

## 8.2 2026-06-09 Workspace Onboarding Walk Exit Correction

### 背景

`onboarding.workspace.create` 的 preset routine 会在用户点击邀请气泡按钮后：

```text
clearMessage(onboarding.workspace.create.invite)
openWindow(workspaceWizard)
walkTo({ window: 'workspaceWizard', placement: 'right', offset: 16 })
loopUntil(WORKSPACE_CREATED | WORKSPACE_WIZARD_CLOSED)
```

实际现象是：角色已经走到创建工作空间窗口旁边，窗口位置不再变化，但画面仍停留在行走动画，看起来像“一直在走”。

### 根因

这是 movement、状态机动画和 presentation lock 的边界问题，不是 `WindowController.walkTo()` 没有完成。

1. `runPurposeWalkStep()` 为 routine 自己触发的行走状态临时设置 `stateDrivenPresentationOwner`，因此 `walking -> walk` 动画可以越过当前 routine lifecycle lock 正常播放。
2. `WindowController` 到达目标后调用 `onWalkEnd()`，主进程把状态切回 `idle`。
3. 这次 `idle` 状态解析没有携带 routine owner。由于 `workspace.create` routine 仍在等待用户创建工作空间，它的 lifecycle presentation lock 仍然存在；routine 等待窗口可达 30 分钟，当前 lock TTL 会被实现 clamp 到最多 10 分钟，但仍足以让旧 walk 展示长时间残留。
4. `resolveAndSendAnimation(idle)` 被当前 routine lock 拦住，renderer 没有收到新的 idle `sprite:play`，于是 `currentAnimation` 仍然是 walk。
5. 如果 walk 动画是三段式 `loopStartMs/loopEndMs`，`VideoSprite` 当前会把三段式 loop 视为持续 active，可能一直传入 `fallbackIsPlaying: true`，导致 `VideoSpriteDriver` 不进入 outro。即使 3 秒 pending-idle fallback 触发，也会再次被 routine lifecycle lock 拦住。

### 目标行为

- routine 自己的 `walkTo` 在 lifecycle lock 存在时仍然能播放 walk 动画。
- `walkTo` 完成、被 stop 或超时后，角色展示必须离开 walk：普通 walk 立即切 idle，三段式 walk 先进入 outro，再切 idle。
- routine 在打开业务窗口并长时间等待用户操作时，可以继续持有 presentation lock 防止 ambient/idle 行为打断，但这个 lock 不能让上一段 walk 动画残留。
- 修复不能让外部低优先级状态变化覆盖 active routine 的显式动画。

### 推荐实施方案

第一层修复放在 `SpriteManager`，解决 routine-owned walk 结束后的 idle handoff。

- 将 `transitionToIdleAnimation()` 扩展为可接收 `SpriteTriggerOptions` 或新增专用 helper，例如 `transitionToIdleAnimationForOwner(owner)`。
- `runPurposeWalkStep()` 在 `walk` Promise 正常结束后，用同一个 `routine.purposeId + priority` 主动触发一次 idle 状态展示。
- 这个 idle handoff 应该发生在释放 step lock 之前；若当前仍有 lifecycle lock，owner 匹配即可通过 `presentationLock.shouldAllow()`。
- 如果当前动画是三段式 walk，不要直接清空 `currentAnimation`；保持现有 pending outro 机制，但 fallback 到 idle 的那次状态解析也必须带 routine owner。
- 如果 walk step 超时并调用 `stopWalk()`，也应执行同样的 owner-aware idle handoff，避免失败路径残留 walk。

第二层修复放在 `VideoSprite` / `VideoSpriteDriver`，解决三段式 walk loop 不退出的问题。

- `activeIsPlaying` / `fallbackIsPlaying` 对三段式动画不要无条件使用 `activeSegmentLoopActive ? true : spriteState !== 'idle'`。
- 对 state-bound 动画，应以 `spriteState !== 'idle'` 作为退出 loop 的主要信号；`loopStartMs/loopEndMs` 只表示“有 loop 段”，不表示永远 active。
- 对 timed trigger 动画，继续以 `playbackSession` 控制 active 时长。
- 对 idle 类三段式循环，如果后续确实需要常驻 loop，应显式通过 trigger/session 语义区分，不能让所有三段式动画都默认不可退出。

第三层补充可观测性，便于定位类似问题。

- 保留或收敛现有 `[SpritePlayback] handleAnimationComplete` 日志，增加 `currentState/currentTrigger/pendingIdleAfterOutro/presentationLock` 信息。
- 在 `resolveAndSendAnimation()` 被 lock 拦住时，只对 debug trigger 或 purpose 相关场景记录一条结构化日志，避免长期刷屏。

### 建议文件级改动

- `packages/sprite-core/manager/sprite-manager.ts`
  - 扩展 idle handoff helper，允许携带 owner/priority。
  - `runPurposeWalkStep()` 在 success/stop/timeout 路径完成 owner-aware idle handoff。
  - pending-idle fallback 触发时保留 owner 上下文，避免被同一 routine lifecycle lock 拦住。
- `src/features/sprite-assistant/renderers/VideoSprite.tsx`
  - 调整 `activeIsPlaying` 和 `fallbackIsPlaying` 的计算，避免三段式 state-bound walk 在 idle 后继续 loop。
- `src/features/sprite-assistant/renderers/video-sprite-driver.ts`
  - 如有必要，补一个显式 `syncPlayingState(false)` 后从 loop seek 到 `loopEndMs` 并进入 outro 的测试路径；现有 driver 逻辑已经支持该行为，重点是 renderer 传参。

### 回归测试

- `test/sprite-manager-regression.spec.ts`
  - 新增：routine lifecycle lock 存在时，routine-owned walk 结束后仍能切回 idle 动画。
  - 新增：`workspace.create` 风格的长 lifecycle lock 不会让 walk animation 残留。
  - 新增：walk timeout / stopWalk 路径也会离开 walk presentation。
- `test/video-sprite-driver.spec.ts`
  - 覆盖三段式动画在 `isPlaying: false` 时从 loop 进入 outro，并在结尾上报 `outro`。
- `test/sprite-renderer-mount.spec.tsx`
  - 新增：三段式 walk 播放中收到 `spriteState: idle` 后，renderer 传入 inactive playing 状态，driver 进入 outro。
- `test/sprite-purpose-routine.spec.ts`
  - 保持 `onboarding.workspace.create` 顺序不变：open wizard -> walk near wizard -> speak/wait loop。

### 验收标准

- 首次引导中点击“立即创建”后，角色走到 `workspaceWizard` 旁边，位置停止后 1 个动画周期内离开 walk loop。
- 如果 walk 动画有 outro，能自然播完 outro，再显示 idle。
- workspace wizard 保持打开、routine 继续等待创建时，角色不再一直保持行走动画。
- routine lifecycle lock 仍然能阻止 ambient idle、random message、auto-walk 等低优先级展示覆盖当前引导。

### 落地记录

- `SpriteManager` 已将 routine-owned `walkTo` 结束后的 idle handoff 改为携带同一个 `purposeId + priority`，并在三段式 outro pending 期间保存 owner，等 outro 完成后再消费。
- `VideoSprite` 已改为让 state-bound walk 依据 `spriteState` 退出三段式 loop，同时保留 `idle` state-bound 三段式动画的常驻 loop 行为。
- 已补充 manager 回归测试覆盖 lifecycle lock 下普通 walk 回 idle、三段式 walk outro 后 owner-aware idle；renderer mount 测试覆盖 walk loop 退出和 idle segment loop 保持。

## 8.3 2026-06-09 Quest Record Link-State Feedback Animation

### 背景

任务列表页和消息气泡里的任务推荐入口会在启动任务后播放一次“记录/写入任务”的角色动画：

```text
quest:start(...)
playQuestRecordAnimation()
```

当前 renderer 侧实现位于：

- `src/features/sprite-assistant/message/MessageContext.tsx`
- `src/pages/QuestListPage/QuestListPage.tsx`

它们直接调用：

```ts
window.YUA.sprite?.trigger('write', { silent: true })
```

实际风险是：这个调用经由 `sprite:trigger` 进入 `SpriteManager.trigger('write')` 后，会被 `presentationLock.shouldAllow()` 检查。若 `quest:start` 已经启动了某个 purpose routine，routine lifecycle lock 可能已经存在；这次 renderer 外部触发没有 `ownerPurposeId + priority`，因此即使它在产品语义上属于“启动任务的衔接反馈”，也会被当前 active purpose 的 lock 拦住。

这和 8.2 的 walk 残留属于同一类 presentation ownership 边界问题，但不是同一个具体 bug：

- 8.2 是 routine 自己的 `walkTo` 完成后，`idle` handoff 丢失 owner，导致旧 walk 展示残留。
- 8.3 是 renderer 发起的链接态反馈动画从一开始就没有 owner，因此无法越过当前 purpose lock。

还需要区分另一类失败：如果当前角色包没有注册 `write` trigger 对应动画，`trigger('write')` 会没有候选动画。这个场景应返回明确的 `missing-animation`，而不是误判为 lock 问题。

### 定位

`playQuestRecordAnimation()` 不应该被硬塞进某个 `purpose routine`：

- 它不是目标 purpose 的业务步骤，而是“任务被记录/进入引导流程”的过渡反馈。
- `quest:start` 可能启动一个 routine，也可能只是同步任务状态、发现任务已经完成、或从推荐气泡进入已有任务。
- 如果把它塞进每个 routine preset，会让每个 purpose 都背负任务系统 UI 衔接责任，污染 routine 的业务语义。
- 如果 renderer 直接调用普通 `sprite.trigger()`，又无法安全表达“我属于当前 purpose 的链接态反馈”。

因此它应该被建模为主进程受控的 system/purpose feedback，而不是 routine step。

### 目标行为

- 任务启动、任务记录、推荐气泡转任务等链接态反馈可以播放 `write` 这类动画。
- 如果当前 active purpose 正持有 presentation lock，反馈动画可以借用同一个 purpose owner 播放，但只能借用当前 owner，不能绕过其他 owner 的 lock。
- renderer 不能直接传 `ignorePresentationLock`、`ownerPurposeId` 或任意 priority。
- 如果没有 active purpose 且没有 lock，反馈动画按普通 trigger 播放。
- 如果存在不属于当前可解释 purpose 的 lock，反馈动画不播放，并返回可观测原因。
- 如果没有对应动画资源，返回可观测原因，不显示错误 toast。

### 推荐接口

在 preload 暴露一个窄接口，不扩展普通 `sprite.trigger()` 的权限面：

```ts
window.YUA.sprite.playFeedback({
  trigger: 'write',
  kind: 'quest-record',
  silent: true,
  durationMs: 1200
})
```

建议类型：

```ts
type SpriteFeedbackKind =
  | 'quest-record'
  | 'purpose-link'
  | 'memory-record'
  | (string & {});

interface SpriteFeedbackRequest {
  trigger: SpriteAnimationTrigger;
  kind: SpriteFeedbackKind;
  silent?: boolean;
  durationMs?: number;
  message?: string;
  ctx?: Record<string, unknown>;
}

type SpriteFeedbackResult =
  | { ok: true; played: true; ownerPurposeId?: string }
  | { ok: true; played: false; reason: 'missing-animation' | 'blocked-by-lock' | 'no-renderer' }
  | { ok: false; played: false; reason: 'invalid-request'; error: string };
```

命名可选项：

- `playFeedback`：最通用，适合任务记录、记忆保存、系统写入等轻量反馈。
- `playPurposeFeedback`：更强调与 purpose owner 的关系，但未来用于非 purpose 系统反馈时名字会变窄。
- `triggerOwnedFeedback`：表达准确，但对调用端偏底层。

推荐先用 `playFeedback`，参数中的 `kind` 负责表达具体场景。

### 主进程决策规则

在 `SpriteManager` 增加专用方法，例如 `playFeedbackAnimation(request)`。该方法内部读取：

- `purposeManager.getSnapshot().current`
- `presentationLock.getSnapshot()`
- `animationRegistry.findCandidatesByTrigger({ trigger, personaState })`

决策顺序：

1. 校验 request：必须有 trigger 和 kind。
2. 先检查 trigger 是否有动画候选；没有则返回 `missing-animation`。
3. 读取当前 presentation lock。
4. 如果没有 lock，调用普通 `trigger(trigger, { silent, durationMs, message, ctx })`。
5. 如果有 lock，且当前 active purpose 存在，且 `lock.ownerId === currentPurpose.id`：
   - 使用 `{ ownerPurposeId: currentPurpose.id, priority: currentPurpose.priority }` 调用 `trigger()`。
   - 这表示反馈动画借用当前 purpose 的展示权。
6. 如果有 lock，但 lock owner 与当前 active purpose 不一致：
   - 返回 `blocked-by-lock`。
   - 不使用 `ignorePresentationLock`。
7. 如果 trigger 调用成功但由于候选消失或 race 没播出，返回可观测结果；第一版可以由 feedback helper 自己在调用前完成候选与 lock 检查，暂不强制把 `trigger()` 从 `void` 改为返回值。

这个 helper 可以允许高优先级 active purpose 的链接态反馈替换当前动画，但不能让低可信 renderer 任意覆盖别的 routine、ambient 或开发测试动画。

### 为什么不开放 ignorePresentationLock

不要让 renderer 直接调用：

```ts
window.YUA.sprite.trigger('write', {
  silent: true,
  ignorePresentationLock: true
})
```

原因：

- 这会让任何页面都可以绕过 presentation lock，破坏 routine 对关键引导、业务窗口等待、动画收尾的保护。
- 它无法区分“当前 purpose 的链接态反馈”和“不相关页面的随手动画”。
- 后续一旦出现更多 UI 反馈动画，会演变成所有调用点都加 `ignorePresentationLock`，presentation lock 失去意义。

正确边界是 renderer 表达意图，主进程判断是否允许借用当前 owner。

### 建议文件级改动

- `packages/sprite-core/types.ts`
  - 新增 `SpriteFeedbackRequest` / `SpriteFeedbackResult` 类型。
  - 可选：后续如果多个入口都需要可观测播放结果，再新增 `SpriteTriggerResult`，让 `trigger()` 从 `void` 升级为返回值。
- `packages/sprite-core/manager/sprite-manager.ts`
  - 新增 `playFeedbackAnimation(request)`。
  - 提供内部 helper：`resolveCurrentPresentationOwnerForFeedback(kind)`。
  - 不暴露 `ignorePresentationLock` 给 renderer。
- `packages/sprite-core/handler/sprite-manager-ipc.ts`
  - 新增 IPC：`sprite:feedback:play`。
  - 只接收 `SpriteFeedbackRequest` 白名单字段。
- `packages/sprite-core/preload/sprite-bridge.ts`
  - 暴露 `playFeedback(request)`。
- `src/features/sprite-assistant/message/MessageContext.tsx`
  - 将 `playQuestRecordAnimation()` 改为调用 `window.YUA.sprite.playFeedback({ trigger: 'write', kind: 'quest-record', silent: true })`。
- `src/pages/QuestListPage/QuestListPage.tsx`
  - 同步改为同一个 helper；后续可抽一个 renderer 侧小工具，避免重复实现。

### 回归测试

- `test/sprite-manager-regression.spec.ts`
  - 当前 active purpose 持有 lifecycle lock 时，`playFeedback({ trigger: 'write', kind: 'quest-record' })` 使用当前 owner 播放动画。
  - 有 lock 但 owner 不属于当前 active purpose 时，返回 `blocked-by-lock`，不覆盖 current animation。
  - 没有 lock 时，按普通 trigger 播放。
  - 没有 `write` 动画候选时，返回 `missing-animation`。
- `test/sprite-manager-ipc.spec.ts`
  - `sprite:feedback:play` 不接受 renderer 传入的 `ownerPurposeId` / `priority` / `ignorePresentationLock`。
  - IPC 返回结构化 result。
- `test/sprite-message-queue.spec.tsx`
  - 推荐气泡 `quest:start:*` 成功后调用 `playFeedback({ trigger: 'write', kind: 'quest-record', silent: true })`。
- `test/quest-list-page.spec.tsx` 或现有任务列表测试
  - 点击任务开始按钮后调用同一 helper。

### 验收标准

- 在首次引导、聊天 API 配置引导、功能引导等 active purpose 期间，从任务推荐入口启动任务时，`write` 反馈动画能播放。
- 如果另一个不相关高优先级 lock 正在保护展示，任务记录反馈不会强行覆盖。
- 没有 `write` 动画资源时不报错，日志或返回值能说明 `missing-animation`。
- 普通 `sprite.trigger()` 仍然不能从 renderer 绕过 presentation lock。

### 落地记录

- 已新增 `SpriteFeedbackKind` / `SpriteFeedbackRequest` / `SpriteFeedbackResult`，并从 sprite-core 与 sprite-assistant 类型出口导出。
- `SpriteManager.playFeedbackAnimation()` 已实现主进程受控的 owner 借用：先校验 request，再先查动画候选；有 lock 时只接受 active routine owner 或当前 active purpose owner，随后用内部 `ownerPurposeId + priority` 调用 `trigger()`。
- `sprite:feedback:play` IPC 只转发 `trigger/kind/silent/durationMs/message/ctx` 白名单字段，renderer 传入的 `ownerPurposeId`、`priority`、`ignorePresentationLock` 会被丢弃。
- preload 已暴露 `window.YUA.sprite.playFeedback(request)`；任务推荐气泡和任务列表页的 `playQuestRecordAnimation()` 已迁移到 `playFeedback({ trigger: 'write', kind: 'quest-record', silent: true })`。
- 已补充 manager 回归测试覆盖 active purpose lifecycle lock、非当前 owner lock、无 lock、缺失动画候选、非法 request；IPC 测试覆盖窄 payload；消息队列测试覆盖推荐任务启动后的 `playFeedback` 调用。
- `no-renderer` 暂作为 `SpriteFeedbackResult` 的预留可观测原因；当前 manager 版本还没有独立的 renderer availability 判断，因此第一版不会主动返回该 reason。

## 9. 推荐开工顺序

最稳的顺序是：

1. 做 Phase 1 的纯运行时，不碰文件菜单和 workflow。
2. 做 Phase 2 的 `playId` 和 presentation lock，解决可靠性。
3. 做 Phase 2.5 的状态机动画锁与 routine 生命周期锁，补齐展示边界。
4. 做 Phase 3 的事件等待和历史，让 Routine 可观测。
5. 做 Phase 4/5 的文件投递和 workflow，完成核心产品体验。
6. 做 Phase 6 的目的仲裁，开始接入少量 BehaviorEngine 行为。
7. 做 Phase 7 的 AI planner，让 AI routine 只能通过受限 DSL 与 fallback preset 进入运行时。
8. 做 Phase 8 的每日复盘 / Memory Note / 自发说话上下文，把“角色为什么做过这些行为”接成可消费的数据面。

这样每一步都能独立验收，并且不会破坏现有 BehaviorEngine 的稳定性。
