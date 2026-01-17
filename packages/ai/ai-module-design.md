# AI 模块（主进程）设计说明

更新时间：2025-12-16

本文档系统整理了当前 AI 模块（已迁移到 `packages/ai`）的总体设计，实现对话、向量嵌入（embeddings）、多 Provider/实例管理、RAG、自动打标签等能力，目标是形成一个“可抽离为插件”的、主进程优先的独立模块，满足：

- 支持可扩展的服务商（OpenAI、Anthropic、Gemini、Ollama、DeepSeek、Qwen、智谱等，以及兼容 OpenAI 协议的自定义服务）
- 对话与消息持久化逻辑在主进程实现，渲染进程仅通过 IPC 调用
- 支持流式对话返回（token 级增量）与可取消（Abort）
- 支持注册自定义智能体（Agent），可插入 RAG、自动打标签（Tagger）等策略
- 统一的 Provider/实例配置与秘钥持久化（keytar + JSON 回退）

## 1. 总览与原则

- 分层：Main（核心逻辑/安全/IPC） → Preload（桥接） → Renderer（UI调用，不接触秘钥）
- 可扩展：Provider/Agent 均使用注册表；新增服务商/智能体无需改动核心逻辑
- 可移植：整个 `electron/main/ai` 模块可独立打包为插件（未来迁移到 `packages/ai`）
- 安全：秘钥仅存于主进程
- 流式：统一事件协议，支持取消（Abort）

## 2. 模块结构与目录

AI 模块目前作为独立包位于 `packages/ai` 下，由主进程在启动时初始化：

- `packages/ai/types.ts`：核心类型定义（消息、流事件、Provider/Agent 合约、Embedding 请求/响应、Provider/实例配置 schema、Renderer AIApi 接口）
- `packages/ai/registry.ts`：Provider/Agent 注册表（register/get/list）
- `packages/ai/chat-service.ts`：对话服务，负责流式处理、取消、与 IPC 集成，并与 `ChatRepo` 做会话/消息持久化
- `packages/ai/settings-store.ts`：基于 keytar 的 Provider/实例秘钥存储，带 JSON 文件回退（`userData/data/ai-settings.json`）
- `packages/ai/instances-store.ts`：Provider 实例（Instance）配置存储，负责 CRUD 与列表
- `packages/ai/prompts-store.ts`：提示词模板（Prompt Template）存储与 CRUD
- `packages/ai/tagging-service.ts`：自动选实例 + 文本自动打标签服务，暴露 `ai:autoTagText`
- `packages/ai/ipc-main.ts`：AI 相关 IPC 处理器入口（注册 Provider/Agent、初始化 ChatService、注册设置/实例/模板/会话等 IPC）
- `packages/ai/ipc-renderer.ts`：渲染进程可用的 `aiBridge` 封装，通过 `ipcRenderer` 调用上述 IPC
- `packages/ai/providers/*`：各服务商适配器（如：`openai.ts`、`anthropic.ts`、`gemini.ts`、`ollama.ts`、`deepseek.ts`、`qwen.ts`、`zhipu.ts` 等）
- `packages/ai/agents/*`：智能体定义（`basic.ts`、`rag.ts`、`tagger.ts` 等）
- `packages/ai/models-loader.ts`：Provider 模型列表加载（支持 JSON 配置 + 在线拉取）
- `packages/ai/schema-loader.ts`：Provider 配置 schema 加载（允许用 JSON 覆盖）
- `packages/ai/selection-strategy.ts`：自动选择最佳实例的策略配置与评分

Preload：

- `electron/preload/apis/ai.ts`（约定）：基于 `aiBridge` 暴露 `window.YUA.ai`，包含 getProviders/getAgents/chat/chatStream/embed/cancel 等方法以及实例/模板/历史等扩展接口。

Renderer（示例约定，实际路径视实现为准）：

- `src/lib/aiClient.ts`：简单客户端封装，便于在组件/页面中调用 `window.YUA.ai`
- 设置页/对话页组件：使用 `getProviders`/`listInstances`/`listPromptTemplates`/`listConversations` 等接口渲染配置和会话列表

## 3. 关键接口（Contract）

### 3.1 消息与请求

