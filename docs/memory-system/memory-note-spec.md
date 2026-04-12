# Memory Note 规范 v1

> 本文档定义 Chobits 记忆系统中 Memory Note 的文件布局、Frontmatter 规范、正文结构和命名约定。
> 所有记忆文件以 Markdown 为事实源，数据库只存结构索引，不承担最终真相。

## 当前实现状态（2026-04-12）

- `memory-note-writer.ts` 与 `memory-note-parser.ts` 已实现，提取流程生成 daily note 并解析 section 行号。
- 自动生成 `memory/daily/YYYY/MM/YYYY-MM-DD-topic-slug.md`，同日同 slug 的记忆会复用并增量合并已有 note。
- Runtime frontmatter 字段已真实打通：`timeRange`、`parentTopicId`、`relatedTopicIds`、`domain`、`aliases`、`entities[].relations[]` 均可写入 Markdown、再解析回来。
- `domain` 已同时写入 Markdown 与 `memory_notes`，因此 note 级领域信息可以在 Markdown / parser / DB 之间完整 round-trip。
- 合并逻辑会在后续提取未重复描述关系事实时，保留已有的 `entities[].relations[]`，避免实体关系被后写覆盖丢失。
- 正文结构采用精简格式：`Key Points`（必须）+ `Contradictions`（可选，检测到冲突时生成）+ `Open Items`（可选）+ `Recall Cues`（可选）+ `Source Excerpts`（可选，重要度 > 0.8 时自动生成）。
- 高重要度 note 的矛盾检测结果现在会进入结构化 `frontmatter.contradictions[]`，并同步渲染为独立的 `Contradictions` 段，而不是继续污染 `Key Points`。
- `MemoryExtractionOutput` 为单个主题的结构；多主题拆分与领域判断发生在上游 `TopicCluster[]` 阶段。
- LLM 提取结果包含 `keyPoints` / `openItems`，并可额外产出 `recallCues`、`sourceExcerpts`。
- **内容生成服务已实现**（`packages/ai/services/memory-content-gen.ts`）：
  - `YYYY-MM-DD.index.md` — 当天索引，每日维护 tick 自动生成昨日索引，也可通过 `memory:generateDailyIndex` 手动触发。
  - `topics/topic-slug.md` — 主题档案，通过 `memory:generateTopicArchives` 批量生成。
- `MEMORY.md` — 长期记忆摘要，通过 `memory:generateMemoryIndex` 生成，供未来回忆直接使用。顶部包含结构化 always-loaded layer：`## Critical Facts`、`## User Preferences`、`## Active Projects`；并可选输出 `## Lifecycle Suggestions` 段落，为 archive / freeze / refresh / compact 提供只读治理建议。
  - `INDEX.md` — 全局浏览索引，与 `MEMORY.md` 同次刷新生成，保留文件和主题导航。
- `memoryDiaryTool` 当前只写入 `memory/diary/YYYY-MM-DD.md`，不参与 note / FTS / topic graph / auto-recall 闭环，也不在默认 session tools 中启用。

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
    ├── diary/                          # Agent 观察日记（仅日志面，当前不进检索/索引闭环）
    │   └── YYYY-MM-DD.md              # 每日日记（追加模式）
    ├── topics/                         # 主题档案（通过 memory:generateTopicArchives 生成）
    │   └── topic-slug.md              # 长期稳定的主题汇总
    ├── MEMORY.md                       # 长期记忆摘要（含 Critical Facts / User Preferences / Active Projects / Lifecycle Suggestions 段落，通过 memory:generateMemoryIndex 生成）
    └── INDEX.md                        # 全局浏览索引（与 MEMORY.md 一起生成）
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
timeRange: # 可选，对应来源消息时间戳范围
  start: 1711440000000
  end: 1711443600000

# ━━ 主题与分类 ━━
topics: # 主题标签列表（规范化名称）
  - '记忆系统设计'
