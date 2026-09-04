# sprite-core — 桌面精灵人格化核心引擎

> **mini 分支注记**：本文中涉及的 Memory（记忆系统）、RSS、workflow、资源库等外部系统已在 mini 分支移除；persona 数值养成（XP/等级/好感度累积与衰减、奖励结算、`sprite:persona:addXP`/`changeFavor`/`grantReward`/`unlockAchievement` 等 IPC、`persona-rules.ts`）也已移除——人格文档与 prompt 注入、心情字段（静态值）、purpose/routine、capability（不再按等级门控）仍然有效。相关段落仅作历史记录保留。

> **当前状态** (2026-04-24)：主进程统一运行时已全面落地，本轮收尾冻结；后续暂不继续修改 sprite runtime 主线。
>
> **已完成的主要子系统**：
>
> - 主进程 `SpriteManager` 单例门面 + 渲染层退化为纯展示
> - `CharacterState` 持久化（含按角色 slot 存档）、typed `sprite:interact`、统一 trigger metadata
> - `CapabilityRegistry` + `capability-runtime` + 主进程 capability guard（覆盖 ASR / sprite asset authoring）
> - `CharacterPackManager`：角色包扫描 / 安装 / 激活 / 导入 / 卸载 / trust-root 公钥验签
> - `CharacterGalleryManager`：角色包静态参考图集（动作/角度/表情/道具）索引、导入、替换、删除与 AI 编辑上下文
> - `MovementCoordinator`：animation / behavior movement 统一策略
> - AI 自发说话：`SpriteSpontaneousUtteranceService`（详见 [sprite-ai-spontaneous-utterance-design.md](./sprite-ai-spontaneous-utterance-design.md)）
>
> **后续 Backlog**（本轮不继续推进，详见 [sprite-runtime-unification-plan.md](./sprite-runtime-unification-plan.md) §4 剩余工作）：
>
> - 更多 pack/character flags 的默认 capability 消费（avatar load-state / sprite asset authoring 已接入，仍可继续扩展）
> - 少量旧 metadata 输入 fallback 清理
> - Trust-root publisher key rotation / 发布流程补强（revocation 已落地）
> - `WindowController` 仅剩 timer orchestration / scheduler 抽象可继续收口
> - 高阶 timed media / preview bridge follow-up
> - Purpose + Routine 连续动作编排：详见 [设计文档](./sprite-purpose-routine-orchestration-plan.md) 与 [实施方案](./sprite-purpose-routine-implementation-plan.md)
>
> **2026-04-30 更新**：Purpose + Routine 已完成 Phase 1-2.5 第一版：基础目的/队列/routine 运行时、预设 routine、`sprite:purpose:*` IPC、`playId` 动画完成等待、routine 生命周期展示锁、状态机动画展示锁已接入。
>
> **2026-05-03 更新**：Purpose + Routine 已完成 Phase 3 基础版：`waitForEvent` step、`PurposeEventWaiter`、`sprite:purpose:event`、`sprite:purpose:list-history`、JSONL 历史落盘、step 生命周期历史、SpriteEventBus/AppEvent 转 purpose event 已接入；Phase 4/5 已开始接入 `branch` / `loopUntil`、`file.drop` 结果分支、拖文件启动 purpose、取消/失败分支测试、file-drop 端到端集成验收、active purpose 展示去重、UI/e2e 风格验收与低频 speak/cooldown。Phase 6 已完成：PurposeManager 已补基础 priority arbitration、同类 purpose coalesce、默认 `idle.presence` semantic purpose、`night-sleepy` -> `daily.rest-reminder` purpose、文件投递打断休息提醒与完成后恢复 idle 回归、current critical step defer interrupt、低优先级 reject 与 queue limit/evict 策略、DailyCare dispatch -> purpose bridge。Phase 7 已基本完成安全接入：已补 `SpritePurposePlannerExecutor` 接口、planner 输入/输出类型、step/window/event/时长/timeout allowlist 校验器、AI draft -> `SpriteRoutine(source: ai)` helper、主进程 `SpritePurposePlannerService` 骨架、planner prompt/output digest 与 `planner:planned` / `planner:fallback` 历史记录、`PurposeManager` / `SpriteManager` 的可注入 live planner routine 执行入口、Electron main 默认关闭的 planner service + adapter 接线、真实 Pi runtime executor/prompt、持久化 planner preferences + `sprite:purpose-planner:*` IPC/preload 入口，以及扩展设置页中的目的规划器设置、最近结果、planner 历史列表与手动试跑入口；默认仍关闭，启用后输出仍必须通过校验器，否则 fallback preset；若已通过校验的 AI routine 在执行期失败，也会记录执行期 `planner:fallback` 并转 preset routine 收尾。
>
> **2026-09-04 更新**：文件拖放功能已整体移除（含 `file.drop` / `onboarding.file.drop` / `onboarding.workspace.create` 预设、`sprite:file-drop` IPC 通道与 `file-drag-over` / `file-drag-leave` / `file-drop` 交互类型）；`onboarding.workspace.create` 与 `onboarding.file.drop` 两个新手引导预设因无运行时触发入口一并删除。
>
> **2026-09-04 死代码清理**：一批无运行时消费者的 IPC / 桥接已删除——AI 目的规划器偏好/状态入口（`sprite:purpose-planner:get-preferences` / `update-preferences` / `get-status` 与对应 preload 桥接）、`sprite:purpose:cancel` / `sprite:purpose:get-snapshot` / `sprite:purpose:list-history` 与 `sprite:purpose:state` 广播、`sprite:feedback:play`、`sprite:speak:synthesize` / `sprite:speak:reset-config`、`sprite:message:confirm` 与 `onMessage` / `onBusyUpdate` / `onBusyClear` / `onEffect` 订阅桥接、`sprite:register-from-data` / `sprite:list-by-trigger` / `sprite:add-temp-resource-root`、移动预览与避让 IPC（`sprite:preview-movement` / `sprite:stop-movement-preview` / `sprite:movement:set-avoid-regions`，含 `MovementCoordinator` 的 preview 方法）、`sprite:character:get-prompt`。Purpose 对外入口收敛为 `sprite:purpose:start` / `sprite:purpose:event` / `sprite:purpose:get-daily-retrospective`；消息下行统一走 `app:message:bridge`（不再有 `sprite:message` / `sprite:busy:*` 通道）。`AppEvent` 枚举再删一批无消费方成员，`MessageCategory` 移除 `configure` 类别；`packages/ai/services/memory-types.ts` 改名 `agent-loop-types.ts`，persona 更新管线死类型（`persona-types.ts` / `persona-document.ts`）同步收窄。
>
> **2026-05-03 复盘层补充**：PurposeHistory 已新增每日 retrospective 摘要面：`getPurposeDailyRetrospective()` 会从 JSONL 历史汇总当天目的、完成/取消/失败统计、kind 分布、高价值 purpose 与 recall cues，并通过 `sprite:purpose:get-daily-retrospective` / preload 暴露；状态页已接入“今日目的”展示；主进程组合层注册的 retrospective provider 会把高价值目的复盘注入给 AI 自发说话等消费方（Memory 系统已在 mini 分支移除，不再生成 Memory Note）。
>
> **2026-05-03 自发说话补充**：`SpriteSpontaneousUtteranceService` 现在通过构造注入的 retrospective provider 读取当天 purpose retrospective，把高价值目的与 recall cues 作为 prompt 中的安静自我感知上下文，避免逐 step 噪声进入闲置表达。
>
> **2026-05-25 引导目标补充**：`SpriteRoutinePresetDefinition` 支持 `goal` 元数据，用于声明 preset routine 想达成的状态。当前内置 `ai.chat-provider-configured`（`chat.api-config-guide`）与成就型 goal（`onboarding.chat.start`）。阻断式入口会先评估 goal，未达成时启动对应 guide 并停止原动作；例如双击助手打开聊天前会先检查聊天 API Key。`chat.api-config-guide` 不会自动跳转设置页，必须先展示“去配置”按钮，用户点击后才打开设置页 AI 分类并定位 provider / preset。

## 概览

`sprite-core` 是 Chobits 桌面精灵的**人格化核心引擎包**。包内按运行环境分层：`state-machine` / `behavior-engine` / `event-bus` 等纯逻辑模块不依赖 React、Electron，可独立测试和复用；`handlers/`（IPC 注册）、`preload/`（渲染桥）为主进程 / preload 专用代码，依赖 Electron。

## 进度小结（2026-04-24）

