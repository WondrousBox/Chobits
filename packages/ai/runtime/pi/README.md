# Pi Runtime

这个目录是 Chobits 切换到 Pi 生态的运行时落地区。

当前目标分两段：

1. 先让主聊天链路在 `extras.runtime = "pi"` 下真实可用。
2. 再把工具调用、后台任务、one-shot 工作流逐步迁到 Pi 全家桶。

目前已经完成的是 Wave 1 + Wave 2 前两批的主体接线：

- `packages/ai/runtime/pi/session-service.ts`
  - 已经接入：
    - `@mariozechner/pi-ai` 的 one-shot 执行
    - `@mariozechner/pi-ai` 的 fallback 流式执行
    - `@mariozechner/pi-coding-agent` 的 session 流式执行
- `packages/ai/chat-service.ts`
  - Pi 分支已经重新接回会话持久化、conversationId 元数据、自动标题生成和中断控制。
- `packages/ai/runtime/pi/session-factory.ts`
  - 已经开始负责创建内存态的 `pi-coding-agent` session。
- `packages/ai/runtime/pi/model-resolver.ts`
  - 已经处理 provider alias、实例密钥、默认模型与默认 baseUrl 的解析。

Wave 3 第一批也已经落地：

- `packages/ai/runtime/pi/tool-context.ts`
  - 提供 session-scoped 的工具执行上下文，替代全局单例透传。
- `packages/ai/runtime/pi/tools/resource-query.ts`
  - `resourceQueryTool` 已切到 Pi custom tool。
- `packages/ai/runtime/pi/tools/read-subtitle.ts`
  - `readSubtitleTool` 已切到 Pi custom tool。
- `packages/ai/runtime/pi/tools/push-card.ts`
  - `pushCardTool` 已切到 Pi custom tool，并可复用当前 conversationId。
- `packages/ai/runtime/pi/tools/index.ts`
  - 根据 `enabledTools` 装配当前 session 可用的 Pi custom tools。

Wave 3 第二批也已经落地：

- `packages/ai/runtime/pi/task-chat.ts`
  - 提供基于 `pi-ai` 的后台任务 `chatFn` 适配层。
- `packages/ai/runtime/pi/tools/translation.ts`
  - `translationTool` 已切到 Pi custom tool。
- `packages/ai/runtime/pi/tools/summary.ts`
  - `summaryTool` 已切到 Pi custom tool。
- `packages/ai/ipc-handler-helpers.ts`
  - `executeSubtitleTranslation()` / `executeSummarize()` 现在支持注入 `chatFn`，Pi 工具可以直接复用原有资源保存和事件回传逻辑。

Wave 3 第三批也已经落地：

- `packages/ai/runtime/pi/tools/youtube-download.ts`
  - `youtubeDownloadTool` 已切到 Pi custom tool。
- `packages/ai/runtime/pi/tools/youtube-subscribe.ts`
  - `youtubeSubscribeTool` 已切到 Pi custom tool。
- `packages/ai/runtime/legacy/task-chat.ts`
  - legacy Mastra task runtime 已被隔离到单独目录，`ipc-handler-helpers.ts` 不再直接组装 agent/model/chatFn。

Wave 4 第一批也已经落地：

- `packages/ai/runtime/pi/execution-service.ts`
  - 统一的 Pi one-shot 执行入口，供标题生成、标签抽取等任务复用。
- `packages/ai/runtime/pi/tasks/title.ts`
  - 会话标题生成已切到 Pi execution runtime。
- `packages/ai/runtime/pi/tasks/tag.ts`
  - 文本标签抽取已切到 Pi execution runtime。
- `packages/ai/chat-service.ts`
  - 自动标题生成现在优先走 Pi one-shot。
- `packages/ai/services/tagging-service.ts`
  - `autoTagText()` 现在优先走 Pi one-shot。

Wave 4 第二批也已经落地：

- `packages/ai/runtime/pi/task-chat.ts`
  - 已支持从 direct task request 构建 Pi task runtime。
- `packages/ai/ipc-handler-helpers.ts`
  - `translate / summarize / mindmap` 现在默认优先走 Pi task runtime。
  - 初始化失败时才回退到 legacy task runtime。
- `packages/ai/services/mindmap-service.ts`
  - 已支持外部中止信号桥接，方便 direct IPC / future Pi tool 共用。

Wave 4 第三批也已经落地：

- `packages/ai/runtime/pi/execution-service.ts`
  - 已补上 `streamText()`，供 workflow 文本节点复用 Pi 流式文本执行。
- `packages/ai/chat-service.ts`
  - 自动标题生成的 legacy fallback 已收紧到“仅在 Pi runtime 不可用时才启用”。
