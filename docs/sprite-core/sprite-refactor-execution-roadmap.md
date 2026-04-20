# 桌面精灵重构执行路线图

> **日期**: 2026-04-20
> **状态**: Draft，作为后续实现与文档回填的统一执行单
> **范围**: `packages/sprite-core`、`src/features/sprite-assistant`、`src/pages/ExtensionSettings`、`electron/preload`、`electron/main`、`resources/sprites`、`docs`
> **关联文档**:
> - [sprite-runtime-unification-plan.md](./sprite-runtime-unification-plan.md)
> - [README.md](./README.md)

---

## 1. 这份文档怎么用

这份文档不是一次性的“方案说明”，而是后续桌面精灵重构的持续执行单。

推荐把它作为以下事项的统一记录点：

- 每一批重构的目标、边界、验收标准
- 每一批涉及的文件和模块所有权
- 已发现问题与对应批次的映射关系
- 每次落地后的完成状态、风险、文档同步结果

后续每次开始一个批次时，都应先更新本文件的状态，再开始改代码；每次完成一个批次时，也应回填验收结果和残余风险。

---

## 2. 当前问题总览

当前桌面精灵系统的主要问题不是“缺功能”，而是“功能已经不少，但 authority 还没有完全收口”。

### 2.1 当前已确认的高优先级问题

- `trigger()` 查动画时没有传入 `personaState`，条件动画分支会失效
- 自动行走行为在动画加载前注册，`walk.behaviorSchedule` 不会真正进入调度参数
- `behavior + direction` 组合没有消费 `movement.direction`
- `trigger()` 直接播放三段式动画时，没有真正进入渲染层 phase 状态机
- `file-drag-over -> file-drop` 链路会吞掉 `file-drop` 反应动画
- `previewMovement()` 会污染 live 的尺寸与 padding 状态

### 2.2 当前已确认的结构性问题

- runtime state、reaction state、animation trigger 还没有彻底拆开
- 动画资源层仍然是单 `eventType`，但运行时注册表已经支持更丰富的选择模型
- XP / favor / mood / dimensions / activity reward 的规则所有权分散
- 自动移动设置仍存在 `window.*` 与 `sprite.*` 双轨入口
- 技能树 / 等级解锁主要还是 UI 侧推导，不是 runtime capability
- sprite 缺少专项回归测试，很多行为边界没有自动保护

---

## 3. 重构总原则

### 3.1 单一 authority

- `SpriteManager` 是运行时编排 authority
- `AnimationRegistry` 是动画匹配 authority
- `MovementCoordinator` 是移动策略 authority
- `PersonaRules` 是奖励与成长结算 authority
- `CapabilityRegistry` 是等级解锁与功能授权 authority

### 3.2 UI 只负责展示和采集

- UI 不决定状态机
- UI 不决定动画分类
- UI 不直接写 XP / favor / reward
- UI 不自己推导最终“已解锁能力”

### 3.3 先修正确性，再做优雅化

执行顺序固定为：

1. 先补回归网
2. 再修 P1 正确性问题
3. 再拆模型
4. 再统一配置和扩展点
5. 最后清理兼容层

---

## 4. 批次总览

| 批次 | 名称 | 目标 | 状态 |
| --- | --- | --- | --- |
| Batch 0 | Guard Rails | 建立 sprite 专项回归网 | Not Started |
| Batch 1 | Correctness Fixes | 修复已确认的 P1/P2 行为错误 | Not Started |
| Batch 2 | State / Trigger Split | 分离 Runtime State、Reaction、Animation Trigger | Not Started |
| Batch 3 | Animation Metadata Unification | 统一动画资源、注册表、编辑器元数据模型 | Not Started |
| Batch 4 | Movement Ownership | 收口移动策略与配置入口 | Not Started |
| Batch 5 | Persona Rules Unification | 收口 XP / favor / mood / dimensions / reward 规则 | Not Started |
| Batch 6 | Capability Runtime | 将等级解锁 / 技能树变为 runtime capability | Not Started |
| Batch 7 | Compatibility Cleanup | 清理兼容 API、旧 helper、旧文档表述 | Not Started |

---

## 5. Batch 0: Guard Rails

### 5.1 目标

在大改模型之前，先给桌面精灵建立最小专项回归网，避免重构期间“修一处坏一片”。

### 5.2 主要涉及文件

