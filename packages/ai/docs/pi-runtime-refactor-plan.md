# Pi Runtime Refactor Plan

本文档是 Chobits 从 Mastra 迁移到 Pi 生态的实施蓝图。它服务两个目标：

1. 记录第一波已经落下去的骨架文件，避免后续重复建模。
2. 把后续每一波的文件级改造路径写清楚，方便持续推进。

## 目标

把当前以 Mastra 为核心的聊天与工具运行时，迁移为：

- `@mariozechner/pi-coding-agent`
  - 负责多轮会话、工具调用、流式事件。
- `@mariozechner/pi-ai`
  - 负责 one-shot 任务，如标题生成、打标、结构化输出、工作流单步生成。
- `@mariozechner/pi-agent-core`
  - 负责未来确实需要的底层 agent orchestration。
- `@mariozechner/pi-tui`
  - 作为开发和调试入口，不直接替换 Electron renderer。

## 第一波已完成

第一波的原则是“先搭内核边界，不破坏现有行为”。

### 新增目录

- `packages/ai/runtime/pi`

### 新增文件

- `packages/ai/runtime/pi/contracts.ts`
  - Pi 迁移期内部类型。
- `packages/ai/runtime/pi/provider-alias.ts`
  - provider id 归一化。
- `packages/ai/runtime/pi/runtime-switch.ts`
  - 运行时切换约定。
- `packages/ai/runtime/pi/tool-registry.ts`
  - 工具元数据与状态注册表。
- `packages/ai/runtime/pi/profile-registry.ts`
  - Pi profile 注册表。
- `packages/ai/runtime/pi/model-resolver.ts`
  - provider / instance / model / secrets 解析层。
- `packages/ai/runtime/pi/stream-adapter.ts`
  - Pi 事件到旧 `StreamEvent` 的适配层。
- `packages/ai/runtime/pi/session-factory.ts`
  - session factory 骨架。
- `packages/ai/runtime/pi/session-service.ts`
  - Pi 运行时入口骨架。
- `packages/ai/runtime/pi/index.ts`
  - barrel export。
- `packages/ai/runtime/pi/README.md`
  - 目录职责说明。

### 已修改文件

- `packages/ai/chat-service.ts`
  - 增加了 Pi runtime 的预留分支，但默认仍走现有 Mastra 逻辑。

### 当前行为

- 默认聊天链路不变。
- 只有在请求中显式带上 `extras.runtime = "pi"` 时，才会进入 Pi runtime 分支。
- Wave 2 第一批落地后，Pi 分支已经支持：
  - availability 检查
  - 请求解析 preview
  - `pi-ai` 文本流式输出
  - `pi-ai` one-shot 输出
  - 会话持久化桥接
  - `conversationId` metadata 回传
- 当前 Pi 分支还没有接入真正的 Pi tool/session。

## Wave 2

主题：先让主聊天链路真正跑在 Pi runtime 上，再把它升级成 Pi session。

### Wave 2 第一批已完成

- `packages/ai/runtime/pi/session-service.ts`
  - 已用 `@mariozechner/pi-ai` 打通：
    - `chat()`
    - `chatEphemeral()`
    - `chatStream()`
- `packages/ai/runtime/pi/model-resolver.ts`
  - 已补上 provider 默认 secrets / model / baseUrl 合并。
- `packages/ai/chat-service.ts`
  - Pi 分支已重新接回：
    - conversation 持久化
    - `conversationId` metadata
    - 自动标题生成
    - stream cancel 控制
    - sprite start / complete / error 事件

### 当前已达到的效果

- `extras.runtime = "pi"` 下，聊天页已经可以真实流式输出。
- Renderer 无需改协议，仍然消费原有 `StreamEvent`。
- Pi 包未安装时，仍会明确返回缺失包信息。

### 当前仍未完成的部分

- `pi-coding-agent` 的 session streaming 已接通，主聊天核心工具已经迁完。
- `pi-agent-core` 还未成为统一 orchestration 层。
- 标题生成、tagging 已完成第一批 Pi one-shot 迁移，但 summary / translation / mindmap 等任务还没完全统一到 execution runtime。
- 主聊天流式链路里的 legacy `translationToolContext`、`summaryToolContext`、`pushCardToolContext` 残留已清掉，但旧工具文件与非主路径 fallback 当时仍待退役。

### 要改的文件

- `packages/ai/runtime/pi/session-factory.ts`
- `packages/ai/runtime/pi/session-service.ts`
- `packages/ai/runtime/pi/stream-adapter.ts`
- `packages/ai/chat-service.ts`

### 要做的事

- 第一批已经完成：
  - 在 `session-service.ts` 中接入 `pi-ai` 文本聊天与流式事件映射
  - 在 `chat-service.ts` 中恢复 Pi 分支的会话编排
- 第二批继续做：
  - 在 `session-factory.ts` 中接入 `pi-coding-agent` 的 session 创建
  - 在 `session-service.ts` 中让主聊天流式分支优先使用 `pi-coding-agent`
  - 在 `stream-adapter.ts` 中补齐 tool / session 级事件映射
- 第二批当前状态：
  - 已经完成 `pi-coding-agent` session streaming 接线
  - 已经开始承载第一批 Pi tool execution
  - 仍未完成全部工具迁移

### 完成标志

- 第一批完成标志：
  - `ChatPage` 无需改 UI，就能通过 `extras.runtime = "pi"` 跑真实流式文本会话。
  - 会话中断、错误、完成事件格式与现有前端兼容。
- 第二批完成标志：
  - 主聊天流式链路由 `pi-coding-agent` session 承载。
  - session 内工具调用由 Pi 运行时驱动，不再只是文本桥接。

## Wave 3

主题：把工具系统从 Mastra tool contract 迁到 Pi tool contract。

### Wave 3 第一批已完成

- `packages/ai/card-push.ts`（新增）
  - 把卡片广播从 `ipc-main.ts` 中抽出，供 legacy / Pi 两套工具共用，减少循环依赖。
- `packages/ai/runtime/pi/tool-context.ts`（新增）
  - 把工具执行上下文改成 session-scoped：
    - `conversationId`
    - `targetWindowId`
    - `ResourcesRepo`
    - `ChatRepo`
    - `pushCardToWindows`
- `packages/ai/runtime/pi/tools/resource-query.ts`（新增）
  - `resourceQueryTool` 已切成 Pi custom tool。
- `packages/ai/runtime/pi/tools/read-subtitle.ts`（新增）
  - `readSubtitleTool` 已切成 Pi custom tool。
- `packages/ai/runtime/pi/tools/push-card.ts`（新增）
  - `pushCardTool` 已切成 Pi custom tool。
- `packages/ai/runtime/pi/tools/index.ts`（新增）
  - 根据 `enabledToolIds` 装配当前 session 的 Pi custom tools。
- `packages/ai/runtime/pi/session-factory.ts`
  - 已把第一批 Pi custom tools 注册进 `createAgentSession({ customTools })`。
- `packages/ai/runtime/pi/session-service.ts`
  - 已把第一批工具的可用状态反映到 stream metadata：
    - `piReadyToolIds`
    - `toolBridge = disabled | planned | partial | ready`
- `packages/ai/chat-service.ts`
  - 已把真实 `conversationId` 和 `targetWindowId` 透传进 Pi session 请求，供 Pi tools 使用。
- `packages/ai/runtime/pi/tool-registry.ts`
  - `query-resources`、`read-subtitle`、`push-card` 已标记为 `ready-for-pi-runtime`。

### Wave 3 第一批完成标志

- `extras.runtime = "pi"` 的主聊天 session 中，已经可以由 `pi-coding-agent` 直接执行：
  - `resourceQueryTool`
  - `readSubtitleTool`
  - `pushCardTool`
- 这些工具不再依赖 Mastra `createTool()` contract。
- `pushCardTool` 在 Pi session 中已经能拿到真实 `conversationId`，从而把卡片消息写回会话历史。

### Wave 3 第二批已完成

- `packages/ai/runtime/pi/task-chat.ts`（新增）
  - 提供 Pi 背景任务 `chatFn` 适配层，直接基于 `pi-ai` 执行 prompt。
- `packages/ai/runtime/pi/tools/translation.ts`（新增）
  - `translationTool` 已切成 Pi custom tool。
- `packages/ai/runtime/pi/tools/summary.ts`（新增）
  - `summaryTool` 已切成 Pi custom tool。
- `packages/ai/runtime/pi/tools/index.ts`
  - 已把 `translate-subtitles`、`summarize-content` 加入 Pi custom tools 装配。
- `packages/ai/runtime/pi/tool-context.ts`
  - 已把 `ResolvedPiRequest` 纳入 session-scoped context，供后台任务 chat runtime 复用当前 provider/model/secrets。
- `packages/ai/ipc-handler-helpers.ts`
  - `executeSubtitleTranslation()` / `executeSummarize()` 现在支持注入：
    - `chatFn`
    - `requestId`
    - `taskLabel`
    - `abortSignal`
  - 这样 Pi tools 可以继续复用原本的：
    - 事件广播
    - 项目文件保存
    - 翻译/总结资源更新
- `packages/ai/runtime/pi/tool-registry.ts`
  - `translate-subtitles`、`summarize-content` 已标记为 `ready-for-pi-runtime`。

### Wave 3 第二批完成标志

- `extras.runtime = "pi"` 的主聊天 session 中，已经可以由 `pi-coding-agent` 直接执行：
  - `translationTool`
  - `summaryTool`
- 这两个工具在 Pi 链路中不再依赖 `translationToolContext` / `summaryToolContext`。
- 它们的 AI 调用层已经切到 `pi-ai`，但仍复用现有后台任务落盘与事件回传逻辑。

### Wave 3 第三批已完成

- `packages/ai/runtime/pi/tools/youtube-download.ts`（新增）
  - `youtubeDownloadTool` 已切成 Pi custom tool。
- `packages/ai/runtime/pi/tools/youtube-subscribe.ts`（新增）
  - `youtubeSubscribeTool` 已切成 Pi custom tool。
- `packages/ai/runtime/pi/tools/index.ts`
  - 已把 `youtube-download`、`youtube-subscribe` 加入 Pi custom tools 装配。
- `packages/ai/runtime/pi/tool-registry.ts`
  - `youtube-download`、`youtube-subscribe` 已标记为 `ready-for-pi-runtime`。
