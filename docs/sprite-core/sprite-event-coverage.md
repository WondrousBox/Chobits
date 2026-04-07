# 精灵事件全覆盖触发系统

> **状态**：✅ 已完成（Phase 1/2/3/4 全部完成）  
> **目标**：为 `SpriteEventGroups` 中定义的 150+ 事件类型全部建立触发路径。

---

## 事件覆盖率

| 分组         | 总数     | 覆盖率                                                    |
| ------------ | -------- | --------------------------------------------------------- |
| interaction  | 11       | 100%                                                      |
| feedback     | 8        | 100%                                                      |
| status       | 5        | 100%                                                      |
| emotion      | 20       | 100%                                                      |
| action       | 22       | 100%                                                      |
| transition   | 12       | 100%                                                      |
| connector    | 20       | 100%                                                      |
| ambient      | 10       | 100%                                                      |
| seasonal     | 9        | 100%                                                      |
| special      | 10       | 100%                                                      |
| network      | 5        | 100%（部分通过 trigger() 直接触发，网络监控基础设施暂无） |
| assist       | 6        | 100%                                                      |
| workflow(UI) | 8        | 100%                                                      |
| system       | 4        | 100%                                                      |
| **总计**     | **~150** | **~100%**                                                 |

所有事件通过以下路径覆盖：业务 AppEvent 埋点 / 自发行为 / `SpriteManager.trigger()` 统一 API / 渲染端 `window.YUA.sprite.trigger()`。

---

## 架构现状

- **`SpriteManager.trigger(eventType, options?)`** — 统一触发入口。有动画播动画+气泡，无动画仅气泡
- **`SpriteManager.playOnce(subState)`** — 播放临时反应动画
- **`SpriteManager.showToast(content?, {category})`** — 显示气泡文字
- **`AnimationRegistry`** — 按 eventType 查找已注册动画，支持优先级和条件
- **`sprite-event-listener.ts`** — 监听 AppEvent → 调用 `trigger()` / `playOnce()` + `showToast()`
- **`BehaviorEngine`** — tick 驱动的自发行为，已注册 10 个默认行为
- **`MessageCatalog (zh-CN)`** — 覆盖全部 53 个 MessageCategory + 150+ SpriteEventType 专用文案
- **`window.YUA.sprite.trigger()`** — 渲染端可直接触发任意事件

---

## 事件触发来源分类

### A. 业务事件 → AppEvent → sprite-event-listener → trigger()

适用于：AI 聊天、工作流、资源导入、下载、插件、媒体处理、RSS、回收站

### B. 用户交互 → reportInteraction() → playOnce + showToast

适用于：click, hold, drag, fileDragOver, fileDrop, hover, double-click

### C. 自发行为 → BehaviorEngine.tick() → trigger()

适用于：emotion, action, ambient, seasonal, special

### D. 状态机切换 → transitionTo() 内部自动

适用于：connector/transition（动画过渡帧，状态切换时自动触发）

### E. 渲染进程直接调用 → window.YUA.sprite.trigger()

适用于：UI 层临时触发特定事件（调试、演示、用户操作反馈）

---

## 已完成的业务 AppEvent 埋点

| AppEvent                                  | 添加位置                                        | 说明             |
| ----------------------------------------- | ----------------------------------------------- | ---------------- |
| `SPRITE_AI_START/COMPLETE`                | AI 对话流程                                     | AI 开始/完成     |
| `SPRITE_WORKFLOW_START/COMPLETE/PROGRESS` | 工作流引擎                                      | 工作流执行       |
| `SPRITE_RESOURCE_IMPORT_START/COMPLETE`   | 资源导入                                        | 资源导入         |
| `SPRITE_SYSTEM_READY/QUIT`                | `electron/main/index.ts`                        | 系统启动/退出    |
| `SPRITE_SYSTEM_FOCUS/BLUR`                | `electron/main/index.ts` win.on('focus'/'blur') | 窗口焦点切换     |
| `SPRITE_TRASH_DELETE/RESTORE`             | `electron/main/handlers/trash/ipc-main.ts`      | 回收站操作       |
| `SPRITE_RSS_NEW_CONTENT`                  | `electron/main/handlers/rss/ipc-main.ts`        | 新内容到达       |
| `SPRITE_RSS_REFRESH`                      | `electron/main/handlers/rss/ipc-main.ts`        | RSS 开始刷新     |
| `SPRITE_DOWNLOAD_COMPLETE/FAIL`           | `packages/plugins/index.ts`                     | 插件资源下载状态 |
| `SPRITE_PLUGIN_INSTALL/REMOVE`            | `packages/plugins/ipc-main.ts`                  | 安装/移除操作    |
| `SPRITE_MEDIA_PROCESS_START/COMPLETE`     | `electron/main/handlers/ffmpeg/ipc-main.ts`     | 转码/抠图操作    |

