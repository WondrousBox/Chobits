# AI 工具集合

本目录包含所有可供 Mastra Agent 使用的工具定义。

## 📁 目录结构

```
tools/
├── index.ts                    # 工具集中管理和导出
├── calculator-tool.ts          # 计算器工具
├── time-tool.ts               # 时间查询工具
├── weather-tool.ts            # 天气查询工具
├── translation-tool.ts        # 字幕翻译工具（需要 toolContext）
├── summary-tool.ts            # 内容总结工具（需要 toolContext）
└── resource-query-tool.ts     # 资源查询工具（需要 toolContext）
```

## 🛠️ 工具分类

### 通用工具（无需外部依赖）

这些工具可以直接传给 Agent 使用，无需 toolContext：

| 工具             | ID            | 功能         | 文件                 |
| ---------------- | ------------- | ------------ | -------------------- |
| `weatherTool`    | `get-weather` | 查询城市天气 | `weather-tool.ts`    |
| `timeTool`       | `get-time`    | 获取当前时间 | `time-tool.ts`       |
| `calculatorTool` | `calculator`  | 数学计算     | `calculator-tool.ts` |

### AI 工具（需要 toolContext）

这些工具依赖外部服务，使用时需要通过 toolContext 传入依赖：

| 工具                | ID                    | 功能         | 依赖                       | 文件                     |
| ------------------- | --------------------- | ------------ | -------------------------- | ------------------------ |
| `translationTool`   | `translate-subtitles` | 字幕翻译     | TranslationService, chatFn | `translation-tool.ts`    |
| `summaryTool`       | `summarize-content`   | 内容总结     | SummaryService, chatFn     | `summary-tool.ts`        |
| `resourceQueryTool` | `query-resources`     | 资源智能查询 | ResourcesRepo              | `resource-query-tool.ts` |

## 🚀 快速开始

### 1. 导入工具

```typescript
// 导入所有工具
import { getAllTools, getBasicTools, getAITools } from '@/packages/ai/tools';

// 或导入单个工具
import { weatherTool, translationTool, resourceQueryTool } from '@/packages/ai/tools';
```

### 2. 使用通用工具

```typescript
import { Agent } from '@mastra/core';
import { getBasicTools } from '@/packages/ai/tools';

// 创建 Agent 并传入工具
const agent = new Agent({
  name: 'helper',
  instructions: '你是一个有用的助手',
  model: { provider: 'OPEN_AI', name: 'gpt-4', toolChoice: 'auto' },
  tools: getBasicTools()
});

// Agent 会自动决定何时使用工具
const result = await agent.stream([{ role: 'user', content: '北京今天天气怎么样？' }]);
```

### 3. 使用 AI 工具（方式一：直接调用）

```typescript
import { resourceQueryTool } from '@/packages/ai/tools';
import { ResourcesRepo } from '@/electron/main/db';

// 直接调用工具
const result = await resourceQueryTool.execute({
  context: {
    type: 'video',
    timeRange: 'today'
  },
  toolContext: {
    resourcesRepo: ResourcesRepo
  }
});

console.log(`找到 ${result.total} 个资源`);
```

### 4. 使用 AI 工具（方式二：Agent 自动调用）

```typescript
import { Agent } from '@mastra/core';
import { resourceQueryTool } from '@/packages/ai/tools';
import { ResourcesRepo } from '@/electron/main/db';

const agent = new Agent({
  name: 'resource-helper',
  instructions: '你可以帮助用户查询资源',
  model: { provider: 'OPEN_AI', name: 'gpt-4', toolChoice: 'auto' },
  tools: { resourceQueryTool }
});

// Agent 会解析用户意图并调用工具
const result = await agent.stream([{ role: 'user', content: '找今天的视频文件' }], {
  toolContext: {
    resourcesRepo: ResourcesRepo
  }
});
```

## 📖 详细文档

### 天气工具

```typescript
import { weatherTool } from '@/packages/ai/tools';

const result = await weatherTool.execute({
  context: {
    city: '北京',
    unit: 'celsius' // 可选：'celsius' 或 'fahrenheit'
  }
});
// => { city: '北京', temperature: 15, unit: 'celsius', description: '晴朗' }
```

### 时间工具

```typescript
import { timeTool } from '@/packages/ai/tools';

// 可读格式
const result = await timeTool.execute({
  context: { format: 'readable' }
});
// => { time: '2024/1/17 18:30:00' }

// 其他格式：'iso', 'unix', 'date', 'time'
```

### 计算器工具

```typescript
import { calculatorTool } from '@/packages/ai/tools';

const result = await calculatorTool.execute({
  context: { expression: '(10 + 5) * 2 - 8 / 4' }
});
// => { result: 28, expression: '(10 + 5) * 2 - 8 / 4' }
```

