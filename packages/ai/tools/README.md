# AI 工具集合

本目录包含 legacy 兼容层仍在复用的工具定义。

## 📁 目录结构

```
tools/
├── index.ts                    # 工具集中管理和导出
├── translation-tool.ts         # 字幕翻译工具（需要 toolContext）
├── summary-tool.ts             # 内容总结工具（需要 toolContext）
├── resource-query-tool.ts      # 资源查询工具（需要 toolContext）
├── push-card-tool.ts           # 推送卡片工具
├── read-subtitle-tool.ts       # 读取字幕工具
├── youtube-download-tool.ts    # YouTube 下载工具
└── youtube-subscribe-tool.ts   # YouTube 订阅工具
```

## 🛠️ 工具分类

### AI 工具（需要显式绑定）

这些工具依赖外部服务，使用时需要在创建工具时显式绑定依赖或 runtime：

| 工具                | ID                    | 功能           | 依赖                       | 文件                     |
| ------------------- | --------------------- | -------------- | -------------------------- | ------------------------ |
| `translationTool`   | `translate-subtitles` | 字幕翻译       | providerId, model, preset  | `translation-tool.ts`    |
| `summaryTool`       | `summarize-content`   | 内容总结       | providerId, model, preset  | `summary-tool.ts`        |
| `resourceQueryTool` | `query-resources`     | 资源智能查询   | ResourcesRepo              | `resource-query-tool.ts` |
| `pushCardTool`      | `push-card`           | 推送资源卡片   | conversationId / windowId  | `push-card-tool.ts`      |
| `readSubtitleTool`  | `read-subtitle`       | 读取字幕内容   | ResourcesRepo              | `read-subtitle-tool.ts`  |

### YouTube 工具

| 工具                  | ID                  | 功能              | 文件                      |
| --------------------- | ------------------- | ----------------- | ------------------------- |
| `youtubeDownloadTool` | `youtube-download`  | 下载 YouTube 视频 | `youtube-download-tool.ts`|
| `youtubeSubscribeTool`| `youtube-subscribe` | 订阅 YouTube 频道 | `youtube-subscribe-tool.ts`|

## 🚀 快速开始

### 1. 导入工具

```typescript
import { createTranslationTool, createSummaryTool, createPushCardTool, resourceQueryTool } from '@/packages/ai/tools';
```

### 2. 使用 AI 工具（方式一：直接调用）

```typescript
import { createResourceQueryTool } from '@/packages/ai/tools';
import { ResourcesRepo } from '@/electron/main/db';

const resourceQueryTool = createResourceQueryTool(ResourcesRepo);

// 直接调用工具
const result = await resourceQueryTool.execute({
  context: {
    type: 'video',
    timeRange: 'today'
  }
});

console.log(`找到 ${result.total} 个资源`);
```

### 3. 使用 AI 工具（方式二：兼容执行器自动调用）

```typescript
import { createResourceQueryTool } from '@/packages/ai/tools';
import { ResourcesRepo } from '@/electron/main/db';

const resourceQueryTool = createResourceQueryTool(ResourcesRepo);

const result = await resourceQueryTool.execute({
  context: {
    type: 'video',
    timeRange: 'today'
  }
});
```

## 📖 详细文档

### 翻译工具

```typescript
import { createTranslationTool } from '@/packages/ai/tools';

const translationTool = createTranslationTool({
  runtime: {
    providerId: 'openai',
    providerPresetId: 'preset-1',
    model: 'gpt-4o-mini'
  }
});

const result = await translationTool.execute({
  context: {
    resourceId: 'subtitle-resource-id',
    targetLanguage: 'zh-CN',
    sourceLanguage: 'en'
  }
});
```

### 总结工具

```typescript
import { createSummaryTool } from '@/packages/ai/tools';

const summaryTool = createSummaryTool({
  runtime: {
    providerId: 'openai',
    providerPresetId: 'preset-1',
    model: 'gpt-4o-mini'
  }
});

const result = await summaryTool.execute({
  context: {
    content: '长文本内容...',
    targetLanguage: 'zh-CN'
  }
});
```

### 资源查询工具

```typescript
import { createResourceQueryTool } from '@/packages/ai/tools';
import { ResourcesRepo } from '@/electron/main/db';

const resourceQueryTool = createResourceQueryTool(ResourcesRepo);

// 查询今天的视频
const result = await resourceQueryTool.execute({
  context: {
    type: 'video',
    timeRange: 'today'
  }
});

// 查询最新的 SRT 字幕
const result = await resourceQueryTool.execute({
  context: {
    type: 'subtitle',
    searchText: '.srt',
    sortBy: 'newest',
    limit: 1
  }
});
```

## 🔧 工具管理 API

### `getAllTools(bindings?)`

获取所有工具

