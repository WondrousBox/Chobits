# AI 使用量事件 Schema 与 Recorder 契约草案

更新时间：2026-04-15

本文档是 Phase 1 的技术草案，用于把 [AI 统计看板设计与开发计划](./AI%20%E7%BB%9F%E8%AE%A1%E7%9C%8B%E6%9D%BF%E8%AE%BE%E8%AE%A1%E4%B8%8E%E5%BC%80%E5%8F%91%E8%AE%A1%E5%88%92.md) 与 [AI 使用量分类与计量规范](./AI%20%E4%BD%BF%E7%94%A8%E9%87%8F%E5%88%86%E7%B1%BB%E4%B8%8E%E8%AE%A1%E9%87%8F%E8%A7%84%E8%8C%83.md) 细化成可直接编码的 schema 草案与 recorder 契约。

本文档的目标是冻结两件事：

- `ai_usage_events` 的字段级设计
- `recordAiUsageEvent(...)` 的入参、返回值、去重、校验与标准化契约

本文档仍然作为 Phase 1 的设计基线。当前代码状态（2026-04-15）是：`schema.ts`、Drizzle migration、analytics repository、`usage-recorder.ts`、聊天主链路，以及 `conversation_title / translation / summary / mindmap / memory_extraction` 首批接入已按本文首轮落地；其中 `memory_extraction` 已按 `analyze / extract / merge` 分阶段记录。Phase 7 也已开始落地：`/tagger` 页面可覆写为 `tagging/classify`，`TaggingService.autoTagText` 也会按分段 provider 调用写入 `tagging/classify`，自动记忆召回中的 LLM 关键词提取会按 `memory_recall/analyze` 记录，`PiExecutionService.embed(...)` 会按真实 provider 调用写入 `embedding/vectorize`，`PiExecutionService.transcribe(...)` 会按真实 provider 调用写入 `transcription/transcribe`，`PiExecutionService.generateImage(...)` 会按真实 provider 调用写入 `image_generation/generate`；workflow 已知 AI node 也会按 `workflow_ai` 归类，其中 Pi chat/image 路径通过 `analyticsUsage` 覆写，legacy chat fallback 直接走统一 recorder。Pi task runtime 也已补齐 `usage/rawUsage` 透传，并向 summary / translation / mindmap 等 recorder 链路继续透传 runtime 已暴露的 `providerRequestId`；聊天主链路、标题生成与 tagging 也已补齐同一透传口径。总结任务的 usage metadata 已按实际截断后输入补齐 `contentLength`。历史聊天补录也已落地，可把 `chat_messages.metadata.aiUsage / piRawUsage` 回填为 `message_backfilled` 事件。当前还新增了 `packages/ai/analytics/events.ts` 与 `packages/ai/analytics/fingerprint.ts` 作为 AI 域 usage 事件契约与共享幂等 helper；AI 业务链路会优先发出 `emitAiUsageObservedEvent(...)`，analytics 模块接入后会先把事件写入 `ai_usage_event_outbox`，再由 listener/drain 调用 recorder；同时 `window.YUA.analytics` 已暴露 outbox 健康摘要、失败队列查询、手动重试 failed outbox 与手动触发 drain 的动作，便于看板直接观察并恢复统计链路健康度。overview / timeline / breakdown 对 token / cost 聚合也已回到 `NULL` 语义：命中事件全部缺失 usage 时不再强制写成 `0`。后续如果实现与本文发生偏离，应先回写本文档，再调整代码。

## 1. 本轮冻结的补充决策

在已有设计基础上，进一步冻结以下实现细节：

