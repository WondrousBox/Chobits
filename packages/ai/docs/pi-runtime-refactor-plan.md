# Pi Runtime Refactor Plan

更新时间：2026-03-18

本文档保留原文件名，当前用途已经从“分波次迁移计划”切换为“最终收口说明”。
Pi runtime 的主链路改造已经完成，后续继续演进时请直接以这里的当前状态为准，而不是再按旧的 Wave 历史记录理解实现。

## 完成情况评估

以本文档描述的重构目标来看，当前可以判定为“架构收口已完成”：

- Pi runtime 已经成为 AI 主运行时，而不是旁路实验分支
- provider 读取已经统一收口到 `ProviderDefinition` / `ProviderService`
- preset 语义已经统一收口到 `providerPresetId` + preset-first surface
- 旧的 instance-era API、metadata shim、runtime alias shim、旧 model-provider 目录都已退出 AI 主链路

需要额外说明的是：

- 当前剩余的 TypeScript 阻塞，已经不再是本文档所描述的 Pi runtime / provider / preset 架构问题
- 更大范围 `tsc` 仍会被非 AI 文件阻塞，当前已知主要包括：
  - `electron/main/db/index.ts`
  - `electron/main/handlers/resource/index.ts`

因此，本文档现在应被理解为：

- Pi runtime 重构目标：已完成
- AI 主链路统一收口：已完成
- 仓库级别类型清零：未包含在本文档目标内，仍需单独继续清理

## 当前结论

- Pi runtime 已经成为 AI 主运行时的一部分：
  - 流式聊天走 `packages/ai/runtime/pi/session-service.ts`
  - one-shot / task / workflow 执行走 `packages/ai/runtime/pi/execution-service.ts`
  - 标题生成、打标、翻译、总结、脑图等后台任务已经接到统一执行面
- Provider 读取已经统一收口到 `packages/ai/providers/service.ts`
  - provider schema
  - capability
  - default models
  - alias/canonical id
  - builtin/runtime model 列表
- 预设语义已经统一收口：
  - 请求侧统一使用 `providerPresetId`
  - 选择器/UI/IPC/Workflow/运行时内部都以 preset 为主语义
  - 预设存储以 `overrides` 为主，`config` 只保留 preset CRUD 边界上的兼容 alias
- AI 模块公开面已经不再暴露旧的 instance-era API、hook、组件命名。

## 当前架构

### 1. 请求标准化与 Provider/Preset 解析

- `packages/ai/provider-preset.ts`
  - 提供 `resolveProviderPresetId()` 与 `normalizeProviderPreset()`
  - 负责把请求对象归一成 canonical preset 语义
- `packages/ai/runtime/pi/model-resolver.ts`
  - 根据 provider、preset、provider secrets、preset secrets、默认模型，解析出当前执行所需模型配置
- `packages/ai/runtime/pi/provider-model.ts`
  - 把解析后的模型配置映射成 `pi-ai` / `pi-coding-agent` 使用的模型对象
- `packages/ai/providers/service.ts`
  - 是 provider metadata / schema / model capability 的唯一读取入口

### 2. 会话运行时

- `packages/ai/runtime/pi/session-service.ts`
  - 承担流式聊天、非流式聊天、会话级执行
- `packages/ai/runtime/pi/session-factory.ts`
  - 创建 `pi-coding-agent` session
- `packages/ai/runtime/pi/stream-adapter.ts`
  - 将 Pi 事件映射到当前 UI 可消费的流式事件格式
- `packages/ai/chat-service.ts`
  - 主聊天入口，负责会话持久化、自动标题、取消控制与 runtime 调度

### 3. One-shot 与后台任务运行时

- `packages/ai/runtime/pi/execution-service.ts`
  - 统一提供：
    - `chatEphemeral()`
    - `streamText()`
    - `embed()`
    - `transcribe()`
    - `generateImage()`
- `packages/ai/runtime/pi/task-chat.ts`
  - 为翻译/总结/脑图等后台任务提供 task chat runtime
