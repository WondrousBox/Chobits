# 工作流系统优化实施计划

## 1. 目标

将当前工作流系统从“主进程内可运行的功能集合”演进为具备稳定运行契约、明确边界和可测试性的工作流应用模块。

本计划优先保证以下结果：

- 运行成功、失败、取消的状态在引擎、IPC、调度器、AI 工具和 UI 之间保持一致。
- DAG 的终端输出、条件分支、输入合并和错误策略符合定义语义。
- 工作流和运行记录按 workspace 正确隔离。
- 异常、取消和进程退出时不会遗留运行上下文、临时目录或无限增长的内存状态。
- 核心引擎可以脱离 Electron、数据库和具体业务节点进行单元测试。

## 2. 当前基线

### 已有优点

- `NodeHandler`、`Plugin`、`ExecutionContext` 已经提供了可扩展接口。
- 节点规格可以驱动编辑器的输入配置和动态端口。
- 引擎通过事件发布运行状态，渲染层不直接调用节点实现。
- `WorkflowStore` 已经集中处理工作流定义和运行记录持久化。

### 已确认的问题

- `wf:run` 等待执行完成后仍无条件返回 `ok: true`，失败运行会被 UI 当作成功。
- 引擎的终端节点计算方向相反，最终输出可能来自开始节点。
- 条件节点只选择输出端口，但执行器仍会执行所有后继节点。
- 调度器直接调用引擎 API，绕过 IPC 层的校验和缺失输入处理，并且不检查最终状态。
- 数据库存在 `workspaceId` 字段，但工作流定义的保存、读取、删除和运行记录删除没有完成隔离。
- 提前返回和异常路径没有统一清理；取消不会中止正在运行的外部进程。
- 编辑器保存时强制覆盖 `options`，可能改变已有工作流的错误策略。
- 端口类型、必填输入、重复输入连接和配置值没有统一运行时校验。
- 工作流 package 的入口同时承担 Electron IPC、数据库、事件、资源适配和节点注册，节点直接依赖业务基础设施。
- 现有 `test/workflow.spec.ts` 仍引用已不存在的 `electron/workflow` 路径。

## 3. 目标架构

```text
workflow-core
  类型、定义校验、DAG 规划、执行状态机、节点/插件接口

workflow-runtime
  内置节点、插件和 AI/媒体/OCR 适配器

workflow-app
  Electron IPC、数据库仓储、资源服务、事件广播和调度器适配

workflow-client
  类型安全的 IPC client、编辑器状态、运行状态 hooks 和 UI 组件
```

依赖方向必须保持：

```text
workflow-client -> workflow-app contract
workflow-app -> workflow-core + runtime adapters
workflow-runtime -> workflow-core contracts
workflow-core -> no Electron / no database / no React
```

## 4. 实施阶段

### Phase 1：运行契约与引擎正确性（已完成）

范围：

- 修复 `wf:run` 的返回契约，明确 `accepted`、`running`、`completed`、`failed`、`canceled` 的含义。
- 修复最终输出节点计算。
- 为条件分支建立可执行路径和 `skipped` 状态。
- 统一引擎所有退出路径的状态落盘、事件发送和上下文清理。
- 取消只能作用于 `queued/running`，并引入可传递的取消信号。
- 调度器和 AI 工具统一使用同一个应用层运行入口，并检查最终状态。

验收标准：

- 节点失败时所有入口都得到失败结果，不能触发成功回调。
- 线性工作流的输出来自结束节点；多终端工作流按定义合并。
- 条件只执行命中的分支，其他分支均为 `skipped`。
- 拓扑异常、插件缺失、开始输入缺失、节点异常和取消都能完成记录并清理上下文。
- 取消不会把已完成任务改成 `canceled`。

### Phase 2：定义校验和输入协议（已完成）

范围：

- 为 `WorkflowDefinition`、节点配置、边和运行请求引入 Zod schema。
- 校验端口类型兼容性、必填输入、重复端口连接和动态端口的一致性。
- 明确单值端口、多值端口和 fan-in 行为，禁止隐式的“后者覆盖前者”。
- 保存定义前执行校验，并返回结构化错误路径。
- 为定义增加 `schemaVersion`，为未来迁移预留版本。

验收标准：

- 非法定义不能保存或运行。
- 错误可以定位到 workflow、node、config 或 edge 的具体字段。
- 旧版本定义可以通过显式迁移加载。

### Phase 3：workspace 隔离与持久化一致性（已完成）

范围：