- **Role**：`'system' | 'user' | 'assistant' | 'tool'`
- **ChatMessage**：`{ id?, role, content, name?, toolCallId?, metadata?, createdAt? }`
- **ChatRequest**：
  - `conversationId?: string`
  - `messages: ChatMessage[]`
  - `agentId?: string`：使用哪个 Agent（如 `basic` / `rag` / `tagger`）
  - `providerId?: string`：使用哪个 Provider 适配器（如 `openai`）
  - `providerInstanceId?: string`：使用哪个 Provider 实例（Instance），用于模型/系统提示词/秘钥覆盖
  - `stream?: boolean`
  - `temperature?: number`
  - `maxTokens?: number`
  - `abortId?: string`：用于取消
  - `extras?: Record<string, any>`：Agent/Provider 特定扩展字段（如模型、secrets、RAG 相关参数等）
- **ChatResponse**：
  - `message: ChatMessage`
  - `usage?: { inputTokens?: number; outputTokens?: number; cost?: number }`
  - `providerId?: string`
  - `agentId?: string`
  - `metadata?: Record<string, any>`

### 3.2 流式事件（StreamEvent）

- `delta`：`{ type: 'delta'; data: { text?: string; toolCall?: any } }`
- `message_completed`：`{ type: 'message_completed'; data: { message: ChatMessage } }`
- `tool_call`：`{ type: 'tool_call'; data: { name: string; args: any; callId: string } }`
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
  - `getConfigSchema(): ProviderConfig`
  - `setSecrets(secrets: ProviderSecrets)`
  - `getSecrets(): ProviderSecrets`
- 能力方法（可选）：
  - `chat?(req: ChatRequest, onStream?: (event: StreamEvent) => void, signal?: AbortSignal): Promise<ChatResponse>`
  - `embed?(req: EmbeddingRequest): Promise<EmbeddingResponse>`
  - `listModels?(opts?: { secrets?: ProviderSecrets }): Promise<Array<{ id: string; label?: string; ... }>>`

**ProviderConfig**（用于前端渲染设置表单）：

- `id: string`
- `label: string`
- `enabled: boolean`
- `icon?: string`
- `locales?: Record<string, { label?: string; fields?: Record<string, string> }>`
- `fields: Array<{ key; label; type: 'text'|'password'|'select'; required?; options? }>`

### 3.5 AgentDefinition（智能体）

- 基本：
  - `id: string`
  - `label: string`
  - `description?: string`
  - `defaultProviderId?: string`
- 行为：
  - `handleChat(ctx: AgentContext, req: ChatRequest, signal?: AbortSignal): Promise<ChatResponse>`
- **AgentContext**：
  - `window?: BrowserWindow`
  - `emit?: (event: StreamEvent) => void`：Agent 可主动向前端推送元数据/工具事件
  - `getProvider: (id?: string) => ProviderAdapter | undefined`

### 3.6 Renderer AIApi（Preload 暴露）

`types.ts` 中定义的 `AIApi` 是渲染侧可见的聚合接口（`window.YUA.ai` 的形状），核心能力包括：

- Provider/Agent：
  - `getProviders()`
  - `getAgents()`
  - `listModels(providerId, instanceId?)`
  - `getProviderSecrets(providerId)`
  - `setProviderSecrets(providerId, secrets)`
  - `clearProviderSecrets(providerId)`
- Chat & Embedding：
  - `chat(payload)`
  - `chatEphemeral(payload)`
  - `chatStream(payload, onEvent)`
  - `embed({ texts, providerId?, model?, normalize? })`
- 实例（Instance）管理：
  - `listInstances(providerId?)`
  - `createInstance({ providerId, name, model?, systemPrompt?, config? })`
  - `updateInstance(id, patch)`
  - `deleteInstance(id)`
  - `getInstanceSecrets(instanceId)`
  - `setInstanceSecrets(instanceId, secrets)`
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
  - 无会话持久化：仍会合并实例配置，但不写入 `ChatRepo`。
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

- **`ai:getProviders`** → `[{ id, label, configured, schema }]`
  - `configured` 基于 Provider `isConfigured()` 判断。
  - `schema` 为 `getConfigSchema()` 返回值。
- **`ai:getProviderSecrets`** `({ providerId })` → `{ [field]: value }`
  - 使用 `getAllSecrets(providerId, keys)` 读取必填字段及其他字段。
