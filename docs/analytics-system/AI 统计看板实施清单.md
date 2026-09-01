# AI 统计看板实施清单

更新时间：2026-04-15

本文档用于把“设计方案”和“分类计量规范”转换成可直接开工的实施 checklist。当前阶段已经进入代码实现，Phase 1 核心底座与聊天主链路首批埋点已完成第一轮落地；后续继续按本文顺序推进即可。

相关文档：

- [AI 统计看板设计与开发计划](./AI%20%E7%BB%9F%E8%AE%A1%E7%9C%8B%E6%9D%BF%E8%AE%BE%E8%AE%A1%E4%B8%8E%E5%BC%80%E5%8F%91%E8%AE%A1%E5%88%92.md)
- [AI 使用量分类与计量规范](./AI%20%E4%BD%BF%E7%94%A8%E9%87%8F%E5%88%86%E7%B1%BB%E4%B8%8E%E8%AE%A1%E9%87%8F%E8%A7%84%E8%8C%83.md)
- [AI 使用量事件 Schema 与 Recorder 契约草案](./AI%20%E4%BD%BF%E7%94%A8%E9%87%8F%E4%BA%8B%E4%BB%B6%20Schema%20%E4%B8%8E%20Recorder%20%E5%A5%91%E7%BA%A6%E8%8D%89%E6%A1%88.md)

## 0. 当前已完成项

以下项目已经完成。其中前四项属于“文档冻结完成”，后四项属于“已进入代码实现并完成首轮落地”：

- [x] 主设计文档已完成
- [x] 分类与计量规范已完成
- [x] Phase 1 字段级 schema 草案已完成
- [x] Phase 1 recorder 入参与返回契约草案已完成
- [x] `ai_usage_events` 已在 `schema.ts` 中真实建表
- [x] Drizzle migration 已生成
- [x] analytics repository / recorder 已完成首版实现
- [x] `ai_usage_event_outbox` 已在 `schema.ts` 中真实建表，并已生成对应 Drizzle migration
- [x] AI usage 事件总线已升级为“事件发布 + durable outbox”模式：AI 业务链路统一发出 `ai usage observed` 事件，analytics 接入后先写 outbox，再异步 drain 到 recorder
- [x] 聊天主链路已开始写入首批 usage 事件
- [x] `conversation_title / translation / summary / mindmap / memory_extraction` 已完成首轮 usage 接入
- [x] `window.YUA.analytics` 首版查询桥已完成
- [x] 统计页面与侧边栏入口已完成首版落地
- [x] 统计查询/UI 已完成第二轮扩展：筛选区已补齐 `Provider / Model / usageCategory / status / meteringAccuracy / billingEligible`
- [x] analytics 查询层已支持 `workflowRunId / workflowNodeId / workflowNodeType / providerUsageType` metadata 过滤与 `workflowNodeType` breakdown
- [x] analytics 查询层已补齐 outbox 健康摘要与失败队列接口，统计页已可展示 pending / failed / retrying / 最近失败事件
- [x] analytics 查询/动作层已补齐 `retryOutboxEvents / drainOutbox`，统计页已可直接触发失败队列重试与 pending 队列消费
- [x] outbox 恢复链路已补齐自动化回归：`test/ai-usage-outbox.spec.ts` 已覆盖自动消费、手动消费、失败重试三条路径
- [x] 统计页最近调用明细已补齐 `billableTotalTokens / requestId / traceId / providerRequestId / workflow metadata / providerUsageType` 展示，并对缺失 token 保持 `-`，不伪造 `0`
- [x] overview / timeline / breakdown 已回到 `NULL` 聚合语义：命中事件都缺失 usage 时不再把 token / cost 强行显示为 `0`
- [x] 历史聊天 usage 补录能力已完成首版落地
- [x] 统计页已支持显式触发“补录历史聊天”并展示结果
- [x] `session-service` 与 Pi task runtime 已补齐 `providerRequestId` 的 best-effort 透传；chat / title / tagging / translation / summary / mindmap 会继续向 recorder 传递 runtime 已暴露的 provider 请求标识
- [x] 总结任务 usage metadata 已补齐 `contentLength`
- [x] Phase 7 首条链路已开始落地：`/tagger` 页请求可按 `tagging/classify` 单独记账
- [x] Phase 7 已补齐 `memory_recall` 首个真实 usage 入口：自动记忆召回里的 LLM 关键词提取会按 `memory_recall/analyze` 单独记账
- [x] Phase 7 已补齐 `tagging` service 链路：`TaggingService.autoTagText` 会按分段 provider 调用写入 `tagging/classify`
- [x] Phase 7 已补齐 `embedding` 统一执行链路：`PiExecutionService.embed(...)` 会按真实 provider 调用写入 `embedding/vectorize`
- [x] Phase 7 已补齐 `transcription` 统一执行链路：`PiExecutionService.transcribe(...)` 会按真实 provider 调用写入 `transcription/transcribe`
- [x] Phase 7 已补齐 `image_generation` 统一执行链路：`PiExecutionService.generateImage(...)` 会按真实 provider 调用写入 `image_generation/generate`
- [x] Phase 7 已补齐首批 `workflow_ai` 链路：workflow 内已知 AI node 会按 `workflow_ai` 单独归类

