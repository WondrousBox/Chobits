# Sprite 目的与连续动作编排系统设计

> **mini 分支注记**：文中引用的新手引导 / Quest 系统（原 docs/onboarding-system）已移除；`onboarding.*` preset routine 本身仍在 sprite-core 中保留。编排器主体设计仍然有效。

> 状态：规划文档；Phase 1-8 基础闭环已按实施方案落地，剩余项进入后续强化 / 产品化 backlog
> 日期：2026-05-03
> 范围：桌面精灵动画播放、窗口移动、等待、消息、用户选择、后台任务与“行为目的”的统一编排。
>
> **2026-05-20 关联**：新手引导 / 任务系统（[docs/onboarding-system/README.md](../onboarding-system/README.md)）将复用本编排器作为执行层，并在此之上抽出 Quest 调度层。Onboarding 暴露出对本编排器的三项扩展需求：
>
> 1. 新增 `showNotice` step，承载带按钮气泡（数据层 `NoticeMessage.buttons` 与 UI 层 `NoticeRenderer` 已就绪）；
> 2. 新增 `clearMessage` step，用于创建成功后清理常驻引导气泡；
> 3. 气泡按钮点击需桥接为 `purpose-event`（约定 `bubble:action`，payload 携带 `messageId` / `actionId`），供 `waitForEvent` / `loopUntil` 解锁；
> 4. 气泡手动关闭需桥接为 `purpose-event`（约定 `bubble:dismissed`），这样固定引导 routine 可以在气泡仍打开时不重复提示；对于工作空间这类必须完成的新手任务，关闭气泡只会触发短暂缓冲后的继续重提，不会让任务静默放弃。
>
> 这些扩展不破坏现有 preset/AI planner 接口，预设 routine 不受 `DEFAULT_SPRITE_PURPOSE_PLANNER_WINDOWS` 白名单约束，可直接 `openWindow: 'workspaceWizard'` 等。
> 2026-05-20 追加：机能扩展里的“AI 目标规划 / 目的规划器”需要提供“执行现有目标预设”的诊断入口。当前已保留 `daily.care.reminder` planner/fallback 试跑，并新增 `onboarding.workspace.create` 预设执行按钮，用于在已有 workspace 的电脑上验证创建引导表现层，而不修改 quest 状态或发放 quest 奖励。
>
> 2026-05-20 校正：`onboarding.workspace.create` 不是 AI 目的规划用例，而是固定新手 Quest。它必须通过 `plannerMode: 'preset-only'` 绕过 LLM，按 preset routine 展示创建提示、按钮打开创建窗口、角色走到窗口旁、窗口打开期间讲解工作空间用途和快速创建方式、气泡打开时不重复提示、气泡关闭后短暂缓冲并继续提示、关闭向导未创建后立即继续提示、创建成功后庆祝并由 QuestEngine 幂等奖励。

## 0. 原始需求

以下为本设计必须保留和回应的原始需求：

> 分析我整个角色的动画播放和工作原理，我现在想实现一种目的，就是给角色制定一连串需要播放的动画和等待等等，然后一次连续播放。比如假设角色自己要做到某个程度的事情，有可能单独播放一个动画是不可能实现的。就比如说，假设角色要走到拼命正中新，让用户拖拽一个文件角色，等到角色接收到文件之后，由会自动播放思考或者别的动画，接着弹出选择框，让用户选择要对文件进行的操作，等待操作的过程中，可能角色又希望播放别的动画来缓解尴尬或者提示正在执行任务之类的。等到文件的操作完成了，可能还需要播放完成动画，接着角色可能还需要走回屏幕角落。我认为这一连串的动作可能需要一个编排，并且未来这个编排可能是AI自己计算自己思考实现的。那也有可能编排是有很多预设的，每个预设都要有要达到的目的，可能当前角色正在执行一连串动作就是为了达到某种目的而已。比如角色可以走到屏幕中间就是为了提醒用户要早点休息，但是假设有更重要的事情发生的时候，可能这个目的又变更了。哪怕角色原地待机也是一种目的。所以我认为这个桌面助手每次启动站在屏幕里面就是带着目的的。这个应该要像角色定时总结出想说的话一样，也是有一个历史记录记住角色这些行为目的的。我需要你完整的规划一个实现方式，列出文档，放到docs里面。而且要保留我给你说的这些原始需求。

## 1. 现有动画播放与行为工作原理

