# 桌面精灵运行时统一收口方案

> **日期**: 2026-04-08
> **状态**: Review 完成，进入收口重构规划
> **范围**: `packages/sprite-core`、`src/features/sprite-assistant`、`electron/preload`、`docs`
>
> **进度**:
>
> - 2026-04-08 已完成 `R1`：补齐 `PersonaState.dimensions` 持久化、旧快照兼容读取、持久化快照版本字段
> - 2026-04-08 已完成 `R2`：导出共享 `PersonaSnapshot`、移除 `SpriteStateSnapshot` / `SpriteInitialState` 中的 `any`、状态页切换到共享 Persona DTO
> - 2026-04-08 已完成 `R3`：统一 `sprite:interact` typed intent、补齐 hover/file-drag 语义、交互统计改为 EventBus 单源
> - 当前下一步重点：`R4 Runtime State 与 Animation Trigger 分离`
> - 2026-04-20 已新增配套执行单：[sprite-refactor-execution-roadmap.md](./sprite-refactor-execution-roadmap.md)

> **执行说明**:
>
> 本文档继续负责“原则、问题模型、长期收口方向”；具体到批次拆分、文件范围、验收标准与后续回填，请同步维护 [sprite-refactor-execution-roadmap.md](./sprite-refactor-execution-roadmap.md)。

---

## 1. 这份文档解决什么问题

当前桌面精灵系统已经完成了最关键的架构升级：

- 运行时主入口已经集中到主进程 `SpriteManager`
- 渲染层大体已经变成被动状态消费层
- 动画、行为、移动、人格化、维度系统都已经具备基础能力

现在的问题不再是“缺功能”，而是“统一模型还没有完全收口”。

这会直接影响后续扩展：

- 新增一种交互或动画时，要同时改多处字符串和类型
- Persona / Status UI / 持久化三者不是完全同一份模型
- movement / auto walk 配置仍然存在兼容层双轨入口
- 文档里有些内容描述的是目标状态，但代码还没有完全闭环

本方案的目标是把现有实现整理成一套可持续扩展的桌面精灵运行时规范。

---

## 2. 当前架构判断

### 2.1 已经做对的部分

- `SpriteManager` 已经是运行时唯一门面，负责：
  - EventBus
  - StateMachine
  - PersonaStateManager
  - InteractionTracker
  - BehaviorEngine
  - AnimationRegistry
  - WindowController
  - 持久化与配置
- 渲染层 `src/features/sprite-assistant` 已经主要负责：
  - 拉取初始状态
  - 订阅 `sprite:*` IPC
  - 采集交互并上报主进程
- Persona 系统已经具备：
  - XP / level
  - favor / favorLevel
  - mood / moodIntensity
  - achievements
  - dimensions
- 动画系统已经具备：
  - 事件分类
  - 条件动画
  - movement metadata
  - intro / loop / outro 三段式播放

### 2.2 当前真正的缺口

- 事件契约没有单一真源
- Persona 快照没有彻底统一
- runtime state 和 animation trigger 还混在一起
- movement 配置入口仍然存在双轨
- 交互统计有重复记账路径
- 文档部分内容早于代码收口状态

---

## 3. 核心设计原则

### 3.1 单一运行时权威

`SpriteManager` 是唯一运行时 authority。

- UI 不直接决定状态机
- UI 不直接决定动画分类
- UI 不直接维护 persona 业务模型
- 业务事件统一进主进程，再由 `SpriteManager` 编排

### 3.2 单一领域模型

后续所有扩展都应围绕一份共享 schema 展开，而不是各层自己定义影子类型。

建议统一的领域模型包括：

- `InteractionIntent`
- `SpriteRuntimeState`
- `SpriteReactionState`
- `SpriteAnimationTrigger`
- `PersonaSnapshot`
- `SpriteConfig`
- `SpriteMovementConfig`

### 3.3 分层而不是堆功能

