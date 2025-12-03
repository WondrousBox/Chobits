# Chobits AI 模块（主进程）设计说明

更新时间：2025-10-17

本文档系统整理了引入最新 langchain.js 以实现对话、向量嵌入（embeddings）等能力的总体设计，目标是形成一个“可抽离为插件”的、主进程优先的独立模块，满足：

- 支持可扩展的服务商（OpenAI、Anthropic、Gemini、Ollama、本地 Transformers 等）
- 对话逻辑在主进程实现，渲染进程仅通过 IPC 调用
- 支持流式对话返回（token 级增量）
- 支持注册自定义智能体（Agent），可插入工具调用、RAG 等策略
- 统一的 API Key 配置表单与持久化

## 1. 总览与原则

- 分层：Main（核心逻辑/安全/IPC） → Preload（桥接） → Renderer（UI调用，不接触秘钥）
- 可扩展：Provider/Agent 均使用注册表；新增服务商/智能体无需改动核心逻辑
- 可移植：整个 `electron/main/ai` 模块可独立打包为插件（未来迁移到 `packages/chobits-ai`）
- 安全：秘钥仅存于主进程，后续可升级至系统密码库（keytar）
- 流式：统一事件协议，支持取消（Abort）

## 2. 模块结构与目录

Main 侧新增：

- `electron/main/ai/types.ts`：核心类型定义（消息、流事件、Provider/Agent 合约、Embedding 请求/响应、Provider 配置 schema）
- `electron/main/ai/registry.ts`：Provider/Agent 注册表（register/get/list）
- `electron/main/ai/chat-service.ts`：对话服务，负责流式处理、取消、与 IPC 集成
- `electron/main/ai/settings-store.ts`：秘钥配置的简易持久化（userData/ai-settings.json），可替换为 DB+keytar
- `electron/main/ai/providers/*`：各服务商适配器（如：`openai.ts` 等）
- `electron/main/ai/agents/*`：智能体定义（示例：`basic.ts`）
- `electron/main/handlers/ai.ts`：AI 相关 IPC 处理器入口（初始化 Provider/Agent、注册 ChatService、秘钥读写）

Preload：

- `electron/preload/apis/ai.ts`：暴露 `YUA.ai`，包含 getProviders/getAgents/chat/chatStream/embed/cancel 等

Renderer：

- `src/lib/aiClient.ts`：简单客户端封装，便于在组件中调用
- `src/pages/SettingsPage/components/AiSettings.tsx`：统一的 Provider 配置表单（根据 schema 动态渲染）
- `src/pages/SettingsPage/SettingsPage.tsx`：新增 “对话设置” 分类入口

## 3. 关键接口（Contract）

消息与请求：

- ChatMessage：{ id?, role: 'system'|'user'|'assistant'|'tool', content, createdAt?, metadata? }
- ChatRequest：{ conversationId?, messages, agentId?, providerId?, stream?, temperature?, maxTokens?, abortId?, extras? }
- ChatResponse：{ message, usage?, providerId?, agentId?, metadata? }

流式事件（StreamEvent）：

- delta { text?; toolCall? }
- message_completed { message }
- tool_call { name, args, callId }
- tool_result { callId, result }
- metadata { ... }
- error { message, code? }
- done {}

Embedding：

- EmbeddingRequest：{ texts: string[], providerId?, model?, normalize? }
- EmbeddingResponse：{ vectors: number[][], dim, model?, providerId? }

ProviderAdapter（服务商适配器）：

- 基本：id、label、isConfigured()、getConfigSchema()、setSecrets()/getSecrets()
- 能力：chat?(req, onStream?, signal?)、embed?(req)

AgentDefinition（智能体）：

- 基本：id、label、description?、defaultProviderId?
- 行为：handleChat(ctx, req, signal?) → ChatResponse
- ctx：{ window, emit(event), getProvider(id?) }

## 4. IPC 接口与通道

Renderer → Preload → Main：

- `ai:getProviders` → [{ id, label, configured, schema }]
- `ai:getProviderSecrets`({ providerId }) → { [field]: value }
- `ai:setProviderSecrets`({ providerId, secrets }) → { ok: true }
- `ai:getAgents` → [{ id, label, description }]
- `ai:chat`(ChatRequest) → ChatResponse（非流式）
- `ai:chatEphemeral`(ChatRequest) → ChatResponse（非流式、无历史持久化）
- `ai:chatStreamEphemeral`(ChatRequest) → { requestId, eventsChannel }（流式、无历史持久化）
- `ai:chatStream`(ChatRequest) → { requestId, eventsChannel }，随后 main 通过 `eventsChannel` 推送流事件
- `ai:cancel`({ requestId }) → { ok: true }
- `ai:embed`(EmbeddingRequest) → EmbeddingResponse

事件通道：

- `ai:stream:${requestId}`：推送 StreamEvent（见上）

## 5. 流式对话设计

- ChatService 使用 AbortController 管理取消
- `ai:chatStream` 返回 `requestId` 与独占 `eventsChannel`
- Provider/Agent 在生成时通过回调 `emit({ type: 'delta', data: { text } })` 推送 token 片段
- 结束时会发送 `done` 或 `error`

## 6. 服务商扩展（Provider）

适配步骤：