- `providerRequestId` 的唯一性按 `providerId + providerRequestId` 判断，不单列做全局唯一。
- schema 中新增 `eventFingerprint` 字段，作为无 `providerRequestId` 时的稳定幂等键。
- `sourceId` 在 recorder 入参中升级为必填，不再允许隐式缺失。
- `operationKey` 在 recorder 入参中升级为必填，不再仅是推荐字段。
- `metadata` 与 `rawUsage` 均按 JSON 文本落库，优先可追溯，不先做列爆炸。
- AI 业务链路不直接依赖 recorder；对外统一发布 `ai usage observed` 领域事件，analytics listener 再消费并落到 recorder。
- `buildAiUsageEventFingerprint(...)` 升级为共享 helper，由 event bus、outbox、recorder 复用同一幂等键算法。
- analytics listener 接入时必须先写 `ai_usage_event_outbox`，再异步 drain 到 `ai_usage_events`。
- Phase 1 只设计单条写入接口 `recordAiUsageEvent`，批量写入后续再扩展。
- 聊天实时事件在消息持久化成功后，`metadata` 中补充 `assistantMessageId`，作为历史补录与去重的辅助锚点。
- 历史聊天补录在 recorder 之外，额外优先按 `metadata.assistantMessageId` 与 `requestId = messageId` 查重；命中已有实时事件时不再重复写库。
- 聚合查询不再把 `SUM(...)` 的 `NULL` 结果强制 `COALESCE` 成 `0`；overview / timeline / breakdown 在全部命中事件都缺失该 usage 字段时，应继续返回 `NULL`。

## 2. `ai_usage_events` 表字段草案

## 2.1 字段分组

建议字段分为 8 组：

1. 主键与幂等
2. 来源与业务归属
3. 分类字段
4. Provider 与模型字段
5. token 与费用字段
6. 计量口径字段
7. 生命周期时间字段
8. 扩展与追溯字段

## 2.2 字段清单

| 字段                   | 类型         | 必填 | 默认             | 说明                                 |
| ---------------------- | ------------ | ---- | ---------------- | ------------------------------------ |
| `id`                   | `text`       | 是   | `randomUUID()`   | 事件主键                             |
| `workspaceId`          | `text`       | 否   | `NULL`           | 归属工作空间                         |
| `traceId`              | `text`       | 是   | 无               | 同一业务链路追踪 ID                  |
| `parentEventId`        | `text`       | 否   | `NULL`           | 父事件 ID，自关联                    |
| `requestId`            | `text`       | 是   | 无               | 宿主任务 ID                          |
| `providerRequestId`    | `text`       | 否   | `NULL`           | provider 原始请求 ID                 |
| `eventFingerprint`     | `text`       | 是   | 无               | recorder 计算出的稳定幂等键          |
| `operationKey`         | `text`       | 是   | 无               | 子操作键，例如 `chunk:3`             |
| `attemptIndex`         | `integer`    | 是   | `0`              | 第几次尝试                           |
| `conversationId`       | `text`       | 否   | `NULL`           | 关联会话 ID                          |
| `resourceId`           | `text`       | 否   | `NULL`           | 关联资源 ID                          |
| `sourceType`           | `text`       | 是   | 无               | 来源入口                             |
| `sourceId`             | `text`       | 是   | 无               | 来源实体 ID                          |
| `sourceLabel`          | `text`       | 否   | `NULL`           | 展示标签                             |
| `usageCategory`        | `text`       | 是   | 无               | 业务大类                             |
| `usageFeature`         | `text`       | 是   | 无               | 具体功能                             |
| `usageStage`           | `text`       | 是   | 无               | 功能阶段                             |
| `providerId`           | `text`       | 是   | 无               | 服务商 ID                            |
| `providerPresetId`     | `text`       | 否   | `NULL`           | 预设 ID                              |
| `model`                | `text`       | 是   | 无               | 模型 ID                              |
| `agentId`              | `text`       | 否   | `NULL`           | agent/profile ID                     |
| `status`               | `text`       | 是   | 无               | `completed` / `failed` / `cancelled` |
| `inputTokens`          | `integer`    | 否   | `NULL`           | 标准化输入 token                     |
| `outputTokens`         | `integer`    | 否   | `NULL`           | 标准化输出 token                     |
| `cacheReadTokens`      | `integer`    | 否   | `NULL`           | cache read token                     |
| `cacheWriteTokens`     | `integer`    | 否   | `NULL`           | cache write token                    |
| `reasoningTokens`      | `integer`    | 否   | `NULL`           | reasoning token                      |
| `totalTokens`          | `integer`    | 否   | `NULL`           | 展示总 token                         |
| `billableInputTokens`  | `integer`    | 否   | `NULL`           | 可计费输入 token                     |
| `billableOutputTokens` | `integer`    | 否   | `NULL`           | 可计费输出 token                     |
| `billableTotalTokens`  | `integer`    | 否   | `NULL`           | 可计费总 token                       |
| `estimatedCost`        | `real`       | 否   | `NULL`           | 费用估算                             |
| `meteringSource`       | `text`       | 是   | 无               | 计量来源                             |
| `meteringAccuracy`     | `text`       | 是   | 无               | 精度等级                             |
| `billingEligible`      | `integer`    | 是   | `0`              | 0/1                                  |
| `startedAt`            | `integer`    | 否   | `NULL`           | 调用开始时间                         |
| `completedAt`          | `integer`    | 否   | `NULL`           | 调用结束时间                         |
| `createdAt`            | `integer`    | 是   | `unixepoch(now)` | 事件创建时间                         |
| `metadata`             | `text(json)` | 否   | `NULL`           | 业务扩展信息                         |
| `rawUsage`             | `text(json)` | 否   | `NULL`           | provider 原始 usage                  |

