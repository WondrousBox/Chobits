# AI 统计看板设计与开发计划

更新时间：2026-04-15

本文档用于指导项目内“AI 统计看板”的设计与落地。第一阶段目标不是只做一个“token 展示效果”，而是建立一套可长期演进的、尽可能精确的 AI 使用量计量体系：既能按服务商、模型统计，也必须能按业务用途分类统计，并为后续付费系统、额度系统、成本核算、组织级账单提供稳定基础。

分类字典、事件粒度、计量精度与计费口径，另见配套规范文档：[AI 使用量分类与计量规范](./AI%20%E4%BD%BF%E7%94%A8%E9%87%8F%E5%88%86%E7%B1%BB%E4%B8%8E%E8%AE%A1%E9%87%8F%E8%A7%84%E8%8C%83.md)。

具体实施顺序、文件落点与验收 checklist，另见：[AI 统计看板实施清单](./AI%20%E7%BB%9F%E8%AE%A1%E7%9C%8B%E6%9D%BF%E5%AE%9E%E6%96%BD%E6%B8%85%E5%8D%95.md)。

Phase 1 的字段级 schema 与 recorder 契约草案，另见：[AI 使用量事件 Schema 与 Recorder 契约草案](./AI%20%E4%BD%BF%E7%94%A8%E9%87%8F%E4%BA%8B%E4%BB%B6%20Schema%20%E4%B8%8E%20Recorder%20%E5%A5%91%E7%BA%A6%E8%8D%89%E6%A1%88.md)。

当前实现进度（2026-04-14）：

- Phase 1 基础设施已完成首轮落地。
- `ai_usage_events` 表、Drizzle migration、analytics 共享类型、repository、usage recorder 已完成首轮落地。
- 聊天主链路、对话标题生成、翻译、总结、思维导图、记忆提取已接入真实 usage 事件写入。
- 记忆提取已按 `analyze / extract / merge` 分阶段落账，并补齐 topic 级稳定 `operationKey`。
- `window.YUA.analytics` 首版查询桥已完成，可供 Renderer 读取 overview / timeline / breakdown / events 数据。
- 资源页侧边栏已新增 `统计` 菜单，`AnalyticsPage` 首版已可查看 overview / timeline / ranking / recent events。
- analytics 查询层已补齐第二轮扩展：除基础列过滤外，现已支持 `workflowRunId / workflowNodeId / workflowNodeType / providerUsageType` 等 metadata 维度过滤，并支持 `workflowNodeType` breakdown。
- AI usage 采集链路已开始按“事件发布 / 监听消费”重构：AI 模块不再要求直接依赖 analytics recorder，而是统一发出 `ai usage observed` 事件；analytics 模块通过 listener 挂载式接入并负责真正落库。
- AI usage 事件耐久层已完成首版落地：analytics 模块在接入时会先把 `ai usage observed` 事件写入 `ai_usage_event_outbox`，再异步 drain 到 `ai_usage_events`；pending 事件可跨主进程重启继续消费，避免 emit 后崩溃导致丢账。
- 历史聊天补录已完成首版落地：主进程可扫描 `chat_messages.metadata.aiUsage / piRawUsage`，通过 `window.YUA.analytics.backfillChatUsage` 回填 `message_backfilled` 事件。
- 统计页已支持显式触发“补录历史聊天”，并展示扫描 / 写入 / 去重 / 跳过 / 失败结果。
- 统计页查询/UI 已完成第二轮扩展：顶部筛选已补齐 `Provider / Model / usageCategory / status / meteringAccuracy / billingEligible`，并新增执行阶段、工作流 AI 节点榜单与更完整的最近事件上下文展示。
- `window.YUA.analytics` 已补齐 `outboxHealth / outboxEvents` 查询；统计页现可直接展示 outbox 的 pending / failed / retrying / 最近失败队列，用于观察事件驱动统计链路是否堵塞。
- `window.YUA.analytics` 已补齐 `retryOutboxEvents / drainOutbox` 动作；统计页现可直接触发“立即消费队列”和“重试失败队列”，把 outbox 可视化扩展到可恢复操作。
- outbox 恢复闭环已补齐自动化回归：`test/ai-usage-outbox.spec.ts` 已覆盖自动消费、手动消费 pending 队列、手动重试 failed 队列三条关键路径。
- 最近调用明细现已额外展示 `billableTotalTokens`、`requestId / traceId / providerRequestId`、workflow run/node metadata、`providerUsageType` 等排查字段；缺失 token usage 的事件在 UI 中明确显示为 `-`，不再伪造 `0`。
- overview / timeline / breakdown 的 token / cost 聚合现已保持 `NULL` 语义：命中事件全部缺失 usage 时不再强行显示为 `0`，统计页会继续统计请求数，但聚合值显示为 `-`。
- 聊天实时事件在消息持久化成功后会补充 `metadata.assistantMessageId`，用于后续补录幂等与对账。
- chat-derived 链路现已支持显式声明业务用途覆写；`/tagger` 页面发起的请求会按 `tagging/classify` 落账，不再误归到 `chat`。
- `TaggingService.autoTagText` 已接入统一 recorder；Pi one-shot 与 legacy ephemeral 两条打标签路径都会按 `tagging/classify` 分段落账。
- 自动记忆召回已完成首个真实 usage 入口：`memory-auto-recall` 的 LLM 关键词提取会按 `memory_recall/analyze` 落账；`searchWithContent`、FTS、主题图谱、定向读取等纯本地检索步骤继续保持“不记 token”。
- `PiExecutionService.embed(...)` 已接入统一 recorder；默认按 `embedding/vectorize` 记账，并支持通过 `extras.analyticsUsage` 显式覆写到如 `memory` 等业务归类。
- `PiExecutionService.transcribe(...)` 已接入统一 recorder；默认按 `transcription/transcribe` 记账，也支持通过 `extras.analyticsUsage` 显式覆写业务归类。provider 返回 token 型 usage 时会同步写入 display/billable token；若返回 duration 型 usage，则只保留 `rawUsage` 与时长 metadata，token 保持 `NULL`。
- `PiExecutionService.generateImage(...)` 已接入统一 recorder；默认按 `image_generation/generate` 记账，也支持通过 `extras.analyticsUsage` 显式覆写业务归类。provider 返回 token 型 usage 时会同步写入 display/billable token；若 provider 未返回 usage，则事件照样记录，但 token 保持 `NULL`。
- workflow 已补齐首批 `workflow_ai` 归类：`ai/chat`、`ai/prompt-optimizer`、`image/image-understand`、`image/image-generate` 会把 workflow run / node 信息带入统计；Pi chat 路径通过 `analyticsUsage` 统一改类，legacy chat fallback 也会走统一 recorder。
- Pi task runtime 已把 `usage/rawUsage` 透传到任务 service，可支撑内容处理类链路统一接 recorder；同时已补齐 `providerRequestId` 的 best-effort 透传，summary / translation / mindmap / tagging / title / chat 主链路都会继续向 recorder 传递 runtime 已暴露的 provider 请求标识。
- 总结任务 usage metadata 已补齐 `contentLength`，并按实际送入模型的截断后文本长度记录。
- `providerRequestId` 的更深层补采仍依赖 Pi/runtime 与 provider SDK 暴露原始响应 / 请求标识；当前代码已完成“有则透传，无则保持为空，不伪造”的口径。
- 更深入的筛选与付费口径收口仍在后续 phase。