- **`ai:setProviderSecrets`** `({ providerId, secrets })` → `{ ok: true }`
  - 写入 keytar/回退 JSON，并调用 Provider 的 `setSecrets`。
- **`ai:clearProviderSecrets`** `({ providerId })` → `{ ok: true }`
  - 清除 keytar 与回退 JSON 中该 Provider 的所有秘钥，并尝试调用 `setSecrets({})`。
- **`ai:getAgents`** → `[{ id, label, description }]`
- **`ai:listModels`** `({ providerId, instanceId? })` → `Array<{ id, label? }>`
  - 若传入 `instanceId`，会按实例配置与秘钥构建 `opts.secrets` 后调用 Provider 的 `listModels(opts)`。

### 4.3 Provider 实例（Instance）管理

- **`ai:listInstances`** `({ providerId? })` → `InstancesStore.list(providerId?)`
- **`ai:createInstance`** `({ providerId, name, model?, systemPrompt?, config? })` → 新建实例记录
- **`ai:updateInstance`** `({ id, patch })` → 更新实例
- **`ai:deleteInstance`** `({ id })` → `{ ok: boolean }`
- **`ai:getInstanceSecrets`** `({ instanceId })` → `{ [field]: value }`
  - 根据实例关联的 Provider schema 取出所有相关字段，并从 keytar/JSON 读出值。
- **`ai:setInstanceSecrets`** `({ instanceId, secrets })` → `{ ok: true }`

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

### 4.5 自动打标签与实例选择

`TaggingService` 额外提供：

- **`ai:autoTagText`** `({ text, maxLabels? })` → `{ success: true; tags: string[] }`
  - 内部会调用 `chooseBestChatInstance()` 自动选择一个最合适的聊天实例（参考 Provider 能力、配置是否齐全、最近更新时间及用户策略）。
  - 使用 `TaggerAgent` + chunking，将长文本切分后进行多段分析，再合并成标签列表。

## 5. 流式对话设计

- ChatService 使用 `AbortController` 管理取消，请求 id 统一使用 `abortId` 或内部生成的 `requestId`。
- `ai:chatStream`：
  - 主进程立即返回 `{ requestId, eventsChannel }`，让渲染进程先订阅事件通道。
  - 随后以异步任务方式启动实际的对话处理。
- Provider/Agent 在生成时通过回调 `emit({ type: 'delta', data: { text } })` 推送 token 片段：
  - ChatService 负责将该事件转发到 `eventsChannel`（例如 `ai:stream:${requestId}`）。
- ChatService 会在合适时机补发：
  - `connected`：表示通道已就绪
  - `metadata`：在有会话持久化时附带 `conversationId`
  - `message_completed`：若 Provider/Agent 未主动发送，则在拿到最终回复后主动补发
  - `done` / `error`：终止信号
- 在带历史持久化的流式对话中，ChatService 会：
  - 在收到请求后写入用户最后一条消息；
  - 在对话结束后写入助手最终消息。

## 6. 服务商扩展（Provider）

适配步骤（以 OpenAI 为例，当前已实现）：

1. 在 `packages/ai/providers/` 新建 `xxx.ts` 并实现 `ProviderAdapter` 接口；
2. 在 `initAIHandlers` 中通过 `registerProvider(new XxxProvider())` 注册；
3. 在 `getConfigSchema()` 中定义 UI 字段（如 `apiKey`、`baseUrl`、`model` 等），渲染端根据 schema 自动生成表单；
4. 在 `chat()` 中调用对应 SDK 的聊天接口（如 `openai.chat.completions.create`），并在开启 `stream` 时按增量回调 `onStream({ type: 'delta', data: { text } })`；
5. 在 `embed()` 中调用 embeddings 接口，返回统一的 `EmbeddingResponse`（包含 `dim` 用于向量检索）。

当前内置 Provider（`initAIHandlers` 中注册）包括：

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
- **listModels**：优先从本地 JSON 中读取模型列表，其次尝试调用远端接口（如 `client.models.list()`），最后根据默认模型给出降级结果。
- **代理/网络**：通过 `baseUrl` 等字段支持自定义网关/代理，必要时可扩展 headers/代理参数。

## 7. 自定义智能体（Agent）

Agent 通过 `handleChat(ctx, req, signal)` 实现自定义对话策略，当前内置：