## 1. 已冻结的实施决策

以下决策在正式开发前不再反复摇摆：

- 统计系统首版先围绕 `ai_usage_events` 这张事实表建设，不先做日聚合表。
- 事件粒度固定为“1 次 provider 调用 = 1 条统计事件”。
- 分类、精度、计费口径以规范文档为准，不在具体业务代码里临时发明新枚举。
- 首版统计 API 单独挂到 `window.YUA.analytics`，不混入 `window.YUA.ai`。
- recorder 放在主进程侧，统一负责标准化、去重、精度判断和落库。
- AI 模块与统计模块之间通过 usage 领域事件解耦；AI 侧不直接依赖 recorder。
- 首版查询只通过 IPC 获取，不让 Renderer 直接碰数据库。
- 历史聊天补录已经在页面交付后进入实现，并继续沿用统一 recorder / analytics API 口径。

## 2. Definition Of Ready

在真正开始写代码前，至少确认以下事项：

- [x] 已确认看板菜单名称继续使用 `统计`
- [x] 已确认看板首版路由继续使用 `/resources/analytics`
- [x] 已确认首版必须接入的功能范围：
  - `chat`
  - `conversation_title`
  - `translation`
  - `summary`
  - `mindmap`
  - `memory_extraction`
- [x] 已确认 `usageCategory / usageFeature / usageStage` 不再继续改名
- [x] 已确认 `meteringSource / meteringAccuracy / billingEligible` 口径冻结
- [x] 已确认缺失 usage 记 `NULL`，不伪造 `0`
- [x] 已确认失败或取消请求只要拿到 provider 精确 usage，仍可记为可计费

## 3. 推荐开发顺序总览

建议严格按以下顺序推进：

1. Phase 1：数据表、迁移、repository、共享类型
2. Phase 2：usage recorder
3. Phase 3：首批链路接入
4. Phase 4：统计查询 IPC 与 preload
5. Phase 5：统计页面与菜单
6. Phase 6：历史聊天补录
7. Phase 7：第二批能力接入与统计模块扩展

理由：

- 先有计量事实表，后面的 UI 和补录才不会返工。
- 先有 recorder，后面的业务接入才能保持同口径。
- 先做聊天和高频内容处理能力，再做补录和高级图表，交付路径最短。

## 4. Phase 1：数据表与基础类型

目标：把“计量对象”正式落成数据库结构和可复用类型。

当前文档进度：

- [x] 字段级 schema 草案已完成
- [x] recorder 契约草案已完成
- [x] `schema.ts` 真实建表已完成
- [x] repository 首版实现已完成
- [x] recorder 首版实现已完成

### 4.1 数据库与 migration

- [x] 在 [schema.ts](../../electron/main/db/schema.ts) 新增 `ai_usage_events`
- [x] 字段按规范文档一次性补齐，至少包括：
  - `traceId`
  - `requestId`
  - `providerRequestId`
  - `eventFingerprint`
  - `operationKey`
  - `attemptIndex`
  - `sourceType`
  - `sourceId`
  - `usageCategory`
  - `usageFeature`
  - `usageStage`
  - `providerId`
  - `providerPresetId`
  - `model`
  - `status`
  - `inputTokens`
  - `outputTokens`
  - `cacheReadTokens`
  - `cacheWriteTokens`
  - `reasoningTokens`
  - `totalTokens`
  - `billableInputTokens`
  - `billableOutputTokens`
  - `billableTotalTokens`
  - `meteringSource`
  - `meteringAccuracy`
  - `billingEligible`
  - `metadata`
  - `rawUsage`