- `packages/ai/services/tagging-service.ts`
  - `autoTagText()` 的 legacy tagger fallback 已收紧到“仅在 Pi runtime 不可用时才启用”。

Wave 5 第一批也已经落地：

- `packages/workflow/nodes/ai-workflow-utils.ts`
  - 新增 workflow 侧共享 AI 执行 helper，统一 provider/model 列表、秘钥校验、Pi-first 文本执行。
- `packages/workflow/nodes/ai-chat.ts`
  - 工作流文本对话节点已改为优先走 `PiExecutionService`。
- `packages/workflow/nodes/ai-prompt-optimizer.ts`
  - 提示词优化节点已改为优先走 `PiExecutionService`。
- 这两个节点仅在 Pi runtime 不可用时，才会回退到 legacy `provider.chat()`。

Wave 5 第二批也已经落地：

- `packages/ai/runtime/pi/session-service.ts`
  - 已补上 workflow one-shot 所需的多模态 user message 映射，支持：
    - `text`
    - `image`
    - `image_url` data URL 兼容
- `packages/workflow/nodes/image-understand.ts`
  - 图片理解节点已改为优先走 `PiExecutionService`。
- `packages/workflow/nodes/ai-workflow-utils.ts`
  - 已补上 multimodal request helper，供 workflow 图像节点复用。
- `packages/workflow/nodes/image-generate.ts`
  - 已收敛到相同的 provider/model/secrets helper，但生成执行仍暂时保留 OpenAI SDK 路径。

Wave 5 第三批也已经落地：

- `packages/ai/runtime/pi/tasks/title.ts`
  - `PiExecutionService` 已改成 lazy getter，避免 bundle 初始化顺序问题。
- `packages/ai/runtime/pi/tasks/tag.ts`
  - `PiExecutionService` 已改成 lazy getter，避免 bundle 初始化顺序问题。
- `packages/ai/runtime/pi/index.ts`
  - 不再从 barrel export `tasks/title`、`tasks/tag`，减少启动期循环依赖。
- `packages/ai/runtime/pi/image-generation-service.ts`
  - 新增 workflow image generation execution adapter。
- `packages/workflow/nodes/image-generate.ts`
  - 图片生成节点已改为调用 `PiImageGenerationService`，不再在节点里直接组装 OpenAI client。

Wave 5 第四批也已经落地：

- `packages/ai/runtime/pi/image-generation-service.ts`
  - 已支持从 request 直接解析 provider / instance / secrets，用作共享图片生成入口。
- `packages/ai/ipc-main.ts`
  - 新增 `ai:generateImage` IPC。
- `packages/ai/ipc-renderer.ts`
  - 新增 `generateImage()` bridge。
- `packages/ai/ipc-handler-helpers.ts`
  - background task 的 Pi/legacy 切换已收紧到 availability-first：
    - Pi runtime unavailable 才回退 legacy
    - Pi runtime available 时初始化失败不再静默回退

Wave 5 第五批也已经落地：

- `packages/workflow/nodes/ai-workflow-utils.ts`
  - workflow text / multimodal 执行 helper 现在只要求节点传入 request 信息。
  - provider / secrets / instance secrets 的解析已下沉到 legacy fallback 内部。
  - Pi 路径缺少配置时，会补发 `ai:missing-provider` 事件，保留原来的配置引导。
- `packages/workflow/nodes/ai-chat.ts`
  - 节点不再自己预读 provider secrets。
- `packages/workflow/nodes/ai-prompt-optimizer.ts`
  - 节点不再自己预读 provider secrets。
- `packages/workflow/nodes/image-understand.ts`
  - 节点不再自己预读 provider secrets。
- `packages/workflow/nodes/image-generate.ts`
  - 图片生成节点已切到 `generateImageUrlFromRequest()`，复用 image runtime 的 request resolver。
- `packages/ai/runtime/legacy/task-chat.ts`
  - legacy task fallback 现在也会继承 `providerInstanceId` 的 provider/model/secrets 解析。

Wave 5 第六批也已经落地：

- `packages/workflow/nodes/ai-workflow-utils.ts`
  - workflow 动态配置已补上 `providerInstanceId` 选择项。
  - 选择实例预设后，模型下拉会优先继承该实例的 provider/model 语义。
- `packages/workflow/nodes/ai-chat.ts`
  - 节点现在支持选择 provider instance。
- `packages/workflow/nodes/ai-prompt-optimizer.ts`
  - 节点现在支持选择 provider instance。
- `packages/workflow/nodes/image-understand.ts`
  - 节点现在支持选择 provider instance。
