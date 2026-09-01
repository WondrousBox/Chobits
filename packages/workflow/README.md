# 工作流模块

## 当前状态

`packages/workflow` 已完成 Phase 6 至 Phase 10。当前具备独立 package build、12 个受控 exports、ESM/declarations、依赖和生产导入边界检查、实例 registry/runtime、类型化 capability、通用节点、内存 store、测试 fakes、runtime facade，以及真实 tarball 的 JavaScript/TypeScript consumer。宿主应用业务实现位于相邻的 `packages/workflow-integrations`，Electron composition root 位于 `electron/main/workflow`。公共包已达到技术发布边界，但 Phase 11 的旧版兼容清理和源码归位尚未实施，因此还不能执行首次外部发布。

后续目标不是让工作流与业务零耦合，而是把通用控制逻辑留在公共内核，把资源、AI、媒体、数据库和 Electron 能力改为由宿主通过 ports、capabilities 和 adapters 注入。

- 文档索引：[工作流文档](../../docs/workflow/README.md)
- 目标架构：[工作流目标架构](../../docs/workflow/architecture.md)
- 实施路线：[工作流系统优化实施计划](../../docs/workflow/implementation-plan.md)
- API 与扩展：[工作流公共 API 与扩展指南](../../docs/workflow/public-api.md)
- 发布策略：[工作流发布与版本策略](../../docs/workflow/release-and-versioning.md)
- 清理计划：[工作流旧版兼容清理计划](../../docs/workflow/legacy-removal-plan.md)

本文档同时说明当前代码和后续迁移边界。`createWorkflowRuntime`、`WorkflowRuntimeFacade` 及本页示例均为当前可用 API；宿主应用工作流集成层和 Electron/renderer 宿主接入已经完成。

## 产品用途

宿主应用使用工作流处理本地资源和长任务，主要入口包括：

- 可视化编辑器手动运行。
- 文件操作、资源菜单和批量资源处理。
- schedule、system event、resource event 和 manual automation。
- AI 工具同步等待或切换到后台执行。

内置节点覆盖资源读写、FFmpeg、ASR、OCR、AI、图片和结果展示。运行发生在 Electron main process，定义和历史按 workspace 持久化。

## 当前模块组成

```text
packages/workflow/
  package.json                  package 元数据和公开 exports
  tsconfig.build.json           独立 Node ESM/declaration 构建
  src/                          公共入口、contracts、application、ports、runtime、nodes、SDK 和 testing
  fixtures/consumer/            仅使用 package exports 的隔离消费者
  scripts/                      build、边界检查、打包和 consumer runner
  core/                         待在 Phase 11 归入 src 的 DAG、调度、状态机、事件和 registry 实现
  nodes/                        待归位的通用节点与待删除的宿主业务节点转发
  plugins/                      Phase 11 待删除的宿主应用 plugin 转发
  runtime/                      Phase 11 待删除的宿主应用 runtime 转发
  application-service.ts       定义、运行、取消和历史用例
  engine.ts                    执行器、校验和运行生命周期
  schema.ts                    定义和请求 schema
  types.ts                     Phase 11 待删除的旧类型门面
  store.ts                     Phase 11 待删除的 SQLite/预设 store 转发
  ipc-adapter.ts               Phase 11 待删除的 Electron IPC main 转发
  resource-event-adapter.ts    Phase 11 待删除的资源事件 adapter 转发
  run-event-coordinator.ts     持久化、广播、进度和生命周期
  run-persistence-queue.ts     有序持久化队列
  run-history-retention.ts     数据库运行历史保留策略
  sanitize.ts                  脱敏和有界快照
  index.ts                     Phase 11 待删除的 Electron workflow host 转发

packages/workflow-integrations/
  package.json                 私有宿主应用集成包元数据和源码 exports
  src/capabilities/            宿主应用类型化业务能力 contract
  src/adapters/                repositories/宿主服务到 capability 的适配
  src/nodes/                   26 个宿主应用节点真实实现
  src/plugins/                 7 个本地 engine/model plugin
  src/persistence/             SQLite/Drizzle store 与预设 loader
  src/ipc/                     宿主应用 IPC contract 与 renderer client
  src/composition.ts           capability resolver 和执行组组合

electron/main/workflow/
  composition-root.ts         宿主应用 runtime、capability、持久化和事件装配
  index.ts                    主进程 singleton 生命周期与 facade 注入
  ipc-main.ts                 类型化 IPC transport adapter

src/lib/workflow-client.ts    renderer transport 绑定
```

当前边界中的优点：

