# Provider 统一管理重构方案

更新时间：2026-03-17

本文档用于指导 `packages/ai` 的 Provider 管理体系重构。目标不是一次性重写全部 AI 能力，而是把当前分散在多处的 Provider 元数据、模型清单、配置 schema、运行时适配逻辑，收敛成一套统一且可扩展的管理方式，为后续“内建 Provider + 预设 + 插件扩展 Provider”打下稳定基础。

## 0. 当前进度快照

截至 2026-03-17，当前分支的 Provider 统一化状态如下：

- 已完成：Phase 0 / Phase 1 / Phase 2 / Phase 3 主链路
  - `ProviderDefinition`、`ProviderRegistry`、`ProviderService` 已经成为主读取链路
  - `ipc-main.ts`、Workflow、Pi runtime、settings/preset 持久化已经统一走 definition/service
- 已删除的兼容壳：
  - `packages/ai/providers/metadata.ts`
  - `packages/ai/providers/aliases.ts`
  - `packages/ai/models-loader.ts`
  - `packages/ai/schema-loader.ts`
  - `packages/ai/runtime/pi/provider-alias.ts`
- 已完成：Phase 4（插件 Provider）主链路
  - 已新增 `packages/ai/providers/plugins/manifest.ts`
  - 已新增 `packages/ai/providers/plugins/validator.ts`
  - 已新增 `packages/ai/providers/plugins/loader.ts`
  - 已新增 `packages/ai/providers/plugins/runtime.ts`
  - 主进程启动时已接入插件 provider manifest 扫描、校验、注册与告警输出
  - 声明式 plugin provider 已支持复用 `openai/openai-compatible/anthropic/gemini/ollama` driver 自动创建 adapter
  - `runtime.mode = module` 已支持动态模块加载与 adapter 注册
- 已完成：Phase 5（遗留目录与文档清理）
  - 已清理：
    - `resources/providers/*.schema.json`
    - `resources/providers/*.models.json`
    - 历史 provider/model 目录与相关旧枚举
  - `resources/providers` 目录现在仅保留 `icons/*` 打包资源
  - 共享模型类型与参数 schema 已并入 `packages/ai/providers/model-types.ts` 与 `packages/ai/providers/model-params.ts`
  - `Preset` 已切到 `overrides` 为主语义；`config` 仅保留读写兼容 alias
- 进行中：Provider 音频输出能力扩展
  - 音乐生成已以 `musicGeneration` 接入，MiniMax 是当前内建实现
  - TTS 将以 `speechSynthesis` 接入，统一支持 HTTP 非流式、HTTP/SSE/chunk 流式、WebSocket 会话式和后续异步任务
  - 详细方案见 [AI Provider 音频能力统一设计](./provider-audio-capabilities-design.md)

## 1. 背景与当前问题

当前 Provider 相关信息分散在多处，存在明显重复和分叉：

- `resources/providers/*.schema.json`
  - 保存 Provider 配置表单 schema。
- `resources/providers/*.models.json`
  - 保存一套静态模型清单。
- `packages/ai/providers/metadata.ts`
  - 保存默认模型、能力、base URL、kind。
- `packages/ai/providers/*.ts`
  - 保存运行时适配逻辑，同时又重复保存默认模型、schema fallback 等信息。
- 历史 provider/model 目录
  - 过去保存过 Provider 卡片、内建模型与旧枚举，现已删除。
- `packages/workflow/nodes/ai-workflow-utils.ts`
  - 直接读取 `resources/providers/*.models.json`，绕过 Provider registry。

这会带来几个直接问题：

- 一个 Provider 的信息往往要改 3 到 5 处。
- “谁是真实来源”不清楚，新增 Provider 时容易漏改。
- `gemini` / `google` 这类 alias 没有在所有层统一，导致模型层和运行时层脱节。
- `Preset`、`Renderer`、`Workflow`、`Runtime` 并不是从同一套 Provider 定义出发。
- 后续想支持“插件扩展 Provider”时，没有统一的注册入口和 manifest 约束。

## 2. 重构目标

本次重构的目标如下：

- 用一套统一的 `ProviderDefinition` 作为 Provider 的唯一真相源。
- 让内建 Provider 与插件 Provider 使用同一套注册和解析机制。
- 让 `Preset` 只负责“用户覆盖项”，不再复制 Provider 基础元数据。
- 让 Renderer、Main、Workflow、Pi runtime 都通过统一的 Provider 服务获取配置、模型和能力信息。
- 降低新增 Provider 的维护成本：
  - 标准协议 Provider 尽量只写声明，不写大量代码。
  - 特殊 Provider 才实现自定义 runtime。
