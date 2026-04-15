# Chobits Skill System 改造方案

更新时间：2026-04-15

本文档用于为 Chobits 设计一套全新的 skill 系统。设计优先参考本地 `claude-code` 项目的 skill 架构，其次参考 Pi / Agent Skills 的兼容约定。目标不是把现有 `toolbox.md` 小修小补，而是把 skill 升级为运行时中的一等资源。

## 文档目标

- 使用 `SKILL.md` 作为 skill 的标准封装格式
- 让 skill 成为独立于 tool、profile、长期上下文文件的资源层
- 优先借用 Claude Code 已验证过的加载、发现、执行、提示注入模式
- 在不牺牲当前 Chobits 动态工具激活优势的前提下完成重构
- 保留对 Pi / Agent Skills 生态的兼容能力，但不直接把 Pi 原生 skill runtime 当作主实现

## 结论先行

Chobits 的 skill 系统应采用下面这条路线：

1. 不直接开启 Pi 原生 `noSkills: false` 并把运行权交给 Pi。
2. 自己实现一套 `SkillRegistry + SkillDiscovery + SkillUseTool` 运行时。
3. 把 Claude Code 的多来源加载、frontmatter 契约、skill listing、skill discovery、SkillTool 执行模式借过来。
4. 把 Pi 的 `SKILL.md` 目录结构、渐进加载、`baseDir` 兼容约定借过来。
5. 让现有 `toolbox.md` 在过渡期变成兼容层，最终迁移为 bundled skills，而不是继续作为唯一事实源。

一句话概括：

Chobits 应该做的是一个“Claude Code 风格的自有 skill runtime”，而不是“把 Pi skill 开关打开”。

## 现状与问题

### 当前已有能力

- `packages/ai/runtime/pi/toolbox.md` 是当前能力说明的 Markdown 真相源。
- `packages/ai/runtime/pi/toolbox.ts` 能把 `toolbox.md` 解析成技能章节，并做轻量搜索和排序。
- `packages/ai/runtime/pi/tools/toolbox-lookup.ts` 能按搜索结果自动激活相关工具。
- `packages/ai/runtime/pi/profiles.md` 已经把 `assistant` profile 的工作流定义成“先查工具箱，再调用真实工具”。

### 当前缺失的关键层

- 没有真正的 `SKILL.md` 目录扫描和多来源加载。
- 没有 skill frontmatter 契约，现有系统没有 `name` / `description` / `when_to_use` / `arguments` 这类结构化字段。
- 没有 skill registry，skill 不是一等资源，只是 `toolbox.md` 的一个章节。
- 没有 skill discovery attachment，也没有 turn 级 skill surfacing。
- 没有专门的 skill use 执行面，命中后只是激活工具，不是加载 skill 本身。
- 没有把 `CLAUDE.md` / `AGENTS.md` 这一类长期上下文文件和 `SKILL.md` 分层。
- 当前 `session-factory.ts` 明确关闭了 Pi 原生 skills、extensions、prompt templates、themes 和 agents files，因此即使写了 `SKILL.md`，现链路也不会真正使用它们。

### 当前设计的优点

现有 `toolbox` 方案并不是无价值的。它有两点非常值得保留：

- 动态工具激活，能明显降低常驻 prompt token 开销。
- 搜索优先，而不是把全部工具 schema 一次性注入给模型。

新 skill 系统应该继承这两点，而不是推翻。

## 参考实现提炼

### Claude Code 应重点借用的部分

来自本地 `claude-code` 项目的主要可借用模式：

- 多来源 skill 加载。
  - 用户级
  - 项目级
  - bundled skills
  - plugin skills
  - MCP skills
- 丰富 frontmatter 契约。
  - `allowed-tools`
  - `argument-hint`
  - `arguments`
  - `when_to_use`
  - `disable-model-invocation`
  - `user-invocable`
  - `paths`
  - `model`
  - `effort`
  - `context: fork`
- skill 先进入 registry，再分流成不同“视图”。
  - 给模型调用的 skill 列表
  - 给用户 `/skill-name` 调用的 skill 列表
- SkillTool 是独立执行面，不把 skill 混成普通工具说明。
- system prompt 会明确告诉模型可以使用 skill，并解释如何使用。
- 每轮会有 skill listing / skill discovery 的 attachment 或 reminder。
- `CLAUDE.md` 是长期上下文和规则层，不等于 skill。

