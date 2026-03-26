# Memory Note 规范 v1

> 本文档定义 Chobits 记忆系统中 Memory Note 的文件布局、Frontmatter 规范、正文结构和命名约定。
> 所有记忆文件以 Markdown 为事实源，数据库只存结构索引，不承担最终真相。

---

## 1. 目录布局

```
<workspace>/
└── memory/
    ├── daily/                          # 按天分区的记忆 note
    │   └── YYYY/
    │       └── MM/
    │           ├── YYYY-MM-DD-topic-slug.md        # 主题 note（核心文件）
    │           ├── YYYY-MM-DD-topic-slug-2.md      # 同天同主题多轮时的序号后缀
    │           └── YYYY-MM-DD.index.md             # 当天索引（可选，仅供人工浏览）
    ├── topics/                         # 主题档案（第二阶段）
    │   └── topic-slug.md              # 长期稳定的主题汇总
    └── MEMORY.md                       # 长期人格记忆汇总（第二阶段）
```

### 命名规则

| 组成部分   | 规则                                       | 示例                                     |
| ---------- | ------------------------------------------ | ---------------------------------------- |
| 日期       | `YYYY-MM-DD`                               | `2026-03-26`                             |
| topic-slug | 小写英文或拼音，连字符分隔，不超过 40 字符 | `ai-agent-memory-system`                 |
| 序号后缀   | 同天同 slug 时追加 `-2`, `-3`              | `2026-03-26-ai-agent-memory-system-2.md` |
| 索引文件   | `YYYY-MM-DD.index.md`                      | `2026-03-26.index.md`                    |

> **slug 生成策略**：由 LLM 在记忆提取时根据主题名生成英文 slug。不要求与 topic label 一一对应，
> 只要求在同天内不重复且可读。slug 不作为主键，主键是 frontmatter 中的 `id`。

---

## 2. Frontmatter 规范

Memory Note 使用 YAML frontmatter。所有字段均有明确类型和约束。

### 2.1 完整字段定义

```yaml
---
# ━━ 身份 ━━
id: 'mem_2026-03-26_ai-agent-memory-system_a1b2c3' # 全局唯一 ID
version: 1 # 该 note 的修订版本号

# ━━ 归属 ━━
workspaceId: 'ws-xxx-xxx' # 所属工作空间 ID
date: '2026-03-26' # 记忆所属日期（ISO 8601 日期）
timeRange: # 原始对话的时间跨度
  start: 1711411200000 # 毫秒时间戳
  end: 1711440000000

# ━━ 主题与分类 ━━
topics: # 主题标签列表（规范化名称）
  - 'AI Agent'
  - '记忆系统'
parentTopicId: 'topic_ai-agent' # 父主题 ID（可选）
relatedTopicIds: # 关联主题 ID 列表
  - 'topic_memory-retrieval'
  - 'topic_knowledge-graph'

# ━━ 关键词与实体 ━━
keywords: # 关键词列表（用于 FTS 命中）
  - '记忆检索'
  - '主题图谱'
  - 'FTS5'
  - '渐进式召回'
aliases: # 同义词/别名（扩展召回范围）
  - 'memory retrieval'
  - '长期记忆'
  - '知识图谱'
entities: # 命名实体（人名、产品名、技术名）
  - name: 'OpenClaw'
    type: 'product'
  - name: 'sqlite-vec'
    type: 'technology'
  - name: 'Chobits'
    type: 'product'

# ━━ 摘要 ━━
summary: >
  讨论了 Chobits 记忆系统的整体架构设计，
  确定采用 Markdown 为事实源、结构化关键词检索为主、向量保留为可选增强层。
  重点设计了主题图谱的链式导航和渐进式召回机制。

# ━━ 溯源 ━━
sourceConversationIds: # 来源对话 ID 列表
  - 'conv-aaa-bbb'
  - 'conv-ccc-ddd'
sourceMessageRange: # 来源消息序号范围（可选）
  - conversationId: 'conv-aaa-bbb'
    seqStart: 1
    seqEnd: 42

# ━━ 权重与稳定度 ━━
importance: 0.85 # 重要度 0.0~1.0
stability: 0.6 # 稳定度 0.0~1.0（越高越不容易被遗忘）

# ━━ 生命周期 ━━
createdAt: 1711440000000 # 创建时间（毫秒）
updatedAt: 1711440000000 # 最后更新时间（毫秒）
---
```

