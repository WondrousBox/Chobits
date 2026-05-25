# Feature Introduction Quest Catalog - 功能自述任务目录

> 状态：功能自述目录全量接入任务系统（2026-05-24）
> 关联：新手引导与任务系统 [README.md](./README.md)

## 1. 定位

功能自述任务是一类 `category = feature-intro` 的 Quest。它不是基础设置强制引导，而是让桌面助手用固定文案和固定交互流程介绍软件能力：角色先说明自己能做什么，再引导用户拖拽、点击、选择菜单、打开窗口或触发某个业务流程。用户完成关键动作后，QuestEngine 发放少量 XP / 好感度 / 成就作为试用奖励。

功能自述任务和 `workspace.create` 这类新手引导任务一样使用 deterministic preset routine，不调用 LLM 临场生成流程。区别在于：功能自述默认不会在启动时自动打断用户，只能由任务列表手动启动，或未来由 AI 明确调用 `QuestEngine.startQuest(id, { source: 'ai' })` 启动。

当前代码单一事实源：

- 目录数据：[packages/sprite-core/feature-intro-catalog.ts](../../packages/sprite-core/feature-intro-catalog.ts)
- Quest 生成：[packages/sprite-core/quest/onboarding-presets.ts](../../packages/sprite-core/quest/onboarding-presets.ts)
- Routine 生成：[packages/sprite-core/purpose/routine-presets.ts](../../packages/sprite-core/purpose/routine-presets.ts)

## 2. 触发与完成模型

每个功能自述任务都包含四部分：

- `completion`：完成判定，必须命中真实业务事件，不能只靠展示说明文案结算。
- `routine`：固定表现流程，负责说说明文案、打开窗口、等待用户动作、庆祝完成。
- `reward`：少量 XP / 好感度 / 成就，使用 `quest:<id>` 幂等发放。
- `precondition`：当前统一要求已经具备 workspace；没有 workspace 时应先完成 `workspace.create`。

触发方式：

| 任务类型 | 自动启动 | 任务列表启动 | AI 显式启动 |
| --- | --- | --- | --- |
| `onboarding.workspace.create` | 有，无 workspace 时 `APP_STARTED` 自动触发 | 有 | 有 |
| 其他 onboarding | 无 | 有 | 有 |
| `feature-intro` | 无 | 有 | 有 |

Routine 类型：

| Routine kind | 使用场景 | 典型完成事件 |
| --- | --- | --- |
| `file-workflow` | 拖拽文件后在文件操作菜单启动工作流 | `FILE_ACTION_WORKFLOW_STARTED` |
| `file-action` | 拖拽文件后选择文件菜单动作，不一定立即启动工作流 | `FILE_ACTION_SELECTED` |
| `assistant-menu` | 右键助手并选择菜单项 | `ASSISTANT_MENU_ITEM_SELECTED` |
| `window` | 打开某个业务窗口或窗口内路线 | `APP_WINDOW_OPENED` 或窗口内事件 |
| `app-event` | 需要用户在某个功能里触发业务动作 | 对应 AppEvent |

## 3. 已接入功能自述任务

下面 25 个任务都会进入任务列表的“功能”页签，并由 `FEATURE_INTRO_QUEST_CATALOG` 自动生成 Quest 和 preset routine。