当前 sprite runtime 已经完成“主进程统一决策、渲染进程纯展示”的架构。关键链路如下：

```text
用户交互 / 业务事件 / BehaviorEngine tick
  -> SpriteManager
  -> SpriteStateMachine 或 SpriteManager.trigger()
  -> AnimationRegistry 按 trigger 选动画
  -> sprite:play IPC
  -> SpriteStateContext 保存 currentAnimation
  -> VideoSprite + VideoSpriteDriver 播放视频
  -> sprite:anim-complete IPC 回报完成
  -> SpriteManager 视情况回到 idle
```

### 1.1 状态机

`packages/sprite-core/state-machine.ts` 定义主状态：

- `idle`
- `walking`
- `running`
- `dragging`
- `sleeping`
- `reacting`
- `bored`

`reacting` 有子状态：`click`、`hold`、`drop`、`file-drag-over`、`file-drop`、`sleepy`、`custom`。

状态变化由 `SpriteManager.onStateChange()` 收口，随后用 `mapStateToEventType()` 把状态映射为动画 trigger。例如 walking 映射到 `walk`，file drag over 映射到 `fileDragOver`。

### 1.2 动画选择

`AnimationRegistry` 维护动画资源：

- 一个动画可声明多个 trigger。
- 同一个 trigger 可有多个动画，用 `priority` 排序。
- 动画可带 `condition`，按 persona state 过滤。
- 找不到状态动画时，状态驱动链路可 fallback 到 `idle`。

`SpriteManager.trigger(trigger, options)` 是显式触发入口：查找动画、发送 `sprite:play`、可显示气泡，也可 `silent`。

### 1.3 播放控制

`VideoSprite` 从 `SpriteStateContext` 读取 `currentAnimation`。真正的视频 phase 管理由 `VideoSpriteDriver` 做：

- 普通视频：依赖原生 `ended` 或自定义 loop 边界。
- 三段式视频：`intro -> loop -> outro`。
- `loopStartMs` / `loopEndMs` 存在时，可在 loop 段停留。
- `playbackSession.mode = timed` 时，trigger 动画可循环一段指定时长，再进入 outro。
- 播放完成后通过 `sprite:anim-complete` 通知主进程。

当前限制：播放完成只上报 `outro/full`，没有通用 promise 化的 “play animation and wait until done” API，编排器需要补这一层。

### 1.4 窗口移动

窗口移动由 `WindowController` 和 `MovementCoordinator` 负责：

- `walkTo(x, y, speed)`：按贝塞尔路径走到指定位置，返回 Promise。
- `startDrag/endDrag`：拖拽时主进程轮询鼠标位置。
- `startAutoMove`：动画播放期间的方向移动。
- `runBehaviorMovement()`：BehaviorEngine 触发的自动行走。

当前限制：movement 可以被动画或行为触发，但还不是一个可组合的“编排 step”。例如“走到屏幕中心，等待用户投递文件，再走回角落”需要更高层协调。

### 1.5 行为引擎与 AI 自发说话

`BehaviorEngine` 每秒 tick，按条件、优先级、冷却、每日次数选择行为。默认行为包括自动行走、困倦、无聊、随机消息、闲置动作、闲置情感、氛围动画、季节问候等。

AI 自发说话链路已经存在：

```text
idle-action behavior
  -> SpriteSpontaneousUtteranceExecutor
  -> SpriteSpontaneousUtteranceService
  -> AI 生成 text + recommendedAction
  -> SpriteManager.trigger(action) + SpriteManager.speak(text)
  -> JSONL 历史记录
```

这个模式很适合复用：新系统也应让 `sprite-core` 定义接口，Electron main 注入 AI/存储实现。

### 1.6 与现有 BehaviorEngine 的关系

本方案不替换、不削弱现有 `BehaviorEngine`。现有行为引擎已经承担了非常关键且强大的职责：

- 什么时候触发一个行为。
- 在什么状态、条件、冷却、概率、每日上限下允许触发。
- 不同行为之间的基础优先级。
- idle、自动行走、情绪表达、氛围动画、AI 自发说话等日常行为调度。

Purpose/Routine 层应该建立在它之上，负责另一件事：**当某个行为不再是单点动作，而需要一整套连续表现时，把它封装成可等待、可打断、可记录的成套行为方案。**

推荐分工：

```text
BehaviorEngine
  负责“该不该开始一个行为”

PurposeManager
  负责“这个行为是为了什么目的，以及是否能覆盖当前目的”

RoutineRunner
  负责“这个目的要按什么顺序连续执行动作”
```