```typescript
import { getAllTools } from '@/packages/ai/tools';

const tools = getAllTools({
  translationRuntime: { providerId: 'openai', model: 'gpt-4o-mini' },
  summaryRuntime: { providerId: 'openai', model: 'gpt-4o-mini' },
  pushCard: { conversationId: 'conv-123', targetWindowId: 1 }
});
// => { translationTool, summaryTool, resourceQueryTool, pushCardTool, youtubeDownloadTool, youtubeSubscribeTool }
```

### `getAITools(bindings?)`

仅获取 AI 工具（需要显式绑定）

```typescript
import { getAITools } from '@/packages/ai/tools';

const tools = getAITools({
  translationRuntime: { providerId: 'openai', model: 'gpt-4o-mini' },
  summaryRuntime: { providerId: 'openai', model: 'gpt-4o-mini' },
  pushCard: { conversationId: 'conv-123', targetWindowId: 1 }
});
// => { translationTool, summaryTool, resourceQueryTool, pushCardTool }
```

### `getTool(name: string)`

根据名称获取工具

```typescript
import { getTool } from '@/packages/ai/tools';

const tool = getTool('resourceQueryTool');
// => resourceQueryTool 实例
```

### `getToolById(id: string)`

根据工具 ID 获取工具

```typescript
import { getToolById } from '@/packages/ai/tools';

const tool = getToolById('query-resources');
// => resourceQueryTool 实例
```

## 📝 创建新工具

### 1. 创建工具文件

```typescript
// tools/my-tool.ts
import { createTool } from './tool-definition';
import { z } from 'zod';

export const myTool = createTool({
  id: 'my-tool',
  description: '工具描述',
  inputSchema: z.object({
    param1: z.string().describe('参数1描述'),
    param2: z.number().optional().describe('参数2描述')
  }),
  outputSchema: z.object({
    result: z.string()
  }),
  execute: async ({ context }) => {
    // 从 context 获取输入参数
    const { param1, param2 } = context;

    // 执行工具逻辑
    const result = `处理结果: ${param1}`;

    return { result };
  }
});
```

### 2. 在 index.ts 中注册

```typescript
// tools/index.ts

// 1. 添加导出
export { myTool } from './my-tool';

// 2. 添加导入
import { myTool } from './my-tool';

// 3. 添加到工具集合
export const allTools = {
  // ...其他工具
  myTool
};

// 4. 更新类型定义
export type ToolId = 'translate-subtitles' | 'summarize-content' | 'query-resources' | 'my-tool'; // 添加新工具 ID
```

## 🎯 最佳实践

### 1. 工具命名

- **文件名**：使用 `kebab-case`，如 `resource-query-tool.ts`
- **变量名**：使用 `camelCase`，如 `resourceQueryTool`
- **工具 ID**：使用 `kebab-case`，如 `query-resources`

### 2. Schema 定义

- 使用 Zod 定义清晰的输入输出 schema
- 为每个字段添加 `.describe()` 说明，Agent 会使用这些描述理解参数含义
- 使用 `.optional()` 标记可选参数

### 3. 错误处理

```typescript
execute: async ({ context }) => {
  try {
    // 验证输入
    if (!context.param) {
      throw new Error('缺少必需参数');
    }

    // 执行逻辑
    const result = await doSomething(context.param);

    // 返回结果
    return { success: true, result };
  } catch (error) {
    // 返回错误信息
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};
```

### 4. 依赖注入

对于需要外部依赖的工具：

```typescript
// 1. 定义 ToolContext 接口
export interface MyToolContext {
  someService: SomeService;
  anotherDep: AnotherDep;
}

// 2. 在 execute 中使用
execute: async ({ context, toolContext }) => {
  const { someService, anotherDep } = toolContext as MyToolContext;

  if (!someService) {
    throw new Error('缺少 someService 依赖');
  }

  // 使用依赖
  const result = await someService.doSomething(context.param);
  return result;
};
```

## 📚 相关文档

- [工具使用完整指南](./docs/tools-usage-guide.md) - 6000+ 字详细文档
- [工具实现总结](./docs/tools-implementation-summary.md) - 架构设计说明
- [资源查询工具指南](./docs/resource-query-tool-guide.md) - 资源查询详细文档
- [资源查询快速参考](./docs/resource-query-quick-reference.md) - 资源查询速查表
- [Mastra 迁移指南](./docs/migration-to-mastra.md) - 从旧 API 迁移到 Mastra

## 🤝 贡献

欢迎添加新工具！请遵循以下步骤：

1. 在 `tools/` 目录创建新工具文件
2. 在 `tools/index.ts` 中注册工具
3. 编写单元测试（如有）
4. 更新本 README
5. 如有需要，创建详细文档

## 📄 License

MIT