- [x] 按计划补齐索引，至少覆盖：
  - `workspaceId + createdAt`
  - `providerId + createdAt`
  - `model + createdAt`
  - `usageCategory + createdAt`
  - `usageFeature + createdAt`
  - `sourceType + createdAt`
  - `requestId`
  - `providerId + providerRequestId`
  - `eventFingerprint`
  - `operationKey`
  - `traceId`
- [x] 运行 `pnpm run db:generate`
- [x] 检查 `drizzle/` 中已生成新 migration
- [ ] 确认 [index.ts](../../electron/main/db/index.ts) 的 `migrate()` 在新库创建和旧库升级两条路径都能创建该表
- [ ] 如果首轮发现 migration 无法覆盖某些兼容逻辑，再补充最小 raw SQL 兼容修复，不要直接跳过 migration

### 4.2 repository

建议新增文件：

- [analytics-repositories.ts](../../electron/main/db/analytics-repositories.ts)

首版 repository 建议最少包含：

- [x] `insertAiUsageEvent`
- [x] `findAiUsageEventByProviderRequestId`
- [x] `findAiUsageEventByFingerprint`
- [x] `listAiUsageEvents`
- [x] `getAiUsageOverview`
- [x] `getAiUsageTimeline`
- [x] `getAiUsageByProvider`
- [x] `getAiUsageByModel`
- [x] `getAiUsageByCategory`
- [x] `getAiUsageByFeature`
- [x] `listChatUsageBackfillCandidates`
- [x] `findChatUsageEventByAssistantMessageId`

注意事项：

- [x] 查询层必须显式区分“展示总 token”与“可计费 token”
- [x] 对 `NULL` token 的事件，overview 中请求数要统计，但 token 聚合不能强行按 0 处理
- [x] 明细列表必须能直接定位 `providerRequestId` / `requestId` / `traceId`

### 4.3 共享类型

建议新增文件：

- [types.ts](../../packages/ai/types.ts)
  - 仅在确定需要被现有 AI bridge 复用时扩展
- [analytics](../../packages/ai)
  - 建议新增 `packages/ai/analytics/types.ts`

推荐拆分：

- [x] 在独立的 `packages/ai/analytics/types.ts` 中声明 analytics 专用类型，避免继续膨胀现有 `packages/ai/types.ts`
- [x] 冻结以下类型：
  - `AiUsageCategory`
  - `AiUsageFeature`
  - `AiUsageStage`
  - `AiMeteringSource`
  - `AiMeteringAccuracy`
  - `AiUsageEventInput`
  - `AiUsageEventRow`
  - `AiUsageQueryFilter`
- [x] 在类型层明确 token 字段允许 `number | null`，不要误写成“必填 number”

Phase 1 验收：

- [ ] 新库启动后能自动生成 `ai_usage_events`
- [ ] 旧库启动后 migration 不报错
- [ ] repository 可插入、可查询、可聚合
- [ ] analytics 类型可以被主进程和前端查询结果复用

## 5. Phase 2：usage recorder

目标：建立统一落库入口，后续所有链路只接 recorder，不各自手写 SQL。

补充说明：

- 当前实施口径已经升级为“业务链路发事件，analytics listener 消费并调 recorder”。
- 当前实现已进一步升级为“业务链路发事件，analytics writer 先写 outbox，listener/drain 再调 recorder”。
- 因此业务代码的推荐接入点不再是直接 `recordAiUsageEvent(...)`，而是 `emitAiUsageObservedEvent(...)`。
- recorder 继续作为 analytics 内部标准化与落库边界存在。

建议新增文件：

- [usage-recorder.ts](../../electron/main/handlers/analytics/usage-recorder.ts)
- [events.ts](../../packages/ai/analytics/events.ts)
- [fingerprint.ts](../../packages/ai/analytics/fingerprint.ts)
- [usage-event-listener.ts](../../electron/main/handlers/analytics/usage-event-listener.ts)

推荐能力：

- [x] `recordAiUsageEvent(input)`
- [x] `emitAiUsageObservedEvent(input)`
- [x] `initAiUsageAnalyticsListener()`
- [x] `registerAiUsageObservedEventWriter(writer)`
- [x] `buildAiUsageEventFingerprint(input)`
- [x] `normalizeProviderUsage(rawUsage)`
- [x] `computeDisplayTokens(normalizedUsage)`
- [x] `computeBillableTokens(normalizedUsage, providerId, model)`
- [x] `resolveMeteringAccuracy(input)`
- [x] `shouldMarkBillingEligible(input)`