### Pi / Agent Skills 应借用的部分

来自 Pi 和 Agent Skills 规范的可借用模式：

- `SKILL.md` 目录结构约定。
- 启动时只读取 metadata，正文按需读取。
- skill body 使用相对路径引用 `references/`、`scripts/`、`assets/`。
- `baseDir` 语义和路径替换占位符。
- `AGENTS.md` / `CLAUDE.md` 这类上下文文件与 skill 分离。
- 对 Claude Code / Codex skill 目录做兼容扫描。

### 不直接照搬的部分

有些能力可以参考，但不建议原样照搬：

- 不建议在 v1 支持 Claude Code 那种从 skill prompt 内直接执行内联 shell 片段。
- 不建议一开始引入过多 feature flag 和多层 fallback。
- 不建议让 skill 直接拥有高权限执行语义。skill 只提供流程和约束，真正执行仍由现有 tools 完成。
- 不建议在 v1 做远程 skill marketplace 或 MCP skill 写入面，先把本地 skill runtime 做稳。

## 总体设计原则

### 1. Skill 不是 Tool

tool 是可执行能力单元，skill 是对一组能力、步骤、约束、上下文资源的封装。skill 可以激活 tool、限制 tool、指导 tool，但不应和 tool 合并建模。

### 2. `SKILL.md` 与 `CLAUDE.md` / `AGENTS.md` 分层

- `profiles.md`
  - 定义 agent 身份、风格和高层工作准则
- `AGENTS.md` / `CLAUDE.md`
  - 定义项目、用户、团队的长期上下文和约束
- `SKILL.md`
  - 定义可复用能力包、步骤、资源和工具约束
- `tools/*`
  - 定义真实执行入口

这四层不要再混在一起。

### 3. 渐进加载优先

- 总在 prompt 里的只有 skill metadata
- skill body 在真正命中后才加载
- `references/` 等大内容按需再加载

### 4. 运行时显式化

skill 的使用必须走明确的 runtime 面，比如 `skillSearchTool` 和 `skillUseTool`，而不是靠 prompt 魔法猜测。

### 5. 兼容优先于强绑定

Chobits 要兼容 `.claude/skills`、`.agents/skills`、Agent Skills 风格目录，但不把自身实现绑死在某个外部 runtime 上。

### 6. 迁移要平滑

现有 `toolbox.md`、`assistant` profile 和动态工具激活链路不能在第一阶段被打断。

## 目标架构

### 分层结构

```text
Profile Layer
  -> profiles.md

Instruction Layer
  -> AGENTS.md / CLAUDE.md / .chobits/AGENTS.md

Skill Layer
  -> SKILL.md packages
  -> SkillRegistry
  -> SkillDiscovery
  -> SkillUseTool

Tool Layer
  -> toolbox-compatible dynamic activation
  -> tools/*
```

### 运行流程

```text
1. Session 启动
   -> 加载 instruction files
   -> 扫描 skills
   -> 建立 SkillRegistry
   -> 注入 skill listing 到 prompt/attachment

2. 用户发起请求
   -> discovery 基于 query / workspace / active task 找相关 skills
   -> 把高相关 skills 作为 reminder 附给模型

3. 模型决定使用 skill
   -> 调用 skillUseTool(name, args)
   -> runtime 加载完整 SKILL.md
   -> 校验 paths / allowed-tools / invocation mode
   -> 激活相关 tools
   -> 返回 skill 指令正文与约束

4. 模型继续调用普通 tools 完成任务
```

## Skill 与 Instruction 的来源设计

### Skill 来源

建议按这个优先级加载，越靠后优先级越高，同名时以后者覆盖前者：

1. Bundled
   - `packages/ai/runtime/pi/skills/bundled/*/SKILL.md`
2. User-global
   - `~/.chobits/skills/*/SKILL.md`
   - `~/.agents/skills/*/SKILL.md`
   - `~/.claude/skills/*/SKILL.md`
3. Project
   - `.chobits/skills/*/SKILL.md`
   - `.agents/skills/*/SKILL.md`
   - `.claude/skills/*/SKILL.md`
   - 从当前 workspace 向上遍历到 git root
4. Plugin
   - 由插件声明的 skill 目录
5. Synthetic / Compatibility
   - 由旧 `toolbox.md` 动态转换出的临时 skill

