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

## 远程组件开发

### 概述

远程组件是可以从外部 URL 动态加载的 Tab 组件。这些组件在运行时加载，允许你独立开发和部署 Tab 功能，而无需修改主应用代码。

### Context 接口说明

远程组件需要通过 `useResourceTabContext()` Hook 访问 Context。Context 提供以下数据：

```typescript
interface ResourceTabContextValue {
  /** 当前预览的资源 */
  resource: ResourceItem;
  /** 当前播放时间（用于字幕同步） */
  currentTime: number;
  /** 媒体播放器引用（用于字幕跳转） */
  mediaPlayerRef: React.RefObject<MediaPlayerRef>;
  /** 字幕列表（用于视频资源） */
  subtitleList: ResourceItem[];
  /** 当前激活的字幕 */
  activeSubtitle: ResourceItem | null;
  /** 设置激活的字幕 */
  setActiveSubtitle: (subtitle: ResourceItem | null) => void;
  /** 资源切换回调 */
  onResourceChange?: (resource: ResourceItem) => void;
}
```

### 远程组件开发步骤

#### 1. 创建远程组件项目

创建一个独立的 React 项目，用于开发远程 Tab 组件：

```bash
# 使用 Vite 创建项目
npm create vite@latest my-remote-tab -- --template react-ts
cd my-remote-tab
npm install
```

#### 2. 安装必要的依赖

远程组件需要能够访问 Context，但不需要在主应用中安装。你需要：

- 确保 React 版本兼容（建议使用与主应用相同的 React 版本）
- 如果需要使用 UI 组件，可以使用独立的 UI 库或复制必要的组件

#### 3. 定义 Context 类型

在你的远程组件项目中，创建类型定义文件：

```typescript
// types/ResourceTabContext.ts
import type React from 'react';

// 定义 ResourceItem 类型（需要与主应用保持一致）
export interface ResourceItem {
  id: string;
  title?: string;
  filePath?: string;
  url?: string;
  type?: string;
  // ... 其他字段
}

// 定义 MediaPlayerRef 接口（如果需要使用）
export interface MediaPlayerRef {
  seekTo: (time: number) => void;
  pause: () => void;
  getCurrentTime: () => number;
  // ... 其他方法
}

// 定义 Context 值类型
export interface ResourceTabContextValue {
  resource: ResourceItem;
  currentTime: number;
  mediaPlayerRef: React.RefObject<MediaPlayerRef>;
  subtitleList: ResourceItem[];
  activeSubtitle: ResourceItem | null;
  setActiveSubtitle: (subtitle: ResourceItem | null) => void;
  onResourceChange?: (resource: ResourceItem) => void;
}
```

#### 4. 创建 Context Hook

由于远程组件无法直接导入主应用的 Context，你需要创建一个兼容的 Hook：

```typescript
// hooks/useResourceTabContext.ts
import { useContext, createContext } from 'react';
import type { ResourceTabContextValue } from '../types/ResourceTabContext';

// 创建 Context（名称必须与主应用中的 Context 名称匹配）
// 注意：这需要与主应用中的 Context 是同一个实例
// 在实际使用中，主应用会通过 Provider 提供这个 Context
const ResourceTabContext = createContext<ResourceTabContextValue | null>(null);

export const useResourceTabContext = (): ResourceTabContextValue => {
  const context = useContext(ResourceTabContext);
  if (!context) {
    throw new Error('useResourceTabContext must be used within ResourceTabContextProvider');
  }
  return context;
};
```

**重要说明**：在实际部署时，远程组件会运行在主应用的 React 上下文中，因此可以直接使用主应用提供的 Context。上面的代码仅用于开发时的类型检查。

#### 5. 开发远程组件

创建你的 Tab 组件：

