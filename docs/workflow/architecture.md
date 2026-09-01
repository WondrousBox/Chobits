# 工作流目标架构

## 1. 文档状态

本文档是工作流系统演进的架构基线，同时标明已经落地的公共内核、宿主应用工作流集成层和宿主边界。

- Phase 1 至 Phase 5 已完成运行正确性、校验、workspace 隔离、模块拆分、可靠性和可观测性建设。
- Phase 6 已完成 manifest、公共 exports、Node ESM/declaration build、依赖边界检查和真实 tarball consumer。
- Phase 7 已完成实例 registry/runtime、类型化 capability、通用运行请求、timeout/retry/idempotency、命名执行组限流和确定性测试工具。
- Phase 8 已完成宿主应用工作流集成包、全部业务节点/plugin、资源读写、AI、local processing、OCR、rendering capability、SQLite/预设 store、composition 和执行组配置迁移。
- Phase 9 已完成 Electron composition root、runtime facade 注入、共享 IPC contract 和类型安全 renderer client。
- Phase 10 已完成 12 个 exports 冻结、通用节点子路径、生产深层导入迁移、release/tarball/type consumer 自动验收，并曾建立发布前兼容策略。
- Phase 11 待实施旧源码转发、legacy request、默认 registry、宿主 context 字段和数据读取 fallback 清理，并完成公共源码物理归位。
- 当前公共包已达到技术发布边界，但首次外部发布必须等待 Phase 11 的“零旧版兼容债务”验收。
- 详细实施批次见 [工作流系统优化实施计划](./implementation-plan.md)。

## 2. 架构决策

工作流系统采用两层产品边界：

1. 可发布的工作流运行内核负责通用定义、校验、执行和生命周期控制。
2. 宿主应用工作流集成层通过 ports、capabilities 和 adapters 注入资源、AI、媒体、模型、数据库及 Electron 能力。

工作流不追求与业务“零耦合”。正确约束是依赖倒置：

```text
workflow kernel defines ports
host implements ports
host depends on workflow kernel
workflow kernel never imports host internals
```

不采用“把全部工作流相关代码和依赖打进一个包”的方案。Electron、React、Drizzle、AI provider、FFmpeg 和 OCR 原生依赖不能进入公共包的根依赖闭包。

## 3. 当前产品场景

宿主应用中的工作流是本地资源驱动的 Node/Electron 编排运行时，存在四类主要入口：

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
- 宿主应用现有工作流 ID、节点 ID、预设和运行语义保持兼容。
- 公共入口不加载 Electron、React、数据库或业务模块。
- 同一进程可以创建多个隔离的 registry/runtime 实例。
- 缺少业务能力时在预检阶段返回结构化错误，而不是执行中访问 `undefined`。

### 4.2 非目标

首个可发布版本不承担：

- 浏览器运行时兼容。
- 分布式 worker、远程队列和跨机器调度。
- 进程崩溃后的节点级断点续跑。
- 宿主应用的权限 UI、模型下载 UI 和资源库 UI。
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
- `nodes/core/`：Start、End、Condition、JSON 等不依赖宿主应用的通用节点。
- `adapters/memory/`：消费者示例和单元测试使用的内存实现。
- `adapters/node/`：Node 临时目录等可替换默认实现。

### 5.2 宿主应用工作流集成层

```text
packages/workflow-integrations/
  package.json
  src/
    capabilities/
    adapters/
    nodes/
      core/
      resource/
      ai/
      media/
      ocr/
      rendering/
      display/
    plugins/
    persistence/
    ipc/
    composition.ts
```

该包命名为 `@workflow/integrations` 并设置 `private: true`。名称保持产品中性，但实现仍属于当前宿主应用，不是公共内核的一部分。它负责：

- workspace、folder、resource repositories。
- AI provider、preset、secret、Pi runtime 和 usage。
- FFmpeg、ASR、OCR、模型和插件资源。
- SQLite store adapter 和预设文件 loader。
- 宿主应用节点 bundle 和 capability 实现。
- AppEvent、精灵忙碌状态和其他产品集成端口。