- 兼容层继续收口：`sprite:trigger` 请求字段已经只接受 `trigger`，动画 metadata normalize 输出也不再持久化 `eventType` 镜像，只保留旧输入 fallback。
- trust-root 校验继续补强：已支持 revoked key 判定，撤销签名 key 会在 character pack 导入阶段被阻断，而不是等到运行时才暴露问题。
- `WindowController` 继续瘦身：路径采样、边界约束、自动移动步进、平台访问、拖拽会话、行走会话、自动移动会话都已拆到独立 helper，控制器主体主要只剩 timer orchestration 与回调拼装。
- capability 默认消费继续补强：`sprite:register` / `sprite:update-config` / `sprite:update-meta` / `sprite:remove` 等动画资源 authoring 写入口现在会校验基础 `spriteManage` capability，允许预设角色通过用户覆盖层添加和编辑自己的精灵视频动画，同时避免角色未加载时绕过运行时权威直接改动画资源。
- 设置页 capability UI 已对齐：精灵管理页会读取 `spriteManage` runtime 状态，未解锁时提前禁用视频导入、添加、删除和 metadata 编辑入口，并展示 locked notice；测试播放/查看现有动画仍可用。
- `emotionExpression` 已开始进入运行时消费：闲置情感自发表达（`idle-emotion`）会读取 capability runtime，未解锁时不再自动触发表情动画；手动测试/显式 `trigger()` 不受影响。
- persona 养成数值系统已移除：`addXP()` / `changeFavor()` / `unlockAchievement()` / `grantReward` 等 mutation API 与对应 IPC 已全部删除，角色状态只读入口为 `sprite:character:get-state`。
- 定向回归已覆盖：相关 `vitest` 已覆盖 metadata / pack import / IPC / `WindowController` model/platform/session 链路，当前这条主线已经比之前更接近 `freeze-safe`。
- 当前更适合收尾冻结：主线 capability 消费已经形成闭环；后续只保留 trust-root publisher key rotation / 发布流程、少量 legacy metadata fallback 清理，以及 timed media / preview follow-up。
- 本轮结论：`sprite-core` 运行时统一、角色包 lifecycle、capability runtime、AI 自发说话与精灵管理 authoring guard 已完成可用闭环；除非后续出现明确产品入口或兼容下线窗口，本模块暂不继续修改。

## 架构

```
packages/sprite-core/
├── event-bus.ts                # 统一事件总线
├── state-machine.ts            # 精灵有限状态机
├── character-state.ts          # 角色状态快照（静态展示值 / 心情 / 维度）
├── character-runtime.ts        # 角色声明 → runtime 桥接
├── character-service.ts        # 角色定义服务（人格模板、维度、工具标签）
├── character-pack-manager.ts   # 角色包扫描 / 安装 / 激活 authority
├── character-pack-archive.ts   # 角色包压缩包（.cbpk / zip）读写
├── character-pack-integrity.ts # 角色包完整性校验
├── character-pack-paths.ts     # 角色包路径解析
├── character-pack-signature.ts # trust-root 公钥验签
├── character-gallery.ts        # 角色图集共享类型 / 索引规范
├── character-gallery-manager.ts # 角色图集文件与索引管理
├── character-capability-flags.ts # 角色声明 / 角色状态 → capability flags 桥接
├── interaction-tracker.ts      # 交互追踪器
├── capability-registry.ts      # capability 定义 / 解锁 / 激活快照统一入口
├── capability-runtime.ts       # capability 运行时守卫与状态
├── capability-events.ts        # capability 变化事件共享契约
├── behavior-engine.ts          # 行为引擎（自主行为调度）
├── purpose/                    # Purpose/Routine 连续动作编排
├── animation-registry.ts       # 动画注册表
├── animation-condition.ts      # 动画条件编译（角色状态条件选片）
├── interaction-contract.ts     # 交互输入 / EventBus 事件共享契约
├── window-controller.ts        # 窗口控制器（行走/拖拽/位置）
├── window-controller-model.ts  # 路径采样 / 边界约束 / 步进纯计算
├── window-controller-platform.ts # 窗口平台访问
├── window-controller-drag-session.ts      # 拖拽会话
├── window-controller-walk-session.ts      # 行走会话
├── window-controller-auto-move-session.ts # 自动移动会话
├── types.ts                    # 共享类型定义（150+ 事件类型）
├── manager/                    # SpriteManager 门面模块
│   ├── index.ts                # barrel 导出
│   ├── movement-coordinator.ts # movement 策略协调器
│   ├── sprite-manager.ts       # SpriteManager 主类（单例门面）
│   ├── types.ts                # 平台抽象接口/初始化选项
│   ├── persistence.ts          # 人格状态持久化
│   ├── state-mapping.ts        # 状态→事件映射函数
│   ├── progress-speech-announcer.ts # 忙碌进度语音播报
│   └── default-behaviors.ts    # 默认自发行为注册
├── handlers/                   # IPC 处理层
│   ├── index.ts                # barrel 导出
│   ├── sprite-manager-ipc.ts   # SpriteManager IPC 绑定
│   ├── sprite-event-listener.ts# AppEvent → 精灵动画触发
│   ├── capability-broadcast.ts # capability 变化通知
│   └── sprite-assets.ts        # 动画资源文件管理
├── messages/                   # 消息文案
│   ├── zh-CN.ts                # 中文气泡文案目录（47 个类别 + 150+ 事件文案）
│   ├── character.ts            # 角色包文案覆盖读取
│   └── default-character.ts    # 默认角色文案
├── speak/                      # 语音合成模块
│   ├── index.ts
│   ├── speak-service.ts        # 语音合成服务（Edge TTS / AI Provider TTS）
│   ├── speak-cache.ts          # 语音缓存管理
│   ├── speak-config-store.ts   # 语音配置持久化
│   ├── realtime-text-parser.ts # 实时朗读文本 parser（markdown 降噪 / 断句缓冲）
│   ├── speak-language.ts      # 语音语种解析
│   └── types.ts                # 语音类型定义
└── preload/                    # Preload 桥接层
    ├── index.ts
    └── sprite-bridge.ts        # window.chobits.sprite API 暴露
```

### 数据流

```
用户交互(intent) → EventBus → InteractionTracker → 统计
                    → CharacterStateManager → 角色状态快照（静态展示值/心情/维度） → UI 更新
                    → StateMachine          → 状态切换 → AnimationRegistry → IPC → 渲染进程播放

BehaviorEngine (tick 1s) → 检查条件 → 触发行为 → SpriteManager.trigger() → 动画 + 气泡

业务事件 → AppEvent → sprite-event-listener → SpriteManager.trigger() → 动画 + 气泡
```

### 主进程架构

```
主进程
┌──────────────────────────────────────────────────────────┐
│ SpriteManager (单例门面)                                  │
│  ├ SpriteEventBus           # 内部事件总线                │
│  ├ SpriteStateMachine       # 状态决策                    │
│  ├ CharacterStateManager    # 角色状态快照（静态展示值/心情/维度） │
│  ├ InteractionTracker       # 交互统计                    │
│  ├ BehaviorEngine           # 自主行为调度 (tick 1s)       │
│  ├ AnimationRegistry        # 事件→动画映射               │
│  ├ WindowController         # 行走/位置/拖拽               │
│  ├ SpeakService             # 语音合成（Edge TTS / AI Provider TTS）      │
│  └ CharacterStatePersistence # JSON 持久化 (debounced)     │
└──────────────────────────────────────────────────────────┘

渲染进程 (纯展示+交互采集)
┌──────────────────────────────────────────────────────────┐
│ <SpriteStateProvider>       # 接收 IPC 状态，提供 Context │
│   <SpriteApp>                 # 根组件；click/hover → sprite:interact│
│     ├ AnimationPlayer       # 收到 animId → 播放视频      │
│     ├ SpriteMessage         # 收到 app:message:bridge → 展示│
│     ├ DragCollector         # 拖拽采集 → sprite:drag       │
│     └ SpeakPlayer           # 语音播放 → sprite:speak-started│
└──────────────────────────────────────────────────────────┘
```

---

## 核心模块

### 1. SpriteManager — 主进程门面 (Façade)

**文件**: `manager/sprite-manager.ts`

单例门面类，作为 sprite-core 引擎在主进程的统一入口。所有主进程模块通过 `SpriteManager.getInstance()` 一行代码控制精灵。

```typescript
import { SpriteManager } from '@packages/sprite-core/manager';
const sprite = SpriteManager.getInstance();

// ===== 状态控制 =====
sprite.transitionTo('walking');
sprite.playOnce('click', { durationMs: 600 });

// ===== 统一事件触发 =====
sprite.trigger('happy');                         // 播放动画 + 显示气泡
sprite.trigger('celebrate', { message: '完成！' }); // 自定义文案
sprite.trigger('breath', { silent: true });       // 仅播放动画
sprite.triggerById('idle-happy');                  // 按动画 ID 直接播放

// ===== 消息 =====
sprite.showToast('回答完毕！');
sprite.showToast(undefined, { category: 'click' });
sprite.showNotice('该喝水啦', { persistent: true, buttons: [...] });
sprite.showBusy('下载中...', 45);
sprite.updateBusy(80, '快完成了');
sprite.clearBusy();

// ===== 语音 =====
await sprite.speak('你好');

// ===== 人格化（静态快照，养成数值已移除） =====
sprite.setMood('joyful', 80);
sprite.getCharacterState();
sprite.initDimensions([{ id: 'curiosity', initialValue: 50 }]);

// ===== 窗口 =====
sprite.walkTo(500, 300);
sprite.stopWalk();
sprite.getPosition();
sprite.setPosition(100, 200);
sprite.startDrag(offsetX, offsetY);
sprite.endDrag();

// ===== 交互 =====
sprite.reportInteraction('click');
sprite.reportInteraction('hover-enter');

// ===== 动画 =====
sprite.registerAnimation(anim);
sprite.registerAnimations([anim1, anim2]);
sprite.unregisterAnimation('idle-happy');
sprite.getAnimationList();
sprite.getCurrentAnimation();

// ===== 配置 =====
sprite.getSpriteConfig();
sprite.setSpriteConfig({ width: 200, height: 200 });
sprite.isDebugOverlayEnabled();
sprite.setDebugOverlayEnabled(true);
sprite.getAnimationPlaylistMode();
sprite.setAnimationPlaylistMode('list-loop');
sprite.getAnimationPlaylistMode('idle');
sprite.setAnimationPlaylistMode('single-loop', 'idle');

// ===== 事件 =====
const off = sprite.on('sprite:character:switched', handler);
off();
sprite.emit('custom:event', data);

// ===== 行为 =====
sprite.registerBehavior(myCustomBehavior);
```