### Instruction 来源

建议把 instruction file 作为独立加载器实现，优先级如下：

1. Bundled base instruction
   - 仍由 `profiles.md` 提供
2. User-global instruction
   - `~/.chobits/AGENTS.md`
   - `~/.agents/AGENTS.md`
   - `~/.claude/CLAUDE.md`
3. Project instruction
   - `.chobits/AGENTS.md`
   - `.agents/AGENTS.md`
   - `.claude/CLAUDE.md`
   - `AGENTS.md`
   - `CLAUDE.md`
   - 从当前 workspace 向上遍历到 git root

### 设计取舍

- `profiles.md` 继续负责“你是谁”。
- instruction files 负责“这个项目/用户有哪些长期规则”。
- `SKILL.md` 负责“遇到某类任务应该如何做”。

这能直接借用 Claude Code 对 `CLAUDE.md` 的分层思想，也与 Pi 的 `AGENTS.md` 分层一致。

## Skill 包结构

建议采用下面这个结构：

```text
my-skill/
├── SKILL.md
├── references/
│   ├── api.md
│   └── patterns.md
├── scripts/
│   └── helper.ts
├── assets/
│   └── template.json
└── agents/
    └── openai.yaml
```

其中：

- `SKILL.md`
  - 必需
- `references/`
  - 仅在 skill 明确指示时再读
- `scripts/`
  - 给模型引用或修改，但不自动执行
- `assets/`
  - 输出资源，不进入 prompt
- `agents/openai.yaml`
  - 暂不纳入 v1 runtime 主流程，但保留兼容空间

## `SKILL.md` Frontmatter 契约

### 必需字段

| 字段 | 说明 |
| --- | --- |
| `name` | skill 唯一名，建议遵循 Agent Skills 命名规则 |
| `description` | skill 用途与触发场景说明，必须具体 |

### v1 推荐支持字段

| 字段 | 来源 | 用途 |
| --- | --- | --- |
| `when_to_use` | Claude Code | 提升 skill 匹配和 discovery 质量 |
| `arguments` | Claude Code | 定义 skill 可接受参数 |
| `argument-hint` | Claude Code | 给模型或 UI 显示参数提示 |
| `allowed-tools` | Claude Code | skill 使用时可调用的工具白名单 |
| `user-invocable` | Claude Code | 是否允许用户显式调用 |
| `disable-model-invocation` | Claude Code / Pi | 是否从模型可见列表中隐藏 |
| `paths` | Claude Code | 让 skill 只在匹配路径上下文时生效 |
| `aliases` | Chobits 扩展 | 提升中文/别名搜索召回 |
| `tags` | Chobits 扩展 | 提升 skill 分类与搜索 |
| `activation-tools` | Chobits 扩展 | skill 命中后建议自动激活的 tool ids |

### v2 再支持字段

| 字段 | 来源 | 用途 |
| --- | --- | --- |
| `context` | Claude Code | `inline` / `fork` 执行模式 |
| `agent` | Claude Code | skill 对应的专用 agent 类型 |
| `model` | Claude Code | skill 模型覆盖 |
| `effort` | Claude Code | skill 推理力度覆盖 |
| `hooks` | Claude Code | 高级扩展点，暂不在 v1 实现 |
| `shell` | Claude Code | 暂不在 v1 实现 |

### Chobits 对 `allowed-tools` 和 `activation-tools` 的区分

需要明确区分两个概念：

- `allowed-tools`
  - 权限与约束
  - skill 使用时最多允许哪些 tools
- `activation-tools`
  - 动态注入提示
  - skill 命中后建议先激活哪些 tools

这样既保留 Claude Code 的约束语义，也保留 Chobits 当前动态工具激活的优势。

### 占位符兼容

建议支持这些占位符：

- `${CHOBITS_SKILL_DIR}`
- `${CHOBITS_SESSION_ID}`
- `{baseDir}`

其中 `{baseDir}` 作为 Pi / Agent Skills 兼容写法保留。

## Skill Metadata 与搜索索引

### SkillRecord 建议结构