parentTopicId: 'topic_memory_system' # 可选，父主题
relatedTopicIds: # 可选，相关主题
  - 'topic_memory_retrieval'
  - 'topic_topic_graph'

# ━━ 领域命名空间 ━━
domain: 'project:chobits' # 可选，领域标识（如 person:Alice、project:chobits、general）

# ━━ 关键词与实体 ━━
keywords: # 关键词列表（用于 FTS 命中），3-6 个
  - '记忆检索'
  - '主题图谱'
  - 'FTS5'
  - '渐进式召回'
aliases: # 可选，补充别名 / 常见说法
  - '记忆检索架构'
entities: # 命名实体（人名、产品名、技术名）
  - name: 'OpenClaw'
    type: 'product'
    relations:
      - predicate: 'inspired'
        object: 'Chobits'
        validFrom: '2026-03'
  - name: 'sqlite-vec'
    type: 'technology'

# ━━ 摘要 ━━
summary: >
  确定 Chobits 记忆系统采用 Markdown 为事实源、FTS5 关键词检索为主、向量作可选增强层。
contradictions: # 可选，结构化冲突状态
  - old: '之前决定只用 SQLite'
    new: '现在决定使用 SQLite + FTS'
    type: 'decision_change'
    detectedAt: 1711441800000

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

| 字段                    | 类型     | 必填   | 说明                                                                                         |
| ----------------------- | -------- | ------ | -------------------------------------------------------------------------------------------- |
| `id`                    | string   | **是** | 全局唯一标识，格式 `mem_{date}_{slug}_{short-hash}`，由系统生成，不可人工修改                |
| `version`               | number   | **是** | 修订版本号，从 1 开始，每次更新递增                                                          |
| `workspaceId`           | string   | **是** | 所属工作空间 ID                                                                              |
| `date`                  | string   | **是** | 记忆所属日期，ISO 8601 格式 `YYYY-MM-DD`                                                     |
| `timeRange`             | object   | 否     | 来源消息的毫秒时间戳范围，结构为 `{ start, end }`                                            |
| `topics`                | string[] | **是** | 主题标签列表，至少 1 个。采用规范化名称，用于 topic graph 关联                               |
| `parentTopicId`         | string   | 否     | 父主题 id；用于更稳定地表达主题层级                                                          |
| `relatedTopicIds`       | string[] | 否     | 相关主题 id 列表；用于弱关联与跨主题跳转                                                     |
| `domain`                | string   | 否     | 领域命名空间，如 `person:Alice`、`project:chobits`、`general`。由 LLM 在主题拆分时自动判断。 |
| `keywords`              | string[] | **是** | 关键词列表，3-6 个。用于 FTS5/BM25 命中。应包含中英文                                        |
| `aliases`               | string[] | 否     | note 级别的补充别名 / 常见表述，用于 FTS 和回忆提示                                          |
| `entities`              | Entity[] | 否     | 命名实体列表（人名、产品名、技术名等），每个实体至少包含 `name`、`type`，可选 `relations[]` |
| `summary`               | string   | **是** | 1-2 句话的摘要，用于 note 级召回时快速展示                                                   |
| `sourceConversationIds` | string[] | **是** | 来源对话 ID，用于溯源                                                                        |
| `sourceMessageRange`    | object[] | 否     | 精确的消息序号范围，用于回溯原始对话                                                         |
| `importance`            | number   | **是** | 重要度 0.0~1.0。由 LLM 评估或规则推断                                                        |
| `stability`             | number   | **是** | 稳定度 0.0~1.0。高 = 长期有效（偏好、决策）；低 = 时效性强（计划、待办）                     |
| `createdAt`             | number   | **是** | 创建时间（毫秒时间戳）                                                                       |
| `updatedAt`             | number   | **是** | 最后更新时间（毫秒时间戳）                                                                   |

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

如果实体包含事实性关系，可选附带 `relations[]`，结构如下：

