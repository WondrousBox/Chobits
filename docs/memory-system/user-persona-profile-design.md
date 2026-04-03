# Workspace User Persona 设计 v1.1

> 目标：在每次对话后的记忆提取阶段，自动维护一份"空间级用户画像"，用于描述用户的信息、偏好、品味、目标、性格、沟通习惯及近期动态。
> 约束：画像必须持续进化，但不能无限增长；越更新越精炼。

---

## 1. 设计目标

1. 画像跟随 workspace，不跨空间污染。
2. 画像是单文件 Markdown，便于人工查看与调试。
3. 每次更新都在固定预算内完成，不允许无限追加。
4. 优先保留高价值、稳定、可行动的信息。
5. 输出可直接注入 system prompt，显著节省 token。

---

## 2. 存储位置与产物

## 2.1 存储路径

`<workspace>/memory/USER_PERSONA.md`

说明：该文件是该 workspace 的唯一用户画像事实源。

## 2.2 文件头（frontmatter）

```yaml
---
version: 1
workspaceId: 'ws-xxx'
updatedAt: 1712102400000
charBudget: 1200
itemBudget: 30
compressionRound: 12
---
```

---

## 3. 硬预算（核心约束）

为节省 token，采用严格上限：

1. 正文最大字符数：`1200`（不含 frontmatter）。
2. 最大信息条目：`30` 条。
3. 单条信息建议长度：`12~48` 字。
4. 每个维度最多条目：
   - 基本信息：3
   - 偏好与品味：6
   - 目标与动机：5
   - 性格与沟通风格：5
   - 决策偏好与边界：3
   - 近期动态（当前项目与关注点）：4
   - 最近变化（短期态）：2

超过预算必须执行压缩，不允许写入超限版本。

---

## 4. Markdown 结构（固定模板）

```markdown
# User Persona

## Snapshot

- 一句话用户画像摘要（<= 60 字）

## Basic Info

- ...

## Preferences & Taste

- ...

## Goals & Motivation

- ...

## Personality & Communication

- ...

## Decision Style & Boundaries

- ...

## Current Activities

- ...

## Recent Shift

- ...
```

规则：

1. 只允许以上 8 个一级 section。
2. 每条必须是"结论句"，不写过程叙述。
3. 禁止冗余修饰词（如"非常非常"、"可能大概"）。
4. 不写无法证实的推断性人格标签。
5. Current Activities 记录用户近期正在做的事、当前项目和关注点，时效性强，新活动应替换旧内容。

---

## 5. 触发与更新时机

在记忆系统已有提取链路后追加两个阶段：

`conversation_close/daily/manual` -> Persona Update Check -> (if needed) Persona Update Job

关键原则：

1. 对话结束后不直接更新画像。
2. 先执行"是否需要更新"判定。
3. 只有判定为需要时，才提交独立画像更新任务。

建议判定条件（复用记忆提取脏检查 + 画像特征信号）：

1. 新增消息达到最小阈值。
2. 距上次画像更新超过最小间隔。
3. 对话包含偏好、目标、沟通风格、决策依据等可沉淀信息。
4. 与现有画像相比存在"新增信息"或"冲突修正"。

## 5.1 更新判定器（Persona Update Check）

调用方式参考主题提取流程，但职责更轻：

1. 输入：本轮新增对话片段 + 当前 `USER_PERSONA.md` 摘要。
2. 输出：结构化判定结果（是否更新、原因、必要片段）。

```ts
type PersonaUpdateDecision = {
  shouldUpdate: boolean;
  reason: 'new_stable_preference' | 'new_goal_or_priority' | 'communication_style_shift' | 'conflict_resolution' | 'recent_activity_update' | 'insufficient_signal';
  signalScore: number; // 0~1
  evidence: Array<{
    conversationId: string;
    seqStart: number;
    seqEnd: number;
    note: string;
  }>;
  candidateFacts: Array<{
    dimension: 'basic' | 'preference' | 'goal' | 'personality' | 'decision' | 'activity' | 'recent';
    statement: string;
    confidence: number; // 0~1
  }>;
};
```