- `pnpm workflow:check` 可以独立检查 manifest、生产导入、公共类型和依赖闭包，`pnpm workflow:build` 可以生成 Node ESM、declarations 和 source maps。
- 所有公开 exports 的依赖闭包当前包含 53 个源码文件，只允许 Node 内置模块和 `zod`，不会加载 Electron、React、Drizzle 或宿主应用业务模块。
- `contracts`、`application`、`core`、`ports`、`runtime`、`schema`、`sdk`、`node`、`nodes` 和 `testing` 均有显式 package 子路径。
- definition、run、validation、event 和 error contract 已从兼容 `types.ts` 拆入公共目录，旧类型路径继续转发。
- `@chobits/workflow/testing` 提供 workspace 隔离且深拷贝数据的内存 store、fake clock 和 fake ID factory。
- `pnpm workflow:release:check` 会验证 12 个 exports、ESM/declarations、`sideEffects`、版本、依赖闭包、source map 和生产深层导入。
- `pnpm workflow:test:consumer` 会解析并检查真实 tarball，在系统临时目录离线安装，以严格 TypeScript 和 JavaScript 只通过公开 API 完成第三方节点/capability 注册、runtime 执行、事件订阅、持久化、取消和销毁。
- `createWorkflowRegistry` 和 `createWorkflowRuntime` 为每个实例提供独立的节点、plugin、capability、store、clock、ID、limiter 和生命周期；旧默认 registry 只保留为兼容门面。
- runtime 接受 `scope/trigger/actor/context` 规范请求，并临时兼容映射旧 `defId/def/metadata` 请求。
- 节点可声明 timeout、幂等 retry 和命名执行组；缺失 capability 会在执行前返回结构化校验错误。
- `core/` 中的规划、调度和状态函数可以独立测试。
- `WorkflowApplicationService` 通过 store port 组织用例。
- IPC、资源事件和运行事件已有 adapter 接口。
- 资源读写、AI、local processing、OCR 和 HTML render 均通过私有 capability 注入。
- 引擎不直接访问 Electron 或数据库。
- 26 个宿主应用节点和 7 个 plugin 的真实实现均位于私有包；旧节点/plugin/store/adapter 路径保持兼容。
- 私有 composition 配置 `resource-io`、AI、FFmpeg、local ASR、OCR 和 rendering 跨 run 限流。
- `pnpm workflow:integrations:check` 同时检查 26 个兼容节点、20 个 capability 节点、7 个 plugin、store 位置和公共包反向依赖。
- `WorkflowRuntimeFacade` 是 scheduler、Pi workflow tool 和 Electron IPC 的共同应用入口；调用方不读取 engine、registry 或 store 实例。
- 所有 `wf:*` IPC channel、请求、响应和事件集中在私有 client contract，renderer 页面只调用类型化 `workflowClient`。
- `electron/main/workflow` 持有真实 composition root，公共包旧 `index.ts` 和 `ipc-adapter.ts` 只保留兼容转发。
- renderer 与 Electron workflow host 中已有公开替代项的深层源码导入均已迁移；release check 会阻止回退。

Phase 11 前仍存在的临时兼容面：

- 公开 contract 仍保留 `workspaceId`、resource input、宿主 execution context 字段和部分 `any` 字段。
- runtime 仍映射 `defId/def/metadata`，并保留默认 registry、旧类型别名和宿主应用源码转发门面。
- 公共 `src/` 入口仍有一部分反向导出顶层实现，物理源码尚未完全归位。

这些内容不会保留到完整 `0.1.x`，而是在首次外部发布前按 Phase 11 清理。存量 definition 必须先显式迁移；AI、媒体和 OCR 的真实运行 fallback 不按源码兼容面直接删除。

## 公共入口

- `@chobits/workflow`：公共聚合入口。
- `@chobits/workflow/contracts`：可序列化定义、运行、校验、事件和错误类型。
- `@chobits/workflow/application`：定义、运行、取消和历史用例服务。
- `@chobits/workflow/core`：DAG、调度、状态、事件和实例 registry；当前默认 registry 将在 Phase 11 删除。
- `@chobits/workflow/ports`：store 与 runtime service 接口。
- `@chobits/workflow/runtime`：实例 runtime、capability resolver、clock/ID 默认实现和执行组 limiter。
- `@chobits/workflow/schema`：定义解析、迁移和请求 schema。
- `@chobits/workflow/sdk`：`defineNode`、`definePlugin`、`defineCapability` 及节点/plugin/capability 类型。
- `@chobits/workflow/node`：Node.js 引擎入口。
- `@chobits/workflow/nodes`：End、Condition、JSON parse/stringify 和 TextOutput 通用节点。
- `@chobits/workflow/testing`：内存 store 等测试实现。