### 2.2 字段说明

| 字段                    | 类型     | 必填   | 说明                                                                          |
| ----------------------- | -------- | ------ | ----------------------------------------------------------------------------- |
| `id`                    | string   | **是** | 全局唯一标识，格式 `mem_{date}_{slug}_{short-hash}`，由系统生成，不可人工修改 |
| `version`               | number   | **是** | 修订版本号，从 1 开始，每次更新递增                                           |
| `workspaceId`           | string   | **是** | 所属工作空间 ID                                                               |
| `date`                  | string   | **是** | 记忆所属日期，ISO 8601 格式 `YYYY-MM-DD`                                      |
| `timeRange`             | object   | 否     | 原始对话的起止时间戳（毫秒）                                                  |
| `topics`                | string[] | **是** | 主题标签列表，至少 1 个。采用规范化名称，用于 topic graph 关联                |
| `parentTopicId`         | string   | 否     | 父主题 ID，用于层级导航                                                       |
| `relatedTopicIds`       | string[] | 否     | 关联主题 ID 列表                                                              |
| `keywords`              | string[] | **是** | 关键词列表，至少 3 个。用于 FTS5/BM25 命中。应包含中英文、缩写                |
| `aliases`               | string[] | 否     | 关键词的同义词/别名，扩展无向量模式下的召回范围                               |
| `entities`              | Entity[] | 否     | 命名实体列表（人名、产品名、技术名等），每个实体包含 `name` 和 `type`         |
| `summary`               | string   | **是** | 2~4 句话的摘要，用于 note 级召回时快速展示                                    |
| `sourceConversationIds` | string[] | **是** | 来源对话 ID，用于溯源                                                         |
| `sourceMessageRange`    | object[] | 否     | 精确的消息序号范围，用于回溯原始对话                                          |
| `importance`            | number   | **是** | 重要度 0.0~1.0。由 LLM 评估或规则推断                                         |
| `stability`             | number   | **是** | 稳定度 0.0~1.0。高 = 长期有效（偏好、决策）；低 = 时效性强（计划、待办）      |
| `createdAt`             | number   | **是** | 创建时间（毫秒时间戳）                                                        |
| `updatedAt`             | number   | **是** | 最后更新时间（毫秒时间戳）                                                    |

### 2.3 Entity 类型枚举

| type           | 说明           | 示例                             |
| -------------- | -------------- | -------------------------------- |
| `person`       | 人名           | 张三、OpenAI CEO                 |
| `product`      | 产品/项目名    | Chobits、OpenClaw、VS Code       |
| `technology`   | 技术/框架/协议 | sqlite-vec、FTS5、Electron、gRPC |
| `organization` | 组织/公司      | OpenAI、Anthropic                |
| `concept`      | 抽象概念       | 渐进式召回、知识图谱             |
| `location`     | 地点           | —                                |
| `event`        | 事件           | —                                |
| `other`        | 其他           | —                                |

---

## 3. 正文结构

正文采用固定的一级标题结构。每个标题段落都会被索引为独立的 **section**，
支持渐进式召回时按标题路径定点读取。

```markdown
## Overview

> 该段落的 2~3 句话摘要（用于 section 级快速筛选）

正文内容...

## Key Facts

> 该段落的 2~3 句话摘要

- **事实 1**：描述
- **事实 2**：描述
- ...

## Decisions

> 该段落的 2~3 句话摘要

- **决策 1**：描述 — 原因/依据
- **决策 2**：描述 — 原因/依据

## Open Loops

> 该段落的 2~3 句话摘要

- [ ] 待确认/待完成的事项 1
- [ ] 待确认/待完成的事项 2

## Evidence

> 该段落的 2~3 句话摘要

关键对话片段、引用、数据等支撑材料。
可包含代码块、引用块、列表等。

## Related Topics

> 该段落的 2~3 句话摘要

- [[AI Agent]] — 关系说明
- [[记忆检索]] — 关系说明
```