推荐阈值：

- 默认：`shouldUpdate = signalScore >= 0.62` 且 `evidence.length > 0`。
- Activity 类更新：`signalScore >= 0.35` 即可通过（时效性强，及时记录比等待确认更重要）。

进一步约束：

1. 单次 evidence 最多返回 3 段，避免把整段对话回传。
2. evidence 的每段长度建议 <= 12 条消息。
3. reason 允许多个时，主 reason 取最高置信类别，其余记入判定日志。

## 5.2 独立触发的画像更新任务

当 `shouldUpdate = true` 时：

1. 仅传递必要证据片段（而非整段对话）到 Persona Update Job。
2. `candidateFacts` 随 evidence 一起传递，作为更新算法（§6）的直接输入，
   避免更新阶段重复调用 LLM 做事实提取。
3. Persona Update Job 独立入队，支持去重、重试、取消。
4. 任务优先级建议低于主对话链路，与记忆提取并行但互不阻塞。

当 `shouldUpdate = false` 时：

1. 不改写画像文件。
2. 可记录一次轻量判定日志（用于后续阈值调优）。

## 5.3 建议调用链路

```text
conversation_close
  -> runPersonaUpdateCheck()
  -> if decision.shouldUpdate
       -> enqueuePersonaUpdateJob(decision.evidence, decision.candidateFacts)
       -> Persona Update (解析 -> 合并 -> 精炼 -> 校验)
```

## 5.4 与记忆提取流程的精确集成点

画像判定挂载在 `AGENT_LOOP_COMPLETE` / `SPRITE_AI_COMPLETE` 事件之后，
与记忆提取（Memory Extraction）并行但独立：

```text
SPRITE_AI_COMPLETE / AGENT_LOOP_COMPLETE
  ├── Memory Extraction Check (existing)
  │     └── enqueue extraction job (if dirty)
  └── Persona Update Check (new)
        ├── gate checks (min messages, cooldown, etc.)
        ├── LLM judgment call (§5.5 prompt)
        └── enqueue persona update job (if shouldUpdate)
```

两个链路共享同一个事件源，但各自独立入队、独立执行、互不阻塞。

事件监听入口：`electron/main/handlers/persona/persona-trigger.ts`

```ts
// 监听事件
eventManager.on(AppEvent.AGENT_LOOP_COMPLETE, async (payload) => {
  // fire-and-forget，不阻塞主链路
  checkAndQueuePersonaUpdate(payload).catch((e) => console.warn('[Persona] Check failed:', e));
});
```

## 5.5 判定器 Prompt 规范（可直接实现）

```text
你是用户画像更新判定器。你的任务不是更新画像，而是判断"是否值得更新"。

输入：
1) 当前用户画像摘要（可能为空）
2) 本轮新增对话片段（含 conversationId 和 seq）

判定标准：
- 出现"稳定偏好、长期目标、明确沟通风格、决策边界、冲突修正"应更新
- 用户提到**近期正在做的事、当前项目、最近的兴趣或关注点**也应更新（放入 activity 维度）
- 用户透露出的**作息习惯、工作状态、生活近况**也值得记录到 activity 维度
- 纯寒暄（你好/再见）、一次性无上下文的提问不应触发更新
- 若与现有画像完全重复，不应触发更新

维度说明：
- basic: 年龄、职业、技术栈等基本信息
- preference: 稳定的偏好和品味
- goal: 长期目标和动力
- personality: 沟通风格
- decision: 决策偏好
- activity: 近期正在做的事、当前项目与关注点（重要！这是高频更新的维度）
- recent: 近期态度或偏好的转变

输出 JSON：
{
  "shouldUpdate": true/false,
  "reason": "new_stable_preference|new_goal_or_priority|communication_style_shift|conflict_resolution|recent_activity_update|insufficient_signal",
  "signalScore": 0.0~1.0,
  "evidence": [
    {"conversationId":"...","seqStart":1,"seqEnd":8,"note":"简要证据"}
  ],
  "candidateFacts": [
    {"dimension":"preference|goal|personality|decision|basic|activity|recent","statement":"...","confidence":0.0~1.0}
  ]
}

注意：activity 维度的信号分数应适当放宽（0.4+ 即可），因为这类信息时效性强，及时记录比等待确认更重要。

只输出 JSON，不要解释。
```