## 1. 背景与现状

当前项目已经具备以下基础：

- 对话链路已经开始携带消息级 `usage` 信息，并能在聊天界面中显示单轮 token 消耗。
- `ResourcePage` 已经具备稳定的侧边栏导航与路由壳子，适合挂载独立的统计页面。
- AI 能力分布在聊天、字幕翻译、总结、思维导图、工具调用、工作流等多条链路中，但统计口径仍然分散。

当前存在的核心问题：

- 只在单条消息或单次会话中看得到 token，无法按服务商、模型、时间范围统一汇总。
- 看不到 token 究竟用在了哪里，无法区分聊天、翻译、总结、思维导图、记忆提取等真实业务用途。
- 没有独立看板页面，用户无法从产品层面理解“近期 AI 消耗分布”和“哪些模型最常用”。
- 聊天、翻译、总结等 AI 任务没有统一统计事件模型，后续一旦要做成本、成功率、任务量、文件处理量，就会越来越碎。
- 现有 `chat_messages.metadata.aiUsage` 更适合作为消息展示或回放数据，不适合作为长期统计的唯一数据源。
- 当前 usage 采集更偏“UI 展示级”，还没有达到“计费可依赖”的精度标准，未来如果要做付费系统，会缺少可追溯的原始计量依据。

结论：需要新增一个“统计中心”能力，页面统一，数据分域，查询统一，逐步扩展。

## 2. 产品目标

### 2.1 第一阶段必须实现

- 新增一个独立菜单项，进入“统计”看板页面。
- 对所有已接入的 AI 调用进行 token 统计。
- 按以下维度查看：
  - 服务商
  - 模型
  - 用途分类
  - 具体功能
  - 时间范围
  - 工作空间
  - 来源类型（聊天、翻译、总结、工作流等）
- 至少要能区分以下用途：
  - 聊天
  - 翻译
  - 总结
  - 思维导图
  - 记忆提取
  - 记忆召回 / 查询分析
  - 标签 / 自动打标
  - 转写
  - 嵌入
  - 图像生成
  - 工作流 AI 节点