### 3.1 段落规则

| 规则           | 说明                                                                                  |
| -------------- | ------------------------------------------------------------------------------------- |
| 标题层级       | 一级段落用 `##`，段落内子标题用 `###`                                                 |
| 段落摘要       | 每个 `##` 段落开头必须有 `>` blockquote 摘要（2~3 句），用于 section 级快速筛选       |
| 段落顺序       | 推荐按 Overview → Key Facts → Decisions → Open Loops → Evidence → Related Topics 排列 |
| 可选段落       | 除 Overview 必须存在外，其余段落在无内容时可省略                                      |
| Related Topics | 使用 `[[topic name]]` 双括号语法，方便未来解析为图谱链接                              |
| 段落长度       | 单个段落正文建议不超过 800 字（不含代码块），超出时拆为子标题                         |

### 3.2 Section 索引模型

每个 `##` 段落会被索引为一个 section record（存数据库），包含：

| 字段           | 说明                                              |
| -------------- | ------------------------------------------------- |
| `noteId`       | 所属 Memory Note 的 id                            |
| `heading`      | 标题路径，如 `Overview` 或 `Key Facts > 技术选型` |
| `headingLevel` | 标题层级（2 = `##`, 3 = `###`）                   |
| `summary`      | 段落摘要（从 blockquote 提取）                    |
| `keywords`     | 段落级关键词（从正文提取）                        |
| `lineStart`    | 起始行号（1-based）                               |
| `lineEnd`      | 结束行号（1-based）                               |
| `charCount`    | 段落字符数                                        |

---

## 4. 当天索引文件（可选）

文件名：`YYYY-MM-DD.index.md`

仅用于人工浏览当天所有记忆 note 的概览，**不作为检索主入口**。

```markdown
---
date: '2026-03-26'
workspaceId: 'ws-xxx-xxx'
noteCount: 3
---

# 2026-03-26 记忆索引

## AI Agent 记忆系统设计

- **文件**: 2026-03-26-ai-agent-memory-system.md
- **主题**: AI Agent, 记忆系统
- **摘要**: 讨论了记忆系统的整体架构设计...
- **重要度**: 0.85

## TypeScript 性能优化

- **文件**: 2026-03-26-typescript-perf.md
- **主题**: TypeScript, 性能优化
- **摘要**: 分析了 Electron 主进程的启动性能瓶颈...
- **重要度**: 0.5

## 日常杂谈

- **文件**: 2026-03-26-casual-chat.md
- **主题**: 生活, 杂谈
- **摘要**: 闲聊了周末计划和美食推荐
- **重要度**: 0.2
```

---

## 5. TypeScript 接口定义

以下是 Frontmatter 和 Section 的 TypeScript 类型，供代码层使用。

```typescript
// ━━ Memory Note Frontmatter ━━

export interface MemoryNoteEntity {
  name: string;
  type: 'person' | 'product' | 'technology' | 'organization' | 'concept' | 'location' | 'event' | 'other';
}

export interface MemoryNoteMessageRange {
  conversationId: string;
  seqStart: number;
  seqEnd: number;
}

export interface MemoryNoteTimeRange {
  start: number; // 毫秒时间戳
  end: number;
}

export interface MemoryNoteFrontmatter {
  // 身份
  id: string;
  version: number;

  // 归属
  workspaceId: string;
  date: string; // YYYY-MM-DD
  timeRange?: MemoryNoteTimeRange;

  // 主题与分类
  topics: string[]; // 至少 1 个
  parentTopicId?: string;
  relatedTopicIds?: string[];

  // 关键词与实体
  keywords: string[]; // 至少 3 个
  aliases?: string[];
  entities?: MemoryNoteEntity[];

  // 摘要
  summary: string;

  // 溯源
  sourceConversationIds: string[];
  sourceMessageRange?: MemoryNoteMessageRange[];

  // 权重与稳定度
  importance: number; // 0.0 ~ 1.0
  stability: number; // 0.0 ~ 1.0

  // 生命周期
  createdAt: number; // 毫秒时间戳
  updatedAt: number;
}

// ━━ Section Index ━━

export interface MemoryNoteSectionIndex {
  noteId: string;
  heading: string; // 标题路径，如 "Key Facts > 技术选型"
  headingLevel: number; // 2 | 3
  summary: string; // 段落摘要
  keywords: string[]; // 段落级关键词
  lineStart: number; // 起始行号 (1-based)
  lineEnd: number; // 结束行号 (1-based)
  charCount: number;
}

// ━━ 当天索引 ━━

export interface MemoryDailyIndex {
  date: string;
  workspaceId: string;
  noteCount: number;
  notes: Array<{
    fileName: string;
    topics: string[];
    summary: string;
    importance: number;
  }>;
}
```