```typescript
type MemoryNoteEntityRelation = {
  predicate: string;
  object: string;
  validFrom?: string;
};
```

---

## 3. 正文结构

正文采用精简的结构，目的是建立搜索索引而非完整转录对话。
完整对话内容可通过 `sourceConversationIds` 回溯原始对话。

```markdown
## Key Points

- 要点 1
- 要点 2（含关键事实、决策、用户偏好等）

## Contradictions

- [decision_change] old: "之前决定只用 SQLite" -> new: "现在决定使用 SQLite + FTS" (detected: 2026-03-26)

## Open Items

- 待确认/待完成的事项 1（仅在有明确待办时出现）

## Recall Cues

- [decision] 未来值得回忆的关键决定
- [ongoing] 正在延续的重要事情
- [follow_up] 需要后续继续跟进的重要事项

## Source Excerpts

> 原始用户原话引用 1（仅当 importance > 0.8 时自动生成）
> 原始用户原话引用 2
```

### 3.1 段落规则

| 规则     | 说明                                                                                   |
| -------- | -------------------------------------------------------------------------------------- |
| 标题层级 | 一级段落用 `##`，段落内子标题用 `###`                                                  |
| 段落顺序 | Key Points → Contradictions → Open Items → Recall Cues → Source Excerpts               |
| 可选段落 | Contradictions / Open Items / Recall Cues / Source Excerpts 在无内容时省略             |
| 内容风格 | 每条要点一行，使用 `- ` 列表格式，精炼概括，不做详细展开                               |
| 段落长度 | Key Points 建议不超过 15 条要点；Recall Cues 建议不超过 6 条，只保留未来值得回忆的重点 |

`Contradictions` 约束：

1. 只记录明确冲突，不记录普通补充信息。
2. `old` 表示已被推翻的旧事实，`new` 表示当前保留的新事实。
3. 发生冲突后，旧事实应尽量从 `Key Points` 中移除，避免 canonical facts 与 conflict annotations 混在一起。
4. 当用户显式询问“矛盾/冲突/前后变化”时，检索应优先命中 `Contradictions` 段。

### 3.2 Recall Cues 约定

`Recall Cues` 是给 `MEMORY.md` 生成阶段优先消费的“长期记忆候选”段落，不是普通摘要。

每条必须写成：

```markdown
- [decision] 关键决定
- [principle] 长期原则
- [ongoing] 正在延续的重要事情
- [event] 值得记住的事件
- [follow_up] 重要待跟进事项
```

约束：

1. 只记录未来回忆时真正有价值的内容，不能写流水账。
2. 如果当前 note 不足以形成长期记忆候选，可以完全省略 `Recall Cues`。
3. `MEMORY.md` 应优先使用 `Recall Cues` 生成长期记忆摘要；缺失时才退回 `summary` / `Key Points` / `Open Items` 的规则兜底。
4. 历史 note 可以通过后台回填任务渐进式补写 `Recall Cues`；回填时仍必须遵守“宁缺毋滥”的标准，不能把弱信号话题机械补成长期记忆。

### 3.3 Source Excerpts 约定

`Source Excerpts` 段落保存高重要度记忆（importance > 0.8）的原始用户原话引用，作为未来检索时的证据参考。

```markdown
## Source Excerpts

> 原始用户原话引用 1（最多保留 3 条，每条截断在 200 字符以内）
> 原始用户原话引用 2
```

约束：

1. 仅当 note 的 `importance > 0.8` 时才由 LLM 自动生成 `sourceExcerpts`。
2. 每个 note 最多保留 3 条引用，每条最长 200 字符。
3. 引用必须是用户的原话片段，不得改写或编造。
4. 合并更新时，Source Excerpts 会被覆盖为最新提取结果。

### 3.4 Section 索引模型

每个 `##` 段落会被索引为一个 section record（存数据库），包含：