- 支持总览卡片、趋势图、Provider/Model 排行、用途分布、明细列表。
- 从数据模型层面区分“精准可计费数据”和“历史补录 / 估算 / 展示级数据”。

### 2.2 从一开始就要为后续预留的能力

- 文件统计：导入、转码、识别、字幕处理、导出等。
- 翻译统计：任务数、语言对、片段数、耗时、token。
- 总结统计：总结次数、资源类型、生成规模、token。
- 思维导图/标签/记忆等 AI 派生任务统计。
- 工作流统计：节点执行次数、失败率、平均耗时、资源消耗。
- 成本统计：后续按模型定价估算费用。
- 额度统计：为未来按用户、工作空间、套餐、功能包做额度扣减提供基础。

## 3. 非目标

本期不做以下事情：

- 不承诺第一版就与外部 Provider 账单 100% 对齐到每一分钱，但新链路必须从一开始保留“原始 provider 计量数据”和“精度等级”，不能只存展示聚合值。
- 不做复杂 BI 系统，不引入重型报表引擎。
- 不要求第一轮开发就覆盖项目内所有 AI 子能力，但看板对外宣称可用之前，至少要接入聊天、翻译、总结、思维导图、记忆提取这几类高频用途。
- 不把所有未来统计塞进一个“万能大表”；页面统一，但数据存储按领域拆分。

## 4. 产品形态建议

## 4.1 页面命名

建议产品名称使用：`统计`

原因：

- 比“用量”“消耗”更宽，适合未来接入文件、翻译、总结等模块。
- 用户认知简单，和现有“首页 / 任务 / 工作流 / 回收站”并列自然。

## 4.2 菜单位置

建议在资源页左侧菜单中新增入口：

- 路由：`/resources/analytics`
- 侧边栏文案：`统计`
- 建议位置：放在 `任务` 与 `工作流` 之间，或紧跟在 `首页` 后面

推荐顺序：

- 首页
- 任务
- 统计
- 工作流
- 设置

这样符合“工作入口 -> 任务观察 -> 统计分析 -> 自动化能力”的使用路径。

## 4.3 第一阶段页面结构

页面建议由 6 个区域组成：

1. 顶部过滤区
   - 时间范围：7 天 / 30 天 / 90 天 / 自定义
   - 工作空间
   - Provider
   - Model
   - 用途分类
   - 具体功能
   - 来源类型
   - 调用状态
   - 计量精度
   - 计费口径
   - 后续可继续透传 workflow metadata 过滤

2. 总览卡片区
   - 总请求次数
   - 总输入 tokens
   - 总输出 tokens
   - 总 tokens
   - 可计费 tokens
   - 活跃 Provider 数
   - 活跃 Model 数

3. 趋势图区
   - 按日 token 趋势
   - 可切换输入 / 输出 / 总量

4. 用途分布区
   - 按用途分类统计 token 占比
   - 按具体功能统计 token 占比

5. 排行区
   - Provider 排行
   - Model 排行
   - 用途分类排行
   - 具体功能排行
   - 执行阶段排行
   - 工作流 AI 节点排行

6. 明细区
   - 最近调用记录
   - 支持按 Provider / Model / 用途 / 来源 / 时间查看
   - 需要能看到 request/trace/providerRequest、workflow 上下文、计费口径与 provider usage 提示

## 4.4 第二阶段后的页面扩展方式

看板页面从一开始就按“模块化卡片区”设计，后续可增加：

- 翻译统计卡
- 总结统计卡
- 文件处理统计卡
- 工作流执行统计卡
- 错误率与失败分布卡
- 资源类型统计卡
- 费用估算卡

## 5. 设计原则

### 5.1 页面统一，存储分域

前端看板是一个统一入口，但底层数据不应该全部混进一张“万能统计表”。

建议策略：

- `统计中心` 是统一产品入口
- `AI token 用量`、`翻译任务统计`、`文件处理统计` 等分别维护自己的事实表
- 查询层在 `analytics-service` 聚合这些表，最终为页面输出统一结构

这样扩展性最好，也最符合项目后续增长方向。

### 5.2 事件为源，聚合为辅

第一阶段以“事件明细表”为主，所有看板数据都可以由明细表聚合得到。

好处：

- 查询口径透明
- 便于排查统计异常
- 后续能回放、导出、重新聚合

如果后续数据量增大，再引入按日聚合表或缓存层。

### 5.3 统计来源必须统一收口

不能让聊天、翻译、总结各自用各自的统计方式。

必须建立统一采集机制，而且要拆成三层：

- AI/业务层统一发标准事件，例如：
  - `emitAiUsageObservedEvent(...)`
- analytics 统计层按需挂载 durable writer，例如：
  - `registerAiUsageObservedEventWriter(...)`
  - writer 内部先写入 `ai_usage_event_outbox`
