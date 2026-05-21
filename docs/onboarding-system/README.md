# Onboarding & Quest System — 新手引导与任务系统

> **状态**：基础闭环已落地（2026-05-20）
> **负责模块**：`packages/sprite-core/quest/` + 复用 `packages/sprite-core/purpose/`
> **相关系统**：[Purpose & Routine](../sprite-core/sprite-purpose-routine-orchestration-plan.md) · [Persona Character](../persona-system/persona-character-system-design.md)

## 0. 当前落地范围

- 固定新手 Quest：`workspace.create`、`first-file-drop`、`open-resource-library`
- 独立任务展示层：`questList` 窗口（路由 `#/quest-list`）
- 任务数据 API：`quest:list` 返回 `QuestListSnapshot`，`quest:start` 从任务列表启动/继续固定 Quest
- 入口：助手右键菜单中的“任务”，以及 AI app-window 工具目录中的 `questList`

任务列表窗口只展示和启动 Quest，不生成流程、不调用 LLM。点击“开始引导/继续引导”会回到对应 Quest 的 preset-only routine，例如 `workspace.create` 会继续走气泡按钮、创建窗口陪同、窗口讲解、成功奖励这一套固定流程；`first-file-drop` 会让角色走到中心，提示用户把文件拖到角色身上，并在拖拽导入完成后结算奖励；`open-resource-library` 会引导用户右键助手，从菜单里打开资源库。

## 1. 背景与定位

### 1.1 2026-05-20 需求校正记录

这部分需求必须按固定 Quest 任务系统理解，不能再解释成"让 LLM 生成创建工作空间计划"。

用户原始要求记录：

- 引导创建空间的能力本来就是固定的，不需要 LLM 临场生成。
- AI/桌面角色要自动定时每隔几秒提示一次"还没有创建工作空间"。
- 提醒必须有节流机制：如果创建提示气泡已经打开，不要重复刷新、重复朗读或重复弹提示；但工作空间引导是必须完成的新手任务，用户关闭气泡只表示收起本次提示，仍未创建时必须短暂缓冲后继续提示。
- 提示气泡里必须有按钮，用户点击按钮去创建工作空间。
- 创建过程中，AI 要走到创建窗口旁边陪同。
- 创建窗口打开期间，AI 要说辅助介绍文案，例如解释工作空间的作用，并提示可以先用快速创建/默认目录开始。
- 如果用户没有创建就关掉窗口，AI 要及时提示"还需要创建"，并继续展示"去创建"按钮。
- 如果用户创建好了空间，AI 要有对应响应和奖励，奖励可以是经验和好感度。
- 这是新手引导任务系统，`workspace.create` 只是第一种任务，后续还会有更多固定任务。
- “拖拽文件到角色身上进行上传/导入”也必须作为新手任务补完整：任务列表展示、固定引导表现、资源事件完成判定和奖励都由 Quest 系统统一管理。
- “右键点击助手打开资源库”也必须作为新手任务：任务列表展示、引导用户右键助手、提示选择菜单里的“资源库”，并只在用户确实从助手菜单打开资源库时结算。
- Quest 必须设计“出发条件/启动方式”：`workspace.create` 属于启动后检测到未完成就自动触发；`first-file-drop` 属于用户准备执行时从任务列表点击“开始引导”触发，未来也可以由 AI 显式触发，但不应该在启动或刚创建工作空间后自动弹出。

产品结论：

- `workspace.create` 是 deterministic onboarding quest，不走 AI planner。
- `Purpose/Routine` 只是任务的表现执行层，`QuestEngine` 才是任务状态、完成和奖励的调度层。
- Quest 的事件语义拆成三类：`triggerEvents` 负责驱动完成/状态评估，`autoStartEvents` 负责允许系统自动启动，`explicitStartSources` 负责允许任务列表或 AI 这类显式入口启动。
- 设置页的"工作空间引导预设"只是开发测试入口，不是核心触发方式。
- “任务”窗口是正式的任务系统展示层，用于展示新手引导任务、状态和奖励；它不同于 AI 目标规划设置页。
- 文档和代码必须同步保留这条原始需求，避免后续再次误解为"AI 目的规划生成"。

### 1.2 当前变更偏差分析

上一轮本地变更已经补了一些基础设施，但没有完整实现上述固定流程：