## 2.3 `NULL` 与 `0` 的强制语义

以下列统一适用：

- `inputTokens`
- `outputTokens`
- `cacheReadTokens`
- `cacheWriteTokens`
- `reasoningTokens`
- `totalTokens`
- `billableInputTokens`
- `billableOutputTokens`
- `billableTotalTokens`
- `estimatedCost`

规则：

- `NULL` 表示未知、未返回、未采到，不能被解释为 0
- `0` 表示 provider 明确返回 0，或经稳定规则可确认确实为 0
- 聚合查询必须跳过 `NULL`，不能直接 `COALESCE(x, 0)` 后再当作“真实 0 消耗”

## 2.4 Drizzle schema 草案

建议在 [schema.ts](../../electron/main/db/schema.ts) 中按以下结构新增：

```ts
export const ai_usage_events = sqliteTable(
  'ai_usage_events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => randomUUID()),

    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    traceId: text('trace_id').notNull(),
    parentEventId: text('parent_event_id'),
    requestId: text('request_id').notNull(),
    providerRequestId: text('provider_request_id'),
    eventFingerprint: text('event_fingerprint').notNull(),
    operationKey: text('operation_key').notNull(),
    attemptIndex: integer('attempt_index').notNull().default(0),

    conversationId: text('conversation_id').references(() => conversations.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    resourceId: text('resource_id').references(() => resources.id, { onDelete: 'set null', onUpdate: 'cascade' }),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    sourceLabel: text('source_label'),

    usageCategory: text('usage_category').notNull(),
    usageFeature: text('usage_feature').notNull(),
    usageStage: text('usage_stage').notNull(),

    providerId: text('provider_id').notNull(),
    providerPresetId: text('provider_preset_id'),
    model: text('model').notNull(),
    agentId: text('agent_id'),
    status: text('status', { enum: ['completed', 'failed', 'cancelled'] }).notNull(),

    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    cacheReadTokens: integer('cache_read_tokens'),
    cacheWriteTokens: integer('cache_write_tokens'),
    reasoningTokens: integer('reasoning_tokens'),
    totalTokens: integer('total_tokens'),
    billableInputTokens: integer('billable_input_tokens'),
    billableOutputTokens: integer('billable_output_tokens'),
    billableTotalTokens: integer('billable_total_tokens'),
    estimatedCost: real('estimated_cost'),

    meteringSource: text('metering_source').notNull(),
    meteringAccuracy: text('metering_accuracy').notNull(),
    billingEligible: integer('billing_eligible').notNull().default(0),

    startedAt: integer('started_at'),
    completedAt: integer('completed_at'),
    createdAt: integer('created_at').default(sql`(unixepoch('now')*1000)`),

    metadata: text('metadata', { mode: 'json' }),
    rawUsage: text('raw_usage', { mode: 'json' })
  },
  (t) => ({
    uqAiUsageProviderReq: uniqueIndex('uq_ai_usage_provider_req').on(t.providerId, t.providerRequestId),
    uqAiUsageFingerprint: uniqueIndex('uq_ai_usage_fingerprint').on(t.eventFingerprint),

    idxAiUsageWorkspaceCreated: index('idx_ai_usage_workspace_created').on(t.workspaceId, t.createdAt),
    idxAiUsageProviderCreated: index('idx_ai_usage_provider_created').on(t.providerId, t.createdAt),
    idxAiUsageModelCreated: index('idx_ai_usage_model_created').on(t.model, t.createdAt),
    idxAiUsageCategoryCreated: index('idx_ai_usage_category_created').on(t.usageCategory, t.createdAt),
    idxAiUsageFeatureCreated: index('idx_ai_usage_feature_created').on(t.usageFeature, t.createdAt),
    idxAiUsageSourceCreated: index('idx_ai_usage_source_created').on(t.sourceType, t.createdAt),
    idxAiUsageRequest: index('idx_ai_usage_request').on(t.requestId),
    idxAiUsageTrace: index('idx_ai_usage_trace').on(t.traceId),
    idxAiUsageConversation: index('idx_ai_usage_conversation').on(t.conversationId),
    idxAiUsageResource: index('idx_ai_usage_resource').on(t.resourceId),
    idxAiUsageStatusCreated: index('idx_ai_usage_status_created').on(t.status, t.createdAt)
  })
);
```