- 保持对现有 IPC、Preset、Secrets、Provider ID 的兼容迁移。

## 3. 设计原则

### 3.1 单一真相源

一个 Provider 的基础元数据、默认模型、能力、schema、模型来源，只能在一处定义。

### 3.2 Canonical ID 唯一

每个 Provider 只能有一个 canonical id，例如：

- `gemini` 是 canonical id
- `google` 只能作为 alias

任何业务数据持久化、调用、Preset 关联、Secrets 存储，都以 canonical id 为准。

### 3.3 Builtin 与 Plugin 同构

内建 Provider 和插件 Provider 不能走两套体系。二者都必须注册为统一的 `ProviderDefinition`，然后由统一的 `ProviderRegistry` 和 `ProviderService` 对外提供能力。

### 3.4 运行时与定义解耦

Provider 定义负责“声明”，Provider runtime 负责“执行”。多数 Provider 应该复用标准协议 driver，而不是每个都写一遍 runtime。

### 3.5 所有消费方走统一入口

Renderer、Workflow、Pi runtime、后台任务、设置页，不允许再直接读取任何旧 JSON/旧目录源，而是统一通过 `ProviderService` / `ProviderRegistry` 获取 Provider 信息。

## 4. 非目标

本次重构不以这些事项为首要目标：

- 不在第一阶段改动现有 IPC 接口形状。
- 不在第一阶段重写所有 chat / embed / transcribe 实现。
- 不在第一阶段把插件安装 UI 一并做完。
- 不强制第一阶段引入远程 provider marketplace。

这些能力可以在统一 Provider 体系稳定后分阶段追加。

## 5. 目标架构

重构后的 Provider 系统建议分为 4 层：

- `ProviderDefinition`
  - Provider 的声明式定义，作为唯一真相源。
- `ProviderRegistry`
  - 负责注册、冲突检测、alias 归一化、查询。
- `ProviderService`
  - 对业务层暴露统一读取接口，如 `listProviders`、`getProviderSchema`、`listProviderModels`、`resolveExecutionContext`。
- `ProtocolDriver` / `CustomRuntime`
  - 负责具体执行聊天、嵌入、转写、列模型等逻辑。

可以把关系理解为：

1. 启动时加载内建 Provider 定义。
2. 启动时扫描插件 Provider 定义并注册。
3. `ProviderRegistry` 完成 canonical id、alias、冲突和来源管理。
4. `ProviderService` 为 IPC、Workflow、Pi runtime 提供统一读写接口。
5. 执行聊天或列模型时，由 `ProviderService` 根据 definition 选择标准协议 driver 或 custom runtime。

## 6. 核心模型设计

### 6.1 ProviderDefinition

建议引入统一类型：

```ts
export type ProviderProtocolKind =
  | 'openai'
  | 'openai-compatible'
  | 'anthropic'
  | 'gemini'
  | 'ollama'
  | 'custom';

export type ProviderSource = 'builtin' | 'plugin';

export interface ProviderDefinition {
  id: string;
  aliases?: string[];
  source: ProviderSource;

  display: {
    label: string;
    description?: string;
    icon?: string;
    website?: string;
    order?: number;
  };

  protocol: {
    kind: ProviderProtocolKind;
    baseUrl?: string;
  };

  capabilities: {
    chat: boolean;
    embeddings: boolean;
    imageGeneration: boolean;
    musicGeneration: boolean;
    speechSynthesis: boolean;
    transcribe: boolean;
    modelListing: boolean;
  };

  defaults: {
    models: {
      chat?: string;
      embeddings?: string;
      imageGeneration?: string;
      musicGeneration?: string;
      speechSynthesis?: string;
      transcribe?: string;
    };
    config?: Record<string, any>;
  };

  schema: ProviderConfig;

  models: {
    strategy: 'builtin' | 'remote' | 'hybrid';
    items?: ProviderModelDefinition[];
    cacheTtlMs?: number;
  };

  runtime?: {
    mode: 'driver' | 'module';
    modulePath?: string;
    exportName?: string;
  };

  compatibility?: {
    legacyIds?: string[];
    storageIds?: string[];
  };
}
```

