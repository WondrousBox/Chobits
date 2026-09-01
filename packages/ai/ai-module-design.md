# AI 模块（主进程）设计说明

更新时间：2026-03-17

本文档系统整理了当前 AI 模块（已迁移到 `packages/ai`）的总体设计，实现对话、向量嵌入（embeddings）、多 Provider/预设管理、Pi profile 调度等能力，目标是形成一个“可抽离为插件”的、主进程优先的独立模块，满足：

- 支持可扩展的服务商（OpenAI、Anthropic、Gemini、Ollama、DeepSeek、Qwen、智谱等，以及兼容 OpenAI 协议的自定义服务）
- 对话与消息持久化逻辑在主进程实现，渲染进程仅通过 IPC 调用
- 支持流式对话返回（token 级增量）与可取消（Abort）
- 支持基于 Pi profile 的对话执行模式；当前聊天 UI 只暴露 `chat`、`assistant`、`coder` 三种模式
- 统一的 Provider/预设配置与秘钥持久化（keytar + JSON 回退）

## 1. 总览与原则

- 分层：Main（核心逻辑/安全/IPC） → Preload（桥接） → Renderer（UI调用，不接触秘钥）
- 可扩展：Provider definition / adapter / Pi profile 都通过统一注册表管理；新增服务商无需改动核心逻辑
- 可移植：AI 模块已从 `electron/main/ai` 迁移到 `packages/ai`，可独立打包为插件
- 安全：秘钥仅存于主进程
- 流式：统一事件协议，支持取消（Abort）

## 2. 模块结构与目录

AI 模块目前作为独立包位于 `packages/ai` 下，由主进程在启动时初始化：

- `packages/ai/types.ts`：核心类型定义（消息、流事件、Provider 合约、Embedding 请求/响应、Provider/预设配置 schema、Renderer AIApi 接口）
- `packages/ai/registry.ts`：Provider adapter 与 Pi profile 的轻量注册表（register/get/list）
- `packages/ai/providers/registry.ts`：`ProviderDefinition` 注册表，负责 canonical id、alias、冲突检测与查询
- `packages/ai/providers/service.ts`：统一 Provider 读取入口，负责 schema / capabilities / default models / alias / model compatibility 读取
- `packages/ai/providers/catalog.ts`：内建 Provider adapter 的启动注册入口
- `packages/ai/preset-service.ts`：统一 Preset 业务入口，负责预设 CRUD、preset secret 读取/写入与业务侧查询收口
- `packages/ai/chat-service.ts`：对话服务，负责流式处理、取消、与 IPC 集成，并与 `ChatRepo` 做会话/消息持久化
- `packages/ai/settings-store.ts`：Provider 秘钥与 API key 存储，带 JSON 文件回退（`userData/data/ai-settings.json`）
- `packages/ai/preset-secrets-store.ts`：Preset secret 底层存储，负责 preset 维度的 keytar / JSON 读写
- `packages/ai/settings-storage.ts`：`settings-store.ts` 与 `preset-secrets-store.ts` 共享的底层文件存储 helper
- `packages/ai/presets-store.ts`：Provider 预设（Preset）底层存储 helper，负责基础持久化、历史数据兼容读取与 canonical provider id 归一化
- `packages/ai/prompts-store.ts`：提示词模板（Prompt Template）存储与 CRUD
- `packages/ai/ipc-main.ts`：AI 相关 IPC 处理器入口（注册 builtin provider、初始化 ChatService、注册设置/预设/模板/会话等 IPC）
- `packages/ai/providers/builtins/*`：内建 Provider 的 definition / models 真相源
- `packages/ai/providers/*`：各服务商 thin adapter 与 runtime helper（如：`openai.ts`、`anthropic.ts`、`gemini.ts`、`ollama.ts`、`openai-runtime.ts` 等）
- `packages/ai/runtime/pi/profiles.md`：Pi profile 系统提示与元数据的 Markdown 真相源（与 `toolbox.md` 同模式，Vite `?raw` 加载）
- `packages/ai/runtime/pi/profile-markdown.ts`：从 `profiles.md` 解析出 `PiProfileDescriptor`
- `packages/ai/runtime/pi/profile-descriptors.ts`：组装并导出 `getPiProfileDescriptor` / `listPiProfileDescriptors`
- `packages/ai/runtime/pi/profile-registry.ts`：Pi profile 注册表，对外提供 UI agent/profile 元数据