说明：

- `parentEventId` 的自关联外键可以在实现时再决定是否直接声明；如果 Drizzle 自引用处理麻烦，可先不加 FK，仅保留字段。
- `uq_ai_usage_provider_req` 中 `providerRequestId = NULL` 的多条记录在 SQLite 下仍可共存，符合预期。
- `uq_ai_usage_fingerprint` 是真正的 recorder 兜底幂等约束。

## 2.5 类型导出草案

建议在 [schema.ts](../../electron/main/db/schema.ts) 同步导出：

```ts
export type AiUsageEventRow = InferSelectModel<typeof ai_usage_events>;
export type NewAiUsageEvent = InferInsertModel<typeof ai_usage_events>;
```

同时在 `packages/ai/analytics/types.ts` 定义业务侧类型，不直接把 DB Row 暴露给所有调用方。

## 2.6 `ai_usage_event_outbox` 草案

为满足“AI 模块只发事件、analytics 模块插拔监听”且仍尽量避免丢账，当前实现已经补充 outbox 层。

建议字段最少包含：

- `eventType`
- `eventFingerprint`
- `producer`
- `traceId`
- `requestId`
- `providerId`
- `model`
- `sourceType`
- `sourceId`
- `usageFeature`
- `usageStage`
- `operationKey`
- `attemptIndex`
- `emittedAt`
- `payload`
- `status`
- `attemptCount`
- `lastError`
- `lastAttemptAt`
- `processedAt`
- `createdAt`
- `updatedAt`

当前约束：

- writer 先按 `eventType + eventFingerprint` 去重写 outbox。
- `payload` 保存完整 `AiUsageObservedEvent`，用于后续重放、排查与恢复。
- drain 只消费 `status = pending` 的记录。
- recorder 成功后标记 `processed`；可重试错误保留 `pending`；不可重试错误标记 `failed`。
- `failed` 事件不自动伪造为成功，后续由修复脚本或人工对账介入。

## 3. 索引与唯一性策略

## 3.1 双层幂等策略

首版建议固定为两层：

1. `providerId + providerRequestId`
2. `eventFingerprint`

适用规则：

- 如果 provider 返回了稳定的 request id，优先命中第一层
- 如果 provider 没有 request id，则依赖 `eventFingerprint`
- recorder 在入库前先查，数据库层再靠唯一索引兜底

## 3.2 `eventFingerprint` 组成规则

建议 recorder 固定按以下字段生成：

- `traceId`
- `requestId`
- `sourceType`
- `sourceId`
- `usageFeature`
- `usageStage`
- `operationKey`
- `attemptIndex`
- `providerId`
- `model`

推荐做法：

- 先构造稳定 key 对象
- 按固定字段顺序序列化
- 再做 `sha256`，最终存 hex string

示例逻辑：

```ts
sha256(
  JSON.stringify({
    traceId,
    requestId,
    sourceType,
    sourceId,
    usageFeature,
    usageStage,
    operationKey,
    attemptIndex,
    providerId,
    model
  })
);
```

## 3.3 为什么不只依赖 `providerRequestId`

因为以下场景很常见：