说明：

- `id`
  - canonical id，必须唯一。
- `aliases`
  - 仅用于输入兼容，不用于持久化。
- `source`
  - 区分 `builtin` 和 `plugin`。
- `display`
  - UI 展示信息，从这里统一提供给设置页和选择器。
- `protocol.kind`
  - 表示这个 Provider 默认应该走哪种标准 driver。
- `defaults.models`
  - 默认模型的唯一来源。
- `schema`
  - Provider 配置表单的唯一来源。
- `models`
  - 统一声明模型来源和缓存策略。
- `runtime`
  - 只有特殊 Provider 才需要模块化 runtime。
- `compatibility`
  - 用于平滑迁移旧 ID 和旧 secrets 存储键。

### 6.2 ProviderModelDefinition

模型也需要统一为一套结构，避免 `resources/providers/*.models.json` 与历史内建模型源双维护：

```ts
export interface ProviderModelDefinition {
  id: string;
  displayName?: string;
  type: 'chat' | 'embedding' | 'image' | 'audio' | 'realtime' | string;
  enabled?: boolean;
  contextWindowTokens?: number;
  maxOutput?: number;
  description?: string;
  releasedAt?: string;
  pricing?: Pricing;
  abilities?: {
    functionCall?: boolean;
    reasoning?: boolean;
    vision?: boolean;
    search?: boolean;
    video?: boolean;
    files?: boolean;
    imageOutput?: boolean;
    structuredOutput?: boolean;
  };
  tags?: string[];
  settings?: Record<string, any>;
}
```

建议：

- Builtin Provider 的模型定义放在各自 provider 目录的 `models.ts`。
- 插件 Provider 可在 manifest 中内联模型，或声明 `strategy = remote` 只走远程拉取。

### 6.3 ProviderPreset

`Preset` 应该只表达“用户对某个 Provider 的具体使用方案”，不再重复 Provider 元信息：

```ts
export interface ProviderPresetRecord {
  id: string;
  providerId: string;
  name: string;
  systemPrompt?: string;
  enabledTools?: string[];
  overrides?: Record<string, any>;
  createdAt?: number;
  updatedAt?: number;
}
```

建议变化：

- 保留现有 `config` 字段一段时间作为兼容 alias。
- 新代码统一使用 `overrides`。
- `Preset` 不保存 capability、schema、Provider label、default model。

### 6.4 ProviderRuntimeModule

对于标准协议 Provider，不要求自定义 runtime 模块；对于特殊 Provider，暴露统一接口：

```ts
export interface ProviderRuntimeModule {
  createAdapter(definition: ProviderDefinition): ProviderAdapter | Promise<ProviderAdapter>;
}
```

说明：

- `runtime.exportName` 指向的导出既可以直接是 `ProviderRuntimeModule`，也可以是一个返回 `ProviderRuntimeModule` 的工厂函数。
- 主进程注册插件 Provider 时会异步加载该模块，并把返回的 adapter 注册进统一 `ProviderRegistry`。

## 7. 目录重构建议

建议把 Provider 相关目录重构为：

```text
packages/ai/providers/
  types.ts
  registry.ts
  service.ts
  aliases.ts
  drivers/
    openai.ts
    anthropic.ts
    gemini.ts
    ollama.ts
  builtins/
    openai/
      definition.ts
      models.ts
      runtime.ts
    anthropic/
      definition.ts
      models.ts
    gemini/
      definition.ts
      models.ts
    deepseek/
      definition.ts
    qwen/
      definition.ts
    zhipu/
      definition.ts
    ollama/
      definition.ts
      models.ts
  plugins/
    loader.ts
    manifest.ts
    validator.ts
```

对应的旧目录调整建议：

- `resources/providers`
  - 第一阶段仅保留图标资源。
  - 第二阶段删除 `*.schema.json`、`*.models.json`。
- 历史 provider/model 目录
  - 已完成删除；其中的 Provider 卡片、builtin 模型、共享模型类型/参数 schema 与旧枚举职责，已分别并入 `ProviderDefinition`、`providers/builtins/*/models.ts`、`providers/model-types.ts`、`providers/model-params.ts` 与 `ProviderDefinition.id`。
- `packages/ai/providers/metadata.ts` / `packages/ai/providers/aliases.ts`
  - 已完成删除，相关职责已经并入 `ProviderService`。