## 5.6 首次创建流程

当 `USER_PERSONA.md` 不存在时（新 workspace 或首次触发）：

1. 判定器照常运行，`shouldUpdate` 判定标准不变。
2. 若 `shouldUpdate=true`，更新任务检测到文件不存在后进入「创建模式」。
3. 创建模式：直接用 candidateFacts + 更新 Prompt（§6.8）渲染初始画像，不做合并。
4. 初始画像的 `compressionRound` 设为 0。
5. 初始 Snapshot 由 LLM 根据 candidateFacts 生成一句话概括。

首次创建使用与常规更新相同的校验门槛（§7），
确保即使是第一版也在预算内。

## 5.7 用户手动编辑画像的处理

用户可直接编辑 `USER_PERSONA.md`。系统应尊重手动修改：

1. 每次更新前读取文件的 `updatedAt`，与上次记录的写入时间对比。
2. 若文件被外部修改（`fsMtime > lastKnownUpdatedAt`），
   优先以文件内容为准，在此基础上叠加新事实。
3. 手动添加的条目视为 `confidence=1.0, stability=1.0`（用户亲笔 = 最高置信）。
4. 手动删除的条目在下次更新时不会被自动恢复。

---

## 6. 更新算法（无限更新、无限精炼）

每次更新都执行"读取现有 -> 合并候选 -> LLM 精炼 -> 校验写入"四步。

## 6.1 读取与解析现有画像

更新前须先将 `USER_PERSONA.md` 解析为结构化数据：

```ts
interface PersonaFrontmatter {
  version: number;
  workspaceId: string;
  updatedAt: number;
  charBudget: number;
  itemBudget: number;
  compressionRound: number;
}

interface ParsedPersona {
  frontmatter: PersonaFrontmatter;
  snapshot: string;
  facts: PersonaFact[]; // 从各 section 的列表项解析
  rawMarkdown: string; // 原始内容（回滚用）
}

function parsePersonaMarkdown(content: string): ParsedPersona;
```

解析规则：

1. YAML frontmatter → `PersonaFrontmatter` 对象。
2. 各 `##` section → 按 section 名映射到 `dimension`。
3. 每个 `- ` 列表项 → 一条 `PersonaFact`。
4. 现有条目默认 `confidence=0.8, stability=0.7`（除非标记了来源置信度）。

Section 到 dimension 映射：

| Section                     | dimension                    |
| --------------------------- | ---------------------------- |
| Snapshot                    | snapshot（特殊，不入 facts） |
| Basic Info                  | `basic`                      |
| Preferences & Taste         | `preference`                 |
| Goals & Motivation          | `goal`                       |
| Personality & Communication | `personality`                |
| Decision Style & Boundaries | `decision`                   |
| Current Activities          | `activity`                   |
| Recent Shift                | `recent`                     |

## 6.2 候选事实结构

新增事实来自判定器的 `candidateFacts`（§5.5），统一结构：

```ts
type PersonaFact = {
  dimension: 'basic' | 'preference' | 'goal' | 'personality' | 'decision' | 'activity' | 'recent';
  statement: string;
  confidence: number; // 0~1
  stability: number; // 0~1，长期稳定性
  recency: number; // 0~1，时间新鲜度
  evidenceCount: number;
};
```

## 6.3 合并规则

1. 同义信息合并为一条（保留更具体表达）。
2. 冲突信息按"新证据 + 高置信"替换旧值。
3. 低置信推断（confidence < 0.5）进入 `Recent Shift`，不直接污染长期画像。
4. `candidateFacts` 中 `dimension` 与现有 facts 对比，精确插入或替换。

## 6.4 评分函数

$$
score_i = 0.35 \cdot confidence_i + 0.30 \cdot stability_i + 0.20 \cdot recency_i + 0.15 \cdot evidenceNorm_i
$$