必须满足的规则：

- [x] 真实 provider 调用一旦发出，就允许记录事件
- [x] 没有 usage 时事件照样可入库，但 token 字段保持 `NULL`
- [x] 优先按 `providerRequestId` 去重
- [x] 无 `providerRequestId` 时按 `traceId + requestId + usageFeature + usageStage + operationKey + attemptIndex + sourceId` 去重
- [x] retry 不会被误去重
- [x] `totalTokens` 自动补全
- [x] `billableTotalTokens` 不能盲目等于 `totalTokens`
- [x] 历史补录和估算数据自动关闭 `billingEligible`
- [x] `failed` / `cancelled` 事件如果 provider usage 精确，允许 `billingEligible = 1`
- [x] AI 业务链路已开始从“直连 recorder”切换为“发 usage 事件，由 analytics listener 监听并落库”
- [x] analytics 模块接入后必须先写 `ai_usage_event_outbox`，再异步 drain 到 recorder
- [x] pending outbox 事件在主进程重启后仍可继续消费，避免 emit 后崩溃直接丢账

推荐额外输出：

- [x] recorder 返回最终落库记录或事件 ID，方便调用方日志追踪
- [x] 关键失败场景写标准日志前缀，例如 `[analytics][usage-recorder]`

Phase 2 验收：

- [ ] 同一输入重复调用 recorder 不会产生重复事件
- [ ] 有 usage / 无 usage / estimated / backfilled 四类输入都能正确写库
- [ ] `NULL` 与 `0` 语义正确

## 6. Phase 3：首批链路接入

目标：把首版承诺的功能都接到 recorder。

### 6.1 聊天主链路

核心文件：

- [chat-service.ts](../../packages/ai/chat-service.ts)
- [session-service.ts](../../packages/ai/runtime/pi/session-service.ts)
- [stream-adapter.ts](../../packages/ai/runtime/pi/stream-adapter.ts)

清单：

- [x] 非流式 `chatWithPi()` 成功后记录 1 条 `chat/generate`
- [x] 流式 `chatStreamWithPi()` 在最终 `message_completed` 后记录 1 条 `chat/generate`
- [x] 如果会话消息持久化失败，不影响 usage 事件写入
- [x] 从 `session-service` 继续把 `providerRequestId`、标准化 usage、原始 usage 透传到可记录位置
- [x] `sourceType = chat`
- [x] `usageCategory = conversation`
- [x] `usageFeature = chat`
- [x] `usageStage = generate`
- [x] `operationKey = reply`

### 6.2 对话标题生成

核心文件：

- [chat-service.ts](../../packages/ai/chat-service.ts)
- [title.ts](../../packages/ai/runtime/pi/tasks/title.ts)

清单：

- [x] 标题生成单独记一条事件
- [x] 不与主聊天回复合并统计
- [x] `sourceType = conversation_title`
- [x] `usageFeature = conversation_title`
- [x] `operationKey = generate`
- [x] fallback 到 legacy chat 时也保持同一统计口径

### 6.3 翻译

核心文件：

- [translation-service.ts](../../packages/ai/services/translation-service.ts)
- [ipc-handler-helpers.ts](../../packages/ai/ipc-handler-helpers.ts)

清单：

- [x] 在 `translateChunk()` 内围绕每次 `chatFn()` 调用记录事件
- [x] 每个 chunk 独立 `operationKey`
- [x] 实际格式：`chunk:${chunkIndex}`
- [x] retry 仅增加 `attemptIndex`，不改 `usageStage`
- [x] `sourceType = translation`
- [x] `usageCategory = content_processing`
- [x] `usageFeature = translation`
- [x] `usageStage = generate`
- [x] `metadata` 首轮已带：
  - `resourceId`
  - `targetLanguage`
  - `sourceLanguage`
  - `chunkIndex`
  - `totalChunks`
  - `totalSegments`
  - `startIndex`
  - `endIndex`

### 6.4 总结

核心文件：

- [summary-service.ts](../../packages/ai/services/summary-service.ts)
- [ipc-handler-helpers.ts](../../packages/ai/ipc-handler-helpers.ts)