- analytics 统计层再异步 drain outbox，例如：
  - `initAiUsageAnalyticsListener()`
  - drain pending outbox rows
  - drain 内部再调用 `recordAiUsageEvent(...)`

约束：

- AI 模块只知道“发布 usage 事件”，不知道 recorder、数据库和看板查询实现。
- analytics 模块是一个可插拔消费者；不接入时 AI 也能独立工作，接入时先落 outbox 再消费。
- `ai_usage_event_outbox` 负责提供跨重启的 pending 队列，避免事件发出后因进程异常而直接丢失。
- `recordAiUsageEvent(...)` 退居 analytics 内部实现细节，不再成为所有 AI 子链路的直接依赖。
- 历史补录、手工 backfill、对账修复等 analytics 内部流程可以继续直接调用 recorder，因为它们本来就属于统计域内部逻辑。

### 5.4 首版先做“可信”，再做“花哨”

第一阶段优先保证：

- 不漏记
- 不重复记
- 查询维度统一
- 历史数据可回放 / 可补录

图表和 UI 装饰可后置优化。

### 5.5 业务用途分类必须是一等公民

token 统计不能只按 Provider / Model 维度聚合，还必须知道“这些 token 是花在哪种功能上”。

建议从第一天起就拆成 3 层：

- `usageCategory`
  - 大类，例如对话、内容处理、记忆、媒体、工作流
- `usageFeature`
  - 具体功能，例如聊天、翻译、总结、思维导图、记忆提取
- `usageStage`
  - 功能内部阶段，例如分析、生成、重试、后处理

后续 UI 可以按大类查看，也可以钻取到具体功能。

### 5.6 精确计量优先于展示效果

如果未来要做付费系统，统计必须尽可能接近“计量系统”，而不是“页面效果”。

因此建议：

- 优先记录 provider 原始返回的 usage
- 保留原始 usage JSON，不要只保留格式化后的总数
- 显式标记计量来源与精度等级
- 历史补录和估算数据不能混进“可计费口径”
- 多阶段任务要按真实 provider 调用拆分记录，而不是只记录最终页面结果

### 5.7 账单口径必须可追溯

看板是产品界面，但底层统计要满足账单需求：

- 能定位到一条消耗记录来自哪个功能
- 能定位到哪个 provider、哪个 model、哪次 request
- 能判断该记录是否可计费
- 能判断它是精准 provider 上报，还是历史补录 / 估算

这四点是未来做个人套餐、团队额度、功能收费的前提。

## 6. 数据架构方案

## 6.1 分类字典与精度等级

在事实表设计之前，先统一分类与精度口径。

### 6.1.1 业务分类字段

建议统一 3 个字段：

- `usageCategory`
  - 大类
- `usageFeature`
  - 具体功能
- `usageStage`
  - 同一功能内部的调用阶段

建议首版预置的 `usageCategory`：

- `conversation`
- `content_processing`
- `memory`
- `media`
- `workflow`
- `system`
- `other`

建议首版预置的 `usageFeature`：

- `chat`
- `conversation_title`
- `translation`
- `summary`
- `mindmap`
- `tagging`
- `memory_extraction`
- `memory_recall`
- `memory_diary`
- `embedding`
- `transcription`
- `image_generation`
- `workflow_ai`
- `other`

说明：

- `usageCategory` 用于大盘分布和模块级分析
- `usageFeature` 用于用户真正关心的“token 用在哪里”
- `usageStage` 用于表达功能内部阶段，而不是重试状态
- retry 不写入 `usageStage`，统一通过 `attemptIndex` 表达
- 建议首版冻结为：
  - `analyze`
  - `retrieve`
  - `generate`
  - `extract`
  - `classify`
  - `merge`
  - `vectorize`
  - `transcribe`
  - `postprocess`
  - `background`

### 6.1.2 计量精度字段

建议统一 3 个字段：

- `meteringSource`
  - `provider_reported`
  - `message_backfilled`
  - `reconstructed`
  - `estimated`
- `meteringAccuracy`
  - `exact`
  - `high`
  - `medium`
  - `low`
- `billingEligible`
  - `0 / 1`

建议口径：

- `provider_reported + exact`
  - 未来可进入计费口径
- `message_backfilled`
  - 可用于历史看板展示，不默认进入计费口径
- `estimated`
  - 仅用于临时展示或兜底，不进入计费口径

### 6.1.3 原始 usage 保留原则

未来如果要支持对账或计费纠纷排查，必须保留 provider 原始 usage。

因此建议：

- 事实表中保留标准化字段
- 同时保留 `rawUsage` JSON
- 如果 provider 支持更细粒度字段，也应保留，例如：
  - `cacheReadTokens`
  - `cacheWriteTokens`
  - `reasoningTokens`
  - `billableInputTokens`
  - `billableOutputTokens`