```typescript
// RemoteTabComponent.tsx
import React, { useEffect, useState } from 'react';

// 注意：在生产环境中，这个 Hook 会从主应用注入
// 这里我们假设它会被正确提供
declare const useResourceTabContext: () => {
  resource: any;
  currentTime: number;
  mediaPlayerRef: React.RefObject<any>;
  subtitleList: any[];
  activeSubtitle: any | null;
  setActiveSubtitle: (subtitle: any | null) => void;
  onResourceChange?: (resource: any) => void;
};

const RemoteTabComponent: React.FC = () => {
  // 使用 Context 获取数据
  const { resource, currentTime, subtitleList, setActiveSubtitle } = useResourceTabContext();

  const [data, setData] = useState<any>(null);

  // 使用 resource 数据
  useEffect(() => {
    // 处理资源数据
    console.log('当前资源:', resource);
    console.log('播放时间:', currentTime);
  }, [resource, currentTime]);

  return (
    <div className="h-full p-4 overflow-auto">
      <h2 className="text-lg font-semibold mb-4">远程 Tab 组件</h2>

      <div className="space-y-2">
        <div>
          <span className="font-medium">资源标题:</span> {resource?.title || '无标题'}
        </div>

        <div>
          <span className="font-medium">文件路径:</span> {resource?.filePath || '无路径'}
        </div>

        <div>
          <span className="font-medium">当前播放时间:</span> {currentTime.toFixed(2)}s
        </div>

        {subtitleList.length > 0 && (
          <div>
            <span className="font-medium">字幕数量:</span> {subtitleList.length}
            <select
              className="ml-2 border rounded px-2 py-1"
              onChange={(e) => {
                const selected = subtitleList.find(s => s.id === e.target.value);
                setActiveSubtitle(selected || null);
              }}
            >
              <option value="">选择字幕</option>
              {subtitleList.map(sub => (
                <option key={sub.id} value={sub.id}>
                  {sub.title || sub.filePath}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
};

export default RemoteTabComponent;
```

#### 6. 导出组件

确保组件作为默认导出：

```typescript
// index.ts
export { default } from './RemoteTabComponent';
```

#### 7. 配置打包

配置你的构建工具（如 Vite、Webpack）以生成可被动态导入的模块：

**Vite 配置示例 (vite.config.ts):**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: './src/index.ts',
      name: 'RemoteTab',
      fileName: 'remote-tab',
      formats: ['es']
    },
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM'
        }
      }
    }
  }
});
```

**Webpack 配置示例:**

```javascript
module.exports = {
  mode: 'production',
  entry: './src/index.ts',
  output: {
    library: {
      type: 'module'
    },
    filename: 'remote-tab.js'
  },
  externals: {
    react: 'React',
    'react-dom': 'ReactDOM'
  }
};
```

#### 8. 部署组件

将打包后的组件文件部署到可访问的 URL：

```bash
# 构建组件
npm run build

# 部署到 CDN 或静态服务器
# 例如：https://cdn.example.com/tabs/remote-tab.js
```

#### 9. 在主应用中注册

在主应用中使用 `registerTabFromUrl` 注册远程组件：

```typescript
import { registerTabFromUrl } from '@/pages/ResourcePage/components/tabs';

// 注册远程组件
await registerTabFromUrl('remoteTab', '远程 Tab', 'https://cdn.example.com/tabs/remote-tab.js');
```

### 远程组件使用 Context 的完整示例

```typescript
// 完整的远程组件示例
import React, { useEffect, useState, useCallback } from 'react';