- `QuestEngine` 能在 `APP_STARTED` 启动 `workspace.create`，也能在 `WORKSPACE_CREATED` 发奖，但 active 状态主要靠启动重试，不是一个持续的新手任务循环。
- routine 先打开 `workspaceWizard`，再说话和展示 notice，这与"先气泡提示，点击按钮去创建"不一致。
- `WORKSPACE_WIZARD_CLOSED` 只让 routine 结束或等下次启动，关闭后没有立刻回到"继续去创建"按钮提示。
- 没有让角色走到创建窗口旁边，只有普通 `openWindow`。
- 手动测试入口放在 AI 目标规划设置里可以保留，但它不能代表真实新手引导触发链路。
- 如果 AI planner 开启，`onboarding.workspace.create` 仍可能被 planner 介入；固定 Quest 必须显式 `plannerMode: 'preset-only'`。

本轮修正后的行为：

- Quest 下发的 `onboarding.workspace.create` purpose 强制 preset-only。
- routine 以 `loopUntil(WORKSPACE_CREATED)` 持续运行，每轮展示带按钮的常驻 notice。
- notice 按钮派发 `purpose-event: bubble:action` 并打开/聚焦 `workspaceWizard`；notice 手动关闭会派发 `purpose-event: bubble:dismissed`。
- routine 展示 notice 后等待 `bubble:action` / `bubble:dismissed` / `WORKSPACE_CREATED`：气泡仍打开时不重复提示；气泡关闭后按强制引导重提节奏继续展示；窗口未创建就关闭时立即替换为"去创建"提示。
- 点击后 routine 先清掉邀请 notice，再 `openWindow('workspaceWizard')`，接着 `walkTo({ window: 'workspaceWizard', placement: 'right' })`。
- `workspaceWizard` 打开后，routine 在等待 `WORKSPACE_CREATED` / `WORKSPACE_WIZARD_CLOSED` 的同时讲解工作空间用途和快速创建提示；这些讲解有冷却，避免窗口保持打开时反复念。
- 窗口未创建就关闭时，routine 立即替换 notice 文案并继续下一轮提示。
- 创建成功时清理该 notice、播放庆祝动画并说成功文案；QuestEngine 负责幂等奖励。
- `first-file-drop` 已补成第二个固定新手 Quest：前置为已有工作空间，启动 `onboarding.file.drop` preset-only routine；真实拖拽仍由已有 `file.drop.invite` / `file.drop.intake` 接管；拖给角色创建的资源携带 `metadata.source = 'sprite-drop'` 后触发任务完成与 XP/好感奖励。
- `first-file-drop` 不配置 `autoStartEvents`，所以 `APP_STARTED` / `WORKSPACE_CREATED` 不会自动弹出拖拽引导；它通过任务列表 `quest:start` 或未来 AI 显式启动，并继续监听真实拖给角色的资源事件来结算。
- 普通资源创建/导入事件没有 `sprite-drop` 业务来源时，不会激活或完成 `first-file-drop`，避免用户通过资源页上传文件时误结算“拖给角色”任务。
- `open-resource-library` 已补成第三个固定新手 Quest：前置为已有工作空间，不配置 `autoStartEvents`；启动 `onboarding.resource.open-library` preset-only routine；右键菜单点击“资源库”会派发 `ASSISTANT_MENU_ITEM_SELECTED`，只有 payload 标记 `itemId=resources` 且 `source=assistant-context-menu` 时才结算。

目的规划器（`SpritePurpose` + `Routine`）已经能驱动桌面助手完成"调 AI → 拿到一串连续步骤 → 按步骤引导用户交互"的闭环。但对**新手引导**这类**确定性、不需要 AI 生成**的引导流程：

- 步骤完全可预设（创建工作空间、首次拖文件、首次开聊天等）
- 必须可重复触发（用户关掉向导没创建 → 还要继续提示）
- 完成后要奖励（XP / 好感度 / 成就），且**奖励只能发放一次**
- 必须可在已有 workspace 的开发机上手动试跑，不能靠删除真实工作空间来验证

直接用 AI planner 不合适：成本、稳定性、可控性都不达标。
直接写散落的 `useEffect` 也不合适：与已有目的规划器的"打断/优先级/动画展示锁/历史落盘"完全脱钩。

**结论**：在 `Purpose + Preset Routine` 之上薄薄抽出一层 **Quest（任务）**：

