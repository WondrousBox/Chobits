# 工作流目标架构

## 1. 文档状态

本文档是工作流系统后续演进的架构基线，描述目标边界，而不是声称当前代码已经全部完成包化。

- Phase 1 至 Phase 5 已完成运行正确性、校验、workspace 隔离、模块拆分、可靠性和可观测性建设。
- 当前 `packages/workflow` 已具备可提取的执行内核，但仍是根项目中的源码目录，不是可独立安装的发布包。
- 后续实施以“可发布的 Node-first 工作流内核 + Chobits 私有业务扩展”为目标。
- 详细实施批次见 [工作流系统优化实施计划](./implementation-plan.md)。

## 2. 架构决策

工作流系统采用两层产品边界：

1. 可发布的工作流运行内核负责通用定义、校验、执行和生命周期控制。
2. Chobits 私有扩展通过 ports、capabilities 和 adapters 注入资源、AI、媒体、模型、数据库及 Electron 能力。

工作流不追求与业务“零耦合”。正确约束是依赖倒置：

```text
workflow kernel defines ports
host implements ports
host depends on workflow kernel
workflow kernel never imports host internals
```

不采用“把全部工作流相关代码和依赖打进一个包”的方案。Electron、React、Drizzle、AI provider、FFmpeg 和 OCR 原生依赖不能进入公共包的根依赖闭包。

## 3. 当前产品场景

Chobits 中的工作流是本地资源驱动的 Node/Electron 编排运行时，存在四类主要入口：

- 可视化编辑器手动运行。
- 文件操作、资源菜单和批量资源处理。
- schedule、system event、resource event 和 manual automation。
- AI 工具同步等待或切换到后台执行。

当前预设集中在资源创建、媒体转码、ASR、OCR、图片理解和图片生成，并依赖：

- 本地文件系统和资源项目目录。
- FFmpeg、Whisper、FunASR、Parakeet、Tesseract 和 PaddleOCR。
- AI provider、preset、secret、模型和 usage 统计。
- workspace、folder、resource 和本地 SQLite。
- Electron 窗口、IPC、应用事件和精灵忙碌状态。

因此首个可发布版本明确定位为 Node-first 的进程内运行时，而不是浏览器或分布式任务平台。

## 4. 目标与非目标

### 4.1 目标

- 通过标准包安装并在其他 Node/Electron 项目中使用。
- 公共包完整拥有 DAG、状态机、调度、取消、超时、可选重试、事件和运行策略。
- 外部项目可以注册自定义节点并注入自己的存储和业务能力。
- Chobits 现有工作流 ID、节点 ID、预设和运行语义保持兼容。
- 公共入口不加载 Electron、React、数据库或业务模块。
- 同一进程可以创建多个隔离的 registry/runtime 实例。
- 缺少业务能力时在预检阶段返回结构化错误，而不是执行中访问 `undefined`。

### 4.2 非目标

首个可发布版本不承担：

- 浏览器运行时兼容。
- 分布式 worker、远程队列和跨机器调度。
- 进程崩溃后的节点级断点续跑。
- Chobits 的权限 UI、模型下载 UI 和资源库 UI。
- 调度器、Electron IPC 或 React 编辑器的业务实现。

应用重启时遗留的活动运行先采用统一的 interrupted/failed 对账策略。完整恢复需要 checkpoint、节点幂等和副作用协议，后续单独设计。

## 5. 目标模块

### 5.1 可发布包

目标工作名为 `@chobits/workflow`，正式发布前确认 package scope。

```text
packages/workflow/
  package.json
  tsconfig.json
  src/
    contracts/
    core/
    runtime/
    application/
    ports/
    sdk/
    nodes/
      core/
    adapters/
      memory/
      node/
```

职责：

- `contracts/`：可序列化定义、运行请求、运行结果、事件、错误和版本迁移。
- `core/`：DAG 规划、端口校验、调度算法、状态机和纯策略。
- `runtime/`：runtime 实例、run scope、执行生命周期、事件和运行控制。
- `application/`：定义、运行、取消、历史查询等用例。
- `ports/`：定义存储、运行存储、日志、capability、时钟、ID、资源限制等接口。
- `sdk/`：`defineNode`、`defineCapability`、registry 和测试辅助 API。
- `nodes/core/`：Start、End、Condition、JSON 等不依赖 Chobits 的通用节点。
- `adapters/memory/`：消费者示例和单元测试使用的内存实现。
- `adapters/node/`：Node 临时目录等可替换默认实现。

### 5.2 Chobits 私有扩展

```text
packages/workflow-chobits/
  package.json
  src/
    capabilities/
    nodes/
      resource/
      ai/
      media/
      ocr/
      display/
    persistence/
    composition.ts
```

该包设置 `private: true`，负责：

