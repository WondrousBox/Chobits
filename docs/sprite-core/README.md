# sprite-core — 桌面精灵人格化核心引擎

## 概览

`sprite-core` 是 Chobits 桌面精灵的**纯逻辑层**，提供人格化核心引擎能力。它不依赖 React、Electron 或任何 UI 框架，可以独立测试和复用。

## 架构

```
packages/sprite-core/
├── index.ts                    # 导出入口
├── event-bus.ts                # 统一事件总线
├── state-machine.ts            # 精灵有限状态机
├── persona-state.ts            # 人格状态管理（XP/等级/好感度/心情）
├── interaction-tracker.ts      # 交互追踪器
├── behavior-engine.ts          # 行为引擎（自主行为调度）
├── animation-registry.ts       # 动画注册表
├── character-service.ts        # 角色定义服务（人格模板、对话奖励、维度）
├── window-controller.ts        # 窗口控制器（行走/拖拽/位置）
├── types.ts                    # 共享类型定义（150+ 事件类型）
├── manager/                    # SpriteManager 门面模块
│   ├── index.ts                # barrel 导出
│   ├── sprite-manager.ts       # SpriteManager 主类（单例门面）
│   ├── types.ts                # 平台抽象接口/初始化选项
│   ├── persistence.ts          # 人格状态持久化 + 自动行走配置
│   ├── state-mapping.ts        # 状态→事件映射函数
│   └── default-behaviors.ts    # 默认自发行为注册
├── handler/                    # IPC 处理层
│   ├── index.ts                # barrel 导出
│   ├── sprite-manager-ipc.ts   # SpriteManager IPC 绑定
│   ├── sprite-event-listener.ts# AppEvent → 精灵动画触发
│   └── sprite-assets.ts        # 动画资源文件管理
├── helper/                     # 辅助函数
│   └── trigger-animation.ts    # 业务触发动画的便捷函数
├── config/                     # 配置
│   └── trigger-mapping.ts      # 场景→动画触发映射表
├── messages/                   # 消息文案
│   └── zh-CN.ts                # 中文气泡文案目录（53+ 类别 + 150+ 事件文案）
├── speak/                      # 语音合成模块
│   ├── index.ts
│   ├── speak-service.ts        # Edge TTS 语音合成服务
│   ├── speak-cache.ts          # 语音缓存管理
│   ├── speak-config-store.ts   # 语音配置持久化
│   └── types.ts                # 语音类型定义
└── preload/                    # Preload 桥接层
    ├── index.ts
    └── sprite-bridge.ts        # window.YUA.sprite API 暴露
```

### 数据流

```
用户交互 → EventBus → InteractionTracker → 统计
                    → PersonaStateManager   → XP/等级/好感度变化 → EventBus → UI 更新
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
│  ├ PersonaStateManager      # XP/等级/好感度/心情          │
│  ├ InteractionTracker       # 交互统计                    │
│  ├ BehaviorEngine           # 自主行为调度 (tick 1s)       │
│  ├ AnimationRegistry        # 事件→动画映射               │
│  ├ WindowController         # 行走/位置/拖拽               │
│  ├ SpeakService             # Edge TTS 语音合成            │
│  └ PersonaStatePersistence  # JSON 持久化 (debounced)     │
└──────────────────────────────────────────────────────────┘

渲染进程 (纯展示+交互采集)
┌──────────────────────────────────────────────────────────┐
│ <SpriteStateProvider>       # 接收 IPC 状态，提供 Context │
│   <SpriteAssistant>                                      │
│     ├ AnimationPlayer       # 收到 animId → 播放视频      │
│     ├ SpriteMessage         # 收到 sprite:message → 展示  │
│     ├ DragCollector         # 交互采集 → sprite:interact   │
│     ├ FileDropCollector     # 文件拖放 → sprite:file-drop  │
│     └ SpeakPlayer           # 语音播放 → sprite:speak      │
└──────────────────────────────────────────────────────────┘
```

---