推荐长期保持 5 层结构：

1. `Input Layer`
   - DOM / renderer collector
   - 只上报 typed intent
2. `Runtime Layer`
   - `SpriteManager`
   - 编排状态、动画、人格、移动、消息
3. `Domain Model Layer`
   - 统一 schema / enums / DTO
4. `Asset Layer`
   - AnimationRegistry / trigger mapping / sprite assets
5. `Presentation Layer`
   - Assistant UI / Status UI / Settings UI

---

## 4. 当前 Review 结论

### P1

1. `R1` 已完成：`dimensions` 已纳入 persona 持久化快照，并兼容历史 JSON 格式。
2. `R2` / `R3` 已完成：Persona DTO 已统一，`sprite:interact` 与 EventBus 交互契约已收口到单一 typed contract。
3. `SpriteSubState` 与实际动画 trigger 不一致，`thinking` 等事件被错误地挤进 runtime reaction 语义。

### P2

1. auto-walk 配置虽然已经在主运行时收口，但设置页仍然依赖兼容层 API。
2. 交互统计已改为 EventBus 单源，但 XP / favor / mood 的规则归属仍待继续配置化。
3. 文档中仍有少量“目标态”描述，需要继续随着 R4-R6 同步收口。

### P3

1. preload / renderer 边界还有少量类型泄漏和 cleanup 签名问题。
2. 文档对“已完成”的表述比当前代码状态更乐观，容易误导后续开发。

---

## 5. 精确重构清单

以下清单按推荐实施顺序排列。每一项都应作为可单独提交的改动单元。

### R1. Persona 持久化模型收口

**状态**

- 已完成（2026-04-08）

**目标**

- 让 `PersonaState` 的实际运行时字段完整进入持久化闭环
- 兼容历史 JSON 格式

**涉及文件**

- `packages/sprite-core/manager/types.ts`
- `packages/sprite-core/manager/persistence.ts`
- `packages/sprite-core/manager/sprite-manager.ts`
- 可选：`packages/sprite-core/persona-state.ts`

**动作**

- 将 `PersonaStatePersistenceRow` 改为真正的 JSON snapshot 结构
- 补齐 `dimensions`
- 视情况将 `achievements` 从字符串 JSON 改为数组
- `load()` 增加旧格式兼容分支
- 明确 dirty/save 的触发边界

**完成标准**

- 重启后 `xp`、`level`、`favor`、`mood`、`achievements`、`dimensions` 可正确恢复

### R2. Persona DTO 单一化

**状态**

- 已完成（2026-04-08）

**目标**

- 消灭 renderer/UI 侧 shadow type
- 让 persona 展示层只消费共享 DTO

**涉及文件**

- `packages/sprite-core/persona-state.ts`
- `packages/sprite-core/types.ts`
- `electron/preload/apis/persona.ts`
- `src/features/sprite-assistant/context/SpriteStateContext.tsx`
- `src/features/sprite-assistant/pages/StatusPage.tsx`
- `src/features/sprite-assistant/ui/PersonaStatusPanel.tsx`

**动作**

- 在共享层导出 `PersonaSnapshot`
- `SpriteStateSnapshot.personaSnapshot`、`SpriteInitialState.personaState` 去掉 `any`
- UI 统一使用 `favor` / `favorLevel` / `mood` / `moodIntensity`

**完成标准**

- 状态页与主运行时字段一一对应
- 不再出现 `affection`、数字型 `mood` 这类旧字段

### R3. 统一交互输入与事件契约

**状态**

- 已完成（2026-04-08）

**目标**

- 让“交互 → EventBus → Persona / Animation / Stats”共享同一套 typed contract

**涉及文件**