- 部分 provider 不返回 request id
- 某些链路只拿到流式结果，不一定拿到完整 request metadata
- 历史补录与 reconstructed 数据天然没有 provider request id

所以 schema 层必须保留自己的稳定幂等键。

## 4. recorder 入参契约草案

说明：

- `recordAiUsageEvent(...)` 是 analytics 域内部的标准化落库契约。
- AI / workflow / memory 等业务域的直接接入契约，优先是 `emitAiUsageObservedEvent(...)`。
- 只有 analytics 内部流程，例如 backfill、修复脚本、对账重放，才允许直接调 recorder。

## 4.1 入口函数

首版统一使用：

```ts
recordAiUsageEvent(input: RecordAiUsageEventInput): Promise<RecordAiUsageEventResult>
```

建议放在：

- [usage-recorder.ts](../../electron/main/handlers/analytics/usage-recorder.ts)
- [events.ts](../../packages/ai/analytics/events.ts)
  - AI 域发布 usage 观察事件
- [fingerprint.ts](../../packages/ai/analytics/fingerprint.ts)
  - AI 域与 analytics 域共享 usage 事件幂等指纹算法
- [usage-event-listener.ts](../../electron/main/handlers/analytics/usage-event-listener.ts)
  - analytics 域注册 durable writer，把事件先写入 outbox，再 drain 到 recorder

## 4.2 入参类型草案

```ts
export type RecordAiUsageEventInput = {
  workspaceId?: string;
  traceId: string;
  parentEventId?: string;
  requestId: string;
  providerRequestId?: string;
  operationKey: string;
  attemptIndex?: number;

  conversationId?: string;
  resourceId?: string;
  sourceType: AiUsageSourceType;
  sourceId: string;
  sourceLabel?: string;

  usageCategory: AiUsageCategory;
  usageFeature: AiUsageFeature;
  usageStage: AiUsageStage;

  providerId: string;
  providerPresetId?: string;
  model: string;
  agentId?: string;
  status: 'completed' | 'failed' | 'cancelled';

  usage?: {
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
    cacheReadTokens?: number | null;
    cacheWriteTokens?: number | null;
    reasoningTokens?: number | null;
    billableInputTokens?: number | null;
    billableOutputTokens?: number | null;
    billableTotalTokens?: number | null;
    estimatedCost?: number | null;
  } | null;

  rawUsage?: unknown;
  meteringSource: AiMeteringSource;
  meteringAccuracy?: AiMeteringAccuracy;
  billingEligible?: boolean;

  startedAt?: number;
  completedAt?: number;
  metadata?: Record<string, unknown>;
};
```

## 4.3 必填字段规则

以下字段在业务调用方视角必须提供：

- `traceId`
- `requestId`
- `operationKey`
- `sourceType`
- `sourceId`
- `usageCategory`
- `usageFeature`
- `usageStage`
- `providerId`
- `model`
- `status`
- `meteringSource`

补充说明：

- `attemptIndex` 如果调用方不传，recorder 自动补 `0`
- `meteringAccuracy` 如果调用方不传，由 recorder 按 `usage` 和 `meteringSource` 推导
- `billingEligible` 如果调用方不传，由 recorder 统一判断，不允许业务代码各自拍脑袋赋值

## 4.4 校验规则

recorder 必须在入库前做以下校验：

- `traceId` / `requestId` / `operationKey` / `sourceId` 不能为空字符串
- `attemptIndex` 必须是 `>= 0` 的整数
- `status` 必须在允许集合内
- `usageCategory / usageFeature / usageStage` 必须在冻结枚举内
- `meteringSource / meteringAccuracy` 组合必须合法
- `estimated` 数据不能 `billingEligible = true`
- `message_backfilled` 数据不能 `billingEligible = true`

建议：

- 校验失败返回结构化错误，不直接静默吞掉
- 对调用方可自动修复的情况只做“补默认值”，不做模糊猜测

## 4.5 返回值草案

```ts
export type RecordAiUsageEventResult =
  | {
      ok: true;
      eventId: string;
      deduped: boolean;
      dedupeStrategy: 'provider_request_id' | 'fingerprint' | 'none';
      row: AiUsageEventRow;
      warnings?: string[];
    }
  | {
      ok: false;
      code: 'invalid_input' | 'invalid_metering_combination' | 'db_insert_failed' | 'db_lookup_failed';
      message: string;
      retryable: boolean;
      warnings?: string[];
    };
```

