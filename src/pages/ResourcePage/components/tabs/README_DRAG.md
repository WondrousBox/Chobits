# Tab 拖拽排序功能

## 功能概述

Tab 组件支持类似 Chrome 浏览器的拖拽排序功能，提供流畅的用户体验。

## 主要特性

### 1. **整体拖拽**

- 拖拽整个 tab 即可重新排序，无需点击特定的拖拽手柄
- 鼠标悬停时显示 `grab` 光标，拖拽时显示 `grabbing` 光标
- 拖拽时 tab 半透明显示（opacity: 0.8），提供视觉反馈

### 2. **智能布局**

- **宽松模式**：tab 宽度充足时，显示图标 + 文字
- **紧凑模式**：tab 宽度小于 80px 时，只显示图标
- 使用 `ResizeObserver` 实时监测 tab 宽度，自动切换显示模式
- Tab 宽度自适应：`min-w-[40px] max-w-[200px] flex-shrink flex-grow basis-0`

### 3. **平滑动画**

- 使用 `@dnd-kit` 提供的过渡动画
- 拖拽时自动调整其他 tab 的位置
- 支持键盘拖拽（方向键）

### 4. **顺序持久化**

- 拖拽后的顺序自动保存到 `TabRegistry`
- 跨资源类型保持顺序一致性
- 只影响当前资源类型允许的 tab，不影响其他 tab

## 使用方式

### 拖拽排序

1. 将鼠标移动到任意 tab 上
2. 按住鼠标左键并拖动
3. 移动到目标位置后松开鼠标
4. 顺序自动保存

### 键盘排序

1. 使用 Tab 键选中某个 tab
2. 按住空格键激活拖拽
3. 使用方向键（← →）移动位置
4. 再次按空格键放下

## 图标类型

Tab 支持三种图标类型：

### 1. React 组件（推荐）

```typescript
import { TbStar } from 'react-icons/tb';

tabRegistry.register({
  id: 'myTab',
  name: '我的 Tab',
  component: MyComponent,
  icon: TbStar // React 组件
});
```

### 2. SVG 字符串

```typescript
tabRegistry.register({
  id: 'myTab',
  name: '我的 Tab',
  component: MyComponent,
  icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>'
});
```

### 3. 图片 URL

```typescript
tabRegistry.register({
  id: 'myTab',
  name: '我的 Tab',
  component: MyComponent,
  icon: 'https://example.com/icon.png' // 或本地路径
});
```

## 技术实现

### 拖拽检测

- 使用 `PointerSensor` 检测鼠标拖拽
- 使用 `KeyboardSensor` 支持键盘操作
- 激活距离：8px（避免误触）

### 布局策略

```typescript
// Tab 容器
<TabsList className="flex-1 justify-start rounded-none border-0 bg-transparent h-9 px-2 group">

// 单个 Tab
<SortableTabTrigger
  className="text-xs gap-1 rounded-none border-b-2 border-t-0 border-l-0 border-r-0 border-transparent
             data-[state=active]:border-primary data-[state=active]:bg-transparent
             data-[state=active]:shadow-none h-9 px-3
             min-w-[40px] max-w-[200px] flex-shrink flex-grow basis-0"
/>
```

### 自适应显示

```typescript
// 使用 ResizeObserver 监测宽度
const tabRef = React.useCallback((node: HTMLElement | null) => {
  if (node) {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // 当宽度小于 80px 时，只显示图标
        setIsCompact(entry.contentRect.width < 80);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }
}, []);

// 根据模式渲染
{icon && <TabIcon icon={icon} />}
{!isCompact && <span className="truncate ml-1.5">{label}</span>}
```

## 注意事项

1. **图标尺寸**：建议使用 24x24 或更小的图标，确保在紧凑模式下清晰可见
2. **SVG 安全**：SVG 字符串使用 `dangerouslySetInnerHTML`，确保来源可信
3. **图片加载**：URL 图标可能有加载延迟，建议使用 CDN 或本地资源
4. **性能优化**：`ResizeObserver` 会在每次 tab 宽度变化时触发，已做防抖处理

## 样式定制

### 拖拽状态

```css
/* 拖拽中的 tab */
[data-dragging='true'] {
  opacity: 0.8;
  z-index: 50;
  cursor: grabbing;
}

/* 正常状态 */
[data-dragging='false'] {
  cursor: grab;
}
```

### 激活状态

```css
/* 激活的 tab（下划线） */
[data-state='active'] {
  border-bottom-color: hsl(var(--primary));
  background-color: transparent;
  box-shadow: none;
}
```

## API 参考

### TabIcon 组件

```typescript
interface TabIconProps {
  icon: TabIcon;
  className?: string;
}

// 自动检测图标类型并渲染
<TabIcon icon={myIcon} className="w-4 h-4" />
```

### SortableTabTrigger 组件

```typescript
interface SortableTabTriggerProps {
  id: string;
  value: string;
  className?: string;
  icon?: TabIcon;
  label: string;
}
```

### TabIcon 类型

```typescript
type TabIcon =
  | React.ComponentType<{ className?: string }> // React 组件
  | string; // SVG 字符串或图片 URL
```