## 核心模块

### 1. SpriteManager — 主进程门面 (Façade)

**文件**: `manager/sprite-manager.ts`

单例门面类，作为 sprite-core 引擎在主进程的统一入口。所有主进程模块通过 `SpriteManager.getInstance()` 一行代码控制精灵。

```typescript
import { SpriteManager } from '@packages/sprite-core';
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

// ===== 人格化 =====
sprite.addXP(15, 'conversation');
sprite.changeFavor(1.5, 'interaction');
sprite.setMood('joyful', 80);
sprite.getPersonaState();
sprite.recordDailyLogin();
sprite.unlockAchievement('first-chat');
sprite.updateDimension('curiosity', 5, 100);
sprite.initDimensions([{ id: 'curiosity', initialValue: 50 }]);
sprite.resetPersonaState();

// ===== 窗口 =====
sprite.walkTo(500, 300);
sprite.stopWalk();
sprite.getPosition();
sprite.setPosition(100, 200);
sprite.startDrag(offsetX, offsetY);
sprite.endDrag();

// ===== 交互 =====
sprite.reportInteraction('click');
sprite.reportInteraction('file-drop', { fileCount: 3 });

// ===== 动画 =====
sprite.registerAnimation(anim);
sprite.registerAnimations([anim1, anim2]);
sprite.unregisterAnimation('idle-happy');
sprite.getAnimationList();
sprite.getCurrentAnimation();

// ===== 配置 =====
sprite.getSpriteConfig();
sprite.setSpriteConfig({ width: 200, height: 200 });
sprite.isAutoWalkEnabled();
sprite.setAutoWalkEnabled(true);
sprite.isDebugOverlayEnabled();
sprite.setDebugOverlayEnabled(true);

// ===== 事件 =====
const off = sprite.on('persona:level-up', handler);
off();
sprite.emit('custom:event', data);

// ===== 行为 =====
sprite.registerBehavior(myCustomBehavior);
```

#### SpriteManager 内部模块

| 模块     | 文件                           | 职责                                                                 |
| -------- | ------------------------------ | -------------------------------------------------------------------- |
| 类型定义 | `manager/types.ts`             | `SpriteWindow`、`SpriteManagerOptions`、`PersonaStatePersistenceRow` |
| 持久化   | `manager/persistence.ts`       | `PersonaStatePersistence`（JSON 文件 + 自动保存）、`AutoWalkConfig`  |
| 状态映射 | `manager/state-mapping.ts`     | `mapStateToEventType()` — 状态机 → AnimationRegistry 事件类型        |
| 默认行为 | `manager/default-behaviors.ts` | 10 个内置自发行为的注册函数                                          |

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
- `persona:*` — 人格化事件（XP/等级/好感度）
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

**子状态 (SpriteSubState)**:
`click` | `hold` | `drop` | `file-drag-over` | `file-drop` | `sleepy` | `emotion` | `celebrate` | `custom`

### 4. PersonaStateManager — 人格化状态管理

完整的 RPG 数值系统。

```typescript
const psm = new PersonaStateManager({
  eventBus,
  onStateChange: (state) => {
    /* 更新 UI */
  }
});

psm.addXP(50, 'conversation');
psm.changeFavor(1.5, '日常交互');
psm.setMood('joyful', 80);
psm.startMoodDecay();
psm.recordDailyLogin();
psm.unlockAchievement('first-click');
psm.updateDimension('curiosity', 5, 100);
psm.initDimensions([{ id: 'curiosity', initialValue: 50 }]);
```

**心情类型 (MoodType)**:
`joyful` | `content` | `neutral` | `bored` | `sad` | `sleepy` | `excited` | `curious` | `annoyed`

**好感度等级 (FavorLevel)**:

| 等级           | 范围   |
| -------------- | ------ |
| `stranger`     | 0–19   |
| `acquaintance` | 20–39  |
| `friend`       | 40–59  |
| `close-friend` | 60–79  |
| `bestie`       | 80–94  |
| `soulmate`     | 95–100 |