## 6.2 第一阶段新增事实表：`ai_usage_events`

建议在 `electron/main/db/schema.ts` 中新增 `ai_usage_events` 表，作为 AI 消耗统计的统一事实源。

建议字段：

```ts
ai_usage_events -
  id -
  workspaceId -
  traceId -
  parentEventId -
  requestId -
  providerRequestId -
  eventFingerprint -
  operationKey -
  attemptIndex -
  conversationId -
  resourceId -
  sourceType -
  sourceId -
  sourceLabel -
  usageCategory -
  usageFeature -
  usageStage -
  providerId -
  providerPresetId -
  model -
  agentId -
  status -
  inputTokens -
  outputTokens -
  cacheReadTokens -
  cacheWriteTokens -
  reasoningTokens -
  totalTokens -
  billableInputTokens -
  billableOutputTokens -
  billableTotalTokens -
  estimatedCost -
  meteringSource -
  meteringAccuracy -
  billingEligible -
  startedAt -
  completedAt -
  createdAt -
  metadata -
  rawUsage;
```

说明：

- `sourceType`
  - 枚举建议：`chat` / `translation` / `summary` / `mindmap` / `workflow` / `conversation_title` / `memory` / `other`
- `usageCategory`
  - 用于大类统计，例如 `conversation` / `content_processing` / `memory`
- `usageFeature`
  - 用于具体功能统计，例如 `translation` / `summary` / `mindmap` / `memory_extraction`
- `usageStage`
  - 用于复杂链路内部拆分，例如分析、生成、后处理
- `sourceId`
  - 对应来源实体的唯一标识，例如 conversationId、requestId、workflow runId
- `sourceLabel`
  - 便于在明细表中展示“聊天”“字幕翻译”“总结”
- `providerId` + `model`
  - 第一阶段的核心聚合维度
- `inputTokens` / `outputTokens` / `totalTokens`
  - 第一阶段核心指标
- `billable*`
  - 为未来费用系统保留，允许与展示口径分离
- `providerRequestId`
  - 用于后续与 provider 侧日志或账单对账
- `eventFingerprint`
  - recorder 生成的稳定幂等键，用于无 providerRequestId 时去重
- `operationKey`
  - 同一 `requestId` 内的子操作标识，例如 `chunk:0003`、`topic:travel`、`query_analyzer`
- `attemptIndex`
  - 同一功能的第几次 provider 调用，重试必须单独记账
- `meteringSource` / `meteringAccuracy`
  - 区分精准 provider 上报、历史补录、估算
- `billingEligible`
  - 明确该记录是否进入可计费统计
- `status`
  - `completed` / `failed` / `cancelled`
- `rawUsage`
  - 原始 usage JSON，用于追溯、对账、兼容不同 provider 结构
- `estimatedCost`
  - 可先留空，后续启用
- `metadata`
  - 预留 source 细节、资源类型、语言对、文件数等扩展信息

索引建议：

- `workspaceId + createdAt`
- `providerId + createdAt`
- `model + createdAt`
- `usageCategory + createdAt`
- `usageFeature + createdAt`
- `sourceType + createdAt`
- `conversationId`
- `requestId`
- `providerId + providerRequestId`
- `eventFingerprint`
- `operationKey`
- `traceId`

## 6.3 为什么不用 `chat_messages` 直接统计

`chat_messages.metadata.aiUsage` 适合消息展示与历史回放，但不适合作为唯一统计源，原因如下：

- 只覆盖聊天链路，不天然覆盖翻译、总结、工作流。
- 统计口径依赖消息持久化，不适合记录失败任务、后台任务或无消息产物任务。
- 后续需要按任务类型、资源类型、语言对、工作流等维度查询时，消息表会越来越别扭。
- 消息级 usage 很难表达多阶段任务，也不利于精确计费和对账。

因此建议：

- `chat_messages.metadata.aiUsage` 继续保留，用于消息 UI 与回放。
- `ai_usage_events` 作为计量事实表，用于看板、排行、趋势、明细和未来计费系统。

## 6.4 历史数据兼容与补录

由于聊天链路已经开始把 usage 写入消息 metadata，当前实现已经提供可重复执行的历史补录能力：

- 从 `chat_messages`
- 筛选 role = `assistant`
- 优先读取 `metadata.aiUsage`
- 缺少规范化 usage 时回退读取 `metadata.piRawUsage`
- 按 conversation 生成 `ai_usage_events` 的历史补录记录

注意：

- 该补录仅用于聊天历史
- 翻译、总结等历史数据不做强制回填，后续按各自链路逐步补齐
- 补录前会先按 `metadata.assistantMessageId` / `requestId = messageId` 查重，并对已存在实时聊天事件做近邻匹配去重
- 补录事件必须显式标记：
  - `meteringSource = message_backfilled`
  - `meteringAccuracy = medium` 或 `high`
  - `billingEligible = 0`