---

## 6. ID 生成规则

```
mem_{date}_{slug}_{short-hash}
```

| 组成部分   | 规则               | 示例                     |
| ---------- | ------------------ | ------------------------ |
| 前缀       | 固定 `mem_`        | `mem_`                   |
| date       | `YYYY-MM-DD`       | `2026-03-26`             |
| slug       | 与文件名 slug 一致 | `ai-agent-memory-system` |
| short-hash | 6 位随机十六进制   | `a1b2c3`                 |

完整示例：`mem_2026-03-26_ai-agent-memory-system_a1b2c3`

> ID 由系统生成后写入 frontmatter，后续不可修改。
> 文件重命名不影响 ID，但会触发索引中的路径更新。

---

## 7. 记忆提取时的 LLM 输出要求

当记忆提取 pipeline 从对话中生成 Memory Note 时，LLM 需要输出以下
结构化 JSON（然后由系统转化为 YAML frontmatter + Markdown 正文）：

```typescript
export interface MemoryExtractionOutput {
  // 一个对话可能拆分为多个主题 note
  notes: Array<{
    // 主题信息
    topicSlug: string; // 英文 slug
    topics: string[]; // 规范化主题名
    parentTopicId?: string;
    relatedTopics?: string[]; // 关联主题名（非 ID，由系统解析为 ID）

    // 关键词与实体
    keywords: string[];
    aliases?: string[];
    entities?: MemoryNoteEntity[];

    // 摘要
    summary: string;

    // 权重
    importance: number;
    stability: number;

    // 正文段落
    overview: string;
    keyFacts?: string;
    decisions?: string;
    openLoops?: string;
    evidence?: string;
    relatedTopicsSection?: string;

    // 消息范围（用于溯源）
    seqStart: number;
    seqEnd: number;
  }>;
}
```

---

## 8. 示例 Memory Note

