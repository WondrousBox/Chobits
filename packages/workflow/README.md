## 工作流系统（Electron 主进程）

这个模块是在 Electron 主进程里运行的「可插拔工作流引擎」，主要负责围绕资源（Resource）做一系列可视化编排的批处理任务，例如转码、OCR、文档转 Markdown、AI 生成/理解、多媒体展示等。

- **节点（Node）**：有显式的输入 / 输出定义，支持基础运行时校验和动态端口（inputs/outputs 随配置变化）。
- **插件（Plugin）**：声明能力与安装检测（如 FFmpeg / Tesseract / Whisper），可在运行前准备环境。
- **执行引擎**：基于 DAG 拓扑层执行，支持并发上限、取消、「失败即停止」与「失败继续(errorStrategy: 'continue')」。
- **IPC 接口**：渲染进程可以通过 IPC 构建 / 校验 / 运行工作流，并订阅运行状态和日志。
- **持久化**：自定义工作流定义与运行记录通过 `WorkflowStore` 存入应用数据库，并支持文件形式的预设工作流。

---

## 目录结构

- `types.ts`：工作流 / 节点 / 插件 / 运行记录与 runtime service ports 等公共契约。
- `core/`：不依赖 Electron、数据库或 React 的 DAG planner、执行调度器、运行状态机、事件类型和 registry。
- `registry.ts`：兼容入口，重新导出 `core/registry` 的同一个注册表实例。
- `engine.ts`：执行编排与校验逻辑（`WorkflowEngine` + `createEngine`），调用 `core/` 中的纯规划、调度和状态函数。
- `application-service.ts`：定义、运行、workspace 授权和历史访问的应用用例，通过存储端口注入外部实现。
- `run-event-coordinator.ts`：运行状态持久化、进度聚合、广播和生命周期回调的协调器。
- `run-history-retention.ts`：终态运行历史的 workspace 级保留策略与节流控制器。
- `ipc-adapter.ts`：`wf:*` 请求解析及 IPC 返回契约，不直接依赖 Electron 实现。
- `resource-event-adapter.ts`：资源创建、更新、下载和运行上下文事件适配，通过仓储、文件系统和网络端口接入应用设施。
- `resource-project-adapter.ts`：把应用现有的资源项目目录服务适配为工作流执行上下文端口。
- `html-screenshot-adapter.ts`：Electron `BrowserWindow` 截图实现，通过执行上下文注入图片节点并支持取消。
- `store.ts`：工作流定义、运行记录和预设定义缓存的持久化适配。
- `plugins/`：内置插件
  - `ffmpeg.ts`：音视频转码、截图等能力。
  - `tesseract.ts`：OCR 能力。
  - `whisper.ts`：语音转文本（STT）能力。
- `nodes/`：内置节点
  - 核心：`start` / `end`
  - 资源：`resource-load` / `resource-create` / `resource-update`
  - 转码：`transcode` / `transcode-advanced` / `extract-keyframes`
  - 文字与文档：`ocr` / `doc-to-md` / `transcribe-whisper`
  - AI：`ai-chat` / `image-understand` / `image-generate`
  - 展示：`display-text` / `display-image` / `display-media` / `display-resource-card`
- `task-results.ts`：基于文件路径扫描工作流任务输出结果。
- `index.ts`：工作流系统入口，初始化引擎、注册节点与插件、暴露 IPC 接口并与应用数据库打通。

---

## 与 Electron 主进程的集成方式

主进程通过调用 `initWorkflowSystem` 启动工作流系统：