当前 manifest 版本为 `0.1.0`，但尚未外部发布。消费者只应使用 `package.json` 中声明的 exports；包内深层源码路径不属于兼容承诺，并由 consumer 测试确认无法导入。Phase 11 会在首次发布前收紧正式 exports 和 contract；首次发布后才按 SemVer 承诺兼容性。

## 当前执行模型

当前工作流定义由以下主要字段组成：

```ts
interface WorkflowDefinition {
  id: string;
  name: string;
  // 当前类型仍为可选；Phase 11 完成存量数据迁移后改为必填。
  schemaVersion?: number;
  workspaceId?: string;
  nodes: NodeInstance[];
  edges: Edge[];
  options?: {
    concurrency?: number;
    errorStrategy?: 'fail-fast' | 'continue';
  };
}
```

引擎会：

1. 解析和迁移定义 schema。
2. 校验节点、边、端口、配置、默认值和 DAG。
3. 创建稳定 `runId` 和运行上下文。
4. 按拓扑层和 `concurrency` 调度节点。
5. 传递 `AbortSignal` 并处理 fail-fast/continue。
6. 按节点策略执行 timeout、幂等 retry 和 runtime 级命名执行组限流。
7. 记录 node attempt、进度、日志和终态。
8. 合并终端节点输出并清理临时资源。

## 当前可靠性保证

- 失败和取消会形成明确终态，不会被入口当作成功。
- 条件分支只执行命中路径，未命中节点标记为 skipped。
- 多终端同名输出返回明确冲突错误。
- 同一 run 的数据库写入按顺序串行化。
- 进度写入合并，节点状态和终态立即持久化。
- 日志、输入、输出和 metadata 会脱敏并限制大小。
- 内存运行和日志缓存有上限。
- 临时目录有保留和清理策略。
- 数据库终态历史按 workspace、时间和数量清理。
- 外部进程和 AI 请求尽量使用同一个取消信号。

## 当前主进程接入

Electron main 调用 `initWorkflowSystem`：

```ts
initWorkflowSystem({
  getWorkflowDefinitionsPath,
  ensureResourceProjectDir
});
```

`electron/main/workflow` 当前负责：

- 注册全部节点和插件。
- 创建 engine 和 application service。
- 绑定 SQLite store、资源 repositories 和 HTML render。
- 转发运行状态、日志、AppEvent 和精灵忙碌状态。
- 注册 `wf:*` IPC handlers。
- 向 scheduler 和 Pi session 注入 `WorkflowRuntimeFacade`。

旧 `packages/workflow/index.ts` 只转发到该宿主入口。公共 package exports 不包含 Electron composition root，其依赖闭包仍保持 Node-first。

## 当前 IPC 能力

共享 contract 维护以下通道：

- 定义：`wf:listDefinitions`、`wf:listPresets`、`wf:getDefinition`、`wf:saveDefinition`、`wf:deleteDefinition`
- 节点：`wf:listNodes`、`wf:getNodeConfig`、`wf:getNodeInputs`、`wf:getNodeOutputs`
- 校验和运行：`wf:validate`、`wf:run`、`wf:cancelRun`
- 历史：`wf:getRun`、`wf:listRuns`、`wf:deleteRun`、`wf:getRunLogs`
- 事件：`wf:run-status`、`wf:node-status`、`wf:run-log`

通道名称和请求/返回类型由 `@workflow/integrations/client` 定义，Electron IPC 只是 transport adapter，React 页面通过 `src/lib/workflow-client.ts` 调用和订阅，不再直接维护字符串或 `any` payload。

## 目标公共包边界

可发布的工作流包内部管理：

- definition schema 和迁移。
- DAG、端口、调度和状态机。
- runtime 实例和 run lifecycle。
- 取消、超时、可选重试和资源限制。
- 事件、日志、进度、脱敏和保留策略。
- store/capability ports。
- 节点 SDK、registry 和通用节点。

宿主注入：

- SQLite 或其他定义/运行存储。
- resource、folder、workspace。
- AI provider、secret、模型和 usage。
- 文件、artifact、FFmpeg、ASR 和 OCR。
- HTML render、Electron IPC 和 AppEvent。
- 权限、模型下载和产品 UI。

## Runtime 使用方式

以下 API 已由 `@chobits/workflow` 的公开 exports 提供：