Preload：

- `packages/ai/ipc-renderer.ts`：渲染进程可用的 `aiBridge` 封装，通过 `ipcRenderer` 调用上述 IPC
- `electron/preload/index.ts`：通过 `contextBridge` 把 `aiBridge` 暴露为 `window.YUA.ai`，包含 getProviders/getAgents/chat/chatStream/embed/cancel 等方法以及预设/模板/历史等扩展接口。

Renderer（示例约定，实际路径视实现为准）：

- 设置页/对话页组件：直接通过 `window.YUA.ai` 使用 `getProviders`/`listPresets`/`listPromptTemplates`/`listConversations` 等接口渲染配置和会话列表
  - 主聊天入口正向 model-first 迁移：界面选择 `provider + model`，发送前再解析隐藏 preset

## 3. 关键接口（Contract）

### 3.1 消息与请求

- **Role**：`'system' | 'user' | 'assistant' | 'tool'`
- **ChatMessage**：`{ id?, role, content, name?, toolCallId?, metadata?, createdAt? }`
- **ChatRequest**：
  - `conversationId?: string`
  - `messages: ChatMessage[]`
  - `agentId?: string`：使用哪个 Pi profile（如 `chat` / `assistant` / `coder`）
  - `providerId?: string`：使用哪个 Provider 适配器（如 `openai`）
  - `providerPresetId?: string`：使用哪个 Provider 预设，用于系统提示词/秘钥覆盖
  - `stream?: boolean`
  - `temperature?: number`
  - `maxTokens?: number`
  - `abortId?: string`：用于取消
  - `extras?: Record<string, any>`：profile/Provider 特定扩展字段（如模型、secrets、enabledTools 等）
- **ChatResponse**：
  - `message: ChatMessage`
  - `usage?: { inputTokens?: number; outputTokens?: number; cost?: number }`
  - `providerId?: string`
  - `agentId?: string`
  - `metadata?: Record<string, any>`

### 3.2 流式事件（StreamEvent）

- `delta`：`{ type: 'delta'; data: { text?: string; toolCall?: any } }`
- `message_completed`：`{ type: 'message_completed'; data: { message: ChatMessage } }`
- `tool_call`：`{ type: 'tool_call'; data: { name: string; args: any; callId: string; label?: string } }`
- `tool_result`：`{ type: 'tool_result'; data: { callId: string; result: any } }`
- `metadata`：`{ type: 'metadata'; data: Record<string, any> }`
- `error`：`{ type: 'error'; data: { message: string; code?: string; cause?: any } }`
- `done`：`{ type: 'done'; data?: {} }`

### 3.3 Embedding

- **EmbeddingRequest**：`{ texts: string[]; providerId?: string; model?: string; normalize?: boolean }`
- **EmbeddingResponse**：`{ vectors: number[][]; dim: number; model?: string; providerId?: string }`

### 3.4 ProviderAdapter（服务商适配器）

- 基本属性：
  - `id: string`
  - `label: string`
  - `isConfigured(): Promise<boolean> | boolean`
  - `setSecrets(secrets: ProviderSecrets)`
  - `clearSecrets?(): Promise<void> | void`（清空内存中的用户秘钥，回落到内置默认值）
  - `getSecrets(): ProviderSecrets`
