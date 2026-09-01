# AI 使用量分类与计量规范

更新时间：2026-04-14

本文档是 [AI 统计看板设计与开发计划](./AI%20%E7%BB%9F%E8%AE%A1%E7%9C%8B%E6%9D%BF%E8%AE%BE%E8%AE%A1%E4%B8%8E%E5%BC%80%E5%8F%91%E8%AE%A1%E5%88%92.md) 的配套规范，用于冻结 AI 使用量统计的分类字典、事件粒度、计量精度、计费口径与扩展规则。后续所有 AI 链路接入 recorder、建设统计看板、做额度系统或付费系统时，均以本文档为准。

## 1. 文档目标

本文档解决 5 个问题：

- 同一条 AI 调用到底记成几条统计事件。
- token 到底归类到哪个用途、哪个功能、哪个阶段。
- 缺失 usage 时是记 `0`、记 `NULL`，还是不记。
- 哪些记录可以进入未来计费口径，哪些只能用于展示。
- 后续新增功能时，如何在不打碎口径的前提下继续扩展。

适用范围：

- `packages/ai/*`
- `packages/ai/runtime/pi/*`
- `electron/main/handlers/*` 中所有触发 AI provider 调用的链路
- 历史补录、数据回填、统计聚合与导出逻辑

## 2. 强制原则

### 2.1 一次 provider 调用，只记一条事件

`ai_usage_events` 的最小粒度是“单次 provider 出站调用”，不是“一个页面动作”，也不是“一个任务最终结果”。

示例：

- 一次普通聊天回复，通常是 1 条事件。
- 一次字幕翻译任务如果拆成 8 个 chunk，则至少是 8 条事件。
- 如果第 3 个 chunk 重试 2 次，则该 chunk 共产生 3 条事件。
- 一次记忆提取流水线如果包含 `split -> extract x N -> merge x N` 多次 LLM 调用，则每次调用单独记账。

### 2.2 retry 不是 `usageStage`

`usageStage` 表示业务阶段，不表示是否重试。

重试统一通过以下字段表达：

- `attemptIndex`
- `status`
- `parentEventId`
- `operationKey`

因此：

- `usageStage = retry` 不允许进入正式字典。
- 第一次调用 `attemptIndex = 0`
- 第一次重试 `attemptIndex = 1`
- 第二次重试 `attemptIndex = 2`

### 2.3 没有 token，也要尽量记事件

只要 AI provider 调用已经真实发出，就应该落一条事件，哪怕该 provider 没返回 token usage。

原因：

- 否则总请求数、失败率、取消率会失真。
- 图像生成、部分转写、部分 embedding 链路未必返回 token，但未来仍可能涉及计费或配额。
- 后续如果 provider 补充 usage/cost 信息，事件可以被重新对账或补全。

规则：

- 缺失 usage 时，token 字段写 `NULL`，不是 `0`
- 只有 provider 明确返回 0 时，才允许写 `0`
- 没有精确 usage 的事件默认 `billingEligible = 0`

### 2.4 `NULL` 与 `0` 语义必须区分

这是未来做账单和付费系统时非常关键的一条规则。

含义如下：

- `NULL`
  - 未知
  - provider 未返回
  - 当前链路未采到
  - 不能据此推导为 0
- `0`
  - provider 明确返回 0
  - 或经明确定义，该字段对当前事件确实为 0

禁止行为：

- 为了页面好看，把未知 token 填成 0
- 为了省事，把没有 usage 的失败请求直接丢弃

### 2.5 原始 usage 不可覆盖

所有标准化字段都服务于统一查询，但 `rawUsage` 才是后续对账、纠纷排查、费控回算的原始依据。

要求：

- 入库时保留 provider 原始 usage
- 后续如果标准化逻辑升级，优先重算标准化字段，不回写原始 usage
- 不允许只存汇总值而丢失原始结构

### 2.6 `other` 只能临时使用