- `packages/ai/runtime/legacy/task-chat.ts`（新增）
  - 把 legacy Mastra 的：
    - `setupModelAndAgent()`
    - `createChatFunction()`
    - `createLegacyTaskChatRuntime()`
      收缩到独立文件，避免继续堆在 `ipc-handler-helpers.ts` 中。
- `packages/ai/ipc-handler-helpers.ts`
  - `executeSubtitleTranslation()`、`executeSummarize()`、`executeMindmap()` 的 legacy fallback 已改为复用 `runtime/legacy/task-chat.ts`。
  - 文件本身不再直接 import：
    - `getAgent`
    - `ChatService`
    - `createModel`
    - `getAllSecrets()`
    - `getFirstApiKey()`

### Wave 3 第三批完成标志

- `extras.runtime = "pi"` 的主聊天 session 中，已经可以由 `pi-coding-agent` 直接执行：
  - `youtubeDownloadTool`
  - `youtubeSubscribeTool`
- Pi 主聊天链路下的核心工具 contract 已全部切到 Pi custom tool。
- `ipc-handler-helpers.ts` 中 legacy chat runtime 已被隔离到独立 helper，不再直接承载 Mastra 组装细节。

### 要改的文件

- `packages/ai/runtime/pi/tool-registry.ts`
- `packages/ai/runtime/pi/tool-context.ts`（需新增）
- `packages/ai/runtime/pi/tools/resource-query.ts`（需新增）
- `packages/ai/runtime/pi/tools/read-subtitle.ts`（需新增）
- `packages/ai/runtime/pi/tools/push-card.ts`（需新增）
- `packages/ai/runtime/pi/tools/summary.ts`（需新增）
- `packages/ai/runtime/pi/tools/translation.ts`（需新增）
- `packages/ai/runtime/pi/tools/youtube-download.ts`（需新增）
- `packages/ai/runtime/pi/tools/youtube-subscribe.ts`（需新增）
- `packages/ai/tools/*`

### Wave 3 下一批要做的事

1. 旧全局 context 清理
   - `push-card-tool-context` 在 Pi 主链路里已经可以不再依赖。
   - `translation-tool-context`、`summary-tool-context` 在 Pi 主链路里也已经可以不再依赖。
   - 还需要把 legacy Mastra 链路中的这些 context 一并替换掉。

2. 后台任务入口继续去 Mastra
   - `packages/ai/runtime/legacy/task-chat.ts`
     - 现在只剩一个被隔离的 legacy fallback。
   - 下一步要让：
     - 标题生成
     - tagging
     - mindmap
       也逐步改走 Pi execution/task runtime。

3. YouTube 逻辑继续 service 化
   - 当前 Pi 版已经可用，但仍然是“直接复用现有下载器 / RSS 仓储”。
   - 下一步可以把：
     - feed 拉取
     - RSS 资源创建
     - 下载任务创建
       继续抽成 Pi / legacy 共用 service。

### Wave 3 总体要做的事

- 不再复用 Mastra 的 `createTool()`。
- 把工具执行上下文从全局单例改成 session-scoped context。
- 保留现有工具 id，不动设置页的 `enabledTools` 数据。
- 先迁工具 contract，再迁工具内部逻辑。
- `pi-coding-agent` 在这一波成为真正的 tool loop 承载层。

### Wave 3 全部完成标志

- 主聊天链路中的工具调用不再依赖 Mastra。
- `translation-tool-context`、`summary-tool-context`、`push-card-tool-context` 可以开始退役。
- `youtubeDownloadTool`、`youtubeSubscribeTool` 已在 Pi session 中可直接执行。

## Wave 4

主题：把 one-shot 任务切到 `pi-ai`。

### Wave 4 第一批已完成

- `packages/ai/runtime/pi/execution-service.ts`（新增）
  - 新增统一的 Pi one-shot 执行入口，内部强制走 `extras.runtime = "pi"` 的 ephemeral 调用。
- `packages/ai/runtime/pi/tasks/title.ts`（新增）
  - 新增会话标题生成任务封装。
- `packages/ai/runtime/pi/tasks/tag.ts`（新增）
  - 新增文本标签抽取任务封装。
- `packages/ai/chat-service.ts`
  - 会话自动标题生成功能现在优先走 Pi execution runtime。
  - legacy fallback 已收紧到“仅在 Pi runtime 不可用时才回退 `chatEphemeral()`”。
- `packages/ai/services/tagging-service.ts`
  - `autoTagText()` 现在优先走 Pi execution runtime。
  - legacy tagger fallback 已收紧到“仅在 Pi runtime 不可用时才启用”。
- `packages/ai/runtime/pi/index.ts`
  - 已导出 `execution-service.ts`，方便后续 workflow / task 复用。

### Wave 4 第一批完成标志

- 会话标题生成不再依赖用户显式传入 `extras.runtime = "pi"`。
- `ai:autoTagText` 的主路径已经切到 Pi one-shot execution。
- Pi 运行时开始具备“主聊天 session 之外”的统一 one-shot 执行入口。

### Wave 4 第二批已完成

- `packages/ai/runtime/pi/task-chat.ts`
  - 新增从简单任务请求构建 Pi task runtime 的 helper，可供 direct IPC/background task 复用。
- `packages/ai/ipc-handler-helpers.ts`
  - `executeSubtitleTranslation()`、`executeSummarize()`、`executeMindmap()` 现在默认优先走 Pi task runtime。
  - 若 Pi task runtime 初始化失败，仍会回退到 legacy task runtime。
  - `MindmapPayload` 现在也支持：
    - `chatFn`
    - `requestId`
    - `taskLabel`
    - `abortSignal`
    - `providerInstanceId`
- `packages/ai/services/mindmap-service.ts`
  - `generateMindmap()` 已支持外部 `AbortSignal` 桥接。
- `packages/ai/ipc-renderer.ts`
  - `translate()`、`summarize()`、`generateMindmap()` payload 已补充 `providerInstanceId`。
- `packages/ai/types.ts`
  - 对应 AI IPC 类型已补充 `providerInstanceId`。

### Wave 4 第三批已完成

- `packages/ai/runtime/pi/execution-service.ts`
  - 已补上 `streamText()`，供 workflow / 轻量文本任务复用 Pi 流式执行。
- `packages/ai/chat-service.ts`
  - 自动标题生成现在只在 Pi runtime 不可用时才回退到 legacy 路径。
- `packages/ai/services/tagging-service.ts`
  - `autoTagText()` 现在只在 Pi runtime 不可用时才回退到 legacy tagger。

### Wave 4 第三批完成标志

- 标题生成与 auto tagging 不再把 legacy 当作“任意异常兜底”。
- `runtime/legacy/task-chat.ts` 的职责继续收缩，更多异常将直接暴露给 Pi 主路径处理。

### Wave 4 第二批完成标志

- direct IPC 触发的：
  - `ai:translate`
  - `ai:summarize`
  - `ai:generateMindmap`
    已经默认优先走 Pi task runtime。
- Pi runtime 不再只在 Pi session / tool 调用中生效，也开始接管后台任务入口。

### 要改的文件

- `packages/ai/runtime/pi/execution-service.ts`（需新增）
- `packages/ai/runtime/pi/tasks/title.ts`（需新增）
- `packages/ai/runtime/pi/tasks/tag.ts`（需新增）
- `packages/ai/runtime/pi/tasks/summarize.ts`（需新增）
- `packages/ai/runtime/pi/tasks/translate.ts`（需新增）
- `packages/ai/runtime/pi/tasks/prompt-optimize.ts`（需新增）
- `packages/ai/runtime/pi/tasks/image-understand.ts`（需新增）
- `packages/ai/ipc-handler-helpers.ts`
- `packages/ai/services/tagging-service.ts`
- `packages/ai/chat-service.ts`

### 要做的事

- 标题生成改成 `pi-ai` one-shot。
- tagging 改成 `pi-ai` one-shot。
- 总结、翻译的 AI 生成层从 Mastra agent 改成 task runner + `pi-ai`。
- `runtime/legacy/task-chat.ts` 被进一步缩小或删除，one-shot/后台任务默认改走 Pi execution runtime。

### 完成标志

- `ipc-handler-helpers.ts` 默认不再以 legacy Mastra task runtime 作为主路径。
- `tagging-service.ts` 的 legacy fallback 已收紧到“仅 Pi runtime 不可用时启用”。

## Wave 5

主题：统一工作流节点的 AI 执行入口。

### Wave 5 第一批已完成

- `packages/workflow/nodes/ai-workflow-utils.ts`（新增）
  - 新增 workflow 共享 helper，统一：
    - provider/model 选项加载
    - API Key 校验
    - Pi-first 文本执行
    - Pi 不可用时的 legacy `provider.chat()` fallback
- `packages/workflow/nodes/ai-chat.ts`
  - 节点执行已改为优先走 `PiExecutionService.streamText()`。
- `packages/workflow/nodes/ai-prompt-optimizer.ts`
  - 节点执行已改为优先走 `PiExecutionService.completeText()`。

### Wave 5 第一批完成标志

- 文本类 workflow 节点已开始复用 `execution-service.ts`，不再各自拼装 `provider.chat()` 请求。
- workflow 文本节点的 fallback 策略与主运行时保持一致：只有 Pi runtime 不可用时才退回 legacy。

### Wave 5 第二批已完成

- `packages/ai/runtime/pi/session-service.ts`
  - 已补上多模态 user message 映射：
    - `text`
    - `image`
    - 兼容 `image_url` data URL
- `packages/workflow/nodes/image-understand.ts`
  - 节点执行已改为优先走 `PiExecutionService`。
  - workflow 侧图片内容现在会以 Pi image block 形式进入 execution runtime。
- `packages/workflow/nodes/ai-workflow-utils.ts`
  - 新增 multimodal workflow request 支持：
    - `executeWorkflowChatRequest()`
    - `readImageAsRichContent()`
- `packages/workflow/nodes/image-generate.ts`
  - 已收敛到 workflow 共享 helper：
    - provider/model 选项
    - API Key 校验
  - 实际图片生成仍暂时保留 OpenAI SDK 路径，等待单独的 image execution adapter。

### Wave 5 第二批完成标志

- `image-understand` 已经不再直连 `provider.chat()`，而是通过 Pi-first execution runtime 执行。
- Pi workflow execution 已具备最小多模态输入能力，可承载图片 + 文本的 one-shot 节点。
- `image-generate` 的执行层虽然还未切到 Pi，但外围配置与校验边界已经统一。

### Wave 5 第三批已完成

