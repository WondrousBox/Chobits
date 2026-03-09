# sprite-core — 桌面精灵人格化核心引擎

## 概览

`sprite-core` 是 Chobits 桌面精灵的**纯逻辑层**，提供人格化核心引擎能力。它不依赖 React、Electron 或任何 UI 框架，可以独立测试和复用。

## 架构

```
packages/sprite-core/
├── index.ts                 # 导出入口
├── event-bus.ts             # 统一事件总线
├── state-machine.ts         # 精灵有限状态机
├── persona-state.ts         # 人格状态管理（XP/等级/好感度/心情）
├── interaction-tracker.ts   # 交互追踪器
├── behavior-engine.ts       # 行为引擎（自主行为调度）
├── animation-registry.ts    # 动画注册表
└── README.md                # 本文件
```

### 数据流

```
用户交互 → EventBus → InteractionTracker → 统计
                    → PersonaStateManager   → XP/等级/好感度变化 → EventBus → UI 更新
                    → StateMachine       → 状态切换 → 动画切换

BehaviorEngine (tick) → 检查条件 → 触发行为 → EventBus → StateMachine
                                            → PersonaStateManager
```

## 核心模块

### 1. SpriteEventBus — 统一事件总线

替代原有的简单 pub/sub（`spriteEvents.ts`），提供类型安全、优先级、历史追溯。

```typescript
import { spriteEventBus } from '@packages/sprite-core';

// 订阅
const off = spriteEventBus.on('interact:click', (event) => {
  console.log('clicked at', event.timestamp);
});

// 发射
spriteEventBus.emit('interact:click', { x: 100, y: 200 });

// 通配符订阅
spriteEventBus.on('*', (event) => {
  console.log(`[${event.type}]`, event.payload);
});
```

**事件类型分类：**

- `state:*` — 精灵状态变化
- `interact:*` — 用户交互
- `anim:*` — 动画播放
- `behavior:*` — 自主行为触发
- `persona:*` — 人格化事件（XP/等级/好感度）
- `system:*` — 系统事件

### 2. SpriteStateMachine — 有限状态机

声明式状态转换表，替代原有的 switch/case 状态管理。

```typescript
import { SpriteStateMachine } from '@packages/sprite-core';

const sm = new SpriteStateMachine({ eventBus });

// 状态转换
sm.transitionTo('walking');        // idle → walking ✓
sm.transitionTo('sleeping');       // walking → sleeping ✗ (无此转换)

// 临时状态（播放一次后自动回退）
sm.playOnce('click', { durationMs: 600 });

// 状态栈
sm.pushState('reacting');          // 保存当前状态到栈
sm.popState();                     // 恢复

// 监听变化
sm.onChange((newState, oldState) => { ... });

// 扩展新的转换规则
sm.addTransition({ from: 'idle', to: 'dancing' as any });
```

**预定义状态：**
`idle` | `walking` | `running` | `dragging` | `sleeping` | `reacting` | `bored`

### 3. PersonaStateManager — 人格化状态管理

完整的 RPG 数值系统。

```typescript
import { PersonaStateManager } from '@packages/sprite-core';

const gsm = new PersonaStateManager({
  eventBus,
  onStateChange: (state) => {
    /* 更新 UI */
  }
});

// 经验值
gsm.addXP(50, 'conversation'); // 自动处理升级
console.log(gsm.getXPProgress()); // 0.0 ~ 1.0

// 好感度
gsm.changeFavor(1.5, '日常交互'); // 0 ~ 100
console.log(gsm.getState().favorLevel); // 'friend' | 'close-friend' | ...

// 心情
gsm.setMood('joyful', 80);
gsm.evaluateMood(); // 自动按规则更新心情
gsm.startMoodDecay(); // 心情自然衰减（向 neutral 靠拢）

// 每日登录
const { isNewDay, streak } = gsm.recordDailyLogin();

// 成就
gsm.unlockAchievement('first-click');
```