#### SpriteManager 内部模块

| 模块     | 文件                              | 职责                                                                   |
| -------- | --------------------------------- | ---------------------------------------------------------------------- |
| 类型定义 | `manager/types.ts`                | `SpriteWindow`、`SpriteManagerOptions`、`CharacterStatePersistenceRow` |
| 移动策略 | `manager/movement-coordinator.ts` | animation / behavior movement 的统一策略分发                       |
| 持久化   | `manager/persistence.ts`          | `CharacterStatePersistence`（JSON 文件 + 自动保存）                    |
| 状态映射 | `manager/state-mapping.ts`        | `mapStateToTrigger()` — 状态机 → AnimationRegistry 动画 trigger      |
| 默认行为 | `manager/default-behaviors.ts`    | 8 个内置自发行为的注册函数                                             |

### 2. SpriteEventBus — 统一事件总线

替代简单 pub/sub，提供类型安全、优先级、历史追溯。

```typescript
const bus = new SpriteEventBus();

// 订阅
const off = bus.on('interact:click', handler);

// 发射
bus.emit('interact:click', { x: 100, y: 200 }, 'source-id');

// 通配符
bus.on('*', handler);
```

**事件类型前缀**:

- `state:*` — 精灵状态变化
- `interact:*` — 用户交互
- `anim:*` — 动画播放
- `behavior:*` — 自主行为触发
- `sprite:character:switched` — 角色切换通知（养成数值事件已移除，仅此一个角色事件）
- `system:*` — 系统事件

### 3. SpriteStateMachine — 有限状态机

声明式状态转换表，驱动精灵视觉状态。

```typescript
const sm = new SpriteStateMachine({ eventBus });

sm.transitionTo('walking');
sm.playOnce('click', { durationMs: 600 });
sm.pushState('reacting');
sm.popState();
sm.onChange((newState, oldState, ctx) => { ... });
```

**预定义状态**:

| 主状态 (SpriteState) | 说明                 |
| -------------------- | -------------------- |
| `idle`               | 待机                 |
| `walking`            | 行走                 |
| `running`            | 奔跑                 |
| `dragging`           | 拖拽中               |
| `sleeping`           | 睡眠                 |
| `reacting`           | 临时反应（含子状态） |
| `bored`              | 无聊                 |

**子状态 (SpriteReactionState)**:
`click` | `hold` | `sleepy` | `custom`

说明：

- `SpriteReactionState` 表示 runtime 中 `reacting` 的子状态，不等于所有动画 trigger
- `thinking`、`happy`、`surprised` 等更适合作为 animation trigger，而不是继续扩张状态机子状态
- 业务事件动画已开始统一收口到 `trigger()`；`playOnce()` 仅保留给 click / sleepy 这类真实 reaction

### 4. CharacterStateManager — 角色状态快照

RPG 养成数值系统（XP / 等级累积 / 好感度增减与衰减 / 每日登录奖励 / 成就解锁事件）已在 mini 分支移除。当前只保留一个**静态角色状态快照**：`name` / `description`（随角色包 slot 切换）、固定展示值（`level` / `favor` / `favorLevel`）、心情字段、向导目标标记（`achievements`，不再产生解锁事件）与按角色包 schema 初始化的静态维度值，供人格 prompt 注入、动画条件匹配与自发行为上下文使用。

```typescript
const psm = new CharacterStateManager({
  initialState: { name: 'Chobits' },
  onStateChange: (state) => {
    /* 更新 UI */
  }
});

psm.getState();
psm.loadState(saved);
psm.setMood('joyful', 80);
psm.initDimensions([{ id: 'curiosity', initialValue: 50 }]);
```

**心情类型 (MoodType)**:
`joyful` | `content` | `neutral` | `bored` | `sad` | `sleepy` | `excited` | `curious` | `annoyed`

**好感度等级 (FavorLevel)**（固定展示值，由 `favor` 按阈值推导，不再有累积逻辑）:

| 等级           | 范围   |
| -------------- | ------ |
| `stranger`     | 0–19   |
| `acquaintance` | 20–39  |
| `friend`       | 40–59  |
| `close-friend` | 60–79  |
| `bestie`       | 80–94  |
| `soulmate`     | 95–100 |

### 4.1 Persona DTO 约定

`sprite-core` 当前将渲染层只读角色状态快照统一为 `CharacterSnapshot`。

- `SpriteStateSnapshot.characterState` 使用共享 `CharacterSnapshot`
- `SpriteInitialState.characterState` 使用共享 `CharacterSnapshot | null`
- `window.chobits.character.getState()` 返回 `{ ok: true, characterState: CharacterSnapshot }`
- 状态页、状态面板等 UI 不应再定义本地 `affection` / 数字型 `mood` 影子类型

### 5. InteractionTracker — 交互追踪器

滑动窗口统计，为行为引擎和游戏化提供数据。

```typescript
const tracker = new InteractionTracker({ eventBus });
tracker.record('click', { x: 100, y: 200 });

const stats = tracker.getStats();
// stats.frequency     — 次/分钟
// stats.idleDuration  — 空闲时间(ms)
// stats.todayCount    — 今日交互次数
// tracker.isActive()  — 最近1分钟有交互？
```

**交互输入契约 (SpriteInteractionIntent)**:
`click` | `double-click` | `hover-enter` | `hover-leave` | `context-menu`

**交互类型 (InteractionType)**:
`click` | `double-click` | `drag` | `hold` | `hover` | `context-menu` | `conversation` | `walk-trigger` | `custom`

说明：

- `SpriteInteractionIntent` 是 renderer / preload / IPC / `SpriteManager.reportInteraction()` 共用的输入契约
- `InteractionType` 是 `InteractionTracker` 的统计分类，`hover-enter` / `hover-leave` 会聚合到 `hover`
- 运行时交互计数以 EventBus 为唯一来源，避免 `reportInteraction()` 与 `InteractionTracker` 双重记账

### 6. BehaviorEngine — 行为引擎

可扩展的自主行为调度系统，tick 驱动（默认 1 秒间隔）。

```typescript
const engine = new BehaviorEngine({ eventBus, stateMachine, tickIntervalMs: 1000 });

engine.register({
  id: 'suggest-break',
  name: '建议休息',
  enabled: true,
  priority: 'high',
  schedule: { type: 'interval', intervalMs: 3600000 },
  conditions: [(ctx) => ctx.interactionStats.idleDuration > 600000],
  probability: 0.5,
  action: async (ctx) => {
    /* ... */
  },
  allowedStates: ['idle'],
  cooldownMs: 300000,
  dailyLimit: 3
});

engine.setContextProvider(() => ({
  spriteState: sm.getState(),
  characterState: psm.getState(),
  interactionStats: tracker.getStats(),
  now: new Date(),
  screenSize: { width: 1920, height: 1080 },
  position: [x, y]
}));
engine.start();
```

**预置行为工厂函数**（共 8 个，均从 `behavior-engine.ts` 导出）:

| 函数                            | 说明                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| `createSleepyBehavior()`        | 23:00-06:00 夜间困倦（每分钟检查、10% 概率、冷却 30 分钟；接入 `daily.rest-reminder` purpose） |
| `createIdleSleepyBehavior()`    | 5 分钟无交互提醒一次，之后除非有新交互事件否则不再提醒                                         |
| `createBoredBehavior()`         | 空闲 >2 分钟无聊状态                                                                           |
| `createRandomMessageBehavior()` | 随机调度间隔 10-30 分钟随机消息                                                                |
| `createEmotionBehavior()`       | 随机情感（按好感度分池；受 `emotionExpression` capability 门控）                               |
| `createActionBehavior()`        | 随机动作（高好感解锁更多，可接入 AI 自发说话）                                                 |
| `createAmbientBehavior()`       | 氛围微动画（breath/blink/float）                                                               |
| `createSeasonalBehavior()`      | 季节/节日行为                                                                                  |

### 7. AnimationRegistry — 动画注册表

统一的动画索引，支持条件动画选择（按好感度/等级选择不同动画变体）。

```typescript
const registry = new AnimationRegistry();

registry.register({
  id: 'idle-happy',
  title: '开心待机',
  eventTypes: ['idle'],
  priority: 10,
  condition: (characterState) => characterState.favor >= 80,
  source: { localPath: '/characters/idle-happy.webm' },
  playback: { width: 180, height: 240, loop: true, loopCount: 2 }
});

const anim = registry.findByTrigger({
  trigger: 'idle',
  characterState: psm.getState()
});
```

主要方法: `register()`, `registerAll()`, `unregister()`, `get()`, `getAll()`, `findByTrigger()`, `findAllByTrigger()`, `getTriggers()`, `clear()`

说明：

- `findByTrigger()` 默认做精确匹配
- 同一个 trigger 可注册多个动画，Registry 会先按 persona 条件过滤，再按 `priority` 从高到低组成候选列表；单个播放模式只取列表第一项，列表播放模式会按这个候选列表顺序播放
- 只有状态机稳定态解析才应显式传 `allowFallback: true`，让缺失资源时兜底到 `idle`