- `packages/ai/chat-service.ts`
  - `PiSessionService` 已改为直接 import 具体文件，避免通过 `runtime/pi/index.ts` 触发任务 helper 的初始化环。
- `packages/ai/services/tagging-service.ts`
  - `PiExecutionService` 已改为直接 import 具体文件，并改成 lazy getter。
- `packages/workflow/nodes/ai-workflow-utils.ts`
  - `PiExecutionService` 已改成 lazy getter，避免 bundle 初始化顺序导致的 TDZ。
- `packages/ai/runtime/pi/tasks/title.ts`
  - `PiExecutionService` 已改成 lazy getter。
- `packages/ai/runtime/pi/tasks/tag.ts`
  - `PiExecutionService` 已改成 lazy getter。
- `packages/ai/runtime/pi/index.ts`
  - 不再从 barrel re-export `tasks/title`、`tasks/tag`，减少主进程启动时的循环依赖面。
- `packages/ai/runtime/pi/image-generation-service.ts`（新增）
  - 新增统一的 workflow image generation execution adapter。
- `packages/workflow/nodes/image-generate.ts`
  - 现在通过 `PiImageGenerationService` 执行图片生成，不再在节点内直接 new OpenAI client。

### Wave 5 第三批完成标志

- `ReferenceError: Cannot access 'PiExecutionService' before initialization` 的初始化环已被切断。
- workflow image generation 已开始从节点内联执行逻辑迁到独立 runtime service。

### Wave 5 第四批已完成

- `packages/ai/runtime/pi/image-generation-service.ts`
  - 已支持从通用 request 解析 provider / instance / secrets，再执行图片生成。
- `packages/ai/ipc-main.ts`
  - 新增 `ai:generateImage` IPC 入口，复用 `PiImageGenerationService`。
- `packages/ai/ipc-renderer.ts`
  - 新增 `generateImage()` bridge。
- `packages/ai/types.ts`
  - 已补充 `generateImage()` IPC 类型定义。
- `packages/ai/ipc-handler-helpers.ts`
  - `createPreferredTaskChatRuntime()` 现在先检查 Pi availability。
  - 仅在 Pi runtime 不可用时才回退到 legacy task runtime；Pi 已可用但初始化失败时不再静默回退。

### Wave 5 第四批完成标志

- image generation 不再只是 workflow 私有能力，已经具备 AI IPC 共享入口。
- `translate` / `summarize` / `mindmap` 的 task runtime fallback 已收紧到“Pi runtime unavailable only”。

### Wave 5 第五批已完成

- `packages/workflow/nodes/ai-workflow-utils.ts`
  - `executeWorkflowTextRequest()` / `executeWorkflowChatRequest()` 现在只接收 workflow 关心的 request 参数：
    - `providerId`
    - `providerInstanceId`
    - `model`
    - `messages`
  - Pi-first 执行路径不再要求调用方预先解析 provider / secrets。
  - legacy `provider.chat()` fallback 所需的 provider / secrets / instance secrets 解析，已下沉到 helper 内部，并且只在 Pi runtime unavailable 时触发。
  - Pi 路径若因缺少 provider 配置失败，会补发 workflow 的 `ai:missing-provider` 事件，保持原有配置引导体验。
- `packages/workflow/nodes/ai-chat.ts`
  - 节点不再自己预先解析 provider/secrets，统一交给 workflow helper。
- `packages/workflow/nodes/ai-prompt-optimizer.ts`
  - 节点不再自己预先解析 provider/secrets，统一交给 workflow helper。
- `packages/workflow/nodes/image-understand.ts`
  - 节点不再自己预先解析 provider/secrets，统一交给 workflow helper。
- `packages/workflow/nodes/image-generate.ts`
  - 图片生成节点现在直接调用 `PiImageGenerationService.generateImageUrlFromRequest()`。
  - 不再自己先取 provider secrets 再手动拼装 image generation request。
- `packages/ai/runtime/legacy/task-chat.ts`
  - legacy task fallback 现在也会解析 `providerInstanceId` 对应的 provider/model/secrets。
- `packages/ai/ipc-handler-helpers.ts`
  - background task 退回 legacy 时，`modelId` 会使用 legacy runtime 实际解析后的 model，而不是原始入参。

### Wave 5 第五批完成标志

- workflow AI 节点已经进一步收敛为“声明 request + 调用公共执行器”的形态。
- Pi-first workflow 执行路径不再要求节点层预读 provider secrets。
- image generation workflow 节点已完全切到 image runtime request resolver，和共享 IPC 入口使用同一套解析逻辑。
- 仍保留的 legacy task fallback 已开始对齐 provider instance 语义，避免 fallback 路径与 Pi 主路径配置不一致。

### Wave 5 第六批已完成

- `packages/workflow/nodes/ai-workflow-utils.ts`
  - workflow 动态配置已补上 `providerInstanceId` 选择项。
  - 选择实例预设后，模型下拉会优先使用该实例的 provider 与默认 model。
- `packages/workflow/nodes/ai-chat.ts`
  - 节点配置现在支持选择 provider instance，并把 `providerInstanceId` 传入执行请求。
- `packages/workflow/nodes/ai-prompt-optimizer.ts`
  - 节点配置现在支持选择 provider instance，并把 `providerInstanceId` 传入执行请求。
- `packages/workflow/nodes/image-understand.ts`
  - 节点配置现在支持选择 provider instance，并把 `providerInstanceId` 传入执行请求。
- `packages/workflow/nodes/image-generate.ts`
  - 节点配置现在支持选择 provider instance，图片生成请求也会复用该 instance 语义。

### Wave 5 第六批完成标志

- workflow AI 节点终于具备从配置 UI 到执行 runtime 的完整 provider instance 语义。
- `providerInstanceId` 不再只是底层 helper 能识别的隐藏能力，而是 workflow 真正可配置、可运行的能力。

### Wave 5 第七批已完成

- `packages/ai/ipc-handler-helpers.ts`
  - `translate` / `summarize` / `mindmap` 的后台任务 runtime 已切成纯 Pi 路径。
  - `createPreferredTaskChatRuntime()` 在 Pi runtime unavailable 时会直接抛错，不再回退到 legacy task runtime。
- `packages/ai/runtime/legacy/task-chat.ts`
  - 该 legacy task runtime 已从代码路径中移除。

### Wave 5 第七批完成标志

- `translate` / `summarize` / `mindmap` 的 legacy task fallback 已彻底删除。
- one-shot / workflow / background task 三条 Pi 执行链路已经都不再依赖 legacy task-chat。

### Wave 5 第八批已完成

- `packages/ai/chat-service.ts`
  - `chatStream()` 已强制把主聊天流式请求收口到 Pi session runtime。
  - 旧的 Mastra 流式分支已不再参与主聊天 streaming。
  - `pushCardToolContext`、`translationToolContext`、`summaryToolContext` 不再在主聊天链路中 set / clear。

### Wave 5 第八批完成标志

- 主聊天 streaming 已经成为 Pi-only 主路径，不再依赖 legacy Mastra 流式执行分支。
- legacy `*-tool-context` 已不再残留在聊天页的主流式链路里。

### 要改的文件

- `packages/workflow/nodes/ai-chat.ts`
- `packages/workflow/nodes/image-understand.ts`
- `packages/workflow/nodes/ai-prompt-optimizer.ts`
- `packages/workflow/nodes/image-generate.ts`
- `packages/workflow/nodes/ai-workflow-utils.ts`
- `packages/ai/runtime/pi/execution-service.ts`
- `packages/ai/ipc-handler-helpers.ts`

### 要做的事

- 第一批已完成：
  - `ai-chat`
  - `ai-prompt-optimizer`
  - workflow 共享 helper `ai-workflow-utils.ts`
- 下一批继续：
  - workflow helper 继续扩展：
    - 结构化输出
    - 统一 JSON schema / parser
  - 旧工具定义与 `*-tool-context` 文件继续退役
  - image generation adapter 继续向 renderer / 页面级实际消费场景扩展
  - 文本 / 视觉 / 结构化输出继续统一走 `execution-service.ts`

### 完成标志

- 文本类 workflow 节点已不再直连 `provider.chat()`。
- `image-understand` 已不再直连 `provider.chat()`。
- `packages/workflow/nodes` 下所有 AI 节点最终不再出现 `provider.chat()` 直连调用。
- workflow AI 节点最终不再自己读取 provider secrets。
- workflow AI 节点已支持 provider instance 级别配置。
- background task 已不再依赖 `runtime/legacy/task-chat.ts`。

## Wave 6

主题：重构 provider registry 和设置语义。

### Wave 6 第一批已完成

- `packages/ai/registry.ts`
  - 已从 Mastra `Agent` 实例注册表改为轻量的 provider/profile catalog。
  - `listAgents()` 现在直接基于 Pi profile registry 暴露 UI 所需的 profile 元数据。
  - `registry.ts` 已不再 import `@mastra/core/agent`。
- `packages/ai/ipc-main.ts`
  - 不再注册 Mastra agent 实例作为 UI agent 列表来源。
  - `ai:getAgents` 现在直接消费 profile catalog。
- `packages/ai/services/tagging-service.ts`
  - legacy tagger fallback 改为直接从 `packages/ai/agents/index.ts` 取 Mastra agent。
  - registry 层不再承担 legacy agent 实例分发职责。

### Wave 6 第二批已完成

- `packages/ai/models/index.ts`
  - 已明确降级为仅供 legacy Mastra fallback 使用的 shim。
  - provider id 会先统一映射到 canonical id，再进入 legacy model creator。
  - `deepseek` / `qwen` / `zhipu` 已统一改走 OpenAI-compatible AI SDK model 创建逻辑。
- `packages/ai/registry.ts`
  - `getProvider(id)` 已支持基于 canonical provider id 做 alias lookup。
  - legacy fallback 路径现在不会再因为 `google/gemini`、`zhipu/zhipuai` 的历史别名而找错 provider。

### Wave 6 第三批已完成

- `packages/ai/settings-store.ts`
  - provider secrets / API key 的读写语义已收口到 canonical provider id。
  - 读取时仍兼容历史 alias key；写入时会自动归并到 canonical key。
- `packages/ai/instances-store.ts`
  - provider instance 的 `providerId` 已在 create / update / read / list 路径统一 canonical 化。
- `packages/ai/ipc-main.ts`
  - `ai:getProviders` 现在会向 renderer 暴露 provider aliases。