**自动规则（通过 EventBus 触发）**:

- 点击 → +2 XP, +0.5 好感度
- 拖拽 → +3 XP, +0.3 好感度
- 文件拖放 → +10 XP, +1 好感度
- 对话 → +15 XP, +1.5 好感度
- 每日登录 → +50 XP, +2 好感度
- 连续登录 → +25×streak XP
- 长时间不使用 → -5 好感度

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

**交互类型 (InteractionType)**:
`click` | `double-click` | `drag` | `hold` | `hover` | `file-drag-over` | `file-drag-leave` | `file-drop` | `context-menu` | `conversation` | `walk-trigger` | `custom`

### 6. BehaviorEngine — 行为引擎

可扩展的自主行为调度系统，tick 驱动（默认 1 秒间隔）。

```typescript
const engine = new BehaviorEngine({ eventBus, stateMachine, tickIntervalMs: 1000 });

engine.register({
  id: 'dance-on-level-up',
  name: '升级跳舞',
  enabled: true,
  priority: 'high',
  schedule: { type: 'interval', intervalMs: 5000 },
  conditions: [(ctx) => ctx.personaState.level > 5],
  probability: 0.5,
  action: async (ctx) => {
    /* ... */
  },
  minFavor: 60,
  minLevel: 5,
  allowedStates: ['idle'],
  cooldownMs: 300000,
  dailyLimit: 3
});

engine.setContextProvider(() => ({
  spriteState: sm.getState(),
  personaState: psm.getState(),
  interactionStats: tracker.getStats(),
  now: new Date(),
  screenSize: { width: 1920, height: 1080 },
  position: [x, y]
}));
engine.start();
```

**预置行为工厂函数**（共 10 个，5 个从 index.ts 导出）:

| 函数                            | 导出 | 说明                             |
| ------------------------------- | ---- | -------------------------------- |
| `createAutoWalkBehavior()`      | ✅   | 自动行走到屏幕随机位置           |
| `createSleepyBehavior()`        | ✅   | 22:00-06:00 打哈欠               |
| `createIdleSleepyBehavior()`    | 内部 | 空闲 >100 秒打哈欠               |
| `createBoredBehavior()`         | ✅   | 空闲 >2 分钟无聊状态             |
| `createRandomMessageBehavior()` | ✅   | 空闲 >1 分钟随机消息             |
| `createFavorDecayBehavior()`    | ✅   | 空闲 >30 分钟好感度衰减          |
| `createEmotionBehavior()`       | 内部 | 随机情感（按好感度分池）         |
| `createActionBehavior()`        | 内部 | 随机动作（高好感解锁更多）       |
| `createAmbientBehavior()`       | 内部 | 氛围微动画（breath/blink/float） |
| `createSeasonalBehavior()`      | 内部 | 季节/节日行为                    |

### 7. AnimationRegistry — 动画注册表

统一的动画索引，支持条件动画选择（按好感度/等级选择不同动画变体）。

```typescript
const registry = new AnimationRegistry();

registry.register({
  id: 'idle-happy',
  title: '开心待机',
  eventTypes: ['idle'],
  priority: 10,
  condition: (personaState) => personaState.favor >= 80,
  source: { localPath: '/sprites/idle-happy.webm' },
  playback: { width: 180, height: 240, loop: true }
});

const anim = registry.findByEvent({
  eventType: 'idle',
  personaState: psm.getState()
});
```

主要方法: `register()`, `registerAll()`, `unregister()`, `get()`, `getAll()`, `findByEvent()`, `clear()`

### 8. CharacterService — 角色定义服务

从 `character.json` 加载角色模板，提供人格 prompt、对话奖励、维度定义、工具标签覆盖等。

```typescript
import {
  initCharacterService,
  getCharacterInfo,
  getCharacterDefinition,
  buildCharacterPersonaPrompt,
  getConversationRewards,
  getDimensionSchema,
  getFavorPersonaOverlay,
  getCharacterToolLabels,
  reloadCharacter
} from '@packages/sprite-core';
```