清单：

- [x] 每次总结任务记录 1 条事件
- [x] `sourceType = summary`
- [x] `usageFeature = summary`
- [x] `usageStage = generate`
- [x] `operationKey = generate`
- [x] `metadata` 已补齐 `contentLength`；当前已带 `resourceId`、`targetLanguage`、`contentType`

### 6.5 思维导图

核心文件：

- [mindmap-service.ts](../../packages/ai/services/mindmap-service.ts)
- [ipc-handler-helpers.ts](../../packages/ai/ipc-handler-helpers.ts)

清单：

- [x] 每次脑图生成记录 1 条事件
- [x] `sourceType = mindmap`
- [x] `usageFeature = mindmap`
- [x] `usageStage = generate`
- [x] `operationKey = generate`

### 6.6 记忆提取

核心文件：

- [memory-extraction-service.ts](../../packages/ai/services/memory-extraction-service.ts)

清单：

- [x] `splitTopics()` 记为 `memory_extraction/analyze`
- [x] `extractMemory()` 记为 `memory_extraction/extract`
- [x] `resolveOpenItems()` / `detectContradictions()` 等 merge 子步骤记为 `memory_extraction/merge`
- [x] topic 级操作已带稳定 `operationKey`
- [x] 当前已落地的 `operationKey` 包括：`split_topics`、`topic:${topicSlug}:extract`、`topic:${topicSlug}:open_items`、`topic:${topicSlug}:contradiction`
- [x] `workspaceId` 使用顶层字段，`metadata` 已补充 `conversationIds / date / jobType / topicSlug` 等上下文

Phase 3 验收：

- [x] `chat / translation / summary / mindmap / memory_extraction` 都能产出真实事件
      当前已完成 `chat / conversation_title / translation / summary / mindmap / memory_extraction`
- [ ] 同一混合使用场景下，token 不会全部落进 `chat`
- [x] translation retry 会增加事件数，不会被吞掉

## 7. Phase 4：统计查询 IPC 与 preload

目标：把数据库查询能力正式暴露给 Renderer。

建议新增文件：

- [ipc-main.ts](../../electron/main/handlers/analytics/ipc-main.ts)
- [analytics.ts](../../electron/preload/apis/analytics.ts)

建议改动文件：

- [index.ts](../../electron/main/handlers/index.ts)
- [index.ts](../../electron/preload/index.ts)
- [renderer.d.ts](../../src/renderer.d.ts)

清单：

- [x] 新增 `initAnalyticsHandlers()`
- [x] 在主进程 handler 总入口注册 analytics handlers
- [x] 在 preload 通过 `window.YUA.analytics` 暴露能力
- [x] 在 `src/renderer.d.ts` 为 `window.YUA.analytics` 补齐全局类型声明
- [x] 首版已暴露 `getUsageOverview / getUsageTimeline / getUsageByProvider / getUsageByModel / getUsageByCategory / getUsageByFeature / listUsageEvents`
- [x] `backfillChatUsage` 已通过 analytics IPC / preload 暴露
- [x] API 已统一支持 `workspaceId / createdAtFrom / createdAtTo / providerId / model / usageCategory / usageFeature / sourceType / billingEligible / meteringAccuracy`
- [x] 查询层已支持 workflow metadata 过滤：
  - `workflowRunId`
  - `workflowNodeId`
  - `workflowNodeType`
  - `providerUsageType`
- [x] breakdown 已支持 `workflowNodeType`

建议：

- [x] 首版不要把 analytics API 挂到 `window.YUA.ai`
- [x] 首版先走 preload API wrapper，不额外新建通用 renderer bridge

Phase 4 验收：

- [x] Renderer 可通过 `window.YUA.analytics.*` 获取统计数据
- [x] 时间、工作空间、Provider、Feature 过滤都可用
- [x] 查询层不会把历史补录误算到可计费口径

## 8. Phase 5：统计页面与菜单

目标：把统计系统变成用户可进入的独立页面。

建议新增文件：

- [AnalyticsPage.tsx](../../src/pages/AnalyticsPage/AnalyticsPage.tsx)
- [components](../../src/pages/AnalyticsPage/components)

建议改动文件：

- [ResourceSidebar.tsx](../../src/pages/ResourcePage/components/layout/ResourceSidebar.tsx)
- [ResourcePage.tsx](../../src/pages/ResourcePage/ResourcePage.tsx)