| 优先级 | Quest ID | 标题 | 完成事件 | 奖励 |
| --- | --- | --- | --- | --- |
| P0 | `feature.file-video-transcription` | 认识文件转写流程 | `FILE_ACTION_WORKFLOW_STARTED`，`workflowId=sample:transcribe`，`actionId=video-stt/audio-stt` | XP +12, 好感 +1 |
| P0 | `feature.resource-library-preview` | 认识资源库预览 | `RESOURCE_PREVIEW_OPENED` | XP +12, 好感 +1 |
| P0 | `feature.chat-with-resource` | 认识带资源聊天 | `SPRITE_AI_COMPLETE` 且 `hasResourceContext=true` | XP +12, 好感 +1 |
| P1 | `feature.video-keyframes` | 认识视频关键帧 | `FILE_ACTION_WORKFLOW_STARTED`，`workflowId=sample:video-keyframes` | XP +10, 好感 +1 |
| P1 | `feature.media-transcode` | 认识媒体转码 | `FILE_ACTION_WORKFLOW_STARTED`，`workflowId=sample:transcode`，`actionId=video-transcode/audio-transcode` | XP +10, 好感 +1 |
| P1 | `feature.image-understand` | 认识图片理解 | `FILE_ACTION_WORKFLOW_STARTED`，`workflowId=sample:image-understand` | XP +10, 好感 +1 |
| P1 | `feature.ocr` | 认识图片 OCR | `FILE_ACTION_WORKFLOW_STARTED`，`workflowId=sample:ocr` | XP +10, 好感 +1 |
| P1 | `feature.subtitle-translate` | 认识字幕翻译 | `FILE_ACTION_SELECTED`，`actionId=subtitle-translate` | XP +10, 好感 +1 |
| P1 | `feature.subtitle-summary` | 认识字幕总结 | `FILE_ACTION_SELECTED`，`actionId=subtitle-summarize` | XP +10, 好感 +1 |
| P1 | `feature.subtitle-read` | 认识字幕朗读 | `FILE_ACTION_SELECTED`，`actionId=subtitle-read` | XP +10, 好感 +1 |
| P1 | `feature.inventory` | 认识背包 | `ASSISTANT_MENU_ITEM_SELECTED`，`itemId=inventory` | XP +10, 好感 +1 |
| P1 | `feature.quest-list` | 认识任务列表 | `ASSISTANT_MENU_ITEM_SELECTED`，`itemId=quests` | XP +10, 好感 +1 |
| P2 | `feature.workflow-gallery` | 认识工作流库 | `APP_WINDOW_OPENED`，`windowKey=resources`，`route=workflows` | XP +8, 好感 +1 |
| P2 | `feature.youtube-download` | 认识 YouTube 下载 | `SPRITE_DOWNLOAD_START` | XP +8, 好感 +1 |
| P2 | `feature.youtube-subscribe` | 认识 YouTube 订阅 | `SPRITE_RSS_REFRESH` | XP +8, 好感 +1 |
| P2 | `feature.asr-microphone` | 认识麦克风识别 | `ASSISTANT_MENU_ITEM_SELECTED`，`itemId=mic-recording` | XP +8, 好感 +1 |
| P2 | `feature.system-audio-asr` | 认识电脑声音识别 | `ASSISTANT_MENU_ITEM_SELECTED`，`itemId=system-audio-recording` | XP +8, 好感 +1 |
| P2 | `feature.tts-config` | 认识 TTS 配置 | `ASSISTANT_MENU_ITEM_SELECTED`，`itemId=tts-config` | XP +8, 好感 +1 |
| P2 | `feature.memory-graph` | 认识记忆图谱 | `ASSISTANT_MENU_ITEM_SELECTED`，`itemId=memory-graph` | XP +8, 好感 +1 |
| P2 | `feature.memory-save-search` | 认识记忆保存与检索 | `MEMORY_SAVED` 或 `MEMORY_EXTRACTION_COMPLETED` | XP +8, 好感 +1 |
| P2 | `feature.plugin-manager` | 认识插件管理器 | `APP_WINDOW_OPENED`，`windowKey=pluginManager` | XP +8, 好感 +1 |
| P2 | `feature.ai-provider-config` | 认识 AI 提供商配置 | `AI_PROVIDER_CONFIG_UPDATED` | XP +8, 好感 +1 |
| P3 | `feature.window-animation-editor` | 认识窗口动画编辑器 | `APP_WINDOW_OPENED`，`windowKey=windowAnimationEditor` | XP +6, 好感 +1 |
| P3 | `feature.character-pack-editor` | 认识角色包编辑器 | `APP_WINDOW_OPENED`，`windowKey=characterPackEditor` | XP +6, 好感 +1 |
| P3 | `feature.skill-tree` | 认识技能树 | `ASSISTANT_MENU_ITEM_SELECTED`，`itemId=skill-tree` | XP +6, 好感 +1 |

## 4. 当前事件接入

已补齐的关键事件：

- `APP_WINDOW_OPENED`：purpose routine 和 AI app-window 工具打开窗口后派发，payload 包含 `windowKey`、`source`，可附带 `route`。
- `RESOURCE_PREVIEW_OPENED`：资源预览窗口加载资源后派发，payload 包含 `resourceId`、`type`、`filePath`。
- `ASSISTANT_MENU_ITEM_SELECTED`：助手右键菜单的资源库、背包、任务、技能树、ASR、TTS、记忆图谱等入口统一派发。
- `FILE_ACTION_SELECTED` / `FILE_ACTION_WORKFLOW_STARTED` / `FILE_ACTION_RESOLVED`：文件操作菜单统一桥接。
- `AI_PROVIDER_CONFIG_UPDATED`：新增/更新/删除 provider preset、保存 provider secrets、保存 preset secrets 或更新多 API Key 后派发。
- `MEMORY_SAVED`：显式记忆保存工具写入成功后派发。
- `SPRITE_AI_COMPLETE`：AI 回复完成后派发，并附带 `hasResourceContext` / `resourceIds` 用于资源聊天自述任务。

边界说明：

- `APP_WINDOW_OPENED` 当前保证覆盖 purpose routine 和 AI app-window 工具路径。普通页面里直接调用 `window:open` 的历史入口不一定全局派发，后续如需“用户自己打开也立即结算”，可以在窗口管理 IPC 层补全统一事件。
- `feature.media-transcode` 当前复用已有 `sample:transcode` 预设。该预设实际是“提取音频 (MP3)”并允许 video/audio 输入；如果未来新增独立 `sample:audio-compress`，再把目录里的 `workflowIds` 扩展回来。
- `feature.ai-provider-config` 以 `AI_PROVIDER_CONFIG_UPDATED` 为完成事件，避免只打开配置窗口就结算；其 routine 会先打开配置窗口，再等待保存/更新事件。
- 字幕翻译/总结/朗读当前以文件菜单动作选择为完成事件。若后续补字幕任务完成事件，可以升级为“任务真正开始或完成”后结算。

## 5. 维护规则

- 新增功能自述任务时先改 `FEATURE_INTRO_QUEST_CATALOG`，不要只改文档或只写单独 preset。
- 每个任务必须有确定的 `completion`，优先使用真实业务事件。
- 每个任务默认不配置 `autoStartEvents`，避免功能介绍主动打断用户。
- 如果任务需要打开窗口，优先使用 `routine.windowKey` 和 `windowPayload`，由 routine 统一完成陪同、等待和庆祝。
- 修改事件名、菜单 `itemId`、workflow id 或 window key 时，同步更新本文件、catalog、测试。