- `packages/workflow/nodes/image-generate.ts`
  - 节点现在支持选择 provider instance。

Wave 5 第七批也已经落地：

- `packages/ai/ipc-handler-helpers.ts`
  - `translate / summarize / mindmap` 的后台任务 runtime 已切成纯 Pi 路径。
  - Pi runtime unavailable 时会直接报错，不再回退 legacy task runtime。
- `packages/ai/runtime/legacy/task-chat.ts`
  - 已从代码路径中移除。

Wave 5 第八批也已经落地：

- `packages/ai/chat-service.ts`
  - 主聊天 `chatStream()` 现在会强制收口到 Pi session runtime。
  - 旧的 Mastra 流式分支已退出主聊天路径。
  - legacy `pushCardToolContext`、`translationToolContext`、`summaryToolContext` 已不再参与主聊天 streaming。

Wave 6 第一批也已经落地：

- `packages/ai/registry.ts`
  - 已从 Mastra agent 注册表改成 provider/profile catalog。
  - agent 列表现在直接来自 Pi profile registry，而不是 Mastra `Agent` 实例。
- `packages/ai/ipc-main.ts`
  - 不再注册 Mastra agent 实例给 UI 使用。
- `packages/ai/services/tagging-service.ts`
  - legacy tagger fallback 已开始脱离 registry 层，转向更直接的 legacy fallback 入口。

Wave 6 第二批也已经落地：

- `packages/ai/models/index.ts`
  - 已明确降级为仅供 legacy Mastra fallback 使用的 shim。
  - legacy model lookup 已统一走 canonical provider id。
- `packages/ai/registry.ts`
  - `getProvider()` lookup 已支持 provider alias 归一化。

Wave 6 第三批也已经落地：

- `packages/ai/settings-store.ts`
  - provider secrets / API key 存储已统一收口到 canonical provider id。
  - 历史 alias key 仍然可读，但新写入会自动归并到 canonical key。
- `packages/ai/instances-store.ts`
  - provider instance 的 `providerId` 已在 create / update / read / list 路径统一 canonical 化。
- `packages/ai/ipc-main.ts`
  - `ai:getProviders` 现在会把 provider aliases 一并暴露给 renderer。
- `src/lib/ai-provider-identity.ts`
  - 新增 renderer 侧 provider alias 匹配 helper。
- `src/components/common/ProviderModelSelect.tsx`
  - provider/model 选择器已兼容历史 alias provider id。
- `src/pages/SettingsPage/components/AiSettings.tsx`
  - 设置页初始 provider 选择已兼容历史 alias 值。
- `src/pages/AiProviderConfigWindow/AiProviderConfigWindow.tsx`
  - provider 配置窗口已兼容 alias payload，并统一回 canonical provider id。

Wave 6 第四批也已经落地：

- `packages/ai/runtime/pi/session-service.ts`
  - `chat()` 现在也支持非流式的 `pi-coding-agent` session 路径。
  - 工具启用时，如果 coding session 不可用，将直接报错而不是偷偷降级成 plain text。
- `packages/ai/chat-service.ts`
  - `chat()` / `chatEphemeral()` 已切成 Pi-first。
  - legacy Mastra 非流式逻辑已经被收缩到显式 fallback 分支。
- `src/pages/SettingsPage/components/AiSettings.tsx`
  - provider quick test 已显式使用最小 `chat` profile，避免误测整套 assistant tools session。

Wave 6 第五批也已经落地：

- `packages/ai/chat-service-ai-mastra.ts`
  - 已正式承接 legacy 非流式 chat / chatEphemeral fallback 的执行逻辑。
  - instance merge、provider fallback、conversation persistence 已统一收口到这个模块。
- `packages/ai/chat-service.ts`
  - 已不再静态 import `@mastra/core/agent`、`agents/index.ts`、`models/index.ts`。
  - legacy 非流式 fallback 现在改为按需动态加载 `chat-service-ai-mastra.ts`。

Wave 6 第六批也已经落地：

- `packages/ai/runtime/pi/profile-descriptors.ts`
  - 新增 Pi profile 纯描述层，统一承接：
    - instructions
    - defaultToolIds
    - executionMode
    - supportsToolCalls
- `packages/ai/legacy/tool-factory.ts`
  - 新增 request-scoped legacy tool factory。
  - legacy 非流式 fallback 现在可以把：
    - `conversationId`
    - `targetWindowId`
    - `providerId`
    - `providerInstanceId`
    - `model`
      显式绑定到当前请求的 tools。
- `packages/ai/legacy/mastra-agent-factory.ts`
  - 新增基于 descriptor + request-scoped tools 的 legacy agent factory。