- `test/`
- `packages/sprite-core/manager/sprite-manager.ts`
- `packages/sprite-core/manager/default-behaviors.ts`
- `packages/sprite-core/persona-state.ts`
- `packages/sprite-core/handler/sprite-manager-ipc.ts`
- `src/features/sprite-assistant/renderers/VideoSprite.tsx`

### 5.3 实施项

- 新增 `sprite-trigger.spec.ts`
  - 覆盖 `trigger()` 条件动画选择
  - 覆盖 `trigger()` 与 `playOnce()` 的边界
- 新增 `sprite-movement.spec.ts`
  - 覆盖 `walk.behaviorSchedule`
  - 覆盖 `behavior + direction`
  - 覆盖 `previewMovement()` 恢复 live config
- 新增 `sprite-persona-bridge.spec.ts`
  - 覆盖 `persona:daily-login`
  - 覆盖 `persona:achievement-unlocked`
  - 覆盖 preload / main 转发一致性
- 新增 `sprite-reaction.spec.ts`
  - 覆盖 `file-drag-over -> file-drop`
  - 覆盖三段式动画完成后的 idle 回退

### 5.4 验收标准

- 当前已知 6 个核心问题都能被测试稳定复现
- 后续修复这些问题时，测试能从 fail 变为 pass
- sprite 相关行为不再完全依赖人工点点看

### 5.5 文档同步

- 在本文件中把 `Batch 0` 状态改为 `In Progress / Done`
- 在 [sprite-runtime-unification-plan.md](./sprite-runtime-unification-plan.md) 中补充测试覆盖状态

---

## 6. Batch 1: Correctness Fixes

### 6.1 目标

先修已经明确会导致运行时行为错误的高优先级问题，不在这一批引入大规模模型重构。

### 6.2 主要涉及文件

- `packages/sprite-core/manager/sprite-manager.ts`
- `packages/sprite-core/manager/default-behaviors.ts`
- `packages/sprite-core/manager/state-mapping.ts`
- `packages/sprite-core/handler/sprite-manager-ipc.ts`
- `src/features/sprite-assistant/renderers/VideoSprite.tsx`

### 6.3 子任务清单

#### T1. 让 `trigger()` 正确参与条件动画选择

- 在 `SpriteManager.trigger()` 调用 `AnimationRegistry.findByEvent()` 时传入 `personaState`
- 补齐与 `findAnimationByEvent()` 的行为一致性
- 确认 `triggerById()` 不受影响

**完成标准**

- 条件动画的 `condition(personaState)` 会在统一 trigger 入口生效
- 不同好感度 / 心情 / 等级能命中不同动画

#### T2. 修复 auto-walk 启动顺序

- 避免在动画尚未加载时就冻结默认行为的调度参数
- 两种可选实现方向：
  - 将默认行为注册延后到动画加载之后
  - 或让 auto-walk 行为的调度参数支持在动画注册后重新同步
- 保证 `behaviorSchedule`、`probability`、`minIdleMs` 不再丢失

**完成标准**

- `resources/sprites/index.json` 中 `walk.movement.behaviorSchedule` 在首次启动就生效

#### T3. 修复 `behavior + direction` 的方向丢失

- `default-behaviors.ts` 中 `mode='direction'` 不应再回落为随机 `walkTo`
- 明确 behavior 触发下的 direction 策略：
  - 要么真正调用方向移动
  - 要么在 schema 上显式禁止该组合
- 设置页与运行时语义必须一致

**完成标准**

- `movement.direction` 在 behavior 模式下不会被静默忽略

#### T4. 修复 `file-drop` 反应被吞掉

- 调整 `reportInteraction()` 中 `file-drag-over` 退出逻辑
- 允许 `file-drop` 在正常拖放流程中进入 drop reaction
- 保证回到 idle 的时机仍然明确

**完成标准**

- `fileDragOver -> fileDrop` 能正常播出 drop 动画

#### T5. 修复 preview 污染 live config

- `previewMovement()` 需要保存 preview 前的 live config 快照
- `stopMovementPreview()` 需要恢复尺寸、padding、必要的 walk 状态
- 临时预览状态不能长期残留在 `spriteConfig`

**完成标准**

- 停止预览后，精灵尺寸与布局恢复到 preview 前状态

#### T6. 临时补齐三段式 trigger 播放边界

- 在 Batch 2 完整模型拆分前，先用最小改动避免三段式 trigger 卡死
- 可以考虑在播放命令中携带独立的“活跃播放态”，不要继续完全依赖 `spriteState !== 'idle'`

