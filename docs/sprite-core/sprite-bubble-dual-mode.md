# 桌面精灵双模式气泡展示系统

## 背景

桌面精灵的气泡（toast/notice/busy）原先渲染在**同一个主窗口**内，靠 `padding` 撑出的空白区域承载。该模式有两个问题：

- 主窗口尺寸 = 精灵尺寸 + `padding*2`，带来大块透明/穿透区域
- 气泡内容长度变化时只能受 `padding` 限制，气泡无法自由扩张

为解决上述问题，引入了**双模式气泡展示**：保留传统 inline 模式，并新增默认的 fixed-top 顶部跟随窗口模式。

## 两种模式

| 模式 | 说明 | padding 行为 | 气泡承载 |
|------|------|-------------|---------|
| `inline` | 气泡渲染在主精灵窗口内，沿用 `padding` 撑出的空白区域 | 使用持久化的真实 `padding` | 主窗口内的 `<SpriteMessage />` |
| `fixed-top`（默认） | 气泡由独立的 `spriteBubbleFixedTop` 窗口承载，固定在主窗口上方并跟随主窗口移动 | 运行期强制为 `0`，持久化原值保留 | 独立窗口的 `<SpriteMessage />` |

## 架构概览

```
┌───────────────────────────────────────────────────────┐
│ Electron Main Process                                 │
│                                                       │
│  SpriteManager                                        │
│    ├── bubbleModeConfig (BubbleModeConfig)            │
│    ├── getEffectivePadding() → 0 when window mode     │
│    ├── sendMessageBridge() → broadcasts to:           │
│    │     ├── this.win (主精灵窗口)                     │
│    │     └── getMessageRecipients()                    │
│    │         (spriteBubbleFixedTop)                     │
│    └── emitConfigChanged() → 同上广播                  │
│                                                       │
│  WindowController / MovementCoordinator                │
│    └── 使用 getEffectivePadding() 计算尺寸/视口        │
│                                                       │
│  windowManager                                        │
│    ├── create('spriteBubbleFixedTop')                 │
│    └── updateFollowerPositionsManually()              │
│                                                       │
│  IPC handlers                                         │
│    ├── sprite:bubble:resize → setSize + reposition    │
│    ├── sprite:bubble:setVisible → show/hide           │
│    ├── sprite:config:getBubbleMode                    │
│    └── sprite:config:setBubbleMode + hide stale win   │
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│ Renderer — 主精灵窗口 (route: /)                      │
│                                                       │
│  AIAssistant.tsx                                      │
│    ├── effectivePadding = isBubbleWindowMode?0        │
│    ├── !isBubbleWindow && <SpriteMessage />           │
│    └── setAssistantSize({ padding: effectivePadding })│
└───────────────────────────────────────────────────────┘

┌───────────────────────────────────────────────────────┐
│ Renderer — 气泡独立窗口 (route: /sprite-bubble)       │
│                                                       │
│  SpriteBubblePage.tsx                                 │
│    ├── MessageProvider + SpriteMessage                │
│    ├── ResizeObserver → sprite:bubble:resize          │
│    └── current message? → bubbleSetVisible(true/false)│
└───────────────────────────────────────────────────────┘
```

## 关键模块与文件

### sprite-core 层

| 文件 | 变更内容 |
|------|---------|
| `packages/sprite-core/types.ts` | 新增 `SpriteBubbleMode`、`DEFAULT_SPRITE_BUBBLE_MODE`、`SpriteConfig.bubbleMode` |
| `packages/sprite-core/manager/persistence.ts` | 新增 `BubbleModeConfig` 持久化类（存储路径: `userData/data/sprite-bubble-mode.json`） |
| `packages/sprite-core/manager/sprite-manager.ts` | 持有 `bubbleModeConfig`；`getEffectivePadding()`、`getBubbleMode()`、`setBubbleMode()`；`sendMessageBridge`/`emitConfigChanged` 广播到 `getMessageRecipients` |
| `packages/sprite-core/manager/movement-coordinator.ts` | `resolveEffectivePadding()` 辅助函数；视口/预览计算使用有效 padding |
| `packages/sprite-core/manager/types.ts` | `SpriteManagerOptions.getMessageRecipients` 可选注入 |
| `packages/sprite-core/preload/sprite-bridge.ts` | 暴露 `getBubbleMode`、`setBubbleMode`、`bubbleResize`、`bubbleSetVisible` |
| `packages/sprite-core/handler/sprite-manager-ipc.ts` | 注册 `sprite:config:getBubbleMode`、`sprite:config:setBubbleMode` handler；注入 `getMessageRecipients`；`WindowController.getPadding` → `mgr.getEffectivePadding()` |

### Electron 主进程层

| 文件 | 变更内容 |
|------|---------|
| `electron/main/config/window.ts` | `CustomWindowKeys.spriteBubbleFixedTop`；使用 `followMain: true` + `followerPreferMode: 'fixed-top'` |
| `electron/main/handlers/window.ts` | 注册 `sprite:bubble:resize`、`sprite:bubble:setVisible` IPC；按发送方识别当前气泡窗口并触发 follower reposition；预创建 `spriteBubbleFixedTop` |

### 渲染层