用于排序与淘汰。

## 6.5 预算裁剪（必须执行）

若超出 `charBudget` 或 `itemBudget`：

1. 删除低分条目（从低到高）。
2. 合并可合并条目（同维度同语义）。
3. 重写为更短句（保持语义不变）。
4. 若仍超限，优先删除 `recent` 和 `activity` 维度低分条目。

目标函数：在固定字符预算内最大化信息密度。

$$
\max \sum_i \frac{score_i \cdot utility_i}{charCount_i}
$$

## 6.6 写入策略（原子性与回滚）

1. 先写临时文件 `USER_PERSONA.md.tmp`。
2. 通过所有校验后再原子替换正式文件。
3. 保留最近 3 个历史快照（`USER_PERSONA.v{n}.bak.md`）。
4. 写入失败自动回滚到上一个有效版本。

## 6.7 冲突解决优先级

当新旧事实冲突时，按以下优先级比较：

1. `evidenceCount` 高者优先。
2. 最近 30 天内重复出现者优先。
3. 明确表达优先于弱表达（例如"我就是要" > "也许可以"）。
4. 若仍无法区分，保留旧值并将新值写入 `Recent Shift`。

## 6.8 更新/改写 Prompt 规范（可直接实现）

当判定器决定需要更新时，由以下 Prompt 执行实际画像改写：

```text
你是用户画像精炼器。你的任务是将新证据融入现有画像，产出一份更精炼的版本。

输入：
1) 现有画像 Markdown（可能为空——如果是首次创建）
2) 新增候选事实列表（含 dimension、statement、confidence）
3) 证据摘要（简要对话片段）

输出规则：
- 输出完整的 User Persona Markdown（含所有 section）
- 只允许 8 个 section：Snapshot, Basic Info, Preferences & Taste, Goals & Motivation, Personality & Communication, Decision Style & Boundaries, Current Activities, Recent Shift
- 每条信息必须是结论句（不写过程叙述）
- 总条目数 <= 30 条，总正文 <= 1200 字符
- 与现有画像冲突的条目用新证据替换旧值
- 重复条目合并为更精炼的表达
- 低置信（confidence < 0.5）仅放入 Recent Shift
- 无变化的条目原样保留
- Snapshot 必须是一句话（<= 60 字），概括用户画像核心
- Current Activities 记录用户近期正在做的事、当前项目和关注点（最多 4 条），时效性强，新活动应替换旧内容
- Recent Shift 记录近期态度/偏好转变（最多 2 条）
- 禁止写入助手的偏好或系统策略
- 无内容的 section 省略（Snapshot 除外）

输出格式：直接输出 Markdown 正文（不含 frontmatter），不要解释。
```

## 6.9 Recent Shift 条目生命周期

`Recent Shift` 存放低置信或新观察到的短期信号，遵循以下生命周期：

1. **晋升**：若同一条目在后续 3 次以上更新中重复出现（confidence 累积 >= 0.7），
   将其晋升到对应的长期 section。
2. **过期**：若条目超过 30 天未被再次确认，在下一次更新时自动删除。
3. **容量**：最多保留 2 条。超额时按 recency 最旧者淘汰。
4. **不注入**：Recent Shift 条目默认不注入 system prompt，
   除非调用方明确请求完整画像。

---

## 7. 质量门槛

每次写入前执行校验：

1. 字符数 <= `1200`。
2. 条目数 <= `30`。
3. 每个 section 不超过其条目上限。
4. 不能出现空 section（无内容则省略该 section，除了 Snapshot）。
5. `Snapshot` 必须可被独立注入（单段可读）。

校验失败则回退到上一个有效版本。

## 7.1 语义质量规则

1. 不得出现互相矛盾的同维度描述。
2. 每条信息必须可追溯到至少一段 evidence。
3. 禁止把助手自身偏好写进用户画像。
4. 禁止把系统策略误写为用户偏好。

---

## 8. 与记忆系统的关系

