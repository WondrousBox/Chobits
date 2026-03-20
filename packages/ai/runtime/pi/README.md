# Pi Runtime

更新时间：2026-03-17

`packages/ai/runtime/pi` 是当前 AI 运行时的 Pi 落地区。当前目录已经不是迁移试验场，而是实际参与主链路的运行时模块集合。

## 目录职责

### 会话与执行入口

- `session-service.ts`
  - 流式聊天、非流式聊天、会话级执行入口
- `execution-service.ts`
  - one-shot / workflow / tool / background task 的统一执行入口
- `session-factory.ts`
  - 创建 `pi-coding-agent` session
- `stream-adapter.ts`
  - 把 Pi 事件映射为现有 UI 可消费的事件格式

### Provider / Preset / Model 解析

- `model-resolver.ts`
  - 合并 provider secrets、preset secrets、默认模型、系统提示词等信息
- `provider-model.ts`
  - 把解析结果映射成 Pi 模型对象
- `runtime-switch.ts`
  - 管理 runtime 选择约定

### One-shot 任务

- `task-chat.ts`
  - 后台任务共用的 task chat runtime
- `tasks/title.ts`
  - 标题生成任务
- `tasks/tag.ts`
  - 标签抽取任务

### 工具系统

- `tool-context.ts`
  - session-scoped 工具上下文
- `tool-registry.ts`
  - 工具元数据与状态
- `tools/*`
  - Pi custom tool 实现

### 对外类型

- `contracts.ts`
  - Pi runtime 内部共享类型
- `index.ts`
  - Pi runtime 的公开 barrel export

## 当前调用链路

### 聊天

- `packages/ai/chat-service.ts`
  - 负责主聊天请求调度
- `packages/ai/runtime/pi/session-service.ts`
  - 执行流式/非流式 Pi 会话
- `packages/ai/runtime/pi/model-resolver.ts`
  - 解析 provider + preset + model

### 后台任务 / One-shot

- `packages/ai/ipc-handler-helpers.ts`
  - 组织翻译、总结、脑图等后台任务
- `packages/ai/runtime/pi/task-chat.ts`
  - 提供 task 侧 `chatFn`
- `packages/ai/runtime/pi/execution-service.ts`
  - 提供通用文本、嵌入、转录、图片生成入口

### Workflow

- `packages/workflow/nodes/ai-workflow-utils.ts`
  - workflow 统一通过 preset-first helper 构造请求
- `packages/ai/runtime/pi/execution-service.ts`
  - workflow 文本与图片相关执行复用统一 runtime

## Canonical 语义

### Provider

Provider 相关读取统一来自 `packages/ai/providers/service.ts`：

- schema
- capabilities
- default models
- alias/canonical id
- builtin/runtime model 列表

### Preset

Preset 是当前唯一的服务级配置复用单元：

- 请求字段统一使用 `providerPresetId`
- preset 业务读取统一使用 `preset-service.ts`
- `presets-store.ts` 仅保留为底层存储层
- preset secrets 底层存储统一使用 `preset-secrets-store.ts`
- preset 记录以 `overrides` 为主字段
- `config` 只在 preset CRUD 边界保留兼容 alias

### Renderer / Workflow

Renderer 和 workflow 的主链路都应直接复用统一 surface：

- `useProvidersPresets()`
- `ProviderModelSelect`
- `ChatSelectionContext`
- `normalizeProviderPreset()`
- `resolveProviderPresetId()`

## 开发约定

1. 新增 provider 能力时，不要在 Pi runtime 里重复维护 metadata，统一回到 `ProviderDefinition` / `ProviderService`。
2. 新增后台任务时，优先复用 `PiExecutionService` 或 `task-chat.ts`。
3. 新增工具时，优先放到 `tools/*`，并在 `tool-registry.ts` / `tools/index.ts` 接线。
4. 新增页面级 provider/model 选择时，直接接 `ProviderModelSelect`，并在发送前解析隐藏 preset，不要再额外包一层命名兼容。

## 当前状态总结

- Pi runtime 已经承担主聊天、one-shot、workflow、工具运行时的核心职责。
- AI 主链路已经完成 preset-first 收口。
- provider metadata / preset / runtime 三条链路已经统一到 definition/service + preset 语义。