## 6.5 后续扩展数据表建议

为了避免一个超大宽表，建议后续按领域扩展：

- `translation_usage_events`
  - 统计语言对、片段数、资源数、token、耗时
- `summary_usage_events`
  - 统计总结任务、资源类型、产出规模、token
- `file_operation_events`
  - 统计导入、识别、转码、导出等文件任务
- `workflow_run_metrics`
  - 统计工作流运行次数、节点数、失败率、耗时、资源消耗

这些表最终都由 `analytics-service` 聚合到看板页面中。

## 7. 查询与服务层设计

建议新增一个独立 analytics 模块，而不是继续挂在某一个具体业务页下。

建议文件结构：

- `electron/main/db/analytics-repositories.ts`
- `electron/main/handlers/analytics/ipc-main.ts`
- `electron/main/handlers/analytics/ipc-renderer.ts`
- `electron/preload/apis/analytics.ts`
- `src/pages/AnalyticsPage/AnalyticsPage.tsx`
- `src/pages/AnalyticsPage/components/*`

建议暴露的查询接口：

- `analytics:getUsageOverview`
  - 返回总调用数、总输入/输出/总 token、可计费 token、活跃 provider/model 数
- `analytics:getUsageTimeline`
  - 返回按日或按周的 token 趋势
- `analytics:getUsageByProvider`
  - 返回 provider 聚合统计
- `analytics:getUsageByModel`
  - 返回 model 聚合统计
- `analytics:getUsageByCategory`
  - 返回用途大类聚合统计
- `analytics:getUsageByFeature`
  - 返回具体功能聚合统计
- `analytics:listUsageEvents`
  - 返回明细记录
- `analytics:backfillChatUsage`
  - 从历史聊天消息补录 usage 事件

统一入参建议：

```ts
{
  workspaceId?: string;
  dateFrom?: string;
  dateTo?: string;
  providerId?: string;
  model?: string;
  usageCategory?: string;
  usageFeature?: string;
  sourceType?: string;
  billingEligible?: boolean;
  meteringAccuracy?: string;
  limit?: number;
  offset?: number;
}
```

## 8. 前端页面架构

## 8.1 路由与菜单接入

建议改动：

- `src/pages/ResourcePage/components/layout/ResourceSidebar.tsx`
  - 新增 `统计` 菜单项
- `src/pages/ResourcePage/ResourcePage.tsx`
  - 新增 `<Route path="analytics" element={<AnalyticsPage workspaceId={wsFilter} />} />`
- `src/App.tsx`
  - 不必先加顶层独立路由，首版先挂在 `resources/*` 体系内即可

## 8.2 页面结构

建议：

- `AnalyticsPage.tsx`
  - 负责页面布局、筛选器、数据请求、模块编排
- `components/UsageOverviewCards.tsx`
- `components/UsageTimelineChart.tsx`
- `components/ProviderUsageTable.tsx`
- `components/ModelUsageTable.tsx`
- `components/UsageCategoryTable.tsx`
- `components/UsageFeatureTable.tsx`
- `components/UsageEventsTable.tsx`

## 8.3 扩展机制

从一开始就把页面按模块拆开，后续新增“翻译统计”“文件统计”时，只需要增加新的 section 组件与数据接口，而不需要重写整个页面。

推荐的 section 注册方式：

```ts
type AnalyticsSectionId =
  | 'usage-overview'
  | 'usage-timeline'
  | 'usage-provider-ranking'
  | 'usage-model-ranking'
  | 'usage-category-ranking'
  | 'usage-feature-ranking'
  | 'usage-events'
  | 'translation-overview'
  | 'summary-overview'
  | 'file-overview';
```

首版先用静态数组也可以，不必过早引入复杂插件化机制。

## 9. 采集链路设计

## 9.1 第一阶段接入范围

第一阶段建议先完成“高精度计量基础设施”，并至少打通以下链路：

- 聊天主链路
  - `packages/ai/chat-service.ts`
  - 消息完成后记录 usage 事件
- 对话标题生成
  - 单独记为 `conversation_title`
- 后台 Pi/Provider 调用
  - 只要最终拿到统一 `ChatResponse.usage`，都走同一个 recorder
- 翻译
  - 归类为 `usageCategory = content_processing`
  - `usageFeature = translation`
- 总结
  - `usageFeature = summary`
- 思维导图
  - `usageFeature = mindmap`
- 记忆提取
  - `usageCategory = memory`
  - `usageFeature = memory_extraction`

说明：

- 如果某条链路首轮拿不到 provider 精准 usage，可以先不进入 `billingEligible`
- 但分类字段必须从一开始就定义并落盘，不能后补