- `src/lib/ai-provider-identity.ts`
  - 新增 renderer 侧 provider identity helper，用于 alias 兼容。
- `src/components/common/ProviderModelSelect.tsx`
  - provider/model 选择器现在会把历史 alias 自动解析回 canonical provider。
- `src/pages/SettingsPage/components/AiSettings.tsx`
  - 设置页初始 provider 选择现在兼容历史 alias 值。
- `src/pages/AiProviderConfigWindow/AiProviderConfigWindow.tsx`
  - provider 配置窗口现在会先把 payload 中的 provider id 归一化，再读取/保存 secrets。

### Wave 6 第四批已完成

- `packages/ai/runtime/pi/session-service.ts`
  - `chat()` 现在也支持非流式的 `pi-coding-agent` session 路径。
  - 当请求带工具且 coding session 不可用时，会直接报错，而不是静默回退到 plain text。
- `packages/ai/chat-service.ts`
  - `chat()` / `chatEphemeral()` 现在已切成 Pi-first。
  - legacy Mastra 非流式逻辑已被下沉到专门的 fallback 分支，不再作为默认主路径。
  - 对外仍保留 `getProviderConfig()` 兼容别名，避免示例/旧入口立刻失效。
- `src/pages/SettingsPage/components/AiSettings.tsx`
  - provider quick test 现在显式使用最小 `chat` profile，避免把“连通性测试”误放大成“整套 assistant + tools session 测试”。

### Wave 6 第五批已完成

- `packages/ai/chat-service-ai-mastra.ts`
  - 已承接 legacy 非流式 chat / chatEphemeral fallback 的实际执行逻辑。
  - legacy provider fallback、instance merge、conversation persistence 已统一收口到这个模块。
- `packages/ai/chat-service.ts`
  - 已不再静态 import `@mastra/core/agent`、`agents/index.ts`、`models/index.ts`。
  - legacy 非流式 fallback 现在改为按需动态加载 `chat-service-ai-mastra.ts`。
  - 主聊天服务文件本体进一步收缩为 “Pi 主路径 + legacy fallback 调度器”。

### Wave 6 第六批已完成

- `packages/ai/runtime/pi/profile-descriptors.ts`（新增）
  - 抽出了 Pi profile 的纯数据描述：
    - instructions
    - defaultToolIds
    - executionMode
    - supportsToolCalls
- `packages/ai/legacy/tool-factory.ts`（新增）
  - 把 legacy Mastra tools 改成 request-scoped factory。
  - 非流式 fallback 现在可以显式绑定：
    - `conversationId`
    - `targetWindowId`
    - `providerId`
    - `providerInstanceId`
    - `model`
- `packages/ai/legacy/mastra-agent-factory.ts`（新增）
  - 基于 descriptor + request-scoped tools 创建 legacy Mastra agent。
- `packages/ai/chat-service-ai-mastra.ts`
  - 已不再直接 import `packages/ai/agents/index.ts`。
  - legacy 非流式 fallback 现在直接消费 descriptor/factory，并把 conversation/window/provider/model 语义绑定到当前请求。
- `packages/ai/services/tagging-service.ts`
  - legacy tagger fallback 已不再依赖 `packages/ai/agents/index.ts` 的共享单例 agent。
- `packages/ai/runtime/pi/profile-registry.ts`
  - Pi profile instructions / tool defaults 现在直接来自 profile descriptor。
  - `session-service.ts` 不再需要动态 import legacy agent 来取 instructions。
- `packages/ai/tools/translation-tool.ts`
  - legacy translation tool 现在支持显式 runtime binding。
- `packages/ai/tools/summary-tool.ts`
  - legacy summary tool 现在支持显式 runtime binding。
- `packages/ai/agents/index.ts`
  - 已退化为基于 descriptor/factory 的兼容层，不再自己维护一套 instructions/tool 绑定实现。

### Wave 6 第七批已完成

- `packages/ai/tools/translation-tool.ts`
  - 已完全切成显式 runtime binding，不再从全局 singleton 读取上下文。
- `packages/ai/tools/summary-tool.ts`
  - 已完全切成显式 runtime binding，不再从全局 singleton 读取上下文。
- `packages/ai/tools/push-card-tool.ts`
  - 已完全切成显式 request binding，只消费调用方传入的：
    - `conversationId`
    - `targetWindowId`
- `packages/ai/tools/index.ts`
  - 已取消 `translationTool` / `summaryTool` / `pushCardTool` 的默认无绑定导出。
  - `getAITools()` / `getAllTools()` 改为 factory 风格，按传入 bindings 生成工具集。
- `packages/ai/tools/push-card-tool-context.ts`
  - 已从代码库删除。
- `packages/ai/tools/translation-tool-context.ts`
  - 已从代码库删除。
- `packages/ai/tools/summary-tool-context.ts`
  - 已从代码库删除。
- `packages/ai/examples/resource-query-handler.ts`
  - 示例已不再依赖 `packages/ai/agents/index.ts`，改为直接使用 legacy factory 与显式绑定工具。
- `packages/ai/tools/README.md`
  - 已改成显式 binding / factory 风格说明。

### Wave 6 第八批已完成

- `packages/ai/providers/metadata.ts`（新增）
  - 新增 built-in provider metadata 集中层，统一收口：
    - `label`
    - `defaultModel`
    - `providerBaseUrl`
    - `piBaseUrl`
- `packages/ai/providers/catalog.ts`（新增）
  - 新增 built-in provider catalog/factory 层。
  - built-in provider 的注册不再散落在 `ipc-main.ts`。
- `packages/ai/ipc-main.ts`
  - 内建 provider bootstrapping 已改为 `registerBuiltInProviders()`。
  - 主入口不再直接 import 每一个 provider class。
- `packages/ai/models/index.ts`
  - legacy model shim 的默认模型/baseUrl 已开始消费 provider metadata。
  - provider 默认值不再只靠文件内硬编码散落维护。
- `packages/ai/runtime/pi/session-service.ts`
  - Pi fallback model/baseUrl 默认值已开始消费 provider metadata。
- `packages/ai/providers/deepseek.ts`
  - provider 默认 label/baseUrl/model 已改为来自 metadata。
- `packages/ai/providers/qwen.ts`
  - provider 默认 label/baseUrl/model 已改为来自 metadata。
- `packages/ai/providers/zhipu.ts`
  - provider 默认 label/baseUrl/model 已改为来自 metadata。
- `packages/ai/agents/index.ts`
  - 已进一步收缩为动态 compat shell。
  - 不再在模块初始化时 eager 构建 legacy Mastra agent 单例。

### Wave 6 第九批已完成

- `packages/ai/providers/openai-runtime.ts`（新增）
  - 抽出 OpenAI/OpenAI-compatible 共享 runtime helper：
    - chat
    - embeddings
    - model listing
- `packages/ai/providers/openai-compatible.ts`
  - 已改为复用共享 OpenAI runtime helper。
- `packages/ai/providers/openai.ts`
  - 已改为复用共享 OpenAI runtime helper。
  - 默认 label/model/baseUrl 也开始直接复用 provider metadata。
- `packages/ai/agents/index.ts`
  - 已从代码库删除。
- `packages/ai/tools/resource-query-tool.ts`
  - 文档说明已改为指向显式 binding / legacy factory，而不是旧 `agents/index.ts`。

### Wave 6 第十批已完成

- `packages/ai/providers/provider-runtime-utils.ts`（新增）
  - 新增 provider runtime 共用 helper，统一：
    - assistant message 封装
    - streaming completion 结果组装
    - curated/default model fallback
- `packages/ai/providers/anthropic-runtime.ts`（新增）
  - 抽出 Anthropic 专用 runtime helper：
    - chat
    - model listing fallback
  - `system` message 已开始收口到 Anthropic 原生请求形态。
- `packages/ai/providers/gemini-runtime.ts`（新增）
  - 抽出 Gemini 专用 runtime helper：
    - chat
    - model listing fallback
  - `system` / `assistant` message 已开始收口到 Gemini `systemInstruction` / `model` role 形态。
- `packages/ai/providers/ollama-runtime.ts`（新增）
  - 抽出 Ollama 专用 runtime helper：
    - chat
    - embeddings
    - model listing
  - 流式 NDJSON 读取已修正为带缓冲的逐行解析，避免 chunk 分裂导致 JSON parse 丢失。
- `packages/ai/providers/anthropic.ts`
  - 已改为 metadata + runtime helper + thin adapter 风格。
  - 现在会正确消费 `req.extras.secrets` / instance secrets override。
- `packages/ai/providers/gemini.ts`
  - 已改为 metadata + runtime helper + thin adapter 风格。
  - 现在会正确消费 `req.extras.secrets` / instance secrets override。
- `packages/ai/providers/ollama.ts`
  - 已改为 metadata + runtime helper + thin adapter 风格。
  - 现在会正确消费 `req.extras.secrets` / instance secrets override。

### Wave 6 第十批完成标志

- `anthropic` / `gemini` / `ollama` 不再各自内嵌大段 SDK / fetch 执行逻辑。
- legacy workflow / fallback 传入的 `extras.secrets` 在这三类 provider 中终于可用。
- built-in provider 默认 label / model / baseUrl 的收口已经从 OpenAI 系继续扩展到其它主 provider。

### Wave 6 第十一批已完成

- `packages/ai/legacy/nonstreaming-chat-executor.ts`（新增）
  - 抽出 legacy 非流式 chat 的共享 executor，统一：
    - provider / instance / secrets 合并
    - legacy agent 创建
    - legacy provider chat fallback
    - legacy agent input 构造
  - provider 全局 secrets、instance config、instance secrets、request override 现在会在同一处合并。
- `packages/ai/chat-service-ai-mastra.ts`
  - 已瘦身为围绕 executor 的薄包装层。
  - conversation persistence 仍留在这里，但不再自己承担 instance merge / model 创建 / provider fallback 细节。
  - legacy non-streaming path 现在终于会正确消费 `providerInstanceId` 对应的 secrets / baseUrl / model override。

### Wave 6 第十一批完成标志

- `chat-service-ai-mastra.ts` 不再继续膨胀成“万能遗留桶”。
- legacy 非流式 chat / chatEphemeral 的 provider instance 语义已补正，不再只吃 provider 全局 secrets。
- 下一步删除整个 legacy 非流式聊天文件时，已经只剩调度包装和持久化边界需要搬迁。

### Wave 6 第十二批已完成

