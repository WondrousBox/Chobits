# 工作流旧版兼容清理计划

## 1. 决策与状态

Phase 11 的目标是在 `@chobits/workflow` 首次向外部 package registry 发布前，清除仓库内为 Phase 6-10 迁移保留的旧源码入口、旧请求字段、默认单例和宿主字段，使公共包只保留一套正式 contract、实现和扩展方式。

当前公共包版本虽为 `0.1.0`，但尚未执行外部发布，也没有外部消费者兼容承诺。因此可以撤销此前“完整保留 `0.1.x` 兼容窗口”的内部计划。首次外部发布后才开始按 SemVer 管理已发布 exports 和可序列化 contract。

本决策不等于直接删除所有 fallback。必须区分三类内容：

1. 源码迁移兼容：旧导入路径、类型别名、请求字段和单例 API，调用方迁移后删除。
2. 存量数据兼容：已保存 definition 和 preset 的 schema，完成显式数据迁移后删除读取 fallback。
3. 现行业务容错：provider、媒体目录、文件名和 OCR 等运行 fallback，只能在替代路径覆盖完整后按独立业务变更处理。

Phase 11 尚未实施。本文档是删除范围、顺序和验收门槛，不把计划中的目标写成当前事实。

## 2. 清理原则

- 公共内核只保留通用 workflow contract、DAG、状态机、调度、runtime 生命周期、ports、SDK 和通用节点。
- 宿主资源、AI、媒体、OCR、plugin resource、SQLite 和 Electron 能力只通过 `@workflow/integrations` 或 `electron/main/workflow` 接入。
- 一个能力只保留一个正式源码位置，不保留同名实现、转发文件或深层导入。
- production、test、fixture 和文档在同一批次迁移；不能为了让旧测试继续运行而长期保留生产兼容 API。
- 用户数据的兼容责任高于源码路径清理。没有完成存量 definition 审计和迁移时，不删除 schema 读取 fallback。
- node ID、preset ID 和现行端口语义不是源码兼容债务。需要变化时必须提供显式定义迁移。
- Phase 11 默认不修改数据库表字段。若实施中确认必须改表，先修改 `electron/main/db/schema.ts`，再执行 `pnpm db:generate` 并检查生成 migration。

## 3. 可以删除的源码兼容项

以下内容在调用方迁移完成后删除，不进入首次外部发布基线。

### 3.1 业务节点、plugin 和 adapter 转发

- `packages/workflow/nodes/` 中 26 个宿主业务节点转发，以及 `ai-workflow-utils.ts`。
- `packages/workflow/plugins/` 中 7 个 plugin 转发。
- `packages/workflow/runtime/paddle-ocr-models.ts` 和 `paddle-ocr-runtime.ts`。
- `packages/workflow/store.ts`、`html-screenshot-adapter.ts` 和 `resource-event-adapter.ts`。
- `packages/workflow/index.ts` 和 `ipc-adapter.ts` 两个 Electron host 转发入口。
- `packages/workflow/registry.ts` 旧聚合入口。
- `packages/workflow/nodes/index.ts` 与 `plugins/index.ts` 的旧聚合关系。

删除前将测试和剩余调用方分别迁到 `@chobits/workflow` 已声明 exports、`@workflow/integrations` 或 `electron/main/workflow`。通用节点的真实实现先归入 `packages/workflow/src/nodes/`，不能随旧业务节点目录一起误删。

### 3.2 Legacy run request 与 IPC 字段

删除以下兼容面：

- `WorkflowLegacyRunRequest`。
- `normalizeWorkflowRunRequest()`。
- runtime 对 `defId`、`def` 和 `metadata` 的接收与映射。
- `workflowRunRequestSchema` 等仅解析旧请求结构的 schema。

宿主 IPC、renderer client 和调用方统一使用：

| 旧字段     | 正式字段       |
| ---------- | -------------- |
| `defId`    | `definitionId` |
| `def`      | `definition`   |
| `metadata` | `context`      |

`input` 本身是正式字段，不删除。`workspaceId` 在运行请求边界映射为 `scope: { kind: 'workspace', id }`；`resourceId`、`folderId` 等宿主信息进入 `context` 或对应私有 capability，不再扩展公共请求顶层字段。

### 3.3 默认 registry 与旧类型别名

删除模块级共享状态：

- `defaultWorkflowRegistry`。
- `registerNode/getNode/listNodes`。
- `registerPlugin/getPlugin/listPlugins`。
- engine 的 `options.registry || defaultWorkflowRegistry` fallback；registry 改为显式必填依赖。

生产 composition 已使用实例 registry。实施时将仍依赖默认 registry 的测试改为每个测试创建独立实例。