- `packages/ai/chat-service-ai-mastra.ts`
  - 已不再直接依赖 `packages/ai/agents/index.ts`。
  - legacy 非流式 fallback 现在直接基于 descriptor/factory 组装 agent。
- `packages/ai/services/tagging-service.ts`
  - legacy tagger fallback 已改为直接走 `legacy/mastra-agent-factory.ts`。
- `packages/ai/runtime/pi/profile-registry.ts`
  - Pi profile instructions/default tools 已统一改为消费 profile descriptor。
- `packages/ai/tools/translation-tool.ts`
  - legacy translation tool 已支持显式 runtime binding。
- `packages/ai/tools/summary-tool.ts`
  - legacy summary tool 已支持显式 runtime binding。
- `packages/ai/agents/index.ts`
  - 已退化为 descriptor/factory 之上的兼容层，方便后续整体删除。

Wave 6 第七批也已经落地：

- `packages/ai/tools/translation-tool.ts`
  - 已完全改成显式 runtime binding，不再读取 singleton 上下文。
- `packages/ai/tools/summary-tool.ts`
  - 已完全改成显式 runtime binding，不再读取 singleton 上下文。
- `packages/ai/tools/push-card-tool.ts`
  - 已完全改成显式 request binding，只依赖创建时传入的会话/窗口信息。
- `packages/ai/tools/index.ts`
  - 已取消 `translationTool` / `summaryTool` / `pushCardTool` 的默认无绑定导出。
  - `getAITools()` / `getAllTools()` 已改成 bindings-driven factory API。
- `packages/ai/tools/push-card-tool-context.ts`
  - 已删除。
- `packages/ai/tools/translation-tool-context.ts`
  - 已删除。
- `packages/ai/tools/summary-tool-context.ts`
  - 已删除。
- `packages/ai/examples/resource-query-handler.ts`
  - 示例已不再直接依赖 `packages/ai/agents/index.ts`。

Wave 6 第八批也已经落地：

- `packages/ai/providers/metadata.ts`
  - built-in provider 的默认 metadata 已集中收口：
    - `label`
    - `defaultModel`
    - `providerBaseUrl`
    - `piBaseUrl`
- `packages/ai/providers/catalog.ts`
  - built-in provider 的 factory/catalog 已抽出。
- `packages/ai/ipc-main.ts`
  - built-in provider bootstrapping 已改成 `registerBuiltInProviders()`。
  - 主入口不再直接 import 每一个 provider class。
- `packages/ai/models/index.ts`
  - legacy model shim 已开始复用 provider metadata 默认值。
- `packages/ai/runtime/pi/session-service.ts`
  - Pi fallback 的默认 model/baseUrl 已开始复用 provider metadata。
- `packages/ai/agents/index.ts`
  - 已进一步压成动态 compat shell，不再 eager 构建 legacy agent 单例。

Wave 6 第九批也已经落地：

- `packages/ai/providers/openai-runtime.ts`
  - OpenAI/OpenAI-compatible 共享 runtime helper 已抽出：
    - chat
    - embeddings
    - model listing
- `packages/ai/providers/openai-compatible.ts`
  - 已改成复用共享 OpenAI runtime helper。
- `packages/ai/providers/openai.ts`
  - 已改成复用共享 OpenAI runtime helper。
  - 默认 label/model/baseUrl 也开始统一复用 provider metadata。
- `packages/ai/agents/index.ts`
  - 已从代码库删除。

Wave 6 第十批也已经落地：

- `packages/ai/providers/provider-runtime-utils.ts`
  - provider runtime 共用 helper 已抽出，统一 assistant message / streaming completion / model fallback。
- `packages/ai/providers/anthropic-runtime.ts`
  - Anthropic chat / model listing helper 已抽出。
  - `system` message 已开始映射回 Anthropic 原生请求结构。
- `packages/ai/providers/gemini-runtime.ts`
  - Gemini chat / model listing helper 已抽出。
  - `system` / `assistant` message 已开始映射到 Gemini `systemInstruction` / `model` role。
- `packages/ai/providers/ollama-runtime.ts`
  - Ollama chat / embeddings / model listing helper 已抽出。
  - 流式 NDJSON 解析已改成带缓冲的逐行读取。
- `packages/ai/providers/anthropic.ts`
  - 已改成 metadata + thin adapter 风格，并支持 `extras.secrets` override。
- `packages/ai/providers/gemini.ts`
  - 已改成 metadata + thin adapter 风格，并支持 `extras.secrets` override。
- `packages/ai/providers/ollama.ts`
  - 已改成 metadata + thin adapter 风格，并支持 `extras.secrets` override。

