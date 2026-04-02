# Coding Agent 实施计划（按当前仓库可执行版）

> 版本: 2.0  
> 创建日期: 2026-03-20  
> 更新日期: 2026-03-21  
> 状态: P0 核心链路已完成，进入收尾与增强阶段

## 0. 当前进度快照

- 已完成
  - `coder` profile 已接入真实聊天链路
  - 主聊天页与资源页 AI 侧边栏都支持选择 coding workspace
  - workspace-aware `file-read` / `file-list` / `file-glob` / `file-grep` / `file-write` / `file-edit` / `shell-exec` 已实现并注册到 Pi runtime
  - `coder` 缺少 workspace 时会直接返回固定提示，不再误回退到 `process.cwd()`
  - `packages/ai/runtime/pi/coding/*` service 已落地
  - `packages/ai/runtime/pi/README.md`、`packages/ai/ai-module-design.md`、根级 `AGENTS.md` 已同步更新
  - 已补定向测试：
    - `test/coding-agent.spec.ts`
    - `test/pi-coding-services.spec.ts`
    - `test/pi-model-resolver.spec.ts`
    - `test/pi-session-service.spec.ts`
- 部分完成
  - `packages/ai/types.ts` 已补 `codingWorkspaceRoot` / `codingWorkspaceLabel` / `codingMode` 类型约定，但其他 extras 仍保持宽松扩展
  - `Phase 4` 的聊天体验已基本可用，但最近项目、更细的 tool result 文案、系统化手工验收还没做完
- 尚未完成
  - 计划中的更宽 shell 命令集（当前实现保守限制为 `git` / `tsc` / `vitest` 的安全子集）
  - `Phase 5` 高阶能力（patch/delete/diff/rollback/Monaco/Git helper/LSP 等）

## 1. 目标

在 **现有 Chobits + Pi Runtime 架构** 上，增加一套可实际落地的 Coding Agent 能力，让应用具备接近 OpenClaw / Claude Code 的以下能力：

- 选择一个代码项目根目录作为当前工作区
- 读取、列目录、搜索代码
- 在工作区内编辑文本文件
- 执行受限的验证命令
- 通过现有聊天界面完成多轮代码修改

本计划的重点不是“做一个新的 IDE 页面”，而是先让 **现有聊天链路** 真正具备代码编辑能力。

---

## 2. 先对齐当前仓库现实

在开始实现前，必须先接受当前仓库的真实结构，而不是沿用通用 coding agent 的想象模型。

### 2.1 当前已经存在的基础

- `packages/ai/runtime/pi/session-service.ts`
  - 已经负责 Pi 聊天、stream、coding session 调度
- `packages/ai/runtime/pi/session-factory.ts`
  - 已经创建 `pi-coding-agent` session
- `packages/ai/runtime/pi/tools/index.ts`
  - 已经是 **真正的 custom tool 工厂注册点**
- `packages/ai/runtime/pi/tool-registry.ts`
  - 当前主要负责 **tool metadata / tool id 归一化**
- `packages/ai/runtime/pi/profiles.md` + `profile-markdown.ts` + `profile-descriptors.ts`
  - profile 定义入口：Markdown 真相源 + 解析 + `?raw` 加载导出
- `src/pages/ChatPage/components/ChatInputBar.tsx`
  - 已经提供 agent 选择入口
- `src/pages/ChatPage/context/ChatSelectionContext.tsx`
  - 已经持久化 provider / model / preset / agent 选择

### 2.2 当前旧计划里不成立的假设

- **Pi custom tools 不是在 renderer 执行的**
  - 它们在主进程 session 内执行
  - 所以不应该把文件编辑工具设计成依赖 `window.YUA` 的 renderer 调用链
- **`tool-registry.ts` 不是唯一接线点**
  - 真正让工具能跑起来的入口是 `packages/ai/runtime/pi/tools/index.ts`