// 在实际运行时，这个 Hook 会由主应用提供
// 开发时可以使用类型声明
const RemoteTabComponent: React.FC = () => {
  const {
    resource,           // 当前资源
    currentTime,       // 播放时间
    mediaPlayerRef,    // 播放器引用
    subtitleList,      // 字幕列表
    activeSubtitle,    // 当前字幕
    setActiveSubtitle, // 设置字幕
    onResourceChange    // 资源切换回调
  } = useResourceTabContext();

  // 使用 resource 数据
  const title = resource?.title || resource?.filePath || '未知资源';

  // 使用 currentTime 同步显示
  const [displayTime, setDisplayTime] = useState(currentTime);

  useEffect(() => {
    setDisplayTime(currentTime);
  }, [currentTime]);

  // 使用 mediaPlayerRef 控制播放
  const handleSeek = useCallback((time: number) => {
    if (mediaPlayerRef?.current) {
      mediaPlayerRef.current.seekTo(time);
    }
  }, [mediaPlayerRef]);

  // 使用 subtitleList 和 setActiveSubtitle
  const handleSubtitleChange = useCallback((subtitleId: string) => {
    const subtitle = subtitleList.find(s => s.id === subtitleId);
    setActiveSubtitle(subtitle || null);
  }, [subtitleList, setActiveSubtitle]);

  // 使用 onResourceChange 切换资源
  const handleResourceSwitch = useCallback(() => {
    if (onResourceChange && resource) {
      // 切换到下一个资源（示例）
      onResourceChange(resource);
    }
  }, [onResourceChange, resource]);

  return (
    <div className="h-full p-4 flex flex-col">
      <h2 className="text-xl font-bold mb-4">{title}</h2>

      <div className="space-y-4 flex-1">
        {/* 显示播放时间 */}
        <div>
          <label className="block text-sm font-medium mb-2">播放时间</label>
          <div className="text-2xl">{displayTime.toFixed(2)}s</div>
          <button
            onClick={() => handleSeek(100)}
            className="mt-2 px-4 py-2 bg-blue-500 text-white rounded"
          >
            跳转到 100s
          </button>
        </div>

        {/* 字幕选择 */}
        {subtitleList.length > 0 && (
          <div>
            <label className="block text-sm font-medium mb-2">选择字幕</label>
            <select
              value={activeSubtitle?.id || ''}
              onChange={(e) => handleSubtitleChange(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">无字幕</option>
              {subtitleList.map(sub => (
                <option key={sub.id} value={sub.id}>
                  {sub.title || sub.filePath}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 资源切换 */}
        {onResourceChange && (
          <button
            onClick={handleResourceSwitch}
            className="px-4 py-2 bg-green-500 text-white rounded"
          >
            切换资源
          </button>
        )}
      </div>
    </div>
  );
};

export default RemoteTabComponent;
```

### 远程组件开发最佳实践

1. **类型安全**
   - 在主应用中导出类型定义，远程组件可以引用
   - 或者创建共享的类型定义包

2. **依赖管理**
   - 将 React、ReactDOM 标记为外部依赖，避免重复打包
   - 使用与主应用兼容的 React 版本

3. **样式处理**
   - 使用 Tailwind CSS 类名（如果主应用使用）
   - 或者使用 CSS Modules、styled-components 等
   - 避免全局样式冲突

4. **错误处理**
   - 添加错误边界处理
   - 处理 Context 未提供的情况

5. **性能优化**
   - 使用 React.memo 优化组件渲染
   - 合理使用 useMemo 和 useCallback

6. **测试**
   - 创建模拟的 Context 值进行本地测试
   - 测试组件在不同资源类型下的表现

### 远程组件开发注意事项

1. **Context 访问**
   - 远程组件运行在主应用的 React 树中，可以直接使用主应用提供的 Context
   - 确保组件在 `ResourceTabContextProvider` 内部渲染

2. **版本兼容性**
   - 确保 React 版本与主应用兼容
   - 注意 React Hooks 的使用方式

3. **打包格式**
   - 使用 ES Module 格式（`format: 'es'`）
   - 确保支持动态 import

4. **安全性**
   - 验证远程组件的来源
   - 使用 HTTPS 加载远程组件
   - 考虑内容安全策略（CSP）

5. **调试**
   - 在开发环境中使用 source map
   - 添加适当的日志输出
   - 使用 React DevTools 调试

## 注意事项

1. Tab ID 必须是 `TabType` 类型之一：`'content' | 'subtitle' | 'translate' | 'summary' | 'list'`
2. 所有 Tab 组件应该使用 `useResourceTabContext()` 获取数据，而不是通过 props
3. Tab 组件应该处理自己的布局和样式，容器会提供 `h-full` 类
4. 动态加载的组件需要确保兼容当前的 React 版本和依赖
5. 远程组件必须作为 ES Module 导出，并且 React/ReactDOM 应该标记为外部依赖
6. 远程组件在运行时可以访问主应用提供的 Context，无需单独创建 Context 实例
