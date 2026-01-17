# 快速开始指南

> 5 分钟上手 AI Agent Core

---

## 前置要求

- Node.js >= 18.0
- TypeScript >= 5.0
- 熟悉 async/await 和 AsyncIterable

---

## 安装

```bash
# 核心包（零依赖）
npm install @packages/ai-agent

# 可选：适配器包
npm install @packages/ai-agent-adapters

# 可选：Vercel AI SDK（如使用 LLM 适配器）
npm install ai @ai-sdk/openai
```

---

## 第一个 Agent

### 步骤 1: 创建简单工具

```typescript
// tools/time.ts
import { Tool } from '@packages/ai-agent';

export const GetTimeTool: Tool = {
  name: 'get_time',
  description: '获取当前时间',
  parameters: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['iso', 'readable'],
        description: '时间格式'
      }
    }
  },
  async execute(params: any) {
    const now = new Date();
    if (params?.format === 'readable') {
      return { time: now.toLocaleString('zh-CN') };
    }
    return { time: now.toISOString() };
  }
};
```

### 步骤 2: 注册工具

```typescript
// index.ts
import { RegistryToolProvider } from '@packages/ai-agent/tools';
import { GetTimeTool } from './tools/time';

const tools = new RegistryToolProvider();
tools.register(GetTimeTool);
```

### 步骤 3: 创建 LLM 适配器

```typescript
import { VercelAIAdapter } from '@packages/ai-agent/adapters/llm';

const llm = new VercelAIAdapter({
  provider: 'openai',
  model: 'gpt-4o',
  apiKey: process.env.OPENAI_API_KEY
});
```

### 步骤 4: 运行 Agent

```typescript
import { DefaultAgentRuntime } from '@packages/ai-agent';

const runtime = new DefaultAgentRuntime();

// 准备上下文
const context = {
  sessionId: crypto.randomUUID(),
  llm,
  tools
};

// 执行
for await (const event of runtime.run({ messages: [{ role: 'user', content: '现在几点？' }] }, context)) {
  if (event.type === 'delta') {
    process.stdout.write(event.text);
  } else if (event.type === 'tool_call') {
    console.log('\n调用工具:', event.call.name);
  }
}
```

**完整代码**:

```typescript
import { DefaultAgentRuntime, RegistryToolProvider } from '@packages/ai-agent';
import { VercelAIAdapter } from '@packages/ai-agent/adapters/llm';
import { GetTimeTool } from './tools/time';

async function main() {
  // 1. 创建工具提供者
  const tools = new RegistryToolProvider();
  tools.register(GetTimeTool);

  // 2. 创建 LLM 适配器
  const llm = new VercelAIAdapter({
    provider: 'openai',
    model: 'gpt-4o',
    apiKey: process.env.OPENAI_API_KEY!
  });

  // 3. 创建运行时
  const runtime = new DefaultAgentRuntime();

  // 4. 执行 Agent
  console.log('用户: 现在几点？\n助手: ');

  for await (const event of runtime.run({ messages: [{ role: 'user', content: '现在几点？' }] }, { sessionId: crypto.randomUUID(), llm, tools })) {
    switch (event.type) {
      case 'delta':
        process.stdout.write(event.text);
        break;
      case 'tool_call':
        console.log(`\n[调用工具: ${event.call.name}]`);
        break;
      case 'done':
        console.log('\n✓ 完成');
        break;
    }
  }
}

main();
```

**运行**:

```bash
ts-node index.ts
```

**预期输出**:

```
用户: 现在几点？
助手: [调用工具: get_time]
现在是 2026年1月16日 下午3:30:00
✓ 完成
```

---

## 添加记忆功能

### 步骤 1: 创建记忆提供者

```typescript
import { SimpleMemoryProvider } from '@packages/ai-agent/adapters/memory';

// 简单的内存实现（仅用于演示）
class InMemoryKVStore {
  private store = new Map<string, any>();

  async get(key: string) {
    return this.store.get(key);
  }

  async set(key: string, value: any) {
    this.store.set(key, value);
  }

  async delete(key: string) {
    this.store.delete(key);
  }
}

const memory = new SimpleMemoryProvider(new InMemoryKVStore());
```

### 步骤 2: 在上下文中使用

```typescript
for await (const event of runtime.run(
  { messages: [{ role: 'user', content: '记住我喜欢蓝色' }] },
  {
    sessionId: 'session-123',
    llm,
    tools,
    memory // 添加记忆
  }
)) {
  // 处理事件...
}

// 后续对话会记住用户偏好
for await (const event of runtime.run(
  { messages: [{ role: 'user', content: '我喜欢什么颜色？' }] },
  {
    sessionId: 'session-123',
    llm,
    tools,
    memory
  }
)) {
  // Agent 会回答"你喜欢蓝色"
}
```