```
Quest 定义（声明前置/完成事件/奖励）
   │
   ├─→ 启动 Purpose（预设 routine 驱动角色行为）
   │
   ├─→ 监听完成事件（waitForEvent on app-event / purpose-event）
   │
   └─→ 完成后 grantReward（幂等 claim）
```

## 2. 与现有目的规划器的关系

| 维度     | Purpose                     | Quest                                                    |
| -------- | --------------------------- | -------------------------------------------------------- |
| 触发来源 | behavior / 用户 / 系统 / AI | Quest 引擎（监听条件后下发 purpose）                     |
| 步骤定义 | preset routine 或 AI draft  | 强制使用 preset routine                                  |
| 完成判定 | routine 末尾                | 独立 `completion` 谓词（可在 routine 外）                |
| 奖励     | 无                          | 必须有，幂等                                             |
| 持久化   | JSONL 历史                  | preferences `onboardingState` + persona `claimedRewards` |
| 并发     | priority 仲裁               | 同时只允许一个 active quest                              |

**Quest 不替代 Purpose，是它的上层调度器**。

## 3. 数据模型

### 3.1 Quest 定义

```ts
export type QuestCategory = 'onboarding' | 'daily' | 'achievement' | 'event';
export type QuestStartSource = 'task-list' | 'ai' | 'system';

export interface OnboardingQuestReward {
  xp?: number;
  favor?: number;
  achievementId?: string;
  dimensions?: Array<{ id: string; delta: number; maxValue?: number }>;
}

export interface OnboardingQuestDefinition {
  id: string; // 'workspace.create'
  title: string;
  description: string;
  category: QuestCategory;
  /** 任务可激活前的条件，满足后才允许自动或显式启动 */
  precondition?: QuestPredicate;
  /** 任务完成条件：满足后发奖并标记 done */
  completion: QuestPredicate;
  /** 收到这些 AppEvent 时，QuestEngine 会重新评估完成/状态 */
  triggerEvents?: string[];
  /** 只有这些 AppEvent 可以让 pending Quest 自动启动引导 */
  autoStartEvents?: string[];
  /** 允许通过 quest:start 显式启动的来源；默认允许 task-list / ai */
  explicitStartSources?: Array<'task-list' | 'ai' | 'system'>;
  /** 启动哪个 purpose / preset 来引导用户 */
  toPurposeRequest: () => StartSpritePurposeRequest;
  /** 完成后授予的奖励 */
  reward?: OnboardingQuestReward;
  /** grantReward 的 source 字段，同时作为幂等 claim key */
  rewardSource?: string; // 'quest:workspace.create'
  /** 失败/取消时是否允许后续重新启动 */
  retriable?: boolean;
  /** active 但未完成时，哪些事件允许重新派发 purpose；默认用于启动恢复 */
  retryEvents?: string[];
}

interface QuestPredicateContext {
  event?: string;
  eventPayload?: unknown;
  onboardingState: OnboardingState;
}

interface QuestPredicate {
  id: string;
  evaluate: (ctx: QuestPredicateContext) => Promise<boolean> | boolean;
}
```

触发语义必须拆开看：

- `triggerEvents`：事件评估入口。命中后只代表 Quest 可以检查完成条件、前置条件或 active 重试，不代表一定会启动引导。
- `autoStartEvents`：自动启动入口。只有 pending Quest 命中这里的事件，且前置条件满足，才会自动 `startPurpose`。
- `explicitStartSources`：显式启动入口。任务列表点击“开始引导”和未来 AI 触发都走 `QuestEngine.startQuest`，不依赖 `autoStartEvents`。

因此 `workspace.create` 配置 `autoStartEvents: ['APP_STARTED']`，启动后发现没有 workspace 就自动提示；`first-file-drop` 不配置 `autoStartEvents`，只监听资源事件用于完成结算，启动引导必须来自任务列表或 AI。

### 3.2 持久化字段

#### `preferences.onboardingState`

```ts
interface OnboardingState {
  version: 1;
  /** 用户主动跳过整个新手引导 */
  skipped?: boolean;
  /** 每个 Quest 的运行时状态 */
  quests: Record<string, {
    status: 'pending' | 'active' | 'done' | 'skipped';
    activatedAt?: number;
    completedAt?: number;
    lastPurposeId?: string;
  }>;
}
```

