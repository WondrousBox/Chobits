# 工作流系统优化实施计划

## 1. 目标

Phase 1 至 Phase 10 已将工作流从“主进程内可运行的功能集合”演进为具备稳定运行契约、明确宿主边界、独立发布检查和真实消费者验收的 Node-first 工作流内核。Phase 11 将在首次外部发布前删除迁移期旧入口并完成源码归位。本文档记录各阶段范围、兼容约束和验证结果，并作为后续版本演进的实施基线。

后续实施优先保证以下结果：

- `@chobits/workflow` 只管理定义、DAG、调度、状态机、运行生命周期、事件和扩展契约。
- 宿主应用的资源、AI、媒体、OCR、数据库和 Electron 能力通过 ports、capabilities 和 adapters 注入。
- 公共包使用实例化 registry/runtime，不依赖模块级单例或导入副作用。
- scheduler、AI 工具、Electron IPC 和 React UI 只通过公开 facade/contract 使用工作流。
- 通过显式迁移保持现有 workflow definition、node ID、preset ID、数据库模型和用户运行语义，不以永久兼容代码替代数据迁移。
- 通过 tarball 消费者 fixture 验证包可以脱离宿主应用仓库安装和运行。

架构决策和边界以 [工作流目标架构](./architecture.md) 为准；本文档负责把该架构拆成可验证的实施批次。

## 2. 当前基线

### Phase 1-5 已完成基础

- 运行成功、失败、取消的状态在引擎、IPC、调度器、AI 工具和 UI 之间保持一致。
- DAG 终端输出、条件分支、输入合并、错误策略和并发调度已有明确语义与回归测试。
- 定义 schema、迁移、端口校验、workspace 隔离和持久化顺序已经落地。
- 取消信号可以传到 AI、网络、BrowserWindow、FFmpeg、ASR 和 OCR 执行链。
- DAG planner、调度器、状态机、事件、application service 和主要 adapters 已完成初步拆分。
- 日志、状态、临时目录、内存缓存和数据库运行历史具备脱敏、限流和保留策略。
- React 编辑器已拆为加载、图编辑、运行、事件和持久化 hooks。

### Phase 10 完成状态

- `packages/workflow` 已完成独立 manifest/build、12 个受控 exports、公共 contract、实例 runtime 和真实 tarball JavaScript/TypeScript consumer。
- 新 runtime/registry 已使用实例生命周期，旧模块级默认 registry 只作为宿主应用兼容门面保留。
- 公开请求已支持通用 scope/context，但类型仍保留 workspace、resource input 和部分 `any` 兼容字段。
- 26 个宿主应用节点、7 个 plugin、SQLite/预设 store、资源/AI/OCR/rendering adapters 已迁入私有包；旧业务路径只保留兼容转发。
- 公共 runtime 与工作流集成层均完成边界检查；宿主 composition 已配置 resource I/O、AI、FFmpeg、ASR、OCR 和 rendering 执行组。
- 公共 `WorkflowRuntimeFacade` 已成为 Electron IPC、scheduler 和 Pi workflow tool 的共同应用入口，宿主通过显式注入提供实例。
- Electron composition root 已迁入 `electron/main/workflow`；旧 `packages/workflow/index.ts` 和 `ipc-adapter.ts` 只保留兼容转发。
- 19 个 invoke 通道和 4 个事件通道已集中到共享 IPC contract，renderer 通过类型安全 client 使用，不再分散维护 `wf:*` IPC 字符串。
- production renderer 和 Electron workflow host 已迁移到公开 package exports；release check 阻止重新引入已有公开替代项的深层导入。
- manifest、ESM/declarations、side effects、source map、依赖闭包、tarball 白名单和禁止深层导入均有自动验收。
- Phase 10 当时建立了 `0.1.x` 兼容窗口；由于公共包尚未外部发布，Phase 11 将在首次发布前迁移调用方和数据并删除这些内部兼容面。

## 3. 目标架构

完整设计见 [工作流目标架构](./architecture.md)。目标物理边界为：

```text
@chobits/workflow               可发布的 Node-first runtime kernel
@workflow/integrations          私有宿主应用 capabilities、nodes 和 adapters
electron/main/workflow          Electron bootstrap、IPC 和事件传输
src/pages/WorkflowBuilderPage   宿主应用 React editor
src/lib/workflow-client.ts      宿主应用 renderer transport binding
```

依赖方向必须保持：

```text
React / scheduler / AI tool / Electron IPC
                    -> 宿主应用 composition root
                    -> 宿主应用 capabilities and nodes
                    -> public workflow runtime
                    -> application / core / contracts
```