### 8. CharacterService — 角色定义服务

从 `character.json` 加载角色模板，提供人格 prompt、维度定义、工具标签覆盖等。

```typescript
import {
  initCharacterService,
  getCharacterInfo,
  getCharacterDefinition,
  buildCharacterPrompt,
  getDimensionSchema,
  getCharacterToolLabels,
  reloadCharacter
} from '@packages/sprite-core/character-service';
```

### 9. WindowController — 窗口控制器

主进程中管理精灵窗口的位置移动，包括贝塞尔曲线路径行走、拖拽、自动移动、边界约束。

当前实现里，路径采样、自动移动步进与边界约束的纯计算已经下沉到 `window-controller-model.ts`；拖拽、行走、自动移动会话以及窗口平台访问也分别拆到 `window-controller-drag-session.ts` / `window-controller-walk-session.ts` / `window-controller-auto-move-session.ts` / `window-controller-platform.ts`，`WindowController` 本体现在主要保留 timer orchestration 与回调拼装。

```typescript
import { WindowController } from '@packages/sprite-core/window-controller';

const wc = new WindowController({
  win,
  getScreenSize,
  stateMachine,
  eventBus,
  broadcastWalkState: (state) => {
    /* IPC push */
  }
});

await wc.walkTo(500, 300); // 贝塞尔曲线路径行走
await wc.walkTo(500, 300, 80); // 可自定义速度 (px/s)
wc.stopWalk();
wc.startDrag(offsetX, offsetY);
wc.endDrag();

// 自动移动：动画播放时沿指定方向恒速移动
wc.startAutoMove({ enabled: true, mode: 'direction', direction: 'left', speed: 80 });
wc.stopAutoMove();
wc.isAutoMoving();
wc.getAutoMoveDirection(); // 'left' | 'right' | null
```

**移动模式 (SpriteMovementMode)**:

| 模式              | 说明                                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| `direction`       | 沿固定方向恒速移动，到达屏幕边界停止                                   |
| `walkTo`          | 随机选取屏幕位置，沿贝塞尔曲线路径移动（三段式动画：intro→loop→outro） |
| `windowAnimation` | 播放主窗口动画预设（fly-in / fade-in / zoom-in 等），不改变精灵窗口行走状态（详见 [../window-animation-system.md](../window-animation-system.md)） |

**移动触发方式 (SpriteMovementTrigger)**:

| 触发方式    | 说明                                              |
| ----------- | ------------------------------------------------- |
| `animation` | 动画播放时自动触发移动（默认）                    |
| `behavior`  | 由 BehaviorEngine 行为调度触发，支持定时/随机间隔 |

**自动移动方向 (SpriteMovementDirection)**:

| 方向         | 说明     |
| ------------ | -------- |
| `left`       | 向左移动 |
| `right`      | 向右移动 |
| `up`         | 向上移动 |
| `down`       | 向下移动 |
| `up-left`    | 左上移动 |
| `up-right`   | 右上移动 |
| `down-left`  | 左下移动 |
| `down-right` | 右下移动 |
| `random`     | 随机方向 |

**移动行为特性**:

- **direction 模式**: 按配置方向和速度匀速移动窗口，到达屏幕边界自动停止
- **walkTo 模式**: 随机选取屏幕位置（Y 轴范围受 `verticalRange` 限制），沿贝塞尔曲线自然移动，方向由目标位置自动推导
- 拖拽开始时自动停止
- 动画播放完成时自动停止
- walkTo 模式要求动画具备 `loopStartMs`/`loopEndMs` 循环片段（用于三段式播放）

### 10. SpeakService — 语音合成模块

语音合成服务支持 Edge TTS 和 AI Provider TTS，负责缓存、配置管理、自动播放与 talk 动画触发。MiniMax 的 `speechSynthesis` Provider 底座已经覆盖 HTTP 非流式、HTTP 流式和 WebSocket 双向流；普通 `sprite.speak()` 固定使用完整 HTTP 合成和本地缓存，不让用户选择合成方式。详细方案见 [角色说话接入 AI Provider 语音合成规划](./sprite-speech-provider-integration-plan.md)，底层 Provider 契约见 [AI Provider 音频能力统一设计](../ai-system/provider-audio-capabilities-design.md)。

AI 聊天 delta 驱动的边合成边播放默认关闭，可通过“AI 回复实时朗读”开关接入 PCM 播放器。系统会先经过主进程实时文本 parser 做 markdown 降噪和断句缓冲，再按模型能力优先使用 WebSocket 双向流，不可用时降级为 HTTP 流式或 HTTP 完整合成。实施计划见 [AI 对话实时语音合成与 PCM 播放实施计划](./sprite-realtime-chat-speech-plan.md)。

Edge 和 AI Provider 都会先用“去 emoji 后文本 + 影响声音内容的配置指纹”生成 MD5 cache id，再查 `<userData>/data/sprite-speak-cache/`。命中时直接播放本地音频，不再调用 TTS 服务商；只有未命中时才合成并写入缓存。

当系统确认合成音频会被播放时，会在下发 `sprite:speak-started` 前尝试播放 `talk` 动画。这个能力是系统级的：`SpriteManager.speak()`、自动朗读的 `showToast()` / `showNotice()` 都走同一条链路。`talk` 不改变 `SpriteState`，并且只会在当前视觉表现是 idle-like 时插入，避免覆盖 `welcome`、`celebrate`、`thinking` 等显式 trigger 动画。

```typescript
// 通过 SpriteManager API 使用
await sprite.speak('你好，我是你的桌面助手！');

const config = sprite.getSpeakConfig();
sprite.setSpeakConfig({ voiceName: 'zh-CN-YunxiNeural', rate: 20 });

const stats = sprite.getSpeakCacheStats();
await sprite.clearSpeakCache();
```

**SpriteSpeakConfig**:

| 字段          | 类型                      | 说明                                                          |
| ------------- | ------------------------- | ------------------------------------------------------------- |
| `enabled`     | boolean                   | 是否启用语音合成                                              |
| `serviceType` | `'Edge'`                  | Legacy TTS 服务类型；Edge 引擎继续使用该字段                  |
| `engine`      | `'edge' \| 'ai-provider'` | 说话引擎选择，缺失时由 `serviceType` 兼容推导                 |
| `aiProvider`  | object                    | AI Provider、preset、model、voiceId、音频格式和声音参数等配置 |
| `voiceName`   | string                    | 语音名称（如 `zh-CN-XiaoxiaoNeural`）                         |
| `rate`        | number                    | 语速 (-100 ~ 200)                                             |
| `pitch`       | number                    | 音高 (-100 ~ 200)                                             |
| `volume`      | number                    | 音量 (0 ~ 1)                                                  |

#### 语音工作流程

```
渲染进程                              主进程                    精灵窗口
    │                                   │                         │
    │  window.chobits.sprite.speak('你好') │                         │
    │ ─────────────────────────────────►│                         │
    │                                   │                         │
    │                            合成音频 (Edge TTS / AI Provider)     │
    │                            缓存检查/存储                    │
    │                                   │                         │
    │                            尝试 trigger('talk')              │
    │                                   │  sprite:play(talk)      │
    │                                   │ ───────────────────────►│
    │                                   │                         │
    │                                   │  sprite:speak-started 事件│
    │                                   │ ───────────────────────►│
    │                                   │                         │
    │                                   │                   <audio>.play()
    │                                   │                   显示气泡
    │                                   │                         │
    │  返回 SpeakResult                 │                         │
    │ ◄─────────────────────────────────│                         │
```

---

## 动画系统

### 状态到动画的映射

```
状态变化
    ↓
mapStateToTrigger(state, subState)    # manager/state-mapping.ts
    ↓
触发器 (trigger)
    ↓
AnimationRegistry.findByTrigger({ trigger, characterState })
    ↓
动画配置 (AnimationEntry)
    ↓
IPC: sprite:play → 渲染进程播放
```

**映射表**:

| 主状态     | 子状态           | 事件类型       |
| ---------- | ---------------- | -------------- |
| `idle`     | -                | `idle`         |
| `walking`  | -                | `walk`         |
| `running`  | -                | `run`          |
| `dragging` | -                | `drag`         |
| `sleeping` | -                | `sleep`        |
| `bored`    | -                | `bored`        |
| `reacting` | `click`          | `click`        |
| `reacting` | `hold`           | `hold`         |
| `reacting` | `sleepy`         | `sleep`        |
| `reacting` | `celebrate`      | `celebrate`    |
| `reacting` | `emotion`        | `happy`        |

### 三段式动画

某些动画（如行走）需要 **intro → loop → outro** 三段播放（动画资源配置 `loopStartMs` / `loopEndMs` 即可启用）：

```
┌─────────┬──────────────────┬─────────┐
│  intro  │      loop        │  outro  │
│ 0~500ms │  500ms~2500ms    │ 2500ms~ │
│ (一次)  │    (循环)        │ (一次)  │
└─────────┴──────────────────┴─────────┘
```

配置示例（`characters/index.json`）：

```json
{
  "loopStartMs": 500,
  "loopEndMs": 2500,
  "loopCount": 2
}
```

循环字段语义：

