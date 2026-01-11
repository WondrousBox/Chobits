# 远程组件使用 Context 详细说明

## Context 访问机制

远程组件在运行时会被加载到主应用的 React 组件树中，位于 `ResourceTabContextProvider` 内部。主应用会自动将 Context 暴露到全局对象，远程组件可以通过导入工具包来使用 Hook。

## 优雅的使用方式

### 导入工具包

远程组件只需要导入工具包文件，就可以像使用普通 React Hook 一样使用 `useResourceTabContext`：

```typescript
// ⚠️ 重要：远程组件必须直接从 remote-hooks.ts 文件导入，不要从 index.ts 导入
// 从主应用的工具包导入（需要配置路径别名或直接路径）
import { useResourceTabContext } from '@/pages/ResourcePage/components/tabs/remote-hooks';
// 或者从打包后的工具包导入
import { useResourceTabContext } from 'path/to/remote-hooks';

const MyRemoteTab: React.FC = () => {
  // 直接使用，就像普通的 React Hook 一样！
  const { resource, currentTime } = useResourceTabContext();

  return (
    <div>
      <h2>{resource.title}</h2>
      <p>播放时间: {currentTime}s</p>
    </div>
  );
};
```

**注意**：

- ✅ 远程组件应该从 `remote-hooks.ts` 文件直接导入
- ❌ 不要从 `index.ts` 导入，因为那里导出的是本地组件使用的 Hook

### 工作原理

1. **主应用自动暴露 Context**：当 `ResourceTabContextProvider` 挂载时，会自动将 Context 暴露到 `window.__RESOURCE_TAB_CONTEXT__`
2. **工具包自动获取**：远程组件工具包会自动从全局对象获取 Context
3. **使用标准 React Hook**：工具包提供的 `useResourceTabContext` 使用标准的 `React.useContext`，完全符合 React 规范

### 类型支持

工具包包含了完整的 TypeScript 类型定义，你可以获得完整的类型提示和自动补全：

```typescript
import { useResourceTabContext, type ResourceTabContextValue, type ResourceItem, type MediaPlayerRef } from '@/pages/ResourcePage/components/tabs/remote-hooks';

const MyTab: React.FC = () => {
  const context: ResourceTabContextValue = useResourceTabContext();
  // 完整的类型支持！
};
```

## Context 各字段详细说明

### 1. resource - 当前资源对象

```typescript
const { resource } = useResourceTabContext();

// 常用属性
const title = resource.title || resource.filePath || '未知资源';
const filePath = resource.filePath; // 文件路径
const resourceId = resource.id; // 资源 ID
const resourceType = resource.type; // 资源类型：'video' | 'audio' | 'image' | 'document' 等
```

**使用示例**：

```typescript
const RemoteTab: React.FC = () => {
  const { resource } = useResourceTabContext();

  return (
    <div>
      <h2>{resource.title || '无标题'}</h2>
      <p>类型: {resource.type}</p>
      {resource.filePath && <p>路径: {resource.filePath}</p>}
    </div>
  );
};
```

### 2. currentTime - 当前播放时间

```typescript
const { currentTime } = useResourceTabContext();

// currentTime 是数字类型，单位：秒
// 会随着媒体播放自动更新
const minutes = Math.floor(currentTime / 60);
const seconds = Math.floor(currentTime % 60);
```

**使用示例**：

```typescript
const RemoteTab: React.FC = () => {
  const { currentTime } = useResourceTabContext();
  const [displayTime, setDisplayTime] = useState(currentTime);

  useEffect(() => {
    setDisplayTime(currentTime);
  }, [currentTime]);

  return (
    <div>
      <p>播放时间: {displayTime.toFixed(2)}s</p>
      <p>格式化: {Math.floor(currentTime / 60)}:{(currentTime % 60).toFixed(0).padStart(2, '0')}</p>
    </div>
  );
};
```

### 3. mediaPlayerRef - 媒体播放器引用

```typescript
const { mediaPlayerRef } = useResourceTabContext();

// 控制播放器跳转
const handleSeek = (time: number) => {
  if (mediaPlayerRef?.current) {
    mediaPlayerRef.current.seekTo(time);
  }
};

// 暂停播放
const handlePause = () => {
  if (mediaPlayerRef?.current) {
    mediaPlayerRef.current.pause();
  }
};

// 获取当前播放时间
const getCurrentTime = () => {
  return mediaPlayerRef?.current?.getCurrentTime() || 0;
};
```

**使用示例**：

```typescript
const RemoteTab: React.FC = () => {
  const { mediaPlayerRef, currentTime } = useResourceTabContext();

  const handleJumpTo = (seconds: number) => {
    if (mediaPlayerRef?.current) {
      mediaPlayerRef.current.seekTo(seconds);
    }
  };

  return (
    <div>
      <p>当前时间: {currentTime.toFixed(2)}s</p>
      <button onClick={() => handleJumpTo(100)}>跳转到 100s</button>
      <button onClick={() => handleJumpTo(0)}>回到开头</button>
    </div>
  );
};
```

### 4. subtitleList - 字幕列表

```typescript
const { subtitleList } = useResourceTabContext();

// subtitleList 是 ResourceItem[] 数组
// 每个元素包含字幕文件的信息
subtitleList.forEach((subtitle) => {
  console.log(subtitle.id, subtitle.title, subtitle.filePath);
});
```

**使用示例**：