设计意图：

- 让调用方可以明确知道是“重复命中”还是“新写入”
- 让后续链路日志和问题排查更容易
- 避免纯布尔返回导致账务问题难追踪

## 5. recorder 内部处理顺序草案

建议固定按以下顺序执行：

1. 校验必填字段
2. 归一化字符串与默认值
3. 计算 `eventFingerprint`
4. 归一化 `usage`
5. 计算 `totalTokens`
6. 计算 `billable*`
7. 推导 `meteringAccuracy`
8. 推导 `billingEligible`
9. 先查重
10. 写库
11. 返回结构化结果

## 5.1 归一化细节

建议统一规则：

- 空字符串转 `undefined` 再决定是否允许
- 负数 token 视为非法
- 非有限数字视为非法
- `completedAt < startedAt` 时返回告警，必要时拒绝写入

## 5.2 `totalTokens` 计算规则

沿用规范文档定义：

1. 优先使用 provider 明确 `totalTokens`
2. 否则对可知 token 字段求和
3. 再不行就 `NULL`

补充实现约束：

- 不能把 `billableTotalTokens` 倒灌回 `totalTokens`
- 也不能把 `totalTokens` 盲目复制到 `billableTotalTokens`

## 5.3 `meteringAccuracy` 推导建议

建议按下列优先级：

- `provider_reported + usage 存在`
  - 默认 `exact`
- `message_backfilled`
  - 默认 `medium`
- `reconstructed`
  - 默认 `high` 或 `medium`
- `estimated`
  - 固定 `low`

如果调用方显式传入精度：

- recorder 仍要检查是否合法
- 不合法时返回错误，不自动默默改掉

## 5.4 `billingEligible` 推导建议

默认逻辑：

```ts
billingEligible =
  meteringSource === 'provider_reported' &&
  meteringAccuracy === 'exact' &&
  providerId !== '' &&
  model !== '' &&
  (billableInputTokens != null || billableOutputTokens != null || billableTotalTokens != null || estimatedCost != null);
```

注意：

- `status` 不是硬性否决条件
- `failed` / `cancelled` 只要满足上面规则，仍然可计费

## 6. 调用方责任边界

业务链路必须负责：

- 正确传 `usageCategory / usageFeature / usageStage`
- 正确传 `sourceType / sourceId / operationKey`
- 正确区分 retry 与 stage
- 尽可能传入原始 `rawUsage`

recorder 统一负责：

- 校验
- 幂等
- token 标准化
- 计量精度判断
- 计费资格判断
- 落库

这条边界必须保持，不能让每条业务链路自己实现一套“半 recorder”。

## 7. 示例草案

## 7.1 聊天主回复

```ts
await recordAiUsageEvent({
  workspaceId,
  traceId: requestId,
  requestId,
  providerRequestId,
  operationKey: 'reply',
  attemptIndex: 0,
  conversationId,
  sourceType: 'chat',
  sourceId: conversationId,
  sourceLabel: '聊天',
  usageCategory: 'conversation',
  usageFeature: 'chat',
  usageStage: 'generate',
  providerId,
  providerPresetId,
  model,
  agentId,
  status: 'completed',
  usage,
  rawUsage,
  meteringSource: 'provider_reported',
  startedAt,
  completedAt
});
```

## 7.2 翻译 chunk

```ts
await recordAiUsageEvent({
  workspaceId,
  traceId: requestId,
  requestId,
  providerRequestId,
  operationKey: `chunk:${chunkIndex}`,
  attemptIndex,
  resourceId,
  sourceType: 'translation',
  sourceId: requestId,
  sourceLabel: '字幕翻译',
  usageCategory: 'content_processing',
  usageFeature: 'translation',
  usageStage: 'generate',
  providerId,
  providerPresetId,
  model,
  status: 'completed',
  usage,
  rawUsage,
  meteringSource: 'provider_reported',
  metadata: {
    resourceId,
    chunkIndex,
    chunkCount,
    segmentCount,
    targetLanguage
  }
});
```

## 7.3 记忆提取 merge 子步骤