- **当前没有可用的 coding workspace 上下文**
  - `PiSessionToolContext` 里还没有 `workspaceRoot` / `projectRoot`
  - `session-factory.ts` 目前直接把 `cwd` 固定为 `process.cwd()`
- **当前 `electron/main/handlers/file/ipc-main.ts` 的文件 IPC 更偏向 UI 文件选择/预览**
  - 它不是为 agent 内部文件操作设计的 service 层

### 2.3 结论

因此，本方案必须改成：

- **主进程 service-first**
- **project root 一等公民**
- **tool 直接调用主进程 service**
- **聊天 UI 只负责选择项目和展示 tool 执行结果**

而不是：

- 先做 preload bridge
- 先做 renderer 内的“Coder API”
- 先做 Monaco / 文件树页面

---

## 3. P0 范围与非目标

## 3.1 P0 必须完成

- 新增 `coder` profile
- 让用户为 `coder` profile 选择一个代码项目根目录
- 在该根目录内支持：
  - `file-read`
  - `file-list`
  - `file-glob`
  - `file-grep`
  - `file-write`
  - `file-edit`
  - `shell-exec`（受限）
- 复用现有聊天 stream 展示 tool call / tool result
- 保证路径安全、文本文件安全、命令安全

## 3.2 P0 明确不做

- 不做新的 preload `shell.ts`
- 不做新的 renderer 内部“文件操作 IPC 桥”供 agent 使用
- 不做 Monaco 编辑器
- 不做独立 Coder 页面
- 不做 `file-delete`
- 不做 `file-patch`
- 不做 `MultiEdit`
- 不做 Git 写操作
- 不做包安装/网络下载类命令
- 不做人工审批 UI

说明：当前仓库还没有成熟的“agent 操作审批”交互，所以 P0 必须先用 **保守能力集** 落地，而不是一上来开放删除、patch、commit、install。

---

## 4. 总体架构

### 4.1 目标链路

```text
Chat UI
  -> ChatSelectionContext / ChatInputBar
  -> ChatRequest.extras.codingWorkspaceRoot
  -> model-resolver.ts 解析 coding context
  -> tool-context.ts 注入 PiSessionToolContext.coding
  -> session-factory.ts 使用 coding root 作为 cwd
  -> tools/* 调用 coding service
  -> stream tool_call / tool_result
  -> 现有聊天 UI 展示结果
```

### 4.2 关键原则

1. **工具在主进程执行**
   - 工具直接调用 Node.js / repo / service
   - 不依赖 renderer `window.YUA`

2. **项目根目录必须显式传入**
   - 通过 `ChatRequest.extras` 进入 runtime
   - 不依赖 `process.cwd()` 猜测

3. **内部工具优先走 service，不走 IPC**
   - IPC 留给 UI
   - agent 内部逻辑直接调用主进程代码

4. **先做可运行最小闭环，再做可视化**
   - 先聊天 + tool
   - 后文件树 / 代码预览 / diff / editor

---

## 5. 数据模型与上下文

## 5.1 请求侧新增字段

在 `packages/ai/types.ts` 的 `ChatRequest.extras` 约定中新增以下字段：

```ts
type CodingExtras = {
  codingWorkspaceRoot?: string;
  codingWorkspaceLabel?: string;
  codingMode?: 'safe';
};
```

说明：

- `codingWorkspaceRoot`
  - 当前代码项目根目录，绝对路径
- `codingWorkspaceLabel`
  - UI 展示名，可选
- `codingMode`
  - P0 固定为 `safe`

## 5.2 runtime 解析后的上下文

在 `packages/ai/runtime/pi/contracts.ts` 中新增：

```ts
export interface PiCodingWorkspaceContext {
  rootPath: string;
  label?: string;
  mode: 'safe';
  source: 'manual';
}
```

并在 `ResolvedPiRequest` 中新增：

```ts
coding?: PiCodingWorkspaceContext;
```

## 5.3 Session Tool Context 扩展

在 `packages/ai/runtime/pi/tool-context.ts` 中扩展：