- 能力方法（可选）：
  - `getCapabilities?(): ProviderCapabilities`
  - `getDefaultModels?(): ProviderDefaultModels`
  - `getConfigSchema?(): ProviderConfig`
  - `chat?(req: ChatRequest, onStream?: (event: StreamEvent) => void, signal?: AbortSignal): Promise<ChatResponse>`
  - `embed?(req: EmbeddingRequest): Promise<EmbeddingResponse>`
  - `listModels?(opts?: { secrets?: ProviderSecrets }): Promise<Array<{ id: string; label?: string; ... }>>`

其中 schema / default models / capability 的主真相源已经是 `ProviderDefinition`；adapter 上的同名方法只在运行时需要覆盖 definition 行为时才保留。

**ProviderConfig**（用于前端渲染设置表单）：

- `id: string`
- `label: string`
- `enabled: boolean`
- `icon?: string`
- `locales?: Record<string, { label?: string; fields?: Record<string, string> }>`
- `fields: Array<{ key; label; type: 'text'|'password'|'select'; required?; options? }>`

### 3.5 AgentProfile（Pi Profile）

当前 UI 暴露的“智能体”语义，已经从早期代码态 `AgentDefinition` 收敛为 Pi profile metadata：

- 基本字段：
  - `id: string`
  - `label: string`
  - `description?: string`
  - `executionMode?: "one-shot" | "session"`
  - `supportsToolCalls?: boolean`
- 来源：
  - `packages/ai/runtime/pi/profile-registry.ts`
  - `packages/ai/registry.ts`
- 用途：
  - 决定主聊天/工具调用/one-shot 执行时使用哪套 profile descriptor
  - 为 `ai:getAgents` 提供 UI 可见的 profile 列表

### 3.6 Renderer AIApi（Preload 暴露）

`types.ts` 中定义的 `AIApi` 是渲染侧可见的聚合接口（`window.YUA.ai` 的形状），核心能力包括：

- Provider/Profile：
  - `getProviders()`
  - `getAgents()`
  - `listModels(providerId, presetId?)`
  - `getProviderSecrets(providerId)`
  - `setProviderSecrets(providerId, secrets)`
  - `clearProviderSecrets(providerId)`
- Chat & Embedding：
  - `chat(payload)`
  - `chatEphemeral(payload)`
  - `chatStream(payload, onEvent)`
  - `embed({ texts, providerId?, model?, normalize? })`
- 预设（Preset）管理：
  - `listPresets(providerId?)`
  - `createPreset({ providerId, name, model?, systemPrompt?, overrides?, config? })`
  - `updatePreset(id, patch)`
  - `deletePreset(id)`
  - `getPresetSecrets(presetId)`
  - `setPresetSecrets(presetId, secrets)`
  - 旧 `instance` CRUD alias 已从 AI 模块公开接口移除
- Prompt 模板：
  - `listPromptTemplates()`
  - `createPromptTemplate(...)`
  - `updatePromptTemplate(id, patch)`
  - `deletePromptTemplate(id)`
- 会话与消息：
  - `listConversations({ includeDeleted?, limit?, offset? }?)`
  - `listMessages(conversationId, limit?, offset?)`
  - `renameConversation(id, title)`
  - `deleteConversation(id)`
  - `restoreConversation(id)`

## 4. IPC 接口与通道

### 4.1 Chat & Embedding 相关 IPC（由 `ChatService` 注册）

Renderer → Preload → Main：

- **`ai:chat`** `(ChatRequest)` → `ChatResponse`
  - 有会话持久化：会根据 `conversationId` 在 `ChatRepo` 中 `ensureConversation`，并写入最后一条 user 消息和 assistant 回复。
- **`ai:chatEphemeral`** `(ChatRequest)` → `ChatResponse`
  - 无会话持久化：仍会合并预设 overrides / secrets，但不写入 `ChatRepo`。
- **`ai:chatStream`** `(ChatRequest & { requestId? })` → `{ requestId, eventsChannel }`
  - 流式、有持久化：在首条 user 消息后写入历史，结束时写入 assistant 最终消息，并通过 metadata 附带 `conversationId`。