#### `personaState.claimedRewards`（扩展现有字段）

```ts
interface PersonaState {
  // ... existing
  /** 已经发放过的奖励来源，避免重复加 XP/好感度/成就 */
  claimedRewards: Record<string, { at: number; reward: OnboardingQuestReward }>;
}
```

### 3.3 Quest List Snapshot

任务系统展示层不直接读取 `QuestEngine` 内部对象，而是通过纯函数生成快照：

```ts
interface QuestListSnapshot {
  version: 1;
  onboardingSkipped?: boolean;
  items: QuestListItem[];
  summary: {
    total: number;
    pending: number;
    active: number;
    done: number;
    skipped: number;
  };
}

interface QuestListItem {
  id: string;
  category: QuestCategory;
  title: string;
  description?: string;
  status: 'pending' | 'active' | 'done' | 'skipped';
  reward?: OnboardingQuestReward;
  rewardSource: string;
  progressPercent: number;
  action?: {
    kind: 'start-quest';
    label: string;
    questId: string;
    windowKey?: string;
    purposeKind?: string;
  };
}
```

当前实现位置：

- 快照纯函数：[packages/sprite-core/quest/quest-list.ts](../../packages/sprite-core/quest/quest-list.ts)
- 主进程 IPC：[electron/main/handlers/quest/ipc-main.ts](../../electron/main/handlers/quest/ipc-main.ts)
- preload API：[electron/main/handlers/quest/ipc-renderer.ts](../../electron/main/handlers/quest/ipc-renderer.ts)
- 窗口页面：[src/pages/QuestListPage/QuestListPage.tsx](../../src/pages/QuestListPage/QuestListPage.tsx)

## 4. 运行流程

```
应用启动
  │
  ├─→ QuestRegistry.loadDefinitions()       // 静态注册所有 quest
  │
  ├─→ QuestEngine.tick({ event: 'APP_STARTED' })
  │
  ├─→ for each quest in registry:
  │     if quest.id in completedQuests → skip
  │     if completion(ctx) satisfied → grantReward + mark done
  │     if !precondition(ctx)        → skip
  │     if active:
  │       if event in retryEvents    → PurposeManager.start(toPurposeRequest())
  │       else                       → skip
  │     if pending:
  │       if event in autoStartEvents → PurposeManager.start(toPurposeRequest())
  │       else                        → wait for quest:start / AI explicit start
  │
  └─→ 后续 AppEvent 命中 triggerEvents 时重复上面的评估

任务列表 / AI 显式启动
  │
  └─→ QuestEngine.startQuest(id, { source })
        if source not in explicitStartSources → reject
        if completion already satisfied       → grantReward + mark done
        if !precondition                      → reject
        PurposeManager.start(toPurposeRequest())
```

**关键不变量**

- 完成事件**与 routine 解耦**：即使 routine 因为打断而结束，只要 completion 谓词满足，仍判定完成（例：用户没走 routine 内的"立即创建"按钮，而是从设置页直接创建了 workspace，也算完成）。
- `workspace.create` 这类必须完成的新手 Quest 才配置 `autoStartEvents` 和 `retryEvents`；关闭气泡/窗口后的即时重提示主要由 routine 循环承担。
- `first-file-drop` 这类行动型 Quest 不配置 `autoStartEvents`，避免用户启动应用或刚建完 workspace 后被自动打断；但它的完成事件仍与 routine 解耦，用户真实把文件拖给角色即可结算。

## 5. 对目的规划器的扩展需求

### 5.1 新增 `showNotice` step（带按钮气泡）

气泡按钮已经在数据层（`NoticeMessage.buttons`）和 UI 层（`NoticeRenderer`）就绪，但 routine 层暴露的只有 `speak` / `showToast`。新增：

```ts
| {
    id: string;
    type: 'showNotice';
    content: string;
    level?: MessageLevel;
    buttons?: Array<{
      id: string;
      label: string;
      variant?: 'default' | 'secondary' | 'destructive';
      /** 点击后派发的 purpose-event 名（约定 'bubble:action'）；不填则按钮只关闭气泡 */
      purposeAction?: string;
    }>;
    duration?: number;
    cooldownMs?: number;
    cooldownKey?: string;
    /** 是否朗读 notice 内容；onboarding 可设为 false，避免和 speak step 重复 */
    speak?: boolean;
  }
```