- `packages/ai/models-loader.ts` / `packages/ai/schema-loader.ts`
  - 已完成删除，业务侧统一从 `ProviderService` 读取模型与 schema。
- `packages/ai/runtime/pi/provider-alias.ts`
  - 已完成删除，Pi runtime 直接复用 `ProviderService` 的 alias/canonical helper。

## 8. 统一读取与执行流程

### 8.1 启动流程

启动时的加载顺序建议如下：

1. 注册内建 Provider definitions。
2. 注册 alias 映射。
3. 加载插件 Provider manifests。
4. 校验 manifest。
5. 检查 id 冲突和 alias 冲突。
6. 注册到统一 `ProviderRegistry`。
7. 延迟初始化 runtime adapter。

### 8.2 获取 Provider 列表

`ai:getProviders` 不再依赖 `packages/ai/providers/metadata.ts` 和 provider 实例散落的 `getConfigSchema()`，而是统一调用：

- `ProviderService.listProviderRecords()`

返回内容由 `ProviderDefinition` 派生：

- `id`
- `aliases`
- `label`
- `configured`
- `capabilities`
- `defaultModels`
- `kind`
- `schema`
- `source`

### 8.3 获取模型列表

所有模型读取都走：

- `ProviderService.listModels(providerId, presetId?)`

顺序统一为：

1. canonicalize provider id
2. 读取 ProviderDefinition
3. 合并 Provider secrets / Preset secrets / overrides
4. 根据 `models.strategy` 决定：
   - `builtin`：返回 definition 内置模型
   - `remote`：调用 driver / runtime 列模型
   - `hybrid`：先 builtin，再 remote 合并去重
5. 输出统一格式

`Workflow` 不允许再直接读 `resources/providers/*.models.json`。

### 8.4 执行请求

执行聊天、嵌入、转写、图片生成时统一走：

- `ProviderService.getOrCreateAdapter(providerId)`
- `ExecutionResolver.resolveProviderContext(req)`

参数合并顺序建议固定为：

1. `ProviderDefinition.defaults`
2. Provider-level secrets/config
3. Preset-level secrets/config
4. request-level overrides

这样能保证：

- 默认值统一。
- Preset 是稳定覆盖层。
- 临时请求还能按需 override。

## 9. Builtin Provider 的组织方式

建议每个内建 Provider 都按“定义 + 模型 + 可选 runtime”的方式组织。

以 OpenAI 为例：

```ts
export const openaiDefinition: ProviderDefinition = {
  id: 'openai',
  source: 'builtin',
  display: {
    label: 'OpenAI',
    description: '...',
    icon: 'providers/icons/openai.svg',
    website: 'https://openai.com',
  },
  protocol: {
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
  },
  capabilities: {
    chat: true,
    embeddings: true,
    imageGeneration: true,
    musicGeneration: false,
    speechSynthesis: false,
    transcribe: true,
    modelListing: true,
  },
  defaults: {
    models: {
      chat: 'gpt-4o-mini',
      embeddings: 'text-embedding-3-small',
      imageGeneration: 'gpt-image-1',
      // Optional audio-output defaults are declared only when the provider supports them.
      // musicGeneration: 'music-2.6',
      // speechSynthesis: 'speech-2.8-turbo',
      transcribe: 'gpt-4o-mini-transcribe',
    },
  },
  schema: {
    id: 'openai',
    label: 'OpenAI',
    enabled: true,
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', required: true },
      { key: 'baseUrl', label: 'Base URL', type: 'text' },
      { key: 'model', label: '默认模型', type: 'text' },
    ],
  },
  models: {
    strategy: 'hybrid',
    items: openaiModels,
  },
  runtime: {
    mode: 'driver',
  },
};
```

这样做的好处：

- 定义文件能一眼看出这个 Provider 的全部基础信息。
- runtime 文件只关心执行逻辑，不再重复保存元数据。
- 新增标准 Provider 时，绝大多数情况下只需声明 definition。

## 10. 插件扩展方案

### 10.1 总体策略

插件 Provider 也应注册为 `ProviderDefinition`，但来源为 `plugin`。

建议分两种扩展模式：

### 10.2 模式 A：声明式插件 Provider

适用于：

- OpenAI-compatible
- Anthropic
- Gemini
- Ollama
- 其他只需要配置 base URL、schema、默认模型、模型策略的 Provider