`usageFeature = other` 和 `usageCategory = other` 只能作为短期兜底。

要求：

- 新功能接入前，应先在本文档注册正式 feature
- 生产链路中的 `other` 占比应可监控
- 同一个功能不能长期停留在 `other`

## 3. 事件粒度与标识规则

## 3.1 事件粒度

| 场景                | 事件数规则                                                       |
| ------------------- | ---------------------------------------------------------------- |
| 聊天单轮回复        | 1 次回复 = 1 条事件                                              |
| 对话标题生成        | 1 次标题生成 = 1 条事件                                          |
| 字幕翻译            | 1 个 chunk 的 1 次调用 = 1 条事件                                |
| 总结                | 1 次总结调用 = 1 条事件                                          |
| 思维导图            | 1 次脑图生成 = 1 条事件                                          |
| 记忆提取            | `split`、每个 topic 的 `extract`、每个 topic 的 `merge` 各自独立 |
| 记忆召回            | 只有真正调用 LLM 的步骤记事件，纯数据库检索不记                  |
| 打标                | 1 段文本的 1 次打标调用 = 1 条事件                               |
| embedding           | 1 次 embedding API 调用 = 1 条事件                               |
| transcribe          | 1 次转写 API 调用 = 1 条事件                                     |
| image generation    | 1 次图片生成 API 调用 = 1 条事件                                 |
| workflow 内 AI 节点 | 节点内每次真实 provider 调用单独记事件                           |

## 3.2 标识字段

建议以下字段作为标准主干：

- `traceId`
  - 同一个业务请求链路的全局追踪 ID
- `requestId`
  - 当前宿主任务的请求 ID，例如翻译任务 ID、总结任务 ID
- `providerRequestId`
  - provider 返回的原始请求 ID
- `operationKey`
  - 同一 `requestId` 下的子操作 ID
- `attemptIndex`
  - 当前子操作的第几次尝试，0 开始
- `parentEventId`
  - 子事件的父事件，用于表达多阶段调用关系

`operationKey` 是本规范新增的关键字段，必须用于解决“同一任务内部多个 provider 调用”无法稳定去重的问题。

建议样式：

- 聊天主回复：`reply`
- 标题生成：`title`
- 翻译 chunk：`chunk:0003`
- 记忆查询分析：`query_analyzer`
- 记忆提取 topic：`topic:travel-plan`
- workflow 节点：`node:summary-1`
- 图片生成：`image:0`

## 3.3 去重规则

推荐优先级如下：

1. `providerRequestId`
2. 显式 `dedupeKey`
3. 组合指纹

若暂不单独落 `dedupeKey` 字段，则组合指纹至少应包含：

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

注意：

- 没有 `operationKey` 的多阶段任务，不能进入正式统计。
- 重试不是重复数据，不能被去重吞掉。

## 3.4 状态规则

状态建议固定为：

- `completed`
- `failed`
- `cancelled`

规则：

- `failed` 事件如果拿到了精确 provider usage，允许 `billingEligible = 1`
- `cancelled` 事件如果 provider 已经实际计费，同样允许 `billingEligible = 1`
- 是否可计费由“精度与 provider 事实”决定，不由状态单独决定

## 4. 统一分类字典

## 4.1 `sourceType`

`sourceType` 表示调用从哪个产品入口或宿主任务发起，偏“来源入口”。

| 值                   | 含义                           |
| -------------------- | ------------------------------ |
| `chat`               | 普通对话回复                   |
| `conversation_title` | 对话标题生成                   |
| `translation`        | 翻译任务                       |
| `summary`            | 总结任务                       |
| `mindmap`            | 思维导图任务                   |
| `memory`             | 记忆提取、记忆召回、记忆日记等 |
| `tagging`            | 自动打标                       |
| `embedding`          | embedding / vectorize          |
| `transcription`      | 音频或视频转写                 |
| `image_generation`   | 图片生成                       |
| `workflow`           | workflow 内 AI 节点            |
| `system`             | 系统级后台任务                 |
| `other`              | 临时兜底                       |