**完成标准**

- `trigger()` 直接触发的三段式动画可以正常走完 intro / loop / outro

### 6.4 本批风险

- 这一批容易诱发“局部修补过多，后续 Batch 2 还要再拆一次”
- 因此只做 correctness fix，不扩展抽象层数量

### 6.5 文档同步

- 在本文件回填每个子任务的完成状态
- 在 [sprite-runtime-unification-plan.md](./sprite-runtime-unification-plan.md) 标记哪些问题已经从“known gap”变成“已修复”

---

## 7. Batch 2: State / Trigger Split

### 7.1 目标

把 `Runtime State`、`Reaction State`、`Animation Trigger` 三层语义拆开，消除状态机被动画分类反向污染的问题。

### 7.2 主要涉及文件

- `packages/sprite-core/state-machine.ts`
- `packages/sprite-core/manager/state-mapping.ts`
- `packages/sprite-core/manager/sprite-manager.ts`
- `packages/sprite-core/types.ts`
- `packages/sprite-core/handler/sprite-event-listener.ts`
- `src/features/sprite-assistant/renderers/VideoSprite.tsx`

### 7.3 实施项

- 收紧 `SpriteSubState`，仅保留真实 reaction
- 引入显式的 `SpriteAnimationTrigger`
- `playOnce()` 仅服务于 reaction
- `trigger()` 仅服务于动画分类与消息
- `VideoSprite` phase 驱动改由播放命令或播放会话信息决定，不再拿 runtime idle/walking 代替
- 消除 `emotion -> happy` 这类语义压扁

### 7.4 验收标准

- 新增动画 trigger 时，不需要扩张状态机 union
- `thinking` / `error-react` / `annoyed` 这类触发不再依赖状态机补丁
- `reacting` 不再承担“兜底业务语义容器”的职责

### 7.5 文档同步

- 更新 [sprite-runtime-unification-plan.md](./sprite-runtime-unification-plan.md) 中 `R4`
- 更新 [README.md](./README.md) 中状态机与 trigger 说明

---

## 8. Batch 3: Animation Metadata Unification

### 8.1 目标

让资源文件、运行时注册表、编辑器使用同一套动画元数据。

### 8.2 主要涉及文件

- `packages/sprite-core/types.ts`
- `packages/sprite-core/animation-registry.ts`
- `packages/sprite-core/manager/sprite-manager.ts`
- `packages/sprite-core/handler/sprite-assets.ts`
- `src/pages/ExtensionSettings/SpriteVideoEditor.tsx`
- `resources/sprites/index.json`

### 8.3 实施项

- 将单 `meta.eventType` 升级为以下其一：
  - `triggers[]`
  - `primaryTrigger + aliases`
- 支持 `priority`
- 支持 persona / mood / favor / capability 条件
- 旧资源兼容读取，新资源写入新结构
- 编辑器改为直接编辑统一元数据

### 8.4 验收标准

- 编辑器输出的元数据能直接作为运行时 `AnimationEntry`
- 条件动画、别名触发、优先级 fallback 都不需要额外补丁

---

## 9. Batch 4: Movement Ownership

### 9.1 目标

收口移动逻辑和配置入口，避免 `SpriteManager`、`WindowController`、设置页、动画元数据之间重复持有策略。

### 9.2 主要涉及文件

- `packages/sprite-core/manager/sprite-manager.ts`
- `packages/sprite-core/window-controller.ts`
- `packages/sprite-core/preload/sprite-bridge.ts`
- `packages/sprite-core/handler/sprite-manager-ipc.ts`
- `src/pages/ExtensionSettings/MovementSettings.tsx`
- `src/pages/ExtensionSettings/SkillTreeSettings/index.tsx`
- `electron/main/handlers/window.ts`

### 9.3 实施项

- 抽出 `MovementCoordinator`
- 统一 `walkTo`、direction move、preview、auto-walk schedule
- 设置页全面切到 `window.YUA.sprite.*`
- `window.YUA.window.getAutoWalkEnabled()` 降级为兼容层
- movement preview 明确为临时会话，不再污染 live state

### 9.4 验收标准

- 新增一种 movement mode 时，不需要修改多个散落分支
- 设置页不再直接依赖旧 `window.*` auto-walk API

---

## 10. Batch 5: Persona Rules Unification

### 10.1 目标

把成长系统的规则定义与状态更新分离，让 XP / favor / mood / dimensions / reward 有唯一入口。