```ts
export interface PiSessionToolContext {
  ...
  coding?: PiCodingWorkspaceContext;
}
```

## 5.4 session cwd 规则

在 `packages/ai/runtime/pi/session-factory.ts` 中：

- 若 `resolved.coding?.rootPath` 存在，则将 session `cwd` 设为该目录
- 否则保持当前行为

但对于 `coder` profile：

- 若没有 `codingWorkspaceRoot`，则 **不要假装可以正常工作**
- 应返回清晰提示，要求用户先选择项目目录

---

## 6. 目录与文件规划

### 6.1 新增目录

```text
packages/ai/runtime/pi/
├── coding/
│   ├── path-policy.ts
│   ├── file-service.ts
│   ├── search-service.ts
│   └── shell-service.ts
└── tools/
    ├── file-read.ts
    ├── file-list.ts
    ├── file-glob.ts
    ├── file-grep.ts
    ├── file-write.ts
    ├── file-edit.ts
    └── shell-exec.ts
```

### 6.2 修改文件

- `packages/ai/types.ts`
  - 补充 `ChatRequest.extras` 的 coding 字段约定
- `packages/ai/runtime/pi/contracts.ts`
  - 增加 coding context 类型
- `packages/ai/runtime/pi/model-resolver.ts`
  - 解析 `codingWorkspaceRoot`
- `packages/ai/runtime/pi/tool-context.ts`
  - 注入 `coding` 上下文
- `packages/ai/runtime/pi/session-factory.ts`
  - 用 coding root 作为 session cwd
- `packages/ai/runtime/pi/tool-registry.ts`
  - 增加新工具 metadata
- `packages/ai/runtime/pi/tools/index.ts`
  - 注册真实 tool factory
- `packages/ai/runtime/pi/profiles.md`（及 `profile-descriptors.ts` 加载链）
  - 新增 `coder` profile 节
- `src/pages/ChatPage/context/ChatSelectionContext.tsx`
  - 增加 coding workspace 选择状态
- `src/pages/ChatPage/components/ChatInputBar.tsx`
  - 增加“选择项目目录”入口
- `src/pages/ResourcePage/components/AIChatSidebar.tsx`
  - 后续可选同步支持

### 6.3 依赖说明

- `fast-glob` 当前只在 lockfile 中以传递依赖出现
- 如果 `coding/file-service.ts` 或 `coding/search-service.ts` 要显式 `import 'fast-glob'`
  - 应把它加为 **直接依赖**

---

## 7. service 层设计

## 7.1 path-policy.ts

职责：

- 解析并归一化 root path
- 判断目标路径是否在 root 内
- 区分可读 / 可写
- 拦截敏感文件与目录
- 识别明显二进制文件

建议导出：

```ts
resolveCodingRoot(rootPath: string): Promise<string>
resolvePathInsideRoot(rootPath: string, inputPath: string): Promise<string>
assertReadablePath(rootPath: string, inputPath: string): Promise<string>
assertWritablePath(rootPath: string, inputPath: string): Promise<string>
isProtectedPath(relativePath: string): boolean
isBinaryFileCandidate(filePath: string, sample?: Buffer): boolean
```

P0 默认保护项：

- `.git/`
- `node_modules/`
- `.env`
- `.env.*`
- `*.key`
- `*.pem`
- `*.p12`
- `*.crt`
- `*.cer`
- `*.secrets*`
- `dist/`
- `dist-electron/`

说明：

- `dist` / `dist-electron` 默认禁止写入，防止 agent 误改构建产物
- `.gitignore`、`README.md` 可读
- `.git/` 完全禁止

## 7.2 file-service.ts

职责：

- 读取文本文件
- 列目录
- 写入文本文件
- 文本替换编辑

建议导出：

```ts
readTextFile(...)
listProjectTree(...)
writeTextFileAtomic(...)
replaceInFile(...)
```

实现要求：

- 只处理文本文件
- 写入时保留原行尾风格
- 使用原子写入
- 限制最大文件大小