**自动规则（通过 EventBus 触发）：**

- 点击 → +2 XP, +0.5 好感度
- 拖拽 → +3 XP, +0.3 好感度
- 文件拖放 → +10 XP, +1 好感度
- 对话 → +15 XP, +1.5 好感度
- 每日登录 → +50 XP, +2 好感度
- 连续登录 → +25×streak XP
- 长时间不使用 → -5 好感度

### 4. InteractionTracker — 交互追踪器

滑动窗口统计，为行为引擎和游戏化提供数据。

```typescript
import { InteractionTracker } from '@packages/sprite-core';

const tracker = new InteractionTracker({ eventBus });

// 自动追踪（订阅 interact:* 事件）
// 或者手动记录
tracker.record('custom', { reason: 'voice-command' });

// 查询
const stats = tracker.getStats();
console.log(stats.frequency); // 次/分钟
console.log(stats.idleDuration); // 空闲时间(ms)
console.log(stats.todayCount); // 今日交互次数
console.log(tracker.isActive()); // 最近1分钟有交互？
```

### 5. BehaviorEngine — 行为引擎

可扩展的自主行为调度系统，替代原有硬编码的 `createBehaviors`。

```typescript
import { BehaviorEngine, createAutoWalkBehavior } from '@packages/sprite-core';

const engine = new BehaviorEngine({ eventBus, stateMachine });

// 注册预置行为
engine.register(
  createAutoWalkBehavior(async (ctx) => {
    // 执行行走动画...
  })
);

// 注册自定义行为
engine.register({
  id: 'dance-on-level-up',
  name: '升级跳舞',
  enabled: true,
  priority: 'high',
  schedule: { type: 'interval', intervalMs: 5000 },
  conditions: [(ctx) => ctx.personaState.level > 5],
  probability: 0.5,
  action: async (ctx) => {
    // 播放跳舞动画...
  },
  minFavor: 60, // 需要好感度 ≥ 60
  minLevel: 5, // 需要等级 ≥ 5
  allowedStates: ['idle'],
  cooldownMs: 300000, // 5分钟冷却
  dailyLimit: 3 // 每天最多3次
});

// 启动引擎
engine.setContextProvider(() => ({
  spriteState: stateMachine.getState(),
  personaState: gsm.getState(),
  interactionStats: tracker.getStats(),
  now: new Date(),
  screenSize: { width: 1920, height: 1080 }
}));
engine.start();
```

### 6. AnimationRegistry — 动画注册表

统一的动画索引，支持条件动画选择。

```typescript
import { AnimationRegistry } from '@packages/sprite-core';

const registry = new AnimationRegistry();

// 注册带条件的动画：好感度高时使用开心版本
registry.register({
  id: 'idle-happy',
  title: '开心待机',
  eventTypes: ['idle'],
  priority: 10,
  condition: (personaState) => personaState.favor >= 80,
  source: { localPath: '/sprites/idle-happy.webm' },
  playback: { width: 180, height: 240, loop: true }
});

registry.register({
  id: 'idle-default',
  title: '默认待机',
  eventTypes: ['idle'],
  priority: 0,
  source: { localPath: '/sprites/idle.webm' },
  playback: { width: 180, height: 240, loop: true }
});

// 查找最佳匹配
const anim = registry.findByEvent({
  eventType: 'idle',
  personaState: gsm.getState()
});
// 好感度 ≥ 80 返回 'idle-happy'，否则返回 'idle-default'
```

## 扩展指南

### 添加新的精灵状态

```typescript
// 1. 在 state-machine.ts 中扩展 SpriteState 类型
export type SpriteState = ... | 'dancing';

// 2. 注册转换规则
stateMachine.addTransition({ from: 'idle', to: 'dancing' });
stateMachine.addTransition({ from: 'dancing', to: 'idle' });

// 3. 配置状态行为
stateMachine.setStateConfig('dancing', {
  animationEvent: 'dance',
  ephemeral: true,
  duration: 5000,
});
```