- `packages/ai/services/tagging-service.ts`
  - legacy tagging fallback 已不再直接调用 `createLegacyMastraAgent()`。
  - 现在统一通过 `ChatService.chatEphemeral()` 进入 Pi-first / legacy fallback 调度层。
- `packages/ai/examples/resource-query-handler.ts`
  - 示例文件已彻底移除：
    - `@mastra/core/agent`
    - `new Agent(...)`
    - `createLegacyMastraAgent(...)`
    - `createModel(...)`
  - `smartResourceQuery` 现在直接通过 `ChatService` 触发带 `query-resources` 工具的 ephemeral 对话。
  - `naturalResourceQuery` 现在改为：
    - ChatService 解析自然语言为查询参数
    - 直接执行 `resourceQueryTool`
    - ChatService 生成结果总结
- `packages/ai/legacy/*`
  - 经过这一批后，生产代码里的 Mastra `Agent` 引用已经收缩到隔离的 legacy helper 层，不再散落在业务文件中。

### Wave 6 第十二批完成标志

- `tagging-service.ts` 与 `resource-query-handler.ts` 这两个非主路径入口，已经不再直接触达 Mastra runtime。
- 生产代码里的 `@mastra/core/agent` 已基本只剩 `legacy/mastra-agent-factory.ts` 与 `legacy/nonstreaming-chat-executor.ts` 两处隔离层。
- 到 Wave 7 前，剩余最大的单点已经收敛为 `chat-service-ai-mastra.ts` 的最后一层 compat 包装。

### Wave 6 第十三批已完成

- `packages/ai/legacy/nonstreaming-chat-service.ts`（新增）
  - legacy 非流式 chat / chatEphemeral 的 conversation persistence 包装已迁入 `legacy` 目录。
- `packages/ai/chat-service.ts`
  - legacy 非流式 fallback 现在直接按需加载 `legacy/nonstreaming-chat-service.ts`。
- `packages/ai/chat-service-ai-mastra.ts`
  - 已退化成 compat re-export，不再承载真实执行逻辑。

### Wave 6 第十三批完成标志

- `chat-service-ai-mastra.ts` 已不再是实际执行热点。
- legacy 非流式聊天实现已经整体搬进 `packages/ai/legacy`，与 Pi 主路径的边界更清晰。
- 从重构阶段划分上看，现在已经具备切入 Wave 7 的条件：生产代码里的 Mastra 运行时只剩隔离 helper 层。

## Wave 7

主题：清理旧依赖和遗留路径。

### Wave 7 第一批已完成

- `packages/ai/tools/tool-definition.ts`（新增）
  - 新增本地轻量 tool definition helper，承接 legacy tool 文件所需的最小 contract。
- `packages/ai/tools/resource-query-tool.ts`
- `packages/ai/tools/read-subtitle-tool.ts`
- `packages/ai/tools/translation-tool.ts`
- `packages/ai/tools/summary-tool.ts`
- `packages/ai/tools/push-card-tool.ts`
- `packages/ai/tools/youtube-download-tool.ts`
- `packages/ai/tools/youtube-subscribe-tool.ts`
- `packages/ai/tools/translation-coordinator-tool.ts`
  - 上述 legacy tool 文件已不再依赖：
    - `@mastra/core`
    - `@mastra/core/tools`
- `packages/ai/chat-service-ai-mastra.ts`
  - 已从代码库删除。
  - 旧的 compat 角色已由 `legacy/nonstreaming-chat-service.ts` 接替。

### Wave 7 第一批完成标志

- 生产代码里的旧工具定义 contract 已不再依赖 Mastra。
- `chat-service-ai-mastra.ts` compat 壳已真正删除。
- `@mastra/core` 在生产代码里的剩余引用已继续收缩到：
  - `packages/ai/legacy/mastra-agent-factory.ts`
  - `packages/ai/legacy/nonstreaming-chat-executor.ts`

### Wave 7 第二批已完成

- `packages/ai/chat-service.ts`
  - `chat()` / `chatEphemeral()` 已彻底切成 Pi-only 非流式入口。
  - 主聊天服务不再动态加载任何 legacy 非流式 fallback。
- `packages/ai/legacy/nonstreaming-chat-service.ts`
- `packages/ai/legacy/nonstreaming-chat-executor.ts`
- `packages/ai/legacy/mastra-agent-factory.ts`
- `packages/ai/legacy/tool-factory.ts`
- `packages/ai/models/index.ts`
  - 上述仅为 legacy Mastra / ai-sdk 非流式 fallback 服务的文件已从代码库删除。
- `package.json`
  - 已移除仅供上述 fallback 使用的依赖：
    - `@mastra/core`
    - `@ai-sdk/openai`
    - `@ai-sdk/anthropic`
    - `@ai-sdk/google`
    - `ai`

### Wave 7 第二批完成标志

- 仓库默认聊天运行时现在只剩 Pi。
- Mastra / ai-sdk 已退出生产代码与项目依赖。
- `packages/ai/legacy` 目录现在只保留 profile 描述元数据，不再承载执行运行时。

### Wave 7 第三批已完成

- `packages/ai/runtime/pi/execution-service.ts`
  - `PiExecutionService` 现在统一承接：
    - `embed()`
    - `transcribe()`
    - `generateImage()`
  - 文本以外的 provider 能力开始从零散入口收口到统一 execution layer。
- `packages/ai/chat-service.ts`
  - `ai:embed` 现在改为通过 `PiExecutionService.embed()` 执行。
  - embeddings 请求也开始支持 `providerInstanceId` 语义。
- `packages/ai/ipc-main.ts`
  - `ai:transcribe` / `ai:generateImage` 现在统一改走 `PiExecutionService`。
- `packages/ai/ipc-renderer.ts`
  - `transcribe()` / `embed()` bridge 已补上 `providerInstanceId`。
  - `transcribe()` 现在会把 `ArrayBuffer` 正常转成 `Buffer` 再过 IPC。
- `packages/workflow/nodes/ai-workflow-utils.ts`
  - 新增统一的 workflow image generation execution helper。
- `packages/workflow/nodes/image-generate.ts`
  - 图片生成节点现在改走 `PiExecutionService.generateImage()`，不再直接 new image runtime service。
- `packages/ai/providers/zhipu.ts`
  - `transcribe()` 已支持 request-scoped secrets override / baseUrl override，开始对齐 instance 语义。

### Wave 7 第三批完成标志

- `embed` / `transcribe` / `generateImage` 三类能力现在都已经有统一的 execution/runtime 入口。
- renderer IPC、主进程 IPC、workflow 图片生成节点不再各自维护一套图片/转写执行拼装逻辑。
- provider instance / secrets 语义开始真正覆盖到 embeddings 与 transcribe，而不只是在聊天链路里生效。

### 要改的文件

- `packages/ai/registry.ts`
- `packages/ai/settings-store.ts`
- `packages/ai/instances-store.ts`
- `packages/ai/providers/*.ts`
- `packages/ai/providers/provider-runtime-utils.ts`
- `packages/ai/providers/anthropic-runtime.ts`
- `packages/ai/providers/gemini-runtime.ts`
- `packages/ai/providers/ollama-runtime.ts`
- `packages/ai/providers/metadata.ts`
- `packages/ai/providers/catalog.ts`
- `packages/ai/runtime/pi/execution-service.ts`
- `packages/ai/runtime/pi/session-service.ts`
- `packages/ai/ipc-main.ts`
- `src/lib/ai-provider-identity.ts`
- `src/components/common/ProviderModelSelect.tsx`
- `src/pages/SettingsPage/components/AiSettings.tsx`
- `src/pages/AiProviderConfigWindow/AiProviderConfigWindow.tsx`

### 要做的事

- 把 `registry.ts` 从 “provider + Mastra agent 混合表” 改成：
  - provider catalog
  - profile registry
  - execution service access
- `providers/*.ts` 逐步从“执行者”降级成“描述器 + 特殊能力适配器”。
- 继续把 provider 侧剩余特殊能力：
  - transcribe
  - embeddings
  - image generation
    往统一 runtime helper / execution service 收口。
- 设置页中的 “provider instance” 在语义上逐步升级为 “agent profile preset”。
- provider / secrets / instance 持久化语义已统一走 canonical provider id。
- renderer 设置入口已兼容历史 alias 值，后续可以继续清理旧存量配置。

### Wave 7 第四批已完成

- `packages/ai/instances-store.ts`
  - 存储主语义已经升级为 `preset`，默认写入 `ai-provider-presets.json`，并兼容读取历史 `ai-provider-instances.json`。
  - `PresetsStore` 已成为主出口，`InstancesStore` 只保留兼容别名。
- `packages/ai/settings-store.ts`
  - provider preset secrets 已补上 `get/set/clear` alias，方便 renderer / main 渐进切换而不破坏老数据。
- `packages/ai/ipc-main.ts`
  - 已补齐：
    - `ai:listPresets`
    - `ai:createPreset`
    - `ai:updatePreset`
    - `ai:deletePreset`
    - `ai:getPresetSecrets`
    - `ai:setPresetSecrets`
  - legacy instance IPC 现在只作为 preset alias 保留。
- `packages/ai/ipc-renderer.ts`
  - renderer bridge 现在以 preset API 为主语义，legacy instance 方法改成纯 alias，不再依赖对象方法里的 `this`。
- `src/pages/ChatPage/hooks/useProvidersInstances.ts`
  - provider/preset 共享 hook 已稳定。
  - `instancesMap` / `getInstances()` 现在只是对 `presetsMap` / `getPresets()` 的兼容映射。
- `src/pages/ChatPage/context/ChatSelectionContext.tsx`
  - 聊天选择状态现在优先持久化 `presetId`，同时兼容读取/回写旧 `instanceId`。
- `src/pages/ChatPage/components/ServiceInstanceSelect.tsx`
  - 用户可见文案已统一切到 “预设”。
- `src/pages/SettingsPage/components/AiSettings.tsx`
  - 设置页的 CRUD、secrets、快速测试都已经切到 preset API。
  - 用户可见文案从 “实例” 升级为 “预设”。
- `src/pages/ResourcePage/components/AIChatSidebar.tsx`
  - 资源页 AI 侧边栏已移除错误的 `getProviderInstances()` 依赖，改走 `listPresets()`。
  - 本地持久化同样开始优先使用 `presetId`。
- `src/pages/TaggingPage/TaggingPage.tsx`
  - 打标入口的选择文案已与 preset 语义对齐。

### Wave 7 第四批完成标志

