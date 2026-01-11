# Resource Tabs 动态组件系统

## 概述

Resource Tabs 系统提供了一个可扩展的架构，允许你动态注册和使用 Tab 组件。所有 Tab 组件通过统一的 Context 获取数据，确保接口一致性。

## 核心概念

### 1. ResourceTabContext

所有 Tab 组件通过 `useResourceTabContext()` Hook 获取统一的上下文数据：

```typescript
const {
  resource, // 当前预览的资源
  currentTime, // 当前播放时间
  mediaPlayerRef, // 媒体播放器引用
  subtitleList, // 字幕列表
  activeSubtitle, // 当前激活的字幕
  setActiveSubtitle, // 设置激活的字幕
  onResourceChange // 资源切换回调
} = useResourceTabContext();
```

### 2. Tab 组件接口

所有 Tab 组件必须是一个标准的 React 组件，通过 Context 获取数据：

```typescript
import { useResourceTabContext } from './ResourceTabContext';

const MyCustomTab: React.FC = () => {
  const { resource } = useResourceTabContext();

  return <div>{resource.title}</div>;
};
```

### 3. Tab 注册系统

使用 `tabRegistry` 注册 Tab 组件：

```typescript
import { tabRegistry } from './tabs';

// 注册本地组件
tabRegistry.register({
  id: 'myTab',
  name: '我的 Tab',
  component: MyCustomTab
});
```

## 使用方式

### 注册本地组件

```typescript
import { tabRegistry } from '@/pages/ResourcePage/components/tabs';
import MyCustomTab from './MyCustomTab';

tabRegistry.register({
  id: 'myTab',
  name: '我的 Tab',
  component: MyCustomTab
});
```

### 注册动态加载的组件

```typescript
import { registerDynamicTab } from '@/pages/ResourcePage/components/tabs';

// 使用动态 import
await registerDynamicTab('myTab', '我的 Tab', async () => {
  return await import('./MyCustomTab');
});
```

### 从 URL 加载组件

```typescript
import { registerTabFromUrl } from '@/pages/ResourcePage/components/tabs';

// 从远程 URL 加载组件
await registerTabFromUrl('remoteTab', '远程 Tab', 'https://example.com/tab-component.js');
```

## 示例：创建自定义 Tab 组件

```typescript
// MyCustomTab.tsx
import React from 'react';
import { useResourceTabContext } from '../tabs/ResourceTabContext';

const MyCustomTab: React.FC = () => {
  const { resource, currentTime } = useResourceTabContext();

  return (
    <div className="h-full p-4">
      <h2>资源信息</h2>
      <p>标题: {resource.title}</p>
      <p>当前时间: {currentTime}s</p>
    </div>
  );
};

export default MyCustomTab;
```

## 默认 Tab 组件

系统已包含以下默认 Tab 组件：

- `content` - 内容 Tab（显示文本、PDF、Office 文档等）
- `subtitle` - 字幕 Tab（显示视频字幕）
- `translate` - 翻译 Tab（占位实现）
- `summary` - 总结 Tab（占位实现）
- `list` - 列表 Tab（显示资源文件列表）

这些组件在应用启动时自动注册。

## 注意事项

1. Tab ID 必须是 `TabType` 类型之一：`'content' | 'subtitle' | 'translate' | 'summary' | 'list'`
2. 所有 Tab 组件应该使用 `useResourceTabContext()` 获取数据，而不是通过 props
3. Tab 组件应该处理自己的布局和样式，容器会提供 `h-full` 类
4. 动态加载的组件需要确保兼容当前的 React 版本和依赖