清单：

- [x] 侧边栏新增 `统计` 菜单
- [x] 菜单高亮规则覆盖 `/resources/analytics`
- [x] 在 `ResourcePage.tsx` 增加路由入口
- [x] 首版页面已包含过滤区、总览卡片、趋势图、Provider 排行、Model 排行、用途分类排行、具体功能排行、最近调用明细
- [x] 统计页已新增 outbox 健康视图，能够展示 pending / failed / retrying / 最近失败队列
- [x] 统计页已支持“立即消费队列”和“重试失败队列”两个恢复动作
- [x] 明细列表已展示 `时间 / Provider / Model / usageFeature / usageStage / status / input / output / total / billingEligible / meteringAccuracy`
- [x] 筛选区已补齐 `Provider / Model / usageCategory / status / billingEligible / meteringAccuracy`
- [x] 页面已新增 `stage` 与 `workflowNodeType` 两组扩展榜单
- [x] 最近调用明细已展示 `billableTotalTokens / requestId / traceId / providerRequestId / workflow metadata / providerUsageType`
- [x] 最近调用明细对缺失 token usage 的事件显示 `-`，不伪造 `0`

建议首版简化项：

- [x] 先用基础表格和图表，不先做复杂拖拽布局
- [x] 首版先支持日趋势，不先做小时级钻取
- [x] 首版先把精度过滤放进顶部筛选，不做复杂图例系统
- [x] 统计页已支持显式触发历史聊天补录，并展示扫描 / 写入 / 去重 / 跳过 / 失败结果

Phase 5 验收：

- [x] 用户能从资源页侧边栏进入统计页
- [x] 首屏能稳定展示 overview + timeline + ranking + event list
- [x] 刷新页面后筛选和数据仍正常

## 9. Phase 6：历史聊天补录

目标：把已有 `chat_messages.metadata.aiUsage / piRawUsage` 转为可展示的历史事件。

清单：

- [x] 从 `chat_messages` 中筛出 `assistant` 消息
- [x] 读取 `metadata.aiUsage`
- [x] 缺少 `metadata.aiUsage` 时继续尝试 `metadata.piRawUsage`
- [x] 生成 `message_backfilled` 事件
- [x] 历史事件统一：
  - `billingEligible = 0`
  - `meteringSource = message_backfilled`
  - `meteringAccuracy = high` 或 `medium`
- [x] 补录逻辑必须幂等
- [x] 补录前先建立去重指纹，避免重复写库
- [x] 回填前优先按 `metadata.assistantMessageId` / `requestId = messageId` 查重，并对已存在实时聊天事件做近邻匹配去重
- [x] 聊天实时事件在消息持久化成功后补充 `metadata.assistantMessageId` 锚点，降低后续补录重复记账风险

建议：

- [x] 首版通过显式按钮或 IPC 调用触发，不做启动时自动全量补录
- [x] 补录完成后返回：
  - 扫描消息数
  - 成功补录数
  - 已存在跳过数
  - 缺失 usage 跳过数
  - 缺失 provider / model 跳过数
  - metadata 非法数
  - 失败数与 warnings

Phase 6 验收：

- [x] 旧聊天会话可以在统计页展示
- [x] 重复执行补录不会翻倍
- [x] 可计费视图中不会出现历史补录数据

## 10. Phase 7：第二批接入与扩展

这一阶段不阻塞首版上线，但建议按下列顺序补齐：

- [x] `memory_recall`
      当前完成范围：自动记忆召回（`memory-auto-recall`）中的 LLM 关键词提取已按 `memory_recall/analyze` 落账，并沿统一 recorder 写入真实 `usage/rawUsage`
      不计入 token 的范围：`searchWithContent`、FTS、topic graph、targeted read 等纯本地检索步骤
      后续补齐：若后面把 `createLlmQueryAnalyzer` 真正接入某条业务链路，继续沿同一 recorder 输出 `query_analysis/analyze`
- [x] `tagging`
      当前完成范围：`/tagger` 页面通过 `chat` 主链路发起的请求，已支持显式覆写到 `tagging/classify`
      当前完成范围补充：`TaggingService.autoTagText` 已接入统一 recorder；Pi one-shot 与 legacy ephemeral 路径都会按 `segment:${index}` 写入 `tagging/classify`
      当前已知 tagging 入口已完成首轮接入
