# Sprite-Core 重构计划：主进程架构迁移

> **版本**: v1.0  
> **日期**: 2026-02-28  
> **状态**: ✅ 已完成（历史参考文档）  
> **范围**: 一次性重构（非分阶段迁移）  
> **说明**: 此文档为重构计划的历史记录，重构已全部完成。当前架构请参阅 [docs/sprite-core/README.md](README.md)

---

## 目录

1. [重构动机](#1-重构动机)
2. [当前架构](#2-当前架构)
3. [目标架构](#3-目标架构)
4. [共享类型提取（Step 0）](#step-0-共享类型提取)
5. [主进程 SpriteManager 门面（Step 1）](#step-1-主进程-spritemanager-门面)
6. [窗口控制器 WindowController（Step 2）](#step-2-窗口控制器-windowcontroller)
7. [IPC 通道重建（Step 3）](#step-3-ipc-通道重建)
8. [Preload Bridge 更新（Step 4）](#step-4-preload-bridge-更新)
9. [渲染进程精简（Step 5）](#step-5-渲染进程精简)
10. [行为引擎 Action 补全（Step 6）](#step-6-行为引擎-action-补全)
11. [AnimationRegistry 接入（Step 7）](#step-7-animationregistry-接入)
12. [旧代码清理（Step 8）](#step-8-旧代码清理)
13. [统一 API 参考](#统一-api-参考)
14. [IPC 协议参考](#ipc-协议参考)
15. [验证清单](#验证清单)
16. [风险与回退](#风险与回退)

---

## 1. 重构动机

### 当前问题

| #   | 问题                                           | 影响                                                                                                          |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| P1  | sprite-core 五大引擎全部在渲染进程实例化运行   | 窗口关闭/重启时丢失未同步状态；行为引擎 tick 在 renderer 跑，执行窗口操作还需 IPC 往返                        |
| P2  | PersonaState 渲染进程 30s 轮询同步到主进程     | 数据一致性脆弱，多窗口场景不安全                                                                              |
| P3  | AnimationRegistry 设计完善但从未接入           | useSpriteConductor 绕过它做了一套并行的动画查找                                                               |
| P4  | 预置行为的 action 全是空函数 `() => {}`        | 真正执行逻辑散落在 AIAssistant.tsx 组件内                                                                     |
| P5  | 行走动画（贝塞尔路径+RAF+IPC节流）跑在渲染进程 | 主进程可直接 `win.setPosition`，省去 IPC 往返延迟                                                             |
| P6  | IPC 通道命名混乱                               | `sprite-command`、`app:notice`、`app:busy:*`、`auto-walk-enabled-changed`、`persona:state-changed` 无统一前缀 |
| P7  | `SpriteAnimation` 类型定义在渲染进程 types.ts  | 主进程 sprite.ts 反向引用渲染进程代码                                                                         |
| P8  | 调试向量代码残留在 AIAssistant.tsx             | 生产代码中不应存在                                                                                            |

### 重构目标

1. **sprite-core 引擎运行在主进程**——在主进程创建 `SpriteManager` 单例，统一管理所有精灵逻辑
2. **渲染进程退化为纯展示层**——只接收播放指令、采集用户交互
3. **提供统一简洁的 API**——其他主进程模块（AI、Workflow、DailyCare）可通过 `SpriteManager` 一行代码控制精灵
4. **统一 IPC 协议**——所有精灵相关通道使用 `sprite:` 前缀
5. **清除冗余代码**——删除不再需要的 hooks、重复的状态映射逻辑

---

## 2. 当前架构

```
主进程                                       渲染进程
┌───────────────────────┐                  ┌──────────────────────────────────────┐
│ persona-state-service │◄──30s轮询──►     │ SpritePersonaContext                 │
│ (JSON 文件持久化)      │                  │  ├ new SpriteEventBus()              │
│                       │                  │  ├ new SpriteStateMachine()          │
│ sprite.ts             │                  │  ├ new PersonaStateManager()         │
│ (动画文件CRUD)         │                  │  ├ new InteractionTracker()          │
│                       │                  │  ├ new BehaviorEngine()              │
│ window.ts             │                  │  └ 30s 同步 → 主进程                  │
│ (窗口移动/穿透/大小)   │                  │                                      │
│                       │                  │ AIAssistant.tsx                      │
│ daily/                │                  │  ├ useWalkAnimation (RAF+IPC)        │
│ (日常关怀定时器)       │                  │  ├ useDragMove (IPC)                  │
│                       │                  │  ├ useSpriteConductor (动画查找)       │
│ packages/event/       │                  │  ├ useSpriteStateBridge (双重桥接)     │
│ (跨进程事件广播)       │                  │  ├ useClickThrough (IPC)              │
│                       │                  │  ├ useFileDrop (资源导入)              │
│                       │                  │  └ 行为事件监听 (walk/sleep/bored)     │
│                       │                  │                                      │
│                       │                  │ VideoSprite.tsx (视频播放)             │
│                       │                  │ SpriteMessage.tsx (消息展示)           │
└───────────────────────┘                  └──────────────────────────────────────┘
```

### 涉及文件清单

#### 主进程（将修改）

- `electron/main/handlers/index.ts` — 注册新 handler
- `electron/main/handlers/persona-state-ipc.ts` — 将被 SpriteManager 替代
- `electron/main/handlers/persona-state-service.ts` — 将被 SpriteManager 内置
- `electron/main/handlers/window.ts` — 行走/穿透逻辑迁入 SpriteManager
- `electron/main/handlers/sprite.ts` — 动画文件管理，保留并接入 AnimationRegistry

#### sprite-core 包（将扩展）

- `packages/sprite-core/index.ts` — 新增 SpriteManager 导出
- `packages/sprite-core/sprite-manager.ts` — **新文件**：门面类
- `packages/sprite-core/window-controller.ts` — **新文件**：窗口移动/行走控制
- `packages/sprite-core/types.ts` — **新文件**：从渲染进程迁入的共享类型

#### Preload（将修改）

- `electron/preload/index.ts` — 更新 YUA.sprite API
- `electron/preload/apis/persona.ts` — 合并入 sprite API 或保留薄层
- `electron/preload/apis/sprite.ts` — 扩展新通道

#### 渲染进程（将大幅精简）

- `src/components/AIAssistant/context/SpritePersonaContext.tsx` — 从实例化引擎改为接收 IPC 状态
- `src/components/AIAssistant/AIAssistant.tsx` — 大幅精简，移除业务逻辑
- `src/components/AIAssistant/hooks/useSpriteConductor.ts` — 简化或移除
- `src/components/AIAssistant/hooks/useSpriteStateBridge.ts` — 简化
- `src/components/AIAssistant/hooks/useWalkAnimation.ts` — **删除**（迁至主进程）
- `src/components/AIAssistant/hooks/useDragMove.ts` — 保留交互采集，移除窗口操作
- `src/components/AIAssistant/hooks/useBusyState.ts` — **删除**（被消息系统替代）
- `src/components/AIAssistant/hooks/useNoticeState.ts` — **删除**（被消息系统替代）

---

## 3. 目标架构

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
│  ├ WindowController         # 行走/位置/穿透/大小          │
│  └ PersonaStatePersistence  # JSON 持久化 (debounced)     │
│                                                          │
│  ⬇ IPC 下行 (→ renderer)                                │
│  sprite:play      { animationId, phase }                 │
│  sprite:state     { state, subState, personaSnapshot }   │
│  sprite:message   { type, content, level, ... }          │
│  sprite:walk      { direction, active }                  │
│  sprite:config    { width, height, padding }             │
│                                                          │
│  ⬆ IPC 上行 (← renderer)                                │
│  sprite:interact         { type, data }                  │
│  sprite:drag             { phase, screenX, screenY }     │
│  sprite:anim-complete    { animId, phase }               │
│  sprite:file-drop        { files }                       │
│  sprite:ready            { }                             │
└──────────────────────────────────────────────────────────┘

渲染进程 (纯展示+交互采集)
┌──────────────────────────────────────────────────────────┐
│ <SpriteStateProvider>       # 接收 IPC 状态，提供 Context │
│   <AIAssistant>                                          │
│     ├ AnimationPlayer       # 收到 animId → 播放视频      │
│     │   └ 播完 → 上报 sprite:anim-complete               │
│     ├ SpriteMessage         # 收到 sprite:message → 展示  │
│     ├ InteractionCollector  # click/hover → sprite:interact│
│     ├ DragCollector         # mousedown/move → sprite:drag │
│     └ FileDropZone          # drop → sprite:file-drop     │
└──────────────────────────────────────────────────────────┘
```

---

## Step 0: 共享类型提取

### 目标

将 `SpriteAnimation` 及相关类型从渲染进程 `src/components/AIAssistant/types.ts` 迁移到 `packages/sprite-core/types.ts`，消除主进程反向引用渲染进程代码。

### 操作

1. **创建** `packages/sprite-core/types.ts`：
   - 从 `src/components/AIAssistant/types.ts` 迁移以下类型：
     - `SpriteAnimation`（完整接口）
     - `SpriteEventType` + `SpriteEventGroups` + `SPRITE_EVENT_TYPES`
     - `MessageCategory`、`MessageCatalog`、`MessagesProvider`、`MessageProducer`
   - 从 `src/components/AIAssistant/message/types.ts` 迁移：
     - `MessageType`、`MessageLevel`、`MessageButton`
     - `ToastMessage`、`NoticeMessage`、`BusyMessage`、`SpriteMessage`（消息联合类型重命名为 `SpriteMessageData`，避免与组件同名）
     - `MESSAGE_PRIORITY`

2. **更新** `packages/sprite-core/index.ts`：导出新类型

3. **更新引用**：
   - `electron/main/handlers/sprite.ts`：`import type { SpriteAnimation } from '@packages/sprite-core'` （替代原来的 `@/components/AIAssistant/types`）
   - `src/components/AIAssistant/types.ts`：改为 re-export from `@packages/sprite-core/types`
   - `src/components/AIAssistant/message/types.ts`：改为 re-export
   - 所有渲染进程中直接引用这些类型的文件

### 验证

- `pnpm build` 通过，无类型错误
- 主进程不再有 `@/components/` 或 `src/` 路径的 import

---

## Step 1: 主进程 SpriteManager 门面

### 目标

创建 `SpriteManager` 单例类，作为 sprite-core 引擎在主进程的统一入口。

### 操作

1. **创建** `packages/sprite-core/sprite-manager.ts`：

```
class SpriteManager {
  // 内部实例
  private eventBus: SpriteEventBus
  private stateMachine: SpriteStateMachine
  private personaState: PersonaStateManager
  private interactionTracker: InteractionTracker
  private behaviorEngine: BehaviorEngine
  private animationRegistry: AnimationRegistry
  private windowController: WindowController        // Step 2 创建
  private persistence: PersonaStatePersistence       // 内建持久化

  // Electron 依赖 (延迟注入)
  private win: BrowserWindow | null

  // 单例
  private static instance: SpriteManager
  static getInstance(): SpriteManager
  static init(win: BrowserWindow): SpriteManager    // 首次初始化

  // ===== 公共 API（供其他主进程模块调用）=====

  // 状态控制
  transitionTo(state, options?): boolean
  playOnce(subState, options?): boolean
  getState(): SpriteState
  getSubState(): SpriteSubState | null

  // 消息
  showToast(content, options?): void
  showNotice(content, options?): void
  showBusy(message?, progress?): void
  updateBusy(progress, message?): void
  clearBusy(): void

  // 人格化
  addXP(amount, source?): { xpGained, leveledUp, newLevel? }
  changeFavor(delta, reason?): { oldFavor, newFavor, levelChanged }
  setMood(mood, intensity?): void
  getPersonaState(): PersonaState
  recordDailyLogin(): { isNewDay, streak, xpBonus }
  unlockAchievement(id): boolean

  // 交互（渲染进程通过 IPC 调用）
  reportInteraction(type, data?): void

  // 窗口控制
  walkTo(x, y): Promise<void>
  stopWalk(): void
  getPosition(): [number, number]
  setPosition(x, y): void

  // 扩展
  registerBehavior(behavior): void
  registerAnimation(animation): void

  // 事件
  on(event, handler): () => void
  emit(event, payload?): void

  // 生命周期
  start(): void     // 启动 BehaviorEngine、心情衰减等
  stop(): void      // 停止所有定时器
  destroy(): void   // 完全清理
}
```

2. **内建持久化**：将 `persona-state-service.ts` 中的 JSON 文件读写逻辑内聚到 SpriteManager 内部类 `PersonaStatePersistence` 中：
   - `init()`: 读取 `<userData>/data/persona-state.json`
   - `save()`: debounced 写入（默认 5 秒）
   - 接入 `PersonaStateManager.onStateChange`，每次变更标记 dirty，debounce 后 flush

3. **状态变更广播**：
   - `stateMachine.onChange` → 通过 `AnimationRegistry` 找到动画 → `win.webContents.send('sprite:play', { animationId, ... })` + `win.webContents.send('sprite:state', { state, subState })`
   - `personaState.onStateChange` → `win.webContents.send('sprite:state', { personaSnapshot })` (throttled, 每秒最多 1 次)

4. **与 BehaviorEngine 的连接**：
   - `contextProvider` 直接读取自身实例的数据，不再依赖渲染进程：
     ```
     spriteState: this.stateMachine.getState(),
     personaState: this.personaState.getState(),
     interactionStats: this.interactionTracker.getStats(),
     now: new Date(),
     screenSize: screen.getPrimaryDisplay().workAreaSize,  // Electron API
     position: this.windowController.getPosition(),
     ```

5. **更新** `packages/sprite-core/index.ts`：导出 `SpriteManager`

### 验证

- `SpriteManager` 可在 Node.js 环境实例化（无 DOM/React 依赖）
- `BehaviorEngine.tick()` 可正常运行

---

## Step 2: 窗口控制器 WindowController

### 目标

将行走动画（贝塞尔路径）、窗口移动、位置管理从渲染进程 `useWalkAnimation` + `useDragMove` 迁移到主进程。

### 操作

1. **创建** `packages/sprite-core/window-controller.ts`：

```
class WindowController {
  constructor(options: {
    getWindow: () => BrowserWindow | null
    getScreenSize: () => { width: number; height: number }
    getPadding: () => number
    getSpriteSize: () => { width: number; height: number }
    onWalkStart?: (direction: 'left' | 'right') => void
    onWalkEnd?: () => void
  })

  // 行走（贝塞尔曲线路径）
  walkTo(targetX: number, targetY: number): Promise<void>
  stopWalk(): void
  isWalking(): boolean
  getWalkDirection(): 'left' | 'right' | null

  // 位置
  getPosition(): [number, number]
  setPosition(x: number, y: number): void

  // 拖拽（主进程直接移动窗口）
  startDrag(offsetX: number, offsetY: number): void
  updateDrag(screenX: number, screenY: number): void
  endDrag(): void
  isDragging(): boolean

  // 大小
  setSize(width: number, height: number, padding: number): void

  // 边界约束
  clampToScreen(): void

  destroy(): void
}
```

2. **迁移行走算法**：
   - 从 `src/components/AIAssistant/hooks/useWalkAnimation.ts` 复制贝塞尔路径计算逻辑
   - 将 `requestAnimationFrame` 替换为 `setInterval`（主进程无 RAF，使用 ~16ms 间隔模拟 60fps，实际窗口移动节流到 30fps）
   - 将 `window.YUA.window['window:move']` 替换为 `win.setPosition(x, y)`
   - 保留相同的常量：`DEFAULT_WALK_SPEED=60`, `PATH_CURVE_FACTOR=0.15`, `STEP_GRID=12`

3. **迁移拖拽逻辑**：
   - 渲染进程 `useDragMove` 中的核心逻辑（边界约束、位移计算）迁入 `WindowController`
   - 渲染进程只负责采集 mousedown/mousemove/mouseup 事件，通过 IPC 上报 `sprite:drag` 事件
   - 主进程 `WindowController.updateDrag(screenX, screenY)` 直接调用 `win.setPosition`

4. **行走方向广播**：
   - `onWalkStart(direction)` 回调中通过 IPC 告知渲染进程，以便翻转动画

### 验证

- 在主进程中调用 `windowController.walkTo(100, 200)` 可以看到窗口平滑移动
- `windowController.stopWalk()` 可以中断行走

---

## Step 3: IPC 通道重建

### 目标

统一所有精灵相关的 IPC 通道命名，建立清晰的上行/下行协议。

### 操作

1. **创建** `electron/main/handlers/sprite-manager-ipc.ts`：

```typescript
export function initSpriteManagerIPC(win: BrowserWindow): void {
  const mgr = SpriteManager.init(win);

  // ===== 渲染进程 → 主进程 (handle) =====

  // 交互上报
  ipcMain.handle(
    'sprite:interact',
    (
      _e,
      payload: {
        type: InteractionType;
        data?: Record<string, any>;
      }
    ) => {
      mgr.reportInteraction(payload.type, payload.data);
    }
  );

  // 拖拽
  ipcMain.handle(
    'sprite:drag',
    (
      _e,
      payload: {
        phase: 'start' | 'move' | 'end';
        screenX?: number;
        screenY?: number;
        offsetX?: number;
        offsetY?: number;
      }
    ) => {
      switch (payload.phase) {
        case 'start':
          mgr.startDrag(payload.offsetX!, payload.offsetY!);
          break;
        case 'move':
          mgr.updateDrag(payload.screenX!, payload.screenY!);
          break;
        case 'end':
          mgr.endDrag();
          break;
      }
    }
  );

  // 动画播放完成上报
  ipcMain.handle(
    'sprite:anim-complete',
    (
      _e,
      payload: {
        animId: string;
        phase: 'intro' | 'loop' | 'outro' | 'full';
      }
    ) => {
      mgr.handleAnimationComplete(payload.animId, payload.phase);
    }
  );

  // 文件拖放
  ipcMain.handle('sprite:file-drop', (_e, payload: { files: any[] }) => {
    mgr.handleFileDrop(payload.files);
  });

  // 渲染进程就绪
  ipcMain.handle('sprite:ready', () => {
    mgr.handleRendererReady();
  });

  // 获取初始状态
  ipcMain.handle('sprite:get-initial-state', () => ({
    state: mgr.getState(),
    subState: mgr.getSubState(),
    personaState: mgr.getPersonaState(),
    animations: mgr.getAnimationList(),
    currentAnimation: mgr.getCurrentAnimation(),
    config: mgr.getSpriteConfig()
  }));

  // ===== 人格化 API（兼容现有或其他模块调用）=====

  ipcMain.handle('sprite:persona:getState', () => ({
    ok: true,
    state: mgr.getPersonaState()
  }));

  ipcMain.handle('sprite:persona:addXP', (_e, p: { amount: number; source?: string }) => mgr.addXP(p.amount, p.source));

  ipcMain.handle('sprite:persona:changeFavor', (_e, p: { delta: number; reason?: string }) => mgr.changeFavor(p.delta, p.reason));

  ipcMain.handle('sprite:persona:recordLogin', () => mgr.recordDailyLogin());

  ipcMain.handle('sprite:persona:unlockAchievement', (_e, p: { id: string }) => mgr.unlockAchievement(p.id));

  ipcMain.handle('sprite:persona:getOverview', () => mgr.getOverview());

  // ===== 动画管理 API（保留原有 sprite.ts 中的文件管理功能）=====
  // 保留原有 sprite:list, sprite:register, sprite:remove 等
  // 但在注册/删除时同步到 AnimationRegistry

  // ===== 配置 =====
  ipcMain.handle('sprite:config:getAutoWalk', () => mgr.isAutoWalkEnabled());

  ipcMain.handle('sprite:config:setAutoWalk', (_e, p: { enabled: boolean }) => {
    mgr.setAutoWalkEnabled(p.enabled);
  });

  // ===== 启动引擎 =====
  mgr.start();
}
```

2. **下行通道**（主进程 → 渲染进程，通过 `win.webContents.send`）：

| 通道                 | Payload                                                                                               | 触发时机                      |
| -------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------- |
| `sprite:play`        | `{ animationId: string, phase?: string }`                                                             | 状态变化/行为触发导致动画切换 |
| `sprite:state`       | `{ state, subState, personaSnapshot? }`                                                               | 状态机变化/人格状态变化       |
| `sprite:message`     | `{ type, id?, content?, level?, category?, buttons?, progress?, duration?, persistent?, routineId? }` | showToast/showNotice/showBusy |
| `sprite:walk`        | `{ active: boolean, direction?: 'left'\|'right' }`                                                    | 行走开始/结束                 |
| `sprite:config`      | `{ width, height, padding }`                                                                          | 动画切换导致尺寸变化          |
| `sprite:busy:update` | `{ progress, message? }`                                                                              | updateBusy                    |
| `sprite:busy:clear`  | `{}`                                                                                                  | clearBusy                     |

3. **更新** `electron/main/handlers/index.ts`：
   - 移除 `initPersonaStateHandlers(win)` 调用
   - 添加 `initSpriteManagerIPC(win)` 调用
   - 保留 `initSpriteHandlers()` 但在其中接入 `SpriteManager.animationRegistry`

4. **废除的旧通道**（在完成迁移后删除）：

| 旧通道                        | 替代                                     |
| ----------------------------- | ---------------------------------------- |
| `persona:getState`            | `sprite:persona:getState`                |
| `persona:updateState`         | 不再需要（主进程直接管理）               |
| `persona:addXP`               | `sprite:persona:addXP`                   |
| `persona:changeFavor`         | `sprite:persona:changeFavor`             |
| `persona:recordLogin`         | `sprite:persona:recordLogin`             |
| `persona:recordInteraction`   | `sprite:interact`                        |
| `persona:unlockAchievement`   | `sprite:persona:unlockAchievement`       |
| `persona:state-changed`       | `sprite:state`                           |
| `sprite-command`              | 不再需要（主进程直接调用 SpriteManager） |
| `app:notice`                  | `sprite:message`                         |
| `app:busy:start/end/progress` | `sprite:message` / `sprite:busy:*`       |
| `auto-walk-enabled-changed`   | `sprite:config`                          |

### 验证

- 所有 `ipcMain.handle` 注册无冲突
- `pnpm build` 主进程编译通过

---

## Step 4: Preload Bridge 更新

### 目标

更新 preload 层，暴露新的统一 API 到 `window.YUA.sprite`。

### 操作

1. **更新** `electron/preload/apis/sprite.ts`：

```typescript
export const spriteBridge = {
  // 原有动画管理 API 保留
  list: () => ipcRenderer.invoke('sprite:list'),
  listByEvent: (p) => ipcRenderer.invoke('sprite:listByEvent', p),
  get: (p) => ipcRenderer.invoke('sprite:get', p),
  register: (p) => ipcRenderer.invoke('sprite:register', p),
  remove: (p) => ipcRenderer.invoke('sprite:remove', p),
  updateMeta: (p) => ipcRenderer.invoke('sprite:updateMeta', p),

  // ===== 新增 =====

  // 交互上报
  interact: (type: string, data?: any) => ipcRenderer.invoke('sprite:interact', { type, data }),

  // 拖拽
  dragStart: (offsetX: number, offsetY: number) => ipcRenderer.invoke('sprite:drag', { phase: 'start', offsetX, offsetY }),
  dragMove: (screenX: number, screenY: number) => ipcRenderer.invoke('sprite:drag', { phase: 'move', screenX, screenY }),
  dragEnd: () => ipcRenderer.invoke('sprite:drag', { phase: 'end' }),

  // 动画完成上报
  animComplete: (animId: string, phase: string) => ipcRenderer.invoke('sprite:anim-complete', { animId, phase }),

  // 文件拖放上报
  fileDrop: (files: any[]) => ipcRenderer.invoke('sprite:file-drop', { files }),

  // 获取初始状态
  getInitialState: () => ipcRenderer.invoke('sprite:get-initial-state'),

  // 就绪通知
  ready: () => ipcRenderer.invoke('sprite:ready'),

  // 配置
  getAutoWalk: () => ipcRenderer.invoke('sprite:config:getAutoWalk'),
  setAutoWalk: (enabled: boolean) => ipcRenderer.invoke('sprite:config:setAutoWalk', { enabled }),

  // ===== 事件订阅 =====

  onPlay: (cb: (data: any) => void) => {
    const handler = (_: any, data: any) => cb(data);
    ipcRenderer.on('sprite:play', handler);
    return () => ipcRenderer.off('sprite:play', handler);
  },
  onState: (cb: (data: any) => void) => {
    const handler = (_: any, data: any) => cb(data);
    ipcRenderer.on('sprite:state', handler);
    return () => ipcRenderer.off('sprite:state', handler);
  },
  onMessage: (cb: (data: any) => void) => {
    const handler = (_: any, data: any) => cb(data);
    ipcRenderer.on('sprite:message', handler);
    return () => ipcRenderer.off('sprite:message', handler);
  },
  onWalk: (cb: (data: any) => void) => {
    const handler = (_: any, data: any) => cb(data);
    ipcRenderer.on('sprite:walk', handler);
    return () => ipcRenderer.off('sprite:walk', handler);
  },
  onConfig: (cb: (data: any) => void) => {
    const handler = (_: any, data: any) => cb(data);
    ipcRenderer.on('sprite:config', handler);
    return () => ipcRenderer.off('sprite:config', handler);
  }
};
```

2. **更新** `electron/preload/apis/persona.ts`：
   - 重定向到新通道：
     ```typescript
     export const personaApi = {
       getState: () => ipcRenderer.invoke('sprite:persona:getState'),
       addXP: (p) => ipcRenderer.invoke('sprite:persona:addXP', p),
       changeFavor: (p) => ipcRenderer.invoke('sprite:persona:changeFavor', p),
       recordLogin: () => ipcRenderer.invoke('sprite:persona:recordLogin'),
       unlockAchievement: (p) => ipcRenderer.invoke('sprite:persona:unlockAchievement', p),
       getOverview: () => ipcRenderer.invoke('sprite:persona:getOverview'),
       // 事件订阅
       onStateChanged: (cb) => {
         const h = (_: any, s: any) => cb(s);
         ipcRenderer.on('sprite:state', h);
         return () => ipcRenderer.off('sprite:state', h);
       }
     };
     ```

3. **更新** `electron/preload/index.ts`：保持 `YUA.sprite` 和 `YUA.persona` 的接口签名

### 验证

- `window.YUA.sprite.interact('click')` 可正常调用
- `window.YUA.sprite.onPlay(cb)` 可接收主进程推送

---

## Step 5: 渲染进程精简

### 目标

将 `SpritePersonaContext` 从实例化引擎改为被动接收 IPC 状态；AIAssistant 仅做展示+交互采集。

### 5.1 重写 SpritePersonaContext → SpriteStateContext

**文件**: `src/components/AIAssistant/context/SpriteStateContext.tsx`（新建，替代原文件）

```
职责：
1. 挂载时调用 sprite:get-initial-state 获取初始状态
2. 订阅 sprite:state / sprite:play / sprite:walk / sprite:config 更新 React state
3. 通过 Context 向下传递只读状态

提供的 state：
- spriteState: SpriteState
- subState: string | null
- personaState: PersonaState （只读快照）
- currentAnimationId: string | null
- walkDirection: 'left' | 'right' | null
- isWalking: boolean
- spriteConfig: { width, height, padding }
- ready: boolean
```

不再实例化任何 sprite-core 类。不再有 30s 同步定时器。

### 5.2 精简 AIAssistant.tsx

重写后的组件结构：

```tsx
const AIAssistantInner: React.FC = () => {
  const { spriteState, currentAnimationId, walkDirection, isWalking, spriteConfig, ready } = useSpriteState();

  const containerRef = useRef<HTMLDivElement>(null);
  const { width, height, padding } = spriteConfig;

  // 交互采集：点击
  const handleClick = () => {
    window.YUA.sprite.interact('click');
  };

  // 交互采集：hover
  const handleMouseEnter = () => {
    window.YUA.sprite.interact('hover-enter');
  };
  const handleMouseLeave = () => {
    window.YUA.sprite.interact('hover-leave');
  };

  // 交互采集：拖拽（mousedown 开始长按检测）
  const { onMouseDown } = useDragCollector();

  // 文件拖放
  const { onDragEnter, onDragLeave, onDrop } = useFileDropCollector();

  // 右键菜单
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    window.YUA.window['window:open']('menu');
  };

  // 双击打开助手
  const handleDoubleClick = () => {
    window.YUA.window['window:open']('assistant');
  };

  if (!ready) return null;

  return (
    <div
      ref={containerRef}
      style={{ width, height, left: padding, top: padding }}
      className="fixed select-none z-[9999] cursor-grab pointer-events-auto"
      onMouseDown={onMouseDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={handleContextMenu}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
    >
      <SpriteMessage />
      <Dropzone onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDropFiles={onDrop}>
        <AnimationPlayer animationId={currentAnimationId} walkDirection={walkDirection} width={width} height={height} />
      </Dropzone>
      <StatusIndicator isWalking={isWalking} />
    </div>
  );
};
```

### 5.3 新 Hook: useDragCollector

```
职责：
- 检测 250ms 长按
- 长按后上报 sprite:drag:start({ offsetX, offsetY })
- 移动时上报 sprite:drag:move({ screenX, screenY })（30fps 节流）
- 松开时上报 sprite:drag:end()
- 不做窗口移动（主进程做）

返回：{ onMouseDown }
```

### 5.4 新 Hook: useFileDropCollector

```
职责：
- 文件拖入/拖出/放下的 DOM 事件处理
- 放下时上报 sprite:file-drop({ files })
- 通知主进程导入资源（通过现有 resource IPC）

返回：{ onDragEnter, onDragLeave, onDrop, isFileDragOver }
```

### 5.5 简化 AnimationPlayer（原 VideoSprite）

- 不再从 `useSpritePlayer` 获取动画列表
- 从 Context 接收 `animationId`
- 通过 `sprite:list` 一次性加载动画列表（或从初始状态获取）
- 播放完毕通过 `sprite:anim-complete` 上报
- 三段式 (intro/loop/outro) 播放逻辑保留（这是纯渲染逻辑）

### 5.6 简化 MessageContext

- 不再监听 `app:notice`、`app:busy:*` 等旧通道
- 只监听 `sprite:message` 统一通道
- 内部队列/优先级/去重逻辑保留（这是纯 UI 逻辑）

### 删除的文件

| 文件                               | 原因                                         |
| ---------------------------------- | -------------------------------------------- |
| `hooks/useWalkAnimation.ts`        | 迁移到主进程 WindowController                |
| `hooks/useBusyState.ts`            | 被统一消息系统替代                           |
| `hooks/useNoticeState.ts`          | 被统一消息系统替代                           |
| `hooks/useSpriteConductor.ts`      | 被主进程 AnimationRegistry 替代              |
| `hooks/useSpriteStateBridge.ts`    | 不再需要双重桥接                             |
| `hooks/useClickThrough.ts`         | 点击穿透已由主进程 window.ts 的 uiohook 管理 |
| `context/SpritePersonaContext.tsx` | 被新的 SpriteStateContext 替代               |
| `context/SpritePlayerContext.tsx`  | 动画选择迁移到主进程                         |

### 验证

- 精灵窗口可正常显示
- 点击精灵有反应动画
- 文件拖放可导入资源
- 拖拽可移动窗口

---

## Step 6: 行为引擎 Action 补全

### 目标

预置行为的 action 不再是空壳，直接在主进程调用 SpriteManager 执行实际操作。

### 操作

在 `SpriteManager.start()` 中注册行为时，补全 action：

```typescript
// 自动行走
createAutoWalkBehavior(async (ctx) => {
  const pos = this.windowController.getPosition();
  const screen = this.getScreenSize();
  const config = this.getSpriteConfig();

  const minX = -config.padding;
  const maxX = screen.width - config.width - config.padding;
  const targetX = Math.random() * (maxX - minX) + minX;

  const yRange = screen.height * 0.1;
  const yMin = Math.max(-config.padding, pos[1] - yRange);
  const yMax = Math.min(screen.height - config.height - config.padding, pos[1] + yRange);
  const targetY = Math.random() * (yMax - yMin) + yMin;

  await this.windowController.walkTo(targetX, targetY);
});

// 困倦
createSleepyBehavior() — action 改为:
(ctx) => {
  this.playOnce('sleepy');
  this.showToast(undefined, { category: 'reminder' }); // 提示该休息了
}

// 无聊
createBoredBehavior() — action 改为:
(ctx) => {
  this.transitionTo('bored');
}

// 随机消息
createRandomMessageBehavior() — action 改为:
(ctx) => {
  this.showToast(undefined, { category: 'reminder' });
}

// 好感度衰减
createFavorDecayBehavior() — action 改为:
(ctx) => {
  this.changeFavor(-1, 'idle-decay');
}
```

### 与 DailyCare 集成（可选增强）

在 `SpriteManager` 中暴露 hook，让 DailyCare 可以发送消息：

```typescript
// 在 daily/service.ts 中
import { SpriteManager } from '@packages/sprite-core';

SpriteManager.getInstance().showNotice('该喝水啦！', {
  buttons: [{ id: 'done', label: '已喝水', action: 'dismiss' }],
  persistent: true,
  routineId: 'hydration'
});
```

### 验证

- 精灵空闲 10 秒以上会自动行走
- 晚上 22 点后精灵偶尔打哈欠
- 长时间不交互好感度会微降

---

## Step 7: AnimationRegistry 接入

### 目标

让 `AnimationRegistry` 真正参与动画选择流程，替代原来 `useSpriteConductor` 中的手动 `pickByEvent`。

### 操作

1. **在 `SpriteManager.init()` 中加载动画注册表**：

   ```
   const animations = await ipcMain.invoke('sprite:list'); // 或直接调用 sprite handler
   for (const anim of animations) {
     this.animationRegistry.register({
       id: anim.meta.id,
       title: anim.meta.title,
       eventTypes: [anim.meta.eventType ?? 'idle'],
       source: anim.source,
       playback: {
         width: anim.width,
         height: anim.height,
         padding: anim.padding,
         loop: anim.loop,
         loopStartMs: anim.loopStartMs,
         loopEndMs: anim.loopEndMs,
         durationMs: anim.durationMs,
         autoIdle: anim.autoIdle,
       },
       tags: anim.meta.tags,
       deletable: anim.meta.deletable,
       coverSrc: anim.meta.coverSrc,
     });
   }
   ```

2. **状态变化时通过 Registry 选择动画**：

   在 `stateMachine.onChange` 回调中：

   ```typescript
   const eventType = mapStateToEventType(newState, subState);
   const animEntry = this.animationRegistry.findByEvent({
     eventType,
     personaState: this.personaState.getState()
   });
   if (animEntry) {
     this.currentAnimationId = animEntry.id;
     this.win?.webContents.send('sprite:play', {
       animationId: animEntry.id,
       // 发送必要的播放参数，渲染进程不再自己查找
       source: animEntry.source,
       playback: animEntry.playback
     });
   }
   ```

3. **映射函数** `mapStateToEventType(state, subState) → string`：

   ```
   idle → 'idle'
   walking → 'walk'
   running → 'run'
   dragging → 'drag'
   sleeping → 'sleep'
   bored → 'bored'
   reacting + click → 'click'
   reacting + hold → 'hold'
   reacting + drop → 'drop'
   reacting + file-drag-over → 'fileDragOver'
   reacting + file-drop → 'fileDrop'
   reacting + sleepy → 'sleepy'
   ```

4. **动画增删时同步 Registry**：
   - `sprite:register` handler 中调用 `spriteManager.registerAnimation()`
   - `sprite:remove` handler 中调用 `animationRegistry.unregister(id)`

### 验证

- 切换精灵状态时能正确选择对应动画
- 好感度高时选择高优先级动画（如果有配置条件动画）
- 新注册的用户动画可以被选中

---

## Step 8: 旧代码清理

### 目标

删除所有不再使用的旧代码。

### 删除文件

| 文件                                                          | 说明                          |
| ------------------------------------------------------------- | ----------------------------- |
| `electron/main/handlers/persona-state-ipc.ts`                 | 被 sprite-manager-ipc.ts 替代 |
| `electron/main/handlers/persona-state-service.ts`             | 内聚到 SpriteManager          |
| `src/components/AIAssistant/hooks/useWalkAnimation.ts`        | 迁移到 WindowController       |
| `src/components/AIAssistant/hooks/useBusyState.ts`            | 被消息系统替代                |
| `src/components/AIAssistant/hooks/useNoticeState.ts`          | 被消息系统替代                |
| `src/components/AIAssistant/hooks/useSpriteConductor.ts`      | 被 AnimationRegistry 替代     |
| `src/components/AIAssistant/hooks/useSpriteStateBridge.ts`    | 不再需要                      |
| `src/components/AIAssistant/hooks/useClickThrough.ts`         | 主进程已有 uiohook 管理       |
| `src/components/AIAssistant/context/SpritePersonaContext.tsx` | 被 SpriteStateContext 替代    |
| `src/components/AIAssistant/context/SpritePlayerContext.tsx`  | 动画选择迁移到主进程          |

### 清理内容

1. **删除 AIAssistant.tsx 中的向量测试代码**（L98-L126 的 `insertVectors`/`searchVectors`）

2. **更新 hooks/index.ts**：只导出 `useAssistant`（精简版）

3. **更新 `electron/main/handlers/index.ts`**：
   - 移除 `import { initPersonaStateHandlers }`
   - 移除 `await initPersonaStateHandlers(win)` 调用
   - 添加 `import { initSpriteManagerIPC }` + 调用

4. **更新 `electron/main/handlers/window.ts`**：
   - 移除 `getAutoWalkEnabled`、`setAutoWalkEnabled` handler（迁移到 sprite-manager-ipc）
   - 移除 `setAssistantSize` handler（迁移到 SpriteManager）

5. **更新 `packages/event/interaction.ts`**：
   - `sendAppNotice`、`sendAppBusyStart` 等保留但标记为 `@deprecated`
   - 新增 `sendSpriteMessage` 作为推荐方式（如果尚未存在）

6. **更新 CLAUDE.md**：
   - 更新 Architecture Overview 中的精灵系统描述
   - 更新 IPC 通道列表和 Handler domains
   - 添加 SpriteManager API 描述

### 验证

- `pnpm build` 无错误
- `pnpm lint` 无未使用的 import
- `pnpm test` 通过（如果有精灵相关测试）
- 全功能手动测试通过

---

## 统一 API 参考

### SpriteManager 公共 API（供主进程其他模块调用）

```typescript
import { SpriteManager } from '@packages/sprite-core';
const sprite = SpriteManager.getInstance();

// ===== 状态控制 =====
sprite.transitionTo('walking'); // 切换状态
sprite.playOnce('click', { durationMs: 600 }); // 临时动画
sprite.getState(); // → 'idle'

// ===== 消息 =====
sprite.showToast('回答完毕！'); // 轻量提示
sprite.showToast(undefined, { category: 'click' }); // 预设文案
sprite.showNotice('该喝水啦', {
  // 通知
  buttons: [{ id: 'ok', label: '好的' }],
  persistent: true
});
sprite.showBusy('下载中...', 45); // 忙碌进度
sprite.updateBusy(80, '快完成了'); // 更新进度
sprite.clearBusy(); // 清除忙碌

// ===== 人格化 =====
sprite.addXP(15, 'conversation'); // 增加经验
sprite.changeFavor(1.5, 'interaction'); // 增加好感
sprite.setMood('joyful', 80); // 设置心情
sprite.getPersonaState(); // → PersonaState
sprite.recordDailyLogin(); // 签到
sprite.unlockAchievement('first-chat'); // 解锁成就

// ===== 窗口 =====
sprite.walkTo(500, 300); // 行走到目标
sprite.stopWalk(); // 停止行走
sprite.getPosition(); // → [x, y]

// ===== 交互 =====
sprite.reportInteraction('click'); // 记录交互
sprite.reportInteraction('file-drop', { count: 3 }); // 附带数据

// ===== 事件 =====
const off = sprite.on('persona:level-up', (evt) => {
  console.log('升到', evt.payload.newLevel, '级！');
});
off(); // 取消订阅

// ===== 扩展 =====
sprite.registerBehavior(myCustomBehavior); // 自定义行为
sprite.registerAnimation(myCustomAnimation); // 自定义动画
```

### 使用场景示例

```typescript
// AI 对话模块中
async function onChatComplete(response: string) {
  const sprite = SpriteManager.getInstance();
  sprite.addXP(15, 'conversation');
  sprite.changeFavor(1.5, 'conversation');
  sprite.showToast('回答完毕！');
}

// 工作流执行中
function onWorkflowStart() {
  SpriteManager.getInstance().showBusy('正在执行工作流...');
}
function onWorkflowProgress(pct: number) {
  SpriteManager.getInstance().updateBusy(pct);
}
function onWorkflowDone() {
  const sprite = SpriteManager.getInstance();
  sprite.clearBusy();
  sprite.playOnce('celebrate');
  sprite.addXP(20, 'workflow');
}

// 日常关怀
function onHydrationReminder() {
  SpriteManager.getInstance().showNotice('该喝水啦！💧', {
    buttons: [
      { id: 'done', label: '已喝水', action: 'dismiss' },
      { id: 'snooze', label: '15分钟后提醒', action: 'snooze' }
    ],
    persistent: true,
    routineId: 'hydration'
  });
}
```

---

## IPC 协议参考

### 上行（渲染进程 → 主进程）

| 通道                               | Payload                                                                     | 说明             |
| ---------------------------------- | --------------------------------------------------------------------------- | ---------------- |
| `sprite:interact`                  | `{ type: InteractionType, data?: any }`                                     | 用户交互上报     |
| `sprite:drag`                      | `{ phase: 'start'\|'move'\|'end', screenX?, screenY?, offsetX?, offsetY? }` | 拖拽事件         |
| `sprite:anim-complete`             | `{ animId: string, phase: 'intro'\|'loop'\|'outro'\|'full' }`               | 动画播放完成     |
| `sprite:file-drop`                 | `{ files: Array<{ name, path }> }`                                          | 文件拖放         |
| `sprite:ready`                     | `{}`                                                                        | 渲染进程就绪     |
| `sprite:get-initial-state`         | —                                                                           | 获取初始全量状态 |
| `sprite:persona:getState`          | —                                                                           | 获取人格状态     |
| `sprite:persona:addXP`             | `{ amount, source? }`                                                       | 增加经验         |
| `sprite:persona:changeFavor`       | `{ delta, reason? }`                                                        | 修改好感度       |
| `sprite:persona:recordLogin`       | —                                                                           | 记录登录         |
| `sprite:persona:unlockAchievement` | `{ id }`                                                                    | 解锁成就         |
| `sprite:persona:getOverview`       | —                                                                           | 获取系统概览     |
| `sprite:config:getAutoWalk`        | —                                                                           | 获取自动行走开关 |
| `sprite:config:setAutoWalk`        | `{ enabled }`                                                               | 设置自动行走开关 |
| `sprite:list`                      | —                                                                           | 获取动画列表     |
| `sprite:register`                  | `{ animation }`                                                             | 注册动画         |
| `sprite:remove`                    | `{ id, deleteFile? }`                                                       | 删除动画         |
| `sprite:updateMeta`                | `{ id, meta }`                                                              | 更新动画元数据   |

### 下行（主进程 → 渲染进程）

| 通道                 | Payload                                                                                                                     | 说明              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `sprite:play`        | `{ animationId, source?, playback? }`                                                                                       | 播放指定动画      |
| `sprite:state`       | `{ state, subState?, personaSnapshot? }`                                                                                    | 状态变化通知      |
| `sprite:message`     | `{ type: 'toast'\|'notice'\|'busy', content?, level?, category?, buttons?, progress?, duration?, persistent?, routineId? }` | 消息展示          |
| `sprite:walk`        | `{ active, direction? }`                                                                                                    | 行走状态通知      |
| `sprite:config`      | `{ width, height, padding }`                                                                                                | 精灵尺寸/配置变化 |
| `sprite:busy:update` | `{ progress, message? }`                                                                                                    | 更新忙碌进度      |
| `sprite:busy:clear`  | `{}`                                                                                                                        | 清除忙碌状态      |

---

## 验证清单

### 功能测试

- [ ] 启动后精灵正常显示在屏幕右下角
- [ ] 精灵空闲状态播放 idle 动画
- [ ] 点击精灵播放 click 动画 + 显示 toast
- [ ] 长按精灵进入拖拽模式，可移动窗口
- [ ] 松开拖拽播放 drop 动画
- [ ] 拖文件到精灵上方显示 fileDragOver 动画 + 提示文字
- [ ] 放下文件正确导入资源 + 播放 fileDrop 动画
- [ ] 鼠标离开精灵区域后，窗口正确穿透（不阻挡其他应用）
- [ ] 右键精灵弹出菜单
- [ ] 双击精灵打开助手窗口
- [ ] 自动行走功能正常（空闲 10 秒后偶尔行走）
- [ ] 关闭/重启精灵窗口后人格状态不丢失
- [ ] 切换精灵动画包后正确加载新动画

### 人格化测试

- [ ] 点击增加 XP（每次 +2）
- [ ] 对话增加 XP（每次 +15）
- [ ] XP 满后自动升级
- [ ] 点击增加好感度（+0.5，每日上限 10 次）
- [ ] 好感度等级随数值变化（50=friend, 60=close-friend...）
- [ ] 夜间（22-6点）偶尔出现困倦动画
- [ ] 长时间不互动好感度微降
- [ ] 每日首次启动记录登录 + 连续登录奖励

### 消息系统测试

- [ ] 主进程调用 `sprite.showToast()` 在精灵上方显示 toast
- [ ] 主进程调用 `sprite.showNotice()` 显示通知 + 按钮可点击
- [ ] 主进程调用 `sprite.showBusy()` 显示进度条
- [ ] 消息优先级：busy > notice > toast
- [ ] 日常关怀提醒正常显示

### 构建测试

- [ ] `pnpm build` 无编译错误
- [ ] `pnpm test` 测试通过
- [ ] 打包后应用正常运行

---

## 风险与回退

### 高风险点

| 风险                                                       | 概率 | 缓解                                                                                                                  |
| ---------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------- |
| 主进程行走动画不如渲染进程 RAF 流畅                        | 中   | `setInterval(16ms)` + `win.setPosition` 在大多数平台表现良好；如有卡顿可改用 Node.js 的 `setImmediate` 或降低到 30fps |
| 原有 `window.ts` 中的 uiohook 点击穿透逻辑与新拖拽逻辑冲突 | 中   | SpriteManager 拖拽时暂停 hover monitor（已有 `onBeforeFollowerShow` 先例）                                            |
| 动画切换时主进程决策 → IPC → 渲染进程播放延迟              | 低   | IPC 延迟 <1ms，不可感知                                                                                               |
| 其他模块仍引用旧 persona IPC 通道                          | 中   | 全局搜索 `persona:` 前缀确认所有调用者已更新                                                                          |

### 回退策略

由于是一次性重构，建议在 Git 上创建 `refactor/sprite-core-main-process` 分支工作。如果重构出现重大问题，可以直接回退到分支前的 commit。

---

## 文件变更总览

### 新建文件 (6)

| 文件                                                        | 用途                     |
| ----------------------------------------------------------- | ------------------------ |
| `packages/sprite-core/sprite-manager.ts`                    | 主进程门面单例           |
| `packages/sprite-core/window-controller.ts`                 | 窗口控制器               |
| `packages/sprite-core/types.ts`                             | 共享类型定义             |
| `electron/main/handlers/sprite-manager-ipc.ts`              | SpriteManager IPC 注册   |
| `src/components/AIAssistant/context/SpriteStateContext.tsx` | 渲染进程只读状态 Context |
| `docs/refactor-sprite-core.md`                              | 本文档                   |

### 大幅修改文件 (6)

| 文件                                         | 变更                            |
| -------------------------------------------- | ------------------------------- |
| `packages/sprite-core/index.ts`              | 新增 SpriteManager + types 导出 |
| `electron/main/handlers/index.ts`            | 更换 handler 注册               |
| `electron/preload/apis/sprite.ts`            | 新增交互上报等 API              |
| `electron/preload/apis/persona.ts`           | 重定向到新通道                  |
| `src/components/AIAssistant/AIAssistant.tsx` | 大幅精简                        |
| `src/components/AIAssistant/hooks/index.ts`  | 精简导出                        |

### 删除文件 (10)

| 文件                                                          |
| ------------------------------------------------------------- |
| `electron/main/handlers/persona-state-ipc.ts`                 |
| `electron/main/handlers/persona-state-service.ts`             |
| `src/components/AIAssistant/hooks/useWalkAnimation.ts`        |
| `src/components/AIAssistant/hooks/useBusyState.ts`            |
| `src/components/AIAssistant/hooks/useNoticeState.ts`          |
| `src/components/AIAssistant/hooks/useSpriteConductor.ts`      |
| `src/components/AIAssistant/hooks/useSpriteStateBridge.ts`    |
| `src/components/AIAssistant/hooks/useClickThrough.ts`         |
| `src/components/AIAssistant/context/SpritePersonaContext.tsx` |
| `src/components/AIAssistant/context/SpritePlayerContext.tsx`  |

### 需要更新的文档

| 文件                             | 更新内容                                                   |
| -------------------------------- | ---------------------------------------------------------- |
| `CLAUDE.md`                      | Architecture 中的精灵系统描述、IPC handler domains、新 API |
| `packages/sprite-core/README.md` | 更新 SpriteManager 用法                                    |