公共包定义扩展契约，宿主实现契约并负责组合。公共包根入口不得加载 Electron、React、Drizzle、AI provider 或原生媒体依赖。

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

### Phase 6：真实包边界与公共契约（已完成）

范围：

- 为 `packages/workflow` 建立独立 manifest、TypeScript build、declaration、ESM exports 和 files 白名单。
- 建立 `contracts/`、`core/`、`application/`、`ports/` 和 `sdk/` 公共边界，整理稳定根导出和 `node`、`testing` 子路径导出。
- 将定义、运行请求、运行结果、事件、错误和迁移 contract 从宿主应用类型中分离。
- 保留旧根路径的兼容导出，先让现有调用方无行为变化地迁移到公开 API。
- 增加依赖边界检查，禁止公共包导入 Electron、React、Drizzle 和宿主应用私有模块。

验收标准：

- 公共包可以独立 build 并生成 declarations。
- 公开类型不包含宿主应用 repository、plugin resource、Electron 或 React 类型。
- 宿主应用当前测试和预设继续通过，且本阶段不修改数据库 schema。

### Phase 7：实例 runtime 与能力系统（已完成）

范围：

- 将 registry、application service 和 runtime 生命周期改为显式实例，不再依赖模块级单例。
- 引入类型化 capability token、缺失能力预检和 node SDK。
- 统一通用运行请求中的 `scope/trigger/actor/context`，由兼容 adapter 映射现有 workspace/resource 字段。
- 增加节点 timeout、可选 retry/idempotency contract 和 runtime 级命名执行组限流。
- 复用 Phase 6 已建立的 memory store，并补充 capability resolver、fake clock 和 fake ID factory 等测试实现。

验收标准：

- 同一进程可以创建多个互不污染的 registry/runtime。
- 缺失 capability 在节点启动前返回结构化错误。
- timeout、取消和全局资源限流有确定性测试；有副作用节点默认不自动重试。

### Phase 8：宿主应用工作流集成层迁移（已完成）

范围：

- 建立私有 `@workflow/integrations` 包。
- 将 SQLite/Drizzle store、预设 loader、resource/folder/workspace 能力迁入私有适配层。
- 将 AI、media、ASR、OCR、HTML render 和 display 节点按 capability 接入。
- 由宿主应用 composition root 注册业务节点和实现，不让公共包反向导入宿主。
- 保留现有 workflow JSON、node ID、preset ID 和运行记录映射。

验收标准：

- 公共包依赖图不再出现宿主应用、Electron、Drizzle、AI/OCR/media 业务实现。
- 现有预设通过兼容回归，结果和取消语义保持一致。
- 私有 adapter 可以使用 fake port 独立测试。

### Phase 9：宿主入口与类型安全客户端（已完成）

范围：

- Electron main 在 `electron/main/workflow` 中创建并注入 runtime。
- scheduler 和 AI workflow tool 改为接收 runtime facade，继续由各自领域管理触发、等待、后台执行和结果格式。
- 建立共享 IPC channel/request/result/event contract 和 renderer client。
- React editor 只依赖定义、node manifest 和 client contract，不深层导入 runtime 内部文件。
- 保留兼容门面，在调用方完成迁移前不一次性删除旧入口。

验收标准：

- scheduler、AI tool、IPC 和 UI 只使用公开 facade/contract。
- `wf:*` 通道在一个共享 contract 中维护，renderer 不再使用 `any` payload 或重复字符串。
- 各入口的成功、失败、取消和 workspace 隔离回归继续通过。

### Phase 10：发布加固与兼容清理（已完成）

范围：

- 使用 `pnpm pack` 生成 tarball，并在仓库内隔离 fixture 中安装和执行。
- 验证第三方节点、capability、store、运行、取消和事件订阅只依赖公开 exports。
- 增加 package 边界、类型、exports、side effects 和依赖闭包测试。
- 补齐 API、节点 SDK、adapter 和版本兼容文档。
- 迁移 production 调用方；兼容门面按已声明窗口保留，并在兼容期结束且移除门槛满足后删除。

验收标准：

- 独立消费者不引用宿主应用源码即可完成一轮工作流执行和取消。
- tarball 不包含数据库、缓存、宿主配置或未声明内部源码。
- 公共 API、版本策略和兼容窗口有明确文档，所有包化验收项通过。

### Phase 11：旧版兼容清理与源码归位（待实施）

范围：