Phase 8 已完整建立该私有包：

- `WORKFLOW_RESOURCE_READ` 与 `WORKFLOW_RESOURCE_WRITE` 管理 repositories、下载、复制、资源持久化和运行上下文更新。
- `WORKFLOW_AI`、`WORKFLOW_LOCAL_PROCESSING`、`WORKFLOW_OCR` 和 `WORKFLOW_RENDERING` 注入 AI provider/usage、本地 engine/plugin resource、OCR 和 Electron HTML screenshot 能力。
- 26 个宿主应用节点和 7 个 plugin 的真实实现位于私有包；旧 `packages/workflow/nodes` 与 `plugins` 路径只保留按域兼容转发。
- SQLite/Drizzle definition/run store 和预设 loader 位于 `persistence/`，旧 `store.ts` 只保留转发。
- `composition.ts` 统一创建 capability resolver 与执行组 limiter；`resource-io`、AI、FFmpeg、local ASR、OCR 和 rendering 均有实际限制。
- 私有边界检查强制公共源码不反向导入该包、业务兼容文件不重新承载实现、能力节点声明 token，且私有节点不再读取 `ExecutionContext.services`。
- `ipc/` 集中维护宿主应用的 `wf:*` channel、请求、响应、事件和 transport-neutral renderer client；公共包只提供 `WorkflowRuntimeFacade`。

`@chobits/workflow/nodes` 已公开 End、Condition、JSON parse/stringify 和 TextOutput。当前 Start 节点仍在私有包中，因为既有 `core/start` 同时承担宿主应用 resource/folder 输入补全；外部消费者使用 SDK 定义自己的 Start。后续若提供公共 Start，应新增纯通用实现并通过兼容组合保留现有宿主应用行为，不能直接改变既有节点语义。

### 5.3 宿主层

```text
electron/main/workflow/
  composition-root.ts
  index.ts
  ipc-main.ts

src/lib/workflow-client.ts
src/pages/WorkflowBuilderPage/
```

- Electron main 创建 runtime，注入宿主应用 adapters，并注册 IPC。
- scheduler、AI tool 和文件操作只是 runtime 的触发方。
- React UI 通过类型安全 client 使用公开 contract，不深层导入 runtime 实现。
- React 编辑器暂不作为公共包发布；需要跨项目共享时再建立独立的 React 包。

Phase 9 已按该边界落地。旧 `packages/workflow/index.ts` 与 `ipc-adapter.ts` 只保留兼容转发，scheduler 和 Pi tool 接收同一个 `WorkflowRuntimeFacade`，renderer 源码不再直接调用 `wf:*` IPC。

## 6. 依赖方向

```text
React UI / scheduler / AI tool / Electron IPC
                    |
                    v
          host composition root
                    |
          +---------+---------+
          |                   |
          v                   v
 integration capabilities    integration nodes
          |                   |
          +---------+---------+
                    |
                    v
            workflow runtime
                    |
            application/core
```

强制规则：

- `core` 不能导入 Node 文件系统、Electron、React、Drizzle 或宿主应用包。
- `application` 只能依赖 contracts、core 和 ports。
- 公共 runtime 不导入任何宿主应用 repository、provider 或事件模块。
- 宿主应用节点只能通过公共 SDK 和 capability contract 接入 runtime。
- 外部调用者只能使用 package exports，不能深层导入内部文件。

这些规则需要通过 ESLint boundary、依赖图测试或独立 TypeScript build 强制，而不是只依靠约定。

## 7. Runtime API

公共 API 采用实例模式，不使用模块级单例 registry 或 application service。

当前实施状态：`createWorkflowRegistry`、`createWorkflowRuntime` 和 capability 生命周期均已完成。每个 production runtime 已拥有自己的 registry、application service、store、capability resolver、clock、ID factory、limiter 和活动运行；仍供测试或旧调用方使用的默认全局 registry 将由 Phase 11 删除。

