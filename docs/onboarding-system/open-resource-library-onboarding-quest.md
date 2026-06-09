# Quest: `open-resource-library` — 引导用户从助手右键菜单打开资源库

> **状态**：已按固定新手 Quest 流程落地  
> **Quest ID**：`open-resource-library`  
> **预设 Routine ID**：`onboarding.resource.open-library`  
> **Purpose Kind**：`onboarding.resource.open-library`  
> **Purpose Priority**：66（低于拖拽文件引导，高于 daily care）  
> **奖励**：XP +10、好感 +1、成就 `first-resource-library-open`

## 1. 原始需求记录

用户希望新增一个“右键点击助手打开资源库”的新手引导任务，并要求它出现在任务列表里。

这条任务用于教用户发现桌面助手的右键菜单，以及资源库入口。它不是开机强制任务，不调用 LLM 生成流程；必须通过任务列表或未来 AI 显式触发。

## 2. 最终流程

1. `workspace.create` 已完成，或系统里已经有工作空间。
2. 用户在任务列表点击“开始引导/继续引导”、未来 AI 显式触发 `quest:start({ id: 'open-resource-library', source: 'ai' })`，或从上一任务推荐确认继续。
3. QuestEngine 启动 `onboarding.resource.open-library` preset-only routine。
4. 角色提示：“右键点我，打开菜单里的资源库。”
5. 用户右键助手，菜单打开。
6. 角色提示：“现在点菜单里的「资源库」。”
7. 用户点击助手右键菜单里的“资源库”。
8. 菜单项派发 `ASSISTANT_MENU_ITEM_SELECTED`，payload 标记 `itemId: 'resources'`、`windowKey: 'resources'`、`source: 'assistant-context-menu'`。
9. QuestEngine 标记任务完成并发放奖励；routine 清理提示、播放庆祝反馈并说明资源库用途。

## 3. Quest 定义

代码位置：[packages/sprite-core/quest/onboarding-presets.ts](../../packages/sprite-core/quest/onboarding-presets.ts)

核心配置：

- `id`: `open-resource-library`
- `category`: `onboarding`
- `title`: `打开资源库`
- `description`: `右键点击桌面助手，在菜单中打开资源库。`
- `precondition`: 已有工作空间
- `autoStartEvents`: 不配置；启动应用/完成工作空间创建不会自动弹出这条引导
- `explicitStartSources`: `task-list`、`ai`、`recommendation`
- `recommendation`: 完成后缓冲 `delayMs = 2500`，推荐 `feature.resource-library-preview`
- `triggerEvents`: `ASSISTANT_MENU_ITEM_SELECTED`
- `completion`: `ASSISTANT_MENU_ITEM_SELECTED` 且 `itemId === 'resources'`、`windowKey === 'resources'`、`source === 'assistant-context-menu'`
- `reward`: `xp: 10`、`favor: 1`、`achievementId: 'first-resource-library-open'`
- `rewardSource`: `quest:open-resource-library`
- `purpose`: `onboarding.resource.open-library`

注意：不能只用 `resources` 窗口打开作为完成条件。AI、快捷入口或其他页面也可能打开资源库；本任务必须确认用户学会了“右键助手 → 菜单 → 资源库”的路径。

## 4. Routine 定义

代码位置：[packages/sprite-core/purpose/routine-presets.ts](../../packages/sprite-core/purpose/routine-presets.ts)

`onboarding.resource.open-library` 做四件事：

- 展示常驻引导 notice，提示用户右键助手。
- 等待 `sprite-event-bus` 的 `interact:context-menu` 且 payload 内的 `open === true`。
- 菜单打开后提示用户点击“资源库”。
- 等待 `app-event` 的 `ASSISTANT_MENU_ITEM_SELECTED`，成功后清理 notice、庆祝并说完成文案。

## 5. 事件接入

代码位置：

- 菜单项：[src/pages/AssistantMenuPage/AssistantMenuPage.tsx](../../src/pages/AssistantMenuPage/AssistantMenuPage.tsx)
- AppEvent 枚举：[packages/event/events.ts](../../packages/event/events.ts)
- QuestEngine 监听：[electron/main/handlers/index.ts](../../electron/main/handlers/index.ts)

右键菜单的“资源库”项点击时会先派发 purpose/app event，再打开 `resources` 窗口。QuestEngine 只消费这个带业务来源的事件，不把其他打开资源库的路径误算为完成。

## 6. 任务列表展示

`questList` 窗口会展示 `open-resource-library`：

- 分类：新手引导
- 状态：未开始 / 进行中 / 已完成
- 奖励：XP +10、好感 +1、成就
- 操作：开始引导 / 继续引导

## 7. 验收点

- ✅ 已有工作空间时，`open-resource-library` 会出现在任务列表。
- ✅ 点击“开始引导”启动 `onboarding.resource.open-library`，不调用 LLM。
- ✅ 启动应用或刚完成工作空间创建时，不会自动弹出这条引导。
- ✅ 右键助手后，routine 会提示点击菜单里的“资源库”。
- ✅ 只有从助手右键菜单点击“资源库”才完成任务。
- ✅ AI 或其他入口打开资源库不会误完成任务。
- ✅ 完成后发放 XP +10、好感 +1、成就 `first-resource-library-open`。