### 9. WindowController — 窗口控制器

主进程中管理精灵窗口的位置移动，包括贝塞尔曲线路径行走、拖拽、自动移动、边界约束。

```typescript
import { WindowController } from '@packages/sprite-core';

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

| 模式        | 说明                                                                   |
| ----------- | ---------------------------------------------------------------------- |
| `direction` | 沿固定方向恒速移动，到达屏幕边界停止                                   |
| `walkTo`    | 随机选取屏幕位置，沿贝塞尔曲线路径移动（三段式动画：intro→loop→outro） |

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

Edge TTS 语音合成服务，支持缓存、配置管理、自动播放。

```typescript
// 通过 SpriteManager API 使用
await sprite.speak('你好，我是你的桌面助手！');
await sprite.synthesizeSpeech('预合成这段文字');

const config = sprite.getSpeakConfig();
sprite.setSpeakConfig({ voiceName: 'zh-CN-YunxiNeural', rate: 20 });
sprite.resetSpeakConfig();

const stats = sprite.getSpeakCacheStats();
await sprite.clearSpeakCache();
```

**SpriteSpeakConfig**:

| 字段          | 类型     | 说明                                  |
| ------------- | -------- | ------------------------------------- |
| `enabled`     | boolean  | 是否启用语音合成                      |
| `serviceType` | `'Edge'` | TTS 服务类型                          |
| `voiceName`   | string   | 语音名称（如 `zh-CN-XiaoxiaoNeural`） |
| `rate`        | number   | 语速 (-100 ~ 200)                     |
| `pitch`       | number   | 音高 (-100 ~ 200)                     |
| `volume`      | number   | 音量 (0 ~ 1)                          |

#### 语音工作流程

```
渲染进程                              主进程                    精灵窗口
    │                                   │                         │
    │  window.YUA.sprite.speak('你好') │                         │
    │ ─────────────────────────────────►│                         │
    │                                   │                         │
    │                            合成音频 (Edge TTS)              │
    │                            缓存检查/存储                    │
    │                                   │                         │
    │                                   │  sprite:speak 事件      │
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
mapStateToEventType(state, subState)    # manager/state-mapping.ts
    ↓
事件类型 (eventType)
    ↓
AnimationRegistry.findByEvent({ eventType, personaState })
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
| `reacting` | `drop`           | `drop`         |
| `reacting` | `file-drag-over` | `fileDragOver` |
| `reacting` | `file-drop`      | `fileDrop`     |
| `reacting` | `sleepy`         | `sleep`        |
| `reacting` | `celebrate`      | `celebrate`    |
| `reacting` | `emotion`        | `happy`        |

### 三段式动画

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

### playOnce vs transitionTo

| 方法                                 | 用途         | 自动回退              |
| ------------------------------------ | ------------ | --------------------- |
| `playOnce(subState, { durationMs })` | 临时反应动画 | ✅ 自动回退到之前状态 |
| `transitionTo(state)`                | 持久状态切换 | ❌ 不会自动回退       |

### 统一事件触发 trigger()

`SpriteManager.trigger(eventType, options?)` 是所有事件类型的统一触发入口：

- 查 AnimationRegistry → 有动画播动画+气泡，无动画仅气泡
- 不走状态机重解析，直接发送 `sprite:play` 指令
- 渲染端可通过 `window.YUA.sprite.trigger()` 调用

### 消息文案查找机制

`zh-CN.ts` 中定义了两层文案：

1. **MessageCatalog (catalog)** — 按 `MessageCategory` 索引（53 个类别），用于 `showToast(undefined, { category })` 查找
2. **spriteEventMessages** — 按 `SpriteEventType` 索引（150+ 条目），用于 `trigger()` 和 `getSpriteEventText()` 查找

**查找优先级（`getSpriteEventText(eventType, ctx)`）**：