- **`ai:cancel`** `({ requestId })` → `{ ok: true }`
  - 使用内部 `AbortController` 取消指定请求。
- **`ai:embed`** `(EmbeddingRequest)` → `EmbeddingResponse`
  - 直接调用当前 Provider 的 `embed` 能力。

事件通道：

- **`ai:stream:${requestId}`**：推送 `StreamEvent`（见上），同时在开始时会发送 `connected` 元事件，结束时发送 `done` 或 `error`。

### 4.2 Provider & Agent & 模型

由 `initAIHandlers` 注册：

- **`ai:getProviders`** → `[{ id, aliases, label, configured, capabilities, defaultModels, kind, defaultModel, schema }]`
  - 这些字段统一由 `ProviderDefinition` / `ProviderService` 派生。
  - `configured` 仍基于当前 adapter 的 `isConfigured()` 判断。
- **`ai:getProviderSecrets`** `({ providerId })` → `{ [field]: value }`
  - 使用 `ProviderService` 提供的 schema field key 列表 + `getAllSecrets(providerId, keys)` 读取。
- **`ai:setProviderSecrets`** `({ providerId, secrets })` → `{ ok: true }`
  - 写入 keytar/回退 JSON，并调用 Provider 的 `setSecrets`。
- **`ai:clearProviderSecrets`** `({ providerId })` → `{ ok: true }`
  - 清除 keytar 与回退 JSON 中该 Provider 的所有秘钥，并调用 `clearSecrets()` 清空 adapter 内存中的秘钥（未实现的外部插件 adapter 退化为 `setSecrets({})`）。
- **`ai:getAgents`** → `[{ id, label, description }]`
- **`ai:listModels`** `({ providerId, presetId? })` → `Array<{ id, label? }>`
  - builtin/compat 模型优先来自 `ProviderService`；
  - 若 Provider 支持远程列模型，则会在构造好 preset-scoped secrets 后再调用 `Provider.listModels(opts)`。

### 4.3 Provider 预设（Preset）管理

- **`ai:listPresets`** `({ providerId? })` → `PresetService.listPresets(providerId?)`
- **`ai:createPreset`** `({ providerId, name, model?, systemPrompt?, overrides?, config? })` → 新建预设记录（`config` 仅保留兼容 alias）
- **`ai:updatePreset`** `({ id, patch })` → 更新预设
- **`ai:deletePreset`** `({ id })` → `{ ok: boolean }`
  - 通过 `PresetService` 删除预设记录，并同步清理该 preset 的 secret 存储。
- **`ai:getPresetSecrets`** `({ presetId })` → `{ [field]: value }`
  - 通过 `PresetService` 根据预设关联的 Provider schema 取出字段，再从 keytar/JSON 读出值。
- **`ai:setPresetSecrets`** `({ presetId, secrets })` → `{ ok: true }`
- 旧的 instance 风格 IPC alias 已移除。

### 4.4 Prompt 模板与历史会话

- Prompt 模板：
  - **`ai:listPromptTemplates`**
  - **`ai:createPromptTemplate`** `({ name, type, content, tags? })`
  - **`ai:updatePromptTemplate`** `({ id, patch })`
  - **`ai:deletePromptTemplate`** `({ id })` → `{ ok: boolean }`
- 会话与消息历史（基于 `ChatRepo`）：
  - **`ai:listConversations`** `({ includeDeleted?, limit?, offset? }?)`
  - **`ai:listMessages`** `({ conversationId, limit?, offset? })`
  - **`ai:renameConversation`** `({ id, title })` → `{ ok, row? }`
  - **`ai:deleteConversation`** `({ id })` → `{ ok }`（软删除）
  - **`ai:restoreConversation`** `({ id })` → `{ ok }`

## 5. 流式对话设计

- ChatService 使用 `AbortController` 管理取消，请求 id 统一使用 `abortId` 或内部生成的 `requestId`。
- `ai:chatStream`：
  - 主进程立即返回 `{ requestId, eventsChannel }`，让渲染进程先订阅事件通道。
  - 随后以异步任务方式启动实际的对话处理。
