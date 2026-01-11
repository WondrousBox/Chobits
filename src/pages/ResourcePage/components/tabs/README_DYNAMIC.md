# Tab 组件动态管理功能

## 功能概述

系统现在支持本地组件和远程组件的混合使用，并且可以动态管理这些组件：

- ✅ **自动显示**：所有注册的组件（本地+远程）都会自动显示在 tab 列表中
- ✅ **动态更新**：注册新组件时自动添加到列表，注销组件时自动移除
- ✅ **用户控制**：用户可以通过设置面板启用/禁用任意组件
- ✅ **分类显示**：设置面板中区分显示本地组件和远程组件
- ✅ **拖拽排序**：类似 Chrome 浏览器，拖拽整个 tab 即可重新排序
- ✅ **智能布局**：tab 密集时自动只显示图标，宽松时显示图标+文字
- ✅ **多种图标**：支持 React 组件、SVG 字符串、图片 URL 三种图标类型

## 使用方式

### 注册组件

#### 注册本地组件

```typescript
import { tabRegistry } from '@/pages/ResourcePage/components/tabs';
import { TbStar } from 'react-icons/tb';
import MyCustomTab from './MyCustomTab';

// 使用 React 组件图标
tabRegistry.register({
  id: 'myCustomTab',
  name: '我的自定义 Tab',
  component: MyCustomTab,
  icon: TbStar
});

// 使用 SVG 字符串图标
tabRegistry.register({
  id: 'svgTab',
  name: 'SVG Tab',
  component: MyCustomTab,
  icon: '<svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/></svg>'
});

// 使用图片 URL 图标
tabRegistry.register({
  id: 'imageTab',
  name: '图片 Tab',
  component: MyCustomTab,
  icon: 'https://example.com/icon.png'
});
```

#### 注册远程组件

```typescript
import { registerDynamicTab } from '@/pages/ResourcePage/components/tabs';

await registerDynamicTab('remoteTab', '远程 Tab', async () => {
  return await import('./RemoteTab');
});
```

### 注销组件

```typescript
import { tabRegistry } from '@/pages/ResourcePage/components/tabs';

// 注销组件
tabRegistry.unregister('myCustomTab');
```

### 启用/禁用组件

```typescript
import { tabRegistry } from '@/pages/ResourcePage/components/tabs';

// 禁用组件（会从 tab 列表中隐藏）
tabRegistry.disable('myCustomTab');

// 启用组件（会重新显示在 tab 列表中）
tabRegistry.enable('myCustomTab');

// 检查组件是否启用
const isEnabled = tabRegistry.isEnabled('myCustomTab');
```

### 监听注册表变化

```typescript
import { tabRegistry } from '@/pages/ResourcePage/components/tabs';

// 添加事件监听器
const unsubscribe = tabRegistry.addEventListener((event) => {
  console.log('Tab 注册表变化:', event.type, event.tabId);

  if (event.type === 'register') {
    console.log('新组件已注册:', event.tab?.name);
  } else if (event.type === 'unregister') {
    console.log('组件已注销:', event.tabId);
  } else if (event.type === 'enable') {
    console.log('组件已启用:', event.tabId);
  } else if (event.type === 'disable') {
    console.log('组件已禁用:', event.tabId);
  }
});

// 移除监听器
unsubscribe();
```

## 用户界面

### 设置按钮

在 tab 列表的右侧有一个设置按钮（⚙️），点击后可以打开设置面板。

### 设置面板

设置面板显示所有可用的 tab 组件，分为两类：

1. **本地组件**：应用内置的组件
2. **远程组件**：动态加载的组件

每个组件都有一个复选框，用户可以：

- ✅ 勾选：启用组件，显示在 tab 列表中
- ❌ 取消勾选：禁用组件，从 tab 列表中隐藏

### 自动更新

- 当新组件注册时，会自动出现在设置面板中
- 当组件注销时，会自动从设置面板中移除
- 启用/禁用的状态会立即反映在 tab 列表中

## 示例：完整的组件生命周期

```typescript
import { tabRegistry, registerDynamicTab } from '@/pages/ResourcePage/components/tabs';

// 1. 注册远程组件
await registerDynamicTab('myRemoteTab', '我的远程 Tab', async () => {
  return await import('./RemoteTab');
});
// ✅ 组件会自动出现在 tab 列表和设置面板中

// 2. 监听变化
const unsubscribe = tabRegistry.addEventListener((event) => {
  if (event.type === 'register') {
    console.log('组件已注册，用户可以在设置中启用/禁用');
  }
});

// 3. 用户通过设置面板禁用组件
// tabRegistry.disable('myRemoteTab') 会被调用
// ✅ 组件会从 tab 列表中隐藏

// 4. 用户通过设置面板重新启用组件
// tabRegistry.enable('myRemoteTab') 会被调用
// ✅ 组件会重新显示在 tab 列表中

// 5. 注销组件
tabRegistry.unregister('myRemoteTab');
// ✅ 组件会从 tab 列表和设置面板中完全移除
```

## 注意事项

1. **默认状态**：新注册的组件默认是启用的
2. **资源类型限制**：组件只会显示在当前资源类型允许的 tab 列表中
3. **动态更新**：所有变化都会实时反映在 UI 中，无需刷新
4. **事件监听**：记得在组件卸载时移除事件监听器，避免内存泄漏

## API 参考

### TabRegistry

```typescript
interface TabRegistry {
  // 注册组件
  register(tab: TabComponent): void;

  // 注销组件
  unregister(id: string): void;

  // 获取组件
  get(id: string): TabComponent | undefined;

  // 获取所有已注册的组件
  getAll(): TabComponent[];

  // 获取所有启用的组件
  getEnabled(): TabComponent[];

  // 启用组件
  enable(id: string): void;

  // 禁用组件
  disable(id: string): void;

  // 检查组件是否启用
  isEnabled(id: string): boolean;

  // 添加事件监听器
  addEventListener(listener: TabRegistryEventListener): () => void;

  // 移除事件监听器
  removeEventListener(listener: TabRegistryEventListener): void;
}
```