Wave 6 第十一批也已经落地：

- `packages/ai/legacy/nonstreaming-chat-executor.ts`
  - legacy 非流式 chat 的共享 executor 已抽出。
  - provider 全局 secrets、instance config、instance secrets、request override 现在会在一处统一合并。
- `packages/ai/chat-service-ai-mastra.ts`
  - 已瘦身成围绕 executor 的薄包装。
  - legacy non-streaming path 现在会正确消费 `providerInstanceId` 对应的 secrets / baseUrl / model override。

Wave 6 第十二批也已经落地：

- `packages/ai/services/tagging-service.ts`
  - legacy tagging fallback 已不再直接调用 `createLegacyMastraAgent()`。
  - 现在统一通过 `ChatService.chatEphemeral()` 进入 Pi-first / legacy fallback 调度层。
- `packages/ai/examples/resource-query-handler.ts`
  - 示例已移除 `@mastra/core/agent` / `new Agent(...)` / `createLegacyMastraAgent(...)` / `createModel(...)`。
  - ChatService 现在承担：
    - 带工具的 smart resource query
    - 查询参数解析
    - 查询结果总结
- `packages/ai/legacy/*`
  - 生产代码里的 Mastra `Agent` 引用已基本只剩隔离 helper 层。

Wave 6 第十三批也已经落地：

- `packages/ai/legacy/nonstreaming-chat-service.ts`
  - legacy 非流式 chat / chatEphemeral 的 persistence 包装已迁入 `legacy` 目录。
- `packages/ai/chat-service.ts`
  - legacy 非流式 fallback 现在直接动态加载 `legacy/nonstreaming-chat-service.ts`。
- `packages/ai/chat-service-ai-mastra.ts`
  - 已退化成 compat re-export，不再承载真实执行逻辑。

Wave 7 第一批也已经落地：

- `packages/ai/tools/tool-definition.ts`
  - legacy tool 文件已切到本地轻量 tool definition helper。
- `packages/ai/tools/*.ts`
  - legacy tool 文件已不再依赖 `@mastra/core` / `@mastra/core/tools`。
- `packages/ai/chat-service-ai-mastra.ts`
  - 已从代码库删除。
  - 旧角色已由 `legacy/nonstreaming-chat-service.ts` 接替。

Wave 7 第二批也已经落地：

- `packages/ai/chat-service.ts`
  - `chat()` / `chatEphemeral()` 已彻底切到 Pi-only 非流式入口。
  - 主聊天服务不再动态加载 legacy 非流式 fallback。
- `packages/ai/legacy/nonstreaming-chat-service.ts`
- `packages/ai/legacy/nonstreaming-chat-executor.ts`
- `packages/ai/legacy/mastra-agent-factory.ts`
- `packages/ai/legacy/tool-factory.ts`
- `packages/ai/models/index.ts`
  - 上述 legacy Mastra / ai-sdk fallback 文件已从代码库删除。
- `package.json`
  - 已移除：
    - `@mastra/core`
    - `@ai-sdk/openai`
    - `@ai-sdk/anthropic`
    - `@ai-sdk/google`
    - `ai`

Wave 7 第三批也已经落地：

- `packages/ai/runtime/pi/execution-service.ts`
  - `PiExecutionService` 现在统一承接：
    - `embed()`
    - `transcribe()`
    - `generateImage()`
- `packages/ai/chat-service.ts`
  - `ai:embed` 现在统一走 `PiExecutionService`。
- `packages/ai/ipc-main.ts`
  - `ai:transcribe` / `ai:generateImage` 现在统一走 `PiExecutionService`。
- `packages/workflow/nodes/ai-workflow-utils.ts`
  - 新增 workflow image generation execution helper。
- `packages/workflow/nodes/image-generate.ts`
  - 图片生成节点已改为通过 `PiExecutionService.generateImage()` 执行。
- `packages/ai/providers/zhipu.ts`
  - `transcribe()` 已开始支持 request-scoped secrets/baseUrl override。

Wave 7 第四批也已经落地：

- `packages/ai/instances-store.ts`
  - provider preset 存储已经成为主语义，并兼容读取历史 instance 存档。
- `packages/ai/ipc-main.ts` / `packages/ai/ipc-renderer.ts`
  - preset CRUD 与 preset secrets bridge 已补齐。
  - legacy instance IPC 退化为兼容 alias。
- `src/pages/SettingsPage/components/AiSettings.tsx`
  - 设置页已经切到真正的 preset CRUD / secrets / quick test 流程。
- `src/pages/ChatPage/hooks/useProvidersInstances.ts`
  - 共享 provider/preset hook 已稳定，`instancesMap` 只保留兼容映射。