实现位置：

- 类型：[packages/sprite-core/purpose/types.ts](../../packages/sprite-core/purpose/types.ts)
- runner handler：[packages/sprite-core/purpose/routine-runner.ts](../../packages/sprite-core/purpose/routine-runner.ts) 增加 `runShowNotice`，通过 `window.YUA.messages` 桥派发 `notice`

### 5.2 按钮点击 → purpose-event 桥接

[src/features/sprite-assistant/message/MessageContext.tsx](../../src/features/sprite-assistant/message/MessageContext.tsx) 的 `handleButtonClick`：

```ts
// 现状：只走 dailyCare:handleButtonClick
// 改造：若 button.action 以 'purpose:' 开头，派发 purpose-event
if (button.action?.startsWith('purpose:')) {
  await window.YUA.sprite.emitPurposeEvent({
    source: 'purpose-event',
    event: 'bubble:action',
    payload: { messageId: currentNotice.id, actionId: button.id, purposeAction: button.action.replace(/^purpose:/, '') }
  });
}
```

Routine 侧用：

```ts
{ type: 'waitForEvent', source: 'purpose-event', event: 'bubble:action',
  match: { messageId: 'onboarding.workspace.create.invite' }, assignTo: 'bubbleEvent', ignoreHistory: true }
```

同一个气泡被用户手动关闭时，消息层派发：

```ts
await window.YUA.sprite.emitPurposeEvent({
  source: 'purpose-event',
  event: 'bubble:dismissed',
  payload: { messageId: currentNotice.id, routineId: currentNotice.routineId, reason: 'close' }
});
```

`workspace.create` routine 不再用短周期定时刷新 notice。它只在首次展示、用户关闭后经过短暂强制重提间隔、或向导关闭未创建时重新展示。关闭气泡不是放弃任务，只是收起本次提示；只要没有 `WORKSPACE_CREATED`，引导就必须继续。

### 5.3 新增 `clearMessage` step

创建成功后需要清掉常驻引导气泡，避免成功文案和"立即创建"按钮同时存在：

```ts
| {
    id: string;
    type: 'clearMessage';
    messageType?: 'toast' | 'notice' | 'busy' | 'all';
    messageId?: string;
  }
```

### 5.4 `openWindow` planner 白名单（仅 AI 用）

预设 routine **不受**白名单约束，仅 AI planner 输出会被 `DEFAULT_SPRITE_PURPOSE_PLANNER_WINDOWS` 校验。`workspace.create` 是固定新手任务，必须使用 `plannerMode: 'preset-only'`，不要把 `workspaceWizard` 加进 AI planner 白名单来解决这条链路。

未来若另一个非新手任务确实希望 AI 也能生成"开工作空间向导"的 routine，再单独评估追加：

```ts
export const DEFAULT_SPRITE_PURPOSE_PLANNER_WINDOWS = ['fileActionsMenu', 'workspaceWizard'] as const;
```

短期可不动。

### 5.5 `grantReward` 幂等

[electron/main 端的 `sprite:persona:grantReward` 处理器](../../electron/main/) 需在写入前检查 `personaState.claimedRewards[source]`：已存在则直接返回（不发奖励、不发事件）。Quest 系统强依赖此幂等性。

## 6. UI 守卫：右键菜单