1. `Memory Note` 保留细节与证据。
2. `USER_PERSONA.md` 保留高密度长期画像。
3. 检索时优先注入 Persona，再按需召回 Memory Notes。

建议注入顺序：

1. Persona Snapshot（必注入）
2. Persona Top Facts（按 token 预算 3~8 条）
3. 需要时再补充主题记忆段落

## 8.1 与 Memory Note 的职责边界

1. Persona 存"结论"，Memory Note 存"证据与上下文"。
2. Persona 不保存长引用或完整对话。
3. Persona 的每一条可追溯到 Memory Note 或 conversation seq。

---

## 9. IPC 与服务契约

使用 `user-profile:*` IPC 域（`persona:*` 已用于角色人格系统）。

## 9.1 IPC 列表

| Channel                          | 方向          | 说明              | 实现文件                                          |
| -------------------------------- | ------------- | ----------------- | ------------------------------------------------- |
| `user-profile:get`               | renderer→main | 读取当前画像      | `electron/main/handlers/user-profile/ipc-main.ts` |
| `user-profile:checkUpdateNeeded` | renderer→main | 手动触发判定      | 同上                                              |
| `user-profile:enqueueUpdate`     | renderer→main | 手动触发更新      | 同上                                              |
| `user-profile:getUpdateStatus`   | renderer→main | 查询队列/任务状态 | 同上                                              |
| `user-profile:getInjectionText`  | renderer→main | 获取注入文本      | 同上                                              |

## 9.2 TypeScript 接口草案

```ts
// ━━ 判定相关 ━━

export interface PersonaCheckParams {
  workspaceId: string;
  conversationId: string;
  providerId?: string;
  providerPresetId?: string;
}

export interface PersonaCheckResult {
  decision: PersonaUpdateDecision;
  skippedByGate?: 'min_message' | 'min_interval' | 'cooldown' | 'no_user_signal';
}

// ━━ 更新任务相关 ━━

export interface PersonaUpdateJobParams {
  workspaceId: string;
  evidence: Array<{
    conversationId: string;
    seqStart: number;
    seqEnd: number;
  }>;
  candidateFacts: Array<{
    dimension: PersonaFact['dimension'];
    statement: string;
    confidence: number;
  }>;
  reason: PersonaUpdateDecision['reason'];
  providerId?: string;
  providerPresetId?: string;
}

// ━━ 读取相关 ━━

export interface PersonaDocumentSummary {
  workspaceId: string;
  exists: boolean;
  updatedAt: number;
  charCount: number;
  itemCount: number;
  compressionRound: number;
  snapshot: string;
  fullMarkdown?: string; // 调用方可选是否返回全文
}

// ━━ 更新状态 ━━

export type PersonaJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'skipped';

export interface PersonaUpdateStatus {
  jobId?: string;
  status: PersonaJobStatus;
  lastCheckAt?: number;
  lastUpdateAt?: number;
  lastReason?: PersonaUpdateDecision['reason'];
  error?: string;
}
```

## 9.3 Preload Bridge

**实现文件**：`electron/preload/apis/user-profile.ts`

```ts
export const userProfileApi = {
  get: (params) => ipcRenderer.invoke('user-profile:get', params),
  checkUpdateNeeded: (params) => ipcRenderer.invoke('user-profile:checkUpdateNeeded', params),
  enqueueUpdate: (params) => ipcRenderer.invoke('user-profile:enqueueUpdate', params),
  getUpdateStatus: (params) => ipcRenderer.invoke('user-profile:getUpdateStatus', params),
  getInjectionText: (params) => ipcRenderer.invoke('user-profile:getInjectionText', params)
};
```

Renderer 访问方式：`window.YUA.userProfile.get({ workspaceId })`

---

## 10. 任务队列与调度

为保证不阻塞对话主链路，采用独立队列 `PersonaUpdateQueue`。

调度建议：

1. `maxConcurrent = 1`（同 workspace 串行）。
2. 同 workspace 5 分钟内重复 reason 去重。
3. 失败最多重试 2 次，指数退避（5s, 20s）。
4. 若 Memory Extraction 正在运行，Persona 任务可并行，但读取对话片段时只读快照。