```typescript
const RemoteTab: React.FC = () => {
  const { subtitleList } = useResourceTabContext();

  return (
    <div>
      <h3>可用字幕 ({subtitleList.length})</h3>
      <ul>
        {subtitleList.map(sub => (
          <li key={sub.id}>
            {sub.title || sub.filePath || sub.id}
          </li>
        ))}
      </ul>
    </div>
  );
};
```

### 5. activeSubtitle - 当前激活的字幕

```typescript
const { activeSubtitle } = useResourceTabContext();

// activeSubtitle 可能是 ResourceItem 或 null
if (activeSubtitle) {
  console.log('当前字幕:', activeSubtitle.title);
} else {
  console.log('未选择字幕');
}
```

**使用示例**：

```typescript
const RemoteTab: React.FC = () => {
  const { activeSubtitle } = useResourceTabContext();

  return (
    <div>
      {activeSubtitle ? (
        <p>当前字幕: {activeSubtitle.title || activeSubtitle.filePath}</p>
      ) : (
        <p>未选择字幕</p>
      )}
    </div>
  );
};
```

### 6. setActiveSubtitle - 设置激活字幕

```typescript
const { subtitleList, setActiveSubtitle } = useResourceTabContext();

// 设置激活的字幕
const handleSelectSubtitle = (subtitleId: string) => {
  const subtitle = subtitleList.find((s) => s.id === subtitleId);
  setActiveSubtitle(subtitle || null);
};

// 清除字幕选择
const handleClearSubtitle = () => {
  setActiveSubtitle(null);
};
```

**使用示例**：

```typescript
const RemoteTab: React.FC = () => {
  const { subtitleList, activeSubtitle, setActiveSubtitle } = useResourceTabContext();

  return (
    <div>
      <select
        value={activeSubtitle?.id || ''}
        onChange={(e) => {
          const selected = subtitleList.find(s => s.id === e.target.value);
          setActiveSubtitle(selected || null);
        }}
      >
        <option value="">无字幕</option>
        {subtitleList.map(sub => (
          <option key={sub.id} value={sub.id}>
            {sub.title || sub.filePath}
          </option>
        ))}
      </select>
    </div>
  );
};
```

### 7. onResourceChange - 资源切换回调

```typescript
const { onResourceChange, resource } = useResourceTabContext();

// 切换到新资源
const handleSwitchResource = (newResource: ResourceItem) => {
  if (onResourceChange) {
    onResourceChange(newResource);
  }
};
```

**使用示例**：

```typescript
const RemoteTab: React.FC = () => {
  const { onResourceChange, resource } = useResourceTabContext();

  const handleNext = () => {
    // 假设有下一个资源的逻辑
    if (onResourceChange) {
      // 切换到新资源
      onResourceChange(newResource);
    }
  };

  return (
    <div>
      <p>当前资源: {resource.title}</p>
      {onResourceChange && (
        <button onClick={handleNext}>下一个资源</button>
      )}
    </div>
  );
};
```

## 完整示例：使用所有 Context 字段

```typescript
import React, { useEffect, useState, useCallback } from 'react';
// 从 remote-hooks.ts 直接导入（不要从 index.ts 导入）
import { useResourceTabContext } from '@/pages/ResourcePage/components/tabs/remote-hooks';

const RemoteTabComponent: React.FC = () => {
  // 获取所有 Context 数据 - 就是这么简单！
  const {
    resource,
    currentTime,
    mediaPlayerRef,
    subtitleList,
    activeSubtitle,
    setActiveSubtitle,
    onResourceChange
  } = useResourceTabContext();

  // 使用 resource
  const title = resource?.title || resource?.filePath || '未知资源';

  // 使用 currentTime
  const [displayTime, setDisplayTime] = useState(currentTime);
  useEffect(() => {
    setDisplayTime(currentTime);
  }, [currentTime]);

  // 使用 mediaPlayerRef
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

  // 使用 onResourceChange
  const handleResourceSwitch = useCallback(() => {
    if (onResourceChange && resource) {
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

## 开发远程组件时的配置

### 1. 复制工具包文件

将 `remote-hooks.ts` 文件复制到你的远程组件项目中，或者配置路径别名指向主应用的工具包。

### 2. 配置 TypeScript

确保你的 `tsconfig.json` 包含必要的配置：

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

### 3. 打包配置

确保 React 和 ReactDOM 标记为外部依赖：

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['react', 'react-dom']
    }
  }
});
```

## 注意事项

1. **Context 可用性**：远程组件必须运行在 `ResourceTabContextProvider` 内部，否则会抛出错误
2. **类型安全**：工具包提供了完整的 TypeScript 类型定义，确保类型安全
3. **性能考虑**：Context 值变化会触发组件重新渲染，合理使用 `useMemo` 和 `useCallback`
4. **空值检查**：某些字段可能是 `null` 或 `undefined`，使用前要进行检查
5. **异步更新**：`currentTime` 会频繁更新，避免在每次更新时执行重计算
6. **React 版本**：确保远程组件使用的 React 版本与主应用兼容

## 总结

使用工具包的方式非常优雅和简单：

1. ✅ **只需导入一个文件**：`import { useResourceTabContext } from 'path/to/remote-hooks'`
2. ✅ **像普通 Hook 一样使用**：完全符合 React Hook 的使用规范
3. ✅ **完整的类型支持**：TypeScript 类型定义完整，IDE 自动补全
4. ✅ **无需配置**：主应用自动处理 Context 暴露，远程组件无需关心实现细节
5. ✅ **清晰的错误提示**：如果使用不当，会有清晰的错误信息

这就是最优雅的解决方案！🎉