也就是说，`BehaviorEngine` 仍然是行为触发的底座；Purpose/Routine 是它的上层编排与叙事层。未来即使 AI 参与规划，也应该生成 Routine，而不是绕过或重写 BehaviorEngine 的调度规则。

## 2. 问题定义

现在的系统能很好地做到“某个事件播放一个动画”，但还不能自然表达：

- 一个目标由多个动作组成。
- 中途要等待动画结束、等待用户选择、等待文件投递、等待后台任务。
- 执行中要保持角色有存在感，例如思考、等待、忙碌、完成、走回角落。
- 当前行为可能被更重要的目的打断、暂停、取消或替换。
- idle 本身也是目的，而不是“没有目的”。
- 行为目的需要像自发说话一样留历史，供未来 AI 复盘、总结和决策。

因此需要新增一个高层系统：**Purpose + Routine Orchestration**。

这里的“高层”很重要：它不是新增一套和 `BehaviorEngine` 平行竞争的行为引擎，而是在现有行为引擎、状态机、动画注册表、窗口移动能力之上，增加“成套行为方案”的封装。

## 3. 核心概念

### 3.1 Purpose：角色当前目的

Purpose 是“角色为什么正在做这些事”。它不是单个动画，而是意图、优先级、上下文和可完成条件。

示例：

- `idle.presence`：安静待机，维持陪伴感。
- `file.intake`：引导用户把文件交给角色。
- `file.operation`：处理用户投递的文件。
- `daily.rest-reminder`：提醒用户早点休息。
- `task.progress`：陪伴等待后台任务完成。
- `return.corner`：回到屏幕角落，不打扰用户。

建议字段：

```ts
type SpritePurposeStatus = 'planned' | 'active' | 'paused' | 'completed' | 'cancelled' | 'superseded' | 'failed';

interface SpritePurpose {
  id: string;
  kind: string;
  title: string;
  reason: string;
  status: SpritePurposeStatus;
  priority: number;
  interruptPolicy: 'never' | 'cooperative' | 'interruptible' | 'urgent';
  startedAt?: number;
  endedAt?: number;
  parentPurposeId?: string;
  supersededBy?: string;
  context?: Record<string, unknown>;
  expectedOutcome?: string;
}
```

### 3.2 Routine：为目的服务的一串动作

Routine 是 Purpose 的执行计划，由 steps 组成。一个 Purpose 可以由预设 Routine 生成，也可以由 AI 生成。

```ts
interface SpriteRoutineGuideGoalDefinition {
  id: string;
  kind: 'workspace.exists' | 'ai.chat-provider-configured' | string;
  description: string;
  blocking?: boolean;
}

interface SpriteRoutinePresetDefinition {
  id: string;
  title: string;
  purposeKind: string;
  defaultPriority: number;
  goal?: SpriteRoutineGuideGoalDefinition;
  steps: SpriteRoutineStep[] | ((purpose: SpritePurpose) => SpriteRoutineStep[]);
}

interface SpriteRoutine {
  id: string;
  purposeId: string;
  source: 'preset' | 'ai' | 'system' | 'user';
  status: 'queued' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';
  steps: SpriteRoutineStep[];
  cursor: number;
  createdAt: number;
}
```

Routine 可以理解为“成套行为方案”。它不是决定行为是否发生的调度器，而是当某个行为已经发生、并且单个动画不足以表达时，提供一组连续动作：

- 开场动作：走到哪里、说什么、播放什么引导动画。
- 中段动作：等待用户或任务时如何表现。
- 结果动作：成功、失败、取消时如何收尾。
- 归位动作：是否回到角落、是否恢复 idle。

这样每个行为可以同时保留轻量版本和成套版本：

```text
轻量版本：BehaviorEngine action -> mgr.trigger('thinking')
成套版本：BehaviorEngine action -> mgr.startPurpose('file.intake')
```

`goal` 是 routine preset 的目标声明，不直接执行 IPC。它回答“这套引导最终希望用户达成什么状态”。渲染层或主进程适配器按 `goal.kind` 绑定真实检查函数，在阻断式入口先评估目标：