```ts
await recordAiUsageEvent({
  workspaceId,
  traceId: pipelineTraceId,
  requestId: pipelineRequestId,
  operationKey: `topic:${topicSlug}:open_items`,
  attemptIndex: 0,
  sourceType: 'memory',
  sourceId: pipelineRequestId,
  sourceLabel: '记忆提取',
  usageCategory: 'memory',
  usageFeature: 'memory_extraction',
  usageStage: 'merge',
  providerId,
  model,
  status: 'completed',
  usage,
  rawUsage,
  meteringSource: 'provider_reported',
  metadata: {
    date,
    topicSlug,
    conversationIds
  }
});
```

当前实际落地的 `memory_extraction` `operationKey` 口径是：`split_topics` 对应 `analyze`，`topic:${topicSlug}:extract` 对应 `extract`，`topic:${topicSlug}:open_items` 与 `topic:${topicSlug}:contradiction` 对应 `merge`。

补充说明：当前实际落地的 `tagging` `operationKey` 口径是：`/tagger` 页面通过 chat 主链路发起的请求继续沿聊天主请求 ID，但会通过 `analyticsUsage` 显式归类到 `tagging/classify`；`TaggingService.autoTagText` 当前按 `segment:${index}` 为每次 provider 调用单独落账。

## 7.4 自动记忆召回关键词提取

```ts
await recordAiUsageEvent({
  workspaceId,
  traceId: chatRequestId,
  requestId: chatRequestId,
  operationKey: 'keyword_extraction',
  conversationId,
  sourceType: 'memory',
  sourceId: conversationId,
  sourceLabel: '记忆召回',
  usageCategory: 'memory',
  usageFeature: 'memory_recall',
  usageStage: 'analyze',
  providerId,
  providerPresetId,
  model,
  agentId: 'memory-auto-recall',
  status: 'completed',
  usage,
  rawUsage,
  meteringSource: 'provider_reported',
  metadata: {
    conversationId,
    recallMode: 'auto',
    runtime: 'pi',
    recentContextChars,
    userMessageChars
  }
});
```

当前实际落地的 `memory_recall` 首轮口径是：自动记忆召回中的 LLM 关键词提取记为 `operationKey = keyword_extraction`、`usageStage = analyze`；后续 `searchWithContent`、FTS、topic graph、targeted read 等纯本地检索步骤不记 token。`createLlmQueryAnalyzer(...)` 已补齐同口径 usage 回调能力，后续如果真实业务链路接入，可沿 `operationKey = query_analysis`、`usageStage = analyze` 继续落账。

## 7.5 向量化

```ts
await recordAiUsageEvent({
  traceId: requestId,
  requestId,
  operationKey: 'vectorize',
  sourceType: 'embedding',
  sourceId: requestId,
  sourceLabel: '向量化',
  usageCategory: 'system',
  usageFeature: 'embedding',
  usageStage: 'vectorize',
  providerId,
  providerPresetId,
  model,
  agentId: 'pi-execution',
  status: 'completed',
  usage,
  rawUsage,
  meteringSource: 'provider_reported',
  metadata: {
    runtime: 'pi',
    textCount,
    totalInputChars,
    normalize,
    vectorCount,
    vectorDim
  }
});
```

当前实际落地的 `embedding` 首轮口径是：`PiExecutionService.embed(...)` 默认记为 `operationKey = vectorize`、`sourceType = embedding`、`usageCategory = system`、`usageFeature = embedding`、`usageStage = vectorize`。如果调用方明确知道该次向量化属于某个业务域，可通过 `EmbeddingRequest.extras.analyticsUsage` 显式覆写分类与 `sourceId / sourceLabel / operationKey / metadata`；例如记忆索引场景可以覆写到 `usageCategory = memory`。

## 7.6 转写

```ts
await recordAiUsageEvent({
  traceId: requestId,
  requestId,
  operationKey: 'transcribe',
  sourceType: 'transcription',
  sourceId: requestId,
  sourceLabel: '转写',
  usageCategory: 'media',
  usageFeature: 'transcription',
  usageStage: 'transcribe',
  providerId,
  providerPresetId,
  model,
  agentId: 'pi-execution',
  status: 'completed',
  usage,
  rawUsage,
  meteringSource: 'provider_reported',
  metadata: {
    runtime: 'pi',
    audioBytes,
    language,
    promptChars,
    textChars,
    providerUsageType,
    providerBilledSeconds
  }
});
```