- **BasicAgent**（`basic.ts`）：
  - 直接将请求转发给对应 Provider 的 `chat`，不做额外处理。
- **RAGAgent**（`rag.ts`）：
  1. 使用当前 Provider 的 `embed()` 对最后一条 user 消息生成向量；
  2. 调用 `searchVectors` 在本地向量库中检索相似文档；
  3. 将检索结果拼装为系统消息（检索上下文），与原始对话消息合并；
  4. 再调用 Provider `chat` 生成答案（支持流式），并在系统提示中引导“优先使用检索上下文”。
- **TaggerAgent**（`tagger.ts`）：
  - 为文本生成主题/标签，通常由 `TaggingService.autoTagText` 驱动；
  - 支持分段输入与 `maxLabels` 控制。

未来可以继续扩展：

- Tools Agent：通过 `ctx.emit(tool_call/tool_result)` 与前端 UI 或主进程工具（如 ffmpeg、文件系统）交互。
- 结构化输出 Agent：在 Provider 支持 JSON/Schema 模式时，结合 zod 等进行输出约束。

## 8. 秘钥与配置存储

- **存储实现**：`settings-store.ts`
  - 首选使用 keytar，将 Provider/实例秘钥存放在系统密钥链中；
  - 当 keytar 不可用时，自动回退到 `userData/data/ai-settings.json`，结构：
    - `providers: Record<providerId, Record<key, value>>`
    - `instances: Record<instanceId, Record<key, value>>`
- **Provider 配置**：
  - 前端通过 `getProviders` 获取 schema，并动态渲染配置表单；
  - 通过 `setProviderSecrets`/`clearProviderSecrets` 读写秘钥。
- **实例配置**：
  - `InstancesStore` 保存实例的基础信息（名称、模型、系统提示词、自定义 config 等）；
  - 实例秘钥则由 `setInstanceSecrets`/`getInstanceSecrets` 管理，并通过 `withInstance()` 合并到请求的 `extras.secrets` 中。

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
- 保持 `ProviderAdapter`/`AgentDefinition`/IPC 形状稳定，可支持后续：
  - 扫描 `node_modules/ai-provider-*`/`ai-agent-*` 进行自动注册；
  - 通过配置文件/插件系统在运行时动态增删 Provider/Agent。

## 11. 实施状态（Milestones）

1. 基础设施（已完成）
   - Provider/Agent Registry、ChatService（流式+取消）、IPC、Preload API、对话设置基础。
2. Provider 接入（已完成第一批）
   - OpenAI（chat+embed）/ Anthropic / Gemini / Ollama / DeepSeek / Qwen / 智谱等。
3. Agent 实现（进行中）
   - BasicAgent、RAGAgent、TaggerAgent 已提供，可继续扩展 Tools/结构化输出等 Agent。
4. 安全与存储（已上线基础方案）
   - keytar + JSON 回退；后续可与 drizzle DB 等更复杂配置系统整合。
5. 观测与用量（规划中）
   - 统一的 tokens 与成本统计，以及在 UI 中展示。
6. 插件化与自动发现（规划中）
   - 抽象 Provider/Agent 插件协议，支持三方扩展。

## 12. 使用说明（Quick Try）

以下示例基于预期的 `window.YUA.ai` 接口（由 Preload 暴露）：

- **流式对话**（带会话历史）：

```ts
const disposer = await window.YUA.ai.chatStream(
  {
    conversationId: undefined, // 首次可省略，后续可复用
    messages: [{ role: 'user', content: 'Hello there' }],
    providerId: 'openai',
    agentId: 'basic',
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

- **使用最佳实例自动打标签**：

```ts
const res = await window.YUA.ai.autoTagText('这是一段需要自动打标签的中文文本', 8);
console.log(res.tags);
```

## 13. 后续工作清单

- [ ] 衔接 UI（Provider/实例/Prompt/会话管理界面）与当前 API，提升可视化管理体验
- [ ] 用量/费用统计与 UI 展示
- [ ] 插件发现与第三方 Provider/Agent 注册规范
- [ ] 更丰富的 Agent 模板（如多工具协同、结构化输出、评审等）

---

如需扩展 Provider/Agent 或调整 IPC 协议，请优先修改本模块的类型定义（`types.ts`）与本设计文档，确保渲染端与主进程统一升级。