## 7.3 search-service.ts

职责：

- 文件名匹配
- 内容搜索

策略：

- `file-grep` 优先调用 `rg`
- 如果系统没有 `rg`，则 fallback 到 Node.js 实现
- `file-glob` 可直接用 `fast-glob`

建议导出：

```ts
globFiles(...)
grepFiles(...)
```

## 7.4 shell-service.ts

职责：

- 运行受限的非交互命令

要求：

- 使用 `spawn`
- `shell: false`
- `command` 与 `args` 分开传递
- 限制 cwd 在 coding root 内
- 限制输出、超时、并发

建议导出：

```ts
runCodingCommand(...)
isCommandAllowed(...)
```

---

## 8. Tool 设计

所有新工具都应：

- 使用 `@mariozechner/pi-coding-agent` 的 `ToolDefinition`
- 复用 `tools/result.ts` 中的 `createJsonToolResult`
- 通过 `PiSessionToolContext.coding` 访问工作区

### 8.1 P0 工具列表

| Tool ID | Pi Tool Name | 用途 | P0 |
|---------|--------------|------|----|
| `file-read` | `fileReadTool` | 读取文件 | 是 |
| `file-list` | `fileListTool` | 列目录 | 是 |
| `file-glob` | `fileGlobTool` | 文件名搜索 | 是 |
| `file-grep` | `fileGrepTool` | 内容搜索 | 是 |
| `file-write` | `fileWriteTool` | 覆盖写文件 | 是 |
| `file-edit` | `fileEditTool` | 精确字符串替换 | 是 |
| `shell-exec` | `shellExecTool` | 执行受限命令 | 是 |

### 8.2 延后工具

| Tool ID | 原因 | 目标阶段 |
|---------|------|----------|
| `file-delete` | 风险高，缺少审批 UI | P2 |
| `file-patch` | 需要 diff 预览/失败回滚 | P2 |
| `multi-edit` | 需要更复杂的冲突与回滚策略 | P2 |
| `git-*` | 涉及写操作与审批 | P2 |

### 8.3 工具参数建议

#### `file-read`

```ts
{
  path: string;
  startLine?: number;
  endLine?: number;
}
```

#### `file-list`

```ts
{
  path?: string;
  maxDepth?: number;
  maxEntries?: number;
}
```

#### `file-glob`

```ts
{
  pattern: string;
  path?: string;
  maxResults?: number;
}
```

#### `file-grep`

```ts
{
  pattern: string;
  path?: string;
  include?: string;
  ignoreCase?: boolean;
  maxResults?: number;
}
```

#### `file-write`

```ts
{
  path: string;
  content: string;
  createIfMissing?: boolean;
}
```

#### `file-edit`

```ts
{
  path: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
}
```

#### `shell-exec`

```ts
{
  command: string;
  args?: string[];
  cwd?: string;
  timeoutMs?: number;
}
```

说明：

- P0 不允许传入完整 shell 字符串
- 必须走 `command + args`
- 这样可以避免 shell 注入和复杂解析

---

## 9. Profile 设计

在 `packages/ai/runtime/pi/profiles.md` 中新增 `## profile:coder` 节（由现有加载链解析）：

- `coder`

### 9.1 `coder` profile 的行为

- 默认启用 P0 coding tools
- 指导模型先搜索、再读取、再编辑、最后验证
- 若没有 `codingWorkspaceRoot`
  - 明确要求用户先选择项目目录
- 若用户要求危险操作
  - 说明当前模式不支持

### 9.2 `coder` profile 默认工具

```ts
[
  'file-read',
  'file-list',
  'file-glob',
  'file-grep',
  'file-write',
  'file-edit',
  'shell-exec'
]
```

### 9.3 不再默认绑定

- `push-card`
- `query-resources`
- `read-subtitle`
- `translate-subtitles`
- `summarize-content`
- `youtube-download`
- `youtube-subscribe`

说明：