### 添加新的游戏化机制

```typescript
// 新的 XP 来源
personaStateManager.registerXPSource({
  id: 'voice-command',
  event: 'interact:voice-command',
  baseXP: 20,
  dailyLimit: 50
});

// 新的好感度修改器
personaStateManager.registerFavorModifier({
  id: 'pet-head',
  event: 'interact:pet-head',
  delta: 2,
  cooldown: 10000,
  dailyLimit: 10
});

// 新的心情规则
personaStateManager.registerMoodRule({
  id: 'listening-music',
  trigger: (state) => state.totalSessionTime > 3600,
  targetMood: 'content',
  intensity: 70,
  priority: 3
});
```

### 添加新的自主行为

```typescript
behaviorEngine.register({
  id: 'suggest-break',
  name: '建议休息',
  enabled: true,
  priority: 'normal',
  schedule: { type: 'interval', intervalMs: 3600000 }, // 每小时
  conditions: [(ctx) => ctx.interactionStats.total > 100, (ctx) => ctx.personaState.mood !== 'sleepy'],
  action: async () => {
    // 显示休息提醒消息
    spriteEventBus.emit('behavior:message-triggered', {
      category: 'reminder',
      text: '工作了一段时间了，要不要休息一下？'
    });
  },
  minFavor: 40, // 需要有一定好感度才会主动关心
  allowedStates: ['idle']
});
```

## 与现有代码的关系

| 旧模块（已移除）                           | 新模块                                        | 说明                                                   |
| ------------------------------------------ | --------------------------------------------- | ------------------------------------------------------ |
| `spriteEvents.ts`                          | `SpriteEventBus`                              | 类型安全的统一事件总线，替代简单 pub/sub               |
| `useSpriteConductor`                       | `SpriteStateMachine`                          | 状态机驱动 conductor，conductor 保留为动画解析层       |
| `useSpriteEventController`                 | `useSpriteStateBridge`                        | 桥接 StateMachine → Conductor，处理 IPC sprite-command |
| `useBehaviorScheduler` + `createBehaviors` | `BehaviorEngine`                              | 声明式行为引擎，支持条件/优先级/冷却/插件扩展          |
| `status.ts` (role.json)                    | `PersonaStateService` + `PersonaStateManager` | 持久化统一到 persona-state.json                        |
| `SpriteAnimation` 类型                     | `AnimationRegistry` + `AnimationEntry`        | 注册表提供更灵活的查询与条件动画                       |

---

## 7. 动画播放流程

### 7.1 状态到动画的映射

```
状态变化
    ↓
mapStateToEventType(state, subState)
    ↓
事件类型 (eventType)
    ↓
AnimationRegistry.findByEvent({ eventType })
    ↓
动画配置 (AnimationEntry)
    ↓
IPC: sprite:play → 渲染进程播放
```

**映射表**:

| 主状态 | 子状态 | 事件类型 |
|--------|--------|----------|
| `idle` | - | `idle` |
| `walking` | - | `walk` |
| `running` | - | `run` |
| `dragging` | - | `drag` |
| `sleeping` | - | `sleep` |
| `bored` | - | `bored` |
| `reacting` | `click` | `click` |
| `reacting` | `hold` | `hold` |
| `reacting` | `drop` | `drop` |
| `reacting` | `file-drag-over` | `fileDragOver` |
| `reacting` | `file-drop` | `fileDrop` |
| `reacting` | `sleepy` | `sleep` |
| `reacting` | `celebrate` | `celebrate` |
| `reacting` | `emotion` | `happy` |

### 7.2 三段式动画

某些动画（如行走、文件拖拽悬停）需要 **intro → loop → outro** 三段播放：

```
┌─────────┬──────────────────┬─────────┐
│  intro  │      loop        │  outro  │
│ 0~500ms │  500ms~2500ms    │ 2500ms~ │
│ (一次)  │    (循环)        │ (一次)  │
└─────────┴──────────────────┴─────────┘
```