- `packages/ai/runtime/pi/tasks/title.ts`
  - 会话标题生成
- `packages/ai/runtime/pi/tasks/tag.ts`
  - 标签抽取
- `packages/ai/ipc-handler-helpers.ts`
  - 负责把后台任务类请求接到统一 execution/task runtime

### 4. 工具运行时

- `packages/ai/runtime/pi/tool-context.ts`
  - 提供 session-scoped 的工具执行上下文
- `packages/ai/runtime/pi/tool-registry.ts`
  - 管理工具元数据与状态
- `packages/ai/runtime/pi/tools/*`
  - 当前已迁入 Pi custom tool 的工具包括：
    - 资源查询
    - 字幕读取
    - 卡片推送
    - 翻译
    - 总结
    - YouTube 下载/订阅

### 5. Workflow 与 Renderer 接线

- `packages/workflow/nodes/ai-workflow-utils.ts`
  - workflow 统一通过 preset-first helper 构造 request
  - 动态配置、模型列表、provider context 读取都已经接到 canonical preset 语义
- `src/pages/ChatPage/hooks/useProvidersPresets.ts`
  - 聊天页共享 provider/preset hook
- `src/pages/ChatPage/components/ServicePresetSelect.tsx`
  - 聊天页 canonical preset 选择器
- `src/pages/ChatPage/context/ChatSelectionContext.tsx`
  - 页面级聊天选择状态已经统一围绕 provider + preset + agent 建模
- `src/pages/ResourcePage/components/AIChatSidebar.tsx`
  - 资源页聊天入口已经直接消费 preset 语义

## 统一约定

### Provider 读取

所有 provider 元数据都应从以下入口读取：

- `listProviderDefinitions()`
- `getProviderDefinition()`
- `getProviderCapabilities()`
- `getProviderDefinitionSchema()`
- `listProviderRuntimeModels()`

不要再直接依赖旧 metadata、旧 resource JSON、旧 provider/model 历史形态；相关 provider/model 定义已经完全并入 `providers/*`。

### Preset 读取与存储

- 业务侧统一通过 `preset-service.ts` 读取 preset
- `presets-store.ts` 只保留底层存储职责
- preset secrets 底层统一收口到 `preset-secrets-store.ts`
- preset 记录主语义字段：
  - `providerId`
  - `name`
  - `model`
  - `systemPrompt`
  - `enabledTools`
  - `overrides`
- `config` 仅作为 preset CRUD 的兼容 alias 保留，不再作为新代码主字段

### 请求字段

所有 AI 请求统一使用：

- `providerId`
- `providerPresetId`

新代码不应再引入第二套 preset 选择字段名，也不应在业务层手写 provider/preset 双轨判断。

## 当前已完成的收口结果

- runtime 主链路已经只认 preset 语义
- workflow 主链路已经只认 preset 语义
- renderer 公开 AI API 已只保留 preset 语义
- 聊天页与资源页的选择器、状态、窗口 payload 已收口到 preset 语义
- conversation surface 也已经对齐到 preset 命名
- provider metadata / model / schema 的读取已经收口到 definition/service
- 历史 metadata shim、resource JSON、runtime alias shim、旧 model-provider 目录均已退出主链路

## 继续演进时的建议

1. 如果新增 provider 能力，优先放在 `ProviderDefinition` + `ProviderService` 体系里补齐描述，再决定是否需要特殊 runtime adapter。
2. 如果新增 one-shot/task 类型，优先接入 `PiExecutionService` 或 `task-chat.ts`，避免重新散落出独立执行面。
3. 如果新增聊天页/资源页入口，统一复用 `useProvidersPresets()`、`ServicePresetSelect` 和 canonical AI request 类型。
4. `packages/ai/presets-store.ts` 现在已经进一步收成 storage helper，`deletePreset` 也会同步清理 preset secrets；后续若继续清理，重点将转向更小的 public surface 与类型面。