- `src/pages/ChatPage/context/ChatSelectionContext.tsx`
  - 聊天选择现在优先持久化 `presetId`，同时兼容旧 `instanceId`。
- `src/pages/ChatPage/components/ServiceInstanceSelect.tsx`
  - 聊天选择器的用户文案已统一为 “预设”。
- `src/pages/ResourcePage/components/AIChatSidebar.tsx`
  - 资源页侧边聊天已经改走 `listPresets()`，不再依赖错误的 `getProviderInstances()`。
- `src/pages/TaggingPage/TaggingPage.tsx`
  - 打标页入口文案已与 preset 语义对齐。

下面这些模块仍然保留了 Wave 1 打下的边界：

- `contracts.ts`
  - 定义 Pi 迁移期间的内部类型。
- `provider-alias.ts`
  - 统一 provider id，先解决 `gemini` / `google` 这类历史不一致。
- `runtime-switch.ts`
  - 定义运行时切换约定。当前约定是 `req.extras.runtime = "pi"` 或 `"pi-preview"`。
- `profile-registry.ts`
  - Pi profile 注册表，当前先复用 legacy agent 的 instructions。
- `tool-registry.ts`
  - Pi tool 元数据注册表，先把工具 id 和迁移状态固定下来。
- `model-resolver.ts`
  - 解析 provider / instance / secrets / model / system prompt，后续所有 Pi session 都走这层。
- `stream-adapter.ts`
  - 把未来 Pi 事件适配成当前前端已经使用的 `StreamEvent` 协议。
- `session-factory.ts`
  - 负责创建 `pi-coding-agent` session，并注册当前已经迁好的 Pi custom tools。
- `session-service.ts`
  - Pi 运行时入口。当前已经可执行 `pi-ai` 文本对话，并优先走 `pi-coding-agent` session。
- `tool-context.ts`
  - Session-scoped 的工具依赖与会话上下文。
- `tools/`
  - Pi custom tool 的第一批实现。

## 当前状态

- 当前仓库已经可以在安装好 Pi 包之后运行 Pi 文本对话。
- 主聊天 streaming 与 non-streaming 现在都已经在 `chat-service.ts` 内统一走 Pi runtime。
- 生产代码与项目依赖里已经不再保留 Mastra / ai-sdk 聊天运行时。
- 非流式 `chat()` / `chatEphemeral()` 现在也已经默认优先走 Pi runtime。
- embeddings / transcribe / image generation 现在也已经开始收口到统一 `PiExecutionService`。
- 设置页、聊天页与资源页的 provider preset 语义现在已经统一，legacy instance 只保留兼容别名。
- one-shot 任务、Pi-first 背景任务和 workflow 文本节点已经可以在内部直接走 Pi execution/runtime，无需额外显式传 runtime。
- provider identity / settings persistence 现在已经统一使用 canonical provider id，不再依赖 `google/gemini`、`zhipu/zhipuai` 这类历史别名碰运气。
- 该分支现在已经支持：
  - 基于 `pi-coding-agent` 的主聊天流式 session
  - Pi custom tools：
    - `resourceQueryTool`
    - `readSubtitleTool`
    - `pushCardTool`
    - `translationTool`
    - `summaryTool`
    - `youtubeDownloadTool`
    - `youtubeSubscribeTool`
  - Pi one-shot execution：
    - conversation title generation
    - auto tagging
  - Pi-first background tasks：
    - subtitle translation
    - summarize
    - mindmap
    - 且不再依赖 legacy task-chat fallback
  - Pi-first workflow text nodes：
    - `ai-chat`
    - `ai-prompt-optimizer`
  - Pi-first workflow vision nodes：
    - `image-understand`
    - `image-generate`（已统一到 image runtime request resolver）
  - 当前 conversation 的持久化
  - `conversationId` 元数据回传
  - 中断控制
- 该分支当前还不支持：
  - `pi-agent-core` orchestration
  - `pi-tui` 调试链路
  - image generation adapter 扩展到 renderer 侧实际消费场景
  - `providers/*.ts` 的最后一段“provider as executor”退役
  - 剩余 legacy Mastra fallback 的最终删除

## Wave 2 起点

Wave 2 目前已经完成：

1. `@mariozechner/pi-ai` 的 one-shot 与 fallback text streaming。
2. `@mariozechner/pi-coding-agent` 的内存态 session streaming。
3. Wave 3 第一批的 Pi custom tools 接线：
   - `resourceQueryTool`
   - `readSubtitleTool`
   - `pushCardTool`