- `loop: false` 或未设置 `loop`：默认播放一次
- `loop: true`：允许循环；单动画播放时保持历史行为，表示无限循环
- `loopCount: N`：有限循环 N 次后正常完成，适用于整段循环、`loopEndMs` 截止循环，以及 `loopStartMs`/`loopEndMs` 三段式 loop 片段
- `loopCount` 只接受大于 0 的整数；不设置表示不限制次数

### 播放列表模式

当同一个 trigger 下注册了多个动画时，播放层会把它们当作一个列表来处理，默认模式为 `list-loop`。不同动画类型通常需要不同策略，例如 `idle` 更适合列表循环，而反馈类动画可能只需要单次播放。`sprite` 配置支持两层播放列表模式：

- `animationPlaylistMode`：默认模式，未单独配置的 trigger 使用它
- `animationPlaylistModes`：按 trigger/动画类型覆盖，例如 `{ idle: 'list-loop', success: 'single-once' }`

可选模式：

- `single-loop`：只播放当前优先级最高的动画；如果该动画没有循环片段，则整段循环
- `list-loop`：按列表顺序依次播放，到最后一条后回到第一条
- `single-once`：只播放当前优先级最高的动画一次
- `list-once`：按列表顺序各播一次，播完后回到 idle

Preload 也可以直接读写单个 trigger：

```ts
await window.chobits.sprite.setAnimationPlaylistMode('list-loop', 'idle');
await window.chobits.sprite.setAnimationPlaylistMode('single-once', 'success');
const idleMode = await window.chobits.sprite.getAnimationPlaylistMode('idle');
```

优先级规则：

- 单个动画如果配置了 `loopStartMs` / `loopEndMs` 循环片段，则始终优先进入该片段循环
- 如果动画配置了 `loopCount`，播放端会在完成指定循环次数后发出完成事件，播放列表可以继续前进
- 在 `list-loop` / `list-once` 中，旧的 `loop: true` 或三段式循环动画如果没有显式 `loopCount`，运行时会按 `loopCount: 1` 处理，避免列表进入某个无限循环动画后卡住
- 只有当动画本身没有循环片段时，才由播放列表模式决定是单个循环、列表循环、单个播放还是列表播放

### playOnce vs transitionTo

更完整的动画播放入口矩阵见 [Sprite 动画播放入口与状态变更说明](./sprite-animation-playback-paths.md)。

| 方法                                 | 用途         | 自动回退              |
| ------------------------------------ | ------------ | --------------------- |
| `playOnce(subState, { durationMs })` | 临时反应动画 | ✅ 自动回退到之前状态 |
| `transitionTo(state)`                | 持久状态切换 | ❌ 不会自动回退       |

### 统一事件触发 trigger()

`SpriteManager.trigger(trigger, options?)` 是所有事件类型的统一触发入口：

- 查 AnimationRegistry → 有动画播动画+气泡，无动画仅气泡
- 不走状态机重解析，直接发送 `sprite:play` 指令
- 渲染端可通过 `window.chobits.sprite.trigger()` 调用
- 共享契约已收口到 `SpriteAnimationTrigger` + `SpriteTriggerOptions`，主进程 / preload / helper / registry 使用同一套 trigger 类型
- 显式 `trigger()` 默认不再 fallback 到 `idle`；只有状态机驱动的稳定态解析才保留 idle 兜底
- 设置页与视频编辑器现在共用 `SpriteTriggerPicker`，内置 trigger 与自定义 trigger 走同一套 authoring 入口
- 动画资源元数据开始升级为 `primaryTrigger + triggerAliases + priority`；旧 `meta.eventType` 仍兼容读取，但 normalize 输出不再持久化镜像字段
- 视频编辑器现已支持直接写入 `triggerAliases` 与 `priority`，导入链会自动透传到 sprite metadata
- 默认资源示例现已统一只写 `primaryTrigger`，设置页现有动画卡片与视频编辑器导入流也只 author `primaryTrigger + triggerAliases + priority`
- `sprite:register` / `sprite:update-config` / `sprite:update-meta` 现已统一走主进程 normalize 入口；旧 `eventType` 输入只作为兼容 fallback
- `sprite:register` / `sprite:update-config` / `sprite:update-meta` / `sprite:remove` 这些动画资源写入口现在受 `spriteManage` capability guard 保护；角色加载后即可通过用户覆盖层新增、导入、改播放/触发配置、改 metadata 或删除用户动画，预设资源本体仍保持只读
- `sprite:trigger` 也已只接受 `trigger`，`eventType` 兼容主要只剩旧输入 normalize fallback
- 条件动画 schema 现已支持持久化到 `meta.condition`，并在 runtime 自动编译成 persona 条件选片规则；设置页 / 视频编辑器现已提供支持 nested group / NOT 的可视化 builder，并保留高级 JSON 兜底入口

```typescript
import type { SpriteAnimationTrigger, SpriteTriggerOptions } from '@packages/sprite-core/types';

const trigger: SpriteAnimationTrigger = 'celebrate';
const options: SpriteTriggerOptions = { message: '完成！', silent: false };
sprite.trigger(trigger, options);
```

### 消息文案查找机制

`zh-CN.ts` 中定义了两层文案：

1. **MessageCatalog (catalog)** — 按 `MessageCategory` 索引（47 个类别），用于 `showToast(undefined, { category })` 查找
2. **spriteEventMessages** — 按 `SpriteEventType` 索引（150+ 条目），用于 `trigger()` 和 `getSpriteEventText()` 查找

**查找优先级（`getSpriteEventText(eventType, ctx)`）**：

1. `spriteEventMessages[eventType]` — 优先查找事件专用文案
2. `catalog[eventType]` — fallback 到 MessageCategory 文案（部分事件名与类别名重叠）
3. 返回空字符串

**重要规则**: 在 `sprite-event-listener.ts` 中的 handler 避免硬编码 fallback 文案，应统一通过 `getSpriteEventText(eventKey)` 从文案目录获取，确保文案定制化生效，支持随机选取和上下文插值。

```typescript
// ✅ 正确写法 — 使用文案目录
mgr.showToast(data?.message || getSpriteEventText('aiComplete'), { category: 'success' });

// ❌ 错误写法 — 硬编码字符串绕过文案目录
mgr.showToast(data?.message || '处理完成！', { category: 'success' });
```

### 动画配置文件

- 默认动画：`resources/characters/index.json`
- 角色包动画：`{userData}/data/character-packs/<packId>/animations/index.json`
- 全局用户动画兜底：`{userData}/data/sprites/index.json`

当当前激活的是 installed 角色包时，动画新增、删除与 metadata 更新会优先写入该角色包自己的 `animations/` 目录，并在 `pack.json.assets.animations` 指向的索引里记录相对路径。`{userData}/data/sprites/` 仍保留为全局用户动画兜底目录：主要用于没有可写 installed 角色包时，叠加在内置默认动画之上。

### 角色图集配置文件

- 内置默认图集：`resources/characters/gallery/index.json`
- 角色包图集：`{userData}/data/character-packs/<packId>/gallery/index.json`
- 图片文件：`gallery/images/*`
- 缩略图：`gallery/thumbs/*`

角色图集通过 `pack.json.assets.gallery` 声明，是角色包的一等资产，用来存放 idle、左侧行走、右侧行走、背面、跳跃、指向、自定义动作、表情、道具、分镜参考等静态图片。它服务于创作和 AI 编辑链路，不参与桌面精灵动画触发。installed 角色包可写，builtin 角色包只读；导入外部图片时会复制到包内，记录 mime、尺寸、文件大小和 SHA-256，并生成 webp 缩略图。删除/替换只清理 `gallery/images/` 与 `gallery/thumbs/` 下不再被引用的文件。图集写入口受 `spriteManage` capability guard 保护。

```json
{
  "version": 1,
  "items": [
    {
      "meta": {
        "id": "idle-default",
        "title": "Idle 默认站立",
        "tags": ["idle", "default"],
        "primaryTrigger": "idle",
        "triggerAliases": ["idle2"],
        "priority": 10
      },
      "source": {
        "localPath": "./idle.webm",
        "type": "video/webm"
      },
      "width": 180,
      "height": 240,
      "padding": 100,
      "loop": true,
      "loopCount": 2,
      "loopStartMs": 500,
      "loopEndMs": 2500,
      "movement": {
        "enabled": true,
        "mode": "walkTo",
        "speed": 60,
        "trigger": "behavior",
        "behaviorSchedule": {
          "type": "random",
          "minMs": 10000,
          "maxMs": 25000,
          "probability": 0.8,
          "minIdleMs": 5000
        },
        "verticalRange": 0.1
      }
    }
  ]
}
```

**动画尺寸配置**:
每个动画可以单独定义 `width`、`height`、`padding`，支持不同宽高比的视频精灵。当动画切换时，窗口大小会自动调整为对应动画的尺寸。

**Movement 配置说明**:

| 字段               | 类型                    | 必须 | 默认        | 说明                                                         |
| ------------------ | ----------------------- | ---- | ----------- | ------------------------------------------------------------ |
| `enabled`          | boolean                 | ✅   | -           | 是否启用窗口移动                                             |
| `mode`             | SpriteMovementMode      | ❌   | `direction` | 移动模式：`direction`（方向移动）、`walkTo`（随机行走）或 `windowAnimation`（主窗口动画预设） |
| `direction`        | SpriteMovementDirection | ❌   | `random`    | 移动方向（`mode='direction'` 时使用）                        |
| `speed`            | number                  | ❌   | 60          | 移动速度（像素/秒）                                          |
| `trigger`          | SpriteMovementTrigger   | ❌   | `animation` | 触发方式：`animation`（动画播放时）或 `behavior`（行为调度） |
| `behaviorSchedule` | object                  | ❌   | -           | 行为调度配置（`trigger='behavior'` 时使用）                  |
| `verticalRange`    | number                  | ❌   | 0.1         | walkTo 模式竖直范围限制（屏幕高度比例 0-1）                  |