- 将 `workspaceId` 纳入工作流定义和所有应用层命令。
- `list/get/upsert/remove` 全部按 workspace 查询和授权。
- 运行记录通过工作流关联进行 SQL 过滤，不再只依赖 metadata 内存过滤。
- 明确预设工作流与用户工作流的持久化模型，避免运行记录外键指向不存在的预设定义。
- `removeRun` 必须验证 workspace，不能只按 runId 删除。

验收标准：

- workspace A 不能读取、修改、运行或删除 workspace B 的工作流和运行记录。
- 预设和用户工作流的历史记录都可稳定查询、导出和清理。
- 所有 schema 变更遵循“先改 schema，再执行 `db:generate`”的仓库约定。

### Phase 4：核心模块拆分（已完成）

范围：

- 将 DAG 规划、执行状态机、事件类型和 registry 下沉到 `workflow-core`。
- 将数据库、Electron IPC、BrowserWindow、AppEvent 和资源仓储移动到适配层。
- 节点通过注入的服务接口访问资源、AI、文件系统和外部进程。
- 将 `packages/workflow/index.ts` 拆分为 composition root、application service 和 adapters。
- 将 `WorkflowBuilderPage` 拆成定义加载、图编辑、运行控制、运行事件和持久化 hooks。

验收标准：

- core 包可在 Node/Vitest 中运行，不需要 Electron 或真实数据库。
- 节点适配器可以通过 fake service 独立测试。
- UI 不再手工复制多套 workflow 定义字段。

### Phase 5：可靠性、性能和可观测性（已完成）

范围：

- 实现真实的并发策略或移除未实现的 `concurrency` 配置。
- 对运行日志、输入、配置和输出进行脱敏与大小限制。
- 增加运行记录和内存缓存保留策略。
- 清理 workflow 临时目录；外部进程支持 abort/kill。
- 将状态持久化和事件广播改成有序、可追踪的更新流。

验收标准：

- 长时间运行不会因为 `runs`、`runLogs` 或临时文件无限增长。
- 大文件和大文本不会被完整复制到每次节点状态更新中。
- 日志能关联 run、node、attempt 和错误原因，但不泄露秘钥。

## 5. 测试策略

### 引擎单元测试

- 线性 DAG 的最终输出。
- 多终端输出和无边节点。
- 环、非法边和未知节点。
- 必填输入、端口类型和重复连接。
- 条件命中、else 分支和 skipped 状态。
- fail-fast、continue、取消和异常清理。
- 临时目录清理和运行缓存回收。

### 应用层契约测试

- `wf:run` 的成功、失败、输入缺失和取消返回值。
- 调度器对失败运行的处理。
- AI 工具对同步等待和后台运行的处理。
- workspace 读写和删除隔离。

### 回归测试门槛

```text
pnpm exec tsc --noEmit --pretty false
pnpm lint
pnpm exec vitest run
```

工作流测试不能引用已删除的 `electron/workflow` 路径；所有新增行为必须有最小回归测试。

## 6. 实施约束

- 本计划不在第一阶段进行无关 UI 重构。
- 先修复运行语义，再调整数据库模型，最后做 package 拆分。
- 数据库字段变更必须先修改 schema，再执行 `pnpm db:generate`，并检查 migration。
- 每个阶段保持可构建、可测试；阶段之间使用小步提交，便于回滚。
- 不改变现有预设工作流的业务意图；定义迁移必须保留旧数据可运行性。

## 7. 当前执行队列

- [completed] Phase 1：运行结果契约、最终输出、条件分支、生命周期和取消。
- [completed] Phase 1 回归测试：引擎、调度器、AI 工作流工具和 Electron 无关运行路径。
- [completed] Phase 2：schema version、定义/请求 schema、结构化错误和端口输入协议。
- [completed] Phase 3：workspace 隔离和持久化一致性。
- [completed] Phase 4：core 规划/调度/状态/事件/registry、application service、Electron/资源适配器、节点 runtime service ports 和 client hooks 均已拆分并完成独立回归。
- [completed] Phase 5：并发调度、有序持久化、运行与日志缓存、临时目录、脱敏限流、数据库历史保留、真实取消链和 attempt 级可观测性均已实施并完成定向回归。

## 8. 本轮实施记录

### 已落地