- 主设置入口、聊天选择器、资源页 AI 侧边栏、Tagging 页都已经以 “预设” 为统一用户语义。
- renderer IPC / main IPC / 本地存储已经形成 “preset 为主、instance 为兼容别名” 的过渡闭环。
- 第七波的重点已经从“继续清 Mastra”转为“在纯 Pi 基线之上继续收口 provider capability 与 preset 体验”。

### Wave 7 总完成标志

- 仓库默认 AI 运行时只剩 Pi。
- Mastra 不再出现在生产路径中。
- embeddings / transcribe / image generation / preset 语义都已经收口到 Pi-first 主路径。
- 后续迭代重点正式转为 provider 能力收口与体验升级，而不是继续清理 legacy runtime。

### Wave 8 第一批已完成

- `packages/ai/ipc-main.ts`
  - `ai:getProviders` 现在会把 provider catalog metadata 一并暴露给 renderer：
    - `kind`
    - `defaultModel`
- `packages/ai/types.ts`
  - 新增 `ProviderRecord`，把 renderer 侧 `getProviders()` 的数据结构正式类型化。
- `src/components/common/ProviderModelSelect.tsx`
  - 模型列表缓存现在开始支持 provider/preset 维度，而不再只有 provider 维度。
  - `listModels()` 已支持在当前 provider 上继承 `presetId` 语义。
  - `autoLoadFirst` 现在会真正自动选中首个 provider 的默认模型，不再只是“预加载模型但不落选中值”。
  - provider 默认模型优先级现在复用 catalog metadata，而不是纯前端猜测。
- `src/pages/AiProviderConfigWindow/AiProviderConfigWindow.tsx`
  - 配置窗字段标签已开始复用 provider locale。
  - 已补上 `select` 类型字段支持，方便后续 provider schema 扩展。

### Wave 8 第一批完成标志

- renderer 已经可以消费 canonical provider metadata，而不是继续散落地猜 `defaultModel`。
- `ProviderModelSelect` 开始具备 preset-aware model listing 能力，为后续 preset 体验深化打下基础。
- provider 配置窗与 provider schema 的契合度继续提升，后续扩展新 provider 字段时不必再次返工基础控件。

### Wave 8 第二批已完成

- `packages/ai/types.ts`
  - 新增统一的 provider capability / default models 类型：
    - `ProviderCapabilities`
    - `ProviderDefaultModels`
- `packages/ai/providers/metadata.ts`
  - builtin provider metadata 现在开始显式声明：
    - `capabilities`
    - `defaultModels`
  - 新增统一 helper：
    - `getProviderCapabilities()`
    - `getProviderDefaultModels()`
    - `supportsProviderCapability()`
- `packages/ai/ipc-main.ts`
  - `ai:getProviders` 现在会继续向 renderer 暴露：
    - `capabilities`
    - `defaultModels`
- `packages/ai/runtime/pi/execution-service.ts`
  - `embed()` / `transcribe()` / `generateImage()` 现在开始统一走 provider capability metadata 校验，不再只靠 adapter method 是否存在来“猜支持”。
  - 这一步开始允许 metadata 对 inherited compat adapter 的“伪能力”做收口，例如 DeepSeek embeddings。
- `packages/workflow/nodes/ai-workflow-utils.ts`
  - workflow 动态 provider 列表开始支持 capability 过滤。
- `packages/workflow/nodes/image-generate.ts`
  - 图片生成节点现在只展示声明支持 image generation 的 provider。
- `src/components/common/ProviderModelSelect.tsx`
  - provider 默认模型选择开始支持 capability-aware `defaultModels`，不再只认聊天默认模型。
- `src/pages/RecordingPage/ASRConfigPage.tsx`
  - 云端转写 provider 列表现在只展示已声明支持 transcribe 的 provider。
- `resources/providers/openai.models.json`
  - 补充 OpenAI 图片模型元数据，开始对齐 image generation workflow 入口。

### Wave 8 第二批完成标志

- provider capability 不再散落在 adapter method、renderer 猜测和 workflow 静态判断里，而是开始有统一 metadata source。
- Pi execution runtime 已经能用 capability metadata 抑制“代码上有方法、实际产品上没接通”的假能力暴露。
- renderer 与 workflow 都已经开始消费同一套 capability 信息，后续接 preset 和页面入口时不需要再各自重复建判断表。

### Wave 8 第三批已完成

- preset 体验深化已经正式收口：
  - `src/pages/ChatPage/context/ChatSelectionContext.tsx`
  - `src/pages/ChatPage/components/ServiceInstanceSelect.tsx`
  - `src/pages/ChatPage/ChatPage.tsx`
  - `src/pages/ChatPage/StartPage.tsx`
  - `src/pages/ChatPage/components/ChatInput.tsx`
  - `src/pages/ChatPage/components/ChatInputBar.tsx`
  - `src/components/chat/ChatInputWithService.tsx`
  - 聊天主链路内部现在以 `presetId` 为主语义，`instanceId` 只保留兼容 alias。
- preset 配置与 model 继承关系继续对齐：
  - `src/components/common/ProviderModelSelect.tsx`
  - `src/pages/AiProviderConfigWindow/AiProviderConfigWindow.tsx`
  - 配置检查现在统一合并 provider secrets + preset secrets。
  - provider 配置窗已经支持 preset-scoped secrets 的读取/保存，不再需要单独维护第二套预设配置 UI。
- renderer 页面级 preset 接线继续扩展：
  - `src/pages/ResourcePage/components/AIChatSidebar.tsx`
  - `src/pages/ResourcePage/components/Players/SubtitlePlayer/SubtitleListPlayer/AnnotationPopover.tsx`
  - `src/pages/ResourcePage/components/Players/SubtitlePlayer/SubtitleTranslator.tsx`
  - `src/pages/ResourcePage/components/tabs/TranslateTab.tsx`
  - `src/pages/ResourcePage/components/tabs/SummaryTab.tsx`
  - `src/pages/ResourcePage/components/tabs/MindmapTab.tsx`
  - 资源页聊天、词汇生成、翻译、总结、脑图入口现在都开始显式携带所选 preset，并统一透传到 `providerInstanceId`。

### Wave 8 第三批完成标志

- renderer 可见语义已经从“实例”稳定过渡到“预设”，同时继续保留 legacy alias 以避免历史数据和窗口 payload 断裂。
- provider 配置、model listing、聊天入口、资源页 AI 入口已经共用同一套 preset 选择与 secrets 继承规则。
- Wave 8 的 preset 体验深化目标已经完成，不再只停留在设置页或聊天页的局部改造。

### Wave 8 第四批已完成

- provider/runtime 继续压缩到 descriptor + adapter 边界：
  - `packages/ai/providers/openai.ts`
  - `packages/ai/providers/openai-compatible.ts`
  - `packages/ai/providers/anthropic.ts`
  - `packages/ai/providers/gemini.ts`
  - `packages/ai/providers/ollama.ts`
  - builtin provider adapter 现在开始显式暴露 `getCapabilities()` / `getDefaultModels()`，避免 renderer 与 execution 层继续倒推能力。
- OpenAI transcribe capability 已正式补齐：
  - `packages/ai/providers/openai-runtime.ts`
  - `packages/ai/providers/openai.ts`
  - `packages/ai/providers/metadata.ts`
  - `resources/providers/openai.models.json`
  - OpenAI 现在已经接通真实 `audio.transcriptions` 执行路径，并显式声明 `transcribe: true` / `defaultModels.transcribe = gpt-4o-mini-transcribe`。
- renderer 页面级 transcribe 入口也已经对齐：
  - `src/pages/RecordingPage/ASRConfigPage.tsx`
  - OpenAI 从 model-bank 暴露出来的 `stt` 模型现在会被兼容识别为音频转写模型，云端 ASR 页面可以直接选用。

### Wave 8 第四批完成标志

- provider capability metadata 不再只是 catalog 声明，adapter 本身也开始能给出稳定的 capability/default-model 视图。
- OpenAI 在 Wave 8 内的 remaining capability gap 已补齐，不再需要继续把 transcription 留在“计划中”。
- renderer 页面上的聊天、资源处理、云端转写三类主要 AI 消费入口，现在都已经落到 Pi-first provider capability 主路径上。

### Wave 8 总完成标志

- preset 语义、page-level capability wiring、provider capability metadata、OpenAI transcription gap 都已经在 Wave 8 内完成收口。
- 当前仓库里的 Pi-first 主路径已经覆盖：
  - chat
  - embeddings
  - transcribe
  - image generation
  - preset-scoped config / model resolution
- 后续阶段不再是“补齐 Wave 8 缺口”，而是进入新的增量优化阶段，例如新增 provider、扩展更多页面入口或继续做 provider descriptor 化。

### Wave 9 第一批已完成

- `src/pages/ChatPage/components/ServicePresetSelect.tsx`
  - 新增 canonical preset 选择器，作为后续 renderer 主实现。
- `src/pages/ChatPage/components/ServiceInstanceSelect.tsx`
  - 已降级为纯兼容包装层，只负责承接 `instanceId` / `orderInstances` 等旧 props 并转给 `ServicePresetSelect`。
- `src/pages/ChatPage/hooks/useProvidersInstances.ts`
  - 新增 `useProvidersPresets()` 作为 canonical hook。
  - `useProvidersInstances()` / `instancesMap` / `getInstances()` 继续只保留兼容 alias。
- `src/pages/ChatPage/context/ChatSelectionContext.tsx`
  - 聊天选择上下文已进一步收窄到 preset 主语义，不再把 `instanceId` / `setInstanceId` / `getOrderedInstances` 暴露为主接口。
  - 本地持久化仍兼容读取/回写历史 `instanceId`。
- renderer 页面入口已切到 canonical selector：
  - `src/components/chat/ChatInputWithService.tsx`
  - `src/pages/ChatPage/components/ChatInput.tsx`
  - `src/pages/ChatPage/StartPage.tsx`
  - `src/pages/TaggingPage/TaggingPage.tsx`
  - `src/pages/ResourcePage/components/tabs/TranslateTab.tsx`
  - `src/pages/ResourcePage/components/tabs/SummaryTab.tsx`
  - `src/pages/ResourcePage/components/tabs/MindmapTab.tsx`
  - `src/pages/ResourcePage/components/Players/SubtitlePlayer/SubtitleTranslator.tsx`
  - `src/pages/ResourcePage/components/Players/SubtitlePlayer/SubtitleListPlayer/AnnotationPopover.tsx`
  - 内部页面不再需要直接依赖 `ServiceInstanceSelect`。