1. 在 `electron/main/ai/providers/` 新建 `openai.ts`（或其他）并实现 `ProviderAdapter`
2. 在 `handlers/ai.ts` 中 `registerProvider(new OpenAIProvider())`
3. `getConfigSchema()` 返回 UI 字段（如 apiKey、baseUrl、model 等），渲染端自动生成表单
4. `chat()` 使用 langchain.js 相应模型；开启流式回调输出 delta
5. `embed()` 使用对应 embeddings 实现；可支持 normalize、dim 对齐

推荐初始适配：

- OpenAI（@langchain/openai）：chat + embeddings
- Anthropic（@langchain/community + 官方 SDK）：chat
- Google Gemini（@google/generative-ai + @langchain/community）：chat (+embeds 可选)
- Ollama（@langchain/community）：chat + embeddings（本地服务）
- 本地 Transformers（@huggingface/transformers 或已有 Xenova 管线）：embeddings（已具备基础能力，可对齐）

## 7. 自定义智能体（Agent）

Agent 通过 `handleChat(ctx, req, signal)` 实现自定义对话策略：

- RAG Agent：
  1. 使用 `ai:embed` 计算查询向量
  2. 调用已有向量检索（`window.YUA.vector.searchVectors` 或 `searchByText`）
  3. 将检索到的文档拼装上下文，调用 Provider.chat 生成答案（支持流式）
- Tools Agent：
  - 通过 ctx.emit(tool_call/tool_result) 与前端 UI 或主进程工具交互（例如 ffmpeg、文件系统）
- 结构化输出 Agent：
  - 在 Provider 支持 JSON/Schema 模式时，约束输出结构（可结合 Zod）

## 8. API Key 配置与 UI

- 存储：当前版使用 `userData/ai-settings.json`（仅主进程可访问）
- 界面：`Settings → 对话设置`，动态渲染各 Provider 的配置 schema 字段
- 升级建议：
  - 使用 drizzle DB 表持久化 Provider 配置（含启用状态、字段等）
  - 秘钥值使用 `keytar` 存入系统凭证库，仅存引用/标识在 DB
  - 引入权限/作用域（workspace 级别）

## 9. LangChain.js 接入与依赖

依赖建议（按需安装）：

- 必备：`@langchain/core`、`@langchain/community`
- OpenAI：`@langchain/openai`
- Google：`@google/generative-ai`
- Anthropic：官方 SDK 或社区适配
- 校验：`zod`（用于配置与结构化输出）

Provider 适配要点：

- chat：采用模型的 streaming 能力，将 token 通过 `emit({ type: 'delta', data: { text } })` 推送
- embed：对齐维度与 normalize 以适配 sqlite-vec 的相似度检索
- 代理/网络：支持 baseURL、自定义 headers、HTTP/SOCKS 代理

## 10. 安全、稳定性与观测

- 安全：秘钥仅在主进程，推荐使用 keytar；避免渲染进程泄露
- 限流/并发：Provider 级并发控制与重试策略（指数退避）
- 超时/取消：统一 AbortController，前端可调用 cancel
- 计费/用量：在 ChatResponse.usage 中统计 tokens/cost，便于 UI 呈现
- 日志：标准化错误码与上下文（providerId/agentId/requestId）

## 11. 抽离为插件的路径

- 保持 `electron/main/ai/*` 接口稳定（ProviderAdapter/AgentDefinition/IPC 形状不变）
- 未来移动至 `packages/chobits-ai`，作为可安装模块；主工程仅引入 handlers/ai.ts 并注册默认 Provider/Agent
- 可支持“插件发现”（扫描 `node_modules/chobits-ai-provider-*` 并自动注册）

## 12. 实施计划（Milestones）

1. 基础设施（已完成）
   - Provider/Agent Registry、ChatService（流式+取消）、IPC、Preload API、对话设置 UI 基础
2. Provider 接入（进行中）
   - OpenAI（chat+embed）→ Anthropic → Gemini → Ollama → 本地 Transformers 对齐
3. Agent 实现
   - BasicAgent（已提供）→ RAG Agent（整合 sqlite-vec）→ Tools Agent（调用主进程工具）
4. 安全与存储升级
   - keytar + drizzle DB
5. 观测与用量
   - 记录 tokens 与成本，UI 显示
6. 抽离与插件化
   - 独立包与插件发现机制

## 13. 使用说明（Quick Try）

- 流式对话（示例）：

```ts
const disposer = await window.YUA.ai.chatStream({ messages: [{ role: 'user', content: 'Hello there' }], providerId: 'openai', agentId: 'basic', stream: true }, (ev) => console.log('stream:', ev));
// 取消
await disposer.cancel();
// 取消订阅
disposer.dispose();
```

- 获取并保存 Provider 配置：

```ts
const providers = await window.YUA.ai.getProviders();
const openai = providers.find((p) => p.id === 'openai');
if (openai) {
  await window.YUA.ai.setProviderSecrets('openai', { apiKey: 'sk-...' });
}
```

## 14. 后续工作清单

- [ ] OpenAI Provider（langchain）与 Embeddings 适配
- [ ] RAG Agent：与 `window.YUA.vector` 打通，支持资料引用
- [ ] keytar + drizzle：安全存储秘钥
- [ ] 代理/网络设置统一入口
- [ ] 用量/费用统计与 UI 展示
- [ ] 插件发现与第三方 Provider/Agent 注册规范

---

如需扩展 Provider/Agent 或调整 IPC 协议，请优先修改本模块的类型定义与文档，确保渲染端与主进程统一升级。
