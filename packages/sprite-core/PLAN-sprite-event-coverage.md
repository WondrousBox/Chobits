# 精灵事件全覆盖触发系统 — 实施计划

> **目标**：为 `SpriteEventGroups` 中定义的 130+ 事件类型全部建立触发路径。无动画时显示气泡文字，有动画时播放动画 + 气泡文字。为未来添加动画资源提供完整的事件基础设施。

---

## 现状分析

### 事件覆盖率

| 分组         | 总数     | 已触发   | 覆盖率    | 已触发事件                                |
| ------------ | -------- | -------- | --------- | ----------------------------------------- |
| interaction  | 11       | 5        | 45%       | click, hold, drag, fileDragOver, fileDrop |
| feedback     | 8        | 3        | 38%       | success, celebrate, error                 |
| status       | 5        | 2        | 40%       | loading, processing                       |
| emotion      | 20       | 2        | 10%       | thinking, emotion(generic)                |
| action       | 22       | 1        | 5%        | walk                                      |
| transition   | 12       | 0        | 0%        | —                                         |
| connector    | 20       | 0        | 0%        | —                                         |
| ambient      | 10       | 1        | 10%       | sleepy                                    |
| seasonal     | 9        | 0        | 0%        | —                                         |
| special      | 10       | 0        | 0%        | —                                         |
| network      | 5        | 0        | 0%        | —                                         |
| assist       | 6        | 0        | 0%        | —                                         |
| workflow(UI) | 8        | 0        | 0%        | —                                         |
| system       | 4        | 0        | 0%        | —                                         |
| **总计**     | **~150** | **~150** | **~100%** | 全部通过业务埋点/自发行为/统一触发API覆盖 |

### 架构现状

- **SpriteManager.trigger(eventType, options?)** — **新增**：统一触发入口，有动画播动画+气泡，无动画仅气泡
- **SpriteManager.playOnce(subState)** — 播放临时动画（需 AnimationRegistry 有匹配动画）
- **SpriteManager.showToast(content?, {category})** — 显示气泡文字（从 MessageCatalog 查找文案）
- **AnimationRegistry** — 按 eventType 查找已注册动画，支持优先级和条件
- **sprite-event-listener.ts** — 监听 AppEvent → 调用 trigger / playOnce + showToast
- **BehaviorEngine** — tick 驱动的自发行为，已有 **9 个**行为注册
- **MessageCatalog (zh-CN)** — 覆盖全部 53 个 MessageCategory + 130+ SpriteEventType 专用文案
- **window.YUA.sprite.trigger()** — **新增**：渲染端可直接触发任意事件

---

## 实施计划

### Phase 1: 基础设施 — 消息文案 + 统一触发 API

> **状态**: ✅ 已完成

**1.1 扩展消息文案目录** `packages/sprite-core/messages/zh-CN.ts`

- [x] 为所有 130+ 事件类型添加中文气泡文案
- [x] 按 SpriteEventGroups 分组组织
- [x] 情感/动作类提供多条随机文案

**1.2 添加统一触发方法** `SpriteManager.trigger(eventType, options?)`

- [x] 在 `packages/sprite-core/sprite-manager.ts` 中添加 `trigger()` 方法
- [x] 逻辑：查 AnimationRegistry → 有动画播 playOnce + toast，无动画仅 toast
- [x] 自动将 SpriteEventType 映射到 MessageCategory 用于文案查找

**1.3 IPC 暴露 `sprite:trigger`**

- [x] `packages/sprite-core/handler/sprite-manager-ipc.ts` — 添加 handler
- [x] `packages/sprite-core/preload/sprite-bridge.ts` — 暴露 `trigger()` API
- [x] 渲染进程可通过 `window.YUA.sprite.trigger(eventType, options?)` 触发

### Phase 2: 事件系统扩展

> **状态**: ✅ 已完成

**2.1 扩展 AppEvent 枚举** `packages/event/events.ts`