### 10.2 主要涉及文件

- `packages/sprite-core/persona-state.ts`
- `packages/sprite-core/character-service.ts`
- `packages/sprite-core/handler/sprite-event-listener.ts`
- `resources/sprites/character.json`
- 建议新增 `packages/sprite-core/config/persona-rules.ts`

### 10.3 实施项

- 把默认 XP / favor / mood 规则从 `PersonaStateManager` 中抽离
- 将 conversation reward / activity reward / dimension growth 纳入统一 registry
- 让业务事件只表达“奖励意图”，不直接写状态
- 补齐 `persona:daily-login`、`persona:achievement-unlocked` 的桥接与 payload 一致性

### 10.4 验收标准

- 修改奖励规则主要改配置，不改状态管理类
- main / preload / renderer 对同一 persona 事件的 payload 理解一致

---

## 11. Batch 6: Capability Runtime

### 11.1 目标

让技能树、等级解锁、功能授权从 UI 侧推导变为 runtime capability 模型。

### 11.2 主要涉及文件

- `src/features/sprite-assistant/config/levelUnlocks.ts`
- `src/pages/ExtensionSettings/SkillTreeSettings/*`
- `packages/sprite-core/persona-state.ts`
- `packages/sprite-core/types.ts`
- 建议新增 `packages/sprite-core/capability-registry.ts`

### 11.3 实施项

- 引入 `CapabilityRegistry`
- capability 由 level / achievement / feature flag / persona rule 共同决定
- UI 只消费 capability snapshot
- 将“已解锁但未激活”“未解锁”“运行中”这几类状态统一建模

### 11.4 验收标准

- 等级解锁不再只是展示层效果
- movement / appearance / advanced animation 等能力都能被 runtime 正式授权

---

## 12. Batch 7: Compatibility Cleanup

### 12.1 目标

在前面 6 批完成后，清理历史 helper、兼容 IPC、过时文档描述。

### 12.2 主要涉及文件

- `packages/sprite-core/helper/trigger-animation.ts`
- `packages/sprite-core/index.ts`
- `electron/preload/apis/persona.ts`
- `electron/main/handlers/window.ts`
- `docs/sprite-core/*`
- `docs/persona-system/persona-character-system-design.md`

### 12.3 实施项

- 移除或降级旧 helper API
- 清理陈旧 trigger mapping 用法
- 删除不再建议直接使用的旧 `window.*` sprite 配置接口
- 文档删除“已闭环但代码未闭环”的旧表述

### 12.4 验收标准

- 新人只看 docs 就能知道唯一推荐入口
- 不再需要通过注释解释“新接口在这，旧接口也还能用”

---

## 13. 推荐开工顺序

建议按以下顺序推进：

1. Batch 0
2. Batch 1
3. Batch 2
4. Batch 4
5. Batch 5
6. Batch 3
7. Batch 6
8. Batch 7

说明：

- `Batch 1` 和 `Batch 2` 是当前收益最高、风险也最大的核心批次
- `Batch 4`、`Batch 5` 会把后续扩展成本大幅降下来
- `Batch 3` 虽然也重要，但在 `state / trigger` 没拆干净前，过早统一元数据容易返工
- `Batch 6` 适合在 runtime authority 基本稳定后再落地

---

## 14. 文档维护约定

后续每次改动 sprite 相关代码时，至少检查以下文档是否需要同步：

- 本文档：更新批次状态、已完成子任务、残余风险
- [sprite-runtime-unification-plan.md](./sprite-runtime-unification-plan.md)：更新原则层和收口状态
- [README.md](./README.md)：更新对外推荐入口、架构图、已废弃接口
- `docs/persona-system/persona-character-system-design.md`：如果改动了成长/人格模型，同步更新

建议使用以下状态字段回填：

- `Not Started`
- `In Progress`
- `Blocked`
- `Done`
- `Follow-up Needed`

---

## 15. 下一步默认执行建议

如果没有新的优先级变化，下一步默认进入 `Batch 0 + Batch 1`：

- 先让已知问题全部可测试复现
- 再修 trigger、auto-walk、movement preview、file-drop 这些 correctness 问题
- 然后再进入 `Batch 2` 做模型拆分

这条顺序的好处是：

- 回归风险最低
- 能最快把当前桌面精灵的“隐性不生效配置”问题收掉
- 后面做结构性重构时不容易迷失边界