- [x] `embedding`
      当前完成范围：`PiExecutionService.embed(...)` 已接入统一 recorder；默认按 `embedding/vectorize` 落账，缺失 usage 时 token 记 `NULL`
      分类覆写：支持通过 `EmbeddingRequest.extras.analyticsUsage` 显式改写 `sourceType / usageCategory / usageFeature / usageStage`
      当前完成入口：`ai:embed` 以及所有走 `PiExecutionService.embed(...)` 的内部调用
- [x] `transcription`
      当前完成范围：`PiExecutionService.transcribe(...)` 已接入统一 recorder；默认按 `transcription/transcribe` 落账，缺失 usage 时 token 记 `NULL`
      分类覆写：支持通过 `TranscriptionRequest.extras.analyticsUsage` 显式改写 `sourceType / usageCategory / usageFeature / usageStage`
      精度补充：provider 返回 token 型 usage 时会同步写入 display / billable token；若返回 duration 型 usage，则只保留 `rawUsage` 与 `metadata.providerBilledSeconds`，不伪造 token
- [x] `image_generation`
      当前完成范围：`PiExecutionService.generateImage(...)` 与 `PiImageGenerationService.generateImageFromRequest(...)` 已接入统一 recorder；默认按 `image_generation/generate` 落账，缺失 usage 时 token 记 `NULL`
      分类覆写：支持通过 `ImageGenerationRequest.extras.analyticsUsage` 显式改写 `sourceType / usageCategory / usageFeature / usageStage`
      精度补充：provider 返回 token 型 usage 时会同步写入 display / billable token；若 provider 未返回 usage，则只保留事件与 `rawUsage`/metadata，不伪造 token
- [x] `workflow_ai`
      当前完成范围：`ai/chat`、`ai/prompt-optimizer`、`image/image-understand`、`image/image-generate` 已接入 `workflow_ai`
      Pi 路径：通过 `analyticsUsage` 覆写到 `sourceType = workflow / usageCategory = workflow / usageFeature = workflow_ai`
      legacy chat fallback：仍沿统一 recorder 写事件，缺失 usage 时 token 记 `NULL`
      metadata：当前会带 `workflowId / workflowName / workflowRunId / workflowNodeId / workflowNodeType / workflowNodeLabel`

对应入口：

- [memory-retrieval-service.ts](../../packages/ai/services/memory-retrieval-service.ts)
- [tagging-service.ts](../../packages/ai/services/tagging-service.ts)
- [tag.ts](../../packages/ai/runtime/pi/tasks/tag.ts)
- [execution-service.ts](../../packages/ai/runtime/pi/execution-service.ts)
- [image-generation-service.ts](../../packages/ai/runtime/pi/image-generation-service.ts)

## 11. 验证矩阵

开发完成后，至少手工验证以下样例：

- [x] 自动化回归：`test/ai-usage-outbox.spec.ts`
  - 已覆盖 `emit -> append outbox -> auto drain -> processed`
  - 已覆盖 `triggerAiUsageOutboxDrain()` 手动消费 pending 队列
  - 已覆盖 `retryFailedAiUsageOutboxEvents()` 手动重试 failed 队列并重新消费

- [ ] 聊天单轮回复：
  - 预期 1 条 `chat/generate`
- [ ] 聊天首轮触发标题生成：
  - 预期 1 条 `chat/generate`
  - 另有 1 条 `conversation_title/generate`
- [ ] 3 个翻译 chunk，无重试：
  - 预期 3 条 `translation/generate`
- [ ] 3 个翻译 chunk，其中 1 个重试 2 次：
  - 预期 5 条 `translation/generate`
- [ ] 总结任务：
  - 预期 1 条 `summary/generate`
- [ ] 思维导图任务：
  - 预期 1 条 `mindmap/generate`
- [ ] 记忆提取 1 次 split + 2 个 topic extract + 2 个 topic merge：
  - 预期至少 5 条事件
- [ ] 自动记忆召回触发 1 次 LLM 关键词提取：
  - 预期 1 条 `memory_recall/analyze`
  - `metadata.recallMode = auto`
  - 不会因为后续纯本地 recall search 再额外生成 token 事件
- [ ] `/tagger` 页面发起 1 次打标签请求：
  - 预期 1 条 `tagging/classify`
  - 不再落进 `chat/generate`