`coder` 应是一个清晰的代码工作 profile，而不是现有 assistant 工具集的叠加版。

---

## 10. UI 接入方案

## 10.1 聊天主入口

基于现有：

- `src/pages/ChatPage/context/ChatSelectionContext.tsx`
- `src/pages/ChatPage/components/ChatInputBar.tsx`

增加：

- `codingWorkspaceRoot`
- `codingWorkspaceLabel`
- `setCodingWorkspaceRoot(...)`

### 10.2 选择项目目录的交互

P0 交互尽量简单：

- 当 agent 选择为 `coder` 时
  - 显示一个“选择项目”按钮
- 点击后复用现有 `window.YUA.file['file:pickDir']()`
- 选中后将绝对路径保存到 localStorage
- 发送消息时把该路径放进 `ChatRequest.extras.codingWorkspaceRoot`

### 10.3 暂不新增页面

P0 不新增：

- `src/pages/Coder.tsx`
- 独立文件树页面
- Monaco 编辑器页面

原因：

- 现有 stream 已经能展示 tool call / tool result
- 聊天入口足以验证核心能力
- 先把 runtime 和 tool 打通，性价比最高

### 10.4 Resource 页侧边栏

`src/pages/ResourcePage/components/AIChatSidebar.tsx`

P0 可以不改；P1 再决定是否同步支持 `coder` 模式和项目目录选择。

---

## 11. 安全策略

## 11.1 路径安全

必须使用：

- `realpath`
- root 相对路径判断
- 禁止 `..` 越界
- 禁止软链跳出根目录

禁止仅用：

- `startsWith(rootPath)`

### 11.2 文件安全

P0 规则：

- 只读/只写文本文件
- 二进制文件拒绝处理
- 单文件读写大小限制：`2MB`
- 单次目录遍历结果上限：`2000`
- 默认忽略：
  - `.git`
  - `node_modules`
  - `dist`
  - `dist-electron`
  - `coverage`

### 11.3 命令安全

由于当前还没有审批 UI，P0 只允许 **安全检查/验证型命令**。

允许的命令类别：

- 搜索/查看
  - `rg`
  - `git status`
  - `git diff`
  - `git diff --stat`
  - `pnpm test`
  - `pnpm build`
  - `npm test`
  - `npm run build`
  - `vitest`
  - `tsc`

受限允许：

- `node`
  - 仅允许执行工作区内脚本文件
  - 不允许 `-e`

明确禁止：

- `rm`
- `del`
- `rmdir`
- `git add`
- `git commit`
- `git push`
- `git reset`
- `pnpm install`
- `npm install`
- `yarn add`
- `curl`
- `wget`
- `powershell`
- `cmd`
- `bash`

### 11.4 资源限制

建议限制：

- 单命令超时：`60s`
- 单命令输出：`4MB`
- 并发命令数：`1`

说明：

- 当前聊天式 agent 不需要并发 shell
- 串行更容易解释和追踪

---

## 12. 分阶段实施

## Phase 0: Project Root 打通

**目标**：让 runtime 真正知道“当前要编辑哪个代码项目”

### 工作项

- `packages/ai/types.ts`
  - 约定 `extras.codingWorkspaceRoot`
- `packages/ai/runtime/pi/contracts.ts`
  - 增加 `PiCodingWorkspaceContext`
- `packages/ai/runtime/pi/model-resolver.ts`
  - 解析 `codingWorkspaceRoot`
- `packages/ai/runtime/pi/tool-context.ts`
  - 注入 `coding` 上下文
- `packages/ai/runtime/pi/session-factory.ts`
  - 用 coding root 作为 session cwd
- `src/pages/ChatPage/context/ChatSelectionContext.tsx`
  - 保存 coding root
- `src/pages/ChatPage/components/ChatInputBar.tsx`
  - 添加选择项目目录按钮

### 完成标志

- 选择 `coder` 后能给请求带上 `codingWorkspaceRoot`
- session cwd 不再固定为 `process.cwd()`
- 没有选项目目录时，`coder` 能返回明确提示