```ts
const registry = createWorkflowRegistry();

registry.registerNode(StartNode);
registry.registerNode(EndNode);
registry.registerNode(customNode);

const runtime = createWorkflowRuntime({
  store,
  registry,
  capabilities,
  executionGroups: { groups: { gpu: 1, ffmpeg: 2 } },
  clock,
  idFactory
});

const unsubscribe = runtime.events.subscribe('run:status', listener);
const handle = await runtime.start(request);

await runtime.cancel(handle.runId);
const record = await handle.completionPromise;
unsubscribe();
await runtime.dispose();
```

实例化带来的约束：

- 测试之间不会共享 registry 状态。
- 同一进程可以运行多个隔离租户或不同节点集合。
- 导入公共包不会产生 Electron handler 注册等副作用。
- 宿主控制 runtime 创建和销毁顺序。

## 8. 运行请求

Phase 7 已用规范 contract 将执行输入和宿主上下文分开：

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

宿主应用映射规则：

- `workspaceId` -> `scope: { kind: 'workspace', id }`
- `resourceId/folderId` -> `context`
- automation -> `trigger.type = schedule/event/manual`
- AI tool -> `trigger.type = agent`
- 编辑器和资源页 -> `trigger.type = manual`

当前 `defId/def/metadata` 请求仍由兼容 adapter 映射。Phase 11 会先把 IPC、renderer 和触发方迁到 `definitionId/definition/context`，再删除该内存兼容映射；这项请求迁移本身不要求数据库升级。

## 9. Ports 与 Capabilities

### 9.1 基础 ports

Phase 7 已实现并公开以下基础 ports：

- `WorkflowDefinitionStore`
- `WorkflowRunStore`
- `WorkflowClock`
- `WorkflowIdFactory`
- `WorkflowExecutionLimiter`

`InMemoryWorkflowApplicationStore`、系统 clock/随机 ID、执行组 limiter、fake clock 和 fake ID factory 已随公共包导出。SQLite、Drizzle、宿主应用预设 loader、持久化日志与宿主日志策略留在私有扩展或后续 ports。

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