删除 `ValueType`、`PortSchema`、`NodeSpec`、`NodeConfig`、`NodeInstance`、`Edge`、`ExecutionStatus`、`NodeRunStatus`、`NodeRunState` 等无前缀旧别名，调用方统一使用对应 `Workflow*` 正式类型。`types.ts` 在所有导入迁移后删除，不再作为公共或仓库内部聚合门面。

### 3.4 未使用 façade 与 no-op

删除 `electron/main/workflow/index.ts` 中没有 production 调用的旧 façade：

- `executeWorkflow`
- `startValidatedWorkflow`
- `startWorkflow`
- `runWorkflow`
- `getWorkflow`
- `listAllWorkflowDefinitions`

保留实际生命周期入口 `initWorkflowSystem`、`getMainWorkflowRuntime` 和 `flushWorkflowPersistence`。删除无调用且不执行任何工作的 `WorkflowStore.flushStore()`。

## 4. 公共 ExecutionContext 收紧

公共 `ExecutionContext` 当前仍携带 Phase 4 遗留的宿主字段。Phase 11 将下列能力迁入私有 capability 后从公共 contract 删除：

- `WorkflowRuntimeServices` 与 `services`。
- `ffmpegPath` 和 `ffprobePath`。
- `getResourceProjectDirs` 与相关公共资源目录类型。
- `pluginResourceManager`。

`pluginResourceManager` 的概念仍是本地媒体和 OCR 节点需要的宿主能力，但不应是公共 workflow execution context 的固定字段。它应由 `WORKFLOW_LOCAL_PROCESSING`、`WORKFLOW_OCR` 或更窄的私有 capability 提供。

`workspaceId`、`folderId` 和 `resourceId` 先迁到规范的 `scope/context` 访问方式；确认全部节点和 adapter 不再直接读取这些顶层字段后，再从公共 `ExecutionContext` 删除。公共上下文最终只保留通用运行身份、临时目录、取消信号和规范请求上下文。

## 5. 源码归位

Phase 6-10 已建立公开 `src/` 入口，但部分公开实现仍由 `src/` 反向导出顶层旧文件。Phase 11 同时完成物理源码归位，避免“新入口、旧实现目录”长期并存。

- DAG、registry、engine、application、contracts、runtime、ports、SDK、schema、通用节点、脱敏和进度等公共实现归入 `packages/workflow/src/` 的对应领域。
- `resource-project-adapter.ts` 等宿主资源实现归入 `packages/workflow-integrations`。
- `run-event-coordinator.ts` 等只负责 Electron 生命周期或广播组合的实现归入 `electron/main/workflow`。
- 通用且可复用的持久化队列、历史保留和任务结果扫描，按其依赖闭包分别归入公共 `src/`、私有 integrations 或 Electron host，不继续从生产代码深层导入顶层文件。
- `packages/ai/runtime/pi/tools/workflow-run.ts` 改用 `@chobits/workflow` 正式类型 export。
- `@workflow/integrations` 媒体节点不再深层导入 `packages/workflow/task-results.ts`。

归位是移动唯一实现，不是复制第二套实现。完成后 `packages/workflow/src/` 之外不再保留公共内核 TypeScript 源码和兼容转发文件；package 根只保留 manifest、构建配置、fixture、脚本、许可证和 README。

## 6. Definition 与预设数据迁移

`migrateWorkflowDefinition()` 当前会给缺少 `schemaVersion` 的 definition 补 `1`。该行为是存量数据读取兼容，不能与源码转发层同批直接删除。

仓库审计结果：

- `resources/workflows/preset.json` 当前包含 10 个预设。
- 10 个预设均缺少显式 `schemaVersion`。
- 仓库内没有可用于代表用户环境的 SQLite 数据库，无法仅凭源码确认用户保存 definition 的状态。

删除 schema fallback 前必须依次完成：

1. 为 10 个内置预设显式写入 `schemaVersion: 1` 并通过预设回归。
2. 建立一次性的 definition 数据审计和迁移，覆盖数据库中缺少 `schemaVersion` 的用户 definition。
3. 验证迁移可重复执行、不会改变 node ID、edge、配置、workspace 归属和业务结果。
4. 将 `WorkflowDefinition.schemaVersion`、draft 和 IPC 保存 contract 收紧为必填。
5. 删除 `migrateWorkflowDefinition()` 的“缺失即补 1”逻辑，并让缺失或未知版本返回明确校验错误。

这预计是 definition JSON 内容迁移，不要求数据库表结构变化，也不应通过运行 `dev` 隐式完成。若最终需要新的数据库 migration，仍严格执行 schema-first 和 `pnpm db:generate` 流程。

## 7. 不能作为旧版代码直接删除的项

以下内容当前仍承担真实业务语义，必须保留到独立覆盖条件满足：

### 7.1 AI provider fallback