- `src/pages/ChatPage/StartPage.tsx`
  - 内部打开聊天窗口时，不再继续主动发送冗余的 `instanceId` payload。
- `packages/ai/settings-store.ts`
  - preset secrets 的 canonical 实现已翻转为：
    - `setPresetSecret`
    - `getPresetSecret`
    - `getAllPresetSecrets`
    - `setPresetSecrets`
    - `deletePresetSecret`
    - `clearPresetSecrets`
  - `*Instance*` 系列方法现在只保留兼容 alias。
- `packages/ai/ipc-main.ts`
  - main 进程内部已优先调用 `getAllPresetSecrets()` / `setPresetSecrets()`。
  - instance IPC 继续保留，但只作为 compat alias。
- `packages/workflow/nodes/ai-workflow-utils.ts`
  - workflow 内部已切到 `PresetsStore` / `getAllPresetSecrets()` 主语义。
  - 动态配置文案从“实例预设”继续收口到更中性的“服务预设”。
- `src/pages/ResourcePage/components/AIChatSidebar.tsx`
  - 本地状态命名已改为 `presetsMap`，减少 renderer 里的 alias 噪音。

### Wave 9 第一批完成标志

- renderer 主选择器已经从“旧组件名字下的 preset 文案”进一步升级为“新组件主实现 + 旧组件兼容壳”。
- preset store / preset secrets / workflow provider context 的内部主路径继续统一到 canonical preset 语义。
- `instance` 在当前阶段主要只剩：
  - IPC compat alias
  - 本地存储兼容键
  - 少量历史字段名（如 `providerInstanceId` / `instances` 存储字段）等待后续独立评估。

### Wave 9 第二批已完成

- 新增 `packages/ai/provider-preset.ts`
  - 提供统一 helper：
    - `resolveProviderPresetId()`
    - `withProviderPresetCompat()`
  - 用于把 `providerPresetId` / `providerInstanceId` 的兼容逻辑从各处零散判断收口到一个位置。
- `packages/ai/types.ts`
  - `ChatRequest` / `EmbeddingRequest` / `TranscriptionRequest` / `ImageGenerationRequest` 现在都支持 canonical `providerPresetId`。
  - renderer `AIApi` 的 `translate()` / `summarize()` / `generateMindmap()` 等请求签名也开始接受 `providerPresetId`。
- `packages/ai/ipc-renderer.ts`
  - chat / embed / transcribe / image generation / translate / summarize / mindmap bridge 现在会在发送前统一补齐 preset compat 字段。
- `packages/ai/chat-service.ts`
  - 聊天主链路现在开始优先解析 `providerPresetId`，仅在持久化到历史数据库字段时继续回写到 `providerInstanceId`。
- `packages/ai/runtime/pi/model-resolver.ts`
  - Pi model resolver 已优先使用 `providerPresetId` 解析预设。
- `packages/ai/runtime/pi/execution-service.ts`
  - `chatEphemeral()` / `streamText()` / `embed()` / `transcribe()` / `generateImage()` 内部都开始走 canonical preset 解析。
- `packages/ai/runtime/pi/task-chat.ts`
  - task runtime request 已支持 `providerPresetId`。
- `packages/ai/runtime/pi/tasks/title.ts`
  - 会话标题生成任务已切到 `providerPresetId` 主语义。
- `packages/ai/runtime/pi/tasks/tag.ts`
  - Pi 打标任务已切到 `providerPresetId` 主语义。
- `packages/ai/runtime/pi/image-generation-service.ts`
  - 图片生成请求已支持 `providerPresetId`。
- `packages/ai/ipc-handler-helpers.ts`
  - 翻译 / 总结 / 脑图任务 payload 与任务 runtime 创建逻辑开始优先传递 `providerPresetId`。
- `packages/workflow/nodes/ai-workflow-utils.ts`
  - workflow 内部执行请求已开始补齐 canonical `providerPresetId`，同时继续兼容旧的 `providerInstanceId` 配置键。
- renderer 主要入口开始优先发送 `providerPresetId`：
  - `src/pages/ChatPage/ChatPage.tsx`
  - `src/pages/TaggingPage/TaggingPage.tsx`
  - `src/pages/ResourcePage/components/AIChatSidebar.tsx`
  - `src/pages/ResourcePage/components/tabs/TranslateTab.tsx`
  - `src/pages/ResourcePage/components/tabs/SummaryTab.tsx`
  - `src/pages/ResourcePage/components/tabs/MindmapTab.tsx`
  - `src/pages/ResourcePage/components/Players/SubtitlePlayer/SubtitleTranslator.tsx`
  - `src/pages/ResourcePage/components/Players/SubtitlePlayer/SubtitleListPlayer/AnnotationPopover.tsx`
  - `src/pages/SettingsPage/components/AiSettings.tsx`

### Wave 9 第二批完成标志

- `providerPresetId` 已经不是“只存在于类型里的新名字”，而是开始贯穿 renderer bridge、chat service、Pi runtime、task helper、workflow helper 的内部主链路。
- 当前仍保留的 `providerInstanceId` 主要是为了：
  - IPC/数据库兼容字段
  - workflow 节点配置键历史兼容
  - 少量工具/runtime 文档与剩余调用点的渐进迁移

### Wave 9 第三批已完成

- workflow 节点内部语义继续收口到 preset：
  - `packages/workflow/nodes/ai-chat.ts`
  - `packages/workflow/nodes/image-generate.ts`
  - `packages/workflow/nodes/image-understand.ts`
  - `packages/workflow/nodes/ai-prompt-optimizer.ts`
  - 节点实现内部现在优先读取 `providerPresetId`，并兼容回退到历史 `providerInstanceId` 配置键。
- `packages/ai/types.ts`
  - `AIApi` 中的 `listInstances` / `createInstance` / `updateInstance` / `deleteInstance` / `getInstanceSecrets` / `setInstanceSecrets` 已被明确标注为 compatibility alias，而不是主接口。
- `packages/ai/ipc-renderer.ts`
  - renderer bridge 的 instance API 注释也继续收口，强调 preset API 才是 canonical 调用面。

### Wave 9 第三批完成标志

- workflow 节点的“内部实现命名”已经基本不再依赖 `providerInstanceId`，剩下主要是：
  - 旧 workflow 配置键兼容
  - 数据库 / IPC 历史字段兼容
  - tools/runtime 文档与少量 compat 类型声明

### Wave 9 第四批已完成

- `packages/ai/tools/summary-tool.ts`
  - `SummaryToolRuntimeBinding` 已改成 `providerPresetId` 主语义，`providerInstanceId` 仅作为兼容 alias。
  - 创建总结任务时会通过 `resolveProviderPresetId()` / `withProviderPresetCompat()` 统一补齐 payload。
- `packages/ai/tools/translation-tool.ts`
  - `TranslationToolRuntimeBinding` 已改成 `providerPresetId` 主语义，避免 legacy 工具层继续把 instance 当 canonical 参数。
  - 创建翻译任务时也开始统一走 preset compat helper。
- `packages/ai/tools/README.md`
  - AI 工具依赖说明和示例代码已切到 preset-first 表述，不再把 `providerInstanceId` 当默认示例。

### Wave 9 第四批完成标志

- legacy tools 绑定层已经和 renderer / Pi runtime / workflow helper 的 preset-first 命名对齐。
- `packages/ai/tools` 当前保留的 `providerInstanceId` 主要只剩兼容字段声明，而不是主调用方式。
- 这一层收口后，后续可以继续把 cleanup 重心转向：
  - docs/examples 的零散历史表述
  - 数据库存储字段是否要做真正迁移
  - 少量仍需 dual-field 的 IPC/持久化边界

### Wave 9 第五批已完成

- `packages/ai/types.ts`
  - 抽出了共享的 preset compat 类型：
    - `ProviderPresetFields`
    - `ProviderScopedRequest`
    - `OptionalProviderScopedRequest`
  - `ChatRequest` / `EmbeddingRequest` / `TranscriptionRequest` / `ImageGenerationRequest` 开始复用这组公共类型，减少多处重复声明。
  - 新增统一 payload 类型：
    - `TranslateRequest`
    - `SummarizeRequest`
    - `MindmapRequest`
- `packages/ai/ipc-renderer.ts`
  - transcribe / image generation / embed / translate / summarize / mindmap 的 bridge 签名已开始复用共享 request 类型。
- `packages/ai/ipc-main.ts`
  - transcribe / image generation handler 也开始直接复用共享 request 类型，进一步收口 main/renderer 间的 payload 语义。

### Wave 9 第五批完成标志

- provider preset 的双字段兼容不再只是“多个文件里写着差不多的匿名对象类型”，而是开始收口到共享 request type surface。
- 后续如果继续删除 `providerInstanceId` alias，可以优先从共享类型切入口评估影响，而不是全仓逐个匿名 payload 排查。

### Wave 9 第六批已完成

- `packages/workflow/nodes/ai-workflow-utils.ts`
  - workflow 动态配置的 preset 选择项现在开始使用 canonical 配置键 `providerPresetId`，而不是继续把 `providerInstanceId` 当成新配置主键。
  - `getWorkflowProviderPresetId()` 已抽出，用来统一回读旧工作流里的 `providerInstanceId`。
  - workflow 内部发给 Pi execution service 的 chat / image request 已改成通过 `withProviderPresetCompat()` 统一补齐兼容字段。
  - helper 侧的 provider preset 类型声明也开始复用共享的 AI request 类型，而不是重复定义一组几乎相同的字段。
- 受影响并已对齐的 workflow 节点：
  - `packages/workflow/nodes/ai-chat.ts`
  - `packages/workflow/nodes/ai-prompt-optimizer.ts`
  - `packages/workflow/nodes/image-generate.ts`
  - `packages/workflow/nodes/image-understand.ts`
  - 这些节点现在都通过统一 helper 解析 preset，不再各自手写 `providerPresetId || providerInstanceId` 判断。

### Wave 9 第六批完成标志

- workflow 新保存的 AI 节点配置开始收口到 `providerPresetId`。
- 历史工作流配置仍然可以从 `providerInstanceId` 自动回读并显示，不需要立刻做数据迁移。
- workflow 侧的 legacy 命名已经从“节点实现和 schema 都依赖 instance”收缩到“少量兼容签名与历史配置读取”。

### Wave 9 第七批已完成