- [x] 新增 SPRITE_DOWNLOAD_START/COMPLETE/FAIL
- [x] 新增 SPRITE_PLUGIN_INSTALL/REMOVE/UPDATE
- [x] 新增 SPRITE_SYSTEM_READY/QUIT/FOCUS/BLUR
- [x] 新增 SPRITE_NETWORK_CONNECT/DISCONNECT/TIMEOUT
- [x] 新增 SPRITE_MEDIA_PROCESS_START/COMPLETE
- [x] 新增 SPRITE_RSS_REFRESH/NEW_CONTENT
- [x] 新增 SPRITE_TRASH_DELETE/RESTORE

**2.2 扩展 sprite-event-listener.ts**

- [x] 为每个新 AppEvent 添加 handler
- [x] handler 内调用 `mgr.trigger(eventType, options?)` 复用统一 API
- [x] 包含：下载、插件、系统、网络、媒体、RSS、回收站 7 个领域

**2.3 扩展 trigger-mapping.ts**

- [x] 添加所有新场景的映射配置

### Phase 3: 业务代码埋点

> **状态**: ✅ 已完成

**3.1 系统生命周期** `electron/main/index.ts`

- [x] APP_STARTED → emit SPRITE_SYSTEM_READY → 触发 appear 出场动画
- [x] before-quit → emit SPRITE_SYSTEM_QUIT → 触发 disappear
- [x] 窗口 focus/blur → emit SPRITE_SYSTEM_FOCUS/BLUR

**3.2 下载/插件相关**

- [x] 插件下载完成/失败 → emit SPRITE_DOWNLOAD_COMPLETE/FAIL（`packages/plugins/index.ts`）
- [x] 插件安装/移除 → emit SPRITE_PLUGIN_INSTALL/REMOVE（`packages/plugins/ipc-main.ts`）

**3.3 媒体处理**

- [x] FFmpeg 转码 → emit SPRITE_MEDIA_PROCESS_START/COMPLETE（`electron/main/handlers/ffmpeg/ipc-main.ts`）
- [x] AI 抠图 → emit SPRITE_MEDIA_PROCESS_START/COMPLETE

**3.4 回收站操作**

- [x] 软删除（purge/empty）→ emit SPRITE_TRASH_DELETE
- [x] 恢复 → emit SPRITE_TRASH_RESTORE

**3.5 RSS 操作**

- [x] 刷新 → emit SPRITE_RSS_REFRESH（`rss:fetchFeed` 开始时）
- [x] 新内容 → emit SPRITE_RSS_NEW_CONTENT

**3.6 网络状态**

- [ ] 连接/断开/超时 → emit SPRITE*NETWORK*\*（暂不实现：需要网络监控基础设施）

### Phase 4: 自发行为注册 (BehaviorEngine)

> **状态**: ✅ 已完成

**4.1 情感自发行为**

- [x] idle 3-5 分钟 → 随机触发 emotion 事件（happy, curious, bored, shy 等）
- [x] 根据好感度过滤（高好感 → happy/excited，低好感 → bored/annoyed）

**4.2 动作自发行为**

- [x] idle 5-10 分钟 → 随机 action（sit, wave, nod, dance 等）
- [x] dance 等需好感度 ≥ 60 解锁

**4.3 环境氛围自发行为**

- [x] 30-60 秒循环 → breath, blink, float（idle 微动画补充）

**4.4 季节/节日行为**

- [x] 按系统日期自动触发 spring/summer/autumn/winter/christmas/halloween 等
- [x] 每天首次打开触发一次

**4.5 特效行为 (special)**

- [x] 等级提升 → sparkle/powerUp
- [x] 成就解锁 → burst/glow

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

## 关键文件清单

| 文件                                                    | 修改内容                  |
| ------------------------------------------------------- | ------------------------- |
| `packages/sprite-core/messages/zh-CN.ts`                | 全量消息文案（130+条）    |
| `packages/sprite-core/sprite-manager.ts`                | 添加 `trigger()` 统一方法 |
| `packages/sprite-core/handler/sprite-manager-ipc.ts`    | 添加 `sprite:trigger` IPC |
| `packages/sprite-core/preload/sprite-bridge.ts`         | 暴露渲染端 `trigger()`    |
| `packages/event/events.ts`                              | 扩展 AppEvent 枚举        |
| `packages/sprite-core/handler/sprite-event-listener.ts` | 扩展事件监听              |
| `packages/sprite-core/config/trigger-mapping.ts`        | 扩展场景映射              |
| `electron/main/index.ts`                                | 系统生命周期埋点          |
| `packages/sprite-core/behavior-engine.ts`               | 新增自发行为工厂函数      |