## 4.2 `usageCategory`

`usageCategory` 用于看板总览和模块级分布，偏“业务大类”。

| 值                   | 含义                                     |
| -------------------- | ---------------------------------------- |
| `conversation`       | 对话和对话附属能力                       |
| `content_processing` | 翻译、总结、脑图、打标等内容处理         |
| `memory`             | 记忆提取、召回、日记、记忆相关 embedding |
| `media`              | 转写、图片生成等媒体 AI                  |
| `workflow`           | workflow 内部 AI 节点                    |
| `system`             | 系统后台、基础设施、非用户直达功能       |
| `other`              | 临时兜底                                 |

## 4.3 `usageFeature`

`usageFeature` 是用户真正关心的“token 花在哪个功能上”，属于最重要的统计维度。

| 值                   | 默认分类             | 默认 sourceType      | 说明                                                |
| -------------------- | -------------------- | -------------------- | --------------------------------------------------- |
| `chat`               | `conversation`       | `chat`               | 普通对话回复                                        |
| `conversation_title` | `conversation`       | `conversation_title` | 标题生成                                            |
| `translation`        | `content_processing` | `translation`        | 字幕或文本翻译                                      |
| `summary`            | `content_processing` | `summary`            | 总结任务                                            |
| `mindmap`            | `content_processing` | `mindmap`            | 思维导图                                            |
| `tagging`            | `content_processing` | `tagging`            | 自动打标                                            |
| `memory_extraction`  | `memory`             | `memory`             | 从对话中提取长期记忆                                |
| `memory_recall`      | `memory`             | `memory`             | 记忆查询分析、召回、定向读取                        |
| `memory_diary`       | `memory`             | `memory`             | 记忆日记、记忆沉淀生成                              |
| `embedding`          | `system`             | `embedding`          | 向量化；如果明确属于记忆索引，可将分类写为 `memory` |
| `transcription`      | `media`              | `transcription`      | 音视频转写                                          |
| `image_generation`   | `media`              | `image_generation`   | 图片生成                                            |
| `workflow_ai`        | `workflow`           | `workflow`           | workflow 节点内 AI 能力                             |
| `other`              | `other`              | `other`              | 临时兜底，禁止长期使用                              |

扩展规则：

- 新增 feature 时，必须同时指定默认 `usageCategory` 与默认 `sourceType`
- 如果某个 feature 会在不同业务域复用，`usageFeature` 保持稳定，`usageCategory` 允许按调用场景覆盖
- 不允许把“provider 类型”直接当作 feature，例如 `openai_chat`

## 4.4 `usageStage`

`usageStage` 用于区分同一功能内部的业务阶段，偏“功能阶段”，不是技术状态。

首版冻结如下：

| 值            | 含义                             |
| ------------- | -------------------------------- |
| `analyze`     | 分析、拆解、查询理解             |
| `retrieve`    | 检索、召回、定向读取前的 AI 步骤 |
| `generate`    | 生成主要结果                     |
| `extract`     | 从内容中抽取结构化信息           |
| `classify`    | 打标、分类、归类                 |
| `merge`       | 合并已有结果、冲突判定、整合     |
| `vectorize`   | embedding / 向量化               |
| `transcribe`  | 音频文本转写                     |
| `postprocess` | 对 AI 主结果进行后续 AI 处理     |
| `background`  | 纯后台执行的非用户直达 AI 步骤   |
| `other`       | 临时兜底                         |

## 4.5 Feature 与 Stage 推荐映射