AI 节点在 Pi runtime 不可用时仍可能调用 legacy `provider.chat` 等路径。删除前必须覆盖全部受支持 provider 和预设，并验证流式、非流式、取消、错误映射和 usage 统计均由 Pi 路径正确完成。Pi package 存在不能替代这组行为验收。

### 7.2 Start 输入与 `resource` 输出

- Start 节点把没有 `input.resource` 的整个 input 作为 resource，是待迁移的输入 fallback；完成调用方和预设审计后可以删除。
- `resource` 输出不是可以直接删除的旧字段。当前预设仍有 4 条 edge 使用该端口，display/resource 节点也消费它。若要收紧，必须同步迁移预设、下游节点和已保存 definition。

### 7.3 运行环境容错

媒体目录 fallback、FFmpeg PATH fallback、Whisper 输出文件名 fallback 和 OCR fallback 多数处理安装差异、外部工具差异或运行环境异常，不等同于旧工作流 API 兼容。只有确认替代路径覆盖受支持平台后才能单独删除。

## 8. Phase 11 实施批次

### 批次 1：生产导入清零与源码归位

- 迁移 `packages/ai`、`@workflow/integrations` 和 Electron composition root 的深层导入。
- 将公共、私有和 Electron helper 移入其最终所有者目录。
- 扩展边界检查，覆盖全部 production source，而不只检查 renderer 和部分 Electron 路径。

### 批次 2：删除转发文件

- 迁移仍引用旧节点、plugin、store、adapter 和 OCR runtime 路径的测试。
- 删除 26 个业务节点转发、AI utils 转发、7 个 plugin 转发、5 个 host/store/adapter 转发、registry 转发和 2 个 OCR runtime 转发。
- 重建通用节点公开入口，确认 node ID 与实现不变。

### 批次 3：统一正式 API

- IPC、renderer 和触发方统一为 `definitionId/definition/context`。
- 删除 legacy request、默认 registry、无前缀类型别名、未使用 Electron façade 和 store no-op。
- 更新 consumer、类型测试和所有工作流测试只使用正式 API。

### 批次 4：ExecutionContext 去宿主化

- 将 plugin resource、FFmpeg 和资源目录能力迁入私有 capability。
- 将资源身份迁到 `scope/context`。
- 删除公共 context 的宿主字段并增加边界规则防止回流。

### 批次 5：definition 数据迁移

- 更新 10 个预设并实现存量 definition 的显式数据迁移。
- 验证迁移和回滚策略后，将 `schemaVersion` 改为必填并删除读取 fallback。
- 本批不通过启动 `dev` 隐式升级数据。

### 批次 6：业务 fallback 审计

- 对所有支持的 AI provider 和 preset 建立 Pi 行为矩阵。
- 覆盖通过后删除 legacy AI provider fallback。
- 审计 Start 输入 fallback；`resource` 输出和运行环境容错按现行契约分别决定，不绑定源码清理进度。

### 批次 7：零 legacy 发布门槛

- release checker 拒绝旧路径、旧请求字段、默认 registry、旧类型别名和公共宿主字段。
- 私有边界检查覆盖 `packages/ai`、`packages/workflow-integrations`、Electron、renderer 和测试 fixture 的允许依赖。
- 全部验收通过后再确定首次外部发布版本、registry、scope、凭据和 release notes。

## 9. 验收标准

Phase 11 只有同时满足以下条件才算完成：

- production、test、fixture 和文档对旧源码路径的引用为零。
- `packages/workflow` 只保留 `src/` 中的一套公共实现，不存在兼容转发和反向导出旧实现。
- runtime 只接受 `WorkflowRunRequest`，IPC/client 使用同一正式字段。
- 每个 runtime 显式拥有 registry，不存在模块级默认 registry。
- 公共 exports 不再暴露无前缀旧类型别名和宿主业务字段。
- 内置预设和存量用户 definition 都有显式 `schemaVersion`，迁移结果通过回归后才删除 fallback。
- node ID、preset ID、现行 `resource` 端口和用户运行结果没有静默变化。
- AI legacy provider 路径只在替代行为矩阵全部通过后删除。
- `pnpm workflow:check`、`workflow:integrations:check`、`workflow:release:check`、`workflow:test:consumer`、TypeScript、工作流测试、lint、Prettier 和 `git diff --check` 全部通过。
- build、test 和 migration 验证过程不依赖启动 Electron `dev`。

## 10. 完成后的兼容策略

首次外部发布时，`package.json` exports、正式 `Workflow*` contract、错误码、runtime 生命周期和节点 SDK 才成为 SemVer 承诺。仓库内部路径、私有 integrations、Electron host 和 renderer client 始终不属于公共 package API。

发布后若需要不兼容变化，必须通过弃用、迁移说明和版本升级处理；不能再次引入永久转发层来掩盖边界变化。
