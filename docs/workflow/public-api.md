# 工作流公共 API 与扩展指南

## 1. 支持范围

`@chobits/workflow` 是 Node.js 18+、ESM-only 的进程内工作流运行内核。它负责定义、校验、DAG、调度、运行生命周期、取消、事件和扩展契约，不包含 Electron、React、数据库、AI provider、FFmpeg 或 OCR 实现。

消费者只能使用 `package.json` 声明的 exports。`src/`、`dist/` 和仓库内 `packages/workflow/*` 深层路径都不是公共 API，并会被 package exports 拒绝。

## 2. 公共入口

| 入口                            | 用途                                                               |
| ------------------------------- | ------------------------------------------------------------------ |
| `@chobits/workflow`             | 定义、运行结果、兼容聚合 API、脱敏和基础类型                       |
| `@chobits/workflow/application` | application service 与宿主使用的 `WorkflowRuntimeFacade`           |
| `@chobits/workflow/contracts`   | 可序列化 definition、request、run、event、validation 和 error 类型 |
| `@chobits/workflow/core`        | DAG planner、调度策略、状态机、事件和实例 registry                 |
| `@chobits/workflow/node`        | Node.js engine 入口                                                |
| `@chobits/workflow/nodes`       | 不依赖宿主的通用节点                                               |
| `@chobits/workflow/ports`       | store、clock、ID、limiter 和 runtime service ports                 |
| `@chobits/workflow/runtime`     | 实例 runtime、capability resolver 和执行组 limiter                 |
| `@chobits/workflow/schema`      | 定义、请求解析和迁移                                               |
| `@chobits/workflow/sdk`         | `defineNode`、`definePlugin` 和 `defineCapability`                 |
| `@chobits/workflow/testing`     | memory store、fake clock 和 fake ID factory                        |

`@chobits/workflow/nodes` 当前提供 `EndNode`、`ConditionNode`、`JsonParseNode`、`JsonStringifyNode` 和 `TextOutputNode`。宿主应用现有 `core/start` 带资源和文件夹补全语义，因此仍属于私有扩展；外部消费者应定义符合自身输入协议的 Start 节点。

## 3. 最小运行示例

```ts
import type { WorkflowDefinition } from '@chobits/workflow';
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

const definition = {
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
} satisfies WorkflowDefinition;

const runtime = createWorkflowRuntime({
  store: new InMemoryWorkflowApplicationStore(),
  registry: createWorkflowRegistry({ nodes: [StartNode, UppercaseNode] })
});

const record = await runtime.run({
  definition,
  input: { text: 'hello' },
  scope: { kind: 'workspace', id: 'workspace-1' },
  trigger: { type: 'manual' }
});

await runtime.dispose();
```

新代码必须使用 `WorkflowRunRequest` 的 `definitionId/definition/input/scope/trigger/actor/context/configOverrides` 字段。当前仓库内的 `defId/def/metadata` 仅是 Phase 11 删除前的临时迁移面，不会进入首次外部发布 contract。

## 4. 节点 SDK

节点必须声明稳定 ID、输入、输出和配置，并通过 `run` 返回端口值。需要宿主能力时声明 capability，不得直接导入宿主 repository 或全局服务。

```ts
import { defineCapability, defineNode } from '@chobits/workflow/sdk';

interface DocumentsCapability {
  read(id: string, signal?: AbortSignal): Promise<string>;
}

const DOCUMENTS = defineCapability<DocumentsCapability>('example.documents');

const ReadDocumentNode = defineNode({
  spec: {
    id: 'example/read-document',
    label: 'Read document',
    inputs: [{ key: 'id', type: 'string', required: true }],
    outputs: [{ key: 'text', type: 'string' }]
  },
  requiredCapabilities: [DOCUMENTS],
  execution: {
    timeoutMs: 30_000,
    group: 'document-io',
    idempotent: true,
    retry: { maxAttempts: 2, delayMs: 250 }
  },
  async run({ capabilities, ctx, input }) {
    const text = await capabilities.require(DOCUMENTS).read(String(input.id), ctx.signal);
    return { text };
  }
});
```

- capability 缺失会在运行前返回结构化校验错误。
- 只有显式声明 `idempotent: true` 的节点才能自动重试。
- 外部 I/O 应接收 `ctx.signal`，取消后及时停止网络、文件或进程操作。
- `execution.group` 对同一 runtime 的多个 run 进行共享限流；definition 的 `options.concurrency` 只限制单次 DAG 调度。
- 节点配置发生不兼容变化时，应保持节点 ID 并提供显式配置迁移。

## 5. Adapter 注入

### Store

实现 `WorkflowApplicationStore` 可接入 SQL、文档数据库或远程服务。所有 definition/run 操作必须使用解析后的 workspace ID 隔离；`saveRun` 可选，runtime 会按事件顺序提交快照并由 `flush()` 暴露持久化失败。

### Capability

宿主先用 `defineCapability<T>()` 定义 token，再把实现传给 `createWorkflowCapabilities()`。adapter 是文件、网络、进程、AI 和资源写入的最终授权边界，应使用 run context 校验 scope、actor 和权限。

### Control Ports

`WorkflowClock`、`WorkflowIdFactory` 和 `WorkflowExecutionLimiter` 可以替换默认实现。测试使用 `@chobits/workflow/testing` 的 fake；生产 ID 必须跨进程生命周期保持唯一。

### 宿主 Facade

Electron IPC、scheduler 和 AI tool 等宿主入口应依赖 `WorkflowRuntimeFacade` 或自行定义更窄的 port。它们不能读取 runtime 内部 registry、engine 或 store，也不能把 transport 字符串放入公共内核。

## 6. 生命周期与错误

- `runtime.start()` 返回稳定 `runId` 和 `completionPromise`。
- `runtime.run()` 等待终态记录；只有 `completed` 表示成功。
- `runtime.execute()` 返回不抛出业务终态的 `WorkflowExecutionResult`。
- `runtime.cancel()` 只取消 queued/running 运行，并校验 scope。
- `runtime.events.subscribe()` 返回取消订阅函数。
- `runtime.flush()` 等待持久化队列。
- `runtime.dispose()` 停止新运行、取消活动运行并等待清理完成。

运行请求解析失败、定义不存在和 runtime 已销毁分别使用 `invalid-run-request`、`workflow-not-found` 和 `runtime-disposed`。节点失败原因保存在 run/node attempt 中，宿主展示前仍应执行脱敏和大小限制。

## 7. 类型兼容说明

当前定义和运行记录仍包含 `workspaceId`、resource 输入和部分 `any` 字段。Phase 11 会在首次外部发布前迁移仓库调用方和存量 definition，正式请求边界使用 `scope/context` 与 `unknown`；持久化数据不能因类型收紧而静默失效。删除顺序见 [工作流旧版兼容清理计划](./legacy-removal-plan.md)，首次发布后的变化按 [发布与版本策略](./release-and-versioning.md) 执行。