- 传入 `getWorkflowDefinitionsPath`，用于告诉系统预设工作流 JSON 文件所在路径。
- 在函数内部：
  - 注册内置插件：`FfmpegPlugin` / `TesseractPlugin` / `WhisperPlugin`。
  - 注册所有内置节点（见上文 `nodes/` 列表）。
  - 创建 `engine = createEngine()`。
  - 向 `ExecutionContext.services` 注入资源、文件夹、workspace 仓储读取端口和 HTML 截图端口；节点本身不直接依赖数据库或 Electron。
  - 通过 `run-event-coordinator` 监听引擎事件（`run:status` / `node:status` / `run:log` 等），并广播到所有窗口：
    - 通过 `BrowserWindow.getAllWindows().forEach(win => win.webContents.send(...))`。
    - 同步至 `WorkflowStore`，用于在 UI 中展示历史运行记录。
  - 通过 `resource-event-adapter` 处理资源相关事件，和应用现有的 `ResourcesRepo` / `FoldersRepo` / `WorkspacesRepo` 与 `eventManager` 对接：
    - `resource:create-request`
    - `resource:update-request`
    - `resource:download-request`
  - 根据运行状态更新「精灵忙碌状态」（`sendSpriteBusyStart/Progress/End`），在 UI 中展示工作流执行进度。

---

## IPC 接口一览

所有 IPC 接口前缀为 `wf:`，由 `ipc-adapter.ts` 注册到主进程传入的 registrar，渲染进程通过 `ipcRenderer.invoke` 调用。

- **节点 & 插件元信息**
  - `wf:listNodes` → `NodeSpec[]`
    - 返回所有已注册节点的规格信息（包含是否有动态配置/端口：`hasDynamicConfig/Inputs/Outputs`）。
  - `wf:getNodeConfig` → `{ ok, config }`
  - `wf:getNodeInputs` → `{ ok, inputs }`
  - `wf:getNodeOutputs` → `{ ok, outputs }`
  - `wf:listPlugins` → `{ id, label, installed }[]`

- **工作流定义管理**
  - `wf:listDefinitions` → 预设 + 自定义所有工作流定义列表。
  - `wf:listPresets` → 仅预设工作流列表。
  - `wf:isPreset` → 判断某个 `id` 是否为预设工作流。
  - `wf:getDefinition` → 根据 `id` 获取工作流定义（优先预设，其次用户自定义）。
  - `wf:saveDefinition` → 保存/更新自定义工作流定义。
  - `wf:deleteDefinition` → 删除自定义工作流定义。

- **校验与运行**
  - `wf:validate` → `ValidateResult`
    - 校验节点类型是否存在、端口是否匹配、DAG 是否有环、依赖插件是否安装等。
  - `wf:run` → `{ ok: boolean; runId?: string; validation?: ValidateResult; error?: string }`
    - 自动从预设 + 自定义中查找 `defId` 对应工作流。
    - 根据 `def.options.errorStrategy` 控制失败后的行为（停止 / 继续）。
  - `wf:getRun` → 单次运行详情 `WorkflowRunRecord`
  - `wf:listRuns` → 历史运行列表（支持按 `defId` / `resourceId` / `workspaceId` 等过滤）。
  - `wf:deleteRun` → 删除某次运行记录。
  - `wf:cancelRun` → 取消运行中的工作流。
  - `wf:getRunLogs` → 获取运行日志数组。

- **其他**
  - `wf:getTaskResults` → `{ ok, data }`  
    根据文件路径读取该文件相关的任务结果（例如转码 / OCR 的中间产物）。

---

## 运行时行为说明

- **执行顺序**
  - 使用 `core/dag-planner.ts` 生成稳定拓扑顺序、执行层和终端节点，只支持有向无环图（DAG），非法边或环会直接报错。
  - `core/execution-scheduler.ts` 按拓扑层调度，同一层节点受 `options.concurrency` 限制并发；默认值为 1，最大值为 64。
  - fail-fast 会停止调度后续批次，但同批已经启动的节点允许结束；`continue` 会继续执行，并在终态保留失败结果。

- **Start 节点输入**
  - Start 节点会将两部分数据合并作为输入：
    - `wf:run` 传入的 `initialInput`（例如 `resource` 对象）。
    - 画布上配置的 `inputDefaults`。
  - 支持多种输入模式（`config.inputMode`）：
    - `text`：需要文本输入，否则会触发 `wf:start-input-required` 事件，请求前端弹窗收集输入。
    - `url`：需要 URL 输入，逻辑同上。
    - `file`：需要文件输入，逻辑同上。