- Provider/runtime 在生成时通过回调 `emit({ type: 'delta', data: { text } })` 推送 token 片段：
  - ChatService 负责将该事件转发到 `eventsChannel`（例如 `ai:stream:${requestId}`）。
- ChatService 会在合适时机补发：
  - `connected`：表示通道已就绪
  - `metadata`：在有会话持久化时附带 `conversationId`
  - `message_completed`：若 Provider/runtime 未主动发送，则在拿到最终回复后主动补发
  - `done` / `error`：终止信号
- 在带历史持久化的流式对话中，ChatService 会：
  - 在收到请求后写入用户最后一条消息；
  - 在对话结束后写入助手最终消息。

### 5.1 Prompt Inspection

所有 Pi runtime 最终发给模型的对话请求都应经过 `packages/ai/runtime/pi/prompt-inspector.ts` 统一观察，而不是在业务服务里散落 `console.log(prompt)`。

覆盖入口：
- `PiSessionService` 的 `pi-ai.completeSimple` / `pi-ai.streamSimple`
- `PiSessionService` 的 `pi-coding-agent` session prompt
- forked skill 子 session prompt
- `createPiTaskChatRuntime()` 生成的后台任务 chatFn

默认关闭，避免把用户对话、记忆、persona、系统提示词写入日志。需要完整查看实际发送内容时，直接修改 `packages/ai/runtime/pi/prompt-inspector-settings.ts`：

```ts
export const AI_PROMPT_INSPECTOR_SETTINGS = {
  enabled: true,
  keepRecent: true,
  printToConsole: true
};
```

也可以在单次 `ChatRequest.extras` 中传 `debugPrompt: true` / `inspectPrompt: true` / `showPrompt: true` 临时打开。输出会包含 system prompt、历史 messages、当前 prompt、transport、provider/model/profile，以及 coding session 的 active tools。

## 6. 服务商扩展（Provider）

适配步骤（以 OpenAI 为例，当前已实现）：

1. 在 `packages/ai/providers/builtins/<provider>/definition.ts` 中声明 `ProviderDefinition`；
2. 如需内建静态模型，在 `packages/ai/providers/builtins/<provider>/models.ts` 中补齐模型定义；
3. 在 `packages/ai/providers/*.ts` 中实现或复用 thin adapter / runtime helper；
4. 通过 `packages/ai/providers/catalog.ts` 的 `registerBuiltInProviders()` 统一注册 adapter；
5. UI、Workflow、Pi runtime、settings 统一通过 `ProviderService` 读取 schema / alias / default models / capabilities。

当前内置 Provider（通过 `registerBuiltInProviders()` 启动注册）包括：

- `OpenAIProvider`：`id = 'openai'`
- `AnthropicProvider`：`id = 'anthropic'`
- `GeminiProvider`：`id = 'gemini'`
- `OllamaProvider`：`id = 'ollama'`
- `DeepSeekProvider`：`id = 'deepseek'`
- `QwenProvider`：`id = 'qwen'`
- `ZhipuProvider`：`id = 'zhipu'`

以及通用的 OpenAI 协议兼容 Provider：

- `OpenAICompatibleProvider`：可用于深度定制的第三方网关/私有部署，构造时传入 `id`/`label`/`baseUrl`/`model` 等默认参数。

Provider 适配要点：

- **chat**：统一支持 `stream` 模式，将 token 片段通过 `emit({ type: 'delta', data: { text } })` 推送；在非流式模式下返回完整 `ChatResponse`。
- **embed**：对齐维度 `dim` 以适配底层向量检索（如 sqlite-vec / 自建向量库）。
- **listModels**：优先复用 `ProviderService` 基于 definition 导出的兼容模型格式；标准 runtime 再按需尝试远端 `client.models.list()` 补齐。
- **代理/网络**：通过 `baseUrl` 等字段支持自定义网关/代理，必要时可扩展 headers/代理参数。

