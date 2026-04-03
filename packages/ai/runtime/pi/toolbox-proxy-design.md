# 工具箱动态注册设计（Doraemon Pocket Pattern）

> 动态按需工具注册：Agent 只持有 1 个"万能口袋"工具 + 1 个交互工具，需要什么从口袋里掏出来动态激活。
> 激活后的工具 LLM 直接调用（带完整 schema），不经过代理。

---

## 1. 问题

一次性注入 14+ 个工具定义到 LLM context, 每个 ≈ 200-500 tokens, 总计 ~3000-7000 tokens。

---

## 2. 方案

### 2.1 核心思想

所有工具在 session 创建时注册到 registry，但只有 2 个初始激活（toolboxTool + askUserTool）。
LLM 通过 `toolboxTool(search)` 发现技能后，工具被 **动态激活**（`setActiveToolsByName`），
下一轮 LLM 直接看到并调用真实工具带完整参数 schema。

### 2.2 运行流程

```
用户: "帮我翻译最新的字幕"

第 1 轮: toolboxTool({ action: 'search', query: '翻译字幕' })
  → 返回技能说明 + 自动激活 resourceQueryTool, translationTool
  → hint: "已激活工具，你现在可以直接调用它们了"

第 2 轮: resourceQueryTool({ type: 'subtitle', sortBy: 'newest' })  ← 直接调用，完整 schema
  → 返回资源列表

第 3 轮: translationTool({ resourceId: 'abc', targetLanguage: 'en' })  ← 直接调用
  → 翻译已启动
```

### 2.3 action 定义

| action       | 参数        | 说明                                               |
| ------------ | ----------- | -------------------------------------------------- |
| `list`       | —           | 列出所有可用技能概览 + 当前已激活的工具            |
| `search`     | `query`     | 按意图搜索技能，**自动激活**匹配到的技能涉及的工具 |
| `get`        | `query`     | 按名称精确获取某个技能的完整说明                   |
| `activate`   | `toolNames` | 手动激活指定工具                                   |
| `deactivate` | `toolNames` | 停用指定工具（释放 token 空间）                    |

---

## 3. 技术实现

### 3.1 框架 API

pi-coding-agent 的 `AgentSession` 原生提供:

- `session.setActiveToolsByName(names)` — 动态切换激活的工具，下一轮生效
- `session.getActiveToolNames()` — 获取当前激活的工具名列表
- `session.getAllTools()` — 获取所有已注册的工具

### 3.2 Session 创建

- `customTools`: 注册 ALL 工具到 registry
- `initialActiveToolNames`: 只激活 `['toolboxTool', 'askUserTool']`
- `toolContext.session`: 暴露 session API 给 toolbox 工具

### 3.3 search 自动激活

从 `toolbox.md` 匹配到的技能中提取 `tools` 字段的工具名，自动追加到 active 列表。

---

## 4. 关键设计决策

- **ask-user 始终激活**: 高频 UI 交互工具
- **search 自动激活**: 减少手动步骤
- **deactivate 安全守护**: toolboxTool 和 askUserTool 不可停用
- **coder profile 不受影响**: 全量激活，不走动态模式

---

## 5. Token 开销对比

| 场景           | 原方案 (14 tools) | 动态注册            |
| -------------- | ----------------- | ------------------- |
| "你好"         | ~4000 tokens      | ~600 tokens         |
| "帮我翻译字幕" | ~4000 × 3 轮      | ~600 + ~1200 × 2 轮 |
| 10 轮对话累计  | ~40000 tokens     | ~6000-15000 tokens  |