| usageFeature         | 允许的主阶段                                                         |
| -------------------- | -------------------------------------------------------------------- |
| `chat`               | `generate`                                                           |
| `conversation_title` | `generate`                                                           |
| `translation`        | `generate`, `postprocess`                                            |
| `summary`            | `analyze`, `generate`                                                |
| `mindmap`            | `analyze`, `generate`                                                |
| `tagging`            | `classify`                                                           |
| `memory_extraction`  | `analyze`, `extract`, `merge`                                        |
| `memory_recall`      | `analyze`, `retrieve`                                                |
| `memory_diary`       | `generate`, `merge`                                                  |
| `embedding`          | `vectorize`                                                          |
| `transcription`      | `transcribe`                                                         |
| `image_generation`   | `generate`                                                           |
| `workflow_ai`        | `analyze`, `generate`, `classify`, `extract`, `merge`, `postprocess` |

说明：

- 如果同一个 feature 需要多个 stage，必须每次 provider 调用单独落事件。
- `translation` 的 retry 仍然是 `generate` 阶段，只是 `attemptIndex` 递增。

## 5. 计量来源、精度与计费口径

## 5.1 `meteringSource`

| 值                   | 含义                               | 是否可进入计费口径 |
| -------------------- | ---------------------------------- | ------------------ |
| `provider_reported`  | provider 原始返回 usage            | 可以               |
| `message_backfilled` | 从历史消息 metadata 回填           | 不可以             |
| `reconstructed`      | 依据同次请求的稳定数据重建         | 默认不可以         |
| `estimated`          | 基于 tokenizer、字符数或经验值估算 | 不可以             |

## 5.2 `meteringAccuracy`

| 值       | 定义                                                                  |
| -------- | --------------------------------------------------------------------- |
| `exact`  | 单次 provider 调用的 usage 由 provider 直接提供，且与当前事件一一对应 |
| `high`   | 非 provider 直接上报，但可以由稳定、无分摊的同次请求数据精确重建      |
| `medium` | 可以重建到功能级，但无法 100% 保证与单次 provider 调用完全一一对应    |
| `low`    | 仅估算或临时兜底，适合展示，不适合计费                                |

非法组合：

- `estimated + exact`
- `message_backfilled + exact`
- `estimated + billingEligible = 1`

推荐组合：

| meteringSource       | 允许的 accuracy         |
| -------------------- | ----------------------- |
| `provider_reported`  | `exact`, `high`         |
| `message_backfilled` | `high`, `medium`        |
| `reconstructed`      | `high`, `medium`, `low` |
| `estimated`          | `low`                   |

## 5.3 `billingEligible`

`billingEligible` 是未来额度扣减和账单口径的硬开关，按“事件”判断，不按“任务”判断。

只有满足以下条件时，才允许写 `1`：

1. `meteringSource = provider_reported`
2. `meteringAccuracy = exact`
3. `providerId`、`model` 可识别
4. 至少存在可追溯的原始依据：
   - `rawUsage`
   - 或 provider 原始 cost / usage 结构
5. 至少有一项可计费指标已知：
   - `billableInputTokens`
   - `billableOutputTokens`
   - `billableTotalTokens`
   - 或未来标准化 `estimatedCost`

补充规则：

- 历史回填数据永远 `billingEligible = 0`
- 估算数据永远 `billingEligible = 0`
- `failed` / `cancelled` 事件如果 provider 已确认消耗，可 `billingEligible = 1`

## 6. 字段语义与标准化计算

## 6.1 核心字段定义

| 字段                   | 语义                            |
| ---------------------- | ------------------------------- |
| `inputTokens`          | 标准化输入 token                |
| `outputTokens`         | 标准化输出 token                |
| `cacheReadTokens`      | prompt cache 命中读取 token     |
| `cacheWriteTokens`     | prompt cache 写入 token         |
| `reasoningTokens`      | provider 暴露的 reasoning token |
| `totalTokens`          | 统一展示口径总 token            |
| `billableInputTokens`  | 可计费输入 token                |
| `billableOutputTokens` | 可计费输出 token                |
| `billableTotalTokens`  | 可计费总 token                  |
| `rawUsage`             | provider 原始 usage JSON        |
| `metadata`             | 扩展业务信息                    |

## 6.2 计算规则