## 7. Profile 与执行模式

当前代码已经不再维护早期 `packages/ai/agents/*` 这套代码态 Agent 目录，而是拆成两类能力：

- **Pi profile**
  - 系统提示与默认工具等由 `packages/ai/runtime/pi/profiles.md` 维护，经 `profile-markdown.ts` 解析、`profile-descriptors.ts` 导出；
  - 由 `packages/ai/runtime/pi/profile-registry.ts` 提供 UI 可选 profile 元数据；
  - 主聊天、session tool 调度、one-shot execution 都基于 profile descriptor 决定行为。
- **业务服务**
  - 例如 `PiExecutionService`、`SummaryService`、后台任务 chat runner 等；
  - 这些服务直接复用 `ProviderService`、Pi runtime 和 preset/secrets 解析，而不是通过独立 Agent 类再包一层。

后续如果需要恢复更强的“智能体”抽象，建议建立在 Pi profile / tool registry / execution service 之上，而不是回到旧的 `agents/*` 目录模式。

## 8. 秘钥与配置存储

- **存储实现**：`settings-store.ts` + `preset-secrets-store.ts`
  - 首选使用 keytar，将 Provider/预设秘钥存放在系统密钥链中；
  - 当 keytar 不可用时，自动回退到 `userData/data/ai-settings.json`，结构：
    - `providers: Record<providerId, Record<key, value>>`
    - `instances: Record<presetId, Record<key, value>>`（字段名保留历史兼容）
- **Provider 配置**：
  - 前端通过 `getProviders` 获取 schema，并动态渲染配置表单；
  - 通过 `settings-store.ts` 暴露的 `setProviderSecrets`/`clearProviderSecrets` 读写秘钥。
- **预设配置**：
  - `PresetService` 是业务侧唯一的预设读写入口；
  - `presets-store.ts` 仅保存预设的基础信息（名称、系统提示词、自定义 overrides 等）；
  - 预设秘钥底层由 `preset-secrets-store.ts` 管理，并在运行时与 provider secrets 合并；
  - 删除预设时，`PresetService` 会同步清理对应的 preset secrets。

## 9. 安全、稳定性与观测

- **安全**：
  - 秘钥仅在主进程通过 keytar/回退 JSON 持久化，渲染进程通过 IPC 间接访问；
  - Preload 仅暴露必要的高层 API，不直接暴露秘钥内容。
- **并发与取消**：
  - 每个流式请求都对应一个 `AbortController`，`ai:cancel` 会在主进程中中止对应请求；
  - Provider 的 `chat` 实现需要支持传入 `AbortSignal`。
- **观测与用量**：
  - `ChatResponse.usage` 预留 tokens/cost 字段，方便前端统计用量与费用。
- **日志与错误**：
  - 流式事件中的 `error` 类型统一包含 `message` 与可选 `code`/`cause`，便于前端展示与排查。

## 10. 抽离为插件的路径

- 当前 AI 模块已位于 `packages/ai`，主工程只需在主进程入口调用 `initAIHandlers(win)` 并在 Preload 中桥接 `aiBridge`。
- 保持 `ProviderDefinition` / `ProviderAdapter` / profile metadata / IPC 形状稳定，可支持后续：
  - 扫描插件 manifest 进行 Provider 注册；
  - 通过配置文件/插件系统在运行时动态增删 Provider/profile。

## 11. 实施状态（Milestones）

1. Provider 基础设施（已完成）
   - `ProviderDefinition` / `ProviderRegistry` / `ProviderService` 已落地，Provider 主读取链路已统一。
2. Builtin Provider 接入（已完成主链路）
   - OpenAI / Anthropic / Gemini / Ollama / DeepSeek / Qwen / 智谱等已迁入 definition + thin adapter 体系。
3. 业务消费方收口（已完成主链路）
   - `ipc-main.ts`、settings/preset、Workflow、Pi runtime 已统一通过 `ProviderService` 读取 provider 信息。