**behaviorSchedule 子配置**:

| 字段          | 类型   | 默认   | 说明                                |
| ------------- | ------ | ------ | ----------------------------------- |
| `type`        | string | random | 调度类型：`random`/`interval`       |
| `intervalMs`  | number | 15000  | 固定间隔（ms），`type='interval'`   |
| `minMs`       | number | 10000  | 随机最小间隔（ms），`type='random'` |
| `maxMs`       | number | 25000  | 随机最大间隔（ms），`type='random'` |
| `probability` | number | 0.8    | 触发概率 (0-1)                      |
| `minIdleMs`   | number | 5000   | 最小空闲时间（ms）                  |

**Movement 配置示例**:

```json
// walkTo 模式（随机行走，行为调度触发）
{
  "movement": {
    "enabled": true,
    "mode": "walkTo",
    "speed": 60,
    "trigger": "behavior",
    "behaviorSchedule": {
      "type": "random",
      "minMs": 10000,
      "maxMs": 25000,
      "probability": 0.8,
      "minIdleMs": 5000
    },
    "verticalRange": 0.1
  }
}

// direction 模式（方向移动，动画播放时触发）
{
  "movement": {
    "enabled": true,
    "mode": "direction",
    "direction": "left",
    "speed": 80,
    "trigger": "animation"
  }
}
```

### 调试辅助线 (Debug Overlay)

运行时可通过 IPC 开关调试辅助线，显示精灵的 padding 边界和内容区域。

```typescript
// 渲染进程开启
await window.chobits.sprite.setDebugOverlay(true);

// 查询当前状态
const enabled = await window.chobits.sprite.getDebugOverlay();
```

**显示内容**:

- **外边框**（绿色虚线）：含 padding 的完整可点击区域
- **内边框**（橙色实线）：精灵内容区域
- **文字标签**：`padding=100 | 180×240` 显示当前尺寸信息

---

## 触发机制

### A. 用户交互触发

| 交互       | 触发位置               | IPC                | 主进程处理                                                                                                                                    |
| ---------- | ---------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 点击       | `SpriteApp`            | `sprite:interact`  | `reportInteraction('click')` → `playOnce('click')`                                                                                            |
| 双击       | `SpriteApp`            | `sprite:interact`  | `reportInteraction('double-click')` + `ensureChatApiConfigGoal` 目标检查，通过后 toggle `chatMini` / `chatPanel`（双击弹出/关闭 mini 对话框） |
| 右键       | `SpriteApp`            | `sprite:interact`  | `reportInteraction('context-menu')`                                                                                                           |
| hover 进入 | `SpriteApp`            | `sprite:interact`  | `reportInteraction('hover-enter')`                                                                                                            |
| hover 离开 | `SpriteApp`            | `sprite:interact`  | `reportInteraction('hover-leave')`                                                                                                            |
| 拖拽开始   | `useDragCollector`     | `sprite:drag`      | `transitionTo('dragging')` + `emit('interact:drag:start')`                                                                                    |
| 拖拽结束   | `useDragCollector`     | `sprite:drag`      | `transitionTo('idle')` + `emit('interact:drag:end')`                                                                                          |

### B. 业务事件触发 (AppEvent → sprite-event-listener)

通过 `AppEvent` 事件系统解耦：

```typescript
import { eventManager } from '@packages/event';
import { AppEvent } from '@packages/event/events';

eventManager.emit(AppEvent.SPRITE_AI_START);
eventManager.emit(AppEvent.SPRITE_AI_COMPLETED, { message: '生成完成！' });
```

| 事件                              | 触发时机             | 效果                                                     | 文案来源                               |
| --------------------------------- | -------------------- | -------------------------------------------------------- | -------------------------------------- |
| `SPRITE_AI_START`                 | AI 开始处理          | `showToast()` + `trigger('thinking', { silent: true })`  | `spriteEventMessages.aiThinking`       |
| `SPRITE_AI_COMPLETED`             | AI 处理完成          | `showToast()` + `trigger('celebrate', { silent: true })` | `spriteEventMessages.aiComplete`       |
| `SPRITE_AI_ERROR`                 | AI 处理出错          | `showToast()` + `trigger('error', { silent: true })`     | `spriteEventMessages.aiError`          |
| `AI_PROVIDER_CONFIG_UPDATED`      | AI Provider 配置更新 | toast                                                    | `trigger()` 自动查找                   |
| `SPRITE_DOWNLOAD_COMPLETE/FAILED` | 插件下载             | toast                                                    | `catalog.download/error`               |
| `SPRITE_PLUGIN_INSTALLED/REMOVED` | 插件操作             | toast                                                    | `catalog.install/remove`               |
| `SPRITE_SYSTEM_READY/QUIT`        | 系统生命周期         | appear/disappear 动画                                    | `spriteEventMessages.appear/disappear` |

说明：mini 分支已移除 RSS、回收站、资源库、workflow、Memory、媒体处理等业务系统。`SPRITE_RSS_*` / `SPRITE_TRASH_*` / `MEMORY_EXTRACTION_*` / `MEMORY_SAVED` / `SPRITE_RESOURCE_IMPORT_*` / `SPRITE_WORKFLOW_*` / `SPRITE_MEDIA_PROCESS_*` / `USER_PERSONA_UPDATE_*` / `WORKSPACE_*` / `FOLDER_*` / `TAG_*` / `FILE_ACTION_*` / `SPRITE_MESSAGE` / `PROJECT_CANDIDATE_CREATED` 因全仓无任何 emitter 与消费方，已从 `AppEvent` 枚举与 `sprite-event-listener.ts` 中删除，对应的 events/routines 文案 key 与 `workflow.waiting` / `resource.import.waiting` / `onboarding.resource.open-library` preset 也已一并移除。`SPRITE_PLUGIN_UPDATE` / `SPRITE_SYSTEM_FOCUS` / `SPRITE_SYSTEM_BLUR` / `SPRITE_NETWORK_*` / `APP_STARTED` / `SPRITE_MENU_ITEM_SELECTED` 同样因只剩半条链（无 emitter 或无 listener）而删除，`pluginUpdate` 文案 key 一并移除。新增事件应接入上表中的活跃链路。

### C. 旧场景映射兼容层已移除

旧的 `trigger-mapping.ts` / `trigger-animation.ts` 已从仓库移除；新的统一入口保持为 `SpriteManager.trigger()` 与 `sprite-event-listener`。

```typescript
import { SpriteManager } from '@packages/sprite-core/manager';

const sprite = SpriteManager.getInstance();
sprite.trigger('success');
```

当前如果要扩展事件触发能力，应优先：

- 直接调用 `SpriteManager.trigger()`
- 或通过业务事件进入 `sprite-event-listener` 的统一链路

### D. 自发行为触发 (BehaviorEngine)

| 行为 ID           | 触发条件                  | 动作                                |
| ----------------- | ------------------------- | ----------------------------------- |
| `night-sleepy`    | 23:00-06:00 时间窗口      | `startPurpose(daily.rest-reminder)` |
| `idle-sleepy`     | 空闲 >5 分钟              | `playOnce('sleepy')`                |
| `long-idle-bored` | 空闲 >2 分钟              | `transitionTo('bored')`             |
| `random-message`  | idle，随机调度 10-30 分钟 | `showToast(random tip)`             |
| `emotion`         | idle 3-5 分钟             | 按好感度池随机触发情感事件          |
| `action`          | idle 30-60 秒随机调度     | 按好感度池随机触发动作事件          |
| `ambient`         | idle 5-10 分钟随机调度    | breath/blink/float 微动画           |
| `seasonal`        | 每天首次打开              | 按日期触发季节/节日事件             |

**主动发言共享冷却时钟**：AI 自发说话、休息提醒（`daily.rest-reminder`）、planner routine 的 speak 与关怀提醒（`daily.care.reminder`）四类主动发言共享同一个 `lastProactiveSpeechAt` 冷却时钟。`SpriteManager` 通过构造注入的 `proactiveSpeechGate`（在 `electron/main/handlers/index.ts` 接线，委托 `SpriteSpontaneousUtteranceService.shouldAllowProactiveSpeech()` / `recordProactiveSpeech()`）对 routine 的 speak 统一过闸：冷却期内的氛围型发言会被跳过（`proactive_speech_cooldown`），发言成功后写回时钟；`daily.care.reminder` 是按时间点派发的日程提醒，不被冷却阻塞，但发言后同样写入共享时钟。冷却时长即扩展设置页“主动发言间隔”（`cooldownMinutes`）。

### E. 渲染进程直接调用

```typescript
await window.chobits.sprite.trigger('happy');
await window.chobits.sprite.trigger('celebrate', { message: '太好了！' });
```

---

## IPC 通信协议

核心运行时通道统一使用 `sprite:` 前缀。

说明：

- 当前代码仍保留少量兼容输入，例如动画元数据里的旧 `eventType` 输入 fallback
- 这些兼容输入用于平滑迁移，不应继续作为新的正式能力入口