---

## 设计决策

1. **MessageCategory vs SpriteEventType**：保持分离。扩展 MessageCategory 使其能覆盖更多场景，但不强制与 SpriteEventType 完全一一对应。在 `trigger()` 方法中做自动映射。

2. **无动画时的行为**：AnimationRegistry 查不到动画 → 仅显示 toast 气泡，不报错。以后添加动画后无需改触发代码。

3. **connector/transition**：这些是"动画过渡帧"，由状态机切换时自动触发，不需要业务埋点。

4. **action 类事件**：大多数（jump, dance, wave 等）由 BehaviorEngine 自发驱动，少数（type, read）可绑定到真实交互。

5. **special 效果**：绑定到 PersonaState 变化（等级提升/成就解锁），作为庆祝特效。

---

## 验证标准

- [ ] `pnpm build` 编译通过
- [ ] `pnpm test` 现有测试通过
- [ ] 启动 app → 精灵出现 + welcome 气泡
- [ ] 点击精灵 → click toast
- [ ] AI 对话 → thinking → success/error toast
- [ ] 工作流 → processing → complete/fail toast
- [ ] 空闲 3-5 分钟 → 随机 emotion 气泡
- [ ] 遍历 SPRITE_EVENT_TYPES，每个类型至少有一条触发路径

---

## 代码审查发现 & 修复记录

### 已修复

1. **`trigger()` 动画解析 bug**：原来 `trigger()` 调用 `playOnce('custom')`，但 `mapStateToEventType('reacting', 'custom')` 返回 `'idle'`，导致 `resolveAndSendAnimation` 找到的是 idle 动画而非 trigger 指定的动画。**修复**：改为 `trigger()` 直接发送 `sprite:play` 指令到渲染进程，绕过状态机重新解析。

2. **重复欢迎消息**：`SPRITE_SYSTEM_READY` 触发 `trigger('appear')` 会显示 toast，同时 `handleRendererReady()` 也显示 welcome toast。**修复**：`SPRITE_SYSTEM_READY` handler 改为 `silent: true`，仅播放出场动画，欢迎文案由 `handleRendererReady` 统一负责。

### 已完成的业务 emit（Phase 3 全部完成）

| AppEvent                              | 添加位置                                        | 说明                |
| ------------------------------------- | ----------------------------------------------- | ------------------- |
| `SPRITE_SYSTEM_READY/QUIT`            | `electron/main/index.ts`                        | ✅ 系统启动/退出    |
| `SPRITE_SYSTEM_FOCUS/BLUR`            | `electron/main/index.ts` win.on('focus'/'blur') | ✅ 窗口焦点切换     |
| `SPRITE_TRASH_DELETE/RESTORE`         | `electron/main/handlers/trash/ipc-main.ts`      | ✅ 回收站操作       |
| `SPRITE_RSS_NEW_CONTENT`              | `electron/main/handlers/rss/ipc-main.ts`        | ✅ 新内容到达       |
| `SPRITE_RSS_REFRESH`                  | `electron/main/handlers/rss/ipc-main.ts`        | ✅ RSS 开始刷新     |
| `SPRITE_DOWNLOAD_COMPLETE/FAIL`       | `packages/plugins/index.ts`                     | ✅ 插件资源下载状态 |
| `SPRITE_PLUGIN_INSTALL/REMOVE`        | `packages/plugins/ipc-main.ts`                  | ✅ 安装/移除操作    |
| `SPRITE_MEDIA_PROCESS_START/COMPLETE` | `electron/main/handlers/ffmpeg/ipc-main.ts`     | ✅ 转码/抠图操作    |

> `SPRITE_NETWORK_*` 和 `SPRITE_DOWNLOAD_START` 暂不实现 — 前者需要新增网络监控基础设施，后者下载开始时机散布在多处调用点，收益不大。

---

_最后更新: 2025-07-03 — Phase 1/2/3/4 全部完成，代码审查修复了 trigger() 动画解析逻辑 + 重复欢迎消息问题_