**当前状态：已完成**

---

## Phase 1: 只读与搜索工具

**目标**：让 agent 先具备“看懂项目”的能力

### 工作项

- 新增 `coding/path-policy.ts`
- 新增 `coding/file-service.ts`
- 新增 `coding/search-service.ts`
- 新增 tools:
  - `file-read.ts`
  - `file-list.ts`
  - `file-glob.ts`
  - `file-grep.ts`
- 修改 `tools/index.ts`
  - 注册真实工厂
- 修改 `tool-registry.ts`
  - 增加 metadata
- 修改 `profiles.md`（必要时配合 `tool-registry.ts` 默认工具）
  - 新增 `coder` profile

### 完成标志

- agent 能列目录
- agent 能读文件
- agent 能按文件名搜索
- agent 能按内容搜索
- 整个链路通过现有 chat stream 可见

**当前状态：已完成**

---

## Phase 2: 编辑工具

**目标**：让 agent 真正能修改代码

### 工作项

- 在 `coding/file-service.ts` 中加入：
  - 原子写入
  - 保留换行风格
  - 文本替换
- 新增 tools:
  - `file-write.ts`
  - `file-edit.ts`
- 更新 `tools/index.ts`
- 更新 `tool-registry.ts`
- 更新 `coder` profile 指令

### 完成标志

- agent 能创建或覆盖文本文件
- agent 能做精确字符串替换
- 写入失败时能返回清晰错误
- 不会写出工作区外文件

**当前状态：已完成**

说明：
- 已支持文本文件创建、覆盖、精确替换
- 已补原子写入和原行尾风格保留

---

## Phase 3: 受限 shell 验证

**目标**：让 agent 能运行测试/构建验证结果

### 工作项

- 新增 `coding/shell-service.ts`
- 新增 `shell-exec.ts`
- 更新 `tools/index.ts`
- 更新 `tool-registry.ts`
- 增加命令 allowlist / denylist / timeout / output limit

### 完成标志

- agent 能运行 `git status` / `git diff`
- agent 能运行 `pnpm test` / `pnpm build` / `tsc` / `vitest`
- agent 不能执行 install / delete / interactive shell

**当前状态：部分完成**

说明：
- 当前实现已经支持 `git` / `tsc` / `vitest` 的安全子集
- 尚未按原计划扩展到 `pnpm test` / `pnpm build` / `npm test` / `npm run build`

---

## Phase 4: 聊天体验收口

**目标**：让功能在现有聊天 UI 中可用、可理解

### 工作项

- 在 `ChatInputBar` 显示当前项目目录摘要
- 在 coder 模式下没有项目目录时给出明显提示
- 视需要优化 tool result 展示文案

### 可选工作项

- 在 `AIChatSidebar.tsx` 同步支持 coder
- 显示最近使用的项目目录

### 完成标志

- 普通用户可以在聊天页面完成：
  - 选项目
  - 发需求
  - 看 agent 搜索/编辑/验证

**当前状态：大部分完成**

说明：
- 主聊天页已完成
- 资源页 `AIChatSidebar.tsx` 也已补上 coder workspace 支持
- 还缺最近项目、手工验收和更细的交互 polish

---

## Phase 5: 高阶能力

**目标**：在 P0 稳定后继续增强

### 候选能力

- `file-patch`
- `file-delete` + 审批
- `multi-edit`
- diff 预览
- 撤销/回滚
- 文件树
- 代码预览
- Monaco 编辑器
- Git helper
- TodoWrite / TodoRead
- LSP 诊断

说明：

这些都不是当前最短闭环所必需的，必须在 P0 稳定后再推进。

**当前状态：未开始**

---

## 13. 测试计划

## 13.1 单元测试

建议新增：

- `packages/ai/runtime/pi/coding/path-policy.test.ts`
- `packages/ai/runtime/pi/coding/file-service.test.ts`
- `packages/ai/runtime/pi/coding/search-service.test.ts`
- `packages/ai/runtime/pi/coding/shell-service.test.ts`