当前实际落地的 `transcription` 首轮口径是：`PiExecutionService.transcribe(...)` 默认记为 `operationKey = transcribe`、`sourceType = transcription`、`usageCategory = media`、`usageFeature = transcription`、`usageStage = transcribe`。如果调用方明确知道该次转写属于某个业务域，可通过 `TranscriptionRequest.extras.analyticsUsage` 显式覆写分类与 `sourceId / sourceLabel / operationKey / metadata`。provider 返回 token 型 usage 时，会同步写入标准 token 字段与 `billable*` 字段；如果 provider 返回的是 duration 型 usage，则只保留 `rawUsage` 与 `metadata.providerBilledSeconds`，token 保持 `NULL`，不伪造 `0`。

## 7.7 图片生成

```ts
await recordAiUsageEvent({
  traceId: requestId,
  requestId,
  operationKey: 'generate',
  sourceType: 'image_generation',
  sourceId: requestId,
  sourceLabel: '图片生成',
  usageCategory: 'media',
  usageFeature: 'image_generation',
  usageStage: 'generate',
  providerId,
  providerPresetId,
  model,
  agentId: 'pi-execution',
  status: 'completed',
  usage,
  rawUsage,
  meteringSource: 'provider_reported',
  metadata: {
    runtime: 'pi',
    promptChars,
    quality,
    size,
    imageCount,
    revisedPromptChars,
    providerInputImageTokens,
    providerInputTextTokens,
    providerOutputImageTokens,
    providerOutputTextTokens
  }
});
```

当前实际落地的 `image_generation` 首轮口径是：`PiExecutionService.generateImage(...)` 默认记为 `operationKey = generate`、`sourceType = image_generation`、`usageCategory = media`、`usageFeature = image_generation`、`usageStage = generate`。如果调用方明确知道该次图片生成属于某个业务域，可通过 `ImageGenerationRequest.extras.analyticsUsage` 显式覆写分类与 `sourceId / sourceLabel / operationKey / metadata`。provider 返回 token 型 usage 时，会同步写入标准 token 字段与 `billable*` 字段；如果 provider 未返回 usage，则事件仍然入库，但 token 保持 `NULL`，不伪造 `0`。

## 7.8 Workflow AI

```ts
await recordAiUsageEvent({
  traceId: workflowRunId || requestId,
  requestId,
  operationKey: 'understand_image',
  sourceType: 'workflow',
  sourceId: workflowNodeId,
  sourceLabel: workflowNodeLabel,
  usageCategory: 'workflow',
  usageFeature: 'workflow_ai',
  usageStage: 'analyze',
  providerId,
  providerPresetId,
  model,
  agentId: 'workflow',
  status: 'completed',
  usage,
  rawUsage,
  meteringSource: 'provider_reported',
  metadata: {
    runtime: 'pi' | 'legacy',
    workflowId,
    workflowName,
    workflowRunId,
    workflowNodeId,
    workflowNodeType,
    workflowNodeLabel
  }
});
```

当前实际落地的 `workflow_ai` 首轮口径是：workflow 内 `ai/chat`、`ai/prompt-optimizer`、`image/image-understand`、`image/image-generate` 已接入 `workflow_ai`。其中 Pi chat / image 路径通过 `analyticsUsage` 覆写到 workflow 分类；legacy chat fallback 在 utility 层直接走统一 recorder。当前已要求把 `workflowId / workflowName / workflowRunId / workflowNodeId / workflowNodeType / workflowNodeLabel` 带入 metadata，便于后续看板按 workflow 维度做筛选与对账。

## 8. 对文档与实现清单的影响

这份草案落地后，建议同步三件事：

1. 在主设计文档中补充本文档引用
2. 在实施清单中把“字段级 schema 草案”和“recorder 契约草案”标记为已完成文档项
3. 开始真实实现前，以本文档为准写 `schema.ts`、`analytics-repositories.ts`、`usage-recorder.ts`

如果实现中出现新的列、索引、幂等策略变更，应先改本文档，再改代码。