- `workspace.exists`：至少有一个未删除 workspace。未达成时启动 `workspace.create` Quest，而不是裸开 `workspaceWizard`。
- `ai.chat-provider-configured`：至少有一个可用于聊天的 provider preset 已配置 API Key；发送消息时收窄到当前 provider / preset。未达成时先运行 `chat.api-config-guide`，原聊天动作不继续。该 guide 先展示带“去配置”按钮的 notice，不直接打开设置页；用户点击后才打开 `settings` 并传入 `category: 'ai'`、`aiProviderId`、可选 `aiPresetId`，让页面定位到模型服务配置区。

`goal` 与 Quest 的 `completion` 不冲突：Quest completion 负责任务状态和奖励结算，preset goal 负责入口放行和引导意图复用。一个 routine 可以既被 Quest 使用，也可以被普通入口作为阻断式 guide 使用。

### 3.3 Step：可等待、可取消的最小编排单元

建议第一版支持这些 step：

- `playAnimation`：播放 trigger 或 animationId；默认 fire-and-forget，只有显式 `waitFor: 'duration'` / `'complete'` 时才阻塞 routine。
- `walkTo`：走到位置，等待移动完成。
- `wait`：等待固定时间。
- `waitForEvent`：等待事件，如 `file-drop`、用户选择、任务完成。
- `showToast` / `speak` / `showNotice` / `showBusy`：展示与说话。
- `openWindow`：打开选择框，例如 `fileActionsMenu`。
- `runTask`：启动后台任务或 workflow。
- `loopUntil`：在任务未完成时循环播放等待动画或提示。
- `sequence`：在并行分支里包一组有先后关系的子步骤，例如先 `walkTo` 到业务窗口旁，再播放朝向窗口的动画。
- `parallel`：并发执行多个子步骤，适合一边移动一边提示，或一边等待业务结果一边播放局部引导动作。
- `branch`：根据事件结果、用户选择、任务结果走不同分支。
- `setPurposeStatus`：标记目的完成、失败或被替代。
- `returnToAnchor`：回到角落、上次位置或预设位置。

普通 `speak` / `showToast` 气泡只显示当前台词或轻量提示。多句台词靠 routine 的顺序 step、`wait` 缓冲或 `parallel` 并行编排；若并行中的某个分支自己也需要顺序，使用 `sequence`，不要为这种“链接态”额外拆 purpose。需要用户确认或选择时统一使用 `showNotice.buttons`。

Preset 编写层允许更轻的 `SpriteRoutineStepInput`，由 `SpriteRoutinePresetRegistry.createRoutine()` 统一生成完整 `SpriteRoutineStep`。Runner 和 AI planner 仍以严格 step 为边界。

Preset 中还可以用数组表达 shorthand `sequence`。这只是编写层语法糖，例如 `[walkToStep, 'playAnimation lookLeft silent']` 会被 registry 标准化为 `{ type: 'sequence', body: [...] }`；runner、history 和 AI planner 仍只看到严格对象 step。

等待节奏支持三种兼容写法：

- 完整 wait step：`{ id: 'breath', type: 'wait', durationMs: 3600 }`，适合需要明确 id、`interruptEvent` 或测试锚点的等待。
- 数字 shorthand：`3600`，等价于自动补 id 的 wait step。
- `waitAfter`：配置在任意 step 上；`waitAfter: true` 复用当前 step 的自然展示/执行时长，`waitAfter: 800` 则额外等待 800ms。若同时配置 `waitAfter` 和后续 wait step，两段等待会叠加。

