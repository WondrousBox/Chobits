# 统一消息系统设计文档

## 📊 问题背景

### 原有系统分析

桌面精灵原有三个独立的消息提醒组件：

| 组件                           | 用途                         | 触发方式                   | 位置                 |
| ------------------------------ | ---------------------------- | -------------------------- | -------------------- |
| 轻量提示组件                   | 轻量提示 (welcome/drag/drop) | 通过 prop (`messageState`) | `-top-[32px]`        |
| `NoticeRenderer`（renderers/） | 带等级的通知+按钮交互        | IPC (`app:notice`)         | `-top-[32px]`        |
| `BusyRenderer`（renderers/）   | 忙碌/进度状态                | IPC (`app:busy:*`)         | `-top-[height*0.15]` |

### 主要问题

1. **位置冲突**：三个组件都在精灵上方，没有统一的显示优先级管理
2. **触发方式不一致**：轻量提示用 prop，其他两个用 IPC
3. **样式不统一**：各自实现，缺乏一致的视觉语言
4. **状态分散**：三个独立的 hook/状态，难以协调

---

## 🎯 设计方案

### 消息类型与优先级

```typescript
type MessageType =
  | 'busy' // 忙碌状态（最高优先级）- 阻塞型，显示进度
  | 'notice' // 通知消息（中优先级）- 需要关注，可交互
  | 'toast'; // 轻量提示（低优先级）- 临时信息

// 优先级：busy(3) > notice(2) > toast(1)
```

### 统一消息数据结构

```typescript
interface SpriteMessage {
  id: string; // 唯一标识
  type: MessageType; // 消息类型
  level?: 'info' | 'success' | 'warning' | 'error'; // 等级
  content: string; // 消息内容
  progress?: number; // 进度（0-100，仅 busy）
  buttons?: MessageButton[]; // 交互按钮（仅 notice）
  duration?: number; // 自动关闭时间（0=常驻）
  category?: MessageCategory; // 预设文案分类（仅 toast）
  ctx?: any; // 文案上下文
  routineId?: string; // 关联ID（用于按钮回调）
}
```

Toast 只用于轻量文本、图片和预设文案；需要按钮交互时使用 Notice。

### 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    MessageProvider                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              useMessageQueue (状态管理)              │   │
│  │  - 优先级队列                                        │   │
│  │  - 消息去重/替换逻辑                                  │   │
│  │  - 自动过期清理                                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                              │                               │
│         ┌────────────────────┼────────────────────┐         │
│         ▼                    ▼                    ▼         │
│  ┌─────────────┐      ┌──────────────────┐      ┌─────────────┐ │
│  │ 渲染进程触发  │      │  Message Bridge  │      │ 组件 Props  │ │
│  │ showToast() │      │ app:message:bridge│      │ (兼容模式)  │ │
│  │ showNotice()│      │ 统一 show/clear   │      │             │ │
│  │ showBusy()  │      │ source=app/sprite │      │             │ │
│  └─────────────┘      └──────────────────┘      └─────────────┘ │
│                              │                               │
│                              ▼                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              <SpriteMessage />                       │   │
│  │  - 统一渲染当前最高优先级消息                          │   │
│  │  - 根据 type 显示不同样式                             │   │
│  │  - 动画过渡                                          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 文件结构

```
src/features/sprite/message/
├── index.ts                    # 模块导出
├── types.ts                    # 类型定义（复用 @packages/sprite-core/types 消息类型）
├── MessageContext.tsx          # Context + Provider + IPC 监听
├── message-context-value.ts    # Context value 组装
├── useMessage.ts               # 消息读写 hook
├── useMessageQueue.ts          # 消息队列管理 hook
├── SpriteMessage.tsx           # 统一消息组件
├── renderers/
│   ├── index.ts                # 渲染器导出
│   ├── ToastRenderer.tsx       # Toast 样式渲染
│   ├── NoticeRenderer.tsx      # Notice 样式渲染
│   └── BusyRenderer.tsx        # Busy 样式渲染
└── README.md                   # 本文档
```

---

## 🔧 使用方式

### 渲染进程使用（Hook）

```tsx
import { useMessage } from './message';

function MyComponent() {
  const { showToast, showNotice, showBusy, clearBusy, dismiss } = useMessage();

  // 显示 Toast（预设文案）
  showToast({ category: 'welcome' });
  showToast({ category: 'reminder' });

  // 显示 Toast（自定义文案）
  showToast({ content: '操作成功！', level: 'success', duration: 3000 });

  // 显示 Notice（带按钮）
  showNotice({
    content: '检测到新版本',
    level: 'info',
    buttons: [
      { id: 'update', label: '立即更新', variant: 'default' },
      { id: 'later', label: '稍后', action: 'dismiss' }
    ]
  });

  // 显示 Busy 状态
  showBusy({ content: '正在处理...', progress: 30 });

  // 更新进度
  updateBusy(50, '处理中...');

  // 清除 Busy
  clearBusy();

  // 关闭当前消息
  dismiss();
}
```

### 主进程使用（IPC）

> 主进程消息桥 API（原 `packages/event/interaction.ts` 的 `sendToast` / `sendNotice` / `sendBusy` / `clearBusy` / `sendAppNotice` / `sendAppBusyStart` / `sendAppBusyEnd` / `sendAppBusyProgress`）已随零引用清理移除。主进程侧需要发消息时，直接往 `app:message:bridge` 频道发送 `show` / `clear` 负载即可。

---

## 📋 优先级与显示逻辑

```typescript
const PRIORITY_MAP = { busy: 3, notice: 2, toast: 1 };

// 规则：
// 1. 同一时刻只显示一条消息（最高优先级）
// 2. busy 消息会替换其他所有消息
// 3. notice 消息会替换 toast，但不会替换 busy
// 4. toast 消息只在没有更高优先级消息时显示
// 5. 相同类型的新消息会替换旧消息
```

---

## 🔄 IPC 频道

### 运行时主频道

| 频道                 | 方向            | 说明                                   |
| -------------------- | --------------- | -------------------------------------- |
| `app:message:bridge` | Main → Renderer | 统一消息桥，承载 `show` / `clear` 事件 |

### 兼容入口

| API / 来源            | 说明                                               |
| --------------------- | -------------------------------------------------- |
| `SpriteManager.show*` | sprite 侧消息，统一走 bridge，并带 `source=sprite` |

---

## ✨ 特性

- **统一入口**：一个组件处理所有消息类型
- **优先级管理**：重要消息优先展示，避免遮挡
- **平滑过渡**：消息切换时有动画效果
- **单通道桥接**：`app:*` 和 `sprite:*` 在运行时收敛成一个 message bridge
- **向后兼容**：旧的发送 API 仍然可用，但会映射到统一 bridge
- **类型安全**：完整的 TypeScript 类型定义
- **解耦设计**：触发和展示分离，易于扩展

---

## 📝 后续优化

- [ ] 添加消息队列可视化调试工具
- [ ] 支持消息分组和批量操作
- [ ] 添加声音提醒选项
- [ ] 支持自定义渲染器
- [ ] 添加消息历史记录功能