| 字段           | 说明                                                                      |
| -------------- | ------------------------------------------------------------------------- |
| `noteId`       | 所属 Memory Note 的 id                                                    |
| `heading`      | 标题名，如 `Key Points`、`Contradictions`、`Open Items`、`Recall Cues` 或 `Source Excerpts` |
| `headingLevel` | 标题层级（2 = `##`, 3 = `###`）                                           |
| `summary`      | 段落摘要（从正文提取）                                                    |
| `keywords`     | 段落级关键词（从正文提取）                                                |
| `lineStart`    | 起始行号（1-based）                                                       |
| `lineEnd`      | 结束行号（1-based）                                                       |
| `charCount`    | 段落字符数                                                                |

---

## 4. 索引与摘要文件（可选）

### 4.1 当天索引文件

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

### 4.2 长期记忆摘要文件

文件名：`MEMORY.md`

这是给未来回忆直接使用的摘要页，不是目录页。它只保留：

1. 正在延续的重要事情
2. 关键决定与长期原则
3. 近期值得记住的事件
4. 仍需跟进的重要未完成项

设计要求：

1. 正文不应被文件路径、topic 列表、目录导航主导。
2. 只有达到“未来值得回忆”的阈值才进入该文件。
3. 如果没有足够重要且稳定的内容，允许 `MEMORY.md` 保持很短，甚至只说明当前暂无长期记忆摘要。
4. 完整浏览能力放到 `INDEX.md`，不要把 `MEMORY.md` 退化回索引页。
5. 历史 note 的 `Recall Cues` 回填成功后，应自动刷新 `MEMORY.md`，让旧记忆质量逐步提升，而不是长期依赖“最近记忆”兜底。
6. **顶部包含结构化 always-loaded layer**：`## Critical Facts` 继续承载最稳定的 `ongoing` / `decision` / `principle` 记忆；同时新增 `## User Preferences` 与 `## Active Projects`，分别收敛稳定偏好和当前活跃项目摘要。新会话首轮消息会自动预加载这些段落（5 分钟缓存 TTL），确保 AI 从第一条消息就有核心上下文。
7. **可选包含 `## Lifecycle Suggestions` 段落**：基于 note 的 `importance`、`stability`、近期性、是否仍有 `Open Items`、以及正文长度，输出只读的 `archive` / `freeze` / `refresh` / `compact` 建议，用于人工治理长期记忆工作集，不直接改写原 note。

```markdown
---
workspaceId: 'ws-xxx-xxx'
topicCount: 12
noteCount: 87
selectedCount: 6
indexFilePath: 'memory/INDEX.md'
generatedAt: '2026-04-10T12:00:00.000Z'
---

# 长期记忆

> 这里只保留未来值得回忆的重点事件、延续事项、关键决定与重要未完成项，不罗列文件索引。

## Critical Facts

- [decision] 记忆系统：MEMORY.md 应只保留未来值得回忆的重点事件，不再承担目录索引职责。
- [ongoing] 记忆系统：自动提取与自动召回共享同一套核心检索能力，避免入口间行为漂移。
- [principle] AI 架构：所有 AI provider 通过统一适配器接口接入，保持可替换性。

## User Preferences

- 记忆系统：Prefer runtime-configured thresholds over hardcoded defaults.
- 代码维护：稳定偏好是做增量修复与回归测试，而不是引入高风险 schema churn。

## Active Projects

- 记忆系统：继续维护 `Recall Cues` / `Critical Facts` 这条长期记忆摘要链路。Next: 给 always-loaded layer 增加稳定偏好与活跃项目块。
- 检索系统：继续统一 auto-recall 与显式 memory tools 的能力面，避免入口间行为漂移。

## Lifecycle Suggestions

- [archive] 架构决策 / 检索策略 | 2025-12-01 | 长期稳定且已无 open items，可移出 active working set 但继续保留可检索性。
- [refresh] 发布策略 | 2026-01-20 | 仍然重要但已陈旧，建议回看当前事实后刷新摘要与 recall cues。
- [compact] 长文笔记 | 2026-03-20 | 正文已明显变长，建议压缩为更紧凑的关键点与证据摘要。

## 正在延续的事情

- 2026-04-12 · 记忆系统：继续维护 `Recall Cues` / `Critical Facts` 这条长期记忆摘要链路，确保新旧 note 都能逐步收敛到高价值摘要层。

## 关键决定与长期原则

- 记忆系统：MEMORY.md 应只保留未来值得回忆的重点事件，不再承担目录索引职责。

## 待跟进

- 记忆系统：收口 diary 的产品方向，决定它是日志面还是可检索记忆面。
```