- workspace、folder、resource repositories。
- AI provider、preset、secret、Pi runtime 和 usage。
- FFmpeg、ASR、OCR、模型和插件资源。
- SQLite store adapter 和预设文件 loader。
- Chobits 节点 bundle 和 capability 实现。
- AppEvent、精灵忙碌状态和其他产品集成端口。

### 5.3 宿主层

```text
electron/main/workflow/
  bootstrap.ts
  ipc.ts
  events.ts

src/features/workflow/
  client.ts
  editor/
  history/
```

- Electron main 创建 runtime，注入 Chobits adapters，并注册 IPC。
- scheduler、AI tool 和文件操作只是 runtime 的触发方。
- React UI 通过类型安全 client 使用公开 contract，不深层导入 runtime 实现。
- React 编辑器暂不作为公共包发布；需要跨项目共享时再建立独立的 React 包。

## 6. 依赖方向

```text
React UI / scheduler / AI tool / Electron IPC
                    |
                    v
          Chobits composition root
                    |
          +---------+---------+
          |                   |
          v                   v
 Chobits capabilities    Chobits nodes
          |                   |
          +---------+---------+
                    |
                    v
            workflow runtime
                    |
            application/core
```

强制规则：

- `core` 不能导入 Node 文件系统、Electron、React、Drizzle 或 Chobits 包。
- `application` 只能依赖 contracts、core 和 ports。
- 公共 runtime 不导入任何 Chobits repository、provider 或事件模块。
- Chobits 节点只能通过公共 SDK 和 capability contract 接入 runtime。
- 外部调用者只能使用 package exports，不能深层导入内部文件。

这些规则需要通过 ESLint boundary、依赖图测试或独立 TypeScript build 强制，而不是只依靠约定。

## 7. Runtime API

公共 API 采用实例模式，不使用模块级单例 registry 或 application service。

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
  capabilities,
  limits,
  clock,
  idFactory
});

const handle = runtime.start(request);
const unsubscribe = runtime.events.subscribe(handle.runId, listener);

await runtime.cancel(handle.runId);
const record = await handle.completionPromise;
unsubscribe();
```

实例化带来的约束：

- 测试之间不会共享 registry 状态。
- 同一进程可以运行多个隔离租户或不同节点集合。
- 导入公共包不会产生 Electron handler 注册等副作用。
- 宿主控制 runtime 创建和销毁顺序。

## 8. 运行请求

当前代码中 `input`、`metadata`、`workspaceId`、`resourceId` 和 `folderId` 承担了部分重复职责。目标 contract 将执行输入和宿主上下文分开：

```ts
interface WorkflowRunRequest {
  definitionId?: string;
  definition?: WorkflowDefinition;
  input?: Record<string, unknown>;
  scope?: {
    kind: string;
    id: string;
  };
  trigger?: {
    type: 'manual' | 'schedule' | 'event' | 'agent' | string;
    id?: string;
  };
  actor?: {
    type: string;
    id?: string;
  };
  context?: Record<string, unknown>;
  configOverrides?: Record<string, Record<string, unknown>>;
}
```

Chobits 映射规则：

- `workspaceId` -> `scope: { kind: 'workspace', id }`
- `resourceId/folderId` -> `context`
- automation -> `trigger.type = schedule/event/manual`
- AI tool -> `trigger.type = agent`
- 编辑器和资源页 -> `trigger.type = manual`

第一批实现保留现有字段和 JSON 结构，通过兼容 adapter 映射，避免不必要的数据库迁移。

## 9. Ports 与 Capabilities

### 9.1 基础 ports

公共 runtime 定义但不实现具体业务存储：

- `WorkflowDefinitionStore`
- `WorkflowRunStore`
- `WorkflowRunLogStore`（可选）
- `WorkflowRunScopeFactory`
- `WorkflowClock`
- `WorkflowIdFactory`
- `WorkflowLogger`
- `WorkflowExecutionLimiter`

内存实现可以随公共包发布；SQLite、Drizzle 和 Chobits 预设 loader 留在私有扩展。

### 9.2 可选 capabilities

业务节点按需声明：

- resource / folder / workspace
- artifact / filesystem
- AI text / chat / image / music
- process / media / OCR
- model / engine asset
- HTML render
- telemetry / AI usage
- permission / authorization

使用类型化 token，避免把所有业务能力固定进 `ExecutionContext`：

```ts
const AI = defineCapability<AiCapability>('ai');