`totalTokens` 的计算顺序固定如下：

1. provider 有明确 `totalTokens`，且可稳定映射到当前事件时，直接使用
2. 否则，若存在细分 token 字段，则对已知字段求和：
   - `inputTokens`
   - `outputTokens`
   - `cacheReadTokens`
   - `cacheWriteTokens`
   - `reasoningTokens`
3. 否则，若仅有 `inputTokens` 与 `outputTokens`，则两者相加
4. 若以上都不满足，则 `totalTokens = NULL`

`billableTotalTokens` 的计算规则：

- 优先使用 provider 明确给出的可计费总量
- 否则由计费适配器按模型规则计算
- 如果无法确定，必须为 `NULL`，不能用 `totalTokens` 盲目替代

## 6.3 标准化注意事项

- `totalTokens` 是统一展示口径，不一定等于 provider 原始账单口径
- 真正用于计费的是 `billable*` 字段与 `rawUsage`
- 如果 provider 暴露更多细粒度字段，应先保存在 `rawUsage`，再逐步扩展标准列

## 6.4 `metadata` 预留字段建议

建议统一一些高价值扩展字段：

- `resourceId`
- `resourceType`
- `sourceLanguage`
- `targetLanguage`
- `segmentCount`
- `chunkIndex`
- `chunkCount`
- `workflowId`
- `workflowRunId`
- `workflowNodeId`
- `memoryTopicSlug`
- `embeddingPurpose`
- `fileCount`

## 7. 当前代码入口的归类建议

下表用于指导首轮接入，不代表这些文件内部所有步骤都一定调用了 AI，但只要发生真实 provider 调用，就应按下列口径记录。

| 代码入口                                                                         | usageFeature         | usageStage     | 备注                                                                        |
| -------------------------------------------------------------------------------- | -------------------- | -------------- | --------------------------------------------------------------------------- |
| `packages/ai/chat-service.ts`                                                    | `chat`               | `generate`     | 普通对话主链路                                                              |
| `packages/ai/runtime/pi/tasks/title.ts`                                          | `conversation_title` | `generate`     | 标题生成单独记账                                                            |
| `packages/ai/services/translation-service.ts`                                    | `translation`        | `generate`     | 每个 chunk 单独记；重试靠 `attemptIndex`                                    |
| `packages/ai/services/summary-service.ts`                                        | `summary`            | `generate`     | 单次总结调用                                                                |
| `packages/ai/services/mindmap-service.ts`                                        | `mindmap`            | `generate`     | 单次脑图调用                                                                |
| `packages/ai/services/memory-extraction-service.ts` `splitTopics`                | `memory_extraction`  | `analyze`      | 话题拆分                                                                    |
| `packages/ai/services/memory-extraction-service.ts` `extractMemory`              | `memory_extraction`  | `extract`      | 单 topic 提取                                                               |
| `packages/ai/services/memory-extraction-service.ts` `mergeMemory` 及相关冲突判断 | `memory_extraction`  | `merge`        | 合并已有记忆                                                                |
| `packages/ai/services/memory-auto-recall.ts` `extractRecallKeywords`             | `memory_recall`      | `analyze`      | 自动记忆召回的 LLM 关键词提取；后续纯本地 recall search 不记 token          |
| `packages/ai/services/memory-retrieval-service.ts` `createLlmQueryAnalyzer`      | `memory_recall`      | `analyze`      | 仅 LLM 查询分析记事件                                                       |
| `packages/ai/services/tagging-service.ts`                                        | `tagging`            | `classify`     | 按段或按块打标；`autoTagText` 当前按 `segment:${index}` 落账                |
| `packages/ai/runtime/pi/tasks/tag.ts`                                            | `tagging`            | `classify`     | Pi runtime 打标                                                             |
| `packages/ai/runtime/pi/execution-service.ts` `embed`                            | `embedding`          | `vectorize`    | 默认归类为 `embedding`；若明确用于记忆索引，可通过 override 改写到 `memory` |
| `packages/ai/runtime/pi/execution-service.ts` `transcribe`                       | `transcription`      | `transcribe`   | 已接入统一 recorder；token 型 usage 写 token/billable，duration 型只保留 rawUsage/metadata |
| `packages/ai/runtime/pi/image-generation-service.ts`                             | `image_generation`   | `generate`     | 已接入统一 recorder；token 型 usage 写 token/billable，缺失 usage 时 token 保持 `NULL` |
| workflow AI 节点                                                                 | `workflow_ai`        | 按节点语义填写 | 已完成首批接入；`workflowNodeId / workflowRunId / workflowNodeType` 进入 metadata |