三种写法的执行记录差异，以及 `waitAfter: true` 的具体字段映射，维护在 [sprite-purpose-routine-implementation-plan.md](./sprite-purpose-routine-implementation-plan.md#421-preset-shorthand-与等待写法)。

示例 step 类型：

```ts
type SpriteRoutineStep =
  | { id: string; type: 'walkTo'; target: 'center' | 'corner' | { x: number; y: number }; speed?: number; timeoutMs?: number }
  | { id: string; type: 'playAnimation'; trigger?: string; animationId?: string; durationMs?: number; waitFor?: 'complete' | 'duration' | 'none'; silent?: boolean }
  | { id: string; type: 'wait'; durationMs: number }
  | { id: string; type: 'waitForEvent'; event: string; timeoutMs?: number; assignTo?: string }
  | { id: string; type: 'speak'; text: string; bubbleDuration?: number; waitAfter?: number | boolean }
  | { id: string; type: 'showNotice'; content: string; buttons?: Array<{ id: string; label: string }> }
  | { id: string; type: 'openWindow'; window: string; payload?: Record<string, unknown>; waitForEvent?: string }
  | { id: string; type: 'runTask'; task: string; input?: Record<string, unknown>; assignTo?: string }
  | { id: string; type: 'loopUntil'; untilEvent: string; body: SpriteRoutineStep[]; maxDurationMs?: number }
  | { id: string; type: 'sequence'; body: SpriteRoutineStep[] }
  | { id: string; type: 'parallel'; body: SpriteRoutineStep[] }
  | { id: string; type: 'branch'; by: string; cases: Record<string, SpriteRoutineStep[]>; default?: SpriteRoutineStep[] };
```

## 4. 推荐架构

在现有 `BehaviorEngine` 之上新增四个编排模块：

```text
packages/sprite-core/
  purpose/
    purpose-types.ts
    purpose-manager.ts
    routine-runner.ts
    routine-presets.ts
    routine-history.ts

electron/main/handlers/sprite/
  purpose-service.ts
  purpose-runtime.ts
```

### 4.1 PurposeManager

职责：

- 保存当前 active purpose。
- 接收来自 BehaviorEngine、用户事件、系统事件或 AI planner 的 purpose 请求，并做优先级仲裁。
- 决定打断、排队、暂停、替换还是忽略。
- 生成 Routine 并交给 RoutineRunner。
- 把 purpose 状态写入历史。

它不负责定时 tick，不负责概率，不负责行为冷却。这些仍然属于 `BehaviorEngine`。

Priority 建议：

| 优先级 | 类型                             |
| ------ | -------------------------------- |
| 100    | 用户显式操作、文件投递、重要错误 |
| 80     | 正在执行的用户任务进度           |
| 60     | 日常提醒、定时关怀               |
| 30     | AI 自发说话、小动作              |
| 10     | idle presence、氛围动画          |

### 4.2 RoutineRunner

职责：

- 串行执行 steps。
- 每个 step 都返回 `Promise<StepResult>`。
- 支持取消 token。
- 支持等待动画完成、窗口移动完成、用户事件、后台任务事件。
- 把 step 开始、完成、失败、取消写入 history。

第一版不要把 RoutineRunner 做成 `BehaviorEngine` 或工作流引擎的替代品。它只负责“角色身体和桌面表现”的连续编排；触发条件仍交给 `BehaviorEngine`，真正文件处理仍交给现有 Resource / Workflow / AI task 系统。

### 4.3 RoutinePresetRegistry

预设 Routine 用于稳定场景：

- `idle.presence`
- `file.drop.intake`
- `file.operation.waiting`
- `daily.rest-reminder`
- `task.completed`
- `return.corner`

AI 未来可以输出 Routine DSL，但必须先通过校验器：

- step 类型必须在 allowlist。
- 总时长必须有限。
- 只能打开 allowlist 窗口。
- 只能等待 allowlist event。
- 必须有取消/超时策略。
- 不能绕过文件权限和任务权限。

### 4.4 PurposeHistory

像自发说话一样写 JSONL，第一版可放：

```text
<userData>/data/sprite-purpose-history-YYYY-MM-DD.jsonl
```

长期记忆消费不直接写每个 step；当前已由每日 retrospective 汇总高价值 purpose，再通过注册到 Memory 模块的 provider 在 Memory index / daily index 生成前同步为固定路径的 `Sprite Purpose Retrospective` Memory Note。

日志字段：

```ts
interface SpritePurposeHistoryEntry {
  timestamp: number;
  eventType:
    | 'purpose.created'
    | 'purpose.started'
    | 'purpose.superseded'
    | 'purpose.completed'
    | 'purpose.failed'
    | 'routine.started'
    | 'step.started'
    | 'step.completed'
    | 'step.failed'
    | 'step.cancelled';
  purposeId: string;
  routineId?: string;
  stepId?: string;
  purposeKind?: string;
  priority?: number;
  source?: 'preset' | 'ai' | 'system' | 'user';
  status?: string;
  summary?: string;
  contextDigest?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: string;
}
```

### 4.5 BehaviorEngine 接入模式

现有行为不需要整体迁移。推荐使用渐进式接入：

#### 模式 A：保持单点行为

适合眨眼、呼吸、轻微情绪表达、短 toast 等低成本行为。

```ts
behavior.action = () => {
  mgr.trigger('blink', { silent: true });
};
```

#### 模式 B：行为升级为成套方案

适合文件投递、休息提醒、长任务陪伴、错误恢复、升级庆祝等需要多个动作连续表达的行为。

```ts
behavior.action = () => {
  mgr.startPurpose({
    kind: 'daily.rest-reminder',
    reason: '夜间定时关怀触发，希望用一组动作提醒用户休息。',
    source: 'behavior',
    presetId: 'daily.rest-reminder'
  });
};
```

#### 模式 C：外部事件直接创建 Purpose

适合用户拖入文件、任务完成、重要错误、插件事件等不一定经过 BehaviorEngine 的高优先级场景。

```ts
mgr.startPurpose({
  kind: 'file.intake',
  reason: '用户向角色投递了文件。',
  source: 'user-event',
  context: { files }
});
```

这个接入模式可以保护现有行为引擎：只有“需要成套表现”的行为才调用 Purpose/Routine；其余行为继续走原有 `trigger()` / `playOnce()` / `showToast()` 链路。

## 5. 文件投递场景编排示例

目标：角色走到屏幕中心，引导用户投递文件，收到文件后思考，弹出选择框，等待用户选择和任务完成，期间播放等待动画，完成后播放完成动画并回到角落。

```json
{
  "purpose": {
    "kind": "file.intake",
    "title": "接收并处理用户投递的文件",
    "reason": "用户拖拽文件到桌面角色，需要角色主动承接后续操作。",
    "priority": 100,
    "interruptPolicy": "urgent"
  },
  "routine": [
    { "id": "go-center", "type": "walkTo", "target": "center", "speed": 120, "timeoutMs": 8000 },
    { "id": "invite", "type": "playAnimation", "trigger": "fileDragOver", "durationMs": 1800, "waitFor": "duration" },
    { "id": "wait-drop", "type": "waitForEvent", "event": "sprite:file-drop", "timeoutMs": 120000, "assignTo": "files" },
    { "id": "thinking", "type": "playAnimation", "trigger": "thinking", "durationMs": 1600, "waitFor": "duration", "silent": true },
    { "id": "open-menu", "type": "openWindow", "window": "fileActionsMenu", "payload": { "from": "$files" }, "waitForEvent": "fileAction:selected" },
    {
      "id": "wait-task",
      "type": "loopUntil",
      "untilEvent": "fileAction:completed",
      "maxDurationMs": 600000,
      "body": [
        { "id": "waiting-anim", "type": "playAnimation", "trigger": "waiting", "durationMs": 2500, "waitFor": "duration", "silent": true },
        { "id": "waiting-line", "type": "speak", "text": "我在处理，马上就好。", "bubbleDuration": 3000, "waitAfter": 5000 }
      ]
    },
    { "id": "done", "type": "playAnimation", "trigger": "success", "durationMs": 2200, "waitFor": "complete" },
    { "id": "return", "type": "walkTo", "target": "corner", "speed": 110, "timeoutMs": 10000 }
  ]
}
```

## 6. idle 也是目的

启动后角色不应处于“无目的”状态，而应自动创建一个低优先级 purpose：

```ts
{
  kind: 'idle.presence',
  title: '安静陪伴',
  reason: '应用启动后维持低打扰陪伴状态，等待用户或系统事件。',
  priority: 10,
  interruptPolicy: 'interruptible'
}
```

现有 BehaviorEngine 的 idle 行为可以在历史和语义上归入这个 Purpose，但调度权仍留在 BehaviorEngine：

- `idle-action` 仍由 BehaviorEngine 触发，但记录为 idle purpose 下的小动作。
- `idle-emotion` 仍由 BehaviorEngine 触发，但记录为 idle purpose 下的情绪表达。
- `idle-ambient` 仍由 BehaviorEngine 触发，但记录为 idle purpose 下的氛围维持。
- AI 自发说话仍走现有链路，但可记录为 idle purpose 里的可选子目的。

这样一来，系统可以在历史中回答“角色刚才为什么突然说话/移动/眨眼”：因为它正在执行 `idle.presence`，并且触发了某个低优先级 routine step。

## 7. 打断与目的变更

当新目的到来，PurposeManager 做仲裁：

```text
新 purpose priority > 当前 priority 且当前 interruptPolicy 允许
  -> cancel 当前 RoutineRunner
  -> 当前 purpose 标记 superseded
  -> 启动新 purpose

新 purpose priority 接近当前 purpose
  -> 如果当前 step 是 interruptible，切换
  -> 如果当前 step 是 critical，排队

新 purpose priority 更低
  -> 忽略、合并，或排队到 idle 后执行
```

示例：

- 角色正在走到中间提醒休息。
- 用户拖进文件。
- `file.intake` priority 100 高于 `daily.rest-reminder` priority 60。
- 休息提醒被标记 `superseded`，角色改为接收文件。

## 8. 与现有系统的集成点

### 8.1 SpriteManager

新增方法：

```ts
startPurpose(request: StartSpritePurposeRequest): Promise<SpritePurposeStartResult>;
cancelPurpose(purposeId: string, reason?: string): Promise<void>;
getCurrentPurpose(): SpritePurpose | null;
listPurposeHistory(query?: SpritePurposeHistoryQuery): Promise<SpritePurposeHistoryItem[]>;
```

同时为 RoutineRunner 暴露内部能力的 promise 封装：

```ts
playAnimationStep(input): Promise<StepResult>;
walkToStep(input): Promise<StepResult>;
waitForSpriteEvent(input): Promise<StepResult>;
```

### 8.2 IPC / preload

新增：

- `sprite:purpose:start`
- `sprite:purpose:cancel`
- `sprite:purpose:getCurrent`
- `sprite:purpose:listHistory`
- `sprite:purpose:state` 下行广播

### 8.3 FileDropCollector

当前 `useFileDropCollector` 在 drop 后直接：

- 上报 `sprite:file-drop`
- 导入资源
- 打开 `fileActionsMenu`

新架构中建议调整为：

- drop 事件仍先上报。
- 资源导入可以作为 `file.intake` routine 的 `runTask` 或外部事件结果。
- `fileActionsMenu` 的打开由 routine 的 `openWindow` step 管理。

这样角色动作、窗口弹出和等待任务能被同一个目的历史串起来。

### 8.4 Workflow 系统

文件处理不要塞进 sprite-core。Routine step 只发起或等待 workflow：

```text
runTask(file.summary)
  -> packages/workflow engine
  -> progress event
  -> completed event
  -> RoutineRunner 继续
```

### 8.5 AI 生成编排

复用自发说话的模式：

- `sprite-core` 定义 `SpritePurposePlannerExecutor` 接口。
- Electron main 实现 `SpritePurposePlannerService`。
- AI 输入：当前 purpose、persona、用户上下文、可用 presets、可用 step schema、最近目的历史。
- AI 输出：受限 Routine DSL。
- 校验失败时 fallback 到 preset。

AI planner 的入口也应优先来自现有行为体系。例如某个 BehaviorEngine 行为触发后，可以选择：

- 继续执行原来的单点 `mgr.trigger()`。
- 或者升级为一个 purpose request，由 preset/AI 生成 Routine。

这样现有行为引擎仍然控制“什么时候开始”，AI 只参与“开始之后如何连续表现”。

## 9. 推荐落地阶段

### Phase 1：纯预设编排，不接 AI

目标：先让连续动作跑起来。

- 新增 Purpose / Routine 类型。
- 新增 RoutineRunner。
- 支持 `playAnimation`、`walkTo`、`wait`、`waitForEvent`、`speak`、`openWindow`。
- 新增 purpose history JSONL。
- 接入 `file.intake` 和 `idle.presence` 两个预设。
- 保持 BehaviorEngine 代码基本不动，只在已有 action 中可选调用 `startPurpose()`。

### Phase 2：接入后台任务与等待动画

目标：覆盖文件操作全过程。

- 支持 `runTask`、`loopUntil`、`sequence`、`parallel`、`branch`。
- 监听 workflow/resource/file action 事件。
- 将 busy/progress 与等待动画联动。
- 完成后播放 success/failure routine。

### Phase 3：目的仲裁

目标：允许目的变更。

- 实现 priority + interruptPolicy。
- 支持 cancel token。
- 支持当前目的 superseded / resumed / cancelled。
- 将 BehaviorEngine 低优先级行为在语义和历史上归档到 `idle.presence`，但不迁移其调度逻辑。

### Phase 4：AI 规划

目标：让 AI 能“想出自己该怎么做”。

- 新增 planner executor/service。
- 给 AI 提供 step schema、presets、可用动画 trigger、当前屏幕位置、最近历史。
- AI 只能输出受限 DSL。
- 校验失败回退预设。
- 历史中记录 planner prompt digest、输出摘要、fallback 原因。

### Phase 5：长期记忆与复盘

目标：让角色记住自己为什么做过这些行为。

- PurposeHistory 每日摘要。
- 高价值 purpose 通过注入的 provider/hook 写入 Memory 系统。
- 自发说话生成时可通过注入的 provider 引用最近 purpose 历史；当前已通过每日 retrospective 摘要接入，避免逐 step 噪声。
- 角色状态页展示“最近目的”。

实施补充（2026-05-03）：

- 已新增每日 retrospective 数据面：从 PurposeHistory JSONL 汇总每日目的统计、高价值 purpose 与 Memory-compatible recall cues。
- 已通过 `sprite:purpose:getDailyRetrospective` 暴露给状态页，并由主进程组合层把 retrospective provider 注册给 Memory 模块，在 Memory index / daily index 生成前自动写成 `Sprite Purpose Retrospective` Memory Note。
- 自发说话已通过构造注入的 retrospective provider 读取每日复盘摘要作为 prompt 上下文；长期记忆与闲置表达都消费每日复盘摘要，而不是逐 step 直写。

## 10. 关键实现注意事项

- 不要重写 BehaviorEngine。它继续负责触发条件、冷却、概率、每日上限和基础优先级。
- Purpose/Routine 只封装“触发后的一串连续表现”，不接管日常行为调度。
- 不要让渲染进程成为编排权威。渲染进程继续只负责采集事件和展示。
- 不要把所有业务任务塞进 sprite-core。sprite-core 只编排“角色表现”。
- 每个 step 必须有 timeout 或取消策略。
- 动画完成需要 promise 化，但不能依赖所有动画都有完整 metadata；必须允许 duration fallback。
- `walkTo` 已经返回 Promise，是最容易纳入 step 的能力。
- `trigger()` 当前是 fire-and-forget，需要增加 `playAnimationAndWait()` 一类内部能力。
- 三段式动画要明确 wait 策略：省略 `waitFor` 等同 `none`；需要控制 routine 节奏时显式使用 `duration` 或 `complete`。
- purpose history 不应无限增长；需要按日期 JSONL、查询 limit、未来清理策略。
- AI 规划必须是“建议计划”，执行前必须校验。
- 固定 Quest（尤其 onboarding）不是 AI 规划建议。Quest 下发的 purpose 应明确使用 preset-only，避免目的规划器开关或 LLM 输出改变新手引导流程。
- 阻断式引导不要在打开业务窗口后才补提示。入口应先评估 preset `goal`；未达成时启动对应 guide purpose / quest，并停止原用户动作。已达成才继续打开聊天、菜单或其他业务窗口。若 guide 需要带用户跳到配置页，必须用 notice 按钮等待用户确认，不能在 routine 开始后自动跳转。
- `walkTo` 除 `center/corner/previous/{x,y}` 外，预设 routine 可以使用 `{ window, placement, offset }` 目标，让角色走到已打开的应用窗口旁；AI planner 不允许生成 window-relative target。

## 11. 最小可用设计结论

最小可用版本可以这样理解：

```text
BehaviorEngine 决定“什么时候开始”
PurposeManager 决定“为什么做”
RoutinePresetRegistry 决定“做哪些步骤”
RoutineRunner 负责“一步一步做，并等待”
SpriteManager 提供“播放、说话、移动、消息、事件等待”的原子能力
PurposeHistory 记录“为什么、做了什么、结果如何”
```

这与当前 runtime 的方向一致：主进程掌握决策权，渲染进程保持轻量展示。先用预设把文件投递和 idle presence 打通，再把 AI 规划作为受限 DSL 接进来，是风险最低、扩展性也最好的路线。

## 11. 2026-05-04 休息提醒位移修正

原始需求里的“角色可以走到屏幕中间就是为了提醒用户要早点休息”是一个说明目的与动作距离关系的例子，不是 `daily.rest-reminder` 的固定交互要求。

设计修正：

- `daily.rest-reminder` 的默认 preset 应该表达“提醒休息”本身，默认在当前位置播放注意/疲惫动画并说话，不强制走到屏幕中心，也不强制回角落。
- 走到屏幕中心可以作为 AI planner 或更具体 routine 根据上下文选择出来的空间表达，例如需要更强注意力、用户明确偏好、或当前角色位置太边缘导致提醒不明显。
- 文档中后续提到“角色正在走到中间提醒休息”的地方都应理解为某次被规划出的 routine 状态，而不是 rest reminder 的不可变动作模板。
- 文件投递邀请 `file.drop.invite` 仍然可以固定走到中心，因为它服务于用户拖拽文件的可投递目标，不属于休息提醒的默认行为。