[src/features/sprite-assistant/AIAssistant.tsx#L131](../../src/features/sprite-assistant/AIAssistant.tsx) 的 `handleContextMenu`：

```ts
const handleContextMenu = async (e: React.MouseEvent) => {
  e.preventDefault();
  const wsList = await window.YUA.workspace['workspace:list']({ filter: { deletedAt: 0 }, limit: 1, offset: 0 });
  if (!wsList || wsList.length === 0) return; // 无工作空间 → 不展示右键菜单
  void window.YUA.sprite.interact('context-menu', { open: true });
  void window.YUA.window['window:open']('menu');
};
```

更通用的方案：在 `OnboardingState` 里加 `interactionsLocked: { contextMenu: boolean }` 由 Quest 系统主动控制。

## 6.1 任务列表窗口

`questList` 是 Quest 系统的独立展示层，负责承载游戏化任务系统：

- 显示新手引导任务、状态、进度和奖励。
- `workspace.create` 显示 XP +20、好感 +3、成就 `first-workspace`。
- `first-file-drop` 显示 XP +15、好感 +2、成就 `first-import`。
- `open-resource-library` 显示 XP +10、好感 +1、成就 `first-resource-library-open`。
- 未完成任务显示“开始引导/继续引导”按钮。
- 按钮调用 `quest:start`，由 `QuestEngine.startQuest(id)` 重新检查前置/完成条件后启动固定 preset-only purpose。
- 如果工作空间已经存在但状态尚未同步，`quest:start` 会先补完成状态和奖励，不再启动创建引导。

窗口注册：

- window key: `questList`
- route: `#/quest-list`
- config: [electron/main/config/window.ts](../../electron/main/config/window.ts)
- app-window directory: [packages/ai/runtime/pi/app-window-directory.ts](../../packages/ai/runtime/pi/app-window-directory.ts)

## 7. 启动期焦点控制

[src/hooks/useWorkspaceCheck.ts](../../src/hooks/useWorkspaceCheck.ts) 保留为 no-op 占位，不再由渲染层直接弹窗。启动时由 main 进程统一判断 workspace 状态：

- 若没有 workspace，`initHandlers` 会先进入 onboarding focus：暂停 `dailyCare` owner，并通过 gate 阻止 `DailyCareService.start()` 的启动补偿派发。
- `initOnboardingQuestEngine` 再启动 `workspace.create` quest；Quest 只下发固定 preset purpose，不直接打开向导。
- routine 先展示常驻气泡按钮；用户点击按钮后清掉邀请气泡，再 `openWindow('workspaceWizard')`，并让角色 `walkTo` 到创建窗口旁。
- 创建窗口打开期间，routine 会说固定辅助说明：工作空间用于保存资源、项目与记忆索引，也可以先用快速创建/默认目录开始。
- 常驻气泡打开期间不会重复提示；用户关闭气泡后，routine 短暂缓冲再重新展示。它避免气泡仍在时重复刷新/朗读，但不会让必须完成的工作空间引导静默消失。
- `APP_STARTED` 在主窗口显示后驱动 `QuestEngine.tick()`，避免早于渲染层 message bridge 就绪时丢失首次气泡。
- 如果上次已经把 `workspace.create` 存成 active 但用户没有创建 workspace，下一次 `APP_STARTED` 会重新派发引导，不会被 active 状态永久卡住。
- `WorkspaceWizard` 非成功关闭/卸载时会派发 `WORKSPACE_WIZARD_CLOSED` purpose event；当前 active routine 会立刻提示"还没有创建"，继续展示"去创建"按钮。
- `workspace.create` 的 `retryEvents` 保留 `APP_STARTED`，用于跨启动恢复；关闭窗口后的即时重提示由 routine 内部循环负责，避免重复启动 purpose。
- onboarding focus 期间，`SpriteManager` 会压制 `welcome` 与 `behavior` 这类环境发言；用户主动交互不属于环境发言，不被一刀切禁用。

这个策略让首次启动的第一屏确定落到"创建工作空间"任务提示，不会被欢迎语、idle 随机文案或 daily care 文案抢走。

## 8. 默认 Quest 目录（首批）

| Quest ID              | 前置条件                                 | 启动方式                                  | 完成事件                                                                                         | 奖励                                          |
| --------------------- | ---------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| `workspace.create`    | 无 workspace                             | `APP_STARTED` 自动启动；任务列表/AI 显式启动 | `app-event WORKSPACE_CREATED`                                                                    | xp 20, favor 3, achievement `first-workspace` |
| `first-file-drop`     | 已完成 workspace.create 或已有 workspace | 任务列表/AI 显式启动，不随启动自动弹出      | `app-event RESOURCE_CREATED` 或 `SPRITE_RESOURCE_IMPORT_COMPLETE`，需业务来源 `sprite-drop` | xp 15, favor 2, achievement `first-import`    |
| `open-resource-library` | 已完成 workspace.create 或已有 workspace | 任务列表/AI 显式启动，不随启动自动弹出      | `app-event ASSISTANT_MENU_ITEM_SELECTED`，需 `itemId=resources` 且来源为助手右键菜单              | xp 10, favor 1, achievement `first-resource-library-open` |
| `first-chat`          | 已完成 workspace.create                  | 待定                                      | `app-event SPRITE_CHAT_FIRST_REPLY`                                                              | xp 15, favor 2                                |
| `unlock-context-menu` | 完成 workspace.create                    | 自动（其他 quest 完成时触发）              | 自动                                                                                             | 解锁右键菜单                                  |

详细 routine 见 [workspace-onboarding-quest.md](./workspace-onboarding-quest.md)、[file-drop-onboarding-quest.md](./file-drop-onboarding-quest.md) 和 [open-resource-library-onboarding-quest.md](./open-resource-library-onboarding-quest.md)。

## 9. 任务推进顺序（建议）

1. **基础设施**：preferences `onboardingState`、persona `claimedRewards` 幂等
2. **routine step 扩展**：`showNotice` + `clearMessage` + 按钮 → purpose-event 桥接
3. **QuestRegistry / QuestEngine**（packages/sprite-core/quest/）
4. **第一个 quest**：`workspace.create`（含 preset routine）
5. **第二个 quest**：`first-file-drop`（复用已有文件拖拽目的链路，补任务层）
6. **第三个 quest**：`open-resource-library`（引导用户发现助手右键菜单中的资源库入口）
7. **改造**：`useWorkspaceCheck`、右键菜单守卫
8. **后续 quest 补全**

## 10. 测试策略

- `onboarding-quest.spec.ts`：registry 顺序、`triggerEvents` / `autoStartEvents` 拆分、任务列表快照、幂等 reward
- `onboarding-quest.spec.ts`：模拟 `workspace.create` 在 `APP_STARTED` 自动激活、active 未完成时启动重试、`WORKSPACE_WIZARD_CLOSED` 不重复启动 purpose、`WORKSPACE_CREATED` 完成、重复事件不重复发奖
- `onboarding-quest.spec.ts`：模拟 `first-file-drop` 不随 `APP_STARTED` / `WORKSPACE_CREATED` 自动激活，只能由任务列表或 AI 显式启动，同时仍能通过 `sprite-drop` 资源事件完成
- `onboarding-quest.spec.ts`：模拟 `open-resource-library` 不随启动自动激活，只能由任务列表或 AI 显式启动，且只在助手右键菜单选择资源库时完成
- `sprite-purpose-routine.spec.ts`：验证 `workspace.create` routine 持续提示、按钮进入创建、走到向导窗口旁、关闭未创建后继续提示、创建成功后清理 notice 并庆祝
- `sprite-purpose-routine.spec.ts`：同时验证 `onboarding.file.drop` routine 会走到中心、提示拖拽文件、等待资源事件并在完成后庆祝
- `file-drop-purpose.spec.tsx`：验证真实拖拽仍会启动 `file.drop.invite` / `file.drop.intake`，并给资源创建链路标记 `source: 'sprite-drop'`
- `character-messages.spec.ts`：验证工作空间引导的 routine 文案 key 已进入共享规格与内置角色包，避免角色包文案漂移
- `routine-show-notice.spec.ts`：notice step + 按钮点击 → purpose-event 解锁 waitForEvent
- `persona-claim-idempotent.spec.ts`：重复 grantReward 不重复加 XP
- `daily-care-service.spec.ts`：onboarding focus gate 阻止自动 daily care 派发，但不阻止手动触发

## 10.1 开发测试入口

在“机能扩展 → AI 目标规划 / 目的规划器 → 观测”中保留两个手动入口：

- **试跑**：执行 `daily.care.reminder`，用于验证 AI planner / preset fallback 链路。
- **工作空间引导预设**：直接执行 `onboarding.workspace.create` preset，且携带 `plannerMode: 'preset-only'`。这个入口不检查当前是否已有 workspace，方便在已有真实空间的电脑上测试气泡、按钮、窗口聚焦、角色走到窗口旁、窗口打开期间的用途/快速创建说明、关闭后继续提示和成功反馈；它只启动 purpose，不写入 quest 完成状态，也不会发放 `quest:workspace.create` 奖励。

## 11. Open Questions

- Quest 是否需要"时间限制 / 失败超时"？（onboarding 类目前不需要，daily 类后续才需要）
- 跳过引导的 UI（"我已经会了，别再提示"）放哪？右键菜单解锁后才出现的"重置引导"开关？
- 多角色（character pack）切换时 onboardingState 是按 character slot 还是全局？**默认全局**，因为是用户级而非角色级的进度。
