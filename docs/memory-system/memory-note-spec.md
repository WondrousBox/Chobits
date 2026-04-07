# Memory Note 规范 v1

> 本文档定义 Chobits 记忆系统中 Memory Note 的文件布局、Frontmatter 规范、正文结构和命名约定。
> 所有记忆文件以 Markdown 为事实源，数据库只存结构索引，不承担最终真相。

## 当前实现状态（2026-04-06）

- `memory-note-writer.ts` 与 `memory-note-parser.ts` 已实现，提取流程生成 daily note 并解析 section 行号。
- 自动生成 `memory/daily/YYYY/MM/YYYY-MM-DD-topic-slug.md`。
- 同日同 slug 的记忆复用并增量合并已有 note。
- 正文结构采用精简格式：`Key Points`（必须）+ `Open Items`（可选）。
- `MemoryExtractionOutput` 为单个主题的结构；多主题拆分发生在上游 `TopicCluster[]` 阶段。
- LLM 提取结果只包含 `keyPoints` + `openItems` 两个 section，不生成 `aliases` 或 `relatedTopics`。
- **内容生成服务已实现**（`packages/ai/services/memory-content-gen.ts`）：
  - `YYYY-MM-DD.index.md` — 当天索引，每日维护 tick 自动生成昨日索引，也可通过 `memory:generateDailyIndex` 手动触发。
  - `topics/topic-slug.md` — 主题档案，通过 `memory:generateTopicArchives` 批量生成。
  - `MEMORY.md` — 全局记忆索引，通过 `memory:generateMemoryIndex` 生成。

---

## 1. 目录布局

```
<workspace>/
└── memory/
    ├── daily/                          # 按天分区的记忆 note
    │   └── YYYY/
    │       └── MM/
    │           ├── YYYY-MM-DD-topic-slug.md        # 主题 note（核心文件）
    │           ├── YYYY-MM-DD-topic-slug-2.md      # 规范预留；当前提取流程默认复用/合并同日同 slug note
    │           └── YYYY-MM-DD.index.md             # 当天索引（每日维护 tick 自动生成，也可手动触发）
    ├── topics/                         # 主题档案（通过 memory:generateTopicArchives 生成）
    │   └── topic-slug.md              # 长期稳定的主题汇总
    └── MEMORY.md                       # 全局记忆索引（通过 memory:generateMemoryIndex 生成）
```

### 命名规则

| 组成部分   | 规则                                                                   | 示例                                     |
| ---------- | ---------------------------------------------------------------------- | ---------------------------------------- |
| 日期       | `YYYY-MM-DD`                                                           | `2026-03-26`                             |
| topic-slug | 小写英文或拼音，连字符分隔，不超过 40 字符                             | `ai-agent-memory-system`                 |
| 序号后缀   | 规范预留；当前实现默认复用/合并同天同 slug note，不自动追加 `-2`, `-3` | `2026-03-26-ai-agent-memory-system-2.md` |
| 索引文件   | `YYYY-MM-DD.index.md`                                                  | `2026-03-26.index.md`                    |

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

# ━━ 主题与分类 ━━
topics: # 主题标签列表（规范化名称）
  - '记忆系统设计'

# ━━ 关键词与实体 ━━
keywords: # 关键词列表（用于 FTS 命中），3-6 个
  - '记忆检索'
  - '主题图谱'
  - 'FTS5'
  - '渐进式召回'
entities: # 命名实体（人名、产品名、技术名）
  - name: 'OpenClaw'
    type: 'product'
  - name: 'sqlite-vec'
    type: 'technology'

# ━━ 摘要 ━━
summary: >
  确定 Chobits 记忆系统采用 Markdown 为事实源、FTS5 关键词检索为主、向量作可选增强层。

# ━━ 溯源 ━━
sourceConversationIds: # 来源对话 ID 列表
  - 'conv-aaa-bbb'
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
| `topics`                | string[] | **是** | 主题标签列表，至少 1 个。采用规范化名称，用于 topic graph 关联                |
| `keywords`              | string[] | **是** | 关键词列表，3-6 个。用于 FTS5/BM25 命中。应包含中英文                         |
| `entities`              | Entity[] | 否     | 命名实体列表（人名、产品名、技术名等），每个实体包含 `name` 和 `type`         |
| `summary`               | string   | **是** | 1-2 句话的摘要，用于 note 级召回时快速展示                                    |
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