4. 安全与存储（已上线基础方案）
   - keytar + JSON 回退；provider id 持久化已 canonical 化。
5. 观测与用量（规划中）
   - 统一的 tokens 与成本统计，以及在 UI 中展示。
6. 插件化与自动发现（基础设施进行中）
   - 已新增 provider plugin manifest/validator/loader；
   - 主进程启动时会扫描 `<userData>/providers/*/provider.json` 与 `<pluginsDir>/providers/*/provider.json`；
   - 当前已支持插件 Provider definition 的发现、校验、注册与告警；
   - 声明式插件 Provider 已可复用 `openai/openai-compatible/anthropic/gemini/ollama` driver 自动进入主链路；
   - `runtime.mode = module` 已支持动态模块加载，并在主进程启动阶段异步注册自定义 adapter。

## 12. 使用说明（Quick Try）

## 13. Model-First Chat Supplement

- 主聊天入口开始从 preset-first 迁移到 model-first surface。
- UI 层优先选择 `providerId + modelId`，不再把 preset 作为主入口选择项。
- 发送前通过 `ai:resolveUsablePreset({ providerId, preferredPresetId? })` 解析真正可用的 `providerPresetId`。
- 聊天请求推荐形态为：
  - `providerId`: 当前模型所属 Provider
  - `providerPresetId`: 发送前解析得到的可用 preset
  - `extras.model`: 用户当前显式选择的模型 ID

以下示例基于预期的 `window.YUA.ai` 接口（由 Preload 暴露）：

- **流式对话**（带会话历史）：

```ts
const disposer = await window.YUA.ai.chatStream(
  {
    conversationId: undefined, // 首次可省略，后续可复用
    messages: [{ role: 'user', content: 'Hello there' }],
    providerId: 'openai',
    agentId: 'assistant',
    stream: true
  },
  (ev) => {
    console.log('stream:', ev);
  }
);

// 取消生成
await disposer.cancel();
// 取消订阅事件
disposer.dispose();
```

- **获取并保存 Provider 配置**：

```ts
const providers = await window.YUA.ai.getProviders();
const openai = providers.find((p) => p.id === 'openai');
if (openai) {
  await window.YUA.ai.setProviderSecrets('openai', { apiKey: 'sk-...' });
}
```

## 13. 后续工作清单

- [ ] 衔接 UI（Provider/预设/Prompt/会话管理界面）与当前 API，提升可视化管理体验
- [ ] 用量/费用统计与 UI 展示
- [ ] 插件发现与第三方 Provider/profile 注册规范
- [ ] 更丰富的 profile / execution 模板（如多工具协同、结构化输出、评审等）

## 13.1 Coding Profile Notes

- Pi profiles now include a `coder` profile for repository-aware editing sessions（`coder` 节见 `profiles.md`）。
- The main chat page（`src/pages/ChatPage/ChatPage.tsx`）passes `agentId` together with `extras.codingWorkspaceRoot` and `extras.codingWorkspaceLabel` when `coder` is active.
- `packages/ai/runtime/pi/model-resolver.ts` resolves that workspace into `ResolvedPiRequest.coding`.
- `packages/ai/runtime/pi/session-factory.ts` uses the selected workspace root as the Pi session `cwd`.
- `packages/ai/runtime/pi/session-service.ts` blocks `coder` requests that do not have a selected workspace and returns a fixed assistant message instead of relying on model behavior.
- Workspace-scoped file and search tools live under `packages/ai/runtime/pi/coding/` and `packages/ai/runtime/pi/tools/file-*.ts`.
- `packages/ai/runtime/pi/coding/shell-service.ts` adds a restricted verification runner for `git`, `tsc`, and `vitest`.
- These tools are restricted to the selected workspace root and reject escaping paths, including symlink-based escapes.

---

如需扩展 Provider/profile 或调整 IPC 协议，请优先修改本模块的类型定义（`types.ts`）与本设计文档，确保渲染端与主进程统一升级。