### 上行（渲染进程 → 主进程）

| 通道                                                    | 载荷                                                    | 说明                                                                |
| ------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| `sprite:interact`                                       | `{ type: SpriteInteractionIntent, data? }`              | 用户交互上报                                                        |
| `sprite:drag`                                           | `{ phase, offsetX?, offsetY? }`                         | 拖拽事件                                                            |
| `sprite:anim-complete`                                  | `{ animId, phase, playId? }`                            | 动画播放完成                                                        |
| `sprite:ready`                                          | -                                                       | 渲染进程就绪                                                        |
| `sprite:get-initial-state`                              | -                                                       | 获取初始全量状态                                                    |
| `sprite:list`                                           | -                                                       | 查询动画资源                                                        |
| `sprite:register`                                       | 动画定义                                                | 注册动画资源（`spriteManage` guard）                                |
| `sprite:remove`                                         | `{ id, deleteFile? }`                                   | 删除动画资源（`spriteManage` guard）                                |
| `sprite:update-config` / `sprite:update-meta`           | `{ id, patch }` / `{ id, meta }`                        | 更新动画播放配置 / 元数据（`spriteManage` guard）                   |
| `sprite:character:get-state`                            | -                                                       | 获取角色状态                                                        |
| `sprite:capabilities:get-snapshot`                      | -                                                       | 获取 runtime capability snapshot                                    |
| `sprite:character:get-info`                             | -                                                       | 获取角色信息                                                        |
| `sprite:character:list-packs`                           | -                                                       | 获取角色包列表                                                      |
| `sprite:character:get-active-pack`                      | -                                                       | 获取当前激活角色包                                                  |
| `sprite:character:activate-pack`                        | `{ packId, source? }`                                   | 激活角色包                                                          |
| `sprite:character:inspect-pack-from-archive`            | `{ archivePath }`                                       | 预检压缩包角色包                                                    |
| `sprite:character:install-pack-from-archive`            | `{ archivePath, replaceExisting?, activate? }`          | 从压缩包安装角色包                                                  |
| `sprite:character:remove-pack`                          | `{ packId, source? }`                                   | 删除已安装角色包                                                    |
| `sprite:character:export-pack`                          | `{ packId, outputPath, source? }`                       | 导出角色包为压缩包                                                  |
| `sprite:character:get-editor-draft`                     | `{ packId, source? }`                                   | 获取角色包编辑草稿                                                  |
| `sprite:character:save-editor-draft`                    | `{ draft, options? }`                                   | 保存角色包编辑草稿                                                  |
| `sprite:character:gallery:list`                         | `{ packId?, source?, query? }`                          | 列出角色图集                                                        |
| `sprite:character:gallery:import`                       | `{ packId?, source?, filePath, draft? }`                | 导入图集图片                                                        |
| `sprite:character:gallery:update`                       | `{ packId?, source?, itemId, patch }`                   | 更新图集元数据                                                      |
| `sprite:character:gallery:replace-image`                | `{ packId?, source?, itemId, filePath, origin? }`       | 替换图集图片                                                        |
| `sprite:character:gallery:remove`                       | `{ packId?, source?, itemId, deleteFile? }`             | 删除图集条目                                                        |
| `sprite:config:get-debug-overlay`                       | -                                                       | 获取调试辅助线开关                                                  |
| `sprite:config:set-debug-overlay`                       | `{ enabled }`                                           | 设置调试辅助线开关                                                  |
| `sprite:config:get-animation-playlist-mode`             | `{ trigger? }`                                          | 获取默认或指定 trigger 的动画列表播放模式                           |
| `sprite:config:set-animation-playlist-mode`             | `{ mode, trigger? }`                                    | 设置默认或指定 trigger 的动画列表播放模式                           |
| `sprite:config:get-bubble-mode`                         | -                                                       | 获取气泡窗口模式                                                    |
| `sprite:config:set-bubble-mode`                         | `{ mode }`                                              | 设置气泡窗口模式                                                    |
| `sprite:spontaneous:get-preferences`                    | -                                                       | 获取 AI 自发说话偏好                                                |
| `sprite:spontaneous:update-preferences`                 | `Partial<SpriteSpontaneousUtterancePreferences>`        | 更新 AI 自发说话偏好                                                |
| `sprite:spontaneous:list-history`                       | `{ limit?, query?, status?, intentCategory? }`          | 查询 AI 自发说话历史                                                |
| `sprite:purpose:start`                                  | `StartSpritePurposeRequest`                             | 启动 Purpose / Routine                                              |
| `sprite:purpose:event`                                  | `SpritePurposeRuntimeEventInput`                        | 上报供 Routine 等待的 purpose event                                 |
| `sprite:purpose:get-daily-retrospective`                | `{ date?, limit?, includeIdle?, minMemoryWorthiness? }` | 查询每日目的复盘摘要                                                |
| `sprite:speak`                                          | `{ text, bubbleEnabled?, bubbleDuration? }`             | 合成并播放语音 + 气泡                                               |
| `sprite:speak:get-config` / `sprite:speak:set-config`   | - / `Partial<SpriteSpeakConfig>`                        | 语音合成配置读写                                                    |
| `sprite:speak:get-cache-stats` / `clearCache`           | - / -                                                   | 语音缓存统计 / 清空                                                 |
| `sprite:speak:realtime:*`                               | 会话参数                                                | AI 回复实时朗读会话（start / appendText / flush / finish / cancel） |
| `sprite:trigger`                                        | `SpriteTriggerRequest`                                  | 统一事件触发                                                        |
| `sprite:trigger-by-id`                                  | `{ animationId, ... }`                                  | 按动画 ID 测试播放                                                  |

### 下行（主进程 → 渲染进程）

| 通道                   | 载荷                     | 说明                                                             |
| ---------------------- | ------------------------ | ---------------------------------------------------------------- |
| `sprite:play`          | `SpritePlayCommand`      | 播放动画命令                                                     |
| `sprite:state`         | `SpriteStateSnapshot`    | 状态变化广播                                                     |
| `app:message:bridge`   | `MessageBridgePayload`   | 统一消息桥（toast / notice / busy 的 show / clear）              |
| `sprite:walk`          | `{ active, direction? }` | 行走状态                                                         |
| `sprite:config`        | `SpriteConfig`           | 配置变化（含 `animationPlaylistMode`、`animationPlaylistModes`） |
| `sprite:speak-started`  | `SpriteSpeakPayload`     | 语音播放开始指令                                                 |

### Preload 桥接 API

当前相关 bridge 主要分布在 `window.chobits.sprite` 与 `window.chobits.character`。

**`window.chobits.sprite` / 动画管理**: `list()`, `register()`, `remove()`, `updateConfig()`, `updateMeta()`

**`window.chobits.sprite` / 交互上报**: `interact(type: SpriteInteractionIntent)`, `dragStart()`, `dragEnd()`, `animComplete()`

**`window.chobits.sprite` / 状态、配置与目的编排**: `getInitialState()`, `ready()`, `getDebugOverlay()`, `setDebugOverlay()`, `getAnimationPlaylistMode()`, `setAnimationPlaylistMode()`, `getBubbleMode()`, `setBubbleMode()`, `getSpontaneousUtterancePreferences()`, `updateSpontaneousUtterancePreferences()`, `listSpontaneousUtteranceHistory()`, `startPurpose()`, `emitPurposeEvent()`, `getPurposeDailyRetrospective()`

说明：

- auto-walk（自由移动）功能已移除：`getAutoWalk()` / `setAutoWalk()` bridge、`sprite:config:getAutoWalk` / `sprite:config:setAutoWalk` IPC 与 `movement` 能力节点均已删除，`SpriteConfig` 不再包含 `autoWalkEnabled`
- `onConfig()` 收到的 `SpriteConfig` 快照包含默认 `animationPlaylistMode` 与按 trigger 覆盖的 `animationPlaylistModes`
- AI 自发说话偏好 / 历史、Purpose / Routine 编排、每日目的复盘当前通过 `window.chobits.sprite.*` 暴露，而不是挂在 `character` bridge 下

**`window.chobits.sprite` / 语音合成**: `speak()`, `getSpeakConfig()`, `setSpeakConfig()`, `getSpeakCacheStats()`, `clearSpeakCache()`, `startRealtimeSpeechSession()`

**`window.chobits.sprite` / 事件触发**: `trigger()`, `testAnimation()`

**`window.chobits.sprite` / 气泡窗口**: `bubbleResize()`, `bubbleSetVisible()`

**`window.chobits.sprite` / 事件订阅**: `onPlay()`, `onState()`, `onWalk()`, `onConfig()`, `onSpeak()`

**`window.chobits.character` / 角色状态与 capability**: `getState()`, `getCapabilitySnapshot()`

**`window.chobits.character` / 角色与角色包**: `getCharacterInfo()`, `listCharacterPacks()`, `getActiveCharacterPack()`, `activateCharacterPack()`, `inspectCharacterPackFromArchive()`, `installCharacterPackFromArchive()`, `exportCharacterPack()`, `removeCharacterPack()`, `getCharacterPackEditorDraft()`, `saveCharacterPackEditorDraft()`, `listCharacterGallery()`, `importCharacterGalleryItem()`, `updateCharacterGalleryItem()`, `replaceCharacterGalleryItemImage()`, `removeCharacterGalleryItem()`