配置示例（`sprites/index.json`）：
```json
{
  "loopStartMs": 500,
  "loopEndMs": 2500
}
```

### 7.3 playOnce vs transitionTo

| 方法 | 用途 | 自动回退 |
|------|------|----------|
| `playOnce(subState, { durationMs })` | 临时反应动画 | ✅ 自动回退到之前状态 |
| `transitionTo(state)` | 持久状态切换 | ❌ 不会自动回退 |

---

## 8. 触发机制

### 8.1 用户交互触发

| 交互 | 触发位置 | IPC | 主进程处理 |
|------|----------|-----|-----------|
| 点击 | `useDragCollector` | `sprite:interact` | `playOnce('click')` |
| 长按 | `useDragCollector` | `sprite:interact` | `playOnce('hold')` |
| 拖拽 | `useDragCollector` | `sprite:drag` | `transitionTo('dragging')` |
| 文件悬停 | `useFileDropCollector` | `sprite:interact` | `playOnce('file-drag-over')` |
| 文件拖放 | `useFileDropCollector` | `sprite:file-drop` | `playOnce('file-drop')` |

### 8.2 业务事件触发

通过 `AppEvent` 事件系统触发，解耦业务模块和精灵模块：

```typescript
import { eventManager } from '@packages/event';
import { AppEvent } from '@packages/event/events';

// AI 开始处理
eventManager.emit(AppEvent.SPRITE_AI_START);

// AI 处理完成
eventManager.emit(AppEvent.SPRITE_AI_COMPLETE, { message: '生成完成！' });

// 工作流进度
eventManager.emit(AppEvent.SPRITE_WORKFLOW_PROGRESS, { progress: 50 });
```

| 事件 | 触发时机 | 动画效果 |
|------|----------|----------|
| `SPRITE_AI_START` | AI 开始处理 | `playOnce('emotion')` + toast |
| `SPRITE_AI_COMPLETE` | AI 处理完成 | `playOnce('celebrate')` + toast |
| `SPRITE_WORKFLOW_START` | 工作流开始 | `showBusy()` + `playOnce('emotion')` |
| `SPRITE_WORKFLOW_COMPLETE` | 工作流完成 | `clearBusy()` + `playOnce('celebrate')` |
| `SPRITE_RESOURCE_IMPORT_START` | 资源导入开始 | `showBusy()` |
| `SPRITE_RESOURCE_IMPORT_COMPLETE` | 资源导入完成 | `clearBusy()` + `playOnce('celebrate')` |

### 8.3 自主行为触发

| 行为 ID | 触发条件 | 动作 |
|---------|----------|------|
| `auto-walk` | idle/bored 状态，空闲 > 5秒，80% 概率 | 随机行走到屏幕某位置 |
| `night-sleepy` | 22:00-06:00 时间窗口 | `playOnce('sleepy')` |
| `idle-sleepy` | 空闲 > 100秒 | `playOnce('sleepy')` |
| `long-idle-bored` | 空闲 > 2分钟 | `transitionTo('bored')` |
| `random-message` | idle 状态，空闲 > 1分钟 | `showToast(random tip)` |
| `favor-decay` | 空闲 > 30分钟，好感度 > 20 | `changeFavor(-1)` |

---

## 9. IPC 通信协议

### 9.1 上行（渲染进程 → 主进程）

| 通道 | 说明 | 载荷 |
|------|------|------|
| `sprite:interact` | 交互上报 | `{ type, data? }` |
| `sprite:drag` | 拖拽事件 | `{ phase, screenX?, screenY?, offsetX?, offsetY? }` |
| `sprite:anim-complete` | 动画完成 | `{ animId, phase }` |
| `sprite:file-drop` | 文件拖放 | `{ files }` |
| `sprite:ready` | 渲染进程就绪 | - |
| `sprite:get-initial-state` | 获取初始状态 | - |

### 9.2 下行（主进程 → 渲染进程）

