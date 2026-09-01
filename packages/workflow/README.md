# 工作流模块

## 当前状态

`packages/workflow` 当前是 Chobits 根项目中的工作流源码目录，已经具备稳定的定义校验、DAG 执行、状态管理、取消、持久化队列和可观测性能力，但还不是可独立安装的发布包。

后续目标不是让工作流与业务零耦合，而是把通用控制逻辑留在公共内核，把资源、AI、媒体、数据库和 Electron 能力改为由宿主通过 ports、capabilities 和 adapters 注入。

- 文档索引：[工作流文档](../../docs/workflow/README.md)
- 目标架构：[工作流目标架构](../../docs/workflow/architecture.md)
- 实施路线：[工作流系统优化实施计划](../../docs/workflow/implementation-plan.md)

本文档同时说明当前代码和迁移目标。标记为“目标”的 API 或目录在对应实施阶段完成前不能视为已经存在。

## 产品用途

Chobits 使用工作流处理本地资源和长任务，主要入口包括：

- 可视化编辑器手动运行。
- 文件操作、资源菜单和批量资源处理。
- schedule、system event、resource event 和 manual automation。
- AI 工具同步等待或切换到后台执行。

内置节点覆盖资源读写、FFmpeg、ASR、OCR、AI、图片和结果展示。运行发生在 Electron main process，定义和历史按 workspace 持久化。

## 当前模块组成

```text
packages/workflow/
  core/                         DAG、调度、状态机、事件和 registry
  nodes/                        通用节点与 Chobits 业务节点
  plugins/                      FFmpeg、ASR、OCR 等插件检查
  runtime/                      当前仅有少量兼容转发
  application-service.ts       定义、运行、取消和历史用例
  engine.ts                    执行器、校验和运行生命周期
  schema.ts                    定义和请求 schema
  types.ts                     当前共享类型
  store.ts                     SQLite 与预设文件适配
  ipc-adapter.ts               IPC handler contract 映射
  resource-event-adapter.ts    资源事件适配
  run-event-coordinator.ts     持久化、广播、进度和生命周期
  run-persistence-queue.ts     有序持久化队列
  run-history-retention.ts     数据库运行历史保留策略
  sanitize.ts                  脱敏和有界快照
  index.ts                     当前 Electron composition root 和兼容入口
```

当前边界中的优点：

- `core/` 中的规划、调度和状态函数可以独立测试。
- `WorkflowApplicationService` 通过 store port 组织用例。
- IPC、资源事件和运行事件已有 adapter 接口。
- 资源、folder、workspace 和 HTML render 已有部分 runtime service 注入。
- 引擎不直接访问 Electron 或数据库。

当前尚未达到发布包要求的部分：

- 缺少独立 `package.json`、build、declaration 和 exports。
- registry 和 application service 使用模块级单例。
- `types.ts` 仍引用 Chobits plugin resource 类型，并混合 core、UI 和宿主字段。
- AI、OCR 和部分媒体节点直接导入其他业务包。
- `index.ts`、`store.ts` 和 HTML screenshot adapter 仍包含 Electron/数据库实现。
- renderer 直接深层导入类型并分散维护 `wf:*` IPC 字符串。

## 当前执行模型

当前工作流定义由以下主要字段组成：

```ts
interface WorkflowDefinition {
  id: string;
  name: string;
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
6. 记录 node attempt、进度、日志和终态。
7. 合并终端节点输出并清理临时资源。

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

当前入口负责：

- 注册全部节点和插件。
- 创建 engine 和 application service。
- 绑定 SQLite store、资源 repositories 和 HTML render。
- 转发运行状态、日志、AppEvent 和精灵忙碌状态。
- 注册 `wf:*` IPC handlers。
- 为调度器和 AI 工具提供兼容函数。

这属于过渡期 composition root。目标状态下，这些 Chobits 实现会迁入私有扩展和 Electron 宿主目录，公共包只导出实例化 runtime API。

## 当前 IPC 能力

当前 renderer 使用以下通道：

- 定义：`wf:listDefinitions`、`wf:listPresets`、`wf:getDefinition`、`wf:saveDefinition`、`wf:deleteDefinition`
- 节点：`wf:listNodes`、`wf:getNodeConfig`、`wf:getNodeInputs`、`wf:getNodeOutputs`
- 校验和运行：`wf:validate`、`wf:run`、`wf:cancelRun`
- 历史：`wf:getRun`、`wf:listRuns`、`wf:deleteRun`、`wf:getRunLogs`
- 事件：`wf:run-status`、`wf:node-status`、`wf:run-log`

目标状态下通道名称和请求/返回类型由共享 contract 定义，Electron IPC 只是 transport adapter，React 页面不再直接维护字符串和 `any` payload。

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

## 目标使用方式

以下为目标 API，不代表当前已经可调用：

```ts
const registry = createWorkflowRegistry();
registry.registerNode(StartNode);
registry.registerNode(EndNode);
registry.registerNode(customNode);

const runtime = createWorkflowRuntime({
  registry,
  definitions,
  runs,
  createRunScope,
  capabilities
});

const handle = runtime.start({
  definitionId: 'example',
  input: { text: 'hello' },
  scope: { kind: 'workspace', id: 'workspace-1' },
  trigger: { type: 'manual' }
});

const record = await handle.completionPromise;
```

公共 API 不使用全局 registry。每个 runtime 拥有自己的节点集合、能力和生命周期。

## 节点开发原则

### 通用节点

Start、End、Condition、JSON 等通用节点进入公共包。通用节点不能导入 Chobits repository、AI provider、Electron 或 React。

### 业务节点

资源、AI、媒体、OCR 和展示节点留在 Chobits 私有扩展，通过 capability token 获取业务能力。

目标写法：

```ts
const RESOURCES = defineCapability<ResourceCapability>('resources');

export const LoadResourceNode = defineNode({
  spec: {
    id: 'resource/load',
    requiredCapabilities: [RESOURCES]
  },
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

当前预设位于 `resources/workflows/preset.json`。包化期间保持现有 preset ID、node ID 和 JSON 兼容，不把 Chobits 预设放入公共包。

公共包可以提供只包含通用节点的示例定义；业务预设由宿主随应用发布。

## 测试与发布门槛

当前回归仍使用仓库根测试配置。包化后至少需要：

```text
pnpm exec tsc --noEmit --pretty false
pnpm exec vitest run <workflow tests>
pnpm exec eslint <workflow package and adapters>
pnpm exec prettier --check <workflow docs and sources>
pnpm pack
```

还必须在独立 fixture 中安装 tarball，并验证：

- 不引用 Chobits 源码即可创建 runtime。
- 可以注册第三方节点和 capability。
- 可以执行、取消和订阅运行。
- 公共根入口不会加载 Electron、React、Drizzle 或原生媒体依赖。
- 消费者不需要深层导入内部文件。

## 数据库约束

包化本身不要求数据库升级。第一批保留现有 definition/run 数据模型，并通过 adapter 映射 workspace scope。

如后续确需修改表字段，必须先修改 `electron/main/db/schema.ts`，再执行 `pnpm db:generate` 并检查生成 migration。
