# 桌面精灵运行时统一收口方案

> **日期**: 2026-04-08 → 2026-04-24
> **状态**: 主线收口已完成，本轮收尾冻结；剩余项仅作为后续 Backlog 记录

---

## 1. 这份文档解决什么问题

当前桌面精灵系统已经完成了最关键的架构升级：

- 运行时主入口已经集中到主进程 `SpriteManager`
- 渲染层已经变成被动状态消费层
- 动画、行为、移动、人格化、维度系统都已经具备完整能力
- 角色包 lifecycle（扫描/安装/激活/导入/卸载/trust-root 验签）已落地
- Capability runtime authority 已覆盖主要执行入口

本方案记录设计原则、问题模型和长期收口方向，作为后续扩展的准绳。

---

## 2. 核心设计原则

### 2.1 单一运行时权威

`SpriteManager` 是唯一运行时 authority。

- UI 不直接决定状态机
- UI 不直接决定动画分类
- UI 不直接维护 persona 业务模型
- 业务事件统一进主进程，再由 `SpriteManager` 编排

### 2.2 单一领域模型

后续所有扩展都应围绕一份共享 schema 展开，而不是各层自己定义影子类型。

统一的领域模型包括：

- `InteractionIntent` — 交互输入契约
- `SpriteRuntimeState` / `SpriteReactionState` — 状态机语义
- `SpriteAnimationTrigger` — 动画分类语义（与状态机解耦）
- `PersonaSnapshot` — 人格状态 DTO
- `SpriteConfig` — 精灵配置快照（含 `autoWalkEnabled`）
- `SpriteMovementConfig` — 移动策略配置

### 2.3 分层而不是堆功能

5 层结构：

1. **Input Layer** — DOM / renderer collector，只上报 typed intent
2. **Runtime Layer** — `SpriteManager`，编排状态、动画、人格、移动、消息
3. **Domain Model Layer** — 统一 schema / enums / DTO
4. **Asset Layer** — AnimationRegistry / sprite assets / character packs
5. **Presentation Layer** — Assistant UI / Status UI / Settings UI

---

## 3. 重构清单完成状态

| # | 项目 | 状态 |
|---|------|------|
| R1 | Persona 持久化模型收口 | ✅ 已完成 |
| R2 | Persona DTO 单一化 | ✅ 已完成 |
| R3 | 统一交互输入与事件契约 | ✅ 已完成 |
| R4 | 分离 Runtime State 与 Animation Trigger | ✅ 已完成（`SpriteReactionState` + `trigger()` 解耦） |
| R5 | 统一动画元数据模型 | ✅ 已完成（`primaryTrigger + triggerAliases + priority + condition`） |
| R6 | 收口配置所有权 | ✅ 已完成（auto-walk legacy bridge 已全部移除） |
| R7 | 交互统计改单源 | ✅ 已完成（EventBus 单源） |
| R8 | 抽离 MovementCoordinator | ✅ 第一阶段已完成 |
| R9 | Persona 规则配置化 | ✅ 已完成（`PersonaRulesProvider` / `PersonaRulesLayer` / `character-runtime`） |
| R10 | Capability Runtime | ✅ 主线已完成 |

### 角色包 Lifecycle（R9/R10 之间）

✅ 已完成：
- `pack.json` manifest 解析与 `assets.animations` 驱动
- 按角色 slot 的 persona 持久化与切换存档
- `CharacterPackManager`：builtin/installed pack 扫描、active pack 持久化、archive 导入
- Installability assessment（`formatVersion` / `minAppVersion` → `blockingErrors + compatibility`）
- Import preview 稳定 cache（含 `preview.video`）
- Provenance / signature trust assessment（builtin-bundled / digest-verified / signature-verified / signature-untrusted）
- Archive/path 安全预检（symlink / traversal / size limits）
- Trust-root 公钥签名验签（受信 key 通过 → verified，不通过 → blocking error，未知 key → warning）

### 兼容层清理（Batch 7）

✅ 已完成：
- Legacy `window.YUA.window.*` auto-walk bridge 已移除
- `packages/sprite-core/index.ts` 已停止导出 `trigger-mapping` / `triggerSpriteAnimation`
- `packages/sprite-core/config/trigger-mapping.ts` / `helper/trigger-animation.ts` 已删除，旧场景映射 helper 彻底退出仓库主链
- `listByEvent()` / `findByEvent()` / `sprite:listByEvent` 已删除，公开查询入口统一为 trigger 命名
- `persona:state-changed` 旧通道已停止兼容
- Renderer authoring 不再写 `eventType`；主进程 normalize 输出也已停止持久化兼容镜像，仅保留旧输入 fallback
- `sprite:trigger` 旧 `eventType` 请求字段已停止兼容，仅接受 `trigger`
- `SpriteSubState` 降为 `SpriteReactionState` 兼容别名
- 公开 IPC / preload 命名已优先收口到 `trigger`（`listByTrigger()` / `findByTrigger()`）

