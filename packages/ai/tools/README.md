# AI 工具集合

本目录包含 legacy 兼容层仍在复用的工具定义。

## 📁 目录结构

```
tools/
├── index.ts                    # 工具集中管理和导出
├── push-card-tool.ts           # 推送卡片工具
└── tool-definition.ts          # createTool 基础定义
```

## 🛠️ 工具列表

| 工具           | ID          | 功能         | 依赖                      | 文件                |
| -------------- | ----------- | ------------ | ------------------------- | ------------------- |
| `pushCardTool` | `push-card` | 推送资源卡片 | conversationId / windowId | `push-card-tool.ts` |

> mini 分支已随资源库裁剪移除 resourceQueryTool / readSubtitleTool / translationTool / summaryTool 等依赖 resources 表的工具。

## 🔧 工具管理 API

### `getAllTools(bindings?)` / `getAITools(bindings?)`

获取工具集合（AI 工具需要显式传入 bindings）：

```typescript
import { getAITools } from '@/packages/ai/tools';

const tools = getAITools({
  pushCard: { conversationId: 'conv-123', targetWindowId: 1 }
});
// => { pushCardTool }
```

### `getTool(name: string)` / `getToolById(id: string)`

按名称或工具 ID 获取工具实例，不存在时返回 `undefined`。

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
    param1: z.string().describe('参数1描述')
  }),
  execute: async ({ context }) => {
    return { result: `处理结果: ${context.param1}` };
  }
});
```

### 2. 在 index.ts 中注册

```typescript
// tools/index.ts

// 1. 添加导出
export { myTool } from './my-tool';

// 2. 添加到工具集合与 ToolId 类型
```

## 🎯 最佳实践

### 1. 工具命名

- **文件名**：使用 `kebab-case`，如 `push-card-tool.ts`
- **变量名**：使用 `camelCase`，如 `pushCardTool`
- **工具 ID**：使用 `kebab-case`，如 `push-card`

### 2. Schema 定义

- 使用 Zod 定义清晰的输入输出 schema
- 为每个字段添加 `.describe()` 说明，Agent 会使用这些描述理解参数含义
- 使用 `.optional()` 标记可选参数

### 3. 错误处理

```typescript
execute: async ({ context }) => {
  try {
    if (!context.param) {
      throw new Error('缺少必需参数');
    }
    return { success: true, result: await doSomething(context.param) };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};
```

## 📄 License

MIT