```ts
type SkillSource = 'bundled' | 'user' | 'project' | 'plugin' | 'synthetic-toolbox';

interface SkillRecord {
  name: string;
  description: string;
  whenToUse?: string;
  argumentNames: string[];
  argumentHint?: string;
  allowedToolIds: string[];
  activationToolIds: string[];
  aliases: string[];
  tags: string[];
  userInvocable: boolean;
  disableModelInvocation: boolean;
  paths?: string[];
  source: SkillSource;
  skillDir: string;
  skillFilePath: string;
  contentHash: string;
}
```

### 搜索策略

v1 不需要引入向量检索，优先用现有 `toolbox.ts` 的搜索经验升级成本地 skill matcher：

- 精确匹配 `name`
- 匹配 `aliases`
- 匹配 `description`
- 匹配 `when_to_use`
- 匹配 `tags`
- 匹配 `activation-tools` 对应 tool 的名称和描述
- 匹配 `paths` 与当前 workspace path
- 结合最近一轮用户 query、最近调用的 tools、当前 profile

现有 `toolbox.ts` 里的中英同义词扩展、CJK tokenization、camelCase 拆分应直接复用到新的 skill search 层。

## 核心模块设计

建议新增目录：

```text
packages/ai/runtime/pi/skills/
├── types.ts
├── frontmatter.ts
├── source-loader.ts
├── instruction-loader.ts
├── registry.ts
├── matcher.ts
├── discovery.ts
├── executor.ts
├── prompt.ts
├── synthetic-toolbox.ts
└── bundled/
```

### 各模块职责

- `types.ts`
  - skill、instruction、search result、execution result 类型
- `frontmatter.ts`
  - 解析和校验 `SKILL.md` frontmatter
- `source-loader.ts`
  - 扫描 bundled / user / project / plugin skill 目录
- `instruction-loader.ts`
  - 加载 `AGENTS.md` / `CLAUDE.md` / `.chobits/AGENTS.md`
- `registry.ts`
  - 建立 skill registry，处理去重、覆盖优先级、缓存
- `matcher.ts`
  - 本地 skill 搜索和排序
- `discovery.ts`
  - turn 级 skill surfacing
- `executor.ts`
  - skill use、参数替换、正文读取、activation plan 生成
- `prompt.ts`
  - 生成 skill listing 和 system prompt 附加段
- `synthetic-toolbox.ts`
  - 把旧 `toolbox.md` 转成 synthetic skills，作为迁移桥

## Tool 设计

### 新增 Tool

建议新增两个核心 tools：

- `skillSearchTool`
  - 只负责 list / search / get metadata
  - 读操作，低风险
- `skillUseTool`
  - 负责加载 skill 正文、解析参数、返回执行约束、激活工具

### `skillSearchTool` 输入输出建议

输入：

- `action`
  - `list`
  - `search`
  - `get`
- `query`
- `limit`

输出：

- 命中的 skills
- 每个 skill 的 metadata
- 当前是否已加载
- 当前是否路径匹配

### `skillUseTool` 输入输出建议

输入：

- `skill`
- `args`
- `mode`
  - `inline`
  - `preview`

输出：

- `skill`
- `resolvedArgs`
- `content`
- `allowedToolIds`
- `activatedToolNames`
- `executionMode`
- `source`
- `pathsMatched`

### 为什么不用一个 `toolboxTool` 继续扩展

如果继续把新系统塞进 `toolboxTool`，会有三个问题：

- 语义混乱，toolbox 和 skill 继续混在一起
- 后续很难做 Claude Code 风格的 `SkillTool` 提示注入
- 用户级 skill、plugin skill、fork skill 等高级能力不好扩展

因此，建议让 `toolboxTool` 进入兼容层，而不是继续做主入口。

## Prompt 与 Attachment 策略

### 基础 Prompt

在 `profiles.md` 的 `assistant` profile 中增加 skill 使用协议，替换当前“先查 toolbox 再激活工具”的文字为：

- 当任务需要步骤化能力、工作流或领域知识时，优先考虑 skill
- 先看已注入的 relevant skills
- 不够时调用 `skillSearchTool`
- 决定使用后调用 `skillUseTool`
- skill 加载后再调用真实 tools

### Initial Skill Listing

借用 Claude Code 的思路，在 session 启动时给模型一个受 token 预算限制的 skill listing：

- 名称
- description
- when_to_use
- user-invocable 标记

列表只注入 metadata，不注入正文。

### Turn-level Discovery

借用 Claude Code 的 attachment / reminder 思路，在每轮根据用户 query 做 skill surfacing：