---

## 错误处理

```typescript
for await (const event of runtime.run(input, context)) {
  if (event.type === 'error') {
    console.error('错误:', event.error.message);
    console.error('类别:', event.error.category);

    if (event.error.recoverable) {
      console.log('建议:', event.error.suggestion);
    }
  }
}
```

---

## 中止执行

```typescript
const runtime = new DefaultAgentRuntime();

// 启动任务
const task = runtime.run(input, context);

// 10 秒后中止
setTimeout(() => {
  runtime.abort();
  console.log('任务已中止');
}, 10000);

// 处理事件
for await (const event of task) {
  // ...
}
```

---

## 多轮对话

```typescript
const messages = [];

// 第一轮
messages.push({ role: 'user', content: '你好' });

for await (const event of runtime.run({ messages }, context)) {
  if (event.type === 'delta') {
    // 收集助手响应
  }
}

messages.push({ role: 'assistant', content: '你好！有什么可以帮你的吗？' });

// 第二轮
messages.push({ role: 'user', content: '现在几点？' });

for await (const event of runtime.run({ messages }, context)) {
  // 处理响应...
}
```

---

## 配置选项

```typescript
const context = {
  sessionId: crypto.randomUUID(),
  llm,
  tools,
  memory,
  options: {
    maxIterations: 5, // 最多 5 轮工具调用
    timeout: 30000, // 30 秒超时
    enableMemory: true // 启用记忆
  }
};
```

---

## 实用示例

### 天气查询 Agent

```typescript
const WeatherTool: Tool = {
  name: 'get_weather',
  description: '获取城市天气',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: '城市名称' }
    },
    required: ['city']
  },
  async execute(params: any) {
    // 模拟 API 调用
    return {
      city: params.city,
      temperature: 22,
      condition: '晴'
    };
  }
};

tools.register(WeatherTool);

// 用户: "北京天气怎么样？"
// Agent: 自动调用 get_weather 工具并返回结果
```

### 计算器 Agent

```typescript
const CalculatorTool: Tool = {
  name: 'calculator',
  description: '执行数学计算',
  parameters: {
    type: 'object',
    properties: {
      expression: { type: 'string', description: '数学表达式' }
    },
    required: ['expression']
  },
  async execute(params: any) {
    return { result: eval(params.expression) };
  }
};

tools.register(CalculatorTool);

// 用户: "计算 123 + 456"
// Agent: 自动调用 calculator 工具
```

---

## 调试技巧

### 1. 启用详细日志

```typescript
import { ConsoleLogger } from '@packages/ai-agent/utils';

const context = {
  sessionId: '...',
  llm,
  tools,
  logger: new ConsoleLogger() // 添加日志
};
```

### 2. 查看所有事件

```typescript
for await (const event of runtime.run(input, context)) {
  console.log('[Event]', event.type, event);
}
```

### 3. 检查工具列表

```typescript
const allTools = tools.list();
console.log(
  '已注册工具:',
  allTools.map((t) => t.name)
);
```

---

## 常见问题

### Q: Agent 没有调用工具？

**A**: 检查以下几点：

1. 工具的 `description` 是否清晰
2. `parameters` 是否正确定义
3. LLM 模型是否支持工具调用（如 GPT-4）

### Q: 如何处理工具执行失败？

**A**: 工具应该返回 `ToolResult` 而不是抛出错误：

```typescript
async execute(params: any) {
  try {
    // ...
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

### Q: 如何使用本地 LLM？

**A**: 实现自定义 `LLMProvider`：

```typescript
class LocalLLMAdapter implements LLMProvider {
  async *stream(request: LLMRequest) {
    // 调用本地 LLM API
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      body: JSON.stringify(request)
    });

    // 解析并发射事件
    for await (const chunk of parseStream(response.body)) {
      yield chunk;
    }
  }
}
```

---

## 下一步

- 阅读 [API 文档](./API.md) 了解完整 API
- 阅读 [开发者指南](./DEVELOPER.md) 学习高级用法
- 查看 [设计文档](./README.md) 理解架构原理

---

## 完整示例仓库

```bash
git clone https://github.com/your-repo/ai-agent-examples
cd ai-agent-examples
npm install
npm run example:basic
```

---

**开始构建你的 Agent！** 🚀