任务状态：`queued | running | completed | failed | cancelled | skipped`。

队列事件扩展（`packages/event/events.ts`）：

```ts
PERSONA_UPDATE_STARTED = 'PERSONA_UPDATE_STARTED',
PERSONA_UPDATE_COMPLETED = 'PERSONA_UPDATE_COMPLETED',
PERSONA_UPDATE_FAILED = 'PERSONA_UPDATE_FAILED',
PERSONA_UPDATE_SKIPPED = 'PERSONA_UPDATE_SKIPPED',
```

---

## 11. 数据与文件布局

```text
<workspace>/memory/
  USER_PERSONA.md              # 当前画像（事实源）
  USER_PERSONA.v{n}.bak.md     # 历史快照（保留最近 3 个）
  logs/
    persona-update-YYYY-MM-DD.jsonl  # 判定日志
```

判定日志 JSONL 每行字段：

```json
{
  "timestamp": 1712102400000,
  "workspaceId": "ws-xxx",
  "conversationId": "conv-xxx",
  "shouldUpdate": true,
  "reason": "new_stable_preference",
  "signalScore": 0.78,
  "skippedByGate": null,
  "jobId": "pj-xxx",
  "candidateFactCount": 2,
  "durationMs": 1200
}
```

---

## 12. System Prompt 注入策略

画像注入是 Persona 系统对外的核心输出。注入发生在每次对话开始时。

## 12.1 注入层级

| 层级 | 内容                 | token 预算     | 条件                    |
| ---- | -------------------- | -------------- | ----------------------- |
| L0   | Snapshot（一句话）   | ~30 token      | 必注入                  |
| L1   | Top facts（3~10 条） | ~100~300 token | 默认注入（含 activity） |
| L2   | Full persona（全文） | ~500~700 token | 仅 rebuild 或详细模式   |

## 12.2 注入模板

```text
<user_profile>
{snapshot}

{top_facts}
</user_profile>
```

## 12.3 注入位置

在 system prompt 中，位于 角色人格描述（character persona）之后、
工具使用说明之前。通过 `system-prompt-enricher.ts` 的 enrichment pipeline 注入。

**实现文件**：`electron/main/handlers/user-profile/user-profile-enricher.ts`

注入时自动跳过以下场景：

- 非持久化对话（标题生成、ephemeral 等）
- 内部 agent（`memory-extraction`、`user-persona-check`、`user-persona-update` 等）
- 画像文件不存在或为空

注入级别为 `top`（Snapshot + Top Facts，含 Current Activities，排除 Recent Shift）。
使用 5 分钟内存缓存避免频繁磁盘读取，画像更新后自动清除缓存。

---

## 13. 安全与隐私约束

1. 默认不写入高敏信息（邮箱、手机号、证件号、精确住址）。
2. 若用户明确要求不记忆，直接跳过更新并写入拒绝标记。
3. Persona 文件仅本地存储，不上传第三方。
4. 导出前支持敏感词脱敏（后续可选能力）。
5. 敏感词过滤列表可在判定器 Prompt 中追加，也可在校验环节规则过滤。

---

## 14. 观测指标与调优

关键指标：

| 指标                            | 目标值   | 说明               |
| ------------------------------- | -------- | ------------------ |
| `check_to_update_rate`          | 15%~40%  | 判定触发率         |
| `update_accept_rate`            | > 98%    | 更新成功率         |
| `avg_persona_char_count`        | 900~1200 | 平均字符占用       |
| `persona_injection_token_saved` | —        | 相对注入节省 token |
| `contradiction_detected_rate`   | 持续下降 | 冲突率             |
| `recent_shift_promotion_rate`   | 10%~30%  | 短期条目晋升率     |

调优策略：

1. 触发率过高：提高 `signalScore` 阈值或收紧 reason 规则。
2. 触发率过低：放宽证据条数要求，增加对目标变化的权重。
3. 冲突率过高：提高冲突替换门槛，延长观察窗口。
4. 晋升率过低：降低累积 confidence 门槛或缩短观察窗口。