- `packages/sprite-core/event-bus.ts`
- `packages/sprite-core/interaction-tracker.ts`
- `packages/sprite-core/preload/sprite-bridge.ts`
- `packages/sprite-core/handler/sprite-manager-ipc.ts`
- `packages/sprite-core/manager/sprite-manager.ts`
- `src/features/sprite-assistant/AIAssistant.tsx`
- `src/features/sprite-assistant/hooks/useFileDropCollector.ts`

**动作**

- 定义统一的 `InteractionIntent`
- `window.YUA.sprite.interact()` 从 `string` 收紧为 typed union
- 补齐 `interact:file-drag-leave`
- 统一 hover 语义，避免 `hover-enter` / `hover-leave` 与 runtime 类型错位
- 让 `SpriteManager.reportInteraction()` 只负责归一化并发出 EventBus 事件
- 让 `InteractionTracker` 仅从 EventBus 记账，移除重复统计路径
- 补齐 renderer 侧遗漏的 `double-click` / `context-menu` 上报

**完成标准**

- 交互类型不能再以任意字符串形式穿透 preload
- EventBus 不再依赖 `as any`

### R4. 分离 Runtime State 与 Animation Trigger

**目标**

- 让 runtime state 表示“状态机语义”
- 让 animation trigger 表示“动画分类语义”

**涉及文件**

- `packages/sprite-core/state-machine.ts`
- `packages/sprite-core/manager/state-mapping.ts`
- `packages/sprite-core/manager/sprite-manager.ts`
- `packages/sprite-core/handler/sprite-event-listener.ts`
- `packages/sprite-core/manager/default-behaviors.ts`
- `packages/sprite-core/types.ts`

**动作**

- 保留 `SpriteSubState` 仅表示真正的 reacting 子状态
- `thinking`、`happy`、`surprised`、`celebrate` 这类动画/情绪类事件统一走 `trigger()`
- 不再为了动画分类去扩张状态机 union

**完成标准**

- 新增动画 trigger 时不需要修改状态机定义
- `playOnce()` 仅用于 runtime reaction

### R5. 统一动画元数据模型

**目标**

- 让资源层、运行时、编辑器使用同一套 trigger 元数据

**涉及文件**

- `packages/sprite-core/animation-registry.ts`
- `packages/sprite-core/types.ts`
- `packages/sprite-core/manager/sprite-manager.ts`
- `packages/sprite-core/handler/sprite-assets.ts`
- `src/pages/ExtensionSettings/SpriteVideoEditor.tsx`

**动作**

- 统一 `meta.eventType` 与 `AnimationEntry.eventTypes`
- 推荐改为 `triggers[]` 或 `primaryTrigger + aliases`
- 明确 stable state / reaction / emotion / action / ambient 的分类语义

**完成标准**

- 动画编辑器保存的元数据可直接作为运行时 trigger 输入

### R6. 收口配置所有权

**目标**

- 让所有 sprite 配置统一归属 `window.YUA.sprite.*`

**涉及文件**

- `packages/sprite-core/handler/sprite-manager-ipc.ts`
- `packages/sprite-core/preload/sprite-bridge.ts`
- `src/pages/ExtensionSettings/MovementSettings.tsx`
- `src/pages/ExtensionSettings/SkillTreeSettings/index.tsx`
- `electron/preload/apis/window.ts`
- `electron/main/handlers/window.ts`

**动作**

- 设置页统一切到 `getAutoWalk()` / `setAutoWalk()`
- 配置状态变化优先走 `sprite:config`
- `window.*` 旧接口降级为兼容层

**完成标准**

- 业务页面不再依赖 `window.YUA.window.getAutoWalkEnabled()`

### R7. 交互统计改单源

**状态**

- 部分前置完成：EventBus 单源记账已在 `R3` 一并落地

**目标**

- 避免重复记账与语义偏差

**涉及文件**

- `packages/sprite-core/interaction-tracker.ts`
- `packages/sprite-core/manager/sprite-manager.ts`
- `packages/sprite-core/persona-state.ts`

**动作**