1. `spriteEventMessages[eventType]` — 优先查找事件专用文案
2. `catalog[eventType]` — fallback 到 MessageCategory 文案（部分事件名与类别名重叠）
3. 返回空字符串

**重要规则**: 在 `sprite-event-listener.ts` 中的 handler 避免硬编码 fallback 文案，应统一通过 `getSpriteEventText(eventKey)` 从文案目录获取，确保文案定制化生效，支持随机选取和上下文插值。

```typescript
// ✅ 正确写法 — 使用文案目录
mgr.showToast(data?.message || getSpriteEventText('memoryExtractComplete'), { category: 'success' });

// ❌ 错误写法 — 硬编码字符串绕过文案目录
mgr.showToast(data?.message || '记忆整理完毕！', { category: 'success' });
```

### 动画配置文件

- 默认动画：`resources/sprites/index.json`
- 用户动画：`{userData}/data/sprites/`

```json
{
  "version": 1,
  "items": [
    {
      "meta": {
        "id": "idle-default",
        "title": "Idle 默认站立",
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
      "loop": true,
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
| `mode`             | SpriteMovementMode      | ❌   | `direction` | 移动模式：`direction`（方向移动）或 `walkTo`（随机行走）     |
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
await window.YUA.sprite.setDebugOverlay(true);

// 查询当前状态
const enabled = await window.YUA.sprite.getDebugOverlay();
```

**显示内容**:

- **外边框**（绿色虚线）：含 padding 的完整可点击区域
- **内边框**（橙色实线）：精灵内容区域
- **文字标签**：`padding=100 | 180×240` 显示当前尺寸信息

---

## 触发机制

### A. 用户交互触发

| 交互     | 触发位置               | IPC                | 主进程处理                                                 |
| -------- | ---------------------- | ------------------ | ---------------------------------------------------------- |
| 点击     | `useDragCollector`     | `sprite:interact`  | `playOnce('click')`                                        |
| 长按     | `useDragCollector`     | `sprite:interact`  | `playOnce('hold')`                                         |
| 拖拽     | `useDragCollector`     | `sprite:drag`      | `transitionTo('dragging')`                                 |
| 文件悬停 | `useFileDropCollector` | `sprite:interact`  | `transitionTo('reacting', { subState: 'file-drag-over' })` |
| 文件拖放 | `useFileDropCollector` | `sprite:file-drop` | `reportInteraction('file-drop')`                           |

### B. 业务事件触发 (AppEvent → sprite-event-listener)

通过 `AppEvent` 事件系统解耦：

```typescript
import { eventManager } from '@packages/event';
import { AppEvent } from '@packages/event/events';

eventManager.emit(AppEvent.SPRITE_AI_START);
eventManager.emit(AppEvent.SPRITE_AI_COMPLETE, { message: '生成完成！' });
```