- 清零 production 深层导入，把公共实现归入 `packages/workflow/src`，把宿主实现归入 `@workflow/integrations` 或 Electron host。
- 删除业务节点、plugin、store、adapter、OCR runtime 和 host 入口转发文件。
- IPC、renderer 和触发方统一使用 `definitionId/definition/context`，删除 legacy request。
- 删除默认 registry、旧类型别名、未使用 façade 和 no-op。
- 将 FFmpeg、plugin resource、资源目录和资源身份从公共 `ExecutionContext` 迁入私有 capability 或规范 `scope/context`。
- 为内置预设和存量 definition 显式写入 `schemaVersion`，验证数据迁移后删除缺失版本 fallback。
- 审计 AI provider 和 Start 输入 fallback；只删除已有完整替代覆盖的旧业务路径。
- 扩展 release checker，首次外部发布要求零旧路径、零旧 API 和零隐式数据 fallback。

验收标准：

- 公共包只保留 `src/` 中的一套实现，仓库内旧源码路径引用为零。
- production、test、fixture 和文档只使用正式请求、实例 registry 和 `Workflow*` 类型。
- 公共 `ExecutionContext` 不固定承载宿主服务，能力全部通过明确 port/capability 注入。
- 预设与用户 definition 数据迁移不会改变 node ID、preset ID、edge、workspace 归属和运行结果。
- `resource` 现行端口和环境容错不被误判为旧兼容；AI fallback 只有在行为矩阵通过后删除。
- 全部工作流检查、消费者检查、类型检查、定向测试、lint、Prettier 和 diff 检查通过。

详细清单和七个实施批次见 [工作流旧版兼容清理计划](./legacy-removal-plan.md)。

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

### Package 与边界测试

- 公共包独立 build、declaration 和 exports 校验。
- 禁止 Electron、React、Drizzle 和宿主应用私有依赖进入公共包。
- 多 runtime 实例隔离、capability 预检和全局执行组限流。
- tarball fixture 安装、第三方节点注册、执行、取消和事件订阅。
- Phase 11 前验证宿主应用旧入口；Phase 11 完成后改为验证旧入口不可再导入、迁移后的预设和运行记录仍正确。

### 回归测试门槛

```text
pnpm exec tsc --noEmit --pretty false
pnpm lint
pnpm exec vitest run
```

工作流测试不能依赖未导出的内部路径；所有新增行为必须有最小回归测试。Phase 10 的真实 tarball consumer 同时执行严格类型检查、运行时检查和深层导入拒绝检查，不依赖仓库内 path alias。

## 6. 实施约束

- Phase 6 从包边界和公共 contract 开始，不同时重写全部业务节点。
- 先建立兼容导出和实例 API，再按能力域迁移宿主应用 adapters，最后清理旧入口。
- 数据库字段变更必须先修改 schema，再执行 `pnpm db:generate`，并检查 migration。
- Phase 6 至 Phase 10 默认不修改现有数据库模型；包化、目录移动和 adapter 提取本身不构成数据库升级理由。
- Phase 11 的 `schemaVersion` 工作预计是 definition JSON 内容迁移，不默认修改数据库表字段，也不能通过启动 `dev` 隐式完成。
- 每个阶段保持可构建、可测试；阶段之间使用小步提交，便于回滚。
- 不改变现有 workflow JSON、node ID、preset ID 和预设业务意图；定义迁移必须保留旧数据可运行性。
- 首个公共版本只支持 Node.js 18+ 和 ESM，不同时承诺浏览器、分布式 worker 或崩溃断点恢复。

## 7. 当前执行队列

- [completed] Phase 1：运行结果契约、最终输出、条件分支、生命周期和取消。
- [completed] Phase 1 回归测试：引擎、调度器、AI 工作流工具和 Electron 无关运行路径。
- [completed] Phase 2：schema version、定义/请求 schema、结构化错误和端口输入协议。
- [completed] Phase 3：workspace 隔离和持久化一致性。
- [completed] Phase 4：core 规划/调度/状态/事件/registry、application service、Electron/资源适配器、节点 runtime service ports 和 client hooks 均已拆分并完成独立回归。
- [completed] Phase 5：并发调度、有序持久化、运行与日志缓存、临时目录、脱敏限流、数据库历史保留、真实取消链和 attempt 级可观测性均已实施并完成定向回归。
- [completed] Phase 6：独立 manifest/build、公共 contracts/application/ports/SDK、稳定 exports、testing store、真实 tarball consumer 和依赖边界检查均已完成。
- [completed] Phase 7：registry/runtime 实例隔离、capability system、通用运行请求、timeout/retry/idempotency、命名执行组限制、测试 fakes 和 tarball runtime consumer 均已完成。
- [completed] Phase 8：私有包、26 个业务节点、7 个 plugin、全部 capability adapters、SQLite/预设 store、composition、执行组和兼容边界均已完成。
- [completed] Phase 9：公共 runtime facade、scheduler/Pi runtime 注入、Electron composition root、共享 IPC contract 和类型安全 renderer client 均已完成。
- [completed] Phase 10：公开 nodes/exports、生产导入迁移、manifest/ESM/declaration/side-effects/tarball 验收、严格类型 consumer、版本文档和兼容窗口均已完成。
- [pending] Phase 11：旧版兼容清理、源码归位、ExecutionContext 去宿主化、definition 数据迁移、业务 fallback 审计和零 legacy 发布门槛。