- 引擎最终输出改为无出边终端节点的输出；条件分支只执行命中的路径，未命中节点标记为 `skipped`。
- 失败、取消、拓扑异常均写入终态；取消通过 `AbortSignal` 传递到 FFmpeg、Whisper/FunASR/Parakeet、Tesseract 和资源下载。
- `executeWorkflow` / `startValidatedWorkflow` 统一校验、缺失配置和最终状态；`wf:run` 只有 `completed` 返回 `ok: true`。
- 调度器和 AI workflow tool 走同一运行入口，并传递 workspace metadata。
- 工作流定义、运行记录、导入导出、删除和 IPC 查询均按 workspace 隔离；预设工作流不再依赖用户工作流外键。
- 编辑器和资源页的 workspace 查询参数已贯通，并保留既有 `options` 配置。
- 工作流定义和保存/运行请求已接入 Zod；旧定义会显式迁移到 schema v1，未来版本会返回结构化的 `unsupported-schema-version` 错误。
- 保存和运行前会校验重复节点/边、端口存在性和类型、动态端口、重复输入连接、必填输入、默认输入、静态配置以及 DAG 拓扑。
- 同一运行的数据库状态写入已按事件顺序串行化并在入队时快照，避免较慢的早期写入覆盖最终状态。
- 跨窗口定义和运行事件按 workspace 过滤，资源页的运行进度不会再混入其他 workspace。
- 修复 OCR 预设的资源 ID 端口，以及 FunASR 预设原先三条边写入同一 End 端口导致结果被覆盖的问题；End 节点现支持显式动态结果端口。
- 迁移为没有 workflow 行和 metadata workspace 的旧预设运行补充默认 workspace；该调整只修正既有迁移的数据回填逻辑，没有新增 schema 变化。
- 分支汇合节点只有在所有必填端口都实际获得值后才会执行；未命中分支不会再让缺失必填输入的节点误运行。
- 多终端节点产生同名输出时运行会明确失败并指出冲突节点，不再按定义顺序静默覆盖结果。
- 引擎内存默认只保留最近 100 个终态运行及其日志；成功运行临时目录默认保留 24 小时，并在后续启动或运行时回收过期目录。
- 状态持久化队列支持 `flush()` 和失败报告；Electron 退出会阻止默认退出，等待队列完成后再结束进程。
- `options.concurrency` 现按拓扑层真实限制并发，默认保持串行、最大为 64；fail-fast 不再调度后续批次，同批已启动节点允许结束，未调度节点明确标记为 `skipped`。
- 同一运行中的插件检查和准备通过共享 Promise 去重，并发节点不会重复初始化同一个插件。
- 日志、运行输入、节点状态、metadata 和输出会递归脱敏，处理 Bearer/Basic、URL 凭据和常见敏感字段；循环引用、二进制、深层对象、大数组和大文本均转换为有界快照。
- 单条日志最多 4096 字符、每个运行最多保留 500 条；数据库写入、跨窗口广播和 IPC 查询均使用安全快照，引擎内部节点传值和最终返回仍保留完整结果。
- 后台启动入口直接返回引擎预分配的稳定 `runId` 和完成 Promise；异步初始化开始前也能立即取消，且首个取消终态已包含完整节点状态，不再依赖同步事件猜测运行 ID。
- 编辑器只把 Start 节点输入视为单次运行态；其他节点的 `inputDefaults` 会统一参与校验、保存、加载和 JSON 展示。
- 并发进度改为聚合所有节点状态，定义名称和节点标签每个 run 只加载一次；连续进度写入按约 250ms 合并，节点状态切换和运行终态仍立即排队持久化。
- 编辑器按 workflow、workspace 和当前 run 隔离状态事件；同一 run 的进度更新不再重置节点与日志，旧 run 的终态也不会清除新 run。
- 资源历史记录在 SQL 中通过 `metadata.resourceId` 过滤后再应用数量限制，并将查询 limit 约束到 1 到 500，不再因先截断全局历史而漏掉较旧资源记录。
- `WorkflowApplicationService` 通过 engine、definition/run store port 和 workspace resolver 组织定义、执行、取消及历史用例；调度器和 AI 工具的原导出函数保留为兼容门面。
- 运行持久化、并发进度、定义展示缓存、窗口广播和 sprite/busy 生命周期已从 composition root 提取到 `run-event-coordinator.ts`，并通过回调端口接入应用设施。
- `wf:*` 参数解析、错误映射和返回契约已提取到无 Electron 运行时依赖的 `ipc-adapter.ts`；资源创建、更新、下载和运行上下文事件已提取到 `resource-event-adapter.ts`，通过仓储、网络和文件系统端口接入。
- 资源项目目录解析已提取到 `resource-project-adapter.ts`，Electron 组合根注入现有目录服务，workflow 不再重复维护 `.resproject` 路径规则。
- DAG planner、分层并发调度器、运行状态机、事件类型和 registry 已下沉到 `core/`；根路径 registry 与事件类型保留兼容导出，所有调用方共享同一个 registry singleton。
- 纯执行调度器负责拓扑层内分批并发、取消和 fail-fast；同批已启动节点允许完成，后续批次不再调度。运行状态机统一处理节点迁移、取消、未调度节点、终态和多终端输出冲突。
- `ExecutionContext.services` 提供资源、文件夹、workspace 和 HTML 截图端口；资源节点不再导入数据库仓储，图片节点不再导入 Electron `BrowserWindow`。组合根注入真实实现，节点测试使用 fake services。
- HTML 截图已提取到 Electron adapter，并接入 `AbortSignal`；文本图片和学习卡节点保留各自的内容高度与进度语义。
- AI 对话、提示词优化、图片理解、图片生成和音乐生成节点会把 workflow `AbortSignal` 传到请求层；Pi 非流式/流式文本、coding session、OpenAI 图片 SDK、音乐和歌词 provider 均执行真实取消，legacy provider 也使用同一信号。
- 被取消的 legacy workflow AI 请求以及 Pi 图片、音乐和歌词请求会将用量事件记录为 `cancelled`，不再误归类为 `failed`。
- 数据库按 workspace 自动清理 90 天前或超出最近 1000 条上限的终态运行；活动运行不参与清理，删除按 250 条分批且同一 workspace 最多每小时触发一次。
- 节点状态持久化当前 `attempt` 和有界 attempt 摘要，记录每次执行的状态、时间、耗时、错误及稳定 `errorReason`；新 attempt 不会继承上一轮的终态字段。
- 结构化运行日志会关联 `runId / nodeId / attempt / errorReason`；workflow AI 请求 ID、analytics metadata 和用量事件沿用同一 attempt，并映射到从 0 开始的 `attemptIndex`。
- Pi 非流式和流式文本执行补齐成功、失败、取消用量事件，与图片、音乐及歌词路径保持一致的工作流追踪维度。
- `index.ts` 从 924 行降至 257 行；composition root 目前只保留节点/插件注册、engine 组装和应用设施接线。
- 编辑器运行状态订阅已提取到 `useWorkflowRunEvents.ts`，按 workflow/workspace/run scope 隔离事件，并合并异步历史日志和实时日志，避免旧 scope 状态或慢请求回写。
- 编辑器定义加载已拆为纯 `workflow-definition-mapper.ts` 和 `useWorkflowDefinitionLoader.ts`；预设克隆、节点/边 ID 重映射、Start 单次输入清理和非 Start 默认值保留有独立测试，旧路由请求不能覆盖新草稿。
- 编辑器运行控制、持久化和图编辑已分别提取到 `useWorkflowRunControl.ts`、`useWorkflowPersistence.ts` 和 `useWorkflowGraphEditor.ts`；保存/运行状态按定义 scope 隔离，结构节点保护、布局、自动 fit、选择和 draft 同步均有独立测试。
- `WorkflowBuilderPage.tsx` 从 1109 行降至 356 行，页面只负责组合 hooks、面板和对话框。
- application service、run event coordinator、IPC/resource adapter 和 client hooks 均使用 fake engine/store/registrar/IPC 独立测试，不需要 Electron 或真实数据库。