| 事件                                  | 触发时机     | 效果                                    | 文案来源                               |
| ------------------------------------- | ------------ | --------------------------------------- | -------------------------------------- |
| `SPRITE_AI_START`                     | AI 开始处理  | `playOnce('emotion')` + toast           | `spriteEventMessages.aiThinking`       |
| `SPRITE_AI_COMPLETE`                  | AI 处理完成  | `playOnce('celebrate')` + toast         | `spriteEventMessages.aiComplete`       |
| `SPRITE_AI_ERROR`                     | AI 处理出错  | `playOnce('emotion')` + toast           | `spriteEventMessages.aiError`          |
| `SPRITE_WORKFLOW_START`               | 工作流开始   | `showBusy()` + `playOnce('emotion')`    | `spriteEventMessages.workflowStart`    |
| `SPRITE_WORKFLOW_COMPLETE`            | 工作流完成   | `clearBusy()` + `playOnce('celebrate')` | `spriteEventMessages.workflowComplete` |
| `SPRITE_WORKFLOW_FAIL`                | 工作流失败   | `clearBusy()` + `playOnce('emotion')`   | `spriteEventMessages.workflowFail`     |
| `SPRITE_WORKFLOW_CANCEL`              | 工作流取消   | `clearBusy()` + toast                   | `spriteEventMessages.workflowCancel`   |
| `SPRITE_RESOURCE_IMPORT_START`        | 资源导入开始 | `showBusy()`                            | `spriteEventMessages.importStart`      |
| `SPRITE_RESOURCE_IMPORT_COMPLETE`     | 资源导入完成 | `clearBusy()` + `playOnce('celebrate')` | `spriteEventMessages.importComplete`   |
| `SPRITE_RESOURCE_IMPORT_ERROR`        | 资源导入失败 | `clearBusy()` + `playOnce('emotion')`   | `spriteEventMessages.importError`      |
| `SPRITE_DOWNLOAD_COMPLETE/FAIL`       | 插件下载     | toast                                   | `catalog.download/error`               |
| `SPRITE_PLUGIN_INSTALL/REMOVE`        | 插件操作     | toast                                   | `catalog.install/remove`               |
| `SPRITE_MEDIA_PROCESS_START/COMPLETE` | 媒体处理     | busy + toast                            | `trigger()` 自动查找                   |
| `SPRITE_TRASH_DELETE/RESTORE`         | 回收站操作   | toast                                   | `trigger()` 自动查找                   |
| `SPRITE_RSS_REFRESH/NEW_CONTENT`      | RSS 操作     | toast                                   | `trigger()` 自动查找                   |
| `SPRITE_SYSTEM_READY/QUIT`            | 系统生命周期 | appear/disappear 动画                   | `spriteEventMessages.appear/disappear` |
| `SPRITE_SYSTEM_FOCUS/BLUR`            | 窗口焦点     | wake/sleep                              | `spriteEventMessages.wake/sleep`       |
| `MEMORY_EXTRACTION_*`                 | 记忆提取     | toast + thinking/celebrate 动画         | `spriteEventMessages.memoryExtract*`   |
| `USER_PERSONA_UPDATE_*`               | 用户画像更新 | toast + thinking/celebrate 动画         | `spriteEventMessages.personaUpdate*`   |

### C. 配置驱动触发 (trigger-mapping)

`config/trigger-mapping.ts` 定义业务场景到事件类型的映射：

```typescript
import { triggerSpriteAnimation } from '@packages/sprite-core';

triggerSpriteAnimation('ai:chat:complete');
// → 查 TRIGGER_MAPPING → eventType: 'success' → SpriteManager.trigger('success')
```

预定义场景: `ai:chat:*`, `workflow:*`, `resource:import:*`, `file:process:*`, `transcribe:*`, `translate:*`, `download:*`, `plugin:*`, `system:*`, `network:*`

### D. 自发行为触发 (BehaviorEngine)

| 行为 ID           | 触发条件                         | 动作                       |
| ----------------- | -------------------------------- | -------------------------- |
| `auto-walk`       | idle/bored，空闲 >5 秒，80% 概率 | 随机行走到屏幕某位置       |
| `night-sleepy`    | 22:00-06:00 时间窗口             | `playOnce('sleepy')`       |
| `idle-sleepy`     | 空闲 >100 秒                     | `playOnce('sleepy')`       |
| `long-idle-bored` | 空闲 >2 分钟                     | `transitionTo('bored')`    |
| `random-message`  | idle，空闲 >1 分钟               | `showToast(random tip)`    |
| `favor-decay`     | 空闲 >30 分钟，好感度 >20        | `changeFavor(-1)`          |
| `emotion`         | idle 3-5 分钟                    | 按好感度池随机触发情感事件 |
| `action`          | idle 5-10 分钟                   | 按好感度池随机触发动作事件 |
| `ambient`         | 30-60 秒循环                     | breath/blink/float 微动画  |
| `seasonal`        | 每天首次打开                     | 按日期触发季节/节日事件    |

### E. 渲染进程直接调用

```typescript
await window.YUA.sprite.trigger('happy');
await window.YUA.sprite.trigger('celebrate', { message: '太好了！' });
```