## 8. Phase 6 实施记录

### 第一批：公共 package 基线（已完成）

- 新增 `@chobits/workflow` manifest，声明 Node.js 18+、ESM、`files` 白名单和根/core/schema exports。
- 新增独立 TypeScript build，生成可由 Node 原生加载的 JavaScript、declarations、declaration maps 和 source maps。
- 新增 `src/index.ts`、`src/core.ts` 和 `src/schema.ts` 作为公开入口；现有 Electron `index.ts` 继续作为宿主应用兼容入口，不进入公共依赖闭包。
- 将公共闭包内部导入改为 Node ESM `.js` specifier，同时保留根 TypeScript/Vite 兼容。
- 以最小 `WorkflowPluginResourceResolver` 替代 `types.ts` 对宿主应用 `PluginResourceManager` 的直接引用。
- Paddle OCR runtime 改为只要求 `getModelPath` port，不再要求完整插件管理器类。
- scheduler 和 AI workflow tool 显式使用宿主应用兼容入口，避免 package 根入口反向暴露 Electron 组合逻辑。
- 新增基于 TypeScript parser 的公共依赖图检查；第一批公共闭包当时包含 15 个源码文件，只允许 Node 内置模块和 `zod`。
- 根项目新增 `pnpm workflow:check` 和 `pnpm workflow:build`，package build/check 会自动执行边界检查。

验证结果：

```text
pnpm workflow:check                         passed
pnpm workflow:build                         passed
Node ESM dist import smoke                  passed
pnpm --dir packages/workflow pack           passed; tarball only contains dist, package.json and README.md
pnpm exec tsc --noEmit --pretty false       passed
pnpm exec vitest run <workflow entry set>   34 files / 112 tests passed
pnpm exec eslint <Phase 6 first batch>      passed
pnpm exec prettier --check <changed files>  passed
pnpm db:generate                            not run (no schema changes)
```

### 第二批：公共 contract、ports、SDK 与消费者验收（已完成）

- 将 definition、run、validation、event 和 error contract 拆入 `src/contracts/`；旧 `types.ts` 改为兼容聚合门面，保留原有类型名称和 draft 类型。
- 建立 `application`、`ports` 和 `sdk` 公共边界；store/runtime service 由接口注入，第三方节点和 plugin 可通过 `defineNode`、`definePlugin` 定义。
- 增加 `contracts`、`application`、`ports`、`sdk`、`node` 和 `testing` package exports，所有入口均参与独立 declaration build 和依赖闭包检查。
- 增加 `InMemoryWorkflowApplicationStore`，覆盖默认 workspace、读写隔离、深拷贝、运行筛选/排序/限制和删除。
- 边界检查从 package exports 动态发现入口；当前公共依赖闭包为 35 个源码文件，只允许 Node 内置模块和 `zod`。
- 增加真实 tarball consumer fixture；隔离项目只通过公开 exports 完成 Start 到第三方节点执行、状态订阅、取消、application service 和 memory store 调用。
- package 当前版本为 `0.1.0`，只承诺 `package.json` 中的 exports；旧宿主应用根入口和 `types.ts` 在迁移期继续兼容，深层源码路径不属于公共 API。

本批没有进入 Phase 7：registry/runtime 仍是当前兼容实现，实例隔离、capability、scope/context、timeout/retry 和全局执行组限制尚未实施。

第二批验证结果：

```text
pnpm workflow:check                         passed; 35 source files in public closure
pnpm workflow:build                         passed
pnpm workflow:test:consumer                 passed; real tarball installed and executed
pnpm exec tsc --noEmit --pretty false       passed
pnpm exec vitest run test/*workflow*        35 files / 116 tests passed
pnpm exec eslint <Phase 6 changed files>    passed
pnpm exec prettier --check <changed files>  passed
git diff --check                            passed
pnpm db:generate                            not run (no database schema changes)
```

## 9. Phase 7 实施记录

### 第一批：registry 与 engine 实例隔离（已完成）