### 验证结果

```text
pnpm exec tsc --noEmit --pretty false       passed
pnpm db:generate                            not run in this batch (no schema changes)
pnpm exec vitest run <workflow test set>    36 files / 120 tests passed
pnpm exec vitest run <Pi + usage test set>  9 files / 30 tests passed
pnpm exec vitest run <full repository>      174 files / 970 tests passed; 12 files / 25 tests failed on unrelated repository baselines
pnpm exec eslint <changed test/new files>   passed
pnpm exec prettier --check <changed files>  passed
pnpm lint                                   baseline failed: generated dist-electron/.vscode and historical source/test findings
git diff --check                            passed
Chobits app.db/app-dev.db main timestamps   unchanged; app-dev WAL already had a schema-equivalent 0022 with an earlier SQL hash, and its workspace/run tables were empty
```

### 下一步

Phase 1 至 Phase 5 已完成。工作流主线后续可转入按产品需求新增节点重试策略、持久化日志查询或运维配置入口；这些不属于本优化计划既定验收范围。全仓测试仍有 onboarding/sprite、selected-text、scheduler storage、资源签名和 Electron mock 等既有失败，全量 lint 仍受 `dist-electron`、`.vscode` 及历史源码/测试问题影响，本轮未将这些无关问题混入修改。