```markdown
---
id: 'mem_2026-03-26_ai-agent-memory-system_a1b2c3'
version: 1
workspaceId: 'ws-main-001'
date: '2026-03-26'
timeRange:
  start: 1711411200000
  end: 1711440000000
topics:
  - 'AI Agent'
  - '记忆系统'
parentTopicId: 'topic_ai-agent'
relatedTopicIds:
  - 'topic_memory-retrieval'
  - 'topic_knowledge-graph'
keywords:
  - '记忆系统'
  - '记忆检索'
  - '主题图谱'
  - 'FTS5'
  - '渐进式召回'
  - 'Markdown 事实源'
  - 'OpenClaw'
aliases:
  - 'memory system'
  - '长期记忆'
  - 'knowledge graph'
entities:
  - name: 'OpenClaw'
    type: 'product'
  - name: 'sqlite-vec'
    type: 'technology'
  - name: 'Chobits'
    type: 'product'
  - name: 'FTS5'
    type: 'technology'
summary: >
  讨论了 Chobits 记忆系统的整体架构设计。
  确定采用 Markdown 为事实源、结构化关键词检索为主、向量保留为可选增强层。
  重点设计了主题图谱的链式导航和渐进式召回机制。
sourceConversationIds:
  - 'conv-aaa-bbb'
sourceMessageRange:
  - conversationId: 'conv-aaa-bbb'
    seqStart: 1
    seqEnd: 42
importance: 0.85
stability: 0.6
createdAt: 1711440000000
updatedAt: 1711440000000
---

## Overview

> 设计了 Chobits 记忆系统的三层架构：Markdown 文件层、SQLite 结构索引层、渐进式召回层。
> 确定第一阶段不依赖向量服务，以关键词检索和图谱导航为主。

Chobits 需要一套跨对话的长期记忆系统，让 AI 能够回忆起用户过去聊过的内容。
参考了 OpenClaw 的记忆设计，但根据桌面端产品的特点做了定制：

- 事实源采用 Markdown，不依赖外部数据库
- 检索依赖结构化索引 + FTS5 + 主题图谱，不以向量为前提
- 召回采用渐进式分层，避免整篇塞入上下文

## Key Facts

> 记录了架构选型中的关键技术事实。

- **事实源**: Markdown 文件，数据库只存索引
- **检索引擎**: SQLite FTS5/BM25 + 元数据过滤 + 图谱扩展
- **向量状态**: 保留为可选增强层，第一阶段不是必需品
- **文件粒度**: 按天分区、按主题拆 note，不是一天一个大文件
- **召回策略**: 四级渐进——结构 → note → section → targeted read

## Decisions

> 记录了本次讨论中做出的关键决策。

- **不依赖向量服务**: 多语言 embedding 质量不可控，用户配置成本太高 — 改用结构化关键词 + 图谱弥补
- **Markdown 为事实源**: 可读、可编辑、可版本控制 — 数据库只是加速索引
- **按主题拆 note**: 一天可能有多个主题 — 单个 daily 文件粒度过粗
- **四级渐进式召回**: 严禁直接注入整篇记忆 — 按 token 预算分层

## Open Loops

> 尚未确定或需要后续跟进的事项。

- [ ] 数据库 schema 具体字段设计待细化
- [ ] 检索流水线的评分权重需要实验调优
- [ ] compaction flush 机制放在第二阶段
- [ ] MEMORY.md 长期汇总层放在第二阶段
- [ ] 图谱可视化 UI 放在后续阶段

## Evidence

> 关键对话片段和参考来源。

用户明确表示：

> "我的计划是减少向量库的依赖，因为这预示着我以后要为多语言的向量生成做考虑，
> 而且我还得让用户配置比较好的向量服务，这个操作成本太大了。"

参考了 OpenClaw 的记忆系统设计：

- 双层记忆文件：`MEMORY.md` + `memory/YYYY-MM-DD.md`
- 混合检索：BM25 + 向量
- 两段式读取：`memory_search` + `memory_get`
- 自动记忆刷新（compaction 前触发）

## Related Topics

> 与本次讨论相关的主题和未来扩展方向。

- [[记忆检索]] — 检索流水线的核心技术方案
- [[知识图谱]] — 主题图谱的节点与边设计
- [[FTS5]] — 全文检索引擎选型
- [[OpenClaw]] — 参考的开源记忆系统
- [[对话管理]] — 原始数据来源
```

---

## 9. 向量扩展预留

当用户未来配置了 embedding 服务时，系统可以为每个 note/section 生成 embedding，
但这不改变 frontmatter 规范。向量相关元数据存数据库索引层，不写入 Markdown 文件。

| 向量字段          | 存储位置                             | 说明              |
| ----------------- | ------------------------------------ | ----------------- |
| `embedding`       | 数据库 `documents.embedding`         | Float32 向量 blob |
| `embedModel`      | 数据库 `documents.embed_model`       | 使用的模型名      |
| `embedProviderId` | 数据库 `documents.embed_provider_id` | 服务商 ID         |
| `embedDim`        | 数据库 `documents.embed_dim`         | 向量维度          |
| `embedAt`         | 数据库 `documents.embed_at`          | 向量生成时间      |

> 原则：Markdown 文件不包含任何向量相关字段。向量是索引层的可选增强，不是事实源的一部分。