- 将模块级节点/plugin Map 封装为可实例化的 `WorkflowRegistry`，并提供 `createWorkflowRegistry({ nodes, plugins })`。
- `WorkflowEngineOptions` 支持显式传入 registry，engine 的定义校验、依赖检查、plugin 准备和节点执行只读取自己的 registry。
- 旧 `registerNode`、`registerPlugin`、`getNode`、`getPlugin` 和无 registry 的 `createEngine` 继续代理默认 registry，保留现有调用方行为。
- 宿主应用 `initWorkflowSystem` 改为在 composition root 创建私有 registry 后注入 engine，不再把业务节点注册到公共默认实例。
- tarball consumer 改用私有 registry；新增同进程双 engine 测试，两个 registry 可以注册相同 node/plugin ID 并分别得到自己的结果。

本批只完成 registry/engine 生命周期隔离。`createWorkflowRuntime`、application facade 生命周期、capability、scope/context、timeout/retry、clock/ID factory 和全局执行组限制尚未实施。

第一批验证结果：

```text
pnpm workflow:check                         passed; 35 source files in public closure
pnpm workflow:build                         passed
pnpm workflow:test:consumer                 passed with an isolated registry
pnpm exec tsc --noEmit --pretty false       passed
pnpm exec vitest run test/*workflow*        36 files / 119 tests passed
pnpm exec eslint <Phase 7 first batch>      passed
pnpm exec prettier --check <changed files>  passed
pnpm db:generate                            not run (no database schema changes)
```

### 第二批：runtime facade、能力系统与执行策略（已完成）

- 新增 `@chobits/workflow/runtime` 公开子路径，以 `createWorkflowRuntime` 收口 registry、engine、application service、store、capability、事件、活动运行、持久化队列和 dispose 生命周期。
- runtime 提供 `execute/start/run/validate/cancel/flush/dispose`；store 的可选 `saveRun` 按事件顺序接收快照，`flush()` 报告写入失败，`dispose()` 取消活动运行并等待完成。
- 新增 `WorkflowRunRequest` 的 `definitionId/definition/input/scope/trigger/actor/context/configOverrides` contract 和 Zod parser；旧 `defId/input/metadata` 会映射 workspace、resource、folder 和 trigger，既有调用方无需修改数据。
- 新增类型化 `defineCapability` token、`WorkflowCapabilities` resolver 和节点 `requiredCapabilities`；校验返回结构化 `missing-capability`、`capabilityId` 和聚合的 `missingCapabilities`，engine 直接运行也有缺失能力防护。
- engine 支持注入 `WorkflowClock`、`WorkflowIdFactory` 和 `WorkflowExecutionLimiter`；testing 子路径新增 `FakeWorkflowClock` 和 `FakeWorkflowIdFactory`。
- 节点可声明 `timeoutMs`、命名 `group`、`idempotent` 和 retry/backoff。只有显式幂等节点允许多次尝试，每次尝试得到独立取消信号，重试沿用稳定的 `runId:nodeId` 幂等键。
- 新增 runtime 级执行组 limiter，在多个 run 间执行 FIFO 限流、排队取消和幂等 lease 释放；单 workflow 的拓扑并发仍由定义的 `options.concurrency` 控制。
- 新增 Phase 7 专项契约测试，覆盖 capability、规范/旧请求、上下文、clock/ID、timeout、retry、执行组、跨 workspace 取消、持久化和 dispose。
- 升级真实 tarball consumer，只通过公开 exports 创建 runtime、注册第三方 capability/节点，验证规范请求、事件、持久化、取消和销毁。
- 保留旧 engine、application service、默认 registry、宿主应用 composition root 和旧请求行为；本阶段没有进入 Phase 8 业务节点迁移。

Phase 7 完成验证：

```text
pnpm workflow:check                         passed; 47 source files in public closure
pnpm workflow:build                         passed; Node ESM and declarations generated
pnpm workflow:test:consumer                 passed; packed tarball installed and executed
pnpm exec tsc --noEmit --pretty false       passed
pnpm exec vitest run test/*workflow*        37 files / 127 tests passed
pnpm exec eslint <Phase 7 files>            passed
pnpm exec prettier --check <Phase 7 files>  passed
git diff --check                            passed
pnpm dev                                    not run
pnpm db:generate                            not run (no database schema changes)
```

## 10. Phase 8 实施记录

### 第一批：私有扩展包与资源只读能力（已完成）