---

## IPC 通信协议

所有精灵相关通道统一使用 `sprite:` 前缀。

### 上行（渲染进程 → 主进程）

| 通道                                | 载荷                                                | 说明               |
| ----------------------------------- | --------------------------------------------------- | ------------------ |
| `sprite:interact`                   | `{ type, data? }`                                   | 用户交互上报       |
| `sprite:drag`                       | `{ phase, screenX?, screenY?, offsetX?, offsetY? }` | 拖拽事件           |
| `sprite:anim-complete`              | `{ animId, phase }`                                 | 动画播放完成       |
| `sprite:file-drop`                  | `{ files }`                                         | 文件拖放           |
| `sprite:ready`                      | -                                                   | 渲染进程就绪       |
| `sprite:get-initial-state`          | -                                                   | 获取初始全量状态   |
| `sprite:persona:getState`           | -                                                   | 获取人格状态       |
| `sprite:persona:addXP`              | `{ amount, source? }`                               | 增加经验           |
| `sprite:persona:changeFavor`        | `{ delta, reason? }`                                | 修改好感度         |
| `sprite:persona:recordLogin`        | -                                                   | 记录每日登录       |
| `sprite:persona:unlockAchievement`  | `{ id }`                                            | 解锁成就           |
| `sprite:persona:reset`              | -                                                   | 重置人格状态       |
| `sprite:character:getInfo`          | -                                                   | 获取角色信息       |
| `sprite:character:getPersonaPrompt` | `{ context }`                                       | 获取人格 prompt    |
| `sprite:dimensions:get`             | -                                                   | 获取维度状态       |
| `sprite:config:getAutoWalk`         | -                                                   | 获取自动行走开关   |
| `sprite:config:setAutoWalk`         | `{ enabled }`                                       | 设置自动行走开关   |
| `sprite:config:getDebugOverlay`     | -                                                   | 获取调试辅助线开关 |
| `sprite:config:setDebugOverlay`     | `{ enabled }`                                       | 设置调试辅助线开关 |
| `sprite:previewMovement`            | `{ width, height, padding, movement }`              | 预览窗口移动效果   |
| `sprite:stopMovementPreview`        | -                                                   | 停止移动预览       |

### 下行（主进程 → 渲染进程）

| 通道                 | 载荷                     | 说明                      |
| -------------------- | ------------------------ | ------------------------- |
| `sprite:play`        | `SpritePlayCommand`      | 播放动画命令              |
| `sprite:state`       | `SpriteStateSnapshot`    | 状态变化广播              |
| `sprite:message`     | `MessageIPCPayload`      | 消息（toast/notice/busy） |
| `sprite:walk`        | `{ active, direction? }` | 行走状态                  |
| `sprite:config`      | `SpriteConfig`           | 配置变化                  |
| `sprite:busy:update` | `{ progress, message? }` | 忙碌进度更新              |
| `sprite:busy:clear`  | -                        | 清除忙碌状态              |
| `sprite:speak`       | `SpriteSpeakPayload`     | 语音播放指令              |

### Preload 桥接 API

通过 `window.YUA.sprite` 访问，完整 API 清单：

**动画管理**: `list()`, `listByEvent()`, `get()`, `register()`, `registerFromData()`, `remove()`, `updateMeta()`

**交互上报**: `interact()`, `dragStart()`, `dragEnd()`, `animComplete()`, `fileDrop()`

**状态与配置**: `getInitialState()`, `ready()`, `getAutoWalk()`, `setAutoWalk()`, `getDebugOverlay()`, `setDebugOverlay()`

**移动预览**: `previewMovement()`, `stopMovementPreview()`

**语音合成**: `speak()`, `synthesizeSpeech()`, `getSpeakConfig()`, `setSpeakConfig()`, `resetSpeakConfig()`, `getSpeakCacheStats()`, `clearSpeakCache()`

**事件触发**: `trigger()`, `testAnimation()`

