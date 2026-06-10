# Quest: `first-file-drop` — 引导用户把第一个文件拖给角色

> **状态**：已按固定新手 Quest 流程落地  
> **Quest ID**：`first-file-drop`  
> **预设 Routine ID**：`onboarding.file.drop`  
> **Purpose Kind**：`onboarding.file.drop`  
> **Purpose Priority**：68（低于 `workspace.create`，高于 daily care）  
> **奖励**：XP +15、好感 +2、成就 `first-import`

## 1. 原始需求记录

用户希望把“拖拽文件到角色身上进行上传/导入”也做成新手任务。代码里已经残留了一部分文件拖拽 purpose，需要补完整，并放进任务系统展示。

这条需求属于固定新手引导 Quest，不调用 LLM 生成流程。任务系统只负责展示、启动、状态、完成判定和奖励；真正的拖入交互继续复用已有的文件投递链路。

## 2. 现有残留代码分析

此前已经存在两段底层能力：

- `file.drop.invite`：用户把文件拖入角色区域时，角色走到屏幕中心并等待 `interact:file-drop` 或 `interact:file-drag-leave`。
- `file.drop.intake`：用户 drop 后播放接收反馈、打开 `fileActionsMenu`，等待 `fileAction:resolved`，再按 selected/cancelled/failed 收尾。
- `useFileDropCollector`：渲染层 Dropzone 在 drag enter / drop 时启动上述 purpose，并调用资源服务把文件写入资源库。

缺失的是 Quest 层：

- 没有“首次拖拽文件”任务定义。
- 没有任务列表里的任务标题、描述、奖励和“开始引导”按钮。
- 没有固定的 onboarding routine 去主动邀请用户“把文件拖给我”。
- 没有把资源创建/导入完成事件接入 `QuestEngine` 做完成判定和幂等奖励。

## 3. 最终流程

1. `workspace.create` 已完成，或系统里已经有工作空间。
2. `first-file-drop` 不随 `APP_STARTED` / `WORKSPACE_CREATED` 自动启动，避免用户启动应用或刚创建工作空间后被下一条引导打断。
3. 用户在任务列表点击“开始引导/继续引导”、未来 AI 显式触发 `quest:start({ id: 'first-file-drop', source: 'ai' })`，或从上一任务推荐确认继续时，`QuestEngine` 评估前置条件。
4. 满足前置条件后启动 `onboarding.file.drop` purpose，强制 `plannerMode: 'preset-only'`。
5. 角色走到中心，展示固定 notice：“可以把文件拖拽给我”
6. 等待用户拖拽文件。真实拖入时，已有 `file.drop.invite` / `file.drop.intake` 会接管更高优先级的交互表现。
7. 用户把文件拖给角色后，资源服务创建资源，并在资源 metadata 写入 `source: 'sprite-drop'`。
8. `QuestEngine` 收到 `RESOURCE_CREATED` 或角色拖拽上传链路产生的导入完成事件，且确认业务来源为 `sprite-drop`，标记 `first-file-drop` 完成并发放奖励。
9. routine 收到资源事件后清理引导 notice，播放庆祝反馈并说完成文案。

## 4. Quest 定义

代码位置：[packages/sprite-core/quest/onboarding-presets.ts](../../packages/sprite-core/quest/onboarding-presets.ts)

核心配置：

- `id`: `first-file-drop`
- `category`: `onboarding`
- `title`: `把第一个文件拖给我`
- `description`: `把任意文件拖到桌面角色身上，完成一次拖拽导入。`
- `precondition`: 已有工作空间
- `autoStartEvents`: 不配置；启动应用/完成工作空间创建不会自动弹出这条引导
- `explicitStartSources`: `task-list`、`ai`、`recommendation`
- `recommendation`: 完成后缓冲 `delayMs = 2500`，推荐 `open-resource-library`
- `triggerEvents`: `RESOURCE_CREATED`、`SPRITE_RESOURCE_IMPORT_COMPLETE`
- `completion`: `RESOURCE_CREATED` 或 `SPRITE_RESOURCE_IMPORT_COMPLETE`，且事件 payload / resource metadata 标记 `source === 'sprite-drop'`
- `reward`: `xp: 15`、`favor: 2`、`achievementId: 'first-import'`
- `rewardSource`: `quest:first-file-drop`
- `purpose`: `onboarding.file.drop`

注意：普通资源创建不会完成这个任务，只有拖到角色身上的资源会通过 `metadata.source = 'sprite-drop'` 判定完成。

## 5. Routine 定义

代码位置：[packages/sprite-core/purpose/routine-presets.ts](../../packages/sprite-core/purpose/routine-presets.ts)

`onboarding.file.drop` 做三件事：

- 让角色走到屏幕中心，形成明确的可投递目标。
- 展示常驻引导 notice，并低频说明资源库的作用。
- 等待带 `purposeSource: 'sprite-drop'` 的 `RESOURCE_CREATED` / `SPRITE_RESOURCE_IMPORT_COMPLETE`，成功后清理 notice、庆祝并说“收到啦！已经放到背包。”这里不用 runtime event 顶层的 `source` 字段，因为它固定表示事件通道来源 `app-event`。

真实文件导入不在这个 routine 里重复实现，继续交给 `useFileDropCollector` 和资源服务。

## 6. 事件接入

代码位置：[electron/main/handlers/index.ts](../../electron/main/handlers/index.ts)

`initOnboardingQuestEngine` 现在会把资源事件转交给 `QuestEngine`：

- `RESOURCE_CREATED`
- `SPRITE_RESOURCE_IMPORT_COMPLETE`

其中资源事件只用于完成判定，不用于自动启动引导。只有带 `sprite-drop` 业务来源的事件才会让 `first-file-drop` 结算，普通资源导入不会误触发。

## 7. 任务列表展示

`questList` 窗口会展示 `first-file-drop`：

- 分类：新手引导
- 状态：未开始 / 进行中 / 已完成
- 奖励：XP +15、好感 +2、成就
- 操作：开始引导 / 继续引导

任务列表监听 `RESOURCE_CREATED` 和 `SPRITE_RESOURCE_IMPORT_COMPLETE`，资源导入完成后会刷新快照。

## 8. 验收点

- ✅ 已有工作空间时，`first-file-drop` 会出现在任务列表；已有资源的电脑也可以直接测试这条拖拽任务，不需要删除真实资源。
- ✅ 点击“开始引导”启动 `onboarding.file.drop`，不调用 LLM。
- ✅ 启动应用或刚完成工作空间创建时，不会自动弹出拖拽文件引导。
- ✅ 未来 AI 可以通过显式 `quest:start` 入口启动这条任务。
- ✅ 角色走到中心并提示拖文件给它。
- ✅ 用户拖入文件时，已有 `file.drop.invite` / `file.drop.intake` 继续接管拖拽和后续菜单。
- ✅ 拖给角色创建的资源会带 `metadata.source = 'sprite-drop'`。
- ✅ `RESOURCE_CREATED` 命中后完成 Quest，发放 XP +15、好感 +2、成就 `first-import`。
- ✅ 普通资源创建不会误完成“拖给角色”任务。
- ✅ 任务列表会在资源创建/导入完成后刷新。