- 新增 private `@workflow/integrations` 包，提供 `capabilities`、`adapters` 和 `nodes` 源码 exports，并通过独立 TypeScript check 约束私有扩展边界。
- 根 TypeScript、Vite 和 Vitest 配置增加仓库内 package alias；根脚本增加 `pnpm workflow:integrations:check`。
- 新增 `WORKFLOW_RESOURCE_READ` 类型化 capability，定义 resource、folder、workspace 的只读 contract；adapter factory 只依赖显式传入的 repository ports。
- 将 `resource/load` 和 `resource/collect-folder-texts` 的真实实现迁入私有包，保留既有 node ID、端口、输出和行为。
- 原 `packages/workflow/nodes/*` 路径改为兼容转发，既有导入、预设 JSON 和节点聚合入口无需变化。
- 宿主应用 composition root 使用现有 repositories 创建 capability resolver 并注入 engine；公共 `@chobits/workflow` 不反向导入私有包。
- 新增 fake repository adapter、缺失 capability、runtime 注入执行及旧路径对象一致性测试；旧 `ExecutionContext.services` 测试继续覆盖尚未迁移节点。

本批只建立资源只读能力域样板；后续批次已在同一 Phase 8 中完成。未修改数据库 schema 或 migration，未运行应用开发服务器或数据库生成命令。

第一批验证结果：

```text
pnpm workflow:integrations:check                 passed
pnpm workflow:check                         passed; 47 source files in public closure
pnpm workflow:build                         passed
pnpm workflow:test:consumer                 passed; packed tarball installed and executed
pnpm exec tsc --noEmit --pretty false       passed
pnpm exec vitest run test/*workflow*        38 files / 129 tests passed
pnpm exec eslint <Phase 8 first batch>      passed
pnpm exec prettier --check <Phase 8 files>  passed
git diff --check                            passed
pnpm dev                                    not run
pnpm db:generate                            not run (no database schema changes)
```

### 第二批：资源写入与持久化私有化（已完成）

- 新增 `WORKFLOW_RESOURCE_WRITE`，统一资源创建、更新、URL 下载、workspace 文件复制、字幕 sidecar 复制和运行上下文更新。
- `resource/create` 与 `resource/update` 不再通过带 callback 的 engine 事件访问宿主；旧资源事件 adapter 改为复用相同 capability 实现。
- Start 节点通过可选 resource read/write capability 完成资源补全和 folder/workspace context 更新，不再读取 `ExecutionContext.services`，纯文本/文件/URL 模式不被强制绑定资源库。
- SQLite/Drizzle definition/run store、运行历史清理和预设 JSON loader 的真实实现迁入私有 `persistence/`；旧 `store.ts` 只保留兼容转发。
- Electron HTML screenshot adapter 的真实实现迁入私有 adapters，旧路径只保留兼容转发。

### 第三批：业务节点、plugin 与能力域迁移（已完成）

- 新增 `WORKFLOW_AI`、`WORKFLOW_LOCAL_PROCESSING`、`WORKFLOW_OCR` 和 `WORKFLOW_RENDERING`，分别注入 AI/usage、本地 engine/plugin resource、PaddleOCR 和 HTML screenshot。
- 将 AI、media、ASR、OCR、rendering、display、Start 和资源写节点的真实实现迁入私有包；私有包当前统一维护 26 个宿主应用节点。
- 将 FFmpeg、Whisper、Fast Whisper、FunASR、Parakeet、Tesseract 和 PaddleOCR 共 7 个 plugin 的真实实现迁入私有包。
- AI、资源、媒体、ASR、OCR 和 rendering 节点声明类型化 capability 与命名执行组；display 与文档转换等不访问宿主服务的纯节点不制造空 capability。
- 私有节点不再访问 `ExecutionContext.services`；旧 runtime service 字段仅作为公共兼容 contract 保留。

### 第四批：composition、兼容入口与边界验收（已完成）

- 新增 `workflowIntegrationNodes`、`workflowIntegrationPlugins`、`createWorkflowIntegrationCapabilities` 和 `createWorkflowIntegrationExecutionLimiter`，宿主应用入口只组合 adapter 实例与通用节点。
- 默认执行组限制为 `resource-io=4`、`ai=4`、`ffmpeg=2`、`local-asr=1`、`ocr=1`、`rendering=2`，并补充跨 run 排队验证。
- 私有 package exports 按 capability、adapter、node domain、plugin、persistence 和 composition 拆分，单个兼容节点不会加载无关 AI/Electron 域。
- 26 个旧业务节点文件、7 个 plugin 文件、store 和宿主 adapter 路径只保留兼容转发，node ID、preset JSON、preset ID 和运行记录映射保持不变。
- 新增私有边界脚本，强制真实实现位置、20 个 capability 节点声明、公共源码无反向依赖、私有节点不使用 legacy services。

Phase 8 完成验证：

```text
pnpm workflow:integrations:check                 passed; 26 compatibility nodes / 20 capability nodes / 7 plugins
pnpm workflow:check                         passed; 47 source files in public closure
pnpm workflow:build                         passed
pnpm workflow:test:consumer                 passed; packed tarball installed and executed
pnpm exec tsc --noEmit --pretty false       passed
pnpm exec vitest run test/*workflow*        39 files / 131 tests passed
pnpm exec eslint <Phase 8 files>            passed
pnpm exec prettier --check <Phase 8 files>  passed
git diff --check                            passed
pnpm dev                                    not run
pnpm db:generate                            not run (no database schema changes)
```