---

## 4. 剩余工作

> **2026-04-24 收尾结论**：本轮不再继续修改 sprite runtime 主线。当前代码已经形成可用闭环：运行时 authority、角色包 lifecycle、capability guard、精灵管理设置页 UI、AI 自发说话与 persona reward entry 均已落地。以下内容保留为后续 backlog，等待明确产品入口、兼容下线窗口或发布流程需求后再单独开启。

### 2026-04-23 阶段总结

- 兼容层继续收口：`sprite:trigger` 的 `eventType` 请求字段兼容已移除，规范请求路径已经统一到 `trigger`；动画 metadata normalize 输出也已停止持久化 `eventType` 镜像。
- trust-root 校验补强：character pack trust-root 现在已支持 revoked key 判定，撤销 key 会在导入期被标记并阻断安装。
- `WindowController` 边界继续下沉：纯计算层、平台访问、拖拽会话、行走会话、自动移动会话均已独立，顶层控制器当前主要只剩 timer / scheduler glue 与少量回调编排。
- 2026-05-04 补充：动画资源 authoring 写入口（`sprite:register` / `sprite:registerFromData` / `sprite:updateMeta` / `sprite:remove`）已改为接入基础 `spriteManage` capability guard。预设角色资源本体仍只读，但角色加载后允许通过用户覆盖层添加和编辑用户自己的精灵视频动画。
- 2026-05-04 补充：精灵管理设置页已消费 `spriteManage` capability 状态，未解锁时前端会禁用导入 / 添加 / 删除 / metadata 编辑入口并展示 locked notice，与主进程 guard 形成闭环。
- 2026-04-24 补充：渲染层 persona mutation 已新增统一 `sprite:persona:grantReward` 入口，preload 的 `addXP()` / `changeFavor()` / `unlockAchievement()` 默认转发到 reward entry；旧 IPC 通道仅作为兼容 wrapper 保留。
- 2026-04-24 补充：`emotionExpression` 已消费到闲置情感自发表达（`idle-emotion`），未解锁时不会由默认行为自动触发表情动画；显式 `trigger()` 与测试播放仍保持可用。
- 当前主线判断：`sprite runtime` 已进一步逼近 `freeze-safe`，后续更像 backlog 尾项清理，而不是新的架构重做。
- 下一阶段优先建议：主线可以收尾冻结；后续仅在有明确产品入口时再补 `customAppearance` 的细分消费，同时评估 legacy persona mutation IPC 下线窗口，并推进 trust-root publisher key rotation / 发布流程。

### 高优先级

- 更多 pack/character flags 的默认 capability 定义消费（动画资源 authoring 写入口与设置页 UI 已改由基础 `spriteManage` 保护，`actionChoreography` 继续保留为更高级动作编排能力，`emotionExpression` 已覆盖 idle emotion 默认行为；`customAppearance` 及更细分 UI/运行时分支待补）
- 少量旧 metadata 输入 fallback 继续收口（如 `eventType` legacy 输入）

### 中优先级

- Trust-root publisher key rotation 与发布流程（revocation 已落地）
- `WindowController` 顶层 orchestration 继续收口（路径采样 / 边界约束 / 自动移动步进已下沉；拖拽 / 行走 / 自动移动会话与平台访问也已拆出，当前主要只剩 timer / scheduler glue）
- 条件 builder 对 `in/notIn` 等少量 operator 的专门 UI

### 低优先级 / Follow-up

- 高阶 timed media / preview bridge 场景补强
- `sprite:persona:addXP` / `changeFavor` 等 legacy mutation IPC 下线评估（当前已是统一 reward entry 的兼容 wrapper）
- 更丰富的角色包 preview 展示策略（poster / hover 细节）

---

## 5. 文档同步要求

后续每个改动批次都要同步更新下列文档，避免"代码收口了，文档还停在旧状态"：

- `docs/sprite-core/README.md` — 架构、API、IPC 协议
- `CLAUDE.md` — 如涉及新 IPC 域 / 数据库表 / 设计原则
- 相关模块 README — 如涉及 AI / 工作流 / 插件等

---

## 6. 结论

本轮不引入新的运行时设计，而是确认以下判断：

- 现有架构方向正确
- 统一运行时已经存在
- 真正的问题是边界不够收口
- 接下来的工作重点不是"推倒重来"，而是"把单一模型和单一入口做实"