4. Wave 3 第二批的 Pi custom tools 接线：
   - `translationTool`
   - `summaryTool`
   - 背后 AI 调用已通过 `pi-ai` 注入到现有后台任务链路
5. Wave 3 第三批的 Pi custom tools 接线：
   - `youtubeDownloadTool`
   - `youtubeSubscribeTool`
   - legacy task-chat 已被下沉到 `runtime/legacy/task-chat.ts`
6. Wave 4 第一批的 Pi one-shot 接线：
   - `execution-service.ts`
   - `tasks/title.ts`
   - `tasks/tag.ts`
   - 自动标题与 autoTagText 已优先走 Pi
7. Wave 4 第二批的 Pi-first 背景任务接线：
   - `task-chat.ts` direct task helper
   - `translate`
   - `summarize`
   - `mindmap`
   - direct IPC 默认优先走 Pi task runtime
8. Wave 4 第三批的 legacy fallback 收紧：
   - conversation title generation
   - auto tagging
   - 仅在 Pi runtime 不可用时才回退 legacy
9. Wave 5 第一批的 workflow 文本节点接线：
   - `ai-chat`
   - `ai-prompt-optimizer`
   - workflow 共享 helper `ai-workflow-utils.ts`
10. Wave 5 第二批的 workflow 图像理解接线：

- `session-service.ts` 多模态 user message 映射
- `image-understand`
- `image-generate` 外围 helper 收敛

11. Wave 5 第三批的 runtime 稳定化与 image adapter：

- `PiExecutionService` lazy getter 化
- `runtime/pi/index.ts` barrel 收缩
- `image-generation-service.ts`
- `image-generate`

12. Wave 5 第四批的共享入口与 fallback 收缩：

- `ai:generateImage`
- `generateImage()` bridge
- background task availability-first fallback

13. Wave 5 第五批的 workflow helper 收敛：

- workflow 节点不再预读 provider secrets
- legacy provider/secrets 解析下沉到 fallback 内部
- `image-generate` 复用 image runtime request resolver

14. Wave 5 第六批的 workflow instance 配置闭环：

- workflow 动态配置补上 `providerInstanceId`
- 执行请求真正带上 `providerInstanceId`
- workflow 节点终于能完整复用 Pi model resolver 的 instance 语义

15. Wave 5 第七批的后台任务纯 Pi 化：

- `translate / summarize / mindmap` 移除 legacy task fallback
- `runtime/legacy/task-chat.ts` 从代码路径删除

16. Wave 5 第八批的主聊天链路 legacy 清理：

- `chatStream()` 强制收口 Pi session runtime
- 主聊天流式链路移除 legacy `*-tool-context`
- 旧 Mastra streaming 分支退出主聊天路径

17. Wave 6 第一批的 registry/profile 解耦：

- `registry.ts` 从 Mastra agent 实例注册表切到 provider/profile catalog
- UI agent 列表切到 Pi profile metadata
- registry 层不再承担 legacy agent 实例分发

18. Wave 6 第二批的 legacy model shim 收口：

- `models/index.ts` 明确降级为 legacy shim
- provider alias 在 legacy model path 和 registry lookup 中统一

19. Wave 6 第三批的 provider identity 语义统一：

- provider secrets / API key 写入收口到 canonical provider id
- provider instance 的 `providerId` 持久化统一 canonical 化
- renderer 设置入口兼容历史 alias provider id

20. Wave 6 第四批的非流式聊天 Pi-first：

- `PiSessionService.chat()` 补齐 non-streaming coding session 路径
- `chat()` / `chatEphemeral()` 切成 Pi-first
- legacy 非流式 Mastra 路径下沉成显式 fallback

21. Wave 6 第五批的主聊天服务瘦身：

- `chat-service.ts` 移除静态 Mastra import
- legacy 非流式 fallback 改为按需动态加载 `chat-service-ai-mastra.ts`
- 主聊天服务文件进一步收缩为 Pi-first 调度层

22. Wave 6 第六批的 legacy fallback 再收口：

- 新增 `runtime/pi/profile-descriptors.ts` / `legacy/tool-factory.ts` / `legacy/mastra-agent-factory.ts`
- `chat-service-ai-mastra.ts` 与 `tagging-service.ts` 不再直接依赖 `agents/index.ts`
- legacy `translationTool` / `summaryTool` 已支持 request-scoped runtime binding

23. Wave 6 第七批的 legacy tool-context 删除：

- `translationTool` / `summaryTool` / `pushCardTool` 全部切成显式 binding
- `packages/ai/tools/*-tool-context.ts` 已从代码库删除
- `tools/index.ts` 改成 factory 风格，不再导出默认无绑定工具

24. Wave 6 第八批的 provider metadata/catalog 收口：