const node = defineNode({
  spec: {
    id: 'ai/chat',
    requiredCapabilities: [AI]
  },
  async run({ capabilities, input }) {
    return capabilities.require(AI).complete(input);
  }
});
```

runtime 在执行前验证 capability 是否存在，并返回 `missing-capability`。宿主 adapter 负责权限、密钥、模型和具体 provider。

## 10. 节点与扩展模型

节点 contract 需要明确区分：

- 数据端口和运行时 schema。
- 编辑器展示 metadata。
- capability requirements。
- engine/model asset requirements。
- 执行组和资源权重。
- timeout、retry 和 idempotency 声明。
- 节点版本和配置迁移。

建议字段：

```ts
interface WorkflowNodeExecutionPolicy {
  group?: string;
  weight?: number;
  timeoutMs?: number;
  retry?: {
    maxAttempts: number;
    backoffMs?: number;
  };
  idempotent?: boolean;
}
```

默认不自动重试。AI 调用可能重复计费，`resource/create` 可能产生重复资源，只有节点明确声明幂等或提供幂等键后才允许重试。

节点 `id` 保持稳定；节点配置发生不兼容变化时通过节点版本和 `migrateConfig` 迁移，不能只依赖整个 workflow 的 schema version。

## 11. 并发与本地资源控制

当前单工作流 `concurrency` 不能限制多个 run 同时启动 FFmpeg、GPU 或 OCR。公共 runtime 需要支持两级并发：

1. workflow 内的拓扑并发。
2. runtime 级命名执行组限流。

Chobits 可配置：

```text
ffmpeg     max 1-2
gpu        max 1
ocr        max 1-2
local-asr  max 1
ai         provider-specific
```

具体数值由宿主设置，公共包只实现通用 limiter contract 和调度语义。

## 12. 调度、AI 工具与 UI 边界

### 调度器

调度器决定何时触发，不解析工作流节点。它通过注入的 runtime facade 执行定义。cron、misfire、power lifecycle 和 scheduler audit 不进入公共工作流包。

### AI 工具

AI 工具负责权限确认、工具结果格式、等待/后台切换和资源链提示。它调用 runtime，不直接访问公共包内部 registry 或 store。

### Electron IPC

IPC 是传输 adapter。公共包输出命令、结果和事件 contract；Electron main 把 contract 映射到 `ipcMain`，renderer client 负责调用和订阅。

### React UI

编辑器读取 node manifest 并编辑 `WorkflowDefinition`。模型下载、toast、资源选择和窗口行为属于 Chobits UI，不进入公共 runtime。

## 13. 安全与权限

- 公共 runtime 传递 actor、trigger 和 scope，不决定 Chobits 的权限规则。
- capability adapter 是最终授权边界，不能只依赖 UI 或 AI tool 入口的前置检查。
- 文件、网络、进程、AI 和资源写入 capability 应按 run/node 上下文校验权限。
- 日志、状态广播和持久化继续执行脱敏与大小限制。
- package API 使用 `unknown` 和显式 schema，减少跨边界 `any`。

## 14. 发布约束

首个公共包：

- Node.js 18+。
- ESM 和 TypeScript declarations。
- 根入口无 Electron、React、Drizzle、AI provider 和原生媒体依赖。
- Node 默认能力通过子路径导出，例如 `@chobits/workflow/node`。
- 测试辅助通过 `@chobits/workflow/testing` 导出。
- 使用 `exports` 禁止依赖内部文件布局。
- `sideEffects` 和 package files 明确声明。

发布前必须执行真实消费者验证：

1. `pnpm pack` 或 `npm pack` 生成 tarball。
2. 在独立 fixture 项目安装 tarball。
3. 只使用公开 exports 创建内存 runtime。
4. 注册第三方节点和 capability。
5. 执行、取消并订阅一次完整运行。
6. 检查 tarball 不包含源码路径、缓存、数据库或宿主配置。

## 15. 数据与兼容策略

- 包化本身不要求数据库字段变更。
- 第一批保留现有 workflow JSON、node ID、preset ID 和 run record 结构。
- `workspaceId` 先由兼容 adapter 映射为通用 scope，数据库仍按现有字段隔离。
- 旧 `packages/workflow` 导出保留兼容门面，调用方迁移完成后再删除。
- 如果后续确需数据库字段变化，必须先修改 `electron/main/db/schema.ts`，再执行 `pnpm db:generate` 并检查 migration。

## 16. 验收标准

满足以下条件才可以称为可发布的独立工作流包：

- 公共包有独立 manifest、build、declaration 和 exports。
- 公共包可以在没有 Electron、数据库和 Chobits 源码的 fixture 中运行。
- `core` 依赖闭包不包含宿主模块。
- registry/runtime 无模块级单例。
- 外部项目可以注册节点、capability 和 store。
- 缺失 capability 在执行前得到结构化错误。
- Chobits 预设在兼容层下保持原有运行结果。
- scheduler、AI tool、IPC 和 UI 只依赖公开 facade/contract。
- package tarball 消费测试、类型测试和边界测试通过。
- 文档示例只使用公开 API。

## 17. 关联文档

- [工作流文档索引](./README.md)
- [工作流模块 README](../../packages/workflow/README.md)
- [工作流系统优化实施计划](./implementation-plan.md)
- [主进程统一调度系统](../scheduler-system/main-process-scheduler-unification-plan.md)
- [Agent 媒体链工作流计划](./agent-media-chain-plan.md)