## 8. 典型场景示例

## 8.1 聊天单轮

- `sourceType = chat`
- `usageCategory = conversation`
- `usageFeature = chat`
- `usageStage = generate`
- `operationKey = reply`
- `attemptIndex = 0`

## 8.2 字幕翻译 8 个 chunk，第 3 个 chunk 重试 1 次

会产生 9 条事件：

- `chunk:0000` 到 `chunk:0007` 各 1 条
- `chunk:0002` 额外 1 条 retry 事件

所有事件都保持：

- `usageFeature = translation`
- `usageStage = generate`

差异仅在：

- `operationKey`
- `attemptIndex`
- `status`
- `providerRequestId`

## 8.3 记忆提取流水线

假设包含：

- 1 次 `splitTopics`
- 3 个 topic 的 `extractMemory`
- 3 个 topic 的 `mergeMemory`

则至少产生 7 条事件。

推荐写法：

- `operationKey = split`
- `operationKey = topic:travel`
- `operationKey = topic:career`
- `operationKey = topic:family`

## 8.4 历史聊天补录

历史 assistant 消息包含 `metadata.aiUsage` 时：

- `meteringSource = message_backfilled`
- `meteringAccuracy = high` 或 `medium`
- `billingEligible = 0`

该类数据可进入看板展示，但不能进入未来账单口径。

## 9. 扩展与变更流程

新增分类或字段前，必须完成以下动作：

1. 先更新本文档
2. 再更新主设计文档
3. 再开发 recorder / schema / UI

新增 `usageFeature` 时必须回答：

- 它属于哪个 `usageCategory`
- 默认来自哪个 `sourceType`
- 它的主 `usageStage` 是什么
- 它是否会 fan-out 成多个 provider 调用
- 它未来是否可能进入计费口径

如果以上问题回答不清楚，就不应直接接入正式统计。

## 10. 与主设计文档的关系

职责划分如下：

- [AI 统计看板设计与开发计划](./AI%20%E7%BB%9F%E8%AE%A1%E7%9C%8B%E6%9D%BF%E8%AE%BE%E8%AE%A1%E4%B8%8E%E5%BC%80%E5%8F%91%E8%AE%A1%E5%88%92.md)
  - 负责产品目标、页面结构、阶段计划、开发顺序
- [AI 统计看板实施清单](./AI%20%E7%BB%9F%E8%AE%A1%E7%9C%8B%E6%9D%BF%E5%AE%9E%E6%96%BD%E6%B8%85%E5%8D%95.md)
  - 负责具体文件落点、执行步骤、验收清单与验证矩阵
- [AI 使用量事件 Schema 与 Recorder 契约草案](./AI%20%E4%BD%BF%E7%94%A8%E9%87%8F%E4%BA%8B%E4%BB%B6%20Schema%20%E4%B8%8E%20Recorder%20%E5%A5%91%E7%BA%A6%E8%8D%89%E6%A1%88.md)
  - 负责 `ai_usage_events` 的列级 schema、索引、唯一性策略与 recorder 入参契约
- 本文档
  - 负责事件粒度、分类字典、计量精度、计费口径、扩展准入规则

后续如两者冲突，以本文档中的“计量与分类口径”定义为准，并应同步回写主设计文档。