runtime 在执行前验证 capability 是否存在，并返回包含 `capabilityId`、`nodeId` 和 `missingCapabilities` 的 `missing-capability` 结构化错误。直接调用 engine 时也有执行前防护。宿主 adapter 负责权限、密钥、模型和具体 provider。

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
  timeoutMs?: number;
  retry?: {
    maxAttempts: number;
    delayMs?: number;
    backoffMultiplier?: number;
    maxDelayMs?: number;
  };
  idempotent?: boolean;
}
```

默认不自动重试。AI 调用可能重复计费，`resource/create` 可能产生重复资源，只有节点明确声明幂等或提供幂等键后才允许重试。

节点 `id` 保持稳定；节点配置发生不兼容变化时通过节点版本和 `migrateConfig` 迁移，不能只依赖整个 workflow 的 schema version。

## 11. 并发与本地资源控制

Phase 7 已支持两级并发：

1. workflow 内的拓扑并发。
2. runtime 级命名执行组限流。

宿主应用可配置：

```text
ffmpeg     max 1-2
gpu        max 1
ocr        max 1-2
local-asr  max 1
ai         provider-specific
```

具体数值由宿主通过 `executionGroups` 或自定义 `WorkflowExecutionLimiter` 设置，公共包实现通用 limiter contract、FIFO 等待、取消排队和 lease 释放语义。Phase 8 已由私有 composition 为 `resource-io`、`ai`、`ffmpeg`、`local-asr`、`ocr` 和 `rendering` 声明默认限制。

## 12. 调度、AI 工具与 UI 边界

### 调度器

调度器决定何时触发，不解析工作流节点。它通过注入的 runtime facade 执行定义。cron、misfire、power lifecycle 和 scheduler audit 不进入公共工作流包。

### AI 工具

AI 工具负责权限确认、工具结果格式、等待/后台切换和资源链提示。它调用 runtime，不直接访问公共包内部 registry 或 store。

### Electron IPC

IPC 是传输 adapter。公共包输出 runtime facade 和通用工作流类型；宿主应用私有扩展维护宿主 channel/request/result/event contract，Electron main 把 contract 映射到 `ipcMain`，renderer client 负责调用和订阅。

### React UI

编辑器读取 node manifest 并编辑 `WorkflowDefinition`。模型下载、toast、资源选择和窗口行为属于宿主应用 UI，不进入公共 runtime。

## 13. 安全与权限

- 公共 runtime 传递 actor、trigger 和 scope，不决定宿主应用的权限规则。
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
- application、contracts、core、ports、schema 和 SDK 通过各自子路径导出，消费者无需引用源码布局。
- 使用 `exports` 禁止依赖内部文件布局。
- `sideEffects` 和 package files 明确声明。

发布前必须执行真实消费者验证：

1. `pnpm pack` 或 `npm pack` 生成 tarball。
2. 在独立 fixture 项目安装 tarball。
3. 只使用公开 exports 创建内存 runtime。
4. 注册第三方节点和 capability。
5. 执行、取消并订阅一次完整运行。
6. 检查 tarball 不包含源码路径、缓存、数据库或宿主配置。

Phase 10 已将这些要求实现为 `pnpm workflow:release:check` 和 `pnpm workflow:test:consumer`。tarball 检查解析实际 archive，类型 consumer 使用 `skipLibCheck: false`，深层 `src/dist` 导入必须由 exports 拒绝。Phase 11 还会增加零 legacy 检查。完整规则见 [工作流发布与版本策略](./release-and-versioning.md)。

## 15. 数据与兼容策略

- 包化本身不要求数据库字段变更。
- Phase 8-10 保留现有 workflow JSON、node ID、preset ID 和 run record 结构。
- 公共包尚未外部发布，因此 Phase 11 可以在首次发布前删除 legacy request、默认 registry、旧类型别名和宿主应用源码门面；这些内部迁移入口不形成 `0.1.x` 对外承诺。
- `workspaceId` 请求字段迁为通用 scope，资源身份迁入 context 或私有 capability；数据库仍按现有字段隔离。
- 内置预设和用户 definition 属于持久化数据契约。当前 10 个预设均缺少显式 `schemaVersion`，必须先迁移预设和存量 definition，再将该字段改为必填并删除读取 fallback。
- node ID、preset ID 和仍被 4 条预设 edge 使用的 `resource` 端口不因源码清理而改变。
- AI provider fallback 和媒体/OCR 环境容错不自动视为旧版兼容；只有替代路径完成行为覆盖后才能删除。
- 如果后续确需数据库字段变化，必须先修改 `electron/main/db/schema.ts`，再执行 `pnpm db:generate` 并检查 migration。

完整删除范围、顺序和保留项见 [工作流旧版兼容清理计划](./legacy-removal-plan.md)。

## 16. 验收标准

满足以下条件才具备独立工作流包的技术发布边界：

- 公共包有独立 manifest、build、declaration 和 exports。
- 公共包可以在没有 Electron、数据库和宿主应用源码的 fixture 中运行。
- `core` 依赖闭包不包含宿主模块。
- 新 runtime/registry 使用实例生命周期。
- 外部项目可以注册节点、capability 和 store。
- 缺失 capability 在执行前得到结构化错误。
- 宿主应用预设在显式数据迁移后保持原有运行结果。
- scheduler、AI tool、IPC 和 UI 只依赖公开 facade/contract。
- package tarball 消费测试、类型测试和边界测试通过。
- 文档示例只使用公开 API。

以上技术验收项已由 Phase 10 完成。首次外部发布还必须完成 Phase 11，确保旧源码路径、兼容 API 和隐式 definition fallback 不进入发布基线。外部 registry 发布仍是需要单独授权和凭据的发布操作。

## 17. 关联文档

- [工作流文档索引](./README.md)
- [工作流模块 README](../../packages/workflow/README.md)
- [工作流公共 API 与扩展指南](./public-api.md)
- [工作流发布与版本策略](./release-and-versioning.md)
- [工作流旧版兼容清理计划](./legacy-removal-plan.md)
- [工作流系统优化实施计划](./implementation-plan.md)
- [主进程统一调度系统](../scheduler-system/main-process-scheduler-unification-plan.md)
- [Agent 媒体链工作流计划](./agent-media-chain-plan.md)