**资源管理**: `addTempResourceRoot()`

**事件订阅**: `onPlay()`, `onState()`, `onMessage()`, `onWalk()`, `onConfig()`, `onBusyUpdate()`, `onBusyClear()`, `onSpeak()`

---

## 事件类型系统

精灵事件按用途分组，定义在 `types.ts` 的 `SpriteEventGroups`：

| 分组        | 数量 | 示例事件                                                           |
| ----------- | ---- | ------------------------------------------------------------------ |
| interaction | 11   | click, hold, drag, fileDragOver, fileDrop, hover, doubleClick...   |
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

| 组件                 | 文件路径                                                       |
| -------------------- | -------------------------------------------------------------- |
| SpriteManager        | `packages/sprite-core/manager/sprite-manager.ts`               |
| Manager Types        | `packages/sprite-core/manager/types.ts`                        |
| Persistence          | `packages/sprite-core/manager/persistence.ts`                  |
| State Mapping        | `packages/sprite-core/manager/state-mapping.ts`                |
| Default Behaviors    | `packages/sprite-core/manager/default-behaviors.ts`            |
| StateMachine         | `packages/sprite-core/state-machine.ts`                        |
| PersonaStateManager  | `packages/sprite-core/persona-state.ts`                        |
| AnimationRegistry    | `packages/sprite-core/animation-registry.ts`                   |
| BehaviorEngine       | `packages/sprite-core/behavior-engine.ts`                      |
| InteractionTracker   | `packages/sprite-core/interaction-tracker.ts`                  |
| EventBus             | `packages/sprite-core/event-bus.ts`                            |
| CharacterService     | `packages/sprite-core/character-service.ts`                    |
| WindowController     | `packages/sprite-core/window-controller.ts`                    |
| IPC Handler          | `packages/sprite-core/handler/sprite-manager-ipc.ts`           |
| Event Listener       | `packages/sprite-core/handler/sprite-event-listener.ts`        |
| Sprite Assets        | `packages/sprite-core/handler/sprite-assets.ts`                |
| Trigger Mapping      | `packages/sprite-core/config/trigger-mapping.ts`               |
| Trigger Helper       | `packages/sprite-core/helper/trigger-animation.ts`             |
| Messages Catalog     | `packages/sprite-core/messages/zh-CN.ts`                       |
| SpeakService         | `packages/sprite-core/speak/speak-service.ts`                  |
| Speak Types          | `packages/sprite-core/speak/types.ts`                          |
| Preload Bridge       | `packages/sprite-core/preload/sprite-bridge.ts`                |
| Shared Types         | `packages/sprite-core/types.ts`                                |
| 动画配置             | `resources/sprites/index.json`                                 |
| SpriteStateContext   | `src/features/sprite-assistant/context/SpriteStateContext.tsx` |
| VideoSprite          | `src/features/sprite-assistant/renderers/VideoSprite.tsx`      |
| useDragCollector     | `src/features/sprite-assistant/hooks/useDragCollector.ts`      |
| useFileDropCollector | `src/features/sprite-assistant/hooks/useFileDropCollector.ts`  |
| useSpriteSpeak       | `src/features/sprite-assistant/speak/useSpriteSpeak.ts`        |

---

## 扩展指南

### 添加新事件类型

1. 在 `types.ts` 的 `SpriteEventGroups` 中添加类型名
2. 在 `messages/zh-CN.ts` 添加对应文案（支持数组随机）
3. （可选）在 `config/trigger-mapping.ts` 添加场景映射
4. 调用：`SpriteManager.getInstance().trigger('myEvent')`

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
  minFavor: 40,
  allowedStates: ['idle']
});
```

### 添加新动画

```typescript
sprite.registerAnimation({
  meta: {
    id: 'dance-happy',
    title: '开心跳舞',
    eventType: 'dance',
    tags: ['action']
  },
  source: { localPath: '/path/to/dance.webm' },
  width: 200,
  height: 280,
  loop: false,
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