| 文件 | 变更内容 |
|------|---------|
| `src/features/sprite-bubble/SpriteBubblePage.tsx` | 气泡独立窗口页面，包裹 `MessageProvider`，`ResizeObserver` 上报尺寸，`useMessage` 驱动可见性 |
| `src/features/sprite-bubble/index.ts` | 导出 `SpriteBubblePage` |
| `src/App.tsx` | 路由 `/sprite-bubble` → `<SpriteBubblePage />` |
| `src/features/sprite-assistant/AIAssistant.tsx` | `effectivePadding` 计算逻辑；独立窗口模式跳过内联气泡渲染；padding 0 传入 `setAssistantSize` |
| `src/features/sprite-assistant/context/sprite-state-sync.ts` | `DEFAULT_SPRITE_CONFIG.bubbleMode` 默认值；`resolveInitialSpriteConfig`/`mergePlayCommandIntoSpriteConfig` 传播 `bubbleMode` |
| `src/pages/ExtensionSettings/BubbleModeSettings.tsx` | 气泡模式切换 UI（Select 组件） |

## 运行期行为

### 消息广播流程

```
SpriteManager.showToast/showNotice/showBusy
  → sendRendererMessage(payload)
    → sendMessageBridge({ kind: 'show', payload, source: 'sprite' })
      → this.win.webContents.send(MESSAGE_IPC_CHANNELS.BRIDGE, ...)  // 主窗口
      → isBubbleWindowMode(bubbleMode)
        ? getMessageRecipients().forEach(win => win.webContents.send(...))  // 当前气泡窗口
        : skip

SpriteManager.emitConfigChanged()
  → this.win.webContents.send('sprite:config', configSnapshot)
  → getMessageRecipients().forEach(win => win.webContents.send(...))
```

### 气泡窗口尺寸与定位

1. `SpriteBubblePage` 中 `ResizeObserver` 检测到内容尺寸变化
2. 节流后调用 `window.YUA.sprite.bubbleResize(width, height)`
3. 主进程 `sprite:bubble:resize` handler 根据发送方找到当前气泡窗口并调用 `setSize`
4. 主进程触发 `updateFollowerPositionsManually()`；`fixed-top` 会按 manager 的 `fixed-top` follower 模式固定在主窗口上方

### 可见性管理

- 消息到达 → `SpriteBubbleContent` 中 `current !== null` → 立即 `bubbleSetVisible(true)`
- 消息消失 → 延迟 220ms（覆盖 200ms 淡出动画）→ `bubbleSetVisible(false)`
- 切换模式 → `sprite:config:setBubbleMode` handler 清空旧气泡窗口消息并隐藏非当前承载窗口

### Padding 生效逻辑

```typescript
// SpriteManager
getEffectivePadding(): number {
  return isBubbleWindowMode(this.bubbleModeConfig.mode) ? 0 : this.spriteConfig.padding;
}

// MovementCoordinator
function resolveEffectivePadding(padding: number, mode?: SpriteBubbleMode): number {
  return isBubbleWindowMode(mode) ? 0 : padding;
}

// AIAssistant (renderer)
const effectivePadding = isBubbleWindowMode(bubbleMode) ? 0 : padding;
```

`spriteConfig.padding` 的持久化值始终保留，独立窗口模式仅在运行期将其覆盖为 0。

## 模式切换时序

1. 用户在 `BubbleModeSettings` 选择新模式
2. `window.YUA.sprite.setBubbleMode(mode)` → IPC `sprite:config:setBubbleMode`
3. 主进程 `mgr.setBubbleMode()` → 更新 `bubbleModeConfig` 并持久化 + 广播 `sprite:config`
4. 主进程隐藏旧气泡承载窗口，避免过期消息残留
5. 主窗口收到 `sprite:config` → `effectivePadding` 变化 → 重新调用 `setAssistantSize` 调整窗口尺寸
6. 气泡窗口收到 `sprite:config` → 可感知当前模式

## 持久化

`BubbleModeConfig` 存储到 `userData/data/sprite-bubble-mode.json`：

```json
{
  "mode": "fixed-top"
}
```

`SpriteManager.start()` 时加载 `bubbleModeConfig.load()` 并将 `mode` 写入 `spriteConfig.bubbleMode`。

## 注意事项

- **TTS 不受影响**：`speak()` 在主进程内一次调用 `speakService.speak()`，语音合成通过 `sprite:speak` 单播到主窗口，气泡窗口的 `MessageProvider` 不触发 TTS
- **焦点抢夺**：气泡窗口配置 `focusable: false` + `preferShowInactive: true`，show 时走 `showInactive` 路径
- **空消息闪烁**：`SpriteBubblePage` 中隐藏延迟 220ms 大于淡出动画时长，避免消息队列快速切换时的闪烁
- **调试 overlay**：`PaddingDebugOverlay` 仅在 inline 模式渲染，独立窗口模式下无 padding 区域可参考
- **气泡窗口在模式切换时会被主动清空/隐藏**，避免残留空窗口或过期消息

## 验证清单

- [ ] inline 模式下：现有 toast/notice/busy 行为不变；调试 overlay/拖拽热区一致
- [ ] fixed-top 模式下：
  - [ ] 启动时 `spriteBubbleFixedTop` 已存在但隐藏
  - [ ] 触发 `showToast`/`speak` 后气泡窗口固定在主窗口上方
  - [ ] 长文本/多行内容下窗口宽高自适应且仍保持在主窗口上方居中
  - [ ] 主精灵移动时气泡继续跟随，但不自动切换到左/右/下方
  - [ ] 主精灵窗口尺寸缩到 `width × height`，padding 持久化值保留
- [ ] 切换开关：
  - [ ] inline → fixed-top：主窗口缩小、气泡窗口接管显示
  - [ ] fixed-top → inline：主窗口恢复 padding 总尺寸、气泡窗口隐藏
- [ ] `pnpm test` 通过；TypeScript 编译无新增错误