### 4.3 全局浏览索引

文件名：`INDEX.md`

这是面向人工浏览和排查的总入口，用来保留：

1. 热门主题
2. 最近记忆 note 列表
3. 主题导航

`INDEX.md` 可以包含文件名和链接；`MEMORY.md` 不应该被这些浏览信息主导。

---

## 5. TypeScript 接口定义

以下是 Frontmatter 和 Section 的 TypeScript 类型，供代码层使用。

```typescript
// ━━ Memory Note Frontmatter ━━

export interface MemoryNoteEntity {
  name: string;
  type: 'person' | 'product' | 'technology' | 'organization' | 'concept' | 'location' | 'event' | 'other';
  relations?: Array<{
    predicate: string;
    object: string;
    validFrom?: string;
  }>;
}

export interface MemoryNoteMessageRange {
  conversationId: string;
  seqStart: number;
  seqEnd: number;
}

export interface MemoryNoteTimeRange {
  start: number;
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
  domain?: string;

  // 关键词与实体
  keywords: string[]; // 3-6 个
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
  contradictions?: Array<{
    old: string;
    new: string;
    type: 'decision_change' | 'attribution_conflict' | 'factual_conflict';
    detectedAt: number;
  }>;

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
    /**
     * 长期记忆候选（可选）：
     * 每条必须是 `- [kind] 内容`
     * kind ∈ ongoing | decision | principle | event | follow_up
     */
    recallCues?: string;
  };
  sourceExcerpts?: string[];
}
```

说明：

- 领域归属当前由上游 `TopicCluster.domain` 阶段决定，再在 merge/write 阶段写入 note frontmatter。
- `sourceExcerpts` 仅在高重要度 note 中保留，用作日后检索时的原文佐证。

---

## 8. 示例 Memory Note

```markdown
---
id: 'mem_2026-03-26_ai-agent-memory-system_a1b2c3'
version: 1
workspaceId: 'ws-main-001'
date: '2026-03-26'
timeRange:
  start: 1711440000000
  end: 1711443600000
topics:
  - '记忆系统设计'
parentTopicId: 'topic_memory_system'
relatedTopicIds:
  - 'topic_memory_retrieval'
  - 'topic_topic_graph'
domain: 'project:chobits'
keywords:
  - '记忆系统'
  - '记忆检索'
  - 'FTS5'
  - '渐进式召回'
aliases:
  - '记忆检索架构'
entities:
  - name: 'OpenClaw'
    type: 'product'
    relations:
      - predicate: 'inspired'
        object: 'Chobits'
        validFrom: '2026-03'
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

## Contradictions

- [decision_change] old: "记忆检索先只做 SQLite" -> new: "记忆检索改为 SQLite + FTS5" (detected: 2026-03-26)

## Open Items

- 检索流水线评分权重需要实验调优
- compaction flush 机制放在第二阶段
- 图谱可视化 UI 放在后续阶段

## Recall Cues

- [decision] 记忆系统先以 Markdown 为事实源，数据库只承担索引职责。
- [principle] 第一阶段优先做结构化检索，不依赖向量服务作为前提。
- [follow_up] 检索流水线评分权重仍需要实验调优。

## Source Excerpts

> “不要依赖向量服务，多语言 embedding 质量不稳定，先把结构化检索做扎实。”
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
