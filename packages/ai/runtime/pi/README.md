# Pi Runtime

更新时间：2026-04-02

`packages/ai/runtime/pi` 是当前 Chobits AI 运行时里负责 Pi 接入的主目录。它不再只是实验代码，而是已经参与真实聊天、任务执行、工具调用和 coder session 的正式模块。
当前聊天 UI 只暴露 3 个用户可选模式：`chat`（对话模式）、`assistant`（Agent模式）和 `coder`（代码模式）。

## 目录职责

### 会话与执行入口

- `session-service.ts`
  - 负责流式聊天、非流式聊天、coding session 调度，以及 Pi 事件到现有聊天输出格式的收口。
- `execution-service.ts`
  - 负责 one-shot / workflow / background task 复用的统一执行入口。
- `session-factory.ts`
  - 创建 `pi-coding-agent` session，并根据请求上下文决定 session 的 `cwd`。
- `stream-adapter.ts`
  - 把 Pi 运行时事件映射成现有 UI 可消费的 stream 事件。

### Provider / Preset / Model 解析

- `model-resolver.ts`
  - 合并 provider secrets、preset secrets、默认模型，并解析 Pi request 的运行时上下文。
- `provider-model.ts`
  - 把解析结果映射成 Pi model 对象。
- `runtime-switch.ts`
  - 管理 legacy runtime 和 Pi runtime 的切换约定。

### One-shot 任务

- `task-chat.ts`
  - 后台任务共用的 task chat runtime。
- `tasks/title.ts`
  - 会话标题生成。
- `tasks/tag.ts`
  - 标签提取。

### 工具系统

- `tool-context.ts`
  - 生成 session-scoped tool context；现在除了 conversation/window 信息，也包含 `coding` workspace 信息。
- `tool-registry.ts`
  - 维护 tool metadata、tool id 归一化，以及不同 profile 的默认工具集合（`DEFAULT_SESSION_TOOL_IDS` / `DEFAULT_CODER_TOOL_IDS`）。
- `toolbox.md` + `toolbox.ts`
  - 工具技能说明的 Markdown 真相源；`toolboxLookupTool` 按需检索。编辑 `toolbox.md` 即可调整说明（Vite `?raw` 打包进主进程）。
- `tools/*`
  - Pi custom tools 的实际实现入口。

### Profile（聊天模式）

- `profiles.md` + `profile-markdown.ts` + `profile-descriptors.ts`
  - 与 `toolbox.md` 相同思路：**改 Markdown 即可调整**各 profile 的 `label` / `description` / `executionMode` / `supportsToolCalls` / `defaultToolIds`（可用 `@session`、`@coder`）以及完整系统提示。
  - 每个 profile 以 `## profile:<id>` 分段，正文在 `### system prompt` 之下（instructions 内可自由使用 `##` 小标题，避免与 profile 边界冲突）。
- `profile-registry.ts`
  - 对外暴露 UI 可选的 agent/profile 列表，内部读 `profile-descriptors`。

### Coding Workspace 服务

- `coding/path-policy.ts`
  - 负责 workspace root 校验、路径归一化、`..` 越界拦截和 symlink 逃逸检查。
- `coding/file-service.ts`
  - 负责 workspace 内的目录列举、文本读取、文本写入和精确替换编辑。
- `coding/search-service.ts`
  - 负责 workspace 内的 glob / grep 搜索，并跳过隐藏目录、二进制文件和大目录。
- `coding/shell-service.ts`
  - 负责受限 shell 执行；当前只开放 `git`、`tsc`、`vitest` 的安全子集，用于验证而不是环境变更。

### 对外类型

- `contracts.ts`
  - 定义 Pi runtime 共享类型，包括 `ResolvedPiRequest`、`PiCodingWorkspaceContext`、tool descriptor 等。
- `index.ts`
  - Pi runtime barrel export。

## 当前聊天链路

### 标准聊天

- `packages/ai/chat-service.ts`
  - 主聊天请求分发入口。
- `packages/ai/runtime/pi/session-service.ts`
  - 负责 Pi runtime 的流式/非流式执行。
- `packages/ai/runtime/pi/model-resolver.ts`
  - 解析 provider + preset + model + runtime extras。

### Coder 聊天