覆盖：

- 路径越界拦截
- 敏感文件拦截
- 文本文件检测
- 原子写入
- grep fallback
- shell allowlist/denylist

当前已完成：

- `test/coding-agent.spec.ts`
  - 覆盖默认 coder 工具集装配，以及真实 workspace 上的 read / glob / grep / edit / write / shell workflow
- `test/pi-coding-services.spec.ts`
  - 覆盖路径越界、symlink 逃逸、文件读写与精确编辑、搜索过滤、shell allow/deny 与输出截断
- `test/pi-model-resolver.spec.ts`
  - 覆盖 coding workspace extras 解析、tool 默认值回退、preset system prompt 注入
- `test/pi-session-service.spec.ts`
  - 覆盖 `coder` 缺少 workspace 时的直接响应与 stream guard

## 13.2 集成测试

建议新增：

- `test/coding-agent.spec.ts`

场景：

- 选择项目根目录
- 发送 coder 请求
- agent 调用 `file-read` / `file-grep`
- agent 调用 `file-edit`
- agent 调用 `shell-exec`

## 13.3 手工验收清单

- [ ] `coder` profile 能出现在 agent 下拉框中
- [ ] 选择项目目录后能持久化
- [ ] 不选项目目录时有清晰错误提示
- [ ] agent 能读取 `package.json`
- [ ] agent 能搜索 `session-factory.ts`
- [ ] agent 能修改测试文件
- [ ] agent 能运行 `git diff`
- [ ] agent 不能访问 `.git`
- [ ] agent 不能执行 `rm`
- [ ] agent 不能写出根目录外文件

---

## 14. 里程碑与优先级

| 阶段 | 内容 | 优先级 | 预计工作量 |
|------|------|--------|------------|
| Phase 0 | project root 打通 | P0 | 1-1.5 天 |
| Phase 1 | 只读与搜索工具 | P0 | 1.5-2 天 |
| Phase 2 | 编辑工具 | P0 | 1.5-2 天 |
| Phase 3 | 受限 shell | P0 | 1-1.5 天 |
| Phase 4 | 聊天体验收口 | P1 | 0.5-1 天 |
| Phase 5 | 高阶能力 | P2 | 按需 |

**P0 总计**：约 `5.5 - 8` 天

---

## 15. 实施顺序建议

实际开工时，建议严格按以下顺序推进：

1. 先做 `Phase 0`
2. 再做 `Phase 1`
3. 再做 `Phase 2`
4. 再做 `Phase 3`
5. 最后做 `Phase 4`

不要反过来从 UI 开始，也不要先做 Monaco / diff / delete。

---

## 16. Definition of Done

本计划完成的定义是：

- `coder` profile 可以在现有聊天入口中使用
- 用户可以选择一个代码项目目录
- agent 可以在该目录内安全地：
  - 搜索
  - 读取
  - 编辑
  - 运行验证命令
- 整条链路不依赖新增 renderer tool IPC
- 没有 project root 时不会误用 `process.cwd()` 假装成功

**当前判断：核心 DoD 已达成，但仍有收尾项未完成**

---

## 17. 文档更新要求

功能实现时，除了代码本身，还应同步更新：

- `packages/ai/runtime/pi/README.md`
  - 补充 coding workspace / coding tools 结构
- `packages/ai/ai-module-design.md`
  - 补充 `coder` profile、tool bridge、coding request extras
- `AGENTS.md`
  - 若新增 `coder` profile 被视为架构级能力，应补充说明

---

## 18. 最终结论

这版计划的核心变化只有三点：

1. **不再假设工具跑在 renderer**
2. **不再假设 `workspaceRoot` 已经存在**
3. **不再把 UI 和高级功能放在 P0 前面**

先把 `project root + main process tools + coder profile` 打通，才是真正符合当前仓库结构、能稳定交付的做法。