- 用户输入命中 skill
- 当前 workspace 路径命中 `paths`
- 当前 profile 命中某类 skills
- 最近一次使用的 tool 说明出现工作流切换

对高相关 skills 生成一个 `skill_discovery` 风格的提醒块即可，不需要一开始做太重的系统。

### 为什么需要 Prompt + Tool 双通道

只有 tool 没有 prompt 提醒，模型经常不会主动想到“去搜 skill”。
只有 prompt 没有 tool 执行面，又会退回“skill 只是说明文档”。

因此必须两条都做：

- prompt 负责让模型知道有 skill
- tool 负责真的使用 skill

## Session 状态设计

建议为每个 session 维护一份轻量 skill state：

```ts
interface SkillSessionState {
  loadedSkillNames: Set<string>;
  discoveredSkillNames: Set<string>;
  activeSkillNames: Set<string>;
  activatedToolNames: Set<string>;
  lastDiscoveryAt?: number;
}
```

用途：

- 避免重复注入同一批 skills
- 避免同一个 skill 正文被频繁重复加载
- 跟踪哪些 tools 是因 skill 激活的
- 为后续 UI 展示“本轮使用了哪些 skills”做准备

## 与现有 `toolbox` 的关系

### 迁移原则

`toolbox` 不应成为新系统的长期事实源，但在迁移阶段可以保留三种用途：

1. 作为 synthetic skill 源。
2. 作为 `toolboxTool` 的兼容 fallback。
3. 作为搜索词和 trigger 的历史语料来源。

### 迁移建议

建议把 `toolbox.md` 里的每个章节逐步迁成 bundled skill 目录：

```text
packages/ai/runtime/pi/skills/bundled/
├── subtitle-translate/
│   └── SKILL.md
├── youtube-download/
│   └── SKILL.md
└── memory-recall/
    └── SKILL.md
```

迁移完成后：

- `toolbox.md` 不再是主 authoring surface
- `toolboxTool` 只保留兼容入口
- 搜索能力迁入 `skillSearchTool`

## 与 Pi 原生 Skill System 的关系

### 推荐策略

v1 不直接启用 Pi 原生 skill runtime。

原因：

- 当前 Chobits 已经有自定义的 session 工具注入和动态激活逻辑。
- 直接切回 Pi 原生 skill 加载会削弱对 prompt、registry、discovery 和 compatibility 的可控性。
- Claude Code 风格的 skill discovery、attachment、skill state 在 Pi 原生实现里没有完全对应物。

### 可以借 Pi 的地方

- `SKILL.md` 目录结构
- `baseDir` 占位符
- Agent Skills 名称规范和宽松校验
- 对 `.claude/skills`、`.agents/skills` 的兼容扫描经验

### 可以考虑的后续演进

如果未来希望让 Pi 参与更多底层扫描，可以只复用其 skill path 发现规则，不直接复用其 skill execution/runtime 语义。

## 安全与信任模型

### Skill 的权限边界

skill 本身不拥有执行权限。skill 只会：

- 提供步骤
- 激活 tools
- 约束 tools
- 指向 references / scripts / assets

真正的权限仍由：

- tool schema
- tool 权限模式
- 用户确认机制
- workspace 边界

共同控制。

### 不做的事情

v1 明确不做：

- skill body 内联 shell 自动执行
- 因 skill 来源不同而隐式提升工具权限
- 允许 skill 绕过现有 `file` / `shell` / `ask-user` 的权限约束

### 来源信任级别

建议在 registry 内保留来源标签：

- `bundled`
  - 默认可信
- `user`
  - 默认可信
- `project`
  - 本地项目可信，但应在 UI 可见来源
- `plugin`
  - 需要更明确的来源标识
- `synthetic-toolbox`
  - 仅迁移兼容使用

## UI 与用户显式调用面

### v1 必需

- 模型可通过 `skillSearchTool` / `skillUseTool` 使用 skill
- session 中可显示“当前相关 skills”或“本轮已加载 skills”

### v2 可加

- 输入框支持 `/skill-name`
- skill chips 或 skill picker
- 设置页开关：
  - 是否加载 project skills
  - 是否加载 `.claude/skills`
  - 是否加载 plugin skills

这部分可以借 Claude Code 的“user-invocable skill”概念，但不要求一开始做完整 slash command 生态。

## 实施顺序