- `packages/ai/types.ts`
  - `TranslateRequest` 已补上 `sourceLanguage`，让共享 translate request surface 能覆盖内部后台任务场景，不再额外分裂一层字段定义。
- `packages/ai/chat-service.ts`
  - embed IPC handler 和内部 `embed()` 已改为直接复用 `EmbeddingRequest`。
  - 标题生成 fallback request 也开始通过 `withProviderPresetCompat()` 统一补齐兼容字段。
- `packages/ai/runtime/pi/task-chat.ts`
  - `CreatePiTaskRuntimeRequest` 已开始复用共享 provider scoped 类型。
  - 传给 `resolvePiRequest()` 的 task runtime request 改为统一走 preset compat helper，而不是手动回填 `providerInstanceId`。
- `packages/ai/runtime/pi/image-generation-service.ts`
  - `GeneratePiImageRequest` 已直接复用 `ImageGenerationRequest`。
  - 图片生成 request 在内部解析前也会先统一经过 preset compat helper。
- `packages/ai/ipc-handler-helpers.ts`
  - `TranslatePayload` / `SummarizePayload` / `MindmapPayload` 已开始基于共享 `TranslateRequest` / `SummarizeRequest` / `MindmapRequest` 叠加任务专属字段，减少内部 payload 定义漂移。
- `packages/ai/runtime/pi/execution-service.ts`
  - image generation 和 provider capability resolve 这两条内部链路也改成通过 compat helper 统一构造 request，不再继续手写 `providerInstanceId` 回填。

### Wave 9 第七批完成标志

- Pi 内部 helper 与后台任务 payload 的双字段兼容进一步收口到共享 request surface。
- 当前还保留的 `providerInstanceId`，已经更集中地退回到：
  - 数据库存储历史字段
  - 少量明确标注的 compatibility alias
  - 个别仍需要兼容旧调用面的边界层

### Wave 9 第八批已完成

- `packages/ai/runtime/pi/tasks/title.ts`
  - `GeneratePiConversationTitleOptions` 已改为复用共享 provider scoped 类型。
  - 标题生成 request 现在通过 `withProviderPresetCompat()` 统一补齐兼容字段，不再手写回填 `providerInstanceId`。
- `packages/ai/runtime/pi/tasks/tag.ts`
  - `GeneratePiTagsOptions` 也已切到共享 provider scoped 类型。
  - 打标 request 构造同样改为统一走 compat helper。
- `packages/ai/ipc-handler-helpers.ts`
  - `createPreferredTaskChatRuntime()` 已开始复用共享 provider scoped 类型。
  - translate / summarize / mindmap 三条后台任务链路在进入执行前会先统一标准化 payload，再解析 preset，而不是各自手动解构 legacy alias。
- `packages/workflow/nodes/ai-workflow-utils.ts`
  - workflow provider context 已改成对象式引用签名，兼容字段不再继续在函数参数列表中显式展开。
  - workflow chat / image helper 也统一先走 compat normalization，再做 provider preset 解析。

### Wave 9 第八批完成标志

- task helper / workflow helper 层显式出现 `providerInstanceId` 的位置继续大幅减少。
- `providerInstanceId` 更清晰地退回成“compat input 被 helper 吸收”的角色，而不是业务函数主签名的一部分。

### Wave 9 第九批已完成

- `packages/ai/runtime/pi/image-generation-service.ts`
  - 图片生成内部 request 解析已进一步改成直接基于标准化 request 对象，不再显式解构 `providerInstanceId`。
- `packages/workflow/nodes/ai-workflow-utils.ts`
  - 动态模型配置 helper 已直接对整个 options 对象做 preset 解析，不再单独展开 `providerInstanceId`。
- `packages/ai/chat-service.ts`
  - 会话持久化边界新增 `ensureHistoricalConversationRecord()`，把历史数据库字段 `providerInstanceId` 的写入收口到单一 helper 中，并明确标注这是历史存储字段。

### Wave 9 第九批完成标志

- 在运行时主链路里，`providerInstanceId` 基本已经只剩三类残留：
  - `provider-preset.ts` 里的 compat helper 本身
  - 类型/工具绑定中的显式 compatibility alias
  - 会话历史或 workflow 历史配置等真正的兼容边界
- 这意味着后续如果还要继续推进，就不再是“全仓命名清理”，而更接近“是否对历史存储和历史配置做正式迁移”的决策阶段。

### Wave 9 第十批已完成

- `electron/main/db/repositories.ts`
  - `ChatRepo` 现在开始返回带 `providerPresetId` alias 的 conversation 记录，而不是把历史会话 repo 完全锁死在 `providerInstanceId` 语义上。
  - `ensureConversation()` 也已支持直接接受 `providerPresetId`，内部再映射到历史列名 `provider_instance_id`。
- `packages/ai/chat-service.ts`
  - 会话持久化边界已经开始直接传 `providerPresetId` 给 `ChatRepo`，不再在 service 层手写 legacy 列字段。
- `packages/ai/types.ts`
  - 新增 `ConversationRecord`，把 conversation surface 的 preset alias 明确成正式类型，而不是继续用 `any`。
- `packages/ai/ipc-renderer.ts`
  - `listConversations()` / `renameConversation()` 返回值已开始复用 `ConversationRecord`。
- `electron/main/db/schema.ts`
  - 对 `provider_instance_id` 列补上了明确注释，说明它是历史列名，而不是新的运行时主语义。

### Wave 9 第十批完成标志

- 会话历史的“repo / IPC / renderer surface”已经开始对外暴露 `providerPresetId` alias。
- 现在真正仍然固定在 `providerInstanceId` 上的，已经主要只剩：
  - schema 里的历史列名本身
  - `provider-preset.ts` compat helper
  - workflow 旧配置读取
  - 少量显式 compatibility alias 类型声明
- 后续如果继续推进，重点将从“运行时 cleanup”切换为“是否做历史数据正式迁移”的单独议题。

### Wave 9 第十一批已完成

- `electron/main/db/schema.ts`
  - `conversations` 表字段已正式从 `providerInstanceId` / `provider_instance_id` 切到 `providerPresetId` / `provider_preset_id`。
- `drizzle/0009_young_chameleon.sql`
  - 新增数据库迁移，直接执行：
    - `ALTER TABLE conversations RENAME COLUMN provider_instance_id TO provider_preset_id;`
- `drizzle/meta/_journal.json`
  - 已登记新的 `0009_young_chameleon` 迁移。
- `drizzle/meta/0009_snapshot.json`
  - schema snapshot 已更新到新的 conversation 列名。
- `electron/main/db/repositories.ts`
  - `ChatRepo.ensureConversation()` / `listConversations()` / `renameConversation()` / `restoreConversation()` 等已直接使用 `providerPresetId`。
  - 会话 repo 不再需要为 DB 字段额外构造 `providerPresetId` alias。
- `packages/ai/chat-service.ts`
  - 会话持久化边界已直接向 repo 写入 `providerPresetId`。
- `packages/ai/types.ts`
  - `ConversationRecord` 不再保留会话层的 `providerInstanceId` 历史字段。

### Wave 9 第十一批完成标志

- 会话历史数据库链路已经正式完成 preset 命名迁移。
- `providerInstanceId` 在当前代码库中已不再承担数据库会话字段职责，主要只剩：
  - 通用 compat helper
  - workflow 旧配置读取
  - 少量工具/类型显式兼容声明
- 这一步完成后，数据库层面的 preset-first 命名已经和运行时主链路保持一致。

### Wave 9 第十二批已完成

- `packages/ai/provider-preset.ts`
  - `providerInstanceId` 兼容字段已从主 helper 中删除。
  - `withProviderPresetCompat()` 已收口为纯 canonical helper `normalizeProviderPreset()`。
- `packages/ai/types.ts`
  - `ProviderPresetFields` 不再保留 `providerInstanceId` alias。
- `packages/ai/tools/translation-tool.ts`
  - `TranslationToolRuntimeBinding` 已移除 `providerInstanceId` 显式兼容字段。
- `packages/ai/tools/summary-tool.ts`
  - `SummaryToolRuntimeBinding` 已移除 `providerInstanceId` 显式兼容字段。
- `packages/workflow/nodes/ai-workflow-utils.ts`
  - workflow helper 不再回读旧的 `config.providerInstanceId`，新工作流与当前运行时都只认 `providerPresetId`。
- `packages/ai/chat-service.ts`
- `packages/ai/runtime/pi/execution-service.ts`
- `packages/ai/runtime/pi/task-chat.ts`
- `packages/ai/ipc-main.ts`
- `packages/ai/ipc-renderer.ts`
- `packages/ai/ipc-handler-helpers.ts`
  - 以上主链路已经统一切到 `normalizeProviderPreset()`，不再保留双字段补齐逻辑。

### Wave 9 第十二批完成标志

- 主代码里的 `providerInstanceId` 已全部清除。
- workflow / tool / task / IPC / chat runtime 的 preset 解析已经完全收口到 canonical `providerPresetId`。
- `pi-runtime-refactor-plan.md` 中原本标记的“Wave 9 清理收尾项”已经完成。

### 当前计划状态

- 如果按这份实施蓝图的目标看：Wave 1 到 Wave 9 的迁移与命名清理已经完成。
- 当前仓库已经处于：
  - Pi-first runtime 稳定主路径
  - preset-first 命名稳定主路径
  - Mastra 已退出生产路径
- 后续再做的事情，将属于新的增量优化，而不是这份 refactor plan 的未完事项。

### Wave 9 建议方向

- 继续补齐更多 provider 的非聊天能力真接线，例如更多 image provider / realtime / speech 能力。
- 继续压缩 renderer 里的分散 AI 入口，把更多页面直接接到统一 execution service，而不是各自保留轻量包装层。
- 如需进一步产品层收口，可继续评估何时删除 UI / IPC 里的 `instanceId` alias 壳；这已经超出本次 Pi runtime 重构主线。

## 风险点

- Pi 包版本升级较快，接线前要确认 0.57.1 的实际 API。
- `pi-tui` 不应直接替代 Electron 聊天 UI。
- 如果 Pi 对某些 provider 的 vision / embedding / transcribe 覆盖不完整，需要保留兼容层。
- 工作流节点和后台任务不应该都强塞进 `pi-coding-agent`。

## 推荐推进方式

- 主线使用双栈迁移，不做 Big Bang。
- 每一波结束都保留：
  - 可运行路径
  - 文档更新
  - 清晰的删除边界