```ts
import { createWorkflowRegistry } from '@chobits/workflow/core';
import { createWorkflowRuntime } from '@chobits/workflow/runtime';
import { defineNode } from '@chobits/workflow/sdk';
import { InMemoryWorkflowApplicationStore } from '@chobits/workflow/testing';

const StartNode = defineNode({
  spec: {
    id: 'core/start',
    label: 'Start',
    inputs: [],
    outputs: [{ key: 'text', type: 'string' }]
  },
  async run({ input }) {
    return input;
  }
});

const UppercaseNode = defineNode({
  spec: {
    id: 'example/uppercase',
    label: 'Uppercase',
    inputs: [{ key: 'text', type: 'string', required: true }],
    outputs: [{ key: 'result', type: 'string' }]
  },
  async run({ input }) {
    return { result: String(input.text).toUpperCase() };
  }
});

const runtime = createWorkflowRuntime({
  store: new InMemoryWorkflowApplicationStore(),
  registry: createWorkflowRegistry({ nodes: [StartNode, UppercaseNode] })
});

const record = await runtime.run({
  definition: {
    id: 'example:uppercase',
    name: 'Uppercase',
    nodes: [
      { id: 'start', type: StartNode.spec.id },
      { id: 'uppercase', type: UppercaseNode.spec.id }
    ],
    edges: [
      {
        id: 'start-uppercase',
        from: { nodeId: 'start', port: 'text' },
        to: { nodeId: 'uppercase', port: 'text' }
      }
    ]
  },
  input: { text: 'hello' },
  scope: { kind: 'workspace', id: 'workspace-1' },
  trigger: { type: 'manual' }
});

await runtime.dispose();
```

完整 capability、store 和 adapter 示例见 [工作流公共 API 与扩展指南](../../docs/workflow/public-api.md)。

所有消费者都应使用实例 registry/runtime；默认全局 registry 只是 Phase 11 删除前的临时迁移面。`runtime.events.subscribe(event, listener)` 返回取消订阅函数，`runtime.flush()` 等待运行快照写入，`runtime.dispose()` 取消活动运行并关闭实例。

## 节点开发原则

### 通用节点

End、Condition、JSON parse/stringify 和 TextOutput 已通过 `@chobits/workflow/nodes` 进入公共包。通用节点不能导入宿主应用 repository、AI provider、Electron 或 React。宿主应用 `core/start` 带资源输入语义，仍留在私有包；外部消费者应使用 SDK 定义符合自身输入协议的 Start。

### 业务节点

资源、AI、媒体、OCR 和展示节点留在宿主应用私有扩展，通过 capability token 获取业务能力。

当前写法：

```ts
const RESOURCES = defineCapability<ResourceCapability>('resources');

export const LoadResourceNode = defineNode({
  spec: {
    id: 'resource/load'
  },
  requiredCapabilities: [RESOURCES],
  execution: { timeoutMs: 30_000, group: 'resource-io' },
  async run({ capabilities, input }) {
    return capabilities.require(RESOURCES).getById(input.resourceId);
  }
});
```

节点必须声明：

- 稳定 ID 和版本。
- 输入、输出和配置 schema。
- capability 和 asset requirements。
- timeout、执行组和是否允许重试。
- 非兼容配置变化的迁移函数。

默认不自动重试有副作用的节点。

## 预设工作流

当前预设位于 `resources/workflows/preset.json`。Phase 11 会为 10 个内置预设补充显式 `schemaVersion`，保持 preset ID、node ID、edge 和业务结果不变；宿主应用预设不进入公共包。

公共包可以提供只包含通用节点的示例定义；业务预设由宿主随应用发布。

## 测试与发布门槛

当前回归仍使用仓库根测试配置。每批至少需要：

```text
pnpm workflow:check
pnpm workflow:build
pnpm workflow:release:check
pnpm workflow:test:consumer
pnpm exec tsc --noEmit --pretty false
pnpm exec vitest run <workflow tests>
pnpm exec eslint <workflow package and adapters>
pnpm exec prettier --check <workflow docs and sources>
```

还必须在独立 fixture 中安装 tarball，并验证：

- 不引用宿主应用源码即可创建 runtime。
- 可以注册第三方节点和 capability。
- 可以执行、取消和订阅运行。
- tarball 中所有 export 的 ESM 和 declaration target 都存在。
- 独立 TypeScript consumer 在 `skipLibCheck: false` 下通过。
- `src/`、`dist/` 深层导入被 package exports 拒绝。
- 公共根入口不会加载 Electron、React、Drizzle 或原生媒体依赖。
- 消费者不需要深层导入内部文件。

## 数据库约束

Phase 6 至 Phase 10 均没有修改或升级数据库。Phase 8 只移动既有 SQLite/Drizzle store 并通过 capability 适配 repositories，Phase 9 只迁移宿主组合和 IPC/client 边界，Phase 10 只加固发布边界；这些阶段都没有改变 definition/run schema。运行相关 build、test、pack 或 consumer 命令不会启动应用或执行数据库 migration。

如后续确需修改表字段，必须先修改 `electron/main/db/schema.ts`，再执行 `pnpm db:generate` 并检查生成 migration。