- **插件检查与准备**
  - 在 `validate` 阶段会检查需要的插件是否存在、是否已安装。
  - 在 `run` 阶段首次使用某插件时，会调用其 `prepare` 方法做一次性初始化。

- **取消传播**
  - `wf:cancelRun` 会触发当前运行的 `AbortSignal`。
  - AI 对话、图片生成、音乐生成、HTML 截图、资源下载和媒体/OCR 外部进程会继续向实际 provider、网络请求、窗口或子进程传递该信号。
  - AI 请求取消会记录为 `cancelled`，不会作为普通 provider 失败统计。

- **进度 & 日志**
  - 引擎内部记录并广播：
    - `run:status`：整体运行状态 & 进度。
    - `node:status`：节点级别状态（`pending/running/completed/failed/skipped`）。
    - `node:progress`：节点内部细粒度进度（如转码百分比）；整体进度会聚合所有并发节点，持久化更新按 run 合并。
    - `run:log`：结构化日志，每条带有 `runId / nodeId / attempt / level / errorReason / timestamp`（无节点或尚未开始执行时省略不适用字段）。
  - 节点状态持久化 `attempt` 和有界 attempt 摘要；重新执行时保留先前 attempt 的状态、耗时和错误原因，并清除新 attempt 上的旧终态字段。
  - workflow AI 的请求 ID、analytics metadata 和统一用量事件使用同一 attempt；用量表中的 `attemptIndex` 保持从 0 开始。

- **运行历史保留**
  - 数据库按 workspace 默认保留最近 1000 条终态运行，并清理 90 天前的终态运行；`queued/running` 永不参与自动删除。
  - 清理按 250 条分批执行，同一 workspace 最多每小时触发一次；首次新终态写入会回收已有的过期或超额历史。
  - 该策略复用现有 `workspace_id / status / started_at`，不需要额外数据库字段。

---

## 扩展指南

- **新增节点（Node）**
  1. 在 `nodes/` 下创建一个文件，实现一个 `NodeHandler`：
     - 定义 `spec`：`id` / `label` / `inputs` / `outputs` / `requires` 等。
     - 实现 `run({ input, config, ctx, emit, getPlugin })`。
     - 如需要动态端口，额外实现 `getInputs(config)` / `getOutputs(config)`。
  2. 在 `initWorkflowSystem` 中通过 `registerNode(MyNode)` 注册。

  渲染进程调用 `wf:listNodes` 后即可在可视化编辑器中使用该节点。

- **新增插件（Plugin）**
  1. 在 `plugins/` 下创建一个插件实现：
     - 导出 `id` / `label`。
     - 实现 `isInstalled(ctx)`：检测当前环境是否可用（如检查 ffmpeg 可执行文件）。
     - 可选实现 `prepare(ctx)`：做一次性初始化（下载模型、创建临时目录等）。
  2. 在 `initWorkflowSystem` 中通过 `registerPlugin(MyPlugin)` 注册。
  3. 在节点 `spec.requires` 中声明依赖该插件的 `id`。

- **新增预设工作流**
  - 将 JSON 定义放到 `getWorkflowDefinitionsPath()` 指向的路径下，格式为 `WorkflowDefinition`：
    - `id` / `name` / `nodes` / `edges` / `options`。
  - 启动应用后，`wf:listPresets` / `wf:listDefinitions` 中会自动包含这些预设工作流。

---

## 典型使用场景示例（概念层）

- **OCR 工作流**：Start（选择文件） → LoadResource → OCR(Tesseract) → ResourceUpdate(保存文本) → End。
- **音视频转码工作流**：Start（选择文件） → LoadResource → Transcode(FFmpeg) → ExtractKeyframes → End。
- **AI 处理工作流**：Start（文本或资源） → AiChat / ImageUnderstand / ImageGenerate → DisplayText / DisplayImage / DisplayResourceCard。

实际的预设工作流 JSON 可以在 `resources` 目录中查看或通过 `wf:listPresets` 在前端调试。