### Phase 1：Skill Registry 基础层

目标：

- 新增 `skills/` 目录
- 完成 `frontmatter.ts`、`source-loader.ts`、`registry.ts`
- 完成 bundled / user / project / synthetic-toolbox 扫描
- 此阶段不改 session 主行为

涉及文件：

- `packages/ai/runtime/pi/skills/*`
- `packages/ai/runtime/pi/toolbox.ts`
  - 仅补 synthetic skill 转换桥

### Phase 2：Search / Use Tool

目标：

- 新增 `skillSearchTool`
- 新增 `skillUseTool`
- `toolContext` 加入 `skillRegistry` 和 `skillSessionState`

涉及文件：

- `packages/ai/runtime/pi/tools/skill-search.ts`
- `packages/ai/runtime/pi/tools/skill-use.ts`
- `packages/ai/runtime/pi/tools/index.ts`
- `packages/ai/runtime/pi/tool-registry.ts`
- `packages/ai/runtime/pi/tool-context.ts`

### Phase 3：Prompt 与 Discovery

目标：

- 在 `assistant` profile 注入新的 skill 使用协议
- session 启动时注入 skill listing
- 每轮做轻量 skill discovery

涉及文件：

- `packages/ai/runtime/pi/profiles.md`
- `packages/ai/runtime/pi/session-factory.ts`
- `packages/ai/runtime/pi/session-service.ts`
- `packages/ai/runtime/pi/skills/prompt.ts`
- `packages/ai/runtime/pi/skills/discovery.ts`

### Phase 4：`toolbox` 迁移为 Bundled Skills

目标：

- 把 `toolbox.md` 的核心章节迁到 `skills/bundled/`
- `toolboxTool` 变成兼容入口

涉及文件：

- `packages/ai/runtime/pi/skills/bundled/*`
- `packages/ai/runtime/pi/toolbox.md`
- `packages/ai/runtime/pi/tools/toolbox-lookup.ts`

### Phase 5：Instruction Files 与 Slash Invocation

目标：

- 实现 instruction loader
- 加入 `AGENTS.md` / `CLAUDE.md` 支持
- 补 user-invocable skill 显式调用能力

涉及文件：

- `packages/ai/runtime/pi/skills/instruction-loader.ts`
- `packages/ai/runtime/pi/session-factory.ts`
- Chat 输入层相关调用入口

### Phase 6：高级执行能力

目标：

- `context: fork`
- `model` / `effort` override
- plugin skill 完整支持

涉及文件：

- `packages/ai/runtime/pi/skills/executor.ts`
- 可能新增 sub-agent / fork 相关运行时

## 非目标

当前这次改造不把下面几件事纳入 v1：

- 直接复用 Pi 原生 skill runtime 作为主执行面
- skill marketplace
- skill 远程安装
- skill 向量检索
- skill 自动执行脚本
- 在第一阶段就引入复杂 UI 管理面

## 设计后的目标状态

改造完成后，Chobits 的 skill system 应达到下面的状态：

- `SKILL.md` 是标准能力包格式。
- skill、tool、profile、instruction file 四层职责清晰分离。
- skill 可从 bundled、user、project、plugin 多来源加载。
- 模型能在 prompt 中“知道有这些 skills”，也能通过 tool 真正使用 skill。
- 现有动态工具激活能力被保留，并升级成 skill 驱动。
- `toolbox.md` 退出主 authoring 面，成为迁移兼容层。
- Claude Code 风格的 skill discovery、SkillTool 思路被吸收进 Chobits。
- Pi / Agent Skills 的目录与格式兼容性被保留。

## 建议的首批落地文件

如果按最小闭环启动，第一批建议先创建这些文件：

- `packages/ai/runtime/pi/skills/types.ts`
- `packages/ai/runtime/pi/skills/frontmatter.ts`
- `packages/ai/runtime/pi/skills/source-loader.ts`
- `packages/ai/runtime/pi/skills/registry.ts`
- `packages/ai/runtime/pi/skills/matcher.ts`
- `packages/ai/runtime/pi/skills/synthetic-toolbox.ts`
- `packages/ai/runtime/pi/tools/skill-search.ts`
- `packages/ai/runtime/pi/tools/skill-use.ts`

这批文件完成后，就已经能把 Chobits 从“toolbox 说明书”推进到“真正的 skill runtime”。