这类插件只需要一个 manifest 文件，例如：

```json
{
  "manifestVersion": 1,
  "id": "my-openai-proxy",
  "aliases": ["my-proxy"],
  "display": {
    "label": "My OpenAI Proxy",
    "description": "Company internal gateway",
    "website": "https://example.com"
  },
  "protocol": {
    "kind": "openai-compatible",
    "baseUrl": "https://api.example.com/v1"
  },
  "capabilities": {
    "chat": true,
    "embeddings": true,
    "imageGeneration": false,
    "musicGeneration": false,
    "speechSynthesis": false,
    "transcribe": false,
    "modelListing": true
  },
  "defaults": {
    "models": {
      "chat": "gpt-4o-mini"
    }
  },
  "schema": {
    "id": "my-openai-proxy",
    "label": "My OpenAI Proxy",
    "enabled": true,
    "fields": [
      { "key": "apiKey", "label": "API Key", "type": "password", "required": true },
      { "key": "baseUrl", "label": "Base URL", "type": "text" }
    ]
  },
  "models": {
    "strategy": "remote"
  }
}
```

当前已接通的声明式 driver：

- `openai`
- `openai-compatible`
- `anthropic`
- `gemini`
- `ollama`

说明：

- manifest 注册后会自动创建对应 protocol driver adapter；
- 若 manifest 声明了当前 driver 不支持的 capability，会在启动日志里告警，并在运行时按 driver 实际能力收口。

### 10.3 模式 B：模块化插件 Provider

适用于：

- 有特殊鉴权
- 特殊模型列举逻辑
- 特殊转写或图片接口
- 不完全兼容标准 driver

manifest 额外声明模块入口：

```json
{
  "manifestVersion": 1,
  "id": "special-provider",
  "protocol": { "kind": "custom" },
  "runtime": {
    "mode": "module",
    "modulePath": "./dist/provider.js",
    "exportName": "createProviderRuntime"
  }
}
```

模块导出约定：

```ts
export function createProviderRuntime(definition: ProviderDefinition): ProviderRuntimeModule {
  return {
    createAdapter(definition) {
      return new SpecialProviderAdapter(definition);
    },
  };
}
```

### 10.4 插件发现与冲突策略

建议 Provider 插件先采用独立目录扫描，而不是直接复用当前大资源下载型插件系统：

- 扫描目录建议：
  - `<userData>/providers/*/provider.json`
  - 或 `<pluginsDir>/providers/*/provider.json`

原因：

- 现有 `packages/plugins` 更偏向二进制资源和模型下载管理。
- Provider 插件本质上是“配置 + 代码扩展”，生命周期更接近“模块加载”而不是“资源安装”。
- 第一版先独立实现更简单，后续再考虑统一到插件中心 UI。

冲突规则建议：

- plugin id 不允许覆盖 builtin id。
- alias 不允许指向多个不同的 canonical id。
- manifest 校验失败的 Provider 不注册，但记录告警。

## 11. 与现有类型和接口的兼容策略

### 11.1 对 `ProviderAdapter` 的兼容

短期内保留现有 `ProviderAdapter` 接口，但把 metadata 主读取权收回到 definition/service：

- `schema` / `capabilities` / `default models` 默认统一从 `ProviderDefinition` 读取
- adapter 上的 `getConfigSchema?()` / `getCapabilities?()` / `getDefaultModels?()` 退化成可选 override
- 内建 runtime 类不再强制重复暴露这些 definition 派生方法

这样可以做到：

- IPC 层无需立刻修改。
- 旧 provider 实现可以逐步迁移。

### 11.2 对 `metadata.ts` 的兼容

该兼容层已在当前分支删除。

其职责已经迁入 `ProviderService`，包括：

- built-in provider metadata 派生
- capabilities/default models 读取
- canonical provider id 归一化后的 metadata 查询

### 11.3 对 `schema-loader.ts` 的兼容

该兼容层已在当前分支删除。

当前 schema 读取统一来自：

- `ProviderDefinition.schema`
- `ProviderService.getProviderDefinitionSchema()`
- `ProviderService.listProviderSecretKeys()`

### 11.4 对 `models-loader.ts` 的兼容

该兼容层已在当前分支删除。

当前模型兼容格式统一来自：

- `ProviderDefinition.models`
- `ProviderService.listProviderDefinitionModels()`
- `ProviderService.listProviderRuntimeModels()`