- [ ] `window.YUA.ai.autoTagText(...)` 触发 3 段文本自动打标签：
  - 预期 3 条 `tagging/classify`
  - `operationKey` 分别为 `segment:0`、`segment:1`、`segment:2`
  - `metadata.requestKind = auto_tag_text`
- [ ] `window.YUA.ai.embed(...)` 触发 1 次向量化：
  - 预期 1 条 `embedding/vectorize`
  - `metadata.textCount` 与 `metadata.totalInputChars` 正确
  - 若 provider 返回 usage，则 `meteringAccuracy = exact`
  - 若通过 `extras.analyticsUsage` 指定为记忆索引，则应落入覆写后的分类桶
- [ ] `window.YUA.ai.transcribe(...)` 触发 1 次 token 型转写：
  - 预期 1 条 `transcription/transcribe`
  - `metadata.audioBytes` 与 `metadata.textChars` 正确
  - 若 provider 返回 token 型 usage，则 `usage.*` 与 `billable*` 同步落账，`meteringAccuracy = exact`
- [ ] `window.YUA.ai.transcribe(...)` 触发 1 次 duration 型转写：
  - 预期仍有 1 条事件
  - `rawUsage.type = duration`
  - token 字段保持 `NULL`，`metadata.providerBilledSeconds` 正确
- [ ] `window.YUA.ai.generateImage(...)` 触发 1 次 token 型图片生成：
  - 预期 1 条 `image_generation/generate`
  - `metadata.promptChars`、`metadata.quality`、`metadata.size` 正确
  - 若 provider 返回 token 型 usage，则 `usage.*` 与 `billable*` 同步落账
- [ ] workflow 执行 1 次 `ai/chat` 节点：
  - 预期 1 条 `workflow_ai/generate`
  - `sourceType = workflow`
  - `metadata.workflowRunId / workflowNodeId / workflowNodeType` 正确
- [ ] workflow 执行 1 次 `image/image-understand` 节点：
  - 预期 1 条 `workflow_ai/analyze`
  - `operationKey = understand_image`
- [ ] provider 未返回 usage 的图片生成：
  - 预期仍有事件，但 token 字段为 `NULL`
- [ ] 一个失败请求拿到 provider 精确 usage：
  - 预期 `status = failed`
  - 如果满足规则，可 `billingEligible = 1`

## 12. 建议执行命令

实施阶段建议至少跑以下命令：

- [ ] `pnpm run db:generate`
- [ ] `pnpm exec eslint electron/main/db/schema.ts electron/main/handlers/index.ts electron/preload/index.ts`
- [ ] `pnpm exec eslint packages/ai/chat-service.ts packages/ai/runtime/pi/session-service.ts packages/ai/runtime/pi/stream-adapter.ts`
- [ ] `pnpm exec eslint packages/ai/services/translation-service.ts packages/ai/services/summary-service.ts packages/ai/services/mindmap-service.ts packages/ai/services/memory-extraction-service.ts`
- [ ] `pnpm exec eslint src/pages/ResourcePage/components/layout/ResourceSidebar.tsx src/pages/ResourcePage/ResourcePage.tsx`

说明：

- 全量 `pnpm exec tsc --noEmit` 可能受仓库现有历史问题影响，建议同时记录“本次新增问题”和“仓库基线问题”。

## 13. 并行开发建议

当 Phase 1 和 Phase 2 完成后，可以按以下方式并行：

- 包 A：
  - 聊天主链路
  - 对话标题生成
- 包 B：
  - 翻译
  - 总结
  - 思维导图
- 包 C：
  - 记忆提取
  - 记忆召回
- 包 D：
  - analytics IPC
  - preload
  - 页面 UI

前提：

- recorder 入参和分类字典已经冻结
- `ai_usage_events` 已经建表
- `operationKey` 与去重口径已经实现

## 14. 首版上线前的最终关卡

上线前必须全部满足：

- [ ] 统计页可访问
- [ ] 首版承诺的 6 类功能都已接入事件表
- [ ] overview / timeline / ranking / events 都可用
- [ ] `billingEligible` 与展示口径分离
- [ ] 历史补录不会污染可计费统计
- [ ] retry、失败、取消的事件行为已验证
- [ ] 至少完成 1 次真实工作空间下的端到端手测

如果以上任一项未完成，不建议把“统计系统已可作为计量基础”对外宣称为完成。