## 9.2 第二阶段接入范围

- 记忆召回 / 查询分析
- 自动打标
- 文件级 AI 动作
- workflow 内部 AI 节点
- 嵌入
- 转写
- 图像生成

## 9.3 统一记录接口

建议新增统一记录函数：

```ts
recordAiUsageEvent({
  workspaceId,
  requestId,
  traceId,
  parentEventId,
  providerRequestId,
  operationKey,
  attemptIndex,
  conversationId,
  resourceId,
  sourceType,
  sourceId,
  sourceLabel,
  usageCategory,
  usageFeature,
  usageStage,
  providerId,
  providerPresetId,
  model,
  agentId,
  status,
  usage,
  rawUsage,
  meteringSource,
  meteringAccuracy,
  billingEligible,
  startedAt,
  completedAt,
  metadata
});
```

要求：

- 真实 AI provider 调用一旦发出，就应该记录事件
- 如果没有 usage，token 字段留空，不得伪造为 `0`
- 去重不能吞掉重试；重试必须作为独立事件记录
- 优先使用 `providerRequestId` 去重
- 如果没有 `providerRequestId`，则使用显式 `traceId + requestId + usageFeature + usageStage + operationKey + attemptIndex + sourceId`
- 记录时由 recorder 自动补全 `totalTokens`
- 如果 provider 返回更细 usage，必须保留到 `rawUsage`
- 如果是历史补录或估算，必须显式降低 `meteringAccuracy` 并关闭 `billingEligible`
- `failed` / `cancelled` 事件如果 provider 返回了精准 usage，允许进入可计费口径
- recorder 负责统一计算：
  - 展示口径 tokens
  - 可计费口径 tokens
  - 精度等级
  - `NULL` 与 `0` 的语义边界

## 10. 推荐开发顺序

## Phase 0：文档冻结

目标：

- 明确产品入口、页面结构、数据模型、分阶段策略

产出：

- 本设计文档
- [AI 使用量分类与计量规范](./AI%20%E4%BD%BF%E7%94%A8%E9%87%8F%E5%88%86%E7%B1%BB%E4%B8%8E%E8%AE%A1%E9%87%8F%E8%A7%84%E8%8C%83.md)
- [AI 统计看板实施清单](./AI%20%E7%BB%9F%E8%AE%A1%E7%9C%8B%E6%9D%BF%E5%AE%9E%E6%96%BD%E6%B8%85%E5%8D%95.md)
- [AI 使用量事件 Schema 与 Recorder 契约草案](./AI%20%E4%BD%BF%E7%94%A8%E9%87%8F%E4%BA%8B%E4%BB%B6%20Schema%20%E4%B8%8E%20Recorder%20%E5%A5%91%E7%BA%A6%E8%8D%89%E6%A1%88.md)

## Phase 1：计量模型、分类字典与 recorder

目标：

- 新增 `ai_usage_events`
- 建立 repository 与 recorder
- 冻结 `usageCategory / usageFeature / usageStage`
- 冻结 `meteringSource / meteringAccuracy / billingEligible` 口径
- 打通聊天链路 usage 精准入库

文件建议：

- `electron/main/db/schema.ts`
- `electron/main/db/analytics-repositories.ts`
- `packages/ai/analytics/usage-recorder.ts` 或 `electron/main/handlers/analytics/usage-recorder.ts`
- `packages/ai/chat-service.ts`

验收标准：

- 新聊天请求完成后，数据库可看到 usage 明细记录
- 同一请求不会重复写两条
- 能按 provider/model/category/feature 查询聚合
- 单条记录能区分是否可计费

## Phase 2：关键用途链路接入

目标：

- 把看板里必须分开的用途先接入 recorder

必须接入：

- chat
- translation
- summary
- mindmap
- memory_extraction

建议同步接入：

- memory_recall
- tagging
- embedding
- transcription
- image_generation
- workflow_ai

验收标准：

- 看板底层数据已经可以按用途分类查看
- `translation / summary / mindmap / memory_extraction` 至少都有真实事件数据
- 多功能混合使用时，token 不会全部落到 `chat` 一个桶里

## Phase 3：统计查询接口

目标：

- 实现 overview / timeline / provider / model / category / feature / events 的 IPC 查询

文件建议：

- `electron/main/handlers/analytics/ipc-main.ts`
- `electron/preload/apis/analytics.ts`
- `packages/ai/types.ts` 或单独 analytics types

验收标准：

- Renderer 能通过 preload 获取聚合数据
- 支持时间范围、workspace、provider、model、category、feature、accuracy 过滤

## Phase 4：独立菜单与统计页面

目标：

- 新增 `统计` 菜单与 `/resources/analytics` 页面
- 首版页面展示总览、趋势、Provider/Model/用途排行、明细