### 11.5 对 `Preset` 的兼容

当前 `Preset` 兼容策略如下：

- 读时：`overrides ?? config ?? {}`
- 写时：新代码统一写 `overrides`
- 对外返回：以 `overrides` 为主，同时镜像 `config` 兼容旧调用方
- 数据迁移脚本在后续单独执行

### 11.6 对 secrets 存储的兼容

需要保留旧 provider id 的存储映射能力，例如：

- `google` -> `gemini`
- `zhipuai` -> `zhipu`

建议通过 `compatibility.storageIds` 和 canonical id 统一处理。

## 12. 分阶段实施计划

### Phase 0：建立统一类型与兼容层（已完成）

目标：

- 不改业务行为，先搭出新骨架。

任务：

- 新增 `packages/ai/providers/types.ts`
- 新增 `packages/ai/providers/registry.ts`
- 新增 `packages/ai/providers/service.ts`
- 新增 alias/canonical helper（当前已继续并入 `ProviderService`）
- `metadata.ts` 改为从 registry 派生
- 增加冲突检测和 alias 归一化测试

完成标志：

- 内建 Provider 可以通过 `ProviderRegistry` 查询到 definition。
- 现有 IPC 行为不变。

### Phase 1：迁移内建 Provider 定义（已完成）

目标：

- 把当前内建 Provider 的元数据统一搬到 definition。

任务：

- 新建 `packages/ai/providers/builtins/*/definition.ts`
- 将 `metadata.ts`、`modelProviders` 中的展示信息并入 definition
- 将 `resources/providers/*.schema.json` 中的 schema 并入 definition
- OpenAI / Gemini / Anthropic / Ollama 先迁一批作为模板
- DeepSeek / Qwen / Zhipu 基于 `openai-compatible` 方式迁移

完成标志：

- 内建 Provider 的 label、capabilities、default models、schema 都来自 definition。
- 各 provider runtime 不再写死重复元数据。

### Phase 2：迁移模型目录（已完成）

目标：

- 把模型来源收敛到 definition / builtins models。

任务：

- 历史 builtin 模型源逐 provider 迁入 `providers/builtins/*/models.ts`
- 模型读取先迁到 `ProviderService`，兼容壳后续删除
- `openai-runtime.ts`、`gemini-runtime.ts`、`provider-runtime-utils.ts` 统一调用 ProviderService
- 修复 `gemini` / `google` provider id 分叉

完成标志：

- 列模型只走统一 ProviderService。
- 历史 provider/model 目录不再被主链路依赖。

### Phase 3：切换业务消费方（已完成）

目标：

- Renderer、Workflow、Pi runtime 全部走统一入口。

任务：

- `ipc-main.ts` 改为调用 `ProviderService`
- `schema-loader.ts` 和 `models-loader.ts` 先变兼容壳，当前已删除
- `workflow/nodes/ai-workflow-utils.ts` 删除对 `resources/providers/*.models.json` 的直接读取
- `runtime/pi/model-resolver.ts`、`session-service.ts` 统一从 ProviderService 取 default models / schema / aliases

完成标志：

- 业务代码中不再直接读 `resources/providers` 和历史 provider/model 目录
- Provider 相关读取统一通过 registry/service

### Phase 4：引入插件 Provider（已完成主链路）

目标：

- 支持插件方式扩展 Provider。

任务：

- [x] 新增 `packages/ai/providers/plugins/manifest.ts`
- [x] 新增 `packages/ai/providers/plugins/validator.ts`
- [x] 新增 `packages/ai/providers/plugins/loader.ts`
- [x] 实现 manifest 扫描、校验、注册、冲突告警
- [x] 先支持声明式插件 Provider runtime/driver 复用
- [x] 支持模块化插件 runtime 动态加载

完成标志：

- 插件 Provider 能出现在 `ai:getProviders` 返回结果中。
- 声明式插件 Provider 已可创建 preset、配置 secrets、列模型、执行 chat。
- 模块化插件 Provider 已可通过 `runtime.modulePath` + `runtime.exportName` 注册自定义 adapter。

### Phase 5：清理遗留实现（已完成）

目标：

- 去掉并行旧源，完成真正统一。

任务：