- 新增 `providers/metadata.ts` / `providers/catalog.ts`
- `ipc-main.ts` 不再直接 import 每个 built-in provider class
- `models/index.ts` 与 `session-service.ts` 开始共享 provider 默认 metadata

25. Wave 6 第九批的 provider runtime 继续收口：

- 新增 `providers/openai-runtime.ts`
- `openai.ts` / `openai-compatible.ts` 共享 legacy OpenAI SDK 执行 helper
- `agents/index.ts` 已从代码库删除

26. Wave 6 第十批的剩余 provider 执行层继续收口：

- 新增 `providers/provider-runtime-utils.ts`
- 新增 `providers/anthropic-runtime.ts` / `providers/gemini-runtime.ts` / `providers/ollama-runtime.ts`
- `anthropic.ts` / `gemini.ts` / `ollama.ts` 改成 metadata + thin adapter，并补齐 `extras.secrets` override

27. Wave 6 第十一批的 legacy 非流式聊天继续收口：

- 新增 `legacy/nonstreaming-chat-executor.ts`
- `chat-service-ai-mastra.ts` 改成薄包装
- legacy `providerInstanceId` 在非流式聊天路径中的 secrets/baseUrl/model 语义已补正

28. Wave 6 第十二批的非主路径 Mastra 清理：

- `tagging-service.ts` 不再直接调用 `createLegacyMastraAgent()`
- `resource-query-handler.ts` 不再直接 import / new Mastra `Agent`
- 生产代码里的 Mastra `Agent` 已基本只剩隔离 helper 层

29. Wave 6 第十三批的 legacy 非流式服务归位：

- 新增 `legacy/nonstreaming-chat-service.ts`
- `chat-service.ts` 改为直接按需加载新 legacy service
- `chat-service-ai-mastra.ts` 已退化成 compat re-export

30. Wave 7 第一批的旧工具 contract 去 Mastra：

- 新增 `tools/tool-definition.ts`
- legacy `tools/*.ts` 不再依赖 `@mastra/core` / `@mastra/core/tools`
- `chat-service-ai-mastra.ts` 已从代码库删除

31. Wave 7 第四批的 preset 语义闭环：

- preset 持久化默认落到 `ai-provider-presets.json`
- renderer / main / settings / chat sidebar 统一切到 preset API
- legacy instance 语义只保留兼容 alias

32. Wave 8 第一批的 provider metadata 与 model selector 收口：

- `ai:getProviders` 开始向 renderer 暴露 `kind` / `defaultModel`
- `ProviderModelSelect` 开始支持 provider/preset 维度的模型缓存
- `autoLoadFirst` 现在会真正落下首个 provider 的默认模型
- provider 配置窗开始复用 locale 字段标签，并支持 `select` 型 schema 字段

33. Wave 8 第二批的 provider capability metadata 收口：

- builtin provider metadata 开始统一声明 `capabilities` / `defaultModels`
- `ai:getProviders` 开始继续向 renderer 暴露 capability/default model family 信息
- `PiExecutionService` 开始用 capability metadata 校验 `embed` / `transcribe` / `generateImage`
- workflow 图片生成节点开始按 capability 过滤 provider
- ASR 云端 provider 列表开始只展示已接通 transcribe 的 provider

34. Wave 8 第三批的 preset 体验深化收口：

- 聊天选择主链路已经切到 `presetId` 语义，`instanceId` 只保留兼容 alias
- `ProviderModelSelect` / provider 配置窗已经支持 preset-scoped secrets
- 资源页聊天、注释词汇生成、翻译、总结、脑图入口都已经统一透传 `providerInstanceId`

35. Wave 8 第四批的 provider/runtime 收口：

- OpenAI 已正式接通 `audio.transcriptions`，补齐 transcribe capability gap
- builtin provider adapter 开始显式暴露 `getCapabilities()` / `getDefaultModels()`
- OpenAI transcribe 模型开始可在云端 ASR 页面直接选用

Wave 8 完成标志：

1. preset 语义已经覆盖聊天页、资源页与配置窗，不再只是设置页级别的局部收口。
2. Pi-first capability 主路径已经覆盖 chat / embeddings / transcribe / image generation。
3. OpenAI transcription 不再是已知缺口，Wave 8 的 provider/runtime 收尾工作已经完成。

Wave 9 建议方向：

1. 继续补齐更多 provider 的非聊天能力真接线，例如更多 image / speech / realtime 能力。
2. 继续压缩 renderer 里的分散 AI 入口，把更多页面直接改走统一 execution service。
3. 继续评估何时删除 `instanceId` alias 与旧 payload 兼容分支。