文件建议：

- `src/pages/AnalyticsPage/AnalyticsPage.tsx`
- `src/pages/AnalyticsPage/components/*`
- `src/pages/ResourcePage/components/layout/ResourceSidebar.tsx`
- `src/pages/ResourcePage/ResourcePage.tsx`

验收标准：

- 用户能从侧边栏进入统计页
- 可看到 provider/model/category/feature 统计与趋势图
- 刷新后数据仍正确展示

## Phase 5：历史聊天数据补录

目标：

- 从 `chat_messages.metadata.aiUsage` 回填旧聊天记录

实现建议：

- 通过 analytics IPC / preload 显式触发，不做启动时自动全量补录
- 支持幂等，并返回扫描 / 写入 / 去重 / 跳过 / 失败统计
- 对实时聊天事件优先使用 `assistantMessageId` 作为后续补录锚点

验收标准：

- 已存在历史聊天会话能在统计页中显示
- 重复执行不会重复入库
- 回填数据不会混入“精准可计费”口径

## Phase 6：扩展看板模块

目标：

- 增加文件统计、翻译统计、总结统计、工作流统计卡片

## 11. 首版验收标准

当以下条件全部满足时，第一阶段可视为完成：

- 资源页侧边栏新增 `统计` 菜单
- 存在 `统计` 独立页面
- 页面能按时间范围展示：
  - 总输入 tokens
  - 总输出 tokens
  - 总 tokens
  - 可计费 tokens
  - Provider 排行
  - Model 排行
  - 用途分类排行
  - 具体功能排行
  - 趋势图
  - 最近调用明细
- 聊天、翻译、总结、思维导图、记忆提取链路 usage 可稳定写入事实表
- 同一请求不会重复统计
- 支持最基本的 workspace 过滤
- 支持按用途分类过滤
- 支持区分精准计量与历史补录数据

## 12. 风险与注意事项

### 12.1 重复统计风险

聊天链路、标题生成、工具调用回流、后台任务、多阶段内容处理都可能造成重复记账。

解决方案：

- 使用 `providerRequestId` 或显式 event fingerprint 去重
- `attemptIndex` 单独记录，重试不能被误合并
- 标题生成默认不进入主统计，或明确归类

### 12.2 Provider usage 口径不一致

不同 Provider 返回的 usage 结构可能不同，部分只返回输入/输出，部分没有 cost。

解决方案：

- 统一收敛到 `TokenUsage`
- `totalTokens` 缺失时由 recorder 自动补
- `rawUsage` 原样保留
- `meteringAccuracy` 明确标记精度等级
- `billingEligible` 与展示口径分离

### 12.3 用途分类错记风险

如果链路里没有统一分类字段，最终所有 token 都会落入 `chat` 或 `other`，看板就失去意义。

解决方案：

- recorder 入参强制要求 `usageCategory` 与 `usageFeature`
- 未传分类的链路不允许直接接入正式统计
- 首版对关键功能建立白名单分类表

### 12.4 历史数据不完整

旧数据未必都有 usage，也未必都有 requestId。

解决方案：

- 明确“历史补录只保证尽量补齐，不保证 100% 完整”
- 新链路从 recorder 上线时开始保证完整性
- 历史补录默认不进入计费口径

### 12.5 不要过早做通用大而全框架

虽然最终是“统计中心”，但第一阶段不建议抽象出过重的 widget/plugin 系统。

建议：

- 先做固定 section
- 等翻译、总结、文件统计都至少接入一轮后，再决定是否抽成可注册式统计面板

## 13. 开发建议结论

建议按以下顺序开始：

1. 先冻结分类字典与精度口径
2. 先新增 `ai_usage_events` 与 recorder
3. 先把聊天、翻译、总结、思维导图、记忆提取 usage 统一接入事实表
4. 再做 `/resources/analytics` 页面和侧边栏入口
5. 再做历史补录
6. 最后逐步接文件处理、工作流、转写、嵌入、图像生成统计

这个顺序能保证：

- 第一阶段就能交付可见价值
- 后续扩展不会推翻首版
- 产品入口与技术基础一次到位
- 后续做额度 / 付费系统时不需要重做底层统计模型

## 14. 推荐下一步

文档确认后，如确认开始开发，再进入 Phase 1：

- 先确认 [AI 使用量分类与计量规范](./AI%20%E4%BD%BF%E7%94%A8%E9%87%8F%E5%88%86%E7%B1%BB%E4%B8%8E%E8%AE%A1%E9%87%8F%E8%A7%84%E8%8C%83.md)
- 冻结分类字典
- 冻结精度等级与计费口径
- 建表
- 建 recorder
- 打通聊天 usage 精准入库

完成 Phase 1 和关键用途链路接入后，再继续做查询接口和统计页面，会最稳。