- 选定 EventBus 为唯一交互真源
- `reportInteraction()` 只负责归一化和发事件
- `InteractionTracker` 正确区分 `hover` / `file-drag-over` / `file-drag-leave` / `file-drop`

**完成标准**

- 一次交互只计一次
- stats / XP / favor 的来源一致

### R8. 抽离 MovementCoordinator

**目标**

- 把 movement 策略从门面类拆出来

**涉及文件**

- `packages/sprite-core/manager/sprite-manager.ts`
- `packages/sprite-core/window-controller.ts`
- `packages/sprite-core/types.ts`
- `src/pages/ExtensionSettings/SpriteVideoEditor.tsx`

**动作**

- 抽出 movement policy / coordinator
- 将 `previewMovement()`、animation movement、auto-walk schedule 的策略统一封装

**完成标准**

- 新增一种 movement mode 不需要改 `SpriteManager` 多段分支

### R9. Persona 规则配置化

**目标**

- 让 XP / favor / mood 规则从类实现中解耦

**涉及文件**

- `packages/sprite-core/persona-state.ts`
- 建议新增 `packages/sprite-core/config/persona-rules.ts`
- 可选：`packages/sprite-core/character-service.ts`

**动作**

- 将 `DEFAULT_XP_SOURCES`
- `DEFAULT_FAVOR_MODIFIERS`
- `DEFAULT_MOOD_RULES`
  抽到配置层
- 让角色包或 future extension 具备注入能力

**完成标准**

- 以后改奖励规则主要改配置，不改状态管理类

### R10. Sprite 专项回归测试

**目标**

- 给运行时收口建立最小回归网

**建议新增文件**

- `test/sprite-persistence.spec.ts`
- `test/sprite-interaction.spec.ts`
- `test/sprite-config.spec.ts`

**建议覆盖**

- persona round-trip 持久化
- interaction → XP / favor 链路
- `trigger()` vs `playOnce()` 行为边界
- auto-walk config 链路

---

## 6. 推荐实施顺序

### 第一轮：先修模型正确性

1. R1 持久化模型收口
2. R2 Persona DTO 单一化
3. R3 交互输入与事件契约统一
4. R4 Runtime State 与 Animation Trigger 解耦

### 第二轮：收口运行时边界

5. R5 动画元数据统一
6. R6 配置所有权统一
7. R7 交互统计改单源

### 第三轮：抽出长期扩展点

8. R8 抽离 MovementCoordinator
9. R9 Persona 规则配置化
10. R10 Sprite 专项测试

---

## 7. 文档同步要求

后续每个改动批次都要同步更新下列文档，避免“代码收口了，文档还停在旧状态”。

### 必改文档

- `docs/sprite-core/README.md`
  - 更新当前架构说明
  - 更新事件/状态/配置 API 说明
  - 标注兼容层和 known gaps
- `docs/sprite-core/sprite-event-coverage.md`
  - 区分“事件覆盖率”和“运行时契约完整度”
  - 避免把覆盖率写成等于完全收口
- `docs/persona-system/persona-character-system-design.md`
  - 标注 dimensions 持久化与事件契约的实际实现状态
  - 避免文档宣称已闭环而代码尚未完成

### 随改动同步的文档项

- 做 R1 时，同步更新 persona 持久化说明
- 做 R2 时，同步更新 persona DTO / 状态页字段说明
- 做 R3 时，同步更新 `sprite:interact` 与 EventBus 事件枚举
- 做 R4-R5 时，同步更新 state / trigger / animation metadata 说明
- 做 R6 时，同步更新 preload API 和设置页说明

---

## 8. 当前这轮文档修订的结论

本轮不引入新的运行时设计，而是确认以下判断：

- 现有架构方向正确
- 统一运行时已经存在
- 真正的问题是边界不够收口
- 接下来的工作重点不是“推倒重来”，而是“把单一模型和单一入口做实”

这也是后续代码实现的唯一准绳。