正文采用精简的结构，目的是建立搜索索引而非完整转录对话。
完整对话内容可通过 `sourceConversationIds` 回溯原始对话。

```markdown
## Key Points

- 要点 1
- 要点 2（含关键事实、决策、用户偏好等）

## Open Items

- 待确认/待完成的事项 1（仅在有明确待办时出现）
```

### 3.1 段落规则

| 规则     | 说明                                                     |
| -------- | -------------------------------------------------------- |
| 标题层级 | 一级段落用 `##`，段落内子标题用 `###`                    |
| 段落顺序 | Key Points → Open Items                                  |
| 可选段落 | Open Items 在无待办事项时省略                            |
| 内容风格 | 每条要点一行，使用 `- ` 列表格式，精炼概括，不做详细展开 |
| 段落长度 | Key Points 建议不超过 15 条要点                          |

### 3.2 Section 索引模型

每个 `##` 段落会被索引为一个 section record（存数据库），包含：

| 字段           | 说明                                    |
| -------------- | --------------------------------------- |
| `noteId`       | 所属 Memory Note 的 id                  |
| `heading`      | 标题名，如 `Key Points` 或 `Open Items` |
| `headingLevel` | 标题层级（2 = `##`, 3 = `###`）         |
| `summary`      | 段落摘要（从正文提取）                  |
| `keywords`     | 段落级关键词（从正文提取）              |
| `lineStart`    | 起始行号（1-based）                     |
| `lineEnd`      | 结束行号（1-based）                     |
| `charCount`    | 段落字符数                              |

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

export interface MemoryNoteFrontmatter {
  // 身份
  id: string;
  version: number;

  // 归属
  workspaceId: string;
  date: string; // YYYY-MM-DD

  // 主题与分类
  topics: string[]; // 至少 1 个

  // 关键词与实体
  keywords: string[]; // 3-6 个
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
  heading: string; // 标题名，如 "Key Points"
  headingLevel: number; // 2 | 3
  summary: string; // 段落摘要
  keywords: string[]; // 段落级关键词
  lineStart: number; // 起始行号 (1-based)
  lineEnd: number; // 结束行号 (1-based)
  charCount: number;
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

当记忆提取 pipeline 从对话中生成 Memory Note 时，LLM 针对单个主题输出以下
结构化 JSON（然后由系统转化为 YAML frontmatter + Markdown 正文）：

```typescript
export interface MemoryExtractionOutput {
  topicLabel: string;
  topicSlug: string;
  summary: string;
  importance: number;
  stability: number;
  keywords: string[];
  entities?: MemoryNoteEntity[];
  sections: {
    keyPoints: string;
    openItems?: string;
  };
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
topics:
  - '记忆系统设计'
keywords:
  - '记忆系统'
  - '记忆检索'
  - 'FTS5'
  - '渐进式召回'
entities:
  - name: 'OpenClaw'
    type: 'product'
  - name: 'sqlite-vec'
    type: 'technology'
  - name: 'Chobits'
    type: 'product'
summary: >
  确定 Chobits 记忆系统采用 Markdown 为事实源、FTS5 关键词检索为主、向量作可选增强层。
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

## Key Points

- Markdown 文件为事实源，数据库只存索引
- 检索引擎采用 SQLite FTS5/BM25 + 元数据过滤 + 图谱扩展
- 向量保留为可选增强层，第一阶段不启用
- 按天分区、按主题拆 note，不是一天一个大文件
- 四级渐进式召回：结构 → note → section → targeted read
- 不依赖向量服务，多语言 embedding 质量不可控，改用结构化关键词 + 图谱弥补
- 参考了 OpenClaw 的记忆系统设计

## Open Items

- 检索流水线评分权重需要实验调优
- compaction flush 机制放在第二阶段
- 图谱可视化 UI 放在后续阶段
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