**`window.chobits.character` / 事件订阅**: `onStateChanged()`, `onCapabilityChanged()`, `onCharacterSwitched()`

---

## 事件类型系统

精灵事件按用途分组，定义在 `types.ts` 的 `SpriteEventGroups`：

| 分组        | 数量 | 示例事件                                                           |
| ----------- | ---- | ------------------------------------------------------------------ |
| interaction | 8    | click, hold, drag, hover, selection...   |
| feedback    | 8    | success, failure, celebrate, warning, error, info, confirm, deny   |
| status      | 5    | loading, processing, waiting, ready, complete                      |
| emotion     | 20   | happy, sad, angry, surprised, shy, curious, thinking, excited...   |
| action      | 22   | walk, run, jump, sit, stand, wave, nod, dance, spin, point...      |
| transition  | 12   | appear, disappear, wake, sleep, grow, shrink, fadeIn, fadeOut...   |
| connector   | 20   | connect, disconnect, upload, download, sync, search, install...    |
| ambient     | 10   | rain, snow, wind, sunny, cloudy, night, dawn, dusk, sleepy, breath |
| seasonal    | 9    | spring, summer, autumn, winter, christmas, halloween, newYear...   |
| special     | 10   | sparkle, burst, glow, float, shake, powerUp, levelUp, evolve...    |
| network     | 5    | connect, disconnect, timeout, slowNetwork, reconnect               |
| assist      | 6    | help, suggest, remind, teach, guide, encourage                     |
| workflow    | 8    | (UI 相关事件)                                                      |
| system      | 4    | boot, shutdown, update, crash                                      |

**总计约 150+ 事件类型**。

每个事件类型都有中文气泡文案（`messages/zh-CN.ts` 覆盖）。无对应动画时仅显示气泡文字，有动画时播放动画 + 气泡文字。

---

## 文件路径汇总

| 组件                               | 文件路径                                                      |
| ---------------------------------- | ------------------------------------------------------------- |
| SpriteManager                      | `packages/sprite-core/manager/sprite-manager.ts`              |
| Manager Types                      | `packages/sprite-core/manager/types.ts`                       |
| Persistence                        | `packages/sprite-core/manager/persistence.ts`                 |
| State Mapping                      | `packages/sprite-core/manager/state-mapping.ts`               |
| Default Behaviors                  | `packages/sprite-core/manager/default-behaviors.ts`           |
| StateMachine                       | `packages/sprite-core/state-machine.ts`                       |
| CharacterStateManager              | `packages/sprite-core/character-state.ts`                     |
| AnimationRegistry                  | `packages/sprite-core/animation-registry.ts`                  |
| BehaviorEngine                     | `packages/sprite-core/behavior-engine.ts`                     |
| InteractionTracker                 | `packages/sprite-core/interaction-tracker.ts`                 |
| EventBus                           | `packages/sprite-core/event-bus.ts`                           |
| CharacterService                   | `packages/sprite-core/character-service.ts`                   |
| CharacterGallery                   | `packages/sprite-core/character-gallery.ts`                   |
| CharacterGalleryManager            | `packages/sprite-core/character-gallery-manager.ts`           |
| WindowController                   | `packages/sprite-core/window-controller.ts`                   |
| WindowController Model             | `packages/sprite-core/window-controller-model.ts`             |
| WindowController Platform          | `packages/sprite-core/window-controller-platform.ts`          |
| WindowController Drag Session      | `packages/sprite-core/window-controller-drag-session.ts`      |
| WindowController Walk Session      | `packages/sprite-core/window-controller-walk-session.ts`      |
| WindowController Auto Move Session | `packages/sprite-core/window-controller-auto-move-session.ts` |
| IPC Handler                        | `packages/sprite-core/handlers/sprite-manager-ipc.ts`         |
| Event Listener                     | `packages/sprite-core/handlers/sprite-event-listener.ts`      |
| Sprite Assets                      | `packages/sprite-core/handlers/sprite-assets.ts`              |
| Messages Catalog                   | `packages/sprite-core/messages/zh-CN.ts`                      |
| SpeakService                       | `packages/sprite-core/speak/speak-service.ts`                 |
| Speak Types                        | `packages/sprite-core/speak/types.ts`                         |
| Preload Bridge                     | `packages/sprite-core/preload/sprite-bridge.ts`               |
| Shared Types                       | `packages/sprite-core/types.ts`                               |
| 动画配置                           | `resources/characters/index.json`                             |
| 角色图集配置                       | `resources/characters/gallery/index.json`                     |
| SpriteStateContext                 | `src/features/sprite/context/SpriteStateContext.tsx`          |
| VideoSprite                        | `src/features/sprite/renderers/VideoSprite.tsx`               |
| useDragCollector                   | `src/features/sprite/hooks/useDragCollector.ts`               |
| useSpriteSpeak                     | `src/features/sprite/speak/useSpriteSpeak.ts`                 |

---

## 扩展指南

### 添加新事件类型

1. 在 `types.ts` 的 `SpriteEventGroups` 中添加类型名
2. 在 `messages/zh-CN.ts` 添加对应文案（支持数组随机）
3. 调用：`SpriteManager.getInstance().trigger('myEvent')`

旧 `trigger-mapping` 兼容层已经删除，新事件不需要再新增场景映射。

### 添加新自发行为

```typescript
const sprite = SpriteManager.getInstance();
sprite.registerBehavior({
  id: 'suggest-break',
  name: '建议休息',
  enabled: true,
  priority: 'normal',
  schedule: { type: 'interval', intervalMs: 3600000 },
  conditions: [(ctx) => ctx.interactionStats.total > 100],
  action: async () => {
    sprite.showToast('工作了一段时间了，要不要休息一下？');
  },
  allowedStates: ['idle']
});
```

### 添加新动画

```typescript
sprite.registerAnimation({
  meta: {
    id: 'dance-happy',
    title: '开心跳舞',
    primaryTrigger: 'dance',
    triggerAliases: [],
    tags: ['action']
  },
  source: { localPath: '/path/to/dance.webm' },
  width: 200,
  height: 280,
  loop: true,
  loopCount: 2,
  durationMs: 3000
});
```

### 添加新精灵状态

```typescript
// 1. 扩展 SpriteState 类型 (state-machine.ts)
export type SpriteState = ... | 'dancing';

// 2. 注册转换规则
stateMachine.addTransition({ from: 'idle', to: 'dancing' });

// 3. 在 manager/state-mapping.ts 添加映射
case 'dancing': return 'dance';
```

---

## 暂停开发前验收清单

当前这轮 `sprite runtime` 重构已经接近“可冻结”状态：主链路 authority、角色包 lifecycle、capability runtime、movement coordinator 与 persona slot 切换已经落地，剩余工作主要是兼容层清理、少量执行入口继续下沉，以及高阶 preview / timed media follow-up。

如果准备暂时停止继续开发，建议至少完成以下检查，再把当前状态标记为 `freeze-safe`。

### 必跑自动化

- `pnpm vitest run test/sprite/sprite-manager-regression.spec.ts test/sprite/movement-coordinator.spec.ts test/capability/capability-registry.spec.ts test/sprite/character-pack-manager.spec.ts test/sprite/sprite-assets-pack.spec.ts`
- `pnpm vitest run test/sprite/sprite-renderer-mount.spec.tsx test/sprite/video-sprite-driver.spec.ts test/sprite/sprite-bridge.spec.ts test/sprite/character-pack-service.spec.ts test/sprite/sprite-event-listener.spec.ts`

### 必做手测

- 角色包链路：
  - `.cbpk` / `.zip` 导入
  - 替换冲突处理
  - 激活 pack 后 runtime reload
  - 删除当前 active pack 后自动回退到 fallback pack
- movement 链路：
  - movement preview 开始 / 停止后尺寸与 padding 恢复
  - `behavior + direction` 组合确实按配置方向移动
- capability 链路：
  - speechRecognition 关闭后，renderer 入口与主进程真实入口都被拒绝
- persona 链路：
  - 切换角色后 persona slot 正确恢复，不串档
- 动画链路：
  - 条件动画 persona 命中
  - 三段式 trigger 播放
  - pack 激活后动画资源真实切换

### 满足以下条件即可先停

- 上述自动化通过
- 手测没有出现以下四类问题：
  - capability 可以被绕过执行
  - 切换角色 / pack 后 persona 串档
  - movement preview 污染 live config
  - 删除 active pack 后 runtime 失效或停在错误资源上
- 文档状态可以记为：
  - `In Progress`
  - 或 `freeze-safe / 暂可冻结`

### 暂时只记 backlog 的尾项

- `packages/sprite-core/window-controller.ts`
  - 路径采样 / 自动移动步进 / 边界约束已下沉到 `window-controller-model.ts`；拖拽 / 行走 / 自动移动会话与平台访问也已拆到独立 helper，当前主要只剩 timer orchestration 与回调拼装，若继续收口可再抽 scheduler 层
- `packages/sprite-core/capability-registry.ts`
  - 默认 capability 定义还可以继续深入消费 pack / character / persona flags（avatar load-state 已接入；其余分支待补）
- trigger / metadata 兼容别名
  - `eventType` 旧输入 fallback 仍在，适合后续继续缩减兼容面
- `packages/sprite-core/character-pack-manager.ts`
  - trust-root 已支持 revoked key blocking；下一阶段工作转向 publisher key rotation 与更完整发布流程