> `SPRITE_NETWORK_*` 和 `SPRITE_DOWNLOAD_START` 暂不实现 — 前者需要新增网络监控基础设施，后者下载开始时机散布在多处调用点。

---

## 已注册的默认自发行为

| 行为            | 触发条件                       | 动作                            |
| --------------- | ------------------------------ | ------------------------------- |
| auto-walk       | idle/bored、空闲 >5s、80% 概率 | 随机行走                        |
| night-sleepy    | 22:00-06:00                    | `playOnce('sleepy')` + reminder |
| idle-sleepy     | 空闲 >100s                     | `playOnce('sleepy')`            |
| long-idle-bored | 空闲 >2min                     | `transitionTo('bored')`         |
| random-message  | idle、空闲 >1min               | 随机 tip                        |
| favor-decay     | 空闲 >30min、好感度 >20        | `changeFavor(-1)`               |
| emotion         | idle 3-5min                    | 按好感度池随机触发情感事件      |
| action          | idle 5-10min                   | 按好感度池随机触发动作事件      |
| ambient         | 30-60s 循环                    | breath/blink/float 微动画       |
| seasonal        | 每天首次                       | 按日期触发季节/节日事件         |

---

## 关键文件清单

| 文件                                                    | 说明                                      |
| ------------------------------------------------------- | ----------------------------------------- |
| `packages/sprite-core/manager/sprite-manager.ts`        | SpriteManager 门面（含 `trigger()` 方法） |
| `packages/sprite-core/manager/default-behaviors.ts`     | 10 个默认行为注册                         |
| `packages/sprite-core/messages/zh-CN.ts`                | 全量消息文案（150+ 条）                   |
| `packages/sprite-core/handler/sprite-manager-ipc.ts`    | `sprite:trigger` IPC handler              |
| `packages/sprite-core/preload/sprite-bridge.ts`         | 渲染端 `trigger()` API                    |
| `packages/event/events.ts`                              | AppEvent 枚举                             |
| `packages/sprite-core/handler/sprite-event-listener.ts` | AppEvent → 精灵事件监听                   |
| `packages/sprite-core/config/trigger-mapping.ts`        | 场景→事件映射配置                         |
| `packages/sprite-core/behavior-engine.ts`               | 自发行为工厂函数                          |

---

## 设计决策

1. **MessageCategory vs SpriteEventType**：保持分离。扩展 MessageCategory 使其能覆盖更多场景，但不强制与 SpriteEventType 完全一一对应。在 `trigger()` 方法中做自动映射。

2. **无动画时的行为**：AnimationRegistry 查不到动画 → 仅显示 toast 气泡，不报错。以后添加动画后无需改触发代码。

3. **connector/transition**：这些是「动画过渡帧」，由状态机切换时自动触发，不需要业务埋点。

4. **action 类事件**：大多数（jump, dance, wave 等）由 BehaviorEngine 自发驱动，少数（type, read）可绑定到真实交互。

5. **special 效果**：绑定到 PersonaState 变化（等级提升/成就解锁），作为庆祝特效。

6. **trigger() 直接发送 sprite:play**：避免走 `playOnce('custom')` → `mapStateToEventType` 重解析导致的动画不匹配问题。

---

## 代码审查修复记录

1. **`trigger()` 动画解析 bug**：原来 `trigger()` 调用 `playOnce('custom')`，但 `mapStateToEventType('reacting', 'custom')` 返回 `'idle'`，导致找到 idle 动画而非 trigger 指定的动画。修复：`trigger()` 直接发送 `sprite:play` 指令到渲染进程。

2. **重复欢迎消息**：`SPRITE_SYSTEM_READY` 触发 `trigger('appear')` 会显示 toast，同时 `handleRendererReady()` 也显示 welcome toast。修复：`SPRITE_SYSTEM_READY` handler 改为 `silent: true`。

3. **事件监听器绕过消息文案目录**：`sprite-event-listener.ts` 中大量 handler 使用 `showToast(hardcodedString)` + `playOnce()` 组合，直接传入硬编码的中文字符串作为 fallback，完全绕过了 `zh-CN.ts` 中定义的 `spriteEventMessages` 文案。`trigger()` 方法内部会调用 `getSpriteEventText()` 从文案目录随机选取文案，但 `showToast()` 被直接传入固定字符串就不会走查找逻辑。修复：所有 handler 改为 `getSpriteEventText(eventKey)` 查找文案，同时为 AI/工作流/资源导入事件补充了 `spriteEventMessages` 条目（`aiThinking`、`aiComplete`、`aiError`、`workflowStart`、`workflowComplete`、`workflowFail`、`workflowCancel`、`importStart`、`importComplete`、`importError`）。