## 11. Phase 9 实施记录

### 宿主组合、facade 注入与类型安全 IPC（已完成）

- 在公共 application 入口新增 `WorkflowRuntimeFacade` 和 `WorkflowPluginManifest`，统一定义查询、保存、删除、校验、节点 manifest/dynamic fields、运行、取消、历史、日志和持久化 flush；宿主调用方不再读取 engine、registry 或 store 实例。
- 在 `electron/main/workflow` 建立真实 composition root、主进程生命周期入口和 IPC transport adapter，装配宿主应用 capabilities、节点、plugin、SQLite/预设 store、资源 adapters、运行持久化和窗口事件。
- `packages/workflow/index.ts` 和 `packages/workflow/ipc-adapter.ts` 改为兼容转发，旧导入路径与现有调用行为继续保留。
- scheduler 通过 `initScheduler(runtime)` 接收 facade；Pi tool context 通过 `configurePiWorkflowRuntime(runtime)` 接收同一 facade。两个领域仍分别维护触发规则、等待策略、后台执行和结果格式。
- 在私有包建立 transport-neutral workflow client、共享 IPC request/result/event map，以及 19 个 `wf:*` invoke 通道和 4 个 workflow event 通道的唯一常量定义。
- renderer 新增统一 transport 绑定，Workflow Builder、运行历史、资源/库存菜单、任务列表、自动化和 AI provider 提示均迁移到类型安全 client；源码不再直接调用 `ipcRenderer.invoke/on/off('wf:*')`。
- 公共 run event coordinator 改用语义化 broadcast port，由 Electron composition root 映射为宿主事件通道，公共包不持有宿主应用 IPC 字符串。
- 私有边界检查增加宿主入口、legacy 转发、scheduler/Pi 注入和 renderer IPC 使用规则，防止后续重新引入跨层依赖。

Phase 9 完成验证：

```text
pnpm workflow:integrations:check                 passed; 26 compatibility nodes / 20 capability nodes / 7 plugins
pnpm workflow:check                         passed; 47 source files in public closure
pnpm workflow:build                         passed
pnpm workflow:test:consumer                 passed; packed tarball installed and executed
pnpm exec tsc --noEmit --pretty false       passed
pnpm exec vitest run <Phase 9 workflow set> 41 files / 141 tests passed
pnpm exec eslint <Phase 9 core files>       passed
pnpm exec eslint --quiet <migrated UI>      passed
pnpm dev                                    not run
pnpm db:generate                            not run (no database schema changes)
```

## 12. Phase 10 实施记录

本节保留 Phase 10 完成时的决策和验证原貌。其中 `0.1.x` 兼容窗口是当时的发布方案；公共包在尚未外部发布的前提下已由 Phase 11 决策取代，不能再作为当前保留旧入口的依据。

### 发布边界、消费者验收与兼容策略（已完成）

- 新增 `@chobits/workflow/nodes`，公开 End、Condition、JSON parse/stringify 和 TextOutput 五个无宿主依赖节点；宿主应用 resource-aware Start 继续留在私有包，不改变既有 `core/start` 语义。
- production renderer 的工作流定义、draft、run 和 validation 类型统一迁到 `@chobits/workflow`；Electron workflow host 的 application、engine、registry、schema、sanitize、类型和通用节点改用公开 exports。
- 新增 release boundary checker，冻结 12 个允许 exports，并校验包名、`0.1.x` 版本、Node 18+、ESM、`sideEffects: false`、publish access、files 白名单、依赖集合、生产深层导入和 source map 敏感路径。
- build 后由 Node 逐个加载所有公开 ESM 入口，并确认每个 declaration/import target 存在；公共依赖闭包当前为 53 个源码文件。
- 新增 tar archive 结构校验，拒绝越界路径、软链接、源码、fixture、script、cache、数据库和环境文件；包上限固定为 256 个文件、解压后 5 MiB。
- 隔离 consumer 会离线安装真实 tarball，在 `skipLibCheck: false` 下编译 TypeScript，并验证第三方节点、capability、store、运行、取消、事件、持久化、dispose 和深层导入拒绝。
- 将 Node declarations 所需的 `@types/node` 声明为 package dependency，消费者不需要依赖宿主应用根仓库提供类型环境。
- 新增公共 API/节点 SDK/adapter 指南和发布/版本策略，明确 `0.1.x` 内不破坏 exports；legacy request、默认 registry 和宿主应用源码门面最早在 `0.2.0` 且满足生产导入清零、一次应用发布周期和迁移说明后移除。
- 新增根命令 `pnpm workflow:release:check`。该命令和 consumer 只构建、打包并使用系统临时目录，不发布 package、不启动 Electron，也不执行数据库操作。