### 翻译工具

```typescript
import { translationTool } from '@/packages/ai/tools';
import { TranslationService } from '@/packages/ai';
import { ChatService } from '@/packages/ai';

const result = await translationTool.execute({
  context: {
    segments: [{ id: '1', text: 'Hello world', start: 0, end: 2000 }],
    targetLanguage: 'zh-CN',
    sourceLanguage: 'en'
  },
  toolContext: {
    translationService: TranslationService,
    chatFn: ChatService.chatStream,
    requestId: 'req-123',
    conversationId: 'conv-456',
    conversationRepo: ConversationRepo,
    messagesRepo: MessagesRepo
  }
});
```

> 详细文档：`docs/tools-usage-guide.md`

### 总结工具

```typescript
import { summaryTool } from '@/packages/ai/tools';

const result = await summaryTool.execute({
  context: {
    content: '长文本内容...',
    targetLanguage: 'zh-CN'
  },
  toolContext: {
    summaryService: SummaryService,
    chatFn: ChatService.chatStream,
    requestId: 'req-123',
    conversationId: 'conv-456',
    conversationRepo: ConversationRepo,
    messagesRepo: MessagesRepo
  }
});
```

> 详细文档：`docs/tools-usage-guide.md`

### 资源查询工具

```typescript
import { resourceQueryTool } from '@/packages/ai/tools';
import { ResourcesRepo } from '@/electron/main/db';

// 查询今天的视频
const result = await resourceQueryTool.execute({
  context: {
    type: 'video',
    timeRange: 'today'
  },
  toolContext: {
    resourcesRepo: ResourcesRepo
  }
});

// 查询最新的 SRT 字幕
const result = await resourceQueryTool.execute({
  context: {
    type: 'subtitle',
    searchText: '.srt',
    sortBy: 'newest',
    limit: 1
  },
  toolContext: {
    resourcesRepo: ResourcesRepo
  }
});
```

> 详细文档：`docs/resource-query-tool-guide.md`  
> 快速参考：`docs/resource-query-quick-reference.md`

## 🔧 工具管理 API

### `getAllTools()`

获取所有工具（包括通用工具和 AI 工具）

```typescript
import { getAllTools } from '@/packages/ai/tools';

const tools = getAllTools();
// => { weatherTool, timeTool, calculatorTool, translationTool, summaryTool, resourceQueryTool }
```

### `getBasicTools()`

仅获取通用工具（无需 toolContext）

```typescript
import { getBasicTools } from '@/packages/ai/tools';

const tools = getBasicTools();
// => { weatherTool, timeTool, calculatorTool }
```

### `getAITools()`

仅获取 AI 工具（需要 toolContext）

```typescript
import { getAITools } from '@/packages/ai/tools';

const tools = getAITools();
// => { translationTool, summaryTool, resourceQueryTool }
```

### `getTool(name: string)`

根据名称获取工具

```typescript
import { getTool } from '@/packages/ai/tools';

const tool = getTool('weatherTool');
// => weatherTool 实例
```

### `getToolById(id: string)`

根据工具 ID 获取工具

```typescript
import { getToolById } from '@/packages/ai/tools';

const tool = getToolById('get-weather');
// => weatherTool 实例
```

## 📝 创建新工具

### 1. 创建工具文件

```typescript
// tools/my-tool.ts
import { createTool } from '@mastra/core/tools';
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
  execute: async ({ context, toolContext }) => {
    // 从 context 获取输入参数
    const { param1, param2 } = context;

    // 从 toolContext 获取外部依赖（如果需要）
    const { someService } = toolContext || {};

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
export type ToolId = 'get-weather' | 'get-time' | 'calculator' | 'translate-subtitles' | 'summarize-content' | 'query-resources' | 'my-tool'; // 添加新工具 ID
```

## 🎯 最佳实践

### 1. 工具命名

- **文件名**：使用 `kebab-case`，如 `weather-tool.ts`
- **变量名**：使用 `camelCase`，如 `weatherTool`
- **工具 ID**：使用 `kebab-case`，如 `get-weather`

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

### 5. 文档编写

为每个工具添加详细的 JSDoc 注释和使用示例：

````typescript
/**
 * 天气查询工具
 *
 * 基于 Open-Meteo API 查询指定城市的当前天气
 *
 * @example
 * ```typescript
 * const result = await weatherTool.execute({
 *   context: { city: '北京', unit: 'celsius' }
 * });
 * console.log(`${result.city}: ${result.temperature}°C, ${result.description}`);
 * ```
 */
export const weatherTool = createTool({
  /* ... */
});
````

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