---

## 15. 测试与验收标准

## 15.1 单元测试

1. `parsePersonaMarkdown` 正确解析 frontmatter + sections + facts。
2. 判定器输出 JSON 结构合法。
3. `shouldUpdate=false` 不触发写入。
4. 超预算输入能被压缩到预算内。
5. 冲突信息按优先级正确处理。
6. Recent Shift 过期/晋升逻辑正确。

## 15.2 集成测试

1. `AGENT_LOOP_COMPLETE` -> check -> enqueue -> update 全链路可跑通。
2. 判定跳过时链路不中断且主对话无阻塞。
3. 写入失败可自动回滚到上一个 `.bak.md`。
4. 多次连续对话下 charCount 始终 <= 1200。
5. 首次创建流程可正常生成初始画像。
6. 手动编辑后的下次更新不会覆盖用户修改。

## 15.3 验收门槛

1. 连续 100 次更新后，字符数始终 <= 1200。
2. 任意时刻条目数始终 <= 30。
3. 同一用户偏好在 3 次重复表达后稳定保留。
4. 无证据条目不会写入正式画像。
5. Recent Shift 超过 30 天未确认的条目被自动清理。

---

## 16. 分阶段落地计划

Phase A（最小可用）— ✅ 已完成

1. `user-profile:checkUpdateNeeded` — 判定是否更新
2. `user-profile:enqueueUpdate` — 独立更新任务
3. `user-profile:get` — 读取画像
4. `user-profile:getInjectionText` — 获取注入文本
5. 画像解析器 + 更新 Prompt + 写入 + 预算校验 + 回滚

Phase B（稳定化）— 部分完成

1. 判定日志与观测指标
2. 去重、重试、冷却策略
3. 冲突解决增强
4. Recent Shift 晋升/过期机制
5. ✅ System prompt 注入集成（`user-profile-enricher.ts`，5 分钟缓存，画像更新后自动清缓存）
6. ✅ 前端设置页面（用户画像分类，展示各维度画像内容）
7. ✅ 判定超时保护（60 秒 AbortController）

Phase C（高级能力）

1. 条目级溯源链接（conversation + seq）
2. 双层 Persona（长期稳定层 + 短期状态层）
3. 自动注入策略 A/B 评估
4. `user-profile:rebuild` 全量重建
5. 用户手动编辑检测与合并

---

## 17. 版本演进建议

v1（当前）：

1. 单文件 Markdown + 固定预算 + 规则压缩。
2. 对话结束后先判定，再按需独立触发更新。

v2（后续）：

1. 增加条目级来源引用（conversationId + seq range）。
2. 增加"稳定画像"与"短期状态"双层缓存。
3. 加入 A/B 策略评估（回答质量 vs token 消耗）。

---

## 18. 示例（极简）

```markdown
# User Persona

## Snapshot

- 目标导向的效率型用户，偏好可执行方案和清晰结构，讨厌空泛回答。

## Preferences & Taste

- 偏好中文沟通，术语可中英混用但要先给结论。
- 喜欢先有文档设计再进入实现。
- 注重本地优先与可维护架构。

## Goals & Motivation

- 希望构建可持续演进的 agent 记忆能力。
- 重视 token 成本，希望长期上下文可压缩复用。

## Personality & Communication

- 表达直接，需求明确，接受高密度信息。

## Decision Style & Boundaries

- 接受渐进式迭代，不接受一次性大爆炸改造。

## Current Activities

- 正在开发 AI 记忆功能和用户画像系统。
- 近期关注对话驱动的画像自动提取与注入。
```

---

## 19. 实现任务清单

> 本节跟踪代码实现状态。每个任务标注实际文件路径和完成状态。
> 实现变更时应同步更新此清单。

<!-- IMPL_SYNC_START: 以下内容应与代码保持同步。修改代码后请更新状态。 -->

### Phase A：最小可用