Phase 10 完成验证：

```text
pnpm workflow:release:check                 passed; 12 exports / 53 source files
pnpm workflow:test:consumer                 passed; 215 files / 350661 uncompressed bytes
                                              runtime + strict TypeScript + deep import rejection passed
pnpm workflow:integrations:check                 passed; 26 compatibility nodes / 20 capability nodes / 7 plugins
pnpm workflow:check                         passed; 53 source files in public closure
pnpm workflow:build                         passed
pnpm exec tsc --noEmit --pretty false       passed
pnpm exec vitest run <Phase 10 workflow set> 41 files / 142 tests passed
pnpm exec eslint <Phase 10 files>           passed
pnpm exec prettier --check <Phase 10 files> passed
git diff --check                            passed
pnpm dev                                    not run
pnpm db:generate                            not run (no database schema changes)
```

兼容源码门面在本阶段没有强制删除，因为此前承诺的兼容窗口刚建立。production 已不再通过 repository alias 使用公共类型或实现，保留门面也不会进入 tarball；按移除门槛处理比立即删除更符合版本兼容策略。

## 13. Phase 1-5 已完成记录

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
- DAG planner、分层并发调度器、运行状态机、事件类型和 registry 已下沉到 `core/`；Phase 7 后新调用方使用实例 registry/runtime，根路径 singleton 只保留为旧调用方兼容门面。
- 纯执行调度器负责拓扑层内分批并发、取消和 fail-fast；同批已启动节点允许完成，后续批次不再调度。运行状态机统一处理节点迁移、取消、未调度节点、终态和多终端输出冲突。
- Phase 4 曾以 `ExecutionContext.services` 提供资源、workspace 和 HTML 截图端口；Phase 8 已将现有宿主应用节点迁为 capability，legacy services 仅保留在公共兼容 contract。
- HTML 截图已提取到 Electron adapter，并接入 `AbortSignal`；文本图片和学习卡节点保留各自的内容高度与进度语义。
- AI 对话、提示词优化、图片理解、图片生成和音乐生成节点会把 workflow `AbortSignal` 传到请求层；Pi 非流式/流式文本、coding session、OpenAI 图片 SDK、音乐和歌词 provider 均执行真实取消，legacy provider 也使用同一信号。
- 被取消的 legacy workflow AI 请求以及 Pi 图片、音乐和歌词请求会将用量事件记录为 `cancelled`，不再误归类为 `failed`。
- 数据库按 workspace 自动清理 90 天前或超出最近 1000 条上限的终态运行；活动运行不参与清理，删除按 250 条分批且同一 workspace 最多每小时触发一次。
- 节点状态持久化当前 `attempt` 和有界 attempt 摘要，记录每次执行的状态、时间、耗时、错误及稳定 `errorReason`；新 attempt 不会继承上一轮的终态字段。
- 结构化运行日志会关联 `runId / nodeId / attempt / errorReason`；workflow AI 请求 ID、analytics metadata 和用量事件沿用同一 attempt，并映射到从 0 开始的 `attemptIndex`。
- Pi 非流式和流式文本执行补齐成功、失败、取消用量事件，与图片、音乐及歌词路径保持一致的工作流追踪维度。
- Phase 4 曾将 `packages/workflow/index.ts` 从 924 行降至 257 行；Phase 9 已把真实 composition root 继续迁入 `electron/main/workflow`，该旧入口现在只保留兼容转发。
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
宿主应用 app.db/app-dev.db main timestamps   unchanged; app-dev WAL already had a schema-equivalent 0022 with an earlier SQL hash, and its workspace/run tables were empty
```

### 下一步

Phase 1 至 Phase 10 已全部完成，Phase 11 待实施。下一步先按 [工作流旧版兼容清理计划](./legacy-removal-plan.md) 完成七个批次，再确定首次外部发布版本、registry、package scope、凭据和 release notes。Phase 11 默认不修改数据库表结构，但会涉及内置预设和存量 definition JSON 的显式数据迁移；不会通过运行 `dev` 隐式升级。

Phase 1-5 验收时记录过 onboarding/sprite、selected-text、scheduler storage、资源签名和 Electron mock 等仓库级历史基线，以及 `dist-electron`、`.vscode` 和历史源码 lint 问题。它们不属于工作流包化范围；Phase 6-10 使用独立 build、consumer 和定向回归区分该历史记录。