- `src/pages/ChatPage/context/ChatSelectionContext.tsx`
  - 持久化 agent、provider、model，以及当前选中的 coder workspace。
- `src/components/chat/ChatInputWithService.tsx`
  - 在 `coder` 模式下提供“选择项目”入口，并把 `extras.codingWorkspaceRoot` / `extras.codingWorkspaceLabel` 带入请求。
- `src/pages/ChatPage/ChatPage.tsx`
  - 真实聊天页面入口；会把 coder workspace 一起传给 `chatStream`。
- `src/pages/ResourcePage/components/AIChatSidebar.tsx`
  - 资源页侧边栏也支持 `coder` 模式下选择项目目录，并把 workspace extras 一起传给 `chatStream`。
- `packages/ai/runtime/pi/profiles.md`
  - 定义 `chat` / `assistant` / `coder` 等 profile 的系统提示与元数据（构建时由 `profile-descriptors.ts` 经 `?raw` 加载）。
- `packages/ai/runtime/pi/session-service.ts`
  - 当 `coder` 缺少 workspace 时，直接返回明确提示，不会隐式回退到 `process.cwd()`。
- `packages/ai/runtime/pi/session-factory.ts`
  - 使用 `resolved.coding.rootPath` 作为 session `cwd`，让 Pi coding session 真的运行在用户选中的仓库里。

## Coding Tool 集合

当前 `coder` profile 默认启用这些 Pi custom tools：

- `file-list`
  - 列出 workspace 内文件和目录。
- `file-read`
  - 读取文本文件，可按行截取。
- `file-glob`
  - 按 glob 查找文件或目录。
- `file-grep`
  - 按内容搜索文本文件。
- `file-write`
  - 在 workspace 内创建或覆盖文本文件。
- `file-edit`
  - 通过精确字符串替换做小范围编辑。
- `shell-exec`
  - 执行受限验证命令。

这些工具都通过 `tools/index.ts` 注册，通过 `tool-registry.ts` 暴露 metadata，并在 Pi session 内直接调用主进程 service，而不是走 renderer IPC。

## 安全边界

当前 coder 能力采用保守的 P0 安全边界：

- 所有文件和搜索操作都必须位于用户选择的 workspace 内。
- 通过 `realpath` 和最近存在路径检查，阻止 symlink 跳出 workspace。
- 文件工具只处理 UTF-8 文本内容；二进制文件会被拒绝。
- 搜索会默认跳过 `.git`、`node_modules`、`dist`、`dist-electron`、`coverage`、`out` 等大目录。
- `shell-exec` 不提供任意 shell，只允许受控命令和参数子集。
- `git` 仅允许只读查看类子命令：`branch`、`diff`、`log`、`rev-parse`、`show`、`status`。
- `tsc` 会强制补 `--noEmit`，禁止 watch/build/init/output 相关参数。
- `vitest` 会强制走 `run`，禁止 watch/ui/browser/update/coverage 等交互或高风险参数。

## 开发约定

1. 新增 Pi custom tool 时，优先放进 `tools/*`，并同步更新 `tool-registry.ts` 与 `tools/index.ts`，必要时在 `toolbox.md` 增加技能章节。
2. 调整聊天模式文案、工具策略或系统提示时，优先编辑 `profiles.md`，无需在 TS 里堆长字符串。
3. 新增 coder 相关能力时，优先复用 `coding/*` service，而不是在 renderer 侧新造一层 IPC 封装给 agent 用。
4. 如果运行时上下文需要被 session、tool、UI 同时感知，优先进入 `ResolvedPiRequest` 和 `PiSessionToolContext`，不要散落在局部变量里。
5. `coder` profile 的能力必须保持 workspace-aware；不要再回到默认 `process.cwd()` 推断模式。

## 当前状态总结

- Pi runtime 已承担主聊天、one-shot、workflow 和 tool execution 的核心职责。
- `coder` profile 已经接入真实 Chat UI，而不是停留在独立 demo 组件。
- 用户现在可以在聊天页和资源页 AI 侧边栏中选择一个项目目录，并在该 workspace 内完成读、搜、写、精确编辑和受限验证命令执行。
- 新增的 coding 服务已经有针对路径越界、文本编辑、搜索过滤和受限 shell 的单测保护。