| 通道 | 说明 | 载荷 |
|------|------|------|
| `sprite:play` | 播放动画命令 | `SpritePlayCommand` |
| `sprite:state` | 状态变化 | `SpriteStateSnapshot` |
| `sprite:message` | 消息 | `MessageIPCPayload` |
| `sprite:walk` | 行走状态 | `{ active, direction? }` |
| `sprite:busy:update` | 忙碌进度 | `{ progress, message? }` |
| `sprite:busy:clear` | 清除忙碌 | - |

### 9.3 Preload 桥接 API

```typescript
// 通过 window.YUA.sprite 访问
interface SpriteBridgeType {
  // 交互上报
  interact(type: string, data?: any): Promise<void>;

  // 拖拽
  dragStart(offsetX: number, offsetY: number): Promise<void>;
  dragMove(screenX: number, screenY: number): Promise<void>;
  dragEnd(): Promise<void>;

  // 动画完成上报
  animComplete(animId: string, phase: string): Promise<void>;

  // 文件拖放
  fileDrop(files: any[]): Promise<void>;

  // 初始状态
  getInitialState(): Promise<SpriteInitialState>;
  ready(): Promise<void>;

  // 配置
  getAutoWalk(): Promise<boolean>;
  setAutoWalk(enabled: boolean): Promise<boolean>;

  // 事件订阅
  onPlay(cb: (data) => void): () => void;
  onState(cb: (data) => void): () => void;
  onMessage(cb: (data) => void): () => void;
  onWalk(cb: (data) => void): () => void;
  onBusyUpdate(cb: (data) => void): () => void;
  onBusyClear(cb: () => void): () => void;
}
```

---

## 10. 动画配置文件

### 10.1 文件位置

- 默认动画：`resources/sprites/index.json`
- 用户动画：`{userData}/data/sprites/`

### 10.2 配置格式

```json
{
  "version": 1,
  "items": [
    {
      "meta": {
        "id": "idle-default",
        "title": "Idle 默认站立",
        "description": "默认的待机动画",
        "tags": ["idle", "default"],
        "eventType": "idle"
      },
      "source": {
        "localPath": "./idle.webm",
        "type": "video/webm"
      },
      "width": 180,
      "height": 240,
      "padding": 100,
      "autoplay": true,
      "muted": true,
      "loop": true,
      "loopStartMs": 500,
      "loopEndMs": 2500
    }
  ]
}
```

### 10.3 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `meta.id` | string | 唯一标识符 |
| `meta.title` | string | 显示名称 |
| `meta.eventType` | string | 关联的事件类型 |
| `source.localPath` | string | 本地视频文件路径 |
| `width/height` | number | 视频尺寸 |
| `loop` | boolean | 是否循环播放 |
| `loopStartMs/loopEndMs` | number | 三段式动画循环段时间范围 |

---

## 11. 文件路径汇总

| 组件 | 文件路径 |
|------|----------|
| SpriteManager | `packages/sprite-core/sprite-manager.ts` |
| StateMachine | `packages/sprite-core/state-machine.ts` |
| AnimationRegistry | `packages/sprite-core/animation-registry.ts` |
| BehaviorEngine | `packages/sprite-core/behavior-engine.ts` |
| IPC Handler | `packages/sprite-core/handler/sprite-manager-ipc.ts` |
| Event Listener | `packages/sprite-core/handler/sprite-event-listener.ts` |
| Preload Bridge | `packages/sprite-core/preload/sprite-bridge.ts` |
| 动画配置 | `resources/sprites/index.json` |
| SpriteStateContext | `src/features/sprite-assistant/context/SpriteStateContext.tsx` |
| VideoSprite | `src/features/sprite-assistant/renderers/VideoSprite.tsx` |
| useDragCollector | `src/features/sprite-assistant/hooks/useDragCollector.ts` |
| useFileDropCollector | `src/features/sprite-assistant/hooks/useFileDropCollector.ts` |