| ID  | 任务                 | 文件                                                                                                    | 状态      |
| --- | -------------------- | ------------------------------------------------------------------------------------------------------- | --------- |
| A1  | 类型定义             | `packages/ai/services/persona-types.ts`                                                                 | ✅ 已实现 |
| A2  | 解析器/渲染器/校验器 | `packages/ai/services/persona-document.ts`                                                              | ✅ 已实现 |
| A3  | 判定服务             | `packages/ai/services/persona-check-service.ts`                                                         | ✅ 已实现 |
| A4  | 更新服务             | `packages/ai/services/persona-update-service.ts`                                                        | ✅ 已实现 |
| A5  | 任务队列             | `electron/main/handlers/user-profile/persona-queue.ts`                                                  | ✅ 已实现 |
| A6  | 事件触发器           | `electron/main/handlers/user-profile/persona-trigger.ts`                                                | ✅ 已实现 |
| A7  | IPC Handler          | `electron/main/handlers/user-profile/ipc-main.ts`                                                       | ✅ 已实现 |
| A8  | IPC 注册 + Preload   | `electron/main/handlers/index.ts`, `electron/preload/apis/user-profile.ts`, `electron/preload/index.ts` | ✅ 已实现 |
| A9  | 事件定义             | `packages/event/events.ts`                                                                              | ✅ 已实现 |

### Phase B：稳定化

| ID  | 任务                  | 文件                                                           | 状态      |
| --- | --------------------- | -------------------------------------------------------------- | --------- |
| B1  | 判定日志              | `electron/main/handlers/user-profile/persona-logger.ts`        | ⬜ 未实现 |
| B2  | 冲突解决增强          | `packages/ai/services/persona-update-service.ts`               | ⬜ 未实现 |
| B3  | Recent Shift 生命周期 | `packages/ai/services/persona-update-service.ts`               | ⬜ 未实现 |
| B4  | System Prompt 注入    | `electron/main/handlers/user-profile/user-profile-enricher.ts` | ✅ 已实现 |
| B5  | 前端设置页面          | `src/pages/SettingsPage/components/UserProfileSettings.tsx`    | ✅ 已实现 |
| B6  | Renderer 类型声明     | `src/renderer.d.ts`                                            | ✅ 已实现 |
| B7  | 判定超时保护          | `electron/main/handlers/user-profile/persona-trigger.ts`       | ✅ 已实现 |

### Phase C：高级能力

| ID  | 任务         | 文件                                              | 状态      |
| --- | ------------ | ------------------------------------------------- | --------- |
| C1  | 全量重建     | `electron/main/handlers/user-profile/ipc-main.ts` | ⬜ 未实现 |
| C2  | 条目级溯源   | `packages/ai/services/persona-types.ts`           | ⬜ 未实现 |
| C3  | 双层 Persona | —                                                 | ⬜ 未实现 |
| C4  | A/B 注入评估 | —                                                 | ⬜ 未实现 |

<!-- IMPL_SYNC_END -->

### IPC 通道命名说明

由于 `persona:*` 前缀已被角色人格系统（character persona）占用，
用户画像系统使用 `user-profile:*` 前缀。对应关系：

| 设计文档原名                | 实际 IPC 通道                    |
| --------------------------- | -------------------------------- |
| `persona:get`               | `user-profile:get`               |
| `persona:checkUpdateNeeded` | `user-profile:checkUpdateNeeded` |
| `persona:enqueueUpdate`     | `user-profile:enqueueUpdate`     |
| `persona:getUpdateStatus`   | `user-profile:getUpdateStatus`   |
| — (新增)                    | `user-profile:getInjectionText`  |

### 任务依赖图

```text
A1 (types)
 ├── A2 (parser/renderer)
 │    ├── A3 (check service)
 │    │    ├── A4 (update service)
 │    │    │    └── A5 (queue)
 │    │    │         ├── A6 (trigger)
 │    │    │         └── A7 (IPC handler)
 │    │    │              └── A8 (registration)
 │    │    └── A6 (trigger)
 │    └── A7 (IPC handler)
 └── A9 (events) ← 无依赖，可并行

Phase B: B1~B4 依赖 Phase A 完成
Phase C: C1~C4 依赖 Phase B 完成
```