- [x] 删除 `resources/providers/*.schema.json`
- [x] 删除 `resources/providers/*.models.json`
- [x] 删除整个历史 provider/model 目录与相关旧枚举
- [x] 删除 `metadata.ts`、`aliases.ts`、`schema-loader.ts`、`models-loader.ts`、`runtime/pi/provider-alias.ts`
- [x] 更新 `ai-module-design.md`

完成标志：

- Provider 数据不再需要多处同步维护。
- `resources/providers` 只保留图标等打包资产，不再承载 schema/models 运行时数据。
- 历史模型共享层已完全删除；共享模型类型与参数 schema 已并入 `providers/model-types.ts` 与 `providers/model-params.ts`。
- 旧的 provider id 枚举不再单独维护，统一收敛到 `ProviderDefinition.id`。
- 新增 Provider 的最少工作量降到“写 definition + 可选 runtime”。

## 13. 推荐的文件级改造顺序

建议按下面顺序推进，避免大爆炸重构：

1. `packages/ai/providers/types.ts`
2. `packages/ai/providers/registry.ts`
3. `packages/ai/providers/service.ts`
4. `packages/ai/providers/builtins/openai/*`
5. `packages/ai/providers/builtins/gemini/*`
6. `packages/ai/providers/builtins/anthropic/*`
7. `packages/ai/providers/builtins/ollama/*`
8. `packages/ai/providers/builtins/deepseek/*`
9. `packages/ai/providers/builtins/qwen/*`
10. `packages/ai/providers/builtins/zhipu/*`
11. `packages/ai/ipc-main.ts`
12. `packages/ai/runtime/pi/model-resolver.ts`
13. `packages/workflow/nodes/ai-workflow-utils.ts`
14. `packages/ai/providers/plugins/*`
15. 删除遗留目录与兼容壳

## 14. 测试与验收

### 14.1 单元测试

至少补这些测试：

- canonical id / alias 归一化
- ProviderDefinition 校验
- ProviderRegistry 冲突检测
- ProviderService 模型合并与去重
- Preset overrides 合并顺序
- plugin manifest 校验与注册

### 14.2 集成测试

至少验证这些链路：

- `ai:getProviders`
- `ai:listModels`
- `ai:setProviderSecrets` / `ai:getProviderSecrets`
- `Preset` 创建、读取、覆盖
- Workflow 模型选择器
- Pi runtime 下的 default model 解析

### 14.3 验收标准

满足以下条件可视为本次重构完成：

- 新增一个 OpenAI-compatible Provider，不需要同时改动 3 个以上目录。
- Builtin Provider 与插件 Provider 在 UI 中以同一种方式展示和配置。
- Preset 只保存用户覆盖项，不再复制 Provider 基础信息。
- Workflow、Renderer、Pi runtime 不再直接读取旧 JSON 资源文件。
- `gemini` / `google` 这类别名不会再导致模型层和运行时层分叉。

## 15. 风险与规避策略

### 风险 1：迁移期双写导致行为不一致

规避：

- 迁移期明确“definition 优先，旧源只读兼容，不再新增写入”。

### 风险 2：Preset 与 secrets 兼容性出问题

规避：

- 在 canonical id 之外保留 `storageIds` 兼容映射。
- 增加 migration smoke test。

### 风险 3：插件 Provider 破坏主进程稳定性

规避：

- manifest 先校验。
- 模块加载隔离错误。
- 插件 runtime 注册失败时不影响 builtin provider。

### 风险 4：重构过大导致主链路回归

规避：

- 按 phase 渐进推进。
- 先迁元数据和读取路径，再迁 runtime。
- 每迁一个 Provider 就补一轮回归测试。

## 16. 最终建议

如果目标是“维护简单，使用也简单”，最终建议是：

- Builtin Provider 用代码定义的 `ProviderDefinition` 作为唯一来源。
- Plugin Provider 用 manifest + 可选 runtime module 的方式接入同一个 registry。
- `Preset` 只保留用户覆盖项。
- 所有 Provider 读取都必须经过 `ProviderService`。
- 历史并行来源（资源 JSON、旧 provider/model 目录、`providers/metadata.ts` 等）已经退出主链路；`resources/providers` 目录只保留图标资产，共享模型类型与参数 schema 已并入 `providers/model-types.ts` 与 `providers/model-params.ts`。

一句话总结最终形态：

`ProviderDefinition` 统一声明，`ProviderService` 统一读取，`ProtocolDriver` 统一执行，`Preset` 统一覆盖，`Plugin` 统一扩展。
